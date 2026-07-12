import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SCENE_PALETTE } from "./palette";

/**
 * Framework-agnostic Three.js setup for the perfume showcase.
 *
 * Group hierarchy (built synchronously so GSAP always has non-null targets):
 *   pivot   -> GSAP owns position, scale, tilt (rotation.z), 360 spin (rotation.y)
 *     spinner -> render loop adds idle rotation.y AND the up/down bob (position.y)
 *       <loaded GLB> -> dropped in on load, centered + normalized
 *
 * Because Object3D transforms compose, the idle spin/bob (spinner) and the
 * scroll-driven 360 + move (pivot) never overwrite the same property.
 *
 * Rendering goes through an EffectComposer (RenderPass -> UnrealBloomPass ->
 * OutputPass) for a subtle cinematic glow. The canvas is opaque and the
 * background gradient lives in-scene, because UnrealBloomPass does not
 * preserve canvas alpha.
 */
export interface PerfumeScene {
  pivot: THREE.Group;
  spinner: THREE.Group;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /**
   * Giant serif type on a plane behind the bottle — the transmission glass
   * refracts it (the signature moment). Starts at opacity 0; the entrance
   * choreography owns fading it in, the scroll timeline owns drifting it.
   */
  typePlane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** Key/fill/rim lights, exposed so the scroll timeline can tell a light story. */
  lights: {
    key: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
    rim: THREE.PointLight;
  };
  /** Normalized pointer (-1..1) for the parallax camera drift. */
  setPointer: (nx: number, ny: number) => void;
  /** Advance idle spin/bob/particles (dt seconds) and draw one frame. */
  render: (dt: number) => void;
  /** Resize renderer + composer + camera to the given CSS pixel size. */
  resize: (width: number, height: number) => void;
  /** Promise that resolves once the GLB has loaded (or rejects on error). */
  ready: Promise<void>;
  /** Release all GPU resources. */
  dispose: () => void;
}

export interface PerfumeSceneOptions {
  /** "low" trims pixel ratio, MSAA and particle count for weaker devices. */
  quality?: "high" | "low";
  /** Real GLB load progress 0..1 for the preloader counter. */
  onProgress?: (progress: number) => void;
}

const MODEL_URL = "/models/perfume.glb";
const IDLE_SPEED = 0.25; // radians / second — slow, luxurious

// --- Glass look (shape constants tunable here) ---
/**
 * When true, each mesh keeps its ORIGINAL GLB material colour (this model:
 * vivid rose-pink body + violet accents) rendered as transmission glass —
 * the bottle is the only coloured object in the monochrome scene.
 * When false, the whole bottle takes the theme's glassTint.
 */
const USE_MODEL_COLORS = true;
const MODEL_COLOR_SOFTEN = 0.12; // lerp toward white so ACES doesn't go neon
const GLASS_TINT = SCENE_PALETTE.glassTint;
const ATTENUATION_COLOR = SCENE_PALETTE.attenuation;
const ATTENUATION_DISTANCE = 0.8; // longer = the chunky heart stays luminous
const GLASS_THICKNESS = 1.2;

// --- Idle bob ---
const BOB_SPEED = 1.1; // radians / second
const BOB_AMP = 0.06; // world units

// --- Background gradient (palette-driven) ---
const BG_CENTER = SCENE_PALETTE.bgCenter;
const BG_EDGE = SCENE_PALETTE.bgEdge;

// --- Refracted type plane (the signature moment) ---
const TYPE_TEXT = "NOIR";
const TYPE_COLOR = SCENE_PALETTE.typeColor;
const TYPE_PLANE_Z = -2.5;
/** Parallax camera drift extents (world units). */
const POINTER_X = 0.18;
const POINTER_Y = 0.1;

export function createPerfumeScene(
  canvas: HTMLCanvasElement,
  options: PerfumeSceneOptions = {},
): PerfumeScene {
  const isLow = options.quality === "low";
  const maxPixelRatio = isLow ? 1.5 : 2;
  const particleCount = isLow ? 60 : 150;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  // Transmission re-renders the scene to an internal target every frame —
  // halving its resolution on weak devices is the single biggest GPU win.
  renderer.transmissionResolutionScale = isLow ? 0.5 : 1;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95; // keep highlight detail — no chrome blowout
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  // --- In-scene radial gradient background ---
  const bgTexture = createGradientTexture(BG_CENTER, BG_EDGE);
  scene.background = bgTexture;

  // --- Environment map for glass reflections (independent of background) ---
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;

  // --- 3-point lighting ---
  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(SCENE_PALETTE.keyLight, 2.0);
  key.position.set(4, 6, 5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(SCENE_PALETTE.fillLight, 0.45);
  fill.position.set(-5, 1, 3);
  scene.add(fill);

  const rim = new THREE.PointLight(SCENE_PALETTE.rimLight, 7.0, 40, 2); // behind
  rim.position.set(0, 2, -6);
  scene.add(rim);

  // Subtle warm-gold kicker: feminine golden glints in the reflections
  // regardless of theme, without shifting the overall grade.
  const kicker = new THREE.PointLight(0xd9b380, 1.4, 25, 2);
  kicker.position.set(-2.5, -1, 4);
  scene.add(kicker);

  // --- Group hierarchy ---
  const pivot = new THREE.Group();
  const spinner = new THREE.Group();
  pivot.add(spinner);
  scene.add(pivot);

  // --- Floating particle dust ---
  const particles = createParticles(particleCount);
  scene.add(particles.points);

  // --- Refracted type plane: giant serif NOIR behind the bottle ---
  // Mesh + texture exist synchronously (GSAP needs stable targets); the
  // glyphs are drawn in once the display font is actually loaded.
  const typeCanvas = document.createElement("canvas");
  typeCanvas.width = isLow ? 2048 : 4096;
  typeCanvas.height = isLow ? 1024 : 2048;
  const typeTexture = new THREE.CanvasTexture(typeCanvas);
  typeTexture.colorSpace = THREE.SRGBColorSpace;
  typeTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const typePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 8),
    new THREE.MeshBasicMaterial({
      map: typeTexture,
      transparent: true,
      opacity: 0, // entrance choreography fades this in
      depthWrite: false,
    }),
  );
  typePlane.position.set(0, 0, TYPE_PLANE_Z);
  scene.add(typePlane);
  void drawTypePlane(typeCanvas, typeTexture);

  // --- Pointer parallax (camera x/y only; GSAP owns camera z) ---
  let pointerX = 0;
  let pointerY = 0;
  function setPointer(nx: number, ny: number) {
    pointerX = nx;
    pointerY = ny;
  }

  // --- Load + glass-ify the model ---
  const loader = new GLTFLoader();
  const modelRoot = new THREE.Group();
  spinner.add(modelRoot);

  const ready = new Promise<void>((resolve, reject) => {
    loader.load(
      MODEL_URL,
      (gltf) => {
        const model = gltf.scene;

        // Center + normalize size so framing is independent of source scale.
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 3.2 / maxDim;

        // Replace every material with transmission glass, inheriting each
        // original material's colour (rose body / violet accents).
        model.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          const old = mesh.material;
          const source = Array.isArray(old) ? old[0] : old;

          let color = new THREE.Color(GLASS_TINT);
          if (USE_MODEL_COLORS) {
            const srcColor = (source as THREE.MeshStandardMaterial | undefined)
              ?.color;
            if (srcColor) {
              color = srcColor.clone();
              color.lerp(new THREE.Color(0xffffff), MODEL_COLOR_SOFTEN);
            }
          }
          // Same-hue volumetric depths (deep wine-rose / deep violet).
          const attenuation = USE_MODEL_COLORS
            ? color.clone().multiplyScalar(0.25)
            : new THREE.Color(ATTENUATION_COLOR);

          mesh.material = new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0.1,
            roughness: 0.06, // micro-surface breaks the mirror — glass, not chrome
            transmission: 0.9,
            ior: 1.5,
            thickness: GLASS_THICKNESS,
            attenuationColor: attenuation,
            attenuationDistance: ATTENUATION_DISTANCE,
            clearcoat: 1.0,
            clearcoatRoughness: 0.15,
            envMapIntensity: 0.9,
            transparent: false, // transmission handles see-through
            opacity: 1,
          });
          if (Array.isArray(old)) old.forEach((m) => m.dispose());
          else if (old) old.dispose();
        });

        model.position.sub(center);
        modelRoot.scale.setScalar(scale);
        modelRoot.add(model);

        resolve();
      },
      // Byte-level progress for the preloader counter.
      (event) => {
        if (event.total > 0) options.onProgress?.(event.loaded / event.total);
      },
      (err) => reject(err),
    );
  });

  // --- Post-processing composer ---
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: isLow ? 0 : 2,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // Bloom is ~5 extra passes — skip it entirely on weak devices; the
  // additive particles still read bright without it.
  let bloomPass: UnrealBloomPass | null = null;
  if (!isLow) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      0.35, // strength — a breath of glow, never a blowout
      0.4, // radius
      0.9, // threshold — only true highlights/particles bloom
    );
    composer.addPass(bloomPass);
  }
  composer.addPass(new OutputPass());

  let elapsed = 0;

  function render(dt: number) {
    // Clamp huge deltas (tab restore, GC pause) so the bottle never jumps.
    dt = Math.min(dt, 0.05);
    elapsed += dt;
    spinner.rotation.y += IDLE_SPEED * dt;
    spinner.position.y = Math.sin(elapsed * BOB_SPEED) * BOB_AMP;
    particles.update(elapsed, dt);

    // Pointer parallax: lerp camera x/y toward the pointer offset.
    // (GSAP owns camera.position.z; this never touches it.)
    const ease = Math.min(1, dt * 3);
    camera.position.x += (pointerX * POINTER_X - camera.position.x) * ease;
    camera.position.y += (pointerY * POINTER_Y - camera.position.y) * ease;
    camera.lookAt(0, 0, 0);

    composer.render();
  }

  function resize(width: number, height: number) {
    const ratio = Math.min(window.devicePixelRatio, maxPixelRatio);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    bloomPass?.setSize(width * ratio, height * ratio);
  }

  function dispose() {
    bgTexture.dispose();
    typeTexture.dispose();
    envTexture.dispose();
    pmrem.dispose();
    particles.dispose();
    bloomPass?.dispose();
    composer.dispose();
    rt.dispose();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
    renderer.dispose();
  }

  return {
    pivot,
    spinner,
    camera,
    renderer,
    typePlane,
    lights: { key, fill, rim },
    setPointer,
    render,
    resize,
    ready,
    dispose,
  };
}

/**
 * Draw the giant serif word onto the type-plane canvas once the display font
 * is actually available. next/font mangles the family name, so resolve it
 * from the CSS variable at runtime; fall back to a generic serif.
 */
async function drawTypePlane(
  canvas: HTMLCanvasElement,
  texture: THREE.CanvasTexture,
): Promise<void> {
  const styles = getComputedStyle(document.documentElement);
  const family =
    styles.getPropertyValue("--font-display-bold").trim() ||
    styles.getPropertyValue("--font-display").trim() ||
    "serif";
  const font = `900 ${Math.round(canvas.height * 0.61)}px ${family}, serif`;
  try {
    await document.fonts.load(font, TYPE_TEXT);
  } catch {
    // fall through — worst case we draw with the fallback serif
  }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = font;
  ctx.fillStyle = TYPE_COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(TYPE_TEXT, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
}

/** Radial-gradient background as a CanvasTexture (center -> edge). */
function createGradientTexture(
  center: string,
  edge: string,
): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size * 0.72,
  );
  g.addColorStop(0, center);
  g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Small soft circular sprite for glowing dust particles. */
function createDotTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, `rgba(${SCENE_PALETTE.particleGlow},0.7)`);
  g.addColorStop(1, `rgba(${SCENE_PALETTE.particleGlow},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Particles {
  points: THREE.Points;
  update: (elapsed: number, dt: number) => void;
  dispose: () => void;
}

/** Slim volume of gently drifting glowing dust around the bottle. */
function createParticles(count: number): Particles {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const baseY = new Float32Array(count);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 6;
    const y = (Math.random() - 0.5) * 7;
    const z = (Math.random() - 0.5) * 4 - 0.5;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    baseY[i] = y;
    phase[i] = Math.random() * Math.PI * 2;
    speed[i] = 0.15 + Math.random() * 0.35;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const dot = createDotTexture();
  const material = new THREE.PointsMaterial({
    size: 0.07,
    map: dot,
    color: SCENE_PALETTE.particleTint,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);

  function update(elapsed: number) {
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      pos.array[i * 3 + 1] =
        baseY[i] + Math.sin(elapsed * speed[i] + phase[i]) * 0.18;
    }
    pos.needsUpdate = true;
    points.rotation.y = elapsed * 0.02;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    dot.dispose();
  }

  return { points, update, dispose };
}
