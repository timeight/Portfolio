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
// PHOTO CARDS — symmetric layout, 2 per year
// ============================================================
function makePhotoTexture(label) {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 280;
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 400, 280);
  grad.addColorStop(0, '#6a7580');
  grad.addColorStop(0.5, '#3a4550');
  grad.addColorStop(1, '#7a8590');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 280);

  // Noise
  const img = ctx.getImageData(0, 0, 400, 280);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    img.data[i]   = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i+1] = Math.max(0, Math.min(255, img.data[i+1] + n));
    img.data[i+2] = Math.max(0, Math.min(255, img.data[i+2] + n));
  }
  ctx.putImageData(img, 0, 0);

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 400, 280);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'italic 28px serif';
  ctx.fillText(label, 24, 50);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '11px monospace';
  ctx.fillText('PROJECT IMAGE', 24, 260);

  return new THREE.CanvasTexture(c);
}

// Varied card layout — different sizes, depths, angles per year (like the original)
// Key principle: each year has ~2-3 cards with one "hero" card closer/larger and others smaller/further
const cardConfigs = [
  // Year 1 — 2019 (Camera)
  { year: 1, pos: [-3.2,  1.4, -0.5], rot: [ 0.05,  0.5,  0.04], scale: 1.4, label: '2019 / Photography' },
  { year: 1, pos: [ 3.6,  0.6, -1.8], rot: [-0.03, -0.55, -0.06], scale: 0.9, label: '2019 / Light' },
  { year: 1, pos: [ 2.5,  2.0, -3.0], rot: [ 0.0,  -0.4,  0.02], scale: 0.7, label: '2019 / Frame' },

  // Year 2 — 2020 (Technodom)
  { year: 2, pos: [-3.8,  0.8, -1.0], rot: [ 0.0,   0.45, -0.05], scale: 1.2, label: '2020 / Technodom' },
  { year: 2, pos: [ 3.4,  1.6, -1.2], rot: [-0.05, -0.5,   0.08], scale: 1.0, label: '2020 / Retail' },

  // Year 3 — 2021 (AstanaHub)
  { year: 3, pos: [-3.5,  0.4, -0.8], rot: [ 0.05,  0.5,   0.05], scale: 1.3, label: '2021 / AstanaHub' },
  { year: 3, pos: [ 3.8,  1.4, -1.5], rot: [ 0.0,  -0.4,  -0.04], scale: 0.95, label: '2021 / OmarketGroup' },
  { year: 3, pos: [-2.6,  2.2, -2.8], rot: [-0.04,  0.3,   0.0 ], scale: 0.7, label: '2021 / Marketing' },

  // Year 4 — 2022 (Teaching)
  { year: 4, pos: [-3.4,  1.6, -0.9], rot: [ 0.0,   0.45,  0.06], scale: 1.25, label: '2022 / EKEB' },
  { year: 4, pos: [ 3.6,  0.4, -1.4], rot: [ 0.05, -0.55, -0.05], scale: 1.05, label: '2022 / Algorithms' },

  // Year 5 — 2023 (Freedom)
  { year: 5, pos: [-3.3,  0.8, -0.6], rot: [ 0.0,   0.5,  -0.04], scale: 1.35, label: '2023 / FreedomMobile' },
  { year: 5, pos: [ 3.2,  1.8, -1.6], rot: [-0.05, -0.45,  0.05], scale: 0.95, label: '2023 / Best Seller' },
  { year: 5, pos: [ 2.4, -0.4, -2.8], rot: [ 0.08, -0.3,   0.0 ], scale: 0.75, label: '2023 / Sales' },

  // Year 6 — 2024 (AI & 3D)
  { year: 6, pos: [-3.5,  1.2, -0.7], rot: [ 0.0,   0.5,   0.05], scale: 1.3, label: '2024 / AI Project' },
  { year: 6, pos: [ 3.4,  0.6, -1.3], rot: [-0.04, -0.5,  -0.06], scale: 1.0, label: '2024 / 3D Champion' },
  { year: 6, pos: [-2.2,  2.4, -3.0], rot: [ 0.05,  0.35,  0.0 ], scale: 0.7, label: '2024 / College' },

  // Year 7 — 2025 (Today)
  { year: 7, pos: [-3.3,  0.8, -0.5], rot: [ 0.0,   0.45,  0.04], scale: 1.4, label: '2025 / Today' },
  { year: 7, pos: [ 3.6,  1.6, -1.7], rot: [-0.05, -0.5,  -0.04], scale: 0.95, label: '2025 / Latest' },
];

const cards = [];
cardConfigs.forEach(cfg => {
  const tex = makePhotoTexture(cfg.label);
  const aspect = 400 / 280;
  const h = 1.4 * (cfg.scale || 1);
  const w = h * aspect;
  const geom = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(...cfg.pos);
  mesh.rotation.set(...cfg.rot);
  scene.add(mesh);
  cards.push({ mesh, cfg, basePos: [...cfg.pos] });
});

// ============================================================
// PARTICLES — atmospheric dust
// ============================================================
const particleCount = 250;
const pGeom = new THREE.BufferGeometry();
const pPos = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  pPos[i*3]   = (Math.random() - 0.5) * 18;
  pPos[i*3+1] = (Math.random() - 0.5) * 10;
  pPos[i*3+2] = (Math.random() - 0.5) * 10;
}
pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const particles = new THREE.Points(pGeom, new THREE.PointsMaterial({
  color: 0xe8ede8, size: 0.02, transparent: true, opacity: 0.4
}));
scene.add(particles);

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

  // Photo card visibility — fade based on which year is in view.
  // Cards always face the camera so they read clearly during the full orbit.
  // On mobile they're hidden entirely (no room — text panel takes most of the screen).
  cards.forEach((card, i) => {
    if (isMobile) {
      card.mesh.material.opacity = 0;
      return;
    }
    const yearIdx = card.cfg.year;
    const dist = Math.abs(scenePos - yearIdx);
    let opacity = Math.max(0, 1 - dist * 0.85);
    if (scenePos < 0.6) opacity *= scenePos / 0.6;
    if (scenePos > 7.4) opacity *= Math.max(0, (8 - scenePos) / 0.6);
    card.mesh.material.opacity = opacity * 0.9;

    // Make cards face the camera (billboard) so they're always visible from any angle
    card.mesh.lookAt(camera.position);

    // Subtle vertical drift only
    card.mesh.position.x = card.basePos[0];
    card.mesh.position.y = card.basePos[1] + Math.sin(Date.now() * 0.0005 + i) * 0.025;
  });

  // Particle drift
  particles.rotation.y += 0.0005;
  particles.position.y = Math.sin(Date.now() * 0.0002) * 0.3;

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