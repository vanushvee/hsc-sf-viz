// plate/sky.js v1.1.0 (15 Nov 2026): the window's outside — the dusk sky shader, the sun, and the three skyline layers.
// Lifted from the desk's build3D in index.html (SKY_U/SKY_GLSL 2528-2556, SKY3D/skyMaterial/placeSkyline 2610-2726) so the picture is
// the site's, not an approximation. addSky() builds the sky sphere; loadSkyline() fetches the three meshopt glTF layers and places them
// in their parallax groups; updateLayers() turns those groups by their share of the look.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const DEG = Math.PI / 180;
export const PAL = {
  plumBlack: '#13090d', duskTop: '#6a5688', duskMid: '#b58070', duskHorizon: '#7b4335', meadAmber: '#cd8a38', meadCream: '#eadfc3'
};
export const col = h => new THREE.Color(h);

// EYE (index.html 1455): 115 cm above the floor, 35 cm above the desktop; the sky and the city are all seen from here
export const EYE = new THREE.Vector3(0, 1.15, 0);
export const DESK_Y = 0.80;

// The sun (index.html 1459): low over the Marin hills toward the Golden Gate; the ridge cuts its disc through the middle
export const SUN = { az: -18, el: 0.72, radius: 0.62 };
SUN.dir = new THREE.Vector3(Math.sin(SUN.az * DEG) * Math.cos(SUN.el * DEG), Math.sin(SUN.el * DEG), -Math.cos(SUN.az * DEG) * Math.cos(SUN.el * DEG)).normalize();

// ---------- The sky (index.html 2528-2556, verbatim) ----------
export const SKY_U = {
  cTop: { value: col(PAL.duskTop) }, cMid: { value: col(PAL.duskMid) }, cHor: { value: col(PAL.duskHorizon) },
  cGlow: { value: col(PAL.meadAmber) }, cLow: { value: col('#2a1620') }, uExp: { value: 0.95 },
  uSunDir: { value: SUN.dir.clone() }, uSunR: { value: SUN.radius }, uSunOn: { value: 1 }
};
export const SKY_GLSL = [
  'uniform vec3 cTop, cMid, cHor, cGlow, cLow, uSunDir; uniform float uExp, uSunR, uSunOn;',
  'vec3 skyGrad(vec3 d){',
  '  float el = degrees(asin(clamp(d.y, -1.0, 1.0))); float az = degrees(atan(d.x, -d.z));',
  '  float side = smoothstep(40.0, -50.0, az);',                        // the warm side is left, toward the Golden Gate
  '  vec3 c = mix(cHor, cMid, smoothstep(-1.0, 4.5, el));',
  '  c = mix(c, cTop, smoothstep(2.0, 12.0 + 8.0 * side, el));',
  '  float band = exp(-pow((el - 0.8) / (2.4 + 2.5 * side), 2.0));',
  '  return c + cGlow * band * (0.18 + 0.85 * side);',
  '}',
  'vec3 skyCol(vec3 d){ return skyGrad(d) * 0.6; }',                  // the skyline's per-layer haze colour
  'vec3 skyFull(vec3 d){',
  '  float el = degrees(asin(clamp(d.y, -1.0, 1.0)));',
  '  vec3 c = mix(skyGrad(d), cLow, smoothstep(-0.5, -9.0, el));',
  // the setting sun: soft limb, hot core, a haze halo; its lower part sinks into the horizon haze
  '  float ang = degrees(acos(clamp(dot(d, uSunDir), -1.0, 1.0)));',
  '  float disc = 1.0 - smoothstep(uSunR * 0.72, uSunR * 1.08, ang);',
  '  float core = exp(-pow(ang / (uSunR * 0.55), 2.0));',
  '  float halo = 0.42 * exp(-ang / 1.6) + 0.16 * exp(-ang / 7.5);',
  '  float sink = smoothstep(-0.1, 1.5, el);',
  '  c += (vec3(2.7, 1.3, 0.58) * disc * (0.55 + 0.75 * core) * mix(0.42, 1.0, sink) + vec3(1.0, 0.56, 0.3) * halo * mix(0.6, 1.0, sink)) * uSunOn;',
  '  return c * uExp;',
  '}'
].join('\n');

export function addSky(scene){
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: SKY_U,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: [SKY_GLSL, 'varying vec3 vDir;', 'void main(){', '  gl_FragColor = vec4(skyFull(normalize(vDir)), 1.0);', '  #include <tonemapping_fragment>', '  #include <colorspace_fragment>', '}'].join('\n')
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; sky.position.copy(EYE);
  scene.add(sky);
  return sky;
}

// ---------- The three layers (index.html 2565): each an empty at EYE that turns by its own share of the look ----------
export const LAYERS = [{ id: 'background', k: 0.01 }, { id: 'midground', k: 0.05 }, { id: 'foreground', k: 0.06 }];
export const layerGroups = [];
export function addLayers(scene){
  for (const L of LAYERS) {
    const grp = new THREE.Group(); grp.position.copy(EYE); grp.userData.layer = L; grp.name = 'layer:' + L.id;
    scene.add(grp); layerGroups.push(grp); L.group = grp;
  }
}
export function updateLayers(yaw, pitch){
  for (const g of layerGroups) { const k = g.userData.layer.k; g.rotation.set(-k * pitch, -k * yaw, 0); g.updateMatrix(); }
}

// ---------- The 3D skyline (index.html 2610-2726): per-layer haze by distance, windows emissive, the bay's ripples, beacons ----------
const SKY3D = {
  'skyline-fg': { layer: 'foreground', dens: 0.004, emi: 1.6, amb: 0.58 },   // crisp: 3.8 to 10 units away, about 2 to 4 % haze
  'skyline-mg': { layer: 'midground',  dens: 0.014, emi: 1.4, amb: 0.53 },   // the low city out to 54 units: up to half haze
  'skyline-bg': { layer: 'background', dens: 0.009, emi: 1.3, amb: 0.52 }    // Marin and the far shore at 100+ units: mostly haze
};
export const skyState = { roots: {}, mats: [], time: { value: 0 }, beacon: { value: 0 }, laser: { value: 0 }, laserTime: { value: 0 } };

// ---------- The laser off the Pyramid's spire ----------
// A laser beam is not a volumetric shaft: on camera it is a very thin, very hot core, a narrow halo of scatter round it, and almost nothing
// else. So: two nested additive cylinders — a core and a glow — with the brightness falling off toward the tube's silhouette (the middle of
// a tube, seen from the side, is the surface facing you), fading along its length, and pushed well over 1.0 so the bloom chain does the rest.
// The usual alternative is a cylindrically billboarded quad (the "volumetric beam" shaders); a cylinder is right here because this beam is
// meant to be a hard, coherent line, not a soft shaft of light.
const LASER_DIR = new THREE.Vector3(-0.52, 0.80, -0.30).normalize();   // up and away over the bay, so it crosses the sky
const LASER_LEN = 160;
function beamMaterial(core){
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color('#63ffa8') },
      uGain: { value: core ? 9.0 : 1.15 },       // over 1.0 on purpose: bloom picks the core up
      uSharp: { value: core ? 7.0 : 2.2 },       // how tight the tube's radial falloff is
      uLen: { value: LASER_LEN },
      uLaser: skyState.laser, uTime: skyState.laserTime
    },
    vertexShader: [
      'varying vec3 vN, vW; varying vec2 vUv;',
      'void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);',
      '  gl_Position = projectionMatrix * viewMatrix * w; }'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColor; uniform float uGain, uSharp, uLen, uLaser, uTime;',
      'varying vec3 vN, vW; varying vec2 vUv;',
      'void main(){',
      '  if (uLaser <= 0.001) discard;',
      '  vec3 v = normalize(cameraPosition - vW);',
      // radial: 1 looking straight down the tube, 0 at its silhouette, so the beam reads solid in the middle and melts at the edges
      '  float radial = pow(abs(dot(normalize(vN), v)), uSharp);',
      // along: quick loss out of the emitter, then a long tail that dies before the tip
      '  float along = vUv.y;',
      '  float fade = exp(-along * 1.45) * smoothstep(1.0, 0.82, along);',
      '  float out0 = smoothstep(0.0, 0.004, along);',                       // no hard disc where it leaves the spire
      // a little life: a fast flicker and a slow shimmer down the beam, both tiny
      '  float flick = 0.94 + 0.06 * sin(uTime * 41.0) + 0.03 * sin(uTime * 7.1 + along * 9.0);',
      '  float c = radial * fade * out0 * flick * uGain * uLaser;',
      '  gl_FragColor = vec4(uColor * c, c);',
      '}'
    ].join('\n')
  });
}
function addLaser(){
  const fg = LAYERS.find(l => l.id === 'foreground').group, root = skyState.roots['skyline-fg'];
  if (!fg || !root) return;
  let spire = null;
  root.traverse(o => { if (!spire && /pyramid_spire/.test(o.name)) spire = o; });
  if (!spire) return;
  root.updateMatrixWorld(true);
  const at = fg.worldToLocal(new THREE.Vector3().setFromMatrixPosition(spire.matrixWorld));
  const beam = new THREE.Group();
  beam.position.copy(at);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), LASER_DIR.clone());
  for (const [r, core] of [[0.013, true], [0.085, false]]) {
    const g = new THREE.CylinderGeometry(r, r * 1.35, LASER_LEN, 12, 1, true);
    g.translate(0, LASER_LEN / 2, 0);                                     // base at the emitter
    const m = new THREE.Mesh(g, beamMaterial(core));
    m.frustumCulled = false; m.renderOrder = -8.2; m.name = 'laser';
    beam.add(m);
  }
  beam.name = 'laser-beam'; beam.visible = false;
  fg.add(beam);
  skyState.beam = beam;
}


// The Pyramid's beacon: one flash every 10 to 15 seconds, the gap drawn uniformly and never the same twice. A quick rise (0.10 s) into a
// hot core, then a slower fall (about 1.1 s), so it reads as a flare rather than a switch. The gaps come from a hashed cycle index, so the
// sequence is random but a still at ?t=42 always catches the same phase.
const frac = x => x - Math.floor(x);
const gapAt = i => 10 + 5 * frac(Math.sin(i * 12.9898 + 78.233) * 43758.5453);   // uniform in [10, 15)
let gapCache = [], gapSum = 0;
function cycleAt(t){
  // the cycle index for t, extending the running sum as the clock moves forward (a still fast-forwards through it once)
  while (gapSum <= t) { gapCache.push(gapAt(gapCache.length)); gapSum += gapCache[gapCache.length - 1]; }
  let acc = 0;
  for (let i = 0; i < gapCache.length; i++) { if (t < acc + gapCache[i]) return [i, t - acc]; acc += gapCache[i]; }
  return [0, 0];
}
export function updateBeacon(t){
  const [, u] = cycleAt(t);
  skyState.beacon.value = u < 0.10 ? u / 0.10 : Math.exp(-(u - 0.10) / 1.1);
}

function skyMaterial(src, cfg, water, hasUv, haze){
  haze = haze === undefined ? 1 : haze;
  const hasMap = !!(src.map && !water);
  const defines = {}; if (hasMap) defines.HAS_MAP = ''; if (water && hasUv) defines.WATER_UV = '';
  return new THREE.ShaderMaterial({
    defines,
    uniforms: Object.assign({}, SKY_U, {
      map: { value: hasMap ? src.map : null }, emiMap: { value: hasMap ? (src.emissiveMap || src.map) : null }, uHasEmi: { value: src.emissiveMap ? 1 : 0 },
      uBase: { value: (src.color || new THREE.Color(1, 1, 1)).clone() }, uAmb: { value: new THREE.Color(0.38, 0.3, 0.35).multiplyScalar(cfg.amb) },
      uEye: { value: EYE.clone() }, uDens: { value: (water ? cfg.dens * 0.45 : cfg.dens) * haze }, uEmi: { value: cfg.emi }, uWater: { value: water ? 1 : 0 },
      uTime: skyState.time
    }),
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){\n#if defined(HAS_MAP) || defined(WATER_UV)\n vUv = uv;\n#else\n vUv = vec2(0.0);\n#endif\n vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: [
      SKY_GLSL,
      'uniform sampler2D map, emiMap; uniform vec3 uBase, uAmb, uEye; uniform float uDens, uEmi, uWater, uHasEmi, uTime; varying vec2 vUv; varying vec3 vW;',
      // value noise for the water's ripples (no texture file)
      'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
      'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
      'void main(){',
      '  vec3 dv = vW - uEye; float dist = length(dv); vec3 d = dv / dist;',
      '#ifdef HAS_MAP',
      '  vec3 alb = texture2D(map, vUv).rgb * uBase; vec3 emi = uHasEmi > 0.5 ? texture2D(emiMap, vUv).rgb : vec3(0.0);',
      '#else',
      '  vec3 alb = uBase; vec3 emi = vec3(0.0);',
      '#endif',
      '  vec3 fogC = skyCol(normalize(vec3(d.x, max(d.y, 0.009), d.z)));',
      '  float f = 1.0 - exp(-dist * uDens);',
      '  vec3 c = mix(alb * uAmb, fogC, f) + emi * uEmi * (1.0 - 0.72 * f);',
      // the bay: deep cool blue-violet on the right, warmer and washed out toward the sunset on the left, a sun glint low on the left
      '  if (uWater > 0.5) {',
      '    float el = degrees(asin(clamp(d.y, -1.0, 1.0))); float az = degrees(atan(d.x, -d.z));',
      '    vec3 hz = skyCol(normalize(vec3(d.x, 0.012, d.z)));',
      '    const vec3 LUM = vec3(0.299, 0.587, 0.114);',
      '#ifdef WATER_UV',
      '    float t = smoothstep(0.02, 0.94, vUv.x); float far = smoothstep(0.16, 0.97, vUv.y);',
      '#else',
      '    float t = smoothstep(-30.0, 28.0, az); float far = smoothstep(15.0, 160.0, dist);',
      '#endif',
      '    vec3 deep = vec3(0.024, 0.021, 0.044);',
      '    vec3 washed = mix(vec3(dot(hz, LUM)), hz, 0.55) * 0.82;',
      '    vec3 w = mix(washed, deep, t);',
      '    w = mix(w, mix(vec3(dot(w, LUM)), w, 0.4) * 1.32 + hz * 0.07, far * 0.75);',
      '    vec2 Pp = vW.xz;',
      // The ripples drift at 0.05 world units a second in the site's shader, which at 90 to 180 metres is under one noise cell per ten
      // seconds — on the plate the bay read as frozen, because it is also about 70 % hazed out at that distance. Six times faster, coarser
      // and less damped with distance, so the bay visibly moves.
      // The water is 100 to 180 metres away here: a two-metre swell is under a pixel and aliases into noise, which is why the bay looked
      // frozen however fast the noise drifted. These are tens of metres across, so the bands actually land on screen.
      '    float r1 = vnoise(Pp * vec2(0.032, 0.070) + vec2(uTime * 6.00, uTime * 3.20));',
      '    float r2 = vnoise(Pp * vec2(0.085, 0.175) - vec2(uTime * 9.00, uTime * 4.60));',
      '    float rip = (r1 * 0.65 + r2 * 0.35) - 0.5;',
      '    float calm = mix(1.0, 0.62, far);',
      '    w *= 1.0 + rip * 0.95 * calm;',
      '    float glint = exp(-pow((az + 18.0) / 14.0, 2.0)) * exp(-pow((el + 0.8) / 0.8, 2.0)) * (1.0 - t);',
      '    float sparkle = smoothstep(0.46, 0.84, r1 * 0.5 + r2 * 0.5 + 0.12 * calm);',
      // The visible bay at this distance is the *dark* side of the water, where a percentage modulation of near-black cannot be seen: what
      // moves on screen is the lit band along the shore. So the glint and its sparkle breathe, on the same drifting noise.
      '    float shimmer = 0.35 + 1.00 * vnoise(vec2(Pp.x * 0.035 + uTime * 5.4, Pp.y * 0.035 - uTime * 2.4));',
            // A percentage modulation of near-black is invisible, and most of the bay we see here is the deep side. What a real bay does at dusk is
      // put moving glints on that dark water — city light and sky, broken up by the swell — so add them, on the same drifting noise.
      '    float deepGlints = smoothstep(0.70, 0.93, r2 * 0.65 + r1 * 0.35) * (0.35 + 0.65 * t);',
      '    c = w + hz * glint * (0.45 + 2.1 * sparkle) * shimmer + hz * deepGlints * 0.55;',
      '  }',
      '  gl_FragColor = vec4(c, 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}'
    ].join('\n')
  });
}
const LIGHT_COL = name => /tower|spire/.test(name) ? [2.6, 0.55, 0.4] : /deck/.test(name) ? [2.4, 1.5, 0.6] : /lighthouse/.test(name) ? [2.6, 2.4, 2.0] : [2.2, 1.5, 0.8];

function placeSkyline(name, gltf, dpr, haze){
  const cfg = SKY3D[name], L = LAYERS.find(l => l.id === cfg.layer), root = gltf.scene;
  const lights = [];
  root.traverse(o => {
    if (o.isMesh) {
      const water = /water/.test(o.name) || /water/.test(o.material.name || '');
      o.material = skyMaterial(o.material, cfg, water, !!o.geometry.getAttribute('uv'), haze); o.castShadow = o.receiveShadow = false; o.renderOrder = -9; skyState.mats.push(o.material);
    } else if (/^light_/.test(o.name)) lights.push(o);
  });
  root.updateMatrixWorld(true);
  if (lights.length) {   // point sprites at the light_* empties: one draw call per layer
    const pos = new Float32Array(lights.length * 3), colr = new Float32Array(lights.length * 3), size = new Float32Array(lights.length), blink = new Float32Array(lights.length);
    const inv = root.matrixWorld.clone().invert();
    lights.forEach((o, i) => {
      const p = o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv); pos.set([p.x, p.y, p.z], i * 3); colr.set(LIGHT_COL(o.name), i * 3);
      size[i] = /coit/.test(o.name) ? 7 : (/deck/.test(o.name) ? 3.5 : 4.5);
      // the Pyramid's red beacon: the one light that blinks (and flares) on a 30 to 60 second cycle
      blink[i] = /pyramid_spire/.test(o.name) ? 1 : 0;
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('lcol', new THREE.BufferAttribute(colr, 3)); g.setAttribute('lsize', new THREE.BufferAttribute(size, 1)); g.setAttribute('lblink', new THREE.BufferAttribute(blink, 1));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uPx: { value: dpr }, uBlink: skyState.beacon },
      vertexShader: [
        'attribute vec3 lcol; attribute float lsize; attribute float lblink; uniform float uPx; uniform float uBlink; varying vec3 vC;',
        'void main(){',
        '  float b = lblink * uBlink;',
        // the flash: brighter than the lamp and wider, so the bloom picks it up as a flare
        '  vC = lcol * mix(1.0, 16.0, b);',
        '  gl_PointSize = lsize * uPx * mix(1.0, 3.2, b);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: 'varying vec3 vC; void main(){ float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vC * a, a); }'
    }));
    pts.renderOrder = -8; pts.frustumCulled = false; pts.userData.skyLights = true; root.add(pts);
  }
  root.visible = true; root.name = 'sky3d:' + cfg.layer;
  L.group.add(root); skyState.roots[name] = root;
}

export async function loadSkyline(dpr, haze){
  haze = haze === undefined ? 1 : Math.max(0, haze);
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(Object.keys(SKY3D).map(name => loader.loadAsync('./models/' + name + '.glb').then(g => placeSkyline(name, g, dpr, haze))));
  addLaser();
}
