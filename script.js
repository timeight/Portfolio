import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ============================================================
// CONFIG — change values here without digging through the code
// ============================================================
const CONFIG = {
  modelPath: './model.glb',
  modelTargetHeight: 3.5,        // size in 3D units
  modelRotateX: 0,    // tilt forward/back (TRY THIS FIRST for upright)
  modelRotateY: 0,               // turn left/right (face direction)
  modelRotateZ: 0,               // roll left/right
  modelYOffset: -1.4,            // sit on top of rock
  cardCount: 14,                 // 2 cards per year × 7 years
  totalScenes: 9,                // hero + 7 years + final
};

// ============================================================
// CURSOR
// ============================================================
const cursor = document.getElementById('cursor');
const cursorRing = document.getElementById('cursor-ring');
let mx = window.innerWidth / 2, my = window.innerHeight / 2;
let rx = mx, ry = my;
let mouseNormX = 0, mouseNormY = 0;

window.addEventListener('mousemove', (e) => {
  mx = e.clientX; my = e.clientY;
  cursor.style.left = mx + 'px';
  cursor.style.top = my + 'px';
  mouseNormX = (e.clientX / window.innerWidth - 0.5) * 2;
  mouseNormY = (e.clientY / window.innerHeight - 0.5) * 2;
});

(function ringLoop() {
  rx += (mx - rx) * 0.15;
  ry += (my - ry) * 0.15;
  cursorRing.style.left = rx + 'px';
  cursorRing.style.top = ry + 'px';
  requestAnimationFrame(ringLoop);
})();

document.querySelectorAll('a, button').forEach(el => {
  el.addEventListener('mouseenter', () => cursorRing.style.transform = 'translate(-50%, -50%) scale(1.8)');
  el.addEventListener('mouseleave', () => cursorRing.style.transform = 'translate(-50%, -50%) scale(1)');
});

// ============================================================
// THREE.JS SETUP
// ============================================================
const canvas = document.getElementById('canvas-3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a2f3a, 0.045);

// Responsive camera FOV — wider on small screens so the figure fits vertically
function getResponsiveFOV() {
  const w = window.innerWidth;
  if (w <= 480) return 60;   // phone — much wider FOV
  if (w <= 768) return 55;   // small tablet / large phone
  if (w <= 1024) return 48;  // tablet
  return 40;                 // desktop
}

const camera = new THREE.PerspectiveCamera(getResponsiveFOV(), window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.5, 7);

// Device flag — controls whether 3D cards are shown (they're cramped on phones)
const isMobile = window.matchMedia('(max-width: 768px)').matches;

// ============================================================
// LIGHTING — cinematic 3-point setup
// ============================================================
const keyLight = new THREE.DirectionalLight(0xfff8e8, 1.5);
keyLight.position.set(2, 6, 4);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x88aac0, 0.7);
rimLight.position.set(-3, 2, -2);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0x4a6478, 0.4);
fillLight.position.set(3, -1, 2);
scene.add(fillLight);

scene.add(new THREE.AmbientLight(0x2a3f4a, 0.6));

// ============================================================
// FIGURE — load Tamirlan's 3D scan
// ============================================================
const figureGroup = new THREE.Group();
scene.add(figureGroup);

const figureMaterial = new THREE.MeshStandardMaterial({
  color: 0xe5e8e3,
  roughness: 0.85,
  metalness: 0.05
});

const gltfLoader = new GLTFLoader();

// Draco decoder — required because the .glb uses KHR_draco_mesh_compression
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
dracoLoader.setDecoderConfig({ type: 'js' });
gltfLoader.setDRACOLoader(dracoLoader);

let modelLoaded = false;

gltfLoader.load(
  CONFIG.modelPath,
  (gltf) => {
    const model = gltf.scene;

    // Step 1 — measure model in its ORIGINAL orientation (before any rotation)
    model.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(model);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const rawCenter = new THREE.Vector3();
    rawBox.getCenter(rawCenter);

    // Step 2 — center the model on origin (so rotation pivots around its center)
    model.position.sub(rawCenter);

    // Step 3 — scale so the LONGEST axis = target height
    // (since model is lying down, its longest axis will become the vertical one after rotation)
    const longestAxis = Math.max(rawSize.x, rawSize.y, rawSize.z);
    const scale = CONFIG.modelTargetHeight / longestAxis;
    model.scale.setScalar(scale);

    // Step 4 — wrap in a pivot group so we can rotate cleanly without affecting position math
    const pivot = new THREE.Group();
    pivot.add(model);
    pivot.rotation.x = CONFIG.modelRotateX;
    pivot.rotation.y = CONFIG.modelRotateY;
    pivot.rotation.z = CONFIG.modelRotateZ;

    // Step 5 — measure FINAL bounding box (after rotation+scale) and place feet on rock
    pivot.updateMatrixWorld(true);
    const finalBox = new THREE.Box3().setFromObject(pivot);
    const finalCenter = new THREE.Vector3();
    finalBox.getCenter(finalCenter);

    // Center horizontally
    pivot.position.x -= finalCenter.x;
    pivot.position.z -= finalCenter.z;
    // Place feet on Y=0 then offset onto rock
    pivot.position.y -= finalBox.min.y;
    pivot.position.y += CONFIG.modelYOffset;

    // Apply unified material — clean monochrome sculpture look
    model.traverse((child) => {
      if (child.isMesh) {
        child.material = figureMaterial;
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    figureGroup.add(pivot);
    modelLoaded = true;

    setTimeout(() => {
      document.getElementById('loader').classList.add('hidden');
    }, 400);
  },
  (xhr) => {
    let pct;
    if (xhr.lengthComputable && xhr.total > 0) {
      pct = Math.round((xhr.loaded / xhr.total) * 100);
    } else {
      // Estimate against assumed 4MB if total unknown
      pct = Math.min(99, Math.round((xhr.loaded / (4 * 1024 * 1024)) * 100));
    }
    document.getElementById('loader-fill').style.width = pct + '%';
    document.getElementById('loader-percent').textContent = pct + '%';
  },
  (err) => {
    console.error('Model load error:', err);
    document.querySelector('.loader-hint').textContent = 'Could not load model';
    setTimeout(() => {
      document.getElementById('loader').classList.add('hidden');
    }, 2000);
  }
);

// ============================================================
// ROCK BASE — irregular stone for the figure to stand on
// ============================================================
const rockGroup = new THREE.Group();
const rockMaterial = new THREE.MeshStandardMaterial({
  color: 0x2a3a42,
  roughness: 0.95,
  metalness: 0.05,
  flatShading: true
});

const rockGeom = new THREE.IcosahedronGeometry(0.9, 1);
const posAttr = rockGeom.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
  const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
  const noise = (Math.sin(x*4) + Math.cos(y*4) + Math.sin(z*5)) * 0.08;
  posAttr.setXYZ(i,
    x + noise * (Math.random() * 0.5 + 0.5),
    y + noise * (Math.random() * 0.3 + 0.2),
    z + noise * (Math.random() * 0.5 + 0.5)
  );
}
rockGeom.computeVertexNormals();
const rock = new THREE.Mesh(rockGeom, rockMaterial);
rock.position.y = -1.95;
rock.scale.set(1.4, 0.7, 1.2);
rockGroup.add(rock);

for (let i = 0; i < 3; i++) {
  const chunk = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.25 + Math.random() * 0.2, 0),
    rockMaterial
  );
  chunk.position.set(
    (Math.random() - 0.5) * 1.8,
    -2.2 + Math.random() * 0.3,
    (Math.random() - 0.5) * 1.5
  );
  rockGroup.add(chunk);
}
scene.add(rockGroup);

// ============================================================
// PHOTO CARDS — REMOVED, replaced by dust particles below
// ============================================================
const cards = [];

// ============================================================
// DUST PARTICLES — small round specs floating in the air
// ============================================================
// Circular soft-edge texture for the dust (otherwise points render as squares)
function makeDustTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0,   'rgba(255, 245, 220, 1)');
  grad.addColorStop(0.4, 'rgba(255, 235, 200, 0.6)');
  grad.addColorStop(1,   'rgba(255, 230, 180, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

const dustCount = 800;
const dustGeom = new THREE.BufferGeometry();
const dustPos = new Float32Array(dustCount * 3);

for (let i = 0; i < dustCount; i++) {
  dustPos[i*3]   = (Math.random() - 0.5) * 22;
  dustPos[i*3+1] = (Math.random() - 0.5) * 12;
  dustPos[i*3+2] = (Math.random() - 0.5) * 14;
}
dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));

const dustMaterial = new THREE.PointsMaterial({
  map: makeDustTexture(),
  color: 0xfff0d0,
  size: 0.06,                  // small, but round
  transparent: true,
  opacity: 0.55,
  sizeAttenuation: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  alphaTest: 0.01
});
const dust = new THREE.Points(dustGeom, dustMaterial);
scene.add(dust);

// ============================================================
// BACKGROUND SCENE CROSSFADE — switch <div class="bg-scene"> layers
// Only one bg layer is .active at a time, others fade via CSS opacity transition.
// ============================================================
const bgScenes = document.querySelectorAll('.bg-scene');
let currentBgIndex = 0;

function updateBgScene(scenePos) {
  let targetIdx = Math.round(scenePos);
  if (targetIdx >= 8) targetIdx = 7;  // final scene uses last year's bg
  if (targetIdx < 0) targetIdx = 0;

  if (targetIdx !== currentBgIndex) {
    bgScenes.forEach((el, i) => {
      el.classList.toggle('active', i === targetIdx);
    });
    currentBgIndex = targetIdx;
  }
}

// ============================================================
// SCROLL-DRIVEN ANIMATION
// ============================================================
let scrollY = 0;
let targetScroll = 0;

window.addEventListener('scroll', () => {
  const max = document.body.scrollHeight - window.innerHeight;
  targetScroll = window.scrollY / max;
});

const yearData = [
  { year: '·',    label: 'Tamirlan',  months: ['Tamirlan'] },
  { year: '2019', label: 'Camera',    months: ['Jan', 'Mar', 'Jun', 'Sep', 'Dec'] },
  { year: '2020', label: 'Technodom', months: ['Jan', 'Mar', 'Jun', 'Sep', 'Dec'] },
  { year: '2021', label: 'AstanaHub', months: ['Jan', 'Mar', 'Jun', 'Sep', 'Dec'] },
  { year: '2022', label: 'Teaching',  months: ['Jan', 'Mar', 'Jun', 'Sep', 'Dec'] },
  { year: '2023', label: 'Freedom',   months: ['Jan', 'Mar', 'Jun', 'Sep', 'Dec'] },
  { year: '2024', label: 'AI & 3D',   months: ['Jan', 'Mar', 'Jun', 'Sep', 'Dec'] },
  { year: '2025', label: 'Today',     months: ['Jan', 'Mar', 'Jun', 'Sep', 'Dec'] },
  { year: '·',    label: 'Together',  months: ['Together'] }
];

function animate() {
  scrollY += (targetScroll - scrollY) * 0.07;
  const scenePos = scrollY * (CONFIG.totalScenes - 1);

  // Camera: FULL 360° orbit around the figure across the whole scroll,
  // gradually moving closer to the face.
  // Radius is larger on small screens so the whole figure fits in the wider FOV.
  const w = window.innerWidth;
  const radiusBase = w <= 480 ? 9.5 : w <= 768 ? 8.5 : w <= 1024 ? 8.0 : 7.5;
  const radiusEnd  = w <= 480 ? 6.0 : w <= 768 ? 5.5 : w <= 1024 ? 5.0 : 4.0;

  const totalAngle = scrollY * Math.PI * 2;          // 0 → 360°
  const camRadius = radiusBase - scrollY * (radiusBase - radiusEnd);
  const camHeight = 0.5 + scrollY * 1.4;             // 0.5 → 1.9 (rise toward face)
  const baseX = Math.sin(totalAngle) * camRadius;
  const baseZ = Math.cos(totalAngle) * camRadius;

  camera.position.x = baseX + mouseNormX * 0.15;
  camera.position.y = camHeight + mouseNormY * 0.1;
  camera.position.z = baseZ;

  const lookY = 0.4 + scrollY * 1.5;                 // look target rises with scroll
  camera.lookAt(0, lookY, 0);

  // Figure stays still (the camera moves around it) — just gentle breathing
  figureGroup.rotation.y = Math.sin(Date.now() * 0.0003) * 0.04;
  figureGroup.position.y = Math.sin(Date.now() * 0.0008) * 0.025;

  // Rock subtle counter-rotation for parallax depth
  rockGroup.rotation.y = scrollY * 0.2;

  // Photo cards removed — no-op
  cards.forEach((card) => { /* no-op */ });

  // Dust drift — slow rotation + gentle vertical wobble
  const t = Date.now();
  dust.rotation.y += 0.00025;
  dust.position.y = Math.sin(t * 0.0002) * 0.4;
  dust.material.opacity = 0.45 + Math.sin(t * 0.0008) * 0.1;

  // Update background scene image (THE ONLY NEW THING)
  updateBgScene(scenePos);

  // Update timeline UI
  const yearProgress = Math.max(0, Math.min(1, (scenePos - 1) / 6));
  document.getElementById('timeline-fill').style.width = (yearProgress * 100) + '%';
  document.getElementById('timeline-dot').style.left = (yearProgress * 100) + '%';

  // Update year marker — show year + cycling month label within each year
  const dataIdx = Math.max(0, Math.min(yearData.length - 1, Math.round(scenePos)));
  const data = yearData[dataIdx];
  document.getElementById('year-num').textContent = data.year;

  // Within a year-scene: pick a month based on how far we are between this year and the next
  if (dataIdx >= 1 && dataIdx <= 7) {
    const localProgress = scenePos - dataIdx;       // -0.5..+0.5 around this year
    const t = Math.max(0, Math.min(0.999, (localProgress + 0.5)));
    const monthIdx = Math.floor(t * data.months.length);
    document.getElementById('year-label').textContent = data.months[monthIdx] || data.label;
  } else {
    document.getElementById('year-label').textContent = data.label;
  }

  // Side text fade after hero
  const sideText = document.getElementById('side-text');
  if (scenePos > 0.5) sideText.classList.add('hidden');
  else sideText.classList.remove('hidden');

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// ============================================================
// RESIZE — recalculate FOV when rotating phone or resizing window
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = getResponsiveFOV();
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// SECTION REVEAL
// ============================================================
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const info = entry.target.querySelector('.year-info');
      if (info) info.classList.add('visible');
      const final = entry.target.querySelector('.final-content');
      if (final) final.classList.add('visible');
    } else {
      const info = entry.target.querySelector('.year-info');
      if (info) info.classList.remove('visible');
    }
  });
}, { threshold: 0.4 });

document.querySelectorAll('.year-scene, .final-scene').forEach(el => observer.observe(el));

// ============================================================
// AMBIENT AUDIO + INTRO PLAY GATE
// ============================================================
const audio = document.getElementById('ambient');
const audioBtn = document.getElementById('audio-btn');
const introOverlay = document.getElementById('intro');
const introPlayBtn = document.getElementById('intro-play');
audio.volume = 0.35;
let isPlaying = false;

function setPlayingUI(playing) {
  isPlaying = playing;
  if (playing) {
    audioBtn.classList.add('playing');
    document.getElementById('audio-icon').setAttribute('d', 'M0 0 H3 V12 H0 Z M7 0 H10 V12 H7 Z');
  } else {
    audioBtn.classList.remove('playing');
    document.getElementById('audio-icon').setAttribute('d', 'M0 0 L10 6 L0 12 Z');
  }
}

// Intro Play — user gesture starts the music and hides the overlay
introPlayBtn.addEventListener('click', async () => {
  try {
    await audio.play();
    setPlayingUI(true);
  } catch (e) {
    console.warn('Audio playback blocked:', e);
  }
  introOverlay.classList.add('hidden');
});

// Manual toggle via the bottom-left button
audioBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (isPlaying) {
    audio.pause();
    setPlayingUI(false);
  } else {
    try {
      await audio.play();
      setPlayingUI(true);
    } catch (err) {
      console.warn('Audio playback blocked:', err);
    }
  }
});
