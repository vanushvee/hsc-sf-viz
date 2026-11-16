// plate/glass.js v3.0.0 (15 Nov 2026): the window pane — a reflection, not a filter.
//
// The physically complete way to do glass in three.js is MeshPhysicalMaterial with transmission, and it was tried here: it renders the
// scene a second time into a transmission target at reduced resolution, which softened the whole city behind the pane and would not respond
// to the roughness map, and it costs a full extra pass on a page that has to run for hours on a projector. Worse, for a window you look
// *out* of, transmission is the wrong half of the physics: what makes a window read as a window is the reflection on it, and the view
// through it staying crisp.
//
// So this is the architecture-viewport glass: the pane is a thin transparent surface that adds
//   - the room reflected in it (a small equirectangular interior, sampled with reflect(-viewDir, normal), so the reflection slides across
//     the pane and changes with the look, as a real one does),
//   - Fresnel: almost nothing face-on, strong at the grazing edges of the frame,
//   - the pane's own faint tint and a thicker colour at its edges,
//   - smudges, cleaning streaks, a few dry water marks and dust, which sit in the pane's UV and scatter a little light.
// It is one transparent draw and no re-render, and what is behind it stays as sharp as the render.
import * as THREE from 'three';

// The interior the pane reflects: a dark room with the desk lamp's warm pool low and to one side, a dim window-frame bar, and a faint
// cool wall. Equirectangular (u = azimuth, v = elevation), sampled by direction — a texture, not a PMREM, because a flat pane only needs
// one sharp lookup.
function interiorEquirect(){
  const W = 512, H = 256, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0709'); grad.addColorStop(0.55, '#150e12'); grad.addColorStop(1, '#1d1418');
  x.fillStyle = grad; x.fillRect(0, 0, W, H);
  // the lamp: a warm core with a soft halo, low in the room
  const lamp = (cx, cy, r, core) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, core); g.addColorStop(0.35, 'rgba(255,176,112,0.30)'); g.addColorStop(1, 'rgba(255,140,80,0)');
    x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  lamp(W * 0.31, H * 0.60, 64, 'rgba(255,236,208,1.0)');
  lamp(W * 0.78, H * 0.68, 38, 'rgba(225,190,170,0.45)');
  // a strip of ceiling light, the brightest thing a pane at this height would catch
  const strip = x.createLinearGradient(0, H * 0.10, 0, H * 0.22);
  strip.addColorStop(0, 'rgba(255,226,196,0)'); strip.addColorStop(0.5, 'rgba(255,226,196,0.55)'); strip.addColorStop(1, 'rgba(255,226,196,0)');
  x.fillStyle = strip; x.fillRect(W * 0.12, H * 0.10, W * 0.5, H * 0.12);
  // the window frame and a mullion behind the viewer: dark uprights in the reflection
  x.fillStyle = 'rgba(6,4,6,0.85)';
  x.fillRect(W * 0.44, 0, 10, H);
  x.fillRect(W * 0.47, 0, 3, H);
  // a faint warm floor line, so the reflection has a horizon to catch
  x.fillStyle = 'rgba(120,70,48,0.14)';
  x.fillRect(0, H * 0.74, W, 6);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  return t;
}

// The pane's surface: mostly clean, with soft smudges, cleaning streaks, dry water marks and a little dust.
// Every layer here is periodic over the 512 px tile (the noise grid is 256² and every frequency divides it), because the map is sampled in
// world space and repeats: a frequency that does not divide the tile draws a hard line across the glass at every repeat.
function smudgeMap(){
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  let seed = 1337;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const grid = new Float32Array(65536);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (x, y) => grid[((y & 255) * 256 + (x & 255))];
  // value noise over the grid; x, y are already in grid cells, so the tile repeats every 256 cells
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const bot = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return top + (bot - top) * sy;
  };
  // fbm whose octaves are 2, 4, 8 and 16 cells across the tile: all divide 256, so the tile matches edge to edge
  const fbm = (px, y) => 0.5 * noise(px / 128, y / 128) + 0.25 * noise(px / 64, y / 64) + 0.15 * noise(px / 32, y / 32) + 0.10 * noise(px / 16, y / 16);
  for (let y = 0; y < S; y++) for (let px = 0; px < S; px++) {
    const v = y / S;
    const sm = fbm(px, y);
    // cleaning streaks: stretched in y, but their x period still divides the tile
    // cleaning marks: stretched along x, but only 3 to 6:1, or the pane reads as fog bands rather than as a wiped surface
    const streak = 0.5 * noise(px / 26, y / 8) + 0.5 * noise(px / 46, y / 14);
    let r = 0.05 + 0.55 * Math.max(0, sm - 0.46) * 2.0 + 0.24 * Math.max(0, streak - 0.48) * 1.8;
    r += 0.5 * Math.max(0, fbm(px * 2, y * 2) - 0.64) * 2.2;                    // dry water marks
    r *= 0.55 + 0.55 * (1 - v);
    // fine mottle, not dust specks: the map is stretched over the whole glazing, so a single bright texel is a centimetre-wide dot
    // that reads as a stray light rather than as dust. Real dust at this scale is a grain, so it stays a low-amplitude high-frequency layer.
    r += 0.085 * noise(px / 2, y / 2);
    const g = Math.max(0, Math.min(255, r * 215));
    const i = (y * S + px) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;   // one tile across the glazing: no repeats, so no repeat seams
  t.anisotropy = 4;
  return t;
}

export function createGlass(renderer, { strength = 1, dirty = 0.5, tint = '#8ea2b4' } = {}){
  const env = interiorEquirect();
  const smudge = smudgeMap();
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: {
      tEnv: { value: env },
      tSmudge: { value: smudge },
      uTint: { value: new THREE.Color(tint) },
      uStrength: { value: strength },
      uDirty: { value: dirty * 2.6 },   // ?dirty= 0..100: 50 is the pane as drawn, 100 is a window nobody has cleaned
      uNormal: { value: new THREE.Vector3(0, 0, 1) },
      uEye: { value: new THREE.Vector3(0, 1.15, 0) }
    },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: [
      'uniform sampler2D tEnv, tSmudge; uniform vec3 uTint, uEye, uNormal; uniform float uStrength, uDirty;',
      'varying vec2 vUv; varying vec3 vW;',
      'void main(){',
      '  vec3 d = normalize(vW - uEye);',
      '  vec3 n = normalize(uNormal);',
      '  float cosT = clamp(dot(n, -d), 0.0, 1.0);',
      '  float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);',                     // Schlick, air to glass
      '  vec3 r = reflect(d, n);',
      '  vec2 ruv = vec2(atan(r.x, -r.z) * 0.15915494 + 0.5, asin(clamp(r.y, -1.0, 1.0)) * 0.31830989 + 0.5);',
      '  vec3 refl = texture2D(tEnv, ruv).rgb;',
      // the room's light as one broad sheen, sliding across the pane as the look moves
      '  float sheen = pow(max(dot(r, normalize(vec3(-0.35, 0.25, 0.9))), 0.0), 6.0);',
      // The dirt is sampled in WORLD space, not in the pane's own UV, and it is scaled to cover the whole glazing exactly once (clamped,
      // never repeated). Per pane it used to reset at the corner; repeated, it drew a hard line down the glass at every tile boundary —
      // at 0.55 per metre that was a seam straight down the middle of the frame.
      '  vec2 wuv = vec2((vW.x + vW.z + 3.20) / 5.50, (vW.y - 0.02) / 2.70);',
      '  float dirt = clamp(texture2D(tSmudge, wuv).r * uDirty, 0.0, 1.0);',
      // No edge tint: it is drawn per pane, so at the corner two bands met and drew a hard line down the glass. The frame and the
      // mullions already read as the edges of the glazing.
      '  vec3 col = uTint * (0.05 + 0.10 * fres);',
      '  col += refl * (0.35 + 2.20 * fres);',
      '  col += vec3(1.0, 0.92, 0.82) * sheen * 0.35;',
      '  col += vec3(1.0, 0.86, 0.72) * pow(dirt, 1.6) * 1.10;',
      '  float a = 0.05 + 0.42 * fres + 0.55 * pow(dirt, 1.5) + 0.30 * sheen;',
      '  gl_FragColor = vec4(col, clamp(a * uStrength, 0.0, 0.92));',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}'
    ].join('\n')
  });
}

export function setGlassNormal(material, x, y, z){ material.uniforms.uNormal.value.set(x, y, z).normalize(); }
