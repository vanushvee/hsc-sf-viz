// plate/desk.js v1.0.0 (15 Nov 2026): the room and the desk — the corner with the floor-to-ceiling window, the desk (the keyboard is
// modelled into it), the in-tray, the Tizio lamp and its light, and the Macintosh with its screen dark.
// Values are the site's (index.html): ROOM 1580-1590, materials 1486-1509, the layout 1632-1636, the Mac 1657-1680, the lamp 1683-1706 and
// its rest pose 1761-1786, the bake on the desk top 2496-2514, the lights 2756-2790. Props the plate leaves out: the phone, the clock radio,
// the palm, the chair, the magazines, the card reader, the tablet, the papers and the certificate.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { PAL, DESK_Y, DEG, col } from './sky.js';
import { createGlass, setGlassNormal } from './glass.js';

export const ROOM = { left: -1.35, right: 1.6, back: -1.75, ceil: 2.7 };
const DESK = { x: 0, z: -0.95 };                         // front edge z -0.55, back edge -1.35, top at DESK_Y
const MAC = { x: -0.03, z: -1.19 };                      // the case centre (mac_case); the screen is turned square to the eye
const LAMPB = { x: -0.58, z: -1.25, ry: 28 * DEG };      // the lamp's round foot, back left; the arm reaches forward and right
const TRAY = { x: -0.30, z: -1.13, ry: 4 * DEG };        // in-tray, back left beside the Mac
// the palm (plant.glb), on the desk top to the right of the Mac: the site keeps it on a floor pedestal out by the window (x 1.02,
// scale 0.77), so this is a desk-sized scale of the same model, pot on the wood. 12 in right of the Mac, then 10 in further right.
const PLANT = { x: MAC.x + 22 * 0.0254, z: -1.15, ry: 270 * DEG, scale: 0.5 };
const LAMP_AIM = new THREE.Vector3(-0.14, DESK_Y, -0.86);   // the pool's rest aim: raking forward and right, across the keyboard
// The lamp's rest pose, solved by the site's lampSolve at boot and read back from it (degrees: lamp_yaw.y, arms.x, head.x, head order ZXY).
export const LAMP_REST = { yaw: 20.4, lower: -0.2, upper: -0.2, head: -27.2 };

const std = (hex, rough, metal) => new THREE.MeshStandardMaterial({ color: col(hex), roughness: rough, metalness: metal || 0 });
const MAT = {
  wall: std('#2a181c', 0.85), mullion: std('#0b0809', 0.4, 0.6), floor: std('#1c1418', 0.95)
};

const faceEye = (x, z) => Math.atan2(-x, -z);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const findNode = (root, name) => { let f = null; root.traverse(o => { if (!f && o.name === name) f = o; }); return f; };
const meshOf = o => { if (!o) return null; if (o.isMesh) return o; let f = null; o.traverse(c => { if (!f && c.isMesh) f = c; }); return f; };

// place(): the site's placement rule (index.html 1502) — the model's node named `pivot` lands on (x, z), the group at DESK_Y unless y given
function place(scene, gltf, name, o){
  const g = new THREE.Group(); g.name = 'model:' + name;
  const s = gltf.scene;
  s.updateMatrixWorld(true);
  if (o.pivot) { const v = new THREE.Vector3().setFromMatrixPosition(findNode(s, o.pivot).matrixWorld); s.position.set(-v.x, 0, -v.z); }
  g.add(s);
  g.position.set(o.x, o.y === undefined ? DESK_Y : o.y, o.z); g.rotation.y = o.ry || 0;
  if (o.scale) g.scale.setScalar(o.scale);
  scene.add(g); g.updateMatrixWorld(true);
  g.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = !!o.recv; m.userData.model = name; } });
  return g;
}

// planeFrame(): a display plane's centre, axes and size in world space, from its geometry's local box (index.html 1619)
function planeFrame(mesh){
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry; g.computeBoundingBox();
  const bb = g.boundingBox, c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
  const e = mesh.matrixWorld.elements, X = V(e[0], e[1], e[2]), Y = V(e[4], e[5], e[6]), Z = V(e[8], e[9], e[10]);
  return { c: c.clone().applyMatrix4(mesh.matrixWorld), out: Z.clone().normalize(), w: s.x * X.length(), h: s.y * Y.length(),
    quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X.clone().normalize(), Y.clone().normalize(), Z.clone().normalize())) };
}

export async function buildDesk(scene, renderer, opts = {}){
  RectAreaLightUniformsLib.init();
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  await MeshoptDecoder.ready;
  const model = async n => loader.loadAsync('./models/' + n + '.glb');

  // ---------- Room: corner with a floor-to-ceiling window ----------
  const boxAt = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const staticPart = (geo, mat, recv = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = false; m.receiveShadow = recv; scene.add(m); return m; };
  {
    const fl = new THREE.PlaneGeometry(3.2, 3.0); fl.rotateX(-Math.PI / 2); fl.translate(0.1, 0, -0.4);
    staticPart(fl, MAT.floor);
    const lw = new THREE.PlaneGeometry(3.0, ROOM.ceil); lw.rotateY(Math.PI / 2); lw.translate(ROOM.left, ROOM.ceil / 2, -0.25);
    staticPart(lw, MAT.wall);
    [ROOM.left + 0.03, -0.98, 0.98].forEach(x => staticPart(boxAt(0.05, ROOM.ceil, 0.07, x, ROOM.ceil / 2, ROOM.back), MAT.mullion));
    staticPart(boxAt(0.14, ROOM.ceil, 0.14, ROOM.right, ROOM.ceil / 2, ROOM.back), MAT.mullion);
    staticPart(boxAt(0.07, ROOM.ceil, 0.05, ROOM.right, ROOM.ceil / 2, -0.55), MAT.mullion);
  }
  const glassMats = [];
  // glass: the panes the camera looks through — real transmission, a smudged roughness map, and the room reflected off them (glass.js)
  {
    const strength = opts.glass === undefined ? 1 : opts.glass;
    if (strength > 0) {
      const gb = new THREE.PlaneGeometry(ROOM.right - ROOM.left, ROOM.ceil);
      gb.translate((ROOM.right + ROOM.left) / 2, ROOM.ceil / 2, ROOM.back - 0.01);
      const gBack = createGlass(renderer, { strength, dirty: opts.dirty });
      glassMats.push(gBack);
      setGlassNormal(gBack, 0, 0, 1);
      const glass = new THREE.Mesh(gb, gBack);
      glass.renderOrder = 3; glass.name = 'glass'; scene.add(glass);
      const gr = new THREE.PlaneGeometry(2.4, ROOM.ceil); gr.rotateY(-Math.PI / 2); gr.translate(ROOM.right + 0.01, ROOM.ceil / 2, -0.55);
      const gSide = createGlass(renderer, { strength: strength * 0.85, dirty: opts.dirty });
      glassMats.push(gSide);
      setGlassNormal(gSide, -1, 0, 0);
      const glassR = new THREE.Mesh(gr, gSide);
      glassR.renderOrder = 3; scene.add(glassR);
    }
  }

  // ---------- Lights (look bible 3): the room's own, kept whether or not the furniture is in ----------
  const hemi = new THREE.HemisphereLight(col(PAL.duskMid), col(PAL.plumBlack), 0.22);
  scene.add(hemi);
  const dusk = new THREE.DirectionalLight(col('#8a6cc0'), 0.14);
  dusk.position.set(0.5, 1.7, -4.5); dusk.target.position.set(0, DESK_Y, -0.9);
  scene.add(dusk, dusk.target);
  // ?scene=room hides the desk and everything on it; the window and its glass stay
  if (opts.items === false) return { hemi, dusk, glassMats, deskMesh: null, spot: null, macRect: null, bounce: null, lamp: null, plant: null };

  // ---------- Desk (desk.glb carries the keyboard) ----------
  const desk = await model('desk');
  place(scene, desk, 'desk', { x: DESK.x, y: 0, z: DESK.z, recv: true });
  const deskMesh = meshOf(desk.scene);
  // the wood as built is very dark; lift its albedo and keep it fairly glossy so the lamp pool reads on it
  deskMesh.material.color.setScalar(3.2); deskMesh.material.roughness = 0.36;
  if (opts.bake !== false) await applyDeskBake(deskMesh, scene);

  // ---------- In-tray ----------
  const tray = await model('intray');
  place(scene, tray, 'intray', { x: TRAY.x, z: TRAY.z, ry: TRAY.ry, recv: true });
  tray.scene.traverse(o => { if (o.isMesh && /formica/.test(o.material.name)) o.material.color.setScalar(0.62); });

  // ---------- Palm: on the desk top, to the right of the Mac ----------
  let contactShadow = null;
  {
    const palm = await model('plant');
    const g = place(scene, palm, 'plant', { x: PLANT.x, z: PLANT.z, ry: PLANT.ry, scale: PLANT.scale, recv: true });
    g.traverse(m => { if (!m.isMesh) return; [].concat(m.material).forEach(mt => { if (/leaves/.test(mt.name || '')) { mt.side = THREE.DoubleSide; mt.envMapIntensity = 1.2; mt.needsUpdate = true; } }); });
    // Nothing on this desk casts a real shadow: the site bakes every prop's contact occlusion into bake-desk.webp, and that bake was made
    // with the palm on its floor pedestal out of the footprint — so at its new spot the pot had none and read as pasted on. The lamp's cone
    // does not reach it either (it aims across the keyboard, 39 degrees off the pot at a 32 degree cone). So: a cast shadow for the lamp
    // where it does reach the fronds, and a soft contact decal under the pot for the ambient the desk gets everywhere else.
    g.traverse(m => { if (m.isMesh) m.castShadow = true; });
    const pot = findNode(g, 'plant_pot') || g;
    const bb = new THREE.Box3().setFromObject(pot), d = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d'), grd = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,.72)'); grd.addColorStop(0.42, 'rgba(0,0,0,.42)'); grd.addColorStop(0.72, 'rgba(0,0,0,.12)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = grd; cx.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(d * 2.1, d * 2.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set((bb.min.x + bb.max.x) / 2, DESK_Y + 0.0012, (bb.min.z + bb.max.z) / 2);
    shadow.renderOrder = 2;
    scene.add(shadow);
    contactShadow = shadow;
  }

  // ---------- Lamp (Tizio): the key light ----------
  const lamp = await model('lamp');
  place(scene, lamp, 'lamp', { x: LAMPB.x, z: LAMPB.z, ry: LAMPB.ry });
  const bulb = meshOf(findNode(lamp.scene, 'lamp_bulb'));
  const bulbOn = col(PAL.lampKey).multiplyScalar(22);
  bulb.material = new THREE.MeshBasicMaterial({ color: bulbOn.clone() });
  const rig = { yaw: findNode(lamp.scene, 'lamp_yaw'), lower: findNode(lamp.scene, 'lamp_arm_lower'), upper: findNode(lamp.scene, 'lamp_arm_upper'), head: findNode(lamp.scene, 'lamp_head') };
  const bulbNode = findNode(lamp.scene, 'lamp_light_origin'), aimNode = findNode(lamp.scene, 'lamp_light_target');
  rig.yaw.rotation.y = LAMP_REST.yaw * DEG;
  rig.lower.rotation.x = LAMP_REST.lower * DEG;
  rig.upper.rotation.x = LAMP_REST.upper * DEG;
  rig.head.rotation.order = 'ZXY'; rig.head.rotation.x = LAMP_REST.head * DEG; rig.head.rotation.z = 0;
  lamp.scene.updateMatrixWorld(true);
  bulbNode.updateWorldMatrix(true, false); aimNode.updateWorldMatrix(true, false);
  const b = new THREE.Vector3().setFromMatrixPosition(bulbNode.matrixWorld);
  const dir = new THREE.Vector3().setFromMatrixPosition(aimNode.matrixWorld).sub(b).normalize();
  const spot = new THREE.SpotLight(col(PAL.lampKey), 2.2, 0, 0.56, 0.25, 2);
  spot.position.copy(b).add(V(0, -0.008, 0));
  spot.target.position.copy(b).addScaledVector(dir, Math.max(0.3, b.distanceTo(LAMP_AIM)));
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.08; spot.shadow.camera.far = 1.6;
  spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.002;
  scene.add(spot, spot.target);

  // ---------- Macintosh, screen dark ----------
  const mac = await model('mac');
  place(scene, mac, 'mac', { pivot: 'mac_case', x: MAC.x, z: MAC.z, ry: faceEye(MAC.x, MAC.z) });
  const screen = meshOf(findNode(mac.scene, 'mac_screen'));
  screen.material = new THREE.MeshBasicMaterial({ color: col(opts.screen || '#050506') });
  const f = planeFrame(screen);
  const macRect = new THREE.RectAreaLight(col('#f2e8d4'), opts.screenLight === undefined ? 1.2 : opts.screenLight, f.w, f.h);
  macRect.position.copy(f.c).addScaledVector(f.out, 0.004);
  macRect.quaternion.copy(f.quat).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));   // emits along -Z: turn it to face the room
  scene.add(macRect);

  const bounce = new THREE.PointLight(col(PAL.lampPool), 0.175, 0, 2);   // warm light thrown back by the lit desk (a cheap fill)
  bounce.position.set(0.05, 0.95, -0.5);
  scene.add(bounce);

  // one shadow pass, then never again: nothing in this plate moves but the camera
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  return { deskMesh, spot, macRect, bounce, hemi, dusk, lamp, glassMats, plant: contactShadow };
}

// The site's bake (index.html 2496): uv1 is a top-down projection over the desk's footprint, and the bake's G channel scales the lamp's
// direct light only, so the pool keeps its contact shading. Same mapping, same patch.
async function applyDeskBake(deskMesh, scene){
  const BAKE = { x0: -0.85832, z0: -1.35196, w: 1.71665, d: 0.80392 };
  let tex;
  try { tex = await new THREE.TextureLoader().loadAsync('./models/bake-desk.webp'); } catch (e) { console.warn('bake', e); return; }
  deskMesh.updateWorldMatrix(true, false);
  const pos = deskMesh.geometry.attributes.position, uv1 = new Float32Array(pos.count * 2), p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(deskMesh.matrixWorld); uv1[i * 2] = (p.x - BAKE.x0) / BAKE.w; uv1[i * 2 + 1] = (p.z - BAKE.z0) / BAKE.d; }
  deskMesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  tex.channel = 1; tex.colorSpace = THREE.NoColorSpace; tex.flipY = true; tex.needsUpdate = true;
  const dm = deskMesh.material;
  dm.aoMap = tex; dm.aoMapIntensity = 1;
  const uniform = { value: 1 };
  dm.onBeforeCompile = sh => {
    const chunk = THREE.ShaderChunk.lights_fragment_begin;
    const hook = 'getSpotLightInfo( spotLight, geometryPosition, directLight );';
    if (chunk.indexOf(hook) !== -1) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', 'float bakedLamp = mix( 1.0, texture2D( aoMap, vAoMapUv ).g, uBakeLamp );\n' + chunk.replace(hook, hook + ' directLight.color *= bakedLamp;'));
      sh.fragmentShader = 'uniform float uBakeLamp;\n' + sh.fragmentShader; sh.uniforms.uBakeLamp = uniform;
    }
  };
  dm.needsUpdate = true;
  deskMesh.userData.bakeApplied = true;
}
