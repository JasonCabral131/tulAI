// The Tulai robot: a small hovering bot drawn with Three.js. Its chest holds a tesseract (a 4D hypercube) that rotates through the
// fourth dimension and is projected into 3D every frame. The bot reacts to what Tulai is doing: idle, listening, thinking, speaking, needing you.
import * as THREE from './vendor/three.module.js';

const canvas = document.getElementById('robot');
if (canvas) boot(canvas);

function boot(canvas) {
  const thumbnail = new URLSearchParams(location.search).has("thumbnail");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); } catch { return; } // no WebGL: the flat orb stays
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, thumbnail ? 1.5 : 2)); renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50); camera.position.set(0, 0.62, 7.7); camera.lookAt(0, 0.62, 0); if (thumbnail) { camera.position.set(0, 0.45, 6.5); camera.lookAt(0, 0.35, 0); } // extra headroom so smoke has room to rise
  const particleViewport = { value: new THREE.Vector2() };
  const size = () => { const w = canvas.clientWidth || 120, h = canvas.clientHeight || 120; renderer.setSize(w, h, false); renderer.getDrawingBufferSize(particleViewport.value); camera.aspect = w / h; camera.updateProjectionMatrix(); }; size(); addEventListener('resize', size);

  /* ---- light ---- */
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8090b0, 2.1));
  const key = new THREE.DirectionalLight(0xfff4e8, 3.0); key.position.set(2.5, 3.5, 4); scene.add(key);
  const rim = new THREE.PointLight(0xc15f3c, 4, 8); rim.position.set(-2.5, 1.2, -1.5); scene.add(rim);
  const glow = new THREE.PointLight(0xffb38a, 0.6, 3); glow.position.set(0, 0.2, 1.6); scene.add(glow);

  /* ---- materials ---- */
  const shell = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.5, metalness: 0.04 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x101b2b, roughness: 0.4, metalness: 0.12 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xc15f3c, roughness: 0.5, metalness: 0.05, emissive: 0x3a1408 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb38a }), eyeHalo = new THREE.MeshBasicMaterial({ color: 0xffb38a, transparent: true, opacity: 0.10, depthWrite: false });
  const mouthMat = new THREE.MeshBasicMaterial({ color: 0xffb38a });

  /* ---- robot ---- */
  const bot = new THREE.Group(); scene.add(bot);
  const head = new THREE.Group(); head.position.y = 0.72; bot.add(head);
  // Rounded porcelain shells and an inset, softly curved face display.
  const rounded = (w, h, depth, r, bevel = 0.05) => {
    const shape = new THREE.Shape(), x = -w / 2, y = -h / 2;
    shape.moveTo(x+r,y); shape.lineTo(x+w-r,y); shape.quadraticCurveTo(x+w,y,x+w,y+r);
    shape.lineTo(x+w,y+h-r); shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    shape.lineTo(x+r,y+h); shape.quadraticCurveTo(x,y+h,x,y+h-r);
    shape.lineTo(x,y+r); shape.quadraticCurveTo(x,y,x+r,y);
    const geo = new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:5,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:16}); geo.center(); geo.computeVertexNormals(); return geo;
  };
  const classicGeo = rounded(1.14, 0.87, 0.56, 0.29, 0.1);
  const skull = new THREE.Mesh(classicGeo, shell); head.add(skull);
  const visor = new THREE.Mesh(rounded(0.99, 0.57, 0.08, 0.24, 0.035), dark); visor.position.set(0,-0.015,0.39); head.add(visor);
  const eyes = []; for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 0.215, 0.02, 0.48);
    const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.11, 6, 16), eyeMat); e.scale.z = 0.4;
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), eyeHalo); h.scale.set(0.8,1.3,0.18); g.add(h,e); head.add(g); eyes.push(g);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.012, 8, 24, Math.PI), mouthMat); smile.rotation.z = Math.PI; smile.position.set(0, -0.15, 0.48); head.add(smile);
  const talk = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.12, 4, 8), mouthMat); talk.rotation.z = Math.PI / 2; talk.position.set(0, -0.15, 0.485); talk.visible = false; head.add(talk);
  const sideEars = []; for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.11, 32), accent); ear.rotation.z = Math.PI / 2; ear.position.set(sx * 0.66, 0, 0); head.add(ear); sideEars.push(ear); }
  const catEars = []; for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 4), shell); ear.position.set(sx * 0.36, 0.56, 0); ear.rotation.z = -sx * 0.35; ear.rotation.y = Math.PI / 4; ear.visible = false; const inner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 4), accent); inner.position.set(0, -0.02, 0.07); ear.add(inner); head.add(ear); catEars.push(ear); }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), dark); stem.position.y = 0.57; head.add(stem);
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xff8a5c }), tip = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), tipMat); tip.position.y = 0.70; head.add(tip);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.2, 12, 32), shell); body.position.y = -0.08; body.scale.set(1, 1, 0.86); bot.add(body);
  const window_ = new THREE.Mesh(new THREE.CircleGeometry(0.14, 40), accent); window_.position.set(0, -0.10, 0.29); bot.add(window_);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.009, 10, 48), accent); ring.position.set(0, -0.10, 0.292); bot.add(ring);
  const arms = []; for (const sx of [-1, 1]) { const a = new THREE.Group(); a.position.set(sx * 0.46, -0.02, 0.02); const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.10, 0.13, 8, 24), shell); seg.position.y = -0.14; const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), accent); hand.position.y = -0.25; a.add(seg, hand); bot.add(a); arms.push(a); }
  // soft glow under the hovering bot
  const sh = document.createElement('canvas'); sh.width = sh.height = 64; { const c = sh.getContext('2d'), g = c.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(30,35,55,.3)'); g.addColorStop(1, 'rgba(193,95,60,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.y = -0.70; bot.add(pad);
  // A small open-cockpit saucer: the companion sits inside its porcelain hull.
  const craft = new THREE.Group(); craft.visible = false; bot.add(craft);
  const saucer = new THREE.Group(); craft.add(saucer);
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.8,48,24),shell); hull.scale.set(1,0.22,0.72); hull.position.y=-0.42; saucer.add(hull);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.68,0.075,12,64),accent); belt.rotation.x=Math.PI/2; belt.scale.y=0.74; belt.position.y=-0.42; saucer.add(belt);
  const cockpit = new THREE.Mesh(new THREE.TorusGeometry(0.37,0.055,12,48),dark); cockpit.rotation.x=Math.PI/2; cockpit.scale.y=0.82; cockpit.position.y=-0.26; saucer.add(cockpit);
  const craftLights = new THREE.Group(); craftLights.position.y=-0.42; saucer.add(craftLights);
  for (let i=0;i<7;i++) { const a=Math.PI*(i/6), light=new THREE.Mesh(new THREE.SphereGeometry(0.035,12,8),eyeMat); light.position.set(Math.cos(a)*0.74,0,Math.sin(a)*0.54); craftLights.add(light); }
  const exhaustMaterial = new THREE.MeshBasicMaterial({color:0x7fe3ff,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false});
  const thrusters=[];
  const engineGlow = new THREE.MeshBasicMaterial({color:0x7fe3ff,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false});
  const wakeRings=[];
  for(let i=0;i<3;i++){const r=new THREE.Mesh(new THREE.TorusGeometry(.65,.014,8,48),engineGlow.clone());r.rotation.x=Math.PI/2;r.position.y=-.75;craft.add(r);wakeRings.push(r);}
  let activeCraft='none', exhaustTick=0;

  for(const x of [-0.43,0.43]) {
    const engine=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.09,0.12,24),dark); engine.position.set(x,-0.57,0); saucer.add(engine);
    const jet=new THREE.Mesh(new THREE.ConeGeometry(0.075,0.29,24),exhaustMaterial); jet.rotation.z=Math.PI; jet.position.set(x,-0.75,0); saucer.add(jet); thrusters.push(jet);
  }
  const rocket = new THREE.Group(), shuttle = new THREE.Group(); craft.add(rocket,shuttle);
  const craftVariants = {spacecraft:saucer,rocket,shuttle};
  function enginePod(group,x,y,z,radius=0.1) {
    const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*.85,.14,24),dark); nozzle.position.set(x,y,z); group.add(nozzle);
    const jet=new THREE.Mesh(new THREE.ConeGeometry(radius*.8,.32,24),exhaustMaterial); jet.rotation.z=Math.PI; jet.position.set(x,y-.20,z); group.add(jet); thrusters.push(jet);
  }
  const pod=new THREE.Mesh(new THREE.SphereGeometry(.5,40,24),shell);pod.scale.set(1.05,.5,.9);pod.position.y=-.4;rocket.add(pod);
  const podLip=new THREE.Mesh(new THREE.TorusGeometry(.37,.05,12,48),accent);podLip.rotation.x=Math.PI/2;podLip.position.y=-.24;rocket.add(podLip);
  for(const side of [-1,1]) {
    const booster=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.38,8,24),shell);booster.position.set(side*.55,-.30,0);rocket.add(booster);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(.13,.23,24),accent);nose.position.set(side*.55,.06,0);rocket.add(nose);
    const stripe=new THREE.Mesh(new THREE.CylinderGeometry(.135,.135,.10,24),accent);stripe.position.set(side*.55,-.33,0);rocket.add(stripe);enginePod(rocket,side*.55,-.62,0,.12);
  }
  const fuselage=new THREE.Mesh(new THREE.SphereGeometry(.65,40,24),shell);fuselage.scale.set(.62,.28,1.05);fuselage.position.set(0,-.4,.1);shuttle.add(fuselage);
  const wingShape=new THREE.Shape();wingShape.moveTo(-.23,-.38);wingShape.lineTo(-1,.28);wingShape.quadraticCurveTo(-1.04,.39,-.86,.40);wingShape.lineTo(.86,.40);wingShape.quadraticCurveTo(1.04,.39,1,.28);wingShape.lineTo(.23,-.38);wingShape.closePath();
  const wing=new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape,{depth:.08,bevelEnabled:true,bevelSize:.045,bevelThickness:.035,bevelSegments:3,steps:1}),accent);wing.rotation.x=Math.PI/2;wing.position.y=-.41;shuttle.add(wing);
  for(const side of [-1,1]) {const light=new THREE.Mesh(new THREE.SphereGeometry(.045,16,12),eyeMat);light.position.set(side*.87,-.38,-.27);shuttle.add(light);enginePod(shuttle,side*.44,-.52,-.17,.09);}
  let flightImpulse=0,previousAltitude=0,craftIdleFor=0,nextCraftDance=18+Math.random()*14;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  // a halo ring that listens (grows with your voice)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.012, 8, 72), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0 })); halo.position.y = 0.2; halo.rotation.x = Math.PI / 2.4; bot.add(halo);

  /* ---- the 4D core: a tesseract rotating in four dimensions ---- */
  const V4 = []; for (let i = 0; i < 16; i++) V4.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  const E = []; for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (i < j) E.push([i, j]); }
  const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(E.length * 6), 3)); lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(E.length * 6), 3));
  const core = new THREE.Group(); core.position.set(0, -0.12, 0.34); core.scale.setScalar(0.3); bot.add(core);
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); core.add(lines); lines.visible = false;
  const ptGeo = new THREE.BufferGeometry(); ptGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
  const pts = new THREE.Points(ptGeo, new THREE.PointsMaterial({ size: 0.11, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); core.add(pts); pts.visible = false;
  const emblemShape = new THREE.Shape(); emblemShape.moveTo(0,0.09); emblemShape.quadraticCurveTo(0.025,0.025,0.09,0); emblemShape.quadraticCurveTo(0.025,-0.025,0,-0.09); emblemShape.quadraticCurveTo(-0.025,-0.025,-0.09,0); emblemShape.quadraticCurveTo(-0.025,0.025,0,0.09);
  const emblem = new THREE.Mesh(new THREE.ShapeGeometry(emblemShape), eyeMat); emblem.position.set(0,-0.10,0.298); bot.add(emblem);
  const P = V4.map(() => [0, 0, 0, 0]), col = new THREE.Color();
  function rotate4(angles, t) { // rotate every vertex in four planes, then project 4D -> 3D (perspective along w)
    const [xw, yw, zw, xy] = [angles[0], angles[1], angles[2], angles[3]], c = [Math.cos(xw), Math.cos(yw), Math.cos(zw), Math.cos(xy)], s = [Math.sin(xw), Math.sin(yw), Math.sin(zw), Math.sin(xy)];
    const pos = lineGeo.attributes.position.array, cols = lineGeo.attributes.color.array, pp = ptGeo.attributes.position.array, out = [];
    for (let i = 0; i < 16; i++) {
      let [x, y, z, w] = V4[i], t1;
      t1 = x * c[0] - w * s[0]; w = x * s[0] + w * c[0]; x = t1; t1 = y * c[1] - w * s[1]; w = y * s[1] + w * c[1]; y = t1; t1 = z * c[2] - w * s[2]; w = z * s[2] + w * c[2]; z = t1; t1 = x * c[3] - y * s[3]; y = x * s[3] + y * c[3]; x = t1;
      const k = 1 / (2.6 - w); out.push([x * k, y * k, z * k, w]); pp.set([x * k, y * k, z * k], i * 3);
    }
    E.forEach(([a, b], n) => { pos.set(out[a].slice(0, 3), n * 6); pos.set(out[b].slice(0, 3), n * 6 + 3); for (const [v, o] of [[a, 0], [b, 3]]) { const lum = 0.45 + 0.55 * ((out[v][3] + 1) / 2); col.copy(coreColor).multiplyScalar(lum * coreGain); cols.set([col.r, col.g, col.b], n * 6 + o); } });
    lineGeo.attributes.position.needsUpdate = lineGeo.attributes.color.needsUpdate = ptGeo.attributes.position.needsUpdate = true;
  }

  /* ---- behaviour ---- */
  /* ---- smoke over his head when the Mac's memory is tight, and water drops for the dive ---- */
  const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const puffs = []; for (let i = 0; i < 72; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 })); // Fade particles before the transparent canvas boundary instead of clipping a dark rectangle.
    s.material.onBeforeCompile = shader => {
      shader.uniforms.particleViewport = particleViewport;
      shader.fragmentShader = 'uniform vec2 particleViewport;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec2 particleUV = gl_FragCoord.xy / particleViewport;
        vec2 edgeDistance = min(particleUV, 1.0 - particleUV);
        diffuseColor.a *= smoothstep(0.0, 0.16, min(edgeDistance.x, edgeDistance.y));
        #include <opaque_fragment>
      `);
    };
    s.visible = false; bot.add(s); puffs.push({ s, life: 0, max: 1, v: new THREE.Vector3(), size: 0.3, grow: 1, peak: 0.6, g: 0 }); }
  function puff(x, y, z, vx, vy, vz, size, life, color, grow, peak, o = {}) { const p = puffs.find((q) => q.life <= 0); if (!p) return; p.life = p.max = life; p.v.set(vx, vy, vz); p.size = size; p.grow = grow; p.peak = peak; p.g = o.g || 0; p.s.material.map = o.tex || puffTex; p.s.position.set(x, y, z); p.s.material.color.set(o.tex ? 0xffffff : color); p.s.visible = true; }
  const glyph = (ch, color) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.font = 'bold 50px -apple-system, Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = color; g.shadowBlur = 8; g.fillStyle = color; g.fillText(ch, 32, 36); return new THREE.CanvasTexture(c); };
  const GL = { bang: glyph('!', '#ff7a45'), q: glyph('?', '#cfd8ff'), heart: glyph('\u2665', '#ff5d8f'), note: glyph('\u266A', '#9fd8ff'), z: glyph('z', '#dfeaff'), star: glyph('\u2726', '#ffd54a') };
  const MOVES = { dance: 7, dive: 3.8, cry: 5.5, giggle: 3.6, laugh: 4, wave: 3, jump: 2.4, spin: 2.4, sleep: 6.5, angry: 4, love: 4.8, sing: 5.8, bow: 2.6, clap: 3.4, scared: 3.4, wink: 1.7, celebrate: 4.8, excited: 4.5, happy: 4, surprised: 2.6, shy: 4, thinking: 4.5, tired: 5.5, dizzy: 4.5, proud: 4 };
  let memLevel = 'normal', nextPuff = 0, move = null;
  const burst = (n, color, y, speed, size, life) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; puff((Math.random() - 0.5) * 0.5, y, 0.3, Math.cos(a) * speed, 0.9 + Math.random() * speed, Math.sin(a) * speed * 0.4, size, life * (0.6 + Math.random() * 0.6), color, 0.6, 0.85); } };
  const ease = (x) => x * x * (3 - 2 * x);
  const STATES = { idle: { eye: 0xffb38a, core: 0xffa070, spin: 0.35, gain: 0.9, glow: 0.5 }, listening: { eye: 0x7fe3ff, core: 0x7fe3ff, spin: 1.0, gain: 1.3, glow: 1 }, thinking: { eye: 0xb49bff, core: 0xc4a8ff, spin: 1.9, gain: 1.4, glow: 1.2 }, speaking: { eye: 0xffd27a, core: 0xffd27a, spin: 0.9, gain: 1.4, glow: 1 }, attention: { eye: 0xffb02e, core: 0xffc04d, spin: 1.3, gain: 1.5, glow: 1.4 }, error: { eye: 0xff5a4d, core: 0xff6a5e, spin: 0.6, gain: 1.2, glow: 1 } };
  let state = 'idle', st = STATES.idle, level = 0, speakPulse = 0, wave = 0, bounce = 0, look = { x: 0, y: 0, tx: 0, ty: 0, until: 0 }, lastMouse = -1e9, swing = { x: 0, y: 0 }, blink = 0, nextBlink = 2, angles = [0, 0, 0, 0], coreColor = new THREE.Color(STATES.idle.core), coreGain = 0.9, eyeCol = new THREE.Color(STATES.idle.eye);
  const api = window.botScene = {
    setState(s) { s = s === 'thinking' || s === 'listening' || s === 'speaking' || s === 'attention' || s === 'error' ? s : 'idle'; if (s !== state) { state = s; st = STATES[s]; if (s === 'attention') wave = 3; } },
    level(v) { level = Math.max(level, Math.min(1, v)); },
    setMemory(l) { memLevel = l === 'critical' || l === 'warn' ? l : 'normal'; },
    perform(name) { if (MOVES[name]) move = { name, t0: clock.elapsedTime, dur: MOVES[name], did: {} }; },
    lookAt(dx, dy) { look.tx = THREE.MathUtils.clamp(dx / 420, -1, 1); look.ty = THREE.MathUtils.clamp(-dy / 420, -1, 1); lastMouse = performance.now(); },
    poke() { bounce = 1; wave = Math.max(wave, 1.6); },
    drag(dx, dy) { swing.x += dx * 0.004; swing.y += dy * 0.004; flightImpulse = THREE.MathUtils.clamp(-dy * .045,-.5,1.5); },
  };
  addEventListener('mousemove', (e) => { const r = canvas.getBoundingClientRect(); look.tx = THREE.MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / 220, -1, 1); look.ty = THREE.MathUtils.clamp(-(e.clientY - (r.top + r.height / 2)) / 220, -1, 1); lastMouse = performance.now(); });
  /* ---- skins: the type (shape) and colours chosen in Tulai Desktop ---- */
  const SKIN_DEFAULT = { type: 'classic', shell: '#f6f1e8', accent: '#c15f3c', eye: '#ffb38a' }, skullGeo = new THREE.SphereGeometry(0.62,48,32), boxGeo = rounded(1.05,0.86,0.62,0.14,0.07);
  let bodySize = 1;
  function setSkin(s) {
    s = { ...SKIN_DEFAULT, ...(s || {}) }; const C = (h) => new THREE.Color(/^#[0-9a-f]{6}$/i.test(h) ? h : '#ffffff');
    shell.color.copy(C(s.shell)); accent.color.copy(C(s.accent)); accent.emissive.copy(C(s.accent)).multiplyScalar(0.18); rim.color.copy(C(s.accent));
    STATES.idle.eye = C(s.eye).getHex(); STATES.idle.core = C(s.eye).getHex(); tipMat.color.copy(C(s.accent));
    const t = ['classic', 'orb', 'cat', 'retro'].includes(s.type) ? s.type : 'classic';
    skull.geometry = t === 'retro' ? boxGeo : t === 'orb' || t === 'cat' ? skullGeo : classicGeo;
    skull.scale.set(...(t === 'orb' ? [1.12,1,0.75] : t === 'cat' ? [1.14,0.84,0.73] : [1,1,1]));
    visor.position.z = t === 'orb' || t === 'cat' ? 0.455 : 0.39;
    for (const e of eyes) e.position.z = visor.position.z + 0.09;
    smile.position.z = visor.position.z + 0.09; talk.position.z = visor.position.z + 0.095;
    for (const e of sideEars) e.visible = t === 'classic' || t === 'retro'; for (const e of catEars) e.visible = t === 'cat'; stem.visible = tip.visible = t === 'classic' || t === 'retro';
    if(activeCraft!==s.craft){flightImpulse=1.2;activeCraft=s.craft||'none';}
    engineGlow.color.copy(C(s.eye));for(const r of wakeRings)r.material.color.copy(C(s.eye));
    craft.visible = !!craftVariants[s.craft]; for (const [key,group] of Object.entries(craftVariants)) group.visible = key === s.craft; pad.position.y = craft.visible ? -1.02 : -0.70;
    bodySize = t === 'orb' ? 0.8 : 1;
    body.scale.set(t === 'orb' ? 0.8 : 1, t === 'orb' ? 0.8 : 1, 0.86); for (const a of arms) a.scale.setScalar(t === 'orb' ? 0.8 : 1);
  }
  api.setSkin = setSkin;
  { const q = new URLSearchParams(location.search); try { if (q.get('skin')) setSkin(JSON.parse(q.get('skin'))); else if (window.__pendingSkin) setSkin(window.__pendingSkin); } catch {} }
  if (window.__pendingState) api.setState(window.__pendingState);
  { const q = new URLSearchParams(location.search); const demo = q.get('state'); if (demo) api.setState(demo); if (q.get('mem')) api.setMemory(q.get('mem')); if (q.get('move')) setTimeout(() => api.perform(q.get('move')), 600); } // ?state=thinking previews a mood

  const showcase = new URLSearchParams(location.search).get('showcase'); let nextShowcase=0;
  const clock = new THREE.Clock(); let acc = 0; const FRAME = 1 / (thumbnail ? 20 : 30);
  function tick() {
    requestAnimationFrame(tick); if (document.hidden) return; const dt = Math.min(clock.getDelta(), 0.1); acc += dt; if (acc < FRAME) return; const d = acc; acc = 0; const t = clock.elapsedTime;
    if(thumbnail && MOVES[showcase] && !move && t>nextShowcase && !reducedMotion.matches){api.perform(showcase);nextShowcase=t+MOVES[showcase]+1.2;}
    // colours ease toward the current state
    eyeCol.lerp(col.set(st.eye), 0.12); eyeMat.color.copy(eyeCol); eyeHalo.color.copy(eyeCol); mouthMat.color.copy(eyeCol); coreColor.lerp(col.set(st.core), 0.1); coreGain += (st.gain - coreGain) * 0.1; tipMat.color.copy(eyeCol);
    glow.color.copy(eyeCol); glow.intensity += (st.glow * 0.6 - glow.intensity) * 0.1;
    // hover and breathe
    bot.position.y = Math.sin(t * 1.8) * 0.045 + bounce * Math.abs(Math.sin(t * 14)) * 0.12; bounce *= 0.9; const br = 1 + Math.sin(t * 1.8) * 0.012; body.scale.set(br * bodySize, bodySize, 0.86 * br);
    pad.scale.setScalar(1 - Math.sin(t * 1.8) * 0.06); pad.material.opacity = 0.9;
    // where to look: the cursor if it moved lately, otherwise glance around
    if (performance.now() - lastMouse > 4000) { if (t > look.until) { look.tx = (Math.random() - 0.5) * 1.2; look.ty = (Math.random() - 0.5) * 0.6; look.until = t + 1.5 + Math.random() * 2.5; } }
    if (state === 'thinking') { look.tx = Math.sin(t * 2.2) * 0.9; look.ty = 0.1; } if (state === 'listening') { look.tx *= 0.3; look.ty = 0.05; }
    look.x += (look.tx - look.x) * 0.12; look.y += (look.ty - look.y) * 0.12; swing.x *= 0.88; swing.y *= 0.88;
    head.rotation.y = look.x * 0.5 + swing.x * 0.6; head.rotation.x = -look.y * 0.3 + swing.y * 0.5; head.rotation.z = -swing.x * 0.35 + Math.sin(t * 0.9) * 0.02; body.rotation.y = look.x * 0.15; bot.rotation.z = -swing.x * 0.2;
    // eyes: blink, widen when listening, squint when thinking
    nextBlink -= d; if (nextBlink < 0) { blink = 1; nextBlink = 2 + Math.random() * 3.5; } blink = Math.max(0, blink - d * 7); const open = Math.max(0.08, 1 - Math.sin(blink * Math.PI) * 0.92);
    const wide = state === 'listening' ? 1.2 + level * 0.35 : state === 'thinking' ? 0.55 : state === 'error' ? 0.6 : 1;
    for (const e of eyes) { e.scale.set(1, open * wide, 1); }
    // mouth
    speakPulse = state === 'speaking' ? 0.5 + 0.5 * Math.abs(Math.sin(t * 13) * Math.sin(t * 5.3)) : speakPulse * 0.8; talk.visible = state === 'speaking'; smile.visible = state !== 'speaking'; talk.scale.set(1, 0.6 + speakPulse * 1.8, 1); smile.scale.setScalar(state === 'error' ? 0.6 : 1); smile.rotation.z = state === 'error' ? 0 : Math.PI;
    // antenna blinks while busy
    tip.scale.setScalar(state === 'idle' ? 1 : 0.85 + 0.35 * Math.abs(Math.sin(t * 7))); stem.rotation.z = Math.sin(t * 2.3) * 0.08 + swing.x * 0.5;
    // arms sway, and wave when something wants you
    wave = Math.max(0, wave - d); for (let i = 0; i < 2; i++) { const side = i ? 1 : -1, a = arms[i]; a.rotation.z = side * (0.25 + Math.sin(t * 1.8 + i) * 0.06) + swing.x * 0.3; a.rotation.x = Math.sin(t * 1.6 + i * 1.7) * 0.08; }
    if (wave > 0) { arms[1].rotation.z = 2.4 + Math.sin(t * 12) * 0.35; arms[1].rotation.x = 0; }
    if (state === 'speaking') for (const a of arms) a.rotation.x += Math.sin(t * 6) * 0.15;
    // the listening halo breathes with the microphone level
    level *= 0.85; halo.material.opacity += ((state === 'listening' ? 0.55 + level * 0.4 : 0) - halo.material.opacity) * 0.2; halo.scale.setScalar(1 + level * 0.35 + Math.sin(t * 4) * 0.03); halo.rotation.z += d * 0.8;
    ring.rotation.z += d * (state === 'idle' ? 0.2 : 1.5); ring.material.emissive.copy(eyeCol).multiplyScalar(0.25);
    // the 4D core
    const sp = st.spin * (1 + level * 1.5 + (state === 'speaking' ? speakPulse * 0.6 : 0)); angles[0] += d * sp; angles[1] += d * sp * 0.73; angles[2] += d * sp * 0.51; angles[3] += d * sp * 0.31; rotate4(angles, t);
    const pulse = 1 + (state === 'speaking' ? speakPulse * 0.18 : Math.sin(t * 2.4) * 0.05); core.scale.setScalar(0.3 * pulse * (state === 'thinking' ? 1.08 : 1)); core.rotation.y = t * 0.2;
    // ---- memory warning: smoke rises from his head (light wisps when it is getting tight, thick dark smoke when it is critical) ----
    nextPuff -= d; const interval = memLevel === 'critical' ? 0.07 : memLevel === 'warn' ? 0.5 : 0;
    if (interval && nextPuff <= 0) { nextPuff = interval * (0.6 + Math.random() * 0.8); const crit = memLevel === 'critical'; puff((Math.random() - 0.5) * 0.35, head.position.y + 0.5, 0.05, (Math.random() - 0.5) * 0.18, crit ? 0.55 + Math.random() * 0.3 : 0.32, 0, crit ? 0.5 : 0.3, crit ? 2.2 : 1.6, crit ? 0x2a2a2a : 0xa8a8a8, crit ? 1.8 : 1.2, crit ? 0.78 : 0.4); }
    for (const p of puffs) { if (p.life <= 0) continue; p.life -= d; if (p.life <= 0) { p.s.visible = false; continue; } const k = 1 - p.life / p.max; p.v.y += p.g * d; p.s.position.addScaledVector(p.v, d); p.v.x += (Math.random() - 0.5) * 0.02; p.s.scale.setScalar(p.size * (1 + k * p.grow * 2)); p.s.material.opacity = p.peak * Math.min(1, k * 7) * (1 - k) ; }
    if (memLevel === 'critical') { head.rotation.z += Math.sin(t * 38) * 0.015; tip.scale.setScalar(0.9 + 0.5 * Math.abs(Math.sin(t * 9))); if (state === 'idle') { eyeCol.lerp(col.set(0xff5148), 0.25); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); tipMat.color.copy(eyeCol); } }
    else if (memLevel === 'warn' && state === 'idle') { eyeCol.lerp(col.set(0xffc247), 0.1); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); }
    // ---- moves: dance and dive ----
    bot.position.x = 0; bot.position.z = 0; bot.rotation.x = 0; bot.rotation.y = 0; bot.scale.setScalar(1);
    if (move) {
      const p = (t - move.t0) / move.dur;
      if (p >= 1) { move = null; } else if (move.name === 'dance') {
        const beat = t * 6.4, env = Math.min(1, p * 8, (1 - p) * 8);
        bot.position.y += Math.abs(Math.sin(beat)) * 0.17 * env; bot.position.x = Math.sin(beat * 0.5) * 0.26 * env;
        bot.rotation.y = Math.sin(beat * 0.5) * 0.7 * env + (p > 0.86 ? ((p - 0.86) / 0.14) * Math.PI * 2 : 0); bot.rotation.z = Math.sin(beat) * 0.17 * env;
        head.rotation.z += Math.sin(beat + 1) * 0.3 * env; head.rotation.x += Math.sin(beat * 2) * 0.1 * env;
        for (let i = 0; i < 2; i++) { const side = i ? 1 : -1; arms[i].rotation.z = side * (0.25 + (1.2 + Math.sin(beat + i * Math.PI) * 0.95) * env); arms[i].rotation.x = Math.sin(beat * 2 + i) * 0.4 * env; }
        for (const e of eyes) e.scale.set(1, 1 - 0.55 * env, 1);
        eyeCol.setHSL((t * 0.5) % 1, 0.9, 0.7); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); tipMat.color.copy(eyeCol); coreColor.setHSL((t * 0.5 + 0.3) % 1, 0.9, 0.65);
        for (let i = 0; i < 4; i++) angles[i] += d * 2.2 * env; if (Math.sin(beat) > 0.96 && Math.random() < 0.5) puff((Math.random() - 0.5) * 1.2, 0.2 + Math.random() * 0.9, 0.2, 0, 0.5, 0, 0.12, 0.7, new THREE.Color().setHSL(Math.random(), 0.9, 0.65), 0.2, 0.9);
      } else if (move.name === 'cry') {
        const env = Math.min(1, p * 6, (1 - p) * 6), sob = Math.abs(Math.sin(t * 7));
        head.rotation.x += 0.42 * env; head.rotation.z += Math.sin(t * 3) * 0.05 * env; bot.rotation.z = Math.sin(t * 9) * 0.035 * env; bot.position.y += -0.05 * env + Math.sin(t * 14) * 0.012 * env;
        for (const e of eyes) e.scale.set(1, 0.6 + 0.14 * sob, 1); smile.rotation.z = 0; stem.rotation.z = 0.5 * env; tip.scale.setScalar(0.7);
        for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (0.15 + 0.85 * env); arms[i].rotation.x = -0.8 * env + Math.sin(t * 7) * 0.14 * env; }
        eyeCol.lerp(col.set(0x79b8ff), 0.3); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); tipMat.color.set(0x6a7fa6);
        if (Math.random() < 0.6) for (const sx of [-1, 1]) puff(sx * 0.24, head.position.y - 0.02, 0.66, sx * 0.04, 0.02, 0.1, 0.075, 1.0, 0x8fd3ff, 0.15, 0.95, { g: -2.6 });
      } else if (move.name === 'giggle' || move.name === 'laugh') {
        const big = move.name === 'laugh' ? 1.6 : 1, env = Math.min(1, p * 8, (1 - p) * 6);
        bot.rotation.z = Math.sin(t * 26) * 0.07 * big * env; bot.position.y += Math.abs(Math.sin(t * 13)) * 0.06 * big * env; head.rotation.z += Math.sin(t * 13) * 0.18 * big * env; head.rotation.x += -0.14 * env * big;
        for (const e of eyes) e.scale.set(1, 1 - 0.58 * env, 1); talk.visible = true; smile.visible = false; talk.scale.set(1.7, 0.9 + 0.7 * Math.abs(Math.sin(t * 26)) * big, 1);
        for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (0.5 + Math.sin(t * 26 + i) * 0.12 * big); arms[i].rotation.x = -0.35 * env; }
        eyeCol.lerp(col.set(0xffe27a), 0.3); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol);
        if (Math.random() < 0.2 * big) puff((Math.random() - 0.5) * 1.1, head.position.y + 0.25 + Math.random() * 0.4, 0.25, 0, 0.45, 0, 0.13, 0.8, 0xffd54a, 0.25, 0.95, { tex: GL.star });
      } else if (move.name === 'wave') {
        wave = 1; const env = Math.min(1, p * 8, (1 - p) * 8); head.rotation.z += Math.sin(t * 5) * 0.1 * env; for (const e of eyes) e.scale.set(1, 1 - 0.3 * env, 1);
      } else if (move.name === 'jump') {
        const q = (p * 2) % 1, s = Math.sin(q * Math.PI); bot.position.y += s * 0.8; bot.scale.y = 1 + 0.07 * s - (q < 0.1 || q > 0.92 ? 0.11 : 0);
        for (let i = 0; i < 2; i++) arms[i].rotation.z = (i ? 1 : -1) * (0.25 + 1.7 * s);
        for (const e of eyes) e.scale.set(1, 1 - 0.35 * s, 1);
      } else if (move.name === 'spin') {
        const e1 = ease(p); bot.rotation.y = e1 * Math.PI * 4; bot.position.y += Math.sin(p * Math.PI) * 0.18; for (let i = 0; i < 2; i++) arms[i].rotation.z = (i ? 1 : -1) * 1.45;
        eyeCol.setHSL((t * 0.9) % 1, 0.85, 0.7); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol);
      } else if (move.name === 'sleep') {
        const env = Math.min(1, p * 4, (1 - p) * 4); head.rotation.x += 0.38 * env + Math.sin(t * 0.9) * 0.04; bot.position.y += Math.sin(t * 1.1) * 0.025 - 0.06 * env;
        for (const e of eyes) e.scale.set(1, 1 - 0.93 * env, 1); eyeCol.lerp(col.set(0x7d86a8), 0.2); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); tipMat.color.set(0x59607a); tip.scale.setScalar(0.7 + 0.15 * Math.sin(t * 1.1)); stem.rotation.z = 0.35 * env;
        for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * 0.12; arms[i].rotation.x = 0.1; }
        move.did.z = (move.did.z || 0) - d; if (move.did.z < 0 && p < 0.92) { move.did.z = 1.0; puff(0.32, head.position.y + 0.38, 0.25, 0.1, 0.26, 0, 0.2, 2.4, 0xffffff, 0.7, 0.95, { tex: GL.z }); }
      } else if (move.name === 'angry') {
        const env = Math.min(1, p * 8, (1 - p) * 6); head.rotation.z += Math.sin(t * 40) * 0.035 * env; bot.position.x = Math.sin(t * 36) * 0.022 * env; bot.position.y += -0.02 * env;
        for (const e of eyes) e.scale.set(1.1, 1 - 0.55 * env, 1); smile.rotation.z = 0; for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * 0.05; arms[i].rotation.x = Math.sin(t * 30 + i) * 0.1 * env; }
        eyeCol.lerp(col.set(0xff3b30), 0.35); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); tipMat.color.set(0xff3b30); tip.scale.setScalar(0.9 + 0.5 * Math.abs(Math.sin(t * 12)));
        if (Math.random() < 0.5) for (const sx of [-1, 1]) puff(sx * 0.66, head.position.y + 0.14, 0.1, sx * 0.3, 0.55, 0, 0.2, 1.1, 0xffffff, 1.3, 0.55);
      } else if (move.name === 'love') {
        const env = Math.min(1, p * 5, (1 - p) * 5); head.rotation.z += Math.sin(t * 2.4) * 0.2 * env; bot.rotation.z = Math.sin(t * 2.4) * 0.07 * env; bot.position.y += Math.abs(Math.sin(t * 4.8)) * 0.05 * env;
        for (const e of eyes) e.scale.set(1, 1 - 0.35 * env, 1); eyeCol.lerp(col.set(0xff6fa5), 0.3); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); tipMat.color.set(0xff6fa5); coreColor.lerp(col.set(0xff6fa5), 0.3);
        for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (0.25 + 0.7 * env); arms[i].rotation.x = -0.7 * env; }
        if (Math.random() < 0.28) puff((Math.random() - 0.5) * 0.9, head.position.y + 0.45, 0.25, (Math.random() - 0.5) * 0.3, 0.5, 0, 0.19, 1.9, 0xff5d8f, 0.3, 0.95, { tex: GL.heart });
      } else if (move.name === 'sing') {
        const env = Math.min(1, p * 6, (1 - p) * 6); head.rotation.z += Math.sin(t * 4) * 0.16 * env; head.rotation.x += Math.sin(t * 8) * 0.05 * env; bot.position.y += Math.abs(Math.sin(t * 4)) * 0.04 * env;
        talk.visible = true; smile.visible = false; talk.scale.set(1, 0.6 + Math.abs(Math.sin(t * 9)) * 1.7, 1); for (const e of eyes) e.scale.set(1, 1 - 0.5 * env, 1);
        for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (0.9 + Math.sin(t * 3 + i) * 0.4 * env); arms[i].rotation.x = Math.sin(t * 6 + i) * 0.2 * env; }
        eyeCol.setHSL((t * 0.2) % 1, 0.7, 0.72); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol);
        if (Math.random() < 0.3) puff((Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.3), head.position.y + 0.3, 0.2, (Math.random() - 0.5) * 0.3, 0.5, 0, 0.21, 1.9, 0x9fd8ff, 0.3, 0.95, { tex: GL.note });
      } else if (move.name === 'bow') {
        const lean = Math.min(1, Math.sin(p * Math.PI) * 1.7); bot.rotation.x = 0.9 * lean; bot.position.y += -0.1 * lean; head.rotation.x += 0.2 * lean; for (let i = 0; i < 2; i++) arms[i].rotation.z = (i ? 1 : -1) * (0.2 - 0.1 * lean);
      } else if (move.name === 'clap') {
        const hit = 0.5 + 0.5 * Math.sin(t * 18), env = Math.min(1, p * 8, (1 - p) * 8); for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (0.15 + 0.55 * hit * env + 0.3 * (1 - env)); arms[i].rotation.x = -1.0 * env; }
        for (const e of eyes) e.scale.set(1, 1 - 0.4 * env, 1); bot.position.y += Math.abs(Math.sin(t * 9)) * 0.03 * env; if (hit > 0.96 && Math.random() < 0.5) puff((Math.random() - 0.5) * 0.3, -0.05, 0.5, (Math.random() - 0.5) * 0.4, 0.4, 0.1, 0.1, 0.6, 0xffd54a, 0.2, 0.9, { tex: GL.star });
      } else if (move.name === 'scared') {
        const env = Math.min(1, p * 10, (1 - p) * 6); bot.position.x = Math.sin(t * 45) * 0.03 * env; head.rotation.z += Math.sin(t * 30) * 0.06 * env; bot.scale.setScalar(1 - 0.08 * env); bot.position.y += -0.04 * env;
        for (const e of eyes) e.scale.set(1.15, 1 + 0.5 * env, 1); eyeCol.lerp(col.set(0xffffff), 0.4); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); talk.visible = true; smile.visible = false; talk.scale.set(0.6, 2.2, 1);
        for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (1.5 * env + 0.25 * (1 - env) + Math.sin(t * 40) * 0.08 * env); arms[i].rotation.x = 0; }
        if (Math.random() < 0.16) puff((Math.random() < 0.5 ? -1 : 1) * 0.55, head.position.y + 0.25, 0.3, 0, 0.1, 0, 0.09, 0.8, 0x8fd3ff, 0.1, 0.9, { g: -1.5 });
      } else if (move.name === 'wink') {
        const env = Math.min(1, p * 6, (1 - p) * 6), closed = p > 0.25 && p < 0.7 ? 1 : 0; head.rotation.z += 0.16 * env; eyes[0].scale.set(1, closed ? 0.08 : 1, 1);
        if (closed && !move.did.s) { move.did.s = 1; puff(-0.5, head.position.y + 0.2, 0.5, -0.1, 0.3, 0, 0.17, 0.8, 0xffd54a, 0.3, 0.95, { tex: GL.star }); }
      } else if (move.name === 'celebrate') {
        const q = (p * 3) % 1, s = Math.sin(q * Math.PI), env = Math.min(1, p * 8, (1 - p) * 8); bot.position.y += s * 0.65 * env; bot.rotation.y = Math.sin(t * 5) * 0.4 * env; for (let i = 0; i < 2; i++) arms[i].rotation.z = (i ? 1 : -1) * (0.3 + 2.2 * env);
        eyeCol.setHSL((t * 0.7) % 1, 0.9, 0.72); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); for (const e of eyes) e.scale.set(1, 1 - 0.45 * env, 1);
        if (Math.random() < 0.6 * env) puff((Math.random() - 0.5) * 1.2, head.position.y + 0.75, 0.2, (Math.random() - 0.5) * 0.7, 0.7 + Math.random() * 0.6, 0, 0.09 + Math.random() * 0.05, 1.6, new THREE.Color().setHSL(Math.random(), 0.9, 0.6), 0.1, 0.95, { g: -1.7 });
      } else if (move.name === 'excited') {
        const env = Math.min(1, p * 8, (1 - p) * 6); bot.position.y += Math.abs(Math.sin(t * 10)) * 0.32 * env; head.rotation.z += Math.sin(t * 9) * 0.14 * env; bot.rotation.z = Math.sin(t * 9) * 0.06 * env;
        for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (1.7 + Math.sin(t * 15 + i * 2) * 0.5) * env + (1 - env) * 0.25; arms[i].rotation.x = Math.sin(t * 15 + i) * 0.2 * env; }
        for (const e of eyes) e.scale.set(1.1, 1 + 0.25 * env, 1); eyeCol.setHSL(0.12 + 0.05 * Math.sin(t * 6), 1, 0.7); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); talk.visible = true; smile.visible = false; talk.scale.set(1.5, 0.8 + 0.6 * Math.abs(Math.sin(t * 10)), 1);
        if (Math.random() < 0.55 * env) puff((Math.random() - 0.5) * 1.3, head.position.y + 0.3 + Math.random() * 0.6, 0.25, (Math.random() - 0.5) * 0.4, 0.5, 0, 0.14, 0.9, 0xffd54a, 0.25, 0.95, { tex: GL.star });
      } else if (move.name === 'happy') {
        const env = Math.min(1, p * 6, (1 - p) * 6); bot.position.y += Math.abs(Math.sin(t * 5)) * 0.1 * env; bot.rotation.z = Math.sin(t * 2.5) * 0.08 * env; head.rotation.z += Math.sin(t * 2.5) * 0.12 * env;
        for (const e of eyes) e.scale.set(1, 1 - 0.55 * env, 1); eyeCol.lerp(col.set(0xffd54a), 0.3); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); for (let i = 0; i < 2; i++) arms[i].rotation.z = (i ? 1 : -1) * (0.4 + 0.5 * env + Math.sin(t * 2.5 + i) * 0.15);
        if (Math.random() < 0.1) puff((Math.random() - 0.5) * 1, head.position.y + 0.4, 0.25, 0, 0.4, 0, 0.12, 1.1, 0xffd54a, 0.2, 0.9, { tex: GL.star });
      } else if (move.name === 'surprised') {
        const k = Math.min(1, p * 10), env = Math.min(1, (1 - p) * 5); bot.position.z = -0.35 * k * env; bot.position.y += Math.sin(Math.min(1, p * 6) * Math.PI) * 0.25; bot.scale.setScalar(1 + 0.08 * k * env);
        for (const e of eyes) e.scale.set(1.2, 1 + 0.6 * k * env, 1); talk.visible = true; smile.visible = false; talk.scale.set(0.7, 2.4 * k + 0.4, 1); for (let i = 0; i < 2; i++) arms[i].rotation.z = (i ? 1 : -1) * (0.3 + 1.6 * k * env); eyeCol.lerp(col.set(0xffffff), 0.4); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol);
        if (!move.did.b) { move.did.b = 1; puff(0, head.position.y + 0.85, 0.3, 0, 0.35, 0, 0.3, 1.6, 0xff7a45, 0.2, 0.98, { tex: GL.bang }); }
      } else if (move.name === 'shy') {
        const env = Math.min(1, p * 5, (1 - p) * 5); head.rotation.y += 0.65 * env; head.rotation.x += 0.22 * env; head.rotation.z += Math.sin(t * 2) * 0.05 * env; bot.rotation.y += 0.25 * env;
        for (const e of eyes) e.scale.set(1, 1 - 0.35 * env, 1); eyeCol.lerp(col.set(0xffa6c9), 0.25); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); tipMat.color.set(0xffa6c9); for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (0.3 - 0.1 * env); arms[i].rotation.x = -0.9 * env + Math.sin(t * 3 + i) * 0.1 * env; }
        if (Math.random() < 0.12) puff((Math.random() - 0.5) * 0.7, head.position.y + 0.35, 0.3, 0, 0.35, 0, 0.14, 1.4, 0xff6fa5, 0.2, 0.9, { tex: GL.heart });
      } else if (move.name === 'thinking') {
        const env = Math.min(1, p * 5, (1 - p) * 5); head.rotation.z += 0.26 * env; head.rotation.y += Math.sin(t * 1.4) * 0.3 * env; head.rotation.x += -0.1 * env; arms[1].rotation.z = 0.7 * env + 0.25 * (1 - env); arms[1].rotation.x = -1.4 * env; arms[0].rotation.z = -0.3;
        eyes[0].scale.set(1, 1 - 0.2 * env, 1); eyes[1].scale.set(1, 1 - 0.55 * env, 1); eyeCol.lerp(col.set(0xb49bff), 0.25); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); tip.scale.setScalar(0.8 + 0.4 * Math.abs(Math.sin(t * 5)));
        move.did.q = (move.did.q || 0) - d; if (move.did.q < 0 && p < 0.85) { move.did.q = 0.9; puff(0.2, head.position.y + 0.55, 0.3, 0.05, 0.3, 0, 0.26, 1.7, 0xcfd8ff, 0.2, 0.95, { tex: GL.q }); }
      } else if (move.name === 'tired') {
        const env = Math.min(1, p * 3, (1 - p) * 3), yawn = p > 0.35 && p < 0.6 ? Math.sin(((p - 0.35) / 0.25) * Math.PI) : 0; head.rotation.x += 0.28 * env - 0.2 * yawn; bot.position.y += -0.06 * env + Math.sin(t * 0.9) * 0.015; bot.rotation.z = Math.sin(t * 0.8) * 0.05 * env;
        for (const e of eyes) e.scale.set(1, 1 - (0.5 + 0.4 * yawn) * env, 1); talk.visible = yawn > 0.05; smile.visible = !talk.visible; talk.scale.set(1.2, 0.5 + 2.4 * yawn, 1); eyeCol.lerp(col.set(0x9aa3c7), 0.2); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); tipMat.color.set(0x6a7090); for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (0.1 + 1.3 * yawn); arms[i].rotation.x = 0.05; }
      } else if (move.name === 'dizzy') {
        const env = Math.min(1, p * 6, (1 - p) * 5); bot.rotation.z = Math.sin(t * 4.5) * 0.28 * env; bot.rotation.y = Math.sin(t * 3) * 0.7 * env; bot.position.x = Math.sin(t * 2.2) * 0.12 * env; head.rotation.z += Math.sin(t * 6) * 0.15 * env;
        eyes[0].scale.set(1, 1 + 0.35 * Math.sin(t * 6) * env, 1); eyes[1].scale.set(1, 1 - 0.35 * Math.sin(t * 6) * env, 1); eyeCol.setHSL((t * 0.6) % 1, 0.7, 0.7); eyeMat.color.copy(eyeCol); for (let i = 0; i < 2; i++) arms[i].rotation.z = (i ? 1 : -1) * (0.9 + Math.sin(t * 4.5 + i) * 0.5 * env);
        if (Math.random() < 0.3 * env) { const a = t * 5; puff(Math.cos(a) * 0.45, head.position.y + 0.55, Math.sin(a) * 0.3 + 0.2, 0, 0.1, 0, 0.12, 0.7, 0xffd54a, 0.1, 0.9, { tex: GL.star }); }
      } else if (move.name === 'proud') {
        const env = Math.min(1, p * 5, (1 - p) * 5); bot.rotation.x = -0.14 * env; head.rotation.x += -0.22 * env; head.rotation.z += Math.sin(t * 1.5) * 0.05 * env; bot.position.y += 0.05 * env + Math.sin(t * 2) * 0.015;
        for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (0.25 + 0.85 * env); arms[i].rotation.x = 0.25 * env; } eyeCol.lerp(col.set(0xffd54a), 0.25); eyeMat.color.copy(eyeCol); mouthMat.color.copy(eyeCol); for (const e of eyes) e.scale.set(1, 1 - 0.3 * env, 1);
        if (Math.random() < 0.12) puff((Math.random() - 0.5) * 1.0, head.position.y + 0.3 + Math.random() * 0.4, 0.3, 0, 0.3, 0, 0.13, 1, 0xffd54a, 0.2, 0.95, { tex: GL.star });
      } else if (move.name === 'dive') { // dive: crouch, leap, plunge out of sight, bubbles, then burst back up
        const y0 = bot.position.y;
        if (p < 0.18) { const e = ease(p / 0.18); bot.position.y = y0 - 0.14 * e; bot.scale.y = 1 - 0.1 * e; for (let i = 0; i < 2; i++) arms[i].rotation.z = (i ? 1 : -1) * 0.1; }
        else if (p < 0.5) { const q = (p - 0.18) / 0.32; bot.position.y = y0 + Math.sin(q * Math.PI * 0.8) * 0.6 - q * q * 1.9; bot.rotation.x = q * 1.25; bot.position.z = -q * 1.1; bot.scale.setScalar(1 - q * 0.25); for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * 2.7; arms[i].rotation.x = 0; } if (q > 0.78 && !move.did.a) { move.did.a = 1; burst(14, 0x9fe8ff, -0.9, 0.9, 0.2, 1.1); } }
        else if (p < 0.72) { bot.position.y = -2.2; bot.rotation.x = 1.25; if (Math.random() < 0.45) puff((Math.random() - 0.5) * 0.9, -1.2, 0.3, 0, 0.7, 0, 0.1 + Math.random() * 0.12, 1.2, 0xcff4ff, 0.4, 0.7); }
        else { const r = ease((p - 0.72) / 0.28); bot.position.y = y0 - 2.2 * (1 - r) + Math.sin(r * Math.PI) * 0.35; bot.rotation.x = 1.25 * (1 - r); bot.rotation.y = r * Math.PI * 2; bot.position.z = -0.4 * (1 - r); bot.scale.setScalar(0.85 + 0.15 * r); for (let i = 0; i < 2; i++) { arms[i].rotation.z = (i ? 1 : -1) * (2.4 * (1 - r) + 0.3 * r); } if (r > 0.25 && !move.did.b) { move.did.b = 1; burst(18, 0x9fe8ff, -0.85, 1.1, 0.22, 1.2); } }
      }
    }
    if (craft.visible && !reducedMotion.matches) {
      const velocity=(bot.position.y-previousAltitude)/Math.max(d,.001); previousAltitude=bot.position.y;
      const thrust=THREE.MathUtils.clamp(velocity*.6+flightImpulse,-.4,1.1);flightImpulse*=.92;
      exhaustMaterial.color.copy(eyeCol);exhaustMaterial.opacity=.72+Math.max(0,thrust)*.2;
      for(let i=0;i<wakeRings.length;i++){const phase=(t*.7+i/3)%1;const r=wakeRings[i];r.position.y=-.65-phase*.55;r.scale.setScalar(.65+phase*.7);r.material.opacity=(1-phase)*.35;r.visible=activeCraft==='spacecraft';}
      exhaustTick+=d;
      if(exhaustTick>(thumbnail?.13:.065)){exhaustTick=0;const spread=activeCraft==='shuttle'?.85:activeCraft==='rocket'?.55:.43;for(const side of [-1,1])puff(side*spread,-.78,.05,-swing.x*.2,-.35-Math.max(0,thrust)*.55,0,.12+Math.max(0,thrust)*.06,.65,eyeCol.getHex(),.15,.7);}

      craft.rotation.z = Math.sin(t * 1.3) * 0.035 - swing.x*.08;
      craft.rotation.x = Math.sin(t * 1.1)*.025 + thrust*.045;
      craftLights.rotation.y = Math.sin(t * 0.7) * 0.03;
      for (let i=0;i<thrusters.length;i++) thrusters[i].scale.y = 1.3 + Math.sin(t * 9 + i * 2) * .12 + thrust;
      if(state==='idle'&&!move){craftIdleFor+=d;if(craftIdleFor>nextCraftDance){api.perform('dance');craftIdleFor=0;nextCraftDance=24+Math.random()*20;}}else craftIdleFor=0;
    }
    if(reducedMotion.matches){for(const r of wakeRings)r.visible=false;craft.rotation.set(0,0,0);}
    renderer.render(scene, camera);
  }
  canvas.parentElement.classList.add('has3d'); tick();
}
