// plate/plate.js v1.1.0 (15 Nov 2026): the projector plate — the site's scene with nothing of the page on it.
//   ?scene=desk (default): the room, the desk with its keyboard, the in-tray, the lamp and the Macintosh with its screen dark, at the
//                          site's seated view, panning slowly left and right.
//   ?scene=sky:            just the view out of the window, for a clean skyline plate.
// The camera, the lights and every value come from index.html; the post chain is the site's own (bloom -> ACES -> grade + anamorphic
// flare + vignette + grain). See README.md for the parameters and the TouchDesigner setup.
//
// URL parameters (all optional):
//   scene                room (default) | desk | sky — what to draw.
//   parallax, panTime    the motion: metres the eye dollies across the glass per cycle (0.20), and seconds per cycle (82).
//   back                 metres the eye sits back from the site's seat (0.30; 0 is the seat itself, nearly at the glass).
//   pan                  the old head-turn, degrees either side (0 by default: the dolly is the motion).
//   fov, yaw, pitch      camera overrides in degrees; otherwise the scene's own framing (room -5, desk -11, sky -5.5; fov 38, sky 40).
//   dirty, glass         the pane: how dirty, 0..100 (50), and how much pane there is, 0 = a clean opening (1).
//   screen, screenlight  the Mac's screen colour (#050506) and the spill light it throws (1.2; the site runs a lit screen at 3.0).
//   flare, bar           the lens flare, 0..100 (40), and its vertical bar element, 0..0.5 (0).
//   bloom, exposure, vig, grain   post: 0.32, 0.72, 0.28, 0.035.
//   haze                 multiplies the skyline's per-layer haze density (3.5; the site runs 1).
//   birds, bird          the flock's size (130) and the birds' colour (#ece7dc).
//   dpr, w, h            render density, and a forced render size for stills.
//   fps, t, still=1, hud=1, sun=0   frame cap (60), start time, one frame and stop, readout, no sun.
// window.plate = { ready, P, render(t), stats(), capture(), scene, camera, renderer, desk, flock } for a capture script.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DEG, PAL, EYE, SUN, col, addSky, addLayers, updateLayers, loadSkyline, skyState, updateBeacon, SKY_U } from './sky.js';
import { buildDesk } from './desk.js';
import { createFlock } from './birds.js';

const QS = new URLSearchParams(location.search);
const num = (k, d) => { const v = parseFloat(QS.get(k)); return isFinite(v) ? v : d; };
const SCENE = (QS.get('scene') || 'room').toLowerCase();
const KIND = SCENE === 'sky' ? 'sky' : SCENE === 'desk' ? 'desk' : 'room';
// the motion is a parallax dolly, not a pan: the eye travels a little across the window so the near city slides against the far one
const DEFAULTS = KIND === 'desk' ? { fov: 38, pitch: -11, parallax: 0.22 }
  : KIND === 'room' ? { fov: 38, pitch: -5, parallax: 0.20 }   // the window and the city, aimed a little higher than the desk's seat
  : { fov: 40, pitch: -5.5, parallax: 0.30 };
const P = {
  kind: KIND,
  fov: num('fov', DEFAULTS.fov), yaw: num('yaw', 0), pitch: num('pitch', DEFAULTS.pitch),
  pan: Math.max(0, num('pan', num('drift', 0))), panTime: Math.max(10, num('panTime', num('driftTime', 82))),   // 82 not 90: the dolly runs 10% faster than it first did
  parallax: Math.max(0, num('parallax', DEFAULTS.parallax)),   // metres the eye dollies across the window: 0 is still
  back: num('back', 0.3),                                       // metres the eye sits back from the site's seat (0 = the seat)
  screen: QS.get('screen') || '#050506', screenLight: Math.max(0, num('screenlight', 1.2)),
  haze: Math.max(0, num('haze', 3.5)),   // multiplies the skyline's per-layer haze density
  birds: Math.max(0, Math.round(num('birds', 130))),   // the flock over the city; 0 is none
  birdTone: QS.get('bird') || '#ece7dc',                 // the birds' colour: cockatoo white by default (was a dark silhouette)
  glass: Math.max(0, num('glass', 1)),   // how much window is on the pane: tint, sheen, smudges, dust (0 = clean)
  dirty: Math.max(0, Math.min(100, num('dirty', 50))) / 100,   // 0..100: how dirty the pane is (50 = as drawn)
  flareRaw: Math.max(0, Math.min(100, num('flare', 40))),       // 0..100: the lens flare's strength
  flare: 0, bar: Math.min(0.5, Math.max(0, num('bar', 0))),
  bloom: Math.max(0, num('bloom', 0.32)), exposure: Math.max(0.01, num('exposure', 0.72)),
  vig: Math.min(1, Math.max(0, num('vig', 0.28))), grain: Math.max(0, num('grain', 0.035)),
  dpr: Math.max(0.25, num('dpr', Math.min(window.devicePixelRatio || 1, 2))),
  w: Math.round(num('w', 0)), h: Math.round(num('h', 0)),
  fps: Math.max(0, num('fps', 60)), t0: Math.max(0, num('t', 0)),
  hfovMax: num('hfovmax', 68),   // sky only: the widest horizontal view that keeps the diorama's own left and right edges off the frame
  still: QS.get('still') === '1', hud: QS.get('hud') === '1', sun: QS.get('sun') !== '0'
};
P.flare = P.flareRaw / 100;   // the URL speaks 0..100
// the sweep is motion: a visitor who asked for less gets a still frame (an explicit ?pan still wins)
if (!QS.has('pan') && !QS.has('drift') && !QS.has('parallax') && matchMedia('(prefers-reduced-motion: reduce)').matches) { P.pan = 0; P.parallax = 0; }

// ---------- Renderer ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: P.still });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = P.exposure;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFShadowMap;
// the window pane is a transmissive material: three renders the scene a second time for it, at half resolution by default, which softens
// the whole view out of the window. Full resolution keeps the city crisp and lets the pane's roughness map be the only blur.
if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(P.fov, 1, 0.02, 300);
camera.rotation.order = 'YXZ';
camera.position.copy(EYE);

addSky(scene);
addLayers(scene);

// ---------- Post (index.html 2889-2976): Render -> Bloom -> Output (ACES) -> Grade + flare + grain + vignette ----------
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uLift: { value: new THREE.Vector3() }, uShadow: { value: new THREE.Vector3() }, uHigh: { value: new THREE.Vector3() },
    uGrade: { value: 1 }, uGrain: { value: P.grain }, uVig: { value: P.vig },
    uSun: { value: new THREE.Vector2(0.5, 0.5) }, uFlare: { value: 0 }, uAspect: { value: 1.6 }, uBar: { value: P.bar }
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform float uTime, uGrade, uGrain, uVig, uFlare, uAspect, uBar; uniform vec2 uRes, uSun; uniform vec3 uLift, uShadow, uHigh; varying vec2 vUv;',
    // the anamorphic flare: the sun's streak (period blue), a pale core, a soft sheath, a warm glow, a second streak, ghosts, a red dot, a bar
    // A lens flare, built the way a lens makes one rather than drawn as a shape:
    //   - veiling glare: light scattered off the barrel and the coatings, a broad low-frequency lift that is strongest nearest the
    //     sun (this, not the ghosts, is what mostly reads as "camera"),
    //   - halation and a clipping core around the disc,
    //   - an aperture starburst: the blade edges, six of them here,
    //   - the anamorphic streak, with a hot core and a wide soft body, and a chromatic split at its ends,
    //   - the ghost train: front-to-back element reflections placed along the sun-to-centre axis at their own spacing, sizes and coating
    //     colours, mirrored through the frame centre.
    // The old one was a fixed blue streak plus three circles: no glare, no blades, no element train, no dependence on the sun's brightness.
    // A ghost is a reflection in one glass element, so it reads as a thin bright rim with a nearly clear middle — not as a disc of light.
    // Drawn as a flat disc (which it was) a big one looked like an out-of-focus blob floating in the sky.
    'void ghost(vec2 uv, vec2 axis, float k, float rad, vec3 col, float amt, inout vec3 f){',
    '  vec2 q = uv - (uSun + axis * k); q.x *= uAspect; q.y /= 1.06;   // a whisper of astigmatism, so nothing is a perfect circle',
    '  float x = length(q) / rad;',
    // Both terms are gaussian: a smoothstep rim reads as a drawn circle, a lens ghost is a soft out-of-focus disc with a blurred edge.
    '  float disc = exp(-x * x * 1.9);',
    '  float rim = exp(-pow((x - 0.80) / 0.34, 2.0));',
    '  f += col * (disc * 0.08 + rim * 0.38) * amt;',
    '}',
    'vec3 flare(vec2 uv){',
    '  vec2 d = uv - uSun; d.x *= uAspect;',
    '  float r = length(d);',
    '  float ax = abs(d.x), ay = abs(d.y);',
    '  vec2 axis = vec2(0.5) - uSun; axis.x *= uAspect;',
    '  float gfade = smoothstep(0.02, 0.10, length(axis));',      // ghosts collapse when the sun sits at the centre
    // 1: veiling glare
    '  vec3 f = vec3(1.0, 0.80, 0.62) * (0.20 * exp(-r * 2.1) + 0.075 * exp(-r * 0.62));',
    // 2: halation and the clipping core
    '  f += vec3(1.0, 0.88, 0.74) * (exp(-r * 22.0) * 1.10 + exp(-r * 6.0) * 0.35);',
    // 3: the aperture starburst (six blade edges)
    '  float ang = atan(d.y, d.x);',
    '  float blades = pow(max(0.0, cos(ang * 3.0)), 90.0);',
    '  f += vec3(1.0, 0.94, 0.86) * blades * exp(-r * 6.5) * 1.30;',
    // 4: the anamorphic streak, hot core plus body, with dispersion at the ends
    '  float body = exp(-ay * 70.0) * exp(-ax * 1.5);',
    '  float hot = exp(-ay * 900.0) * exp(-ax * 3.4);',
    '  f += vec3(0.22, 0.42, 1.0) * body * 0.62 + vec3(0.80, 0.90, 1.0) * hot * 1.35;',
    '  float split = exp(-ax * 2.6);',
    '  f += vec3(0.95, 0.28, 0.22) * exp(-abs(d.y - 0.0042) * 620.0) * split * 0.35;',
    '  f += vec3(0.25, 0.45, 1.0) * exp(-abs(d.y + 0.0042) * 620.0) * split * 0.35;',
    // 5: the element train — coating colours, sizes and spacing as they fall out of a wide zoom
    '  ghost(uv, axis, 0.55, 0.028, vec3(1.00, 0.72, 0.50), 0.34, f);',
    '  ghost(uv, axis, 0.95, 0.055, vec3(0.55, 0.85, 0.70), 0.13, f);',
    '  ghost(uv, axis, 1.30, 0.040, vec3(0.45, 0.62, 1.00), 0.16, f);',
    '  ghost(uv, axis, 1.62, 0.085, vec3(0.90, 0.55, 0.75), 0.05, f);',   // the big one that read as a floater: rim only, and light
    '  ghost(uv, axis, 1.95, 0.150, vec3(0.40, 0.55, 0.60), 0.03, f);',
    '  ghost(uv, axis, 2.35, 0.120, vec3(0.60, 0.80, 1.00), 0.025, f);',
    '  ghost(uv, axis, 2.75, 0.034, vec3(1.00, 0.30, 0.22), 0.22, f);',   // the red dot
    // the optional vertical bar (off by default)
    '  float bx = abs((uv.x - (uSun.x + axis.x * 2.3)) * uAspect);',
    '  float bar = smoothstep(0.015, 0.011, bx) * (0.55 + 0.45 * smoothstep(0.006, 0.013, bx));',
    '  f += vec3(1.0, 0.85, 0.6) * bar * (0.25 + 0.75 * exp(-ay / 0.15 * 1.6)) * uBar * gfade;',
    '  return f * gfade;',
    '}',
    'float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'void main(){',
    '  vec2 c = vUv - 0.5; float r2 = dot(c, c);',
    '  vec3 col = texture2D(tDiffuse, vUv).rgb;',
    '  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(col, col * uShadow, (1.0 - smoothstep(0.0, 0.42, l)) * uGrade);',
    '  col = mix(col, col * uHigh, smoothstep(0.45, 1.0, l) * uGrade);',
    '  col = uLift * uGrade + col * (1.0 - uLift * uGrade);',
    '  col *= 1.0 - uVig * smoothstep(0.08, 0.5, r2);',
    '  if (uFlare > 0.001) col += flare(vUv) * uFlare;',
    '  float n = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 311.0) - 0.5;',
    '  col += n * uGrain * (0.55 + 0.45 * (1.0 - l));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n')
};
{
  const toV = (c, k) => { const m = Math.max(c.r, c.g, c.b); return new THREE.Vector3(1 + (c.r / m - 1) * k, 1 + (c.g / m - 1) * k, 1 + (c.b / m - 1) * k); };
  const lift = new THREE.Color(); lift.setStyle(PAL.plumBlack, THREE.LinearSRGBColorSpace);
  FinalShader.uniforms.uLift.value.set(lift.r, lift.g, lift.b).multiplyScalar(0.9);
  FinalShader.uniforms.uShadow.value.copy(toV(new THREE.Color().setStyle(PAL.duskTop, THREE.LinearSRGBColorSpace), 0.28));
  FinalShader.uniforms.uHigh.value.copy(toV(new THREE.Color().setStyle(PAL.meadCream, THREE.LinearSRGBColorSpace), 0.6));
}
const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(P.dpr);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), P.bloom, 0.3, 1.15);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass(FinalShader);
composer.addPass(finalPass);

// ---------- Size ----------
// desk: the site's fitCamera (index.html 3026) — 60 degrees across on landscape, never under 38 down; sky: the requested field, capped so
// a screen wider than 16:9 does not bring the diorama's side edges into frame.
function fovFor(aspect){
  if (P.kind !== 'sky') {
    const hfovMin = aspect >= 1 ? 60 : 39;
    return Math.min(80, Math.max(38, 2 * Math.atan(Math.tan(hfovMin * DEG / 2) / aspect) / DEG));
  }
  return Math.min(P.fov, 2 * Math.atan(Math.tan(P.hfovMax * DEG / 2) / aspect) / DEG);
}
function size(){
  const w = Math.max(1, P.w || window.innerWidth), h = Math.max(1, P.h || window.innerHeight);
  camera.aspect = w / h; camera.fov = P.kind !== 'sky' && QS.has('fov') ? P.fov : fovFor(camera.aspect); camera.updateProjectionMatrix();
  renderer.setPixelRatio(P.dpr); renderer.setSize(w, h, !P.w && !P.h);
  composer.setPixelRatio(P.dpr); composer.setSize(w, h);
  finalPass.uniforms.uAspect.value = camera.aspect;
  finalPass.uniforms.uRes.value.set(w, h);
}
size();
window.addEventListener('resize', size);

// ---------- The look: the site's seated view, plus the slow sweep ----------
const look = { yaw: 0, pitch: 0 };
function placeCamera(t){
  // Parallax: the eye dollies sideways (and a little up and down) instead of turning, so the near city slides against the far shore.
  // The layers stay where they are: their depth does the work, and the old per-layer fake (rotating each layer by a share of the look,
  // k in updateLayers) would double it. ?pan= still turns the head and can be added on top.
  const w = (P.parallax || P.pan) ? 2 * Math.PI / P.panTime : 0;
  const ph = t * w;
  const shift = P.parallax * Math.sin(ph);                       // metres, laterally
  const bob = P.parallax * 0.16 * Math.sin(ph * 0.73 + 1.1);     // and a whisper vertically
  const turn = P.pan ? P.pan * Math.sin(ph) : 0;
  // keep the far skyline where it is: the counter-turn is the dolly's own angle at the midground's distance (~40 m), so the near city
  // moves, the far shore barely does, and the frame does not slide off its subject
  const counter = -Math.atan2(shift, 40) / DEG;
  // sky only: when the field narrows on a wide screen, lift the aim by what it took away, so the top of the frame stays put
  const lift = P.kind === 'sky' ? (P.fov - camera.fov) / 2 : 0;
  look.yaw = (P.yaw + turn + counter) * DEG;
  look.pitch = (P.pitch + lift + (P.pan ? P.pan * 0.28 * Math.sin(ph * 0.73 + 1.1) : 0)) * DEG;
  updateLayers(P.parallax ? 0 : look.yaw, P.parallax ? 0 : look.pitch);
  camera.position.set(EYE.x + shift, EYE.y + bob, EYE.z + P.back);
  camera.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));
  camera.updateMatrixWorld(true);
}


// ---------- The sun's flare (index.html 3254-3284): where the sun is on screen; nothing here occludes it ----------
const sunP = new THREE.Vector3(), sunNdc = new THREE.Vector3();
function updateSun(){
  sunP.copy(camera.position).addScaledVector(SUN.dir, 100);
  sunNdc.copy(sunP).project(camera);
  const front = sunNdc.z < 1, m = Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y));
  const edge = front ? 1 - THREE.MathUtils.smoothstep(m, 0.85, 1.2) : 0;
  const centre = 1 - 0.5 * THREE.MathUtils.smoothstep(Math.hypot(sunNdc.x, sunNdc.y), 0.0, 1.1);
  const shot = P.kind === 'desk' ? 0.5 : 1.0;   // the site's seated shot runs the flare at half
  finalPass.uniforms.uSun.value.set(sunNdc.x * 0.5 + 0.5, sunNdc.y * 0.5 + 0.5);
  finalPass.uniforms.uFlare.value = P.sun ? P.flare * shot * edge * centre : 0;
  finalPass.uniforms.uAspect.value = camera.aspect;
}

// ---------- Build ----------
const desk = P.kind === 'sky' ? Promise.resolve(null)
  : buildDesk(scene, renderer, { screen: P.screen, screenLight: P.screenLight, glass: P.glass, dirty: P.dirty, items: P.kind === 'desk' });
const ready = Promise.all([desk, loadSkyline(P.dpr, P.haze),
  P.birds ? createFlock(scene, { count: P.birds, haze: P.haze, tone: P.birdTone }).then(f => (flock = f)) : null]).then(([d]) => {
  window.plate.desk = d;
  glassMats = d && d.glassMats;
  window.plate.flock = flock;
  document.documentElement.dataset.ready = '1';
  return d;
});

// ---------- The loop ----------
// ---------- The flock (a rigged bird per boid; it loads with the scene) ----------
let flock = null, glassMats = null;

const start = performance.now() - P.t0 * 1000;
const budget = P.fps ? 1000 / P.fps : 0;
let last = 0, frames = 0, msAcc = 0, msN = 0;
function render(t){
  skyState.time.value = t;
  updateBeacon(t);
  finalPass.uniforms.uTime.value = t;
  for (const m of skyState.mats) if (m.uniforms.uPx) m.uniforms.uPx.value = P.dpr;
  placeCamera(t);
  if (glassMats) for (const m of glassMats) m.uniforms.uEye.value.copy(camera.position);   // the pane's view angle follows the eye
  if (flock) flock.update(t);
  updateSun();
  composer.render();
  frames++;
}
function loop(now){
  requestAnimationFrame(loop);
  if (budget && now - last < budget) return;
  last = now;
  const a = performance.now();
  render((performance.now() - start) / 1000);
  msAcc += performance.now() - a; msN++;
  if (P.hud && msN >= 12) {
    document.getElementById('hud').textContent = frames + 'f  ' + (msAcc / msN).toFixed(1) + 'ms  ' +
      renderer.domElement.width + 'x' + renderer.domElement.height + '  fov ' + camera.fov.toFixed(1);
    msAcc = 0; msN = 0;
  }
}
// a model that fails to load must not leave the projector on a black veil for ever
ready.catch(e => {
  console.error('plate: the scene did not build', e);
  document.documentElement.dataset.failed = '1';
  document.getElementById('veil').style.display = 'none';
});
ready.then(d => {
  canvas.dataset.loaded = '1';
  if (P.still) { document.getElementById('veil').style.display = 'none'; render(P.t0); return; }
  if (P.hud) document.getElementById('hud').hidden = false;
  requestAnimationFrame(loop);
});
// a still draw of a given time, for a capture script: plate.render(seconds)
window.plate = {
  ready, P, scene, camera, renderer, desk: null, flock,
  render: t => { render(t); return { w: renderer.domElement.width, h: renderer.domElement.height }; },
  stats: () => ({ kind: P.kind, w: renderer.domElement.width, h: renderer.domElement.height, fov: camera.fov, layers: Object.keys(skyState.roots).length, frames, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  capture: () => { render(performance.now() / 1000); return renderer.domElement.toDataURL('image/png'); }
};
