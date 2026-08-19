/**
 * SHAY JEWELRY — luxury product ring viewer
 * Lighting + materials only. Same GLB, OrbitControls, gentle float.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const MODEL_HI = 'models/shay-ring-hi.glb';   // ~3.3 MB, meshopt + WebP 2048²
const MODEL_LO = 'models/shay-ring-lo.glb';   // ~2.1 MB, meshopt + WebP 1024²
const MODEL_FULL = 'models/solitaire-ring.glb'; // ~112 MB uncompressed Meshy export

const GOLD = 0xd6a85a;
const GOLD_SOFT = 0xf2c879;
const DIAMOND_HI = 0xdbeafe;

function enhanceMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat, i) => {
      if (!mat) return;
      const name = `${mat.name || ''} ${obj.name || ''}`.toLowerCase();
      const looksDiamond =
        /diamond|gem|stone|crystal|jewel|glass|dia/.test(name) ||
        mat.transmission > 0.05 ||
        (mat.metalness != null && mat.metalness < 0.15 && mat.roughness != null && mat.roughness < 0.25);

      let next = mat;
      if (looksDiamond) {
        if (!mat.isMeshPhysicalMaterial) {
          next = new THREE.MeshPhysicalMaterial();
          next.copy(mat);
          next.map = mat.map || null;
          next.normalMap = mat.normalMap || null;
          next.roughnessMap = mat.roughnessMap || null;
          next.metalnessMap = mat.metalnessMap || null;
        }
        next.color = new THREE.Color(0xffffff);
        next.metalness = 0.05;
        next.roughness = 0.05;
        next.transmission = Math.max(next.transmission || 0, 0.92);
        next.thickness = Math.max(next.thickness || 0, 0.55);
        next.ior = 2.42;
        next.envMapIntensity = 2.6;
        next.clearcoat = 1;
        next.clearcoatRoughness = 0.04;
        next.specularIntensity = 1;
        next.transparent = true;
        next.opacity = 1;
      } else {
        if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) {
          next = new THREE.MeshStandardMaterial();
          next.copy(mat);
          next.map = mat.map || null;
          next.normalMap = mat.normalMap || null;
          next.roughnessMap = mat.roughnessMap || null;
          next.metalnessMap = mat.metalnessMap || null;
        }
        // polished white gold / silver
        if (!next.map) next.color = new THREE.Color(0xc8cdd3);
        else next.color.lerp(new THREE.Color(0xe8eaee), 0.25);
        next.metalness = Math.max(next.metalness ?? 0, 0.92);
        next.roughness = THREE.MathUtils.clamp(next.roughness ?? 0.22, 0.16, 0.3);
        next.envMapIntensity = 2.2;
        if ('clearcoat' in next) {
          next.clearcoat = 0.35;
          next.clearcoatRoughness = 0.18;
        }
      }
      next.needsUpdate = true;
      if (Array.isArray(obj.material)) obj.material[i] = next;
      else obj.material = next;
    });
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}

function frameObject(object, camera, controls) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fit = maxDim * 2.35;
  camera.near = fit / 100;
  camera.far = fit * 40;
  camera.updateProjectionMatrix();
  camera.position.set(fit * 0.55, fit * 0.32, fit * 0.95);
  controls.target.set(0, 0, 0);
  controls.minDistance = fit * 0.55;
  controls.maxDistance = fit * 1.55;
  controls.update();
}

function isIOS() {
  const ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isConstrainedDevice() {
  const ua = navigator.userAgent || '';
  const mem = navigator.deviceMemory || (isIOS() ? 3 : 8);
  return isIOS() || /Android/i.test(ua) || mem <= 4 || innerWidth < 768;
}

/** Desktop keeps the original Meshy GLB. iOS/Android never fetch the 112MB file. */
function modelCandidates(requested) {
  const constrained = isConstrainedDevice();
  if (constrained) return [MODEL_LO, MODEL_HI];
  const primary = requested || MODEL_FULL;
  if (primary === MODEL_FULL) return [MODEL_FULL, MODEL_HI, MODEL_LO];
  return [primary, MODEL_HI, MODEL_LO];
}

function waitForCanvasSize(el, fallback) {
  return new Promise((resolve) => {
    let frames = 0;
    const tick = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if ((w >= 8 && h >= 8) || frames >= 45) {
        resolve({
          w: Math.max(w, fallback.w),
          h: Math.max(h, fallback.h),
        });
        return;
      }
      frames += 1;
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function loadGltfOnce(loader, url, onProgress) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, onProgress, reject);
  });
}

export function mountRingViewer(canvas, opts = {}) {
  const loadingEl = opts.loadingEl || null;
  const barEl = opts.barEl || null;
  const statusEl = loadingEl?.querySelector('span') || null;
  const constrained = isConstrainedDevice();
  const candidates = modelCandidates(opts.src);
  let currentUrl = candidates[0];

  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text;
  };
  const setBar = (pct) => {
    if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  };

  setStatus('טוען את הטבעת…');
  setBar(8);

  let renderer;
  let scene;
  let camera;
  let controls;
  let pmrem;
  let env;
  let diamondSpot;
  let contactShadow;
  let floatPivot;
  let ringRoot = null;
  let raf = 0;
  let disposed = false;
  let ro;
  let loadToken = 0;

  function showError(err, url) {
    const detail = {
      url,
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
      toString: err ? String(err) : err,
      userAgent: navigator.userAgent,
      deviceMemory: navigator.deviceMemory,
      webgl: renderer?.getContext?.()?.getParameter?.(renderer.getContext().VERSION),
    };
    console.error('[SHAY ring-viewer] GLB load failed', detail, err);
    setStatus('לא ניתן לטעון את המודל');
    if (loadingEl) loadingEl.hidden = false;
  }

  function resize() {
    if (!renderer || disposed) return;
    const parent = canvas.parentElement;
    const w = Math.max(parent?.clientWidth || canvas.clientWidth || 0, 8);
    const h = Math.max(parent?.clientHeight || canvas.clientHeight || 0, 8);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function placeRing() {
    const box = new THREE.Box3().setFromObject(floatPivot);
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.55;
    contactShadow.scale.setScalar(Math.max(radius, 0.35));
    contactShadow.position.y = box.min.y - 0.01;
    diamondSpot.position.set(0, box.max.y * 0.85 + 0.15, size.z * 0.35);
  }

  function startLoop() {
    const clock = new THREE.Clock();
    function tick() {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      floatPivot.position.y = Math.sin(t * 0.7) * 0.028;
      floatPivot.rotation.y = Math.sin(t * 0.25) * 0.04;
      controls.update();
      renderer.render(scene, camera);
    }
    tick();
  }

  async function loadModel(url) {
    const token = ++loadToken;
    currentUrl = url;
    const loader = new GLTFLoader();
    if (MeshoptDecoder && MeshoptDecoder.supported !== false) {
      loader.setMeshoptDecoder(MeshoptDecoder);
      if (MeshoptDecoder.ready) await MeshoptDecoder.ready;
    }
    const gltf = await loadGltfOnce(loader, url, (ev) => {
      if (!ev.total) {
        setBar(Math.min(70, 12 + (ev.loaded / 2_000_000) * 40));
        return;
      }
      setBar(12 + (ev.loaded / ev.total) * 70);
    });
    if (disposed || token !== loadToken) return null;
    return gltf;
  }

  (async () => {
    const sizeHost = canvas.parentElement || canvas;
    const size = await waitForCanvasSize(sizeHost, { w: 320, h: 360 });
    if (disposed) return;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !constrained,
        alpha: true,
        powerPreference: constrained ? 'low-power' : 'high-performance',
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      showError(err, currentUrl);
      return;
    }

    const gl = renderer.getContext();
    if (!gl) {
      showError(new Error('WebGL context is null'), currentUrl);
      return;
    }

    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, constrained ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !constrained;
    if (!constrained) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(size.w, size.h, false);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, size.w / size.h, 0.1, 100);
    camera.position.set(2.2, 1.2, 3.2);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.maxPolarAngle = Math.PI * 0.62;

    pmrem = new THREE.PMREMGenerator(renderer);
    env = pmrem.fromScene(new RoomEnvironment(), constrained ? 0.08 : 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = constrained ? 1.2 : 1.35;

    scene.add(new THREE.AmbientLight(0xfff6ea, 0.55));

    const key = new THREE.DirectionalLight(0xfff5e8, 3.1);
    key.position.set(2.4, 4.2, 3.2);
    key.castShadow = !constrained;
    if (!constrained) {
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 20;
      key.shadow.camera.left = -3;
      key.shadow.camera.right = 3;
      key.shadow.camera.top = 3;
      key.shadow.camera.bottom = -3;
      key.shadow.bias = -0.0002;
    }
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xdbe7ff, 0.85);
    fill.position.set(-3.2, 1.6, 1.2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(GOLD_SOFT, 1.55);
    rim.position.set(-1.2, 1.8, -3.4);
    scene.add(rim);

    const rimPoint = new THREE.PointLight(GOLD, 1.2, 12, 2);
    rimPoint.position.set(0.4, 1.1, -2.2);
    scene.add(rimPoint);

    diamondSpot = new THREE.PointLight(DIAMOND_HI, 1.8, 6, 2);
    diamondSpot.position.set(0.15, 1.35, 1.1);
    scene.add(diamondSpot);

    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    contactShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = -0.02;
    contactShadow.renderOrder = -1;
    scene.add(contactShadow);

    floatPivot = new THREE.Group();
    scene.add(floatPivot);

    ro = new ResizeObserver(resize);
    ro.observe(sizeHost);
    resize();
    startLoop();

    let lastErr = null;
    for (let i = 0; i < candidates.length; i++) {
      if (disposed) return;
      const url = candidates[i];
      setStatus('טוען את הטבעת…');
      setBar(10);
      try {
        const gltf = await loadModel(url);
        if (!gltf || disposed) return;
        ringRoot = gltf.scene;
        enhanceMaterials(ringRoot);
        floatPivot.add(ringRoot);
        frameObject(floatPivot, camera, controls);
        placeRing();
        setBar(100);
        if (loadingEl) loadingEl.hidden = true;
        return;
      } catch (err) {
        lastErr = err;
        console.error('[SHAY ring-viewer] candidate failed', url, err?.message || err, err);
      }
    }
    showError(lastErr || new Error('All GLB candidates failed'), currentUrl);
  })();

  return function dispose() {
    disposed = true;
    loadToken += 1;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    controls?.dispose();
    if (ringRoot) {
      ringRoot.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (!m) return;
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'envMap']) {
            m[key]?.dispose?.();
          }
          m.dispose();
        });
      });
    }
    pmrem?.dispose();
    env?.dispose();
    renderer?.dispose();
  };
}
