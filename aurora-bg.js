/* ============================================================
 * Luna — Aurora shader background
 * ============================================================
 * Vanilla port of the AnoAI React/Three.js aurora shader.
 *
 * Finds every canvas with `[data-aurora]` on the page and boots a
 * dedicated WebGL context for each. Each canvas can pick a palette
 * via `data-variant`:
 *    "default" — original aurora palette (blue/teal/purple)
 *    "luna"    — Luna DS palette (navy base + gold/bronze highlights)
 *
 * Respects prefers-reduced-motion: canvas is hidden, leaving whatever
 * static sibling (poster image, video poster) showing through.
 *
 * Pauses render on visibility change to save battery on background tabs.
 *
 * Three.js loaded from esm.sh CDN — no bundler required.
 * ============================================================ */

import * as THREE from 'https://esm.sh/three@0.160.0';

(() => {
  const canvases = document.querySelectorAll('canvas[data-aurora]');
  if (!canvases.length) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    canvases.forEach(c => { c.style.display = 'none'; });
    return;
  }

  /* DPR cap — mobile gets clamped harder to save GPU cycles. */
  const isSmallViewport = window.innerWidth < 768;
  const DPR_CAP = isSmallViewport ? 1.0 : 1.25;

  /* Target 30fps — half the motion cost of 60fps, imperceptible for a
   * slow ambient shader. Saves ~50% GPU time. */
  const TARGET_FPS = 30;
  const FRAME_MS = 1000 / TARGET_FPS;

  const vertexShader = /* glsl */`
    void main() {
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = /* glsl */`
    uniform float iTime;
    uniform vec2  iResolution;
    uniform int   iVariant;

    #define NUM_OCTAVES 3

    float rand(vec2 n) {
      return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 ip = floor(p);
      vec2 u  = fract(p);
      u = u*u*(3.0-2.0*u);
      float res = mix(
        mix(rand(ip),                 rand(ip + vec2(1.0, 0.0)), u.x),
        mix(rand(ip + vec2(0.0,1.0)), rand(ip + vec2(1.0, 1.0)), u.x),
        u.y);
      return res * res;
    }

    float fbm(vec2 x) {
      float v = 0.0;
      float a = 0.3;
      vec2 shift = vec2(100);
      mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
      for (int i = 0; i < NUM_OCTAVES; ++i) {
        v += a * noise(x);
        x = rot * x * 2.0 + shift;
        a *= 0.4;
      }
      return v;
    }

    /* Palette per variant.
       Luna palette is derived from the Luna DS tokens:
         navy base   #0D1528 → (0.05, 0.08, 0.16)
         gold warm   #B89560 → (0.72, 0.58, 0.38)
         gold deep   #9E7F4A → (0.62, 0.50, 0.29)
       We sweep warm tones with a whisper of navy — never saturated. */
    vec4 palette(float i, float t) {
      if (iVariant == 1) {
        /* LUNA — restrained gold/bronze over navy base */
        return vec4(
          0.42 + 0.22 * sin(i * 0.2 + t * 0.4),
          0.28 + 0.18 * cos(i * 0.3 + t * 0.5),
          0.10 + 0.08 * sin(i * 0.4 + t * 0.3),
          1.0
        );
      }
      /* DEFAULT — original aurora (blue/teal/purple) */
      return vec4(
        0.1 + 0.3 * sin(i * 0.2 + t * 0.4),
        0.3 + 0.5 * cos(i * 0.3 + t * 0.5),
        0.7 + 0.3 * sin(i * 0.4 + t * 0.3),
        1.0
      );
    }

    void main() {
      vec2 shake = vec2(sin(iTime * 1.2) * 0.005, cos(iTime * 2.1) * 0.005);
      vec2 p = ((gl_FragCoord.xy + shake * iResolution.xy) - iResolution.xy * 0.5)
               / iResolution.y * mat2(6.0, -4.0, 4.0, 6.0);
      vec2 v;
      vec4 o = vec4(0.0);

      float f = 2.0 + fbm(p + vec2(iTime * 5.0, 0.0)) * 0.5;

      for (float i = 0.0; i < 35.0; i++) {
        v = p
          + cos(i * i + (iTime + p.x * 0.08) * 0.025 + i * vec2(13.0, 11.0)) * 3.5
          + vec2(sin(iTime * 3.0 + i) * 0.003, cos(iTime * 3.5 - i) * 0.003);

        float tailNoise = fbm(v + vec2(iTime * 0.5, i)) * 0.3 * (1.0 - (i / 35.0));

        vec4 auroraColors = palette(i, iTime);

        vec4 currentContribution = auroraColors
          * exp(sin(i * i + iTime * 0.8))
          / length(max(v, vec2(v.x * f * 0.015, v.y * 1.5)));

        float thinnessFactor = smoothstep(0.0, 1.0, i / 35.0) * 0.6;
        o += currentContribution * (1.0 + tailNoise * 0.8) * thinnessFactor;
      }

      o = tanh(pow(o / 100.0, vec4(1.6)));
      /* Luna variant: dial intensity down — Rolex restraint over aurora flash. */
      float intensity = (iVariant == 1) ? 1.1 : 1.5;
      gl_FragColor = o * intensity;
    }
  `;

  const instances = [];

  canvases.forEach(canvas => {
    const variant = (canvas.dataset.variant === 'luna') ? 1 : 0;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });

    const material = new THREE.ShaderMaterial({
      uniforms: {
        iTime:       { value: 0 },
        iResolution: { value: new THREE.Vector2(1, 1) },
        iVariant:    { value: variant },
      },
      vertexShader,
      fragmentShader,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const setSize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(rect.width  | 0, window.innerWidth);
      const h = Math.max(rect.height | 0, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAP));
      renderer.setSize(w, h, false);
      material.uniforms.iResolution.value.set(w, h);
    };
    setSize();

    instances.push({ scene, camera, renderer, material, setSize });
  });

  /* Single shared RAF ticking every instance — cheaper than one loop per canvas.
   * Frame-gated to TARGET_FPS to cap GPU cost. */
  let frameId = null;
  let running = false;
  let lastFrame = 0;
  const tick = (t) => {
    frameId = requestAnimationFrame(tick);
    if (t - lastFrame < FRAME_MS) return;
    const dt = (t - lastFrame) / 1000 || 0.033;
    lastFrame = t;
    instances.forEach(inst => {
      inst.material.uniforms.iTime.value += dt;
      inst.renderer.render(inst.scene, inst.camera);
    });
  };
  const start = () => { if (!running) { running = true; tick(); } };
  const stop  = () => { if (running)  { running = false; cancelAnimationFrame(frameId); } };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
  window.addEventListener('resize', () => {
    instances.forEach(inst => inst.setSize());
  }, { passive: true });

  start();
})();
