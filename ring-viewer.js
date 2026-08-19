/**
 * SHAY JEWELRY — luxury product ring viewer
 * Lighting + materials only. Same GLB, OrbitControls, gentle float.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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

export function mountRingViewer(canvas, opts = {}) {
  const modelUrl = opts.src || 'models/solitaire-ring.glb';
  const loadingEl = opts.loadingEl || null;
  const barEl = opts.barEl || null;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(2.2, 1.2, 3.2);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.62;

  // Environment for polished reflections
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 1.35;

  // Soft studio lights
  scene.add(new THREE.AmbientLight(0xfff6ea, 0.55));

  const key = new THREE.DirectionalLight(0xfff5e8, 3.1);
  key.position.set(2.4, 4.2, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.0002;
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

  const diamondSpot = new THREE.PointLight(DIAMOND_HI, 1.8, 6, 2);
  diamondSpot.position.set(0.15, 1.35, 1.1);
  scene.add(diamondSpot);

  // Contact shadow disc
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = -0.02;
  contactShadow.renderOrder = -1;
  scene.add(contactShadow);

  const floatPivot = new THREE.Group();
  scene.add(floatPivot);

  let ringRoot = null;
  let raf = 0;
  let disposed = false;

  function resize() {
    const parent = canvas.parentElement;
    const w = parent.clientWidth || 640;
    const h = parent.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement || canvas);
  resize();

  const loader = new GLTFLoader();
  loader.load(
    modelUrl,
    (gltf) => {
      if (disposed) return;
      ringRoot = gltf.scene;
      enhanceMaterials(ringRoot);
      floatPivot.add(ringRoot);
      frameObject(floatPivot, camera, controls);

      const box = new THREE.Box3().setFromObject(floatPivot);
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.z) * 0.55;
      contactShadow.scale.setScalar(Math.max(radius, 0.35));
      contactShadow.position.y = box.min.y - 0.01;

      // Aim diamond highlight near top of ring
      diamondSpot.position.set(0, box.max.y * 0.85 + 0.15, size.z * 0.35);

      if (loadingEl) loadingEl.hidden = true;
    },
    (ev) => {
      if (!barEl || !ev.total) return;
      barEl.style.width = `${Math.round((ev.loaded / ev.total) * 100)}%`;
    },
    () => {
      if (loadingEl) {
        const span = loadingEl.querySelector('span');
        if (span) span.textContent = 'לא ניתן לטעון את המודל';
      }
    }
  );

  const clock = new THREE.Clock();
  function tick() {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    if (floatPivot) {
      floatPivot.position.y = Math.sin(t * 0.7) * 0.028;
      floatPivot.rotation.y = Math.sin(t * 0.25) * 0.04;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  return function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    pmrem.dispose();
    env.dispose();
    renderer.dispose();
  };
}
