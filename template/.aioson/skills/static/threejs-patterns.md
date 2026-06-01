# Three.js Patterns — WebGL Landing Page Production Guide

> Read this skill when the user explicitly asks for 3D, WebGL, particles, Three.js scenes,
> holographic effects, or spatial visuals. This is on-demand — never auto-loaded.
> CDN-only. No build step. No npm install required for basic patterns.

---

## When to apply this skill

Apply this skill when the user requests:
- "3D", "WebGL", "three.js", "Three.js"
- "particles", "particle system"
- "cena 3D", "3D scene", "objeto 3D interativo"
- "holographic", "hologram effect"
- "floating 3D", "3D objects", "interactive 3D"
- "hero 3D", "3D background", "particle background"
- `design_skill: threejs-spatial` set in `project.context.md`
- Three.js as a hybrid modifier in `@design-hybrid-forge`

Do NOT apply this skill for: card tilt CSS, scroll reveals, gradient text, or any
pattern already covered by `static-html-patterns.md`. Those are CSS-only and faster.

**Stack rule:** This skill produces standalone `index.html` with CDN imports.
For React/Vue/Next.js projects, adapt the patterns to framework conventions
(React Three Fiber, TresJS, etc.) — the visual outcome is the same.

---

## Dependencies — CDN-only (no npm)

```html
<!-- Importmap for clean ES module imports -->
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>

<!-- OrbitControls (optional, for interactive scenes) -->
<script type="module">
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
</script>

<!-- No GSAP needed — Three.js has its own animation system via requestAnimationFrame -->
```

---

## Performance Rules

1. **Always check WebGL support first** — fallback to CSS aurora gradient if unavailable
2. **`prefers-reduced-motion: reduce`** — skip entire canvas, show static image or CSS fallback
3. **Mobile: reduced particle count** — detect mobile, cut particles to 30% of desktop
4. **Lazy initialization** — don't init the renderer until the canvas is in viewport
5. **Dispose on unmount** — always call `renderer.dispose()` and dispose geometries/materials/textures
6. **Use `IntersectionObserver`** — only run render loop when canvas is visible

---

## 1. Particle Aurora Hero Background

**For:** Bold & Cinematic hero sections, crypto/AI/SaaS landing pages
**Complexity:** Low. ~80 lines of JS. Works on mobile with reduced count.
**Visual:** 3,000–8,000 particles drifting in aurora gradient colors, responding subtly to mouse.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product — Hero</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body { background: #060910; font-family: system-ui, sans-serif; }

    #hero-canvas {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }

    .hero-content {
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      text-align: center;
      color: #f0f4ff;
    }

    .hero-content h1 {
      font-size: clamp(2.5rem, 8vw, 5rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.1;
      max-width: 900px;
      padding: 0 2rem;
    }

    .hero-content p {
      font-size: clamp(1rem, 2.5vw, 1.25rem);
      color: rgba(240, 244, 255, 0.7);
      margin-top: 1.5rem;
      max-width: 540px;
      padding: 0 2rem;
    }

    .hero-cta {
      margin-top: 2.5rem;
      display: flex;
      gap: 1rem;
    }

    .hero-cta a {
      padding: 0.875rem 2rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      text-decoration: none;
      transition: transform 150ms ease, box-shadow 150ms ease;
    }

    .hero-cta a:hover {
      transform: translateY(-2px);
    }

    .btn-primary {
      background: linear-gradient(135deg, #00C8E8, #7C3AED);
      color: #fff;
      box-shadow: 0 4px 20px rgba(0, 200, 232, 0.3);
    }

    .btn-ghost {
      background: rgba(255, 255, 255, 0.08);
      color: #f0f4ff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(8px);
    }

    @media (prefers-reduced-motion: reduce) {
      #hero-canvas { display: none; }
      body { background: linear-gradient(135deg, #060910 0%, #0A0818 30%, #060C1A 70%, #08060F 100%); }
    }
  </style>
</head>
<body>

  <canvas id="hero-canvas"></canvas>

  <section class="hero-content">
    <h1>Bold Headline That <em style="background: linear-gradient(135deg, #00C8E8, #7C3AED); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Changes Everything</em></h1>
    <p>Supporting text that adds real context — who benefits, how fast, what outcome.</p>
    <div class="hero-cta">
      <a href="#cta" class="btn-primary">Get started</a>
      <a href="#features" class="btn-ghost">Learn more</a>
    </div>
  </section>

  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.160.0/build/three.module.js"
    }
  }
  </script>

  <script type="module">
    import * as THREE from 'three';

    // ─── WebGL Support Check ───────────────────────────────────────────────────
    const canvas = document.getElementById('hero-canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!gl) {
      canvas.style.display = 'none';
      document.body.style.background = 'linear-gradient(135deg, #060910 0%, #0A0818 30%, #060C1A 70%, #08060F 100%)';
    }

    // ─── prefers-reduced-motion ───────────────────────────────────────────────
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      canvas.style.display = 'none';
      document.body.style.background = 'linear-gradient(135deg, #060910 0%, #0A0818 30%, #060C1A 70%, #08060F 100%)';
    }

    // ─── Scene Setup ─────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    // ─── Particles ────────────────────────────────────────────────────────────
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const PARTICLE_COUNT = isMobile ? 1500 : 6000;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);

    // Aurora colors: teal (#00C8E8), violet (#7C3AED), blue (#3B82F6), pink (#EC4899)
    const palette = [
      new THREE.Color('#00C8E8'),
      new THREE.Color('#7C3AED'),
      new THREE.Color('#3B82F6'),
      new THREE.Color('#06B6D4'),
      new THREE.Color('#8B5CF6'),
    ];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;

      const color = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3]     = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      sizes[i] = Math.random() * 0.8 + 0.2;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // ─── Shader Material ─────────────────────────────────────────────────────
    const vertexShader = `
      attribute float size;
      varying vec3 vColor;

      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      varying vec3 vColor;

      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
        gl_FragColor = vec4(vColor, alpha * 0.8);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ─── Mouse Interaction ────────────────────────────────────────────────────
    const mouse = new THREE.Vector2(0, 0);
    const targetMouse = new THREE.Vector2(0, 0);

    document.addEventListener('mousemove', (e) => {
      targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // ─── Animation Loop ───────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let animFrameId = null;

    function animate() {
      if (prefersReducedMotion) return;

      animFrameId = requestAnimationFrame(animate);

      const elapsed = clock.getElapsedTime();

      // Smooth mouse follow
      mouse.x += (targetMouse.x - mouse.x) * 0.02;
      mouse.y += (targetMouse.y - mouse.y) * 0.02;

      // Particle drift
      const positions = geometry.attributes.position.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        positions[i * 3 + 1] += Math.sin(elapsed * 0.3 + i * 0.01) * 0.01;
        positions[i * 3] += Math.cos(elapsed * 0.2 + i * 0.005) * 0.008;
      }
      geometry.attributes.position.needsUpdate = true;

      // Camera sway (subtle)
      camera.position.x = mouse.x * 3;
      camera.position.y = mouse.y * 2;
      camera.lookAt(scene.position);

      // Particle rotation (very slow)
      points.rotation.y = elapsed * 0.02;
      points.rotation.x = Math.sin(elapsed * 0.1) * 0.05;

      material.uniforms.uTime.value = elapsed;
      renderer.render(scene, camera);
    }

    // ─── VisibilityObserver: only run when in viewport ─────────────────────
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (!animFrameId) animate();
        } else {
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
      });
    }, { threshold: 0 });
    observer.observe(canvas);

    // ─── Resize Handler ───────────────────────────────────────────────────────
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ─── Cleanup on page unload ───────────────────────────────────────────────
    window.addEventListener('beforeunload', () => {
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    });
  </script>
</body>
</html>
```

---

## 2. Interactive 3D Object Showcase

**For:** Product features, 3D product display, interactive demos
**Complexity:** Medium. ~120 lines of JS. Includes OrbitControls.
**Visual:** A single 3D object (torus knot, icosahedron, or custom geometry) that the user can drag to rotate. Hover highlights with glow.

```html
<!-- In your landing page, after the hero section -->
<section class="showcase-3d" id="showcase">
  <div class="showcase-container">
    <canvas id="showcase-canvas"></canvas>
    <div class="showcase-content">
      <span class="section-label">Interactive</span>
      <h2>Explore the architecture</h2>
      <p>Drag to rotate. Scroll to zoom. Every detail rendered in real-time 3D.</p>
    </div>
  </div>
</section>

<style>
  .showcase-3d { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .showcase-container { display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: center; max-width: 1200px; margin: 0 auto; padding: 4rem 2rem; }
  #showcase-canvas { width: 100%; height: 500px; border-radius: 16px; background: transparent; cursor: grab; }
  #showcase-canvas:active { cursor: grabbing; }
  .showcase-content h2 { font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 700; letter-spacing: -0.02em; }
  .showcase-content p { margin-top: 1rem; color: rgba(240,244,255,0.65); line-height: 1.7; }
  @media (max-width: 768px) { .showcase-container { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { #showcase-canvas { display: none; } }
</style>

<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>

<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.getElementById('showcase-canvas');
const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
if (!gl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  canvas.style.display = 'none';
}

// Scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(0, 0, 6);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// Bloom post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
  0.8, 0.4, 0.85
);
composer.addPass(bloomPass);

// Object: TorusKnot with glass-like material
const geometry = new THREE.TorusKnotGeometry(1.5, 0.4, 128, 32, 2, 3);
const material = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color('#00C8E8'),
  metalness: 0.1,
  roughness: 0.1,
  transmission: 0.6,
  thickness: 1.5,
  envMapIntensity: 1,
  clearcoat: 1,
  clearcoatRoughness: 0.1,
  transparent: true,
  opacity: 0.9,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const pointLight1 = new THREE.PointLight(0x00C8E8, 2, 50);
pointLight1.position.set(5, 5, 5);
scene.add(pointLight1);

const pointLight2 = new THREE.PointLight(0x7C3AED, 2, 50);
pointLight2.position.set(-5, -5, 5);
scene.add(pointLight2);

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 10;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

// Subtle float animation
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  mesh.position.y = Math.sin(elapsed * 0.5) * 0.15;
  controls.update();
  composer.render();
}

// Only start when visible
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animate();
      observer.disconnect();
    }
  });
}, { threshold: 0.1 });
observer.observe(canvas);

window.addEventListener('resize', () => {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});
</script>
```

---

## 3. Scroll-Driven 3D Parallax Layers

**For:** Landing pages where scrolling moves the camera through a 3D scene
**Complexity:** Medium. Uses scroll event + camera interpolation.
**Visual:** Multiple 3D planes positioned at different depths scroll at different rates.

```html
<section class="parallax-3d-section" id="features-3d">
  <canvas id="parallax-canvas"></canvas>

  <div class="parallax-content" data-depth="0.1">
    <h2>First Feature</h2>
    <p>Content that moves with the scene.</p>
  </div>

  <div class="parallax-content" data-depth="0.3">
    <h2>Second Feature</h2>
    <p>Deeper layer, moves faster.</p>
  </div>

  <div class="parallax-content" data-depth="0.6">
    <h2>Third Feature</h2>
    <p>Closest layer, fastest parallax.</p>
  </div>
</section>

<script type="importmap">{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js" } }</script>

<script type="module">
import * as THREE from 'three';

const canvas = document.getElementById('parallax-canvas');
if (!canvas.getContext('webgl') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  canvas.style.display = 'none';
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 50;

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);

// Background particles (stars)
const starGeometry = new THREE.BufferGeometry();
const starCount = 2000;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) {
  starPositions[i] = (Math.random() - 0.5) * 200;
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.6 });
const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// Scroll-driven camera + parallax layers
const scrollContainer = document.getElementById('features-3d');
const parallaxElements = document.querySelectorAll('.parallax-content');
let scrollProgress = 0;

window.addEventListener('scroll', () => {
  const rect = scrollContainer.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  scrollProgress = Math.max(0, Math.min(1, -rect.top / (rect.height - viewportHeight)));
}, { passive: true });

const clock = new THREE.Clock();
let parallaxFrameId = null;

function animate() {
  parallaxFrameId = requestAnimationFrame(animate);

  // Camera moves forward on scroll
  camera.position.z = 50 - scrollProgress * 30;
  camera.position.x = Math.sin(scrollProgress * Math.PI) * 5;

  // Parallax layers
  parallaxElements.forEach(el => {
    const depth = parseFloat(el.dataset.depth);
    el.style.transform = `translateY(${-scrollProgress * 100 * depth}px)`;
  });

  // Stars drift
  stars.rotation.y = scrollProgress * 0.3;
  stars.rotation.x = clock.getElapsedTime() * 0.01;

  renderer.render(scene, camera);
}

// Only run when section is in viewport
const parallaxObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      if (!parallaxFrameId) animate();
    } else {
      cancelAnimationFrame(parallaxFrameId);
      parallaxFrameId = null;
    }
  });
}, { threshold: 0 });
parallaxObserver.observe(document.getElementById('features-3d'));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>

<style>
  .parallax-3d-section { position: relative; height: 300vh; background: #060910; overflow: hidden; }
  #parallax-canvas { position: sticky; top: 0; width: 100%; height: 100vh; z-index: 0; }
  .parallax-content {
    position: relative;
    z-index: 10;
    padding: 4rem 2rem;
    max-width: 600px;
    margin: 0 auto;
    text-align: center;
    color: #f0f4ff;
  }
  .parallax-content h2 { font-size: 2rem; font-weight: 700; }
  .parallax-content p { color: rgba(240,244,255,0.65); margin-top: 0.75rem; }
</style>
```

---

## 4. Holographic Glass Object

**For:** Premium dashboards, futuristic product pages, tech/SaaS
**Complexity:** Medium. Uses MeshPhysicalMaterial transmission + bloom.
**Visual:** A glass-like 3D object with holographic iridescence, floating in space.

```html
<canvas id="holo-canvas"></canvas>

<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>

<script type="module">
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvas = document.getElementById('holo-canvas');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!canvas.getContext('webgl') || prefersReducedMotion) {
  canvas.style.display = 'none';
  document.body.style.background = 'linear-gradient(135deg, #060910, #0A0818)';
}

// Scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

// Bloom
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.5, 0.7
);
composer.addPass(bloomPass);

// Holographic material
const holoMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color('#00C8E8'),
  metalness: 0.9,
  roughness: 0.05,
  transmission: 0.4,
  thickness: 0.5,
  envMapIntensity: 2,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  iridescence: 1,
  iridescenceIOR: 1.5,
  iridescenceThicknessRange: [100, 400],
  transparent: true,
  opacity: 0.85,
});

// Object: Icosahedron
const geometry = new THREE.IcosahedronGeometry(1.8, 1);
const mesh = new THREE.Mesh(geometry, holoMaterial);
scene.add(mesh);

// Wireframe overlay
const wireframeMaterial = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#00C8E8'),
  wireframe: true,
  transparent: true,
  opacity: 0.15,
});
const wireframe = new THREE.Mesh(geometry, wireframeMaterial);
mesh.add(wireframe);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.3));
const light1 = new THREE.PointLight(0x00C8E8, 3, 20);
light1.position.set(3, 3, 3);
scene.add(light1);
const light2 = new THREE.PointLight(0x7C3AED, 3, 20);
light2.position.set(-3, -3, 3);
scene.add(light2);

// Mouse interaction (rotation)
const mouse = new THREE.Vector2(0, 0);
document.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}, { passive: true });

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  mesh.rotation.x = elapsed * 0.15 + mouse.y * 0.3;
  mesh.rotation.y = elapsed * 0.2 + mouse.x * 0.5;

  // Pulse the iridescence via thickness range
  const pulse = 200 + Math.sin(elapsed * 2) * 100;
  holoMaterial.iridescenceThicknessRange = [pulse * 0.5, pulse];
  holoMaterial.needsUpdate = true;

  composer.render();
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
</script>

<style>
  #holo-canvas { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 0; }
  body > *:not(#holo-canvas) { position: relative; z-index: 10; }
</style>
```

---

## 5. Floating Object Array (Dashboard Cards as 3D Objects)

**For:** Premium command centers, product showcases, animated dashboard cards
**Complexity:** Medium-High. Multiple meshes with individual animations.
**Visual:** A grid of floating cards (as thin 3D boxes) that drift and respond to mouse.

```html
<section class="floating-cards-section" id="dashboard-3d">
  <canvas id="cards-canvas"></canvas>
  <div class="cards-overlay">
    <h2>Command everything</h2>
    <p>Every metric, every system, every alert — unified in one spatial interface.</p>
  </div>
</section>

<script type="importmap">{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js" } }</script>

<script type="module">
import * as THREE from 'three';

const canvas = document.getElementById('cards-canvas');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!canvas.getContext('webgl') || prefersReducedMotion) {
  canvas.style.display = 'none';
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 12);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// Card count
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const CARD_COUNT = isMobile ? 6 : 12;
const COLS = isMobile ? 3 : 4;

// Cards as thin boxes
const cards = [];
const cardGeometry = new THREE.BoxGeometry(2.2, 1.4, 0.08);
const basePositions = [];

for (let i = 0; i < CARD_COUNT; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = (col - (COLS - 1) / 2) * 2.6;
  const y = (row - (Math.ceil(CARD_COUNT / COLS) - 1) / 2) * -1.8;
  basePositions.push({ x, y });

  // Glass-like material
  const hue = (i / CARD_COUNT) * 0.3 + 0.5; // teal to violet range
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHSL(hue, 0.7, 0.3),
    metalness: 0.1,
    roughness: 0.2,
    transmission: 0.3,
    thickness: 0.5,
    transparent: true,
    opacity: 0.8,
    clearcoat: 0.5,
  });

  const card = new THREE.Mesh(cardGeometry, material);
  card.position.set(x, y, 0);
  card.userData = {
    baseY: y,
    phase: Math.random() * Math.PI * 2,
    floatSpeed: 0.5 + Math.random() * 0.5,
  };
  scene.add(card);
  cards.push(card);
}

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const pointLight = new THREE.PointLight(0x00C8E8, 1.5, 30);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

// Mouse influence
const mouse = new THREE.Vector2(0, 0);
document.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}, { passive: true });

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  cards.forEach((card, i) => {
    // Float animation
    card.position.y = card.userData.baseY + Math.sin(elapsed * card.userData.floatSpeed + card.userData.phase) * 0.15;

    // Subtle rotation toward mouse
    card.rotation.x = (mouse.y * 0.1) + Math.sin(elapsed * 0.3 + i) * 0.03;
    card.rotation.y = (mouse.x * 0.15) + Math.cos(elapsed * 0.4 + i) * 0.03;

    // Hover: elevate toward camera
    const targetZ = (card.position.x * mouse.x + card.position.y * mouse.y) * 0.1;
    card.position.z += (targetZ - card.position.z) * 0.05;
  });

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>

<style>
  .floating-cards-section { position: relative; min-height: 100vh; background: #060910; overflow: hidden; }
  #cards-canvas { width: 100%; height: 100vh; }
  .cards-overlay {
    position: absolute;
    bottom: 4rem;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    color: #f0f4ff;
    z-index: 10;
  }
  .cards-overlay h2 { font-size: clamp(1.5rem, 4vw, 2.5rem); font-weight: 700; }
  .cards-overlay p { color: rgba(240,244,255,0.6); margin-top: 0.75rem; }
</style>
```

---

## Anti-Generic Rules

1. **Never generate a generic particle starfield** — starfields are overused. Use aurora-inspired palettes and drift patterns that feel organic, not space-themed.
2. **Three.js is enhancement, not replacement** — the content (headline, copy, CTA) still needs to be strong. A beautiful 3D scene with no message is as bad as no 3D.
3. **Color discipline** — use the accent palette from the design skill. Do not introduce random neon colors.
4. **No Rube Goldberg visuals** — complex choreography, bouncing, elastic physics, and elaborate animation sequences are visual noise. Subtle drift and gentle rotation communicate premium quality.
5. **Fallback mandatory** — every pattern above includes a WebGL support check and `prefers-reduced-motion` guard. The CSS fallback must look intentional, not broken.

---

## Pre-delivery Checklist

- [ ] WebGL support check with graceful CSS fallback
- [ ] `prefers-reduced-motion: reduce` disables all Three.js content
- [ ] Mobile detection reduces particle count to 30% or hides canvas
- [ ] `IntersectionObserver` stops render loop when canvas is off-screen
- [ ] All geometries and materials disposed on `beforeunload`
- [ ] Canvas is `alpha: true` so CSS gradient background shows through
- [ ] Bloom post-processing adds glow without washing out content
- [ ] No network requests other than Three.js CDN (no external textures/models)
- [ ] Lighthouse Performance score ≥ 85 on desktop (canvas is GPU-heavy — acceptable)
