/**
 * SHAY JEWELRY — development scroll-keyframe editor.
 * Loads only when the URL contains ?editor (see SCROLL-EDITOR-README.md).
 * Uses the existing local Three r185 instance via the homepage import map.
 */
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TAG = '[ScrollEditor]';
const KF_EPS = 0.004;
const ENABLED = /(?:\?|&)editor(?:=|&|$)/.test(location.search);

if (!ENABLED) {
  /* production path — do nothing */
} else {
  bootEditor();
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function pageProgress() {
  const max = document.documentElement.scrollHeight - innerHeight;
  if (!(max > 0)) return 0;
  return clamp01(scrollY / max);
}

function scrollToProgress(p) {
  const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const html = document.documentElement;
  const prev = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  scrollTo(0, clamp01(p) * max);
  html.style.scrollBehavior = prev;
}

function fmt(n, d = 2) {
  return (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);
}

function capturePose(obj) {
  return {
    position: [obj.position.x, obj.position.y, obj.position.z],
    quaternion: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w],
    scale: [obj.scale.x, obj.scale.y, obj.scale.z],
  };
}

function applyPose(obj, pose) {
  obj.position.set(pose.position[0], pose.position[1], pose.position[2]);
  obj.quaternion.set(pose.quaternion[0], pose.quaternion[1], pose.quaternion[2], pose.quaternion[3]);
  obj.scale.set(pose.scale[0], pose.scale[1], pose.scale[2]);
}

const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _sclA = new THREE.Vector3();
const _sclB = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();

function sampleKeyframes(list, p, outPos, outQuat, outScl) {
  if (!list.length) return false;
  const sorted = list;
  if (p <= sorted[0].progress) {
    applyArrays(sorted[0], outPos, outQuat, outScl);
    return true;
  }
  const last = sorted[sorted.length - 1];
  if (p >= last.progress) {
    applyArrays(last, outPos, outQuat, outScl);
    return true;
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (p < a.progress || p > b.progress) continue;
    const span = b.progress - a.progress;
    const t = easeInOut(span <= 1e-8 ? 0 : (p - a.progress) / span);
    _posA.set(a.position[0], a.position[1], a.position[2]);
    _posB.set(b.position[0], b.position[1], b.position[2]);
    _sclA.set(a.scale[0], a.scale[1], a.scale[2]);
    _sclB.set(b.scale[0], b.scale[1], b.scale[2]);
    _quatA.set(a.quaternion[0], a.quaternion[1], a.quaternion[2], a.quaternion[3]);
    _quatB.set(b.quaternion[0], b.quaternion[1], b.quaternion[2], b.quaternion[3]);
    outPos.lerpVectors(_posA, _posB, t);
    outScl.lerpVectors(_sclA, _sclB, t);
    outQuat.copy(_quatA).slerp(_quatB, t);
    return true;
  }
  return false;
}

function applyArrays(kf, outPos, outQuat, outScl) {
  outPos.set(kf.position[0], kf.position[1], kf.position[2]);
  outQuat.set(kf.quaternion[0], kf.quaternion[1], kf.quaternion[2], kf.quaternion[3]);
  outScl.set(kf.scale[0], kf.scale[1], kf.scale[2]);
}

function waitForThree(timeoutMs = 20000) {
  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      const scene = window.threeScene;
      const camera = window.threeCamera;
      const renderer = window.threeRenderer;
      const model = window.threeModel;
      if (scene && camera && renderer && model) {
        resolve({ scene, camera, renderer, model });
        return;
      }
      if (performance.now() - t0 > timeoutMs) {
        reject(new Error('Timed out waiting for window.threeScene / Camera / Renderer / Model'));
        return;
      }
      requestAnimationFrame(poll);
    })();
  });
}

function waitForRingReady(pivot, timeoutMs = 25000) {
  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      const ready = document.documentElement.dataset.ringState === 'ready';
      let hasMesh = false;
      pivot.traverse((o) => { if (o.isMesh) hasMesh = true; });
      if (ready && hasMesh) { resolve(); return; }
      if (performance.now() - t0 > timeoutMs) {
        reject(new Error('Timed out waiting for the homepage ring to finish loading.'));
        return;
      }
      requestAnimationFrame(poll);
    })();
  });
}

async function bootEditor() {
  let ctx;
  try {
    ctx = await waitForThree();
  } catch (err) {
    console.error(TAG, 'init failed — missing Three objects.', err);
    console.error(TAG, {
      scene: !!window.threeScene,
      camera: !!window.threeCamera,
      renderer: !!window.threeRenderer,
      model: !!window.threeModel,
    });
    return;
  }

  const { scene, camera, renderer, model: pivot } = ctx;
  const canvas = renderer.domElement;
  const rev = THREE.REVISION;

  if (String(rev) !== '185') {
    console.error(TAG, `Three revision mismatch: expected 185, got ${rev}. Aborting.`);
    return;
  }

  /* Let the production frame pose the ring once, then take over. */
  try {
    await waitForRingReady(pivot);
  } catch (err) {
    console.error(TAG, err.message);
    return;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  let transformControls;
  try {
    transformControls = new TransformControls(camera, canvas);
  } catch (err) {
    console.error(TAG, 'TransformControls failed to construct from local r185 addons.', err);
    return;
  }

  if (typeof transformControls.getHelper !== 'function') {
    console.error(TAG, 'TransformControls.getHelper is missing — not the r185 API. Aborting.');
    return;
  }

  const helper = transformControls.getHelper();
  scene.add(helper);
  transformControls.setSize(0.9);
  transformControls.setSpace('world');
  transformControls.attach(pivot);

  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.08;
  orbit.enablePan = true;
  orbit.target.set(pivot.position.x, pivot.position.y, pivot.position.z);
  orbit.update();

  const camHome = {
    pos: camera.position.clone(),
    quat: camera.quaternion.clone(),
    target: orbit.target.clone(),
  };
  let camEdit = {
    pos: camera.position.clone(),
    quat: camera.quaternion.clone(),
    target: orbit.target.clone(),
  };

  document.documentElement.classList.add('scroll-editor-on');
  window.__editorActive = true;
  window.__scrollEditorPreview = false;
  pivot.visible = true;
  canvas.style.opacity = '1';

  const keyframes = [];
  const sampled = {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    scl: new THREE.Vector3(),
  };

  function sortedKfs() {
    return keyframes.slice().sort((a, b) => a.progress - b.progress);
  }

  function kfAtProgress(p) {
    return keyframes.find((k) => Math.abs(k.progress - p) <= KF_EPS) || null;
  }

  function seedStart() {
    const pose = capturePose(pivot);
    keyframes.push({ progress: 0, ...pose, locked: true });
  }
  seedStart();

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const planeHit = new THREE.Vector3();
  const dragOffset = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  let bodyDragging = false;
  let selected = true;

  function ndcFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    pointerNdc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointerNdc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  transformControls.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value && window.__editorActive && !bodyDragging;
  });
  transformControls.addEventListener('objectChange', () => {
    refreshReadout();
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (!window.__editorActive || window.__scrollEditorPreview) return;
    if (transformControls.dragging || transformControls.axis) return;
    ndcFromEvent(e);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(pivot, true);
    if (!hits.length) return;
    e.preventDefault();
    e.stopPropagation();
    selected = true;
    transformControls.attach(pivot);
    helper.visible = true;
    bodyDragging = true;
    orbit.enabled = false;
    camera.getWorldDirection(camDir);
    dragPlane.setFromNormalAndCoplanarPoint(camDir, hits[0].point);
    dragOffset.copy(pivot.position).sub(hits[0].point);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    refreshPanel();
  }, true);

  canvas.addEventListener('pointermove', (e) => {
    if (!bodyDragging) return;
    ndcFromEvent(e);
    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.ray.intersectPlane(dragPlane, planeHit)) {
      pivot.position.copy(planeHit).add(dragOffset);
      refreshReadout();
    }
  });

  function endBodyDrag(e) {
    if (!bodyDragging) return;
    bodyDragging = false;
    if (e && canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    orbit.enabled = window.__editorActive && !transformControls.dragging;
  }
  canvas.addEventListener('pointerup', endBodyDrag);
  canvas.addEventListener('pointercancel', endBodyDrag);
  canvas.addEventListener('wheel', (e) => {
    if (window.__editorActive) e.stopPropagation();
  }, { capture: true });

  addEventListener('keydown', (e) => {
    if (!window.__editorActive) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === 'w' || e.key === 'W') { e.preventDefault(); setMode('translate'); }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setMode('rotate'); }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setMode('scale'); }
    if (e.key === 'Escape') {
      selected = false;
      transformControls.detach();
      refreshPanel();
    }
  });

  function setMode(mode) {
    transformControls.setMode(mode);
    if (!selected) {
      selected = true;
      transformControls.attach(pivot);
    }
    refreshPanel();
  }

  /* ---------- panel ---------- */
  const wrap = document.createElement('div');
  wrap.id = 'scroll-editor-root';
  wrap.innerHTML = `
    <style>
      #scroll-editor-root{position:fixed;inset:0;z-index:10000;pointer-events:none;font:12px/1.35 ui-sans-serif,system-ui,sans-serif;color:#efe8dc}
      #se-panel{pointer-events:auto;position:fixed;top:12px;left:12px;width:248px;background:rgba(14,13,12,.92);border:1px solid rgba(201,163,106,.35);border-radius:8px;padding:10px 10px 8px;backdrop-filter:blur(10px);box-shadow:0 10px 32px rgba(0,0,0,.4)}
      #se-panel h4{margin:0 0 8px;font:600 11px/1 ui-sans-serif,system-ui;letter-spacing:.14em;text-transform:uppercase;color:#C9A36A;display:flex;justify-content:space-between;align-items:center}
      #se-panel button,#se-return{appearance:none;border:1px solid rgba(201,163,106,.4);background:transparent;color:#E2C28E;border-radius:4px;padding:5px 8px;font:600 11px/1 ui-sans-serif,system-ui;cursor:pointer}
      #se-panel button.on,#se-add{background:rgba(201,163,106,.18)}
      #se-modes{display:flex;gap:4px;margin-bottom:8px}
      #se-modes button{flex:1}
      #se-readout,#se-scroll{margin:0 0 8px;color:#d2d2d2;font-variant-numeric:tabular-nums;white-space:pre-line}
      #se-add{width:100%;margin-bottom:8px;padding:7px 8px}
      #se-list{max-height:180px;overflow:auto;margin:0 0 8px;padding:0;list-style:none;border-top:1px solid rgba(201,163,106,.18)}
      #se-list li{display:flex;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(201,163,106,.12);cursor:pointer;color:#efe8dc}
      #se-list li span{flex:1}
      #se-list button.del{padding:2px 6px;color:#e8b4a0;border-color:rgba(200,80,60,.4)}
      #se-actions{display:flex;gap:4px}
      #se-actions button{flex:1}
      #se-return{pointer-events:auto;position:fixed;top:12px;right:12px;display:none;background:rgba(14,13,12,.92)}
      #se-export{pointer-events:auto;display:none;position:fixed;inset:8% 8%;background:#111;border:1px solid #C9A36A;border-radius:8px;padding:12px;overflow:auto;white-space:pre;color:#E2C28E;font:11px/1.4 ui-monospace,monospace}
      #se-export-close{position:sticky;top:0;float:right}
    </style>
    <div id="se-panel">
      <h4>Scroll editor <button type="button" id="se-collapse" title="Collapse">–</button></h4>
      <div id="se-body">
        <div id="se-modes">
          <button type="button" data-mode="translate">Move</button>
          <button type="button" data-mode="rotate">Rotate</button>
          <button type="button" data-mode="scale">Scale</button>
        </div>
        <div id="se-readout"></div>
        <div id="se-scroll"></div>
        <button type="button" id="se-add">+ Add keyframe</button>
        <ul id="se-list"></ul>
        <div id="se-actions">
          <button type="button" id="se-preview">▶ Preview</button>
          <button type="button" id="se-export-btn">📤 Export</button>
        </div>
      </div>
    </div>
    <button type="button" id="se-return">✕ Edit</button>
    <pre id="se-export"><button type="button" id="se-export-close">Close</button><code></code></pre>
  `;
  document.body.appendChild(wrap);

  const panel = wrap.querySelector('#se-panel');
  const body = wrap.querySelector('#se-body');
  const readout = wrap.querySelector('#se-readout');
  const scrollEl = wrap.querySelector('#se-scroll');
  const addBtn = wrap.querySelector('#se-add');
  const listEl = wrap.querySelector('#se-list');
  const returnBtn = wrap.querySelector('#se-return');
  const exportBox = wrap.querySelector('#se-export');
  const exportCode = wrap.querySelector('#se-export code');

  wrap.querySelector('#se-collapse').addEventListener('click', () => {
    body.style.display = body.style.display === 'none' ? '' : 'none';
  });
  wrap.querySelectorAll('#se-modes button').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
  addBtn.addEventListener('click', saveKeyframe);
  wrap.querySelector('#se-preview').addEventListener('click', enterPreview);
  returnBtn.addEventListener('click', exitPreview);
  wrap.querySelector('#se-export-btn').addEventListener('click', showExport);
  wrap.querySelector('#se-export-close').addEventListener('click', () => { exportBox.style.display = 'none'; });

  function eulerDeg(q) {
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    return [e.x, e.y, e.z].map((r) => Math.round(THREE.MathUtils.radToDeg(r)));
  }

  function refreshReadout() {
    const { position: p, quaternion: q, scale: s } = pivot;
    const deg = eulerDeg(q);
    const uniform = Math.abs(s.x - s.y) < 0.002 && Math.abs(s.y - s.z) < 0.002;
    readout.textContent =
      `pos ${fmt(p.x)} / ${fmt(p.y)} / ${fmt(p.z)}\n` +
      `rot ${deg[0]}° / ${deg[1]}° / ${deg[2]}°\n` +
      (uniform ? `scale ${fmt(s.x)}` : `scale ${fmt(s.x)} / ${fmt(s.y)} / ${fmt(s.z)}`);
  }

  function refreshPanel() {
    const p = pageProgress();
    scrollEl.textContent = `Scroll: ${(p * 100).toFixed(1)}%`;
    const hit = kfAtProgress(p);
    addBtn.textContent = hit ? '✓ Update keyframe' : '+ Add keyframe';
    wrap.querySelectorAll('#se-modes button').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.mode === transformControls.getMode());
    });
    listEl.innerHTML = '';
    sortedKfs().forEach((kf) => {
      const li = document.createElement('li');
      const pct = `${Math.round(kf.progress * 1000) / 10}%`;
      const label = document.createElement('span');
      label.textContent = kf.progress === 0
        ? `${pct} (start)`
        : `${pct}  pos ${fmt(kf.position[0], 1)} ${fmt(kf.position[1], 1)} ${fmt(kf.position[2], 1)}  s ${fmt(kf.scale[0])}`;
      li.appendChild(label);
      li.addEventListener('click', (ev) => {
        if (ev.target.closest('.del')) return;
        scrollToProgress(kf.progress);
        applyPose(pivot, kf);
        refreshReadout();
        refreshPanel();
      });
      if (kf.progress !== 0) {
        const del = document.createElement('button');
        del.className = 'del';
        del.type = 'button';
        del.textContent = '🗑';
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const i = keyframes.indexOf(kf);
          if (i >= 0) keyframes.splice(i, 1);
          refreshPanel();
        });
        li.appendChild(del);
      }
      listEl.appendChild(li);
    });
    refreshReadout();
  }

  function saveKeyframe() {
    const p = pageProgress();
    const pose = capturePose(pivot);
    const existing = kfAtProgress(p);
    if (existing) {
      existing.position = pose.position;
      existing.quaternion = pose.quaternion;
      existing.scale = pose.scale;
    } else {
      keyframes.push({ progress: p, ...pose });
    }
    refreshPanel();
  }

  addEventListener('scroll', refreshPanel, { passive: true });

  function enterPreview() {
    camEdit = {
      pos: camera.position.clone(),
      quat: camera.quaternion.clone(),
      target: orbit.target.clone(),
    };
    window.__editorActive = false;
    window.__scrollEditorPreview = true;
    transformControls.detach();
    helper.visible = false;
    orbit.enabled = false;
    camera.position.copy(camHome.pos);
    camera.quaternion.copy(camHome.quat);
    orbit.target.copy(camHome.target);
    camera.updateProjectionMatrix();
    panel.style.display = 'none';
    returnBtn.style.display = 'block';
    pivot.visible = true;
    canvas.style.opacity = '1';
  }

  function exitPreview() {
    window.__editorActive = true;
    window.__scrollEditorPreview = false;
    camera.position.copy(camEdit.pos);
    camera.quaternion.copy(camEdit.quat);
    orbit.target.copy(camEdit.target);
    orbit.enabled = true;
    orbit.update();
    transformControls.attach(pivot);
    helper.visible = true;
    selected = true;
    panel.style.display = '';
    returnBtn.style.display = 'none';
    pivot.visible = true;
    canvas.style.opacity = '1';
    refreshPanel();
  }

  function buildExport() {
    const data = sortedKfs().map((k) => ({
      progress: +k.progress.toFixed(6),
      position: k.position.map((n) => +n.toFixed(6)),
      quaternion: k.quaternion.map((n) => +n.toFixed(6)),
      scale: k.scale.map((n) => +n.toFixed(6)),
    }));
    return `/* Shay Jewelry — exported scroll keyframes. Paste into the homepage module.
   Target is the existing \`pivot\` group. No editor UI. */
const KEYFRAMES = ${JSON.stringify(data, null, 2)};

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _sclA = new THREE.Vector3();
const _sclB = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _quatB = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _quat = new THREE.Quaternion();

function readScrollProgress() {
  const max = document.documentElement.scrollHeight - innerHeight;
  if (!(max > 0)) return 0;
  return clamp01(scrollY / max);
}

function sampleEditorPath(p, outPos, outQuat, outScl) {
  const kf = KEYFRAMES;
  if (!kf.length) return;
  if (p <= kf[0].progress) {
    outPos.fromArray(kf[0].position);
    outQuat.fromArray(kf[0].quaternion);
    outScl.fromArray(kf[0].scale);
    return;
  }
  const last = kf[kf.length - 1];
  if (p >= last.progress) {
    outPos.fromArray(last.position);
    outQuat.fromArray(last.quaternion);
    outScl.fromArray(last.scale);
    return;
  }
  for (let i = 0; i < kf.length - 1; i++) {
    const a = kf[i], b = kf[i + 1];
    if (p < a.progress || p > b.progress) continue;
    const span = b.progress - a.progress;
    const t = easeInOut(span <= 1e-8 ? 0 : (p - a.progress) / span);
    _posA.fromArray(a.position); _posB.fromArray(b.position);
    _sclA.fromArray(a.scale); _sclB.fromArray(b.scale);
    _quatA.fromArray(a.quaternion); _quatB.fromArray(b.quaternion);
    outPos.lerpVectors(_posA, _posB, t);
    outScl.lerpVectors(_sclA, _sclB, t);
    outQuat.copy(_quatA).slerp(_quatB, t);
    return;
  }
}

let __editTarget = 0, __editProgress = 0, __editRaf = 0;
addEventListener('scroll', () => { __editTarget = readScrollProgress(); }, { passive: true });
__editTarget = readScrollProgress();

(function playEditorPath() {
  __editRaf = requestAnimationFrame(playEditorPath);
  __editProgress += (__editTarget - __editProgress) * 0.18;
  sampleEditorPath(__editProgress, _pos, _quat, _scl);
  pivot.position.copy(_pos);
  pivot.quaternion.copy(_quat);
  pivot.scale.copy(_scl);
})();
`;
  }

  async function showExport() {
    const src = buildExport();
    exportCode.textContent = src;
    exportBox.style.display = 'block';
    try {
      await navigator.clipboard.writeText(src);
      console.log(TAG, 'Export copied to clipboard.');
    } catch {
      console.log(TAG, 'Clipboard blocked — snippet shown in overlay.');
    }
  }

  /* ---------- editor RAF: owns rendering while edit/preview ---------- */
  (function editorLoop() {
    requestAnimationFrame(editorLoop);
    if (!window.__editorActive && !window.__scrollEditorPreview) return;
    pivot.visible = true;
    if (window.__scrollEditorPreview) {
      sampleKeyframes(sortedKfs(), pageProgress(), sampled.pos, sampled.quat, sampled.scl);
      pivot.position.copy(sampled.pos);
      pivot.quaternion.copy(sampled.quat);
      pivot.scale.copy(sampled.scl);
    } else {
      orbit.update();
    }
    renderer.render(scene, camera);
    canvas.style.opacity = '1';
  })();

  refreshPanel();

  console.log(`${TAG}
Three revision: ${rev}
Scene: OK
Camera: OK
Renderer: OK
Model/pivot: OK
TransformControls r185: OK
Gizmo helper added: OK
Editor attached.`);
  console.info(TAG, 'Canvas overlay: #ring-canvas uses pointer-events:none in production. Editor enables pointer-events + z-index 20 via html.scroll-editor-on. Nav (z-index 100) stays clickable. Section wraps sit above the canvas on desktop (z-index 3 vs 2); on mobile the editor canvas is raised and may intercept page clicks while ?editor is on.');
}
