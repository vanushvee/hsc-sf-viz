// plate/birds.js v1.2.0 (15 Nov 2026): a flock of birds over the city — real boids, and a plain silhouette bird.
//
// Craig Reynolds' three rules (SIGGRAPH 1987, "Flocks, Herds, and Schools"; the steering paper, GDC 1999): every bird steers away from its
// close neighbours (separation), matches their heading (alignment) and drifts toward their centre (cohesion). Each steering force is
// capped, a soft bounds box keeps the flock in the band of sky the window shows, and a slowly drifting roost holds it there. That is the
// same model the three.js boid packages wrap (three-boids, bird-oid, @thi.ng/boids) — implemented here so the plate stays dependency-free.
//
// The bird itself is a silhouette: a body and two wings, one instanced draw call, the wings beating in the vertex shader. At the distance
// the window sees them (8 to 18 units, 20 to 60 px across) that is all a "20 to 60 px across at dusk" bird can carry; a rigged model's
// detail is lost and its silhouette reads worse. (A rigged raven was tried: at this size it looked like a moth.) The haze matches the
// city's, so a bird sits in the same air as the towers behind it.
//
// Determinism: the simulation is stepped at a fixed 30 Hz from t = 0 with a seeded RNG, so the still at ?t=42 is the same flock every time.
import * as THREE from 'three';
import { EYE, SKY_U, SKY_GLSL } from './sky.js';

const mulberry32 = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

// The volume the flock lives in: out over the city, not just outside the glass. At 25 to 60 units a gull is 1 to 3 degrees across, so the
// birds read as small and far and sit *behind* the skyline the way they should — at 8 to 18 units they were both huge and behind the
// Pyramid at once, which is the contradiction the eye catches. The band is the sky the window shows (about 3 to 12 degrees above the
// horizon), wide enough that the slow pan always finds some.
const BOX = { x: 12, y0: 3.6, y1: 9.2, z0: -48, z1: -30 };
const BOX_ZC = (BOX.z0 + BOX.z1) / 2;

export async function createFlock(scene, opts = {}){
  const tone = opts.tone || '#ece7dc';   // the bird's own colour; the sun side is the same hue, warmed
  const count = Math.max(1, Math.min(400, opts.count === undefined ? 42 : opts.count));
  const haze = opts.haze === undefined ? 3.5 : opts.haze;
  const rnd = mulberry32(opts.seed || 0x5eed);

  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), phase = new Float32Array(count);
  const seedBird = (i, r) => {
    pos[i * 3] = (r() * 2 - 1) * BOX.x * 0.45;
    pos[i * 3 + 1] = BOX.y0 + r() * (BOX.y1 - BOX.y0);
    pos[i * 3 + 2] = BOX.z0 + r() * (BOX.z1 - BOX.z0);
    const a = r() * Math.PI * 2, s = 2 + r();
    vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = (r() - 0.5) * 0.3; vel[i * 3 + 2] = Math.sin(a) * s * 0.5;
    phase[i] = r() * Math.PI * 2;
  };
  for (let i = 0; i < count; i++) seedBird(i, rnd);

  // ---------- the bird: a body and two wings, 1 unit across, flapping in the vertex shader ----------
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 0.16, -0.045, 0, -0.12, 0.045, 0, -0.12,          // body
    0, 0, 0.10, -0.52, 0, -0.05, 0, 0, -0.09,               // left wing
    0, 0, 0.10, 0.52, 0, -0.05, 0, 0, -0.09                 // right wing
  ]), 3));
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: Object.assign({}, SKY_U, { uTime: { value: 0 }, uEye: { value: EYE.clone() }, uDens: { value: 0.004 * haze }, uTone: { value: new THREE.Color(tone) } }),
    vertexShader: [
      'attribute float aPhase;',
      'uniform float uTime;',
      'varying vec3 vW; varying vec3 vN;',
      'void main(){',
      '  vec3 p = position;',
      // the wings beat about the body's long axis; the amplitude eases so a bird glides now and then
      '  float amp = 0.55 + 0.45 * sin(uTime * 0.37 + aPhase * 1.7);',
      '  p.y += sin(uTime * 6.4 + aPhase) * abs(p.x) * 0.95 * amp;',
      '  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);',
      '  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);',
      '  gl_Position = projectionMatrix * viewMatrix * wp;',
      '}'
    ].join('\n'),
    fragmentShader: [
      SKY_GLSL,
      'uniform vec3 uEye, uTone; uniform float uDens;',
      'varying vec3 vW; varying vec3 vN;',
      'void main(){',
      '  vec3 dv = vW - uEye; float dist = length(dv); vec3 d = dv / dist;',
      // the same aerial haze the city gets, so a bird at 18 units sits in the same air as the towers behind it
      '  vec3 fogC = skyCol(normalize(vec3(d.x, max(d.y, 0.009), d.z)));',
      '  float f = 1.0 - exp(-dist * uDens);',
      // silhouette, a little warmer where the sun catches the wing
      '  float lit = clamp(dot(normalize(vN), uSunDir) * 0.5 + 0.5, 0.0, 1.0);',
      '  vec3 c = uTone * mix(vec3(0.52, 0.50, 0.47), vec3(1.0, 0.95, 0.80), lit * 0.75);',   // body to sunlit crest
      '  c = mix(c, fogC, clamp(f, 0.0, 0.95));',
      '  gl_FragColor = vec4(c, 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}'
    ].join('\n')
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.renderOrder = -8.5;   // in front of the sky layers, behind the room
  scene.add(mesh);

  // ---------- steering ----------
  // Tight, fast and strongly aligned: a murmuration rather than a spread of gulls. Radii are small relative to the volume so the flock
  // holds together as one body, alignment is weighted well above separation so the mass turns as a sheet, and the forces are high enough
  // to fold it. Dramatic on purpose — it is meant to read as a shape moving through the sky, not as individuals.
  // Calm again: the murmuration tuning (fast, hard-turning, heavily aligned) read as violent. These are the earlier speeds and weights —
  // a gull's 5 to 9 m/s and forces that let the flock turn as a body — with the topological neighbours kept, because that is what holds a
  // big flock together as one mass.
  const SEP = 5.0, ALI = 12.0, COH = 13.0;         // separation radius (alignment and cohesion are topological)
  const SEP_W = 1.55, ALI_W = 0.9, COH_W = 0.85;   // their weights, after Reynolds
  const MAX_SPEED = 3.4, MIN_SPEED = 1.9, MAX_FORCE = 2.8;   // slow: the flock glides and drifts rather than drives
  const DT = 1 / 30;
  const NEIGHBOURS = 7;
  const nearD = new Float32Array(NEIGHBOURS), nearI = new Int32Array(NEIGHBOURS);
  const acc = new Float32Array(count * 3);
  const obj = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(), side = new THREE.Vector3(), up2 = new THREE.Vector3(),
    neg = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), roll = new THREE.Quaternion();
  let simT = 0;

  const clampSpeed = (i) => {
    const o = i * 3, vx = vel[o], vy = vel[o + 1], vz = vel[o + 2];
    const s = Math.hypot(vx, vy, vz) || 1e-6, k = Math.min(MAX_SPEED, Math.max(MIN_SPEED, s)) / s;
    vel[o] = vx * k; vel[o + 1] = vy * k; vel[o + 2] = vz * k;
  };

  function step(dt, t){
    // the roost: the flock's slow drifting centre of interest, out over the bay
    const rx = Math.sin(t * 0.055) * 11.0, ry = 6.2 + Math.sin(t * 0.041 + 1.2) * 1.6, rz = BOX_ZC + Math.cos(t * 0.033) * 7.0;
    for (let i = 0; i < count; i++) {
      const o = i * 3, px = pos[o], py = pos[o + 1], pz = pos[o + 2];
      // Topological neighbours: each bird follows its 7 nearest, the way a real murmuration is organised (Ballerini et al., 2008). A
      // radius alone fragments a big flock into local clusters — which is exactly what it did at 160 birds; the k nearest keeps the whole
      // thing one animal at any count.
      let kn = 0, sx = 0, sy = 0, sz = 0, nSep = 0;
      const vx = vel[o], vy = vel[o + 1], vz = vel[o + 2];
      for (let j = 0; j < count; j++) {
        if (j === i) continue;
        const qq = j * 3, dx = px - pos[qq], dy = py - pos[qq + 1], dz = pz - pos[qq + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-6) continue;
        if (d2 < SEP * SEP) { sx += dx / d2; sy += dy / d2; sz += dz / d2; nSep++; }   // away, weighted by closeness
        if (kn < NEIGHBOURS || d2 < nearD[kn - 1]) {
          let w = kn < NEIGHBOURS ? kn : NEIGHBOURS - 1;
          while (w > 0 && nearD[w - 1] > d2) { nearD[w] = nearD[w - 1]; nearI[w] = nearI[w - 1]; w--; }
          nearD[w] = d2; nearI[w] = j;
          if (kn < NEIGHBOURS) kn++;
        }
      }
      let ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0;
      for (let w = 0; w < kn; w++) { const qq = nearI[w] * 3; ax += vel[qq]; ay += vel[qq + 1]; az += vel[qq + 2]; cx += pos[qq]; cy += pos[qq + 1]; cz += pos[qq + 2]; }
      const nAli = kn, nCoh = kn;
      let fx = 0, fy = 0, fz = 0;
      if (nSep) { const mlen = Math.hypot(sx, sy, sz) || 1e-6; fx += (sx / mlen * MAX_SPEED - vx) * SEP_W; fy += (sy / mlen * MAX_SPEED - vy) * SEP_W; fz += (sz / mlen * MAX_SPEED - vz) * SEP_W; }
      if (nAli) { const mlen = Math.hypot(ax, ay, az) || 1e-6; fx += (ax / mlen * MAX_SPEED - vx) * ALI_W; fy += (ay / mlen * MAX_SPEED - vy) * ALI_W; fz += (az / mlen * MAX_SPEED - vz) * ALI_W; }
      if (nCoh) { const tx = cx / nCoh - px, ty = cy / nCoh - py, tz = cz / nCoh - pz, mlen = Math.hypot(tx, ty, tz) || 1e-6; const cw = COH_W; fx += (tx / mlen * MAX_SPEED - vx) * cw; fy += (ty / mlen * MAX_SPEED - vy) * cw; fz += (tz / mlen * MAX_SPEED - vz) * cw; }
      // the roost, weak: it keeps the flock in the window without ever steering it like a neighbour
      const tx = rx - px, ty = ry - py, tz = rz - pz, tm = Math.hypot(tx, ty, tz) || 1e-6;
      fx += (tx / tm * MAX_SPEED - vx) * 0.30; fy += (ty / tm * MAX_SPEED - vy) * 0.30; fz += (tz / tm * MAX_SPEED - vz) * 0.30;
      // the swirl: a tangential term about the roost, so the mass wheels and folds instead of drifting as a blob. This is the part that
      // reads as a murmuration.
      const dxr = px - rx, dyr = py - ry, dl = Math.hypot(dxr, dyr) || 1e-6;
      fx += (-dyr / dl * MAX_SPEED - vx) * 0.11;
      fy += (dxr / dl * MAX_SPEED - vy) * 0.11;
      // soft bounds: turn back before the flock leaves the volume
      if (px > BOX.x) fx -= (px - BOX.x) * 3.0; else if (px < -BOX.x) fx += (-BOX.x - px) * 3.0;
      if (py > BOX.y1) fy -= (py - BOX.y1) * 3.4; else if (py < BOX.y0) fy += (BOX.y0 - py) * 3.4;
      if (pz > BOX.z1) fz -= (pz - BOX.z1) * 3.0; else if (pz < BOX.z0) fz += (BOX.z0 - pz) * 3.0;
      // cap the force, then integrate
      const fm = Math.hypot(fx, fy, fz);
      if (fm > MAX_FORCE) { const k = MAX_FORCE / fm; fx *= k; fy *= k; fz *= k; }
      acc[o] = fx; acc[o + 1] = fy; acc[o + 2] = fz;
      vel[o] += fx * dt; vel[o + 1] += fy * dt; vel[o + 2] += fz * dt;
      clampSpeed(i);
      pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
      // a hard edge behind the soft one: steering alone settles the flock just outside the box, which is off the frame on the pan
      if (pos[o] > BOX.x || pos[o] < -BOX.x) { pos[o] = Math.sign(pos[o]) * BOX.x; if (Math.sign(vel[o]) === Math.sign(pos[o])) vel[o] *= -0.4; }
      if (pos[o + 1] > BOX.y1 || pos[o + 1] < BOX.y0) { pos[o + 1] = pos[o + 1] > BOX.y1 ? BOX.y1 : BOX.y0; if (Math.sign(vel[o + 1]) === Math.sign(pos[o + 1] - (BOX.y0 + BOX.y1) / 2)) vel[o + 1] *= -0.4; }
      if (pos[o + 2] > BOX.z1 || pos[o + 2] < BOX.z0) { pos[o + 2] = pos[o + 2] > BOX.z1 ? BOX.z1 : BOX.z0; if (Math.sign(vel[o + 2]) === Math.sign(pos[o + 2] - BOX_ZC)) vel[o + 2] *= -0.4; }
    }
  }

  // one instance matrix per bird: it faces where it flies, and banks into the turn
  function place(){
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      fwd.set(vel[o], vel[o + 1], vel[o + 2]).normalize();
      const bank = THREE.MathUtils.clamp((acc[o] * fwd.z - acc[o + 2] * fwd.x) * 0.22, -0.9, 0.9);
      side.crossVectors(fwd, up).normalize();
      up2.crossVectors(side, fwd).normalize();
      m.makeBasis(side, up2, neg.copy(fwd).negate());  // the geometry faces +Z, so the heading is -Z
      q.setFromRotationMatrix(m);
      roll.setFromAxisAngle(fwd, bank);                // roll about the direction of travel
      q.multiply(roll);
      const s = 0.28 + 0.18 * Math.abs(Math.sin(i * 12.9898));   // 0.28 to 0.46 units across: small in the sky, so the flock reads as a mass
      obj.position.set(pos[o], pos[o + 1], pos[o + 2]);
      obj.quaternion.copy(q);
      obj.scale.setScalar(s);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function reset(){
    const r = mulberry32(opts.seed || 0x5eed);
    for (let i = 0; i < count; i++) seedBird(i, r);
    simT = 0;
  }

  // advance the simulation to an absolute time; the loop calls this with the same clock as the camera
  function update(t){
    if (t < simT) reset();
    let guard = 0;
    while (simT + DT <= t && guard++ < 9000) { step(DT, simT); simT += DT; }
    mat.uniforms.uTime.value = t;
    place();
  }

  step(0, 0); place();
  return { mesh, count, update, get time(){ return simT; } };
}
