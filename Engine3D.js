import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput,
  PanResponder, BackHandler, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GLView } from 'expo-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

// ─────────────────────────────────────────────────────────────
// Engine 3D nativa (expo-gl + three.js), sem WebView.
// Instalar: npx expo install expo-gl three expo-screen-orientation expo-sharing
// (expo-screen-orientation e expo-sharing são opcionais: sem eles a engine
//  funciona, só não vira a tela sozinha / não compartilha arquivos.)
// Metro: se falhar o import de 'three/examples/jsm/...', ative em
// metro.config.js:  config.resolver.unstable_enablePackageExports = true;
// ─────────────────────────────────────────────────────────────

let ScreenOrientation = null;
let Sharing = null;
try { ScreenOrientation = require('expo-screen-orientation'); } catch (e) { ScreenOrientation = null; }
try { Sharing = require('expo-sharing'); } catch (e) { Sharing = null; }

const C = {
  ink: '#ffffff', dim: 'rgba(255,255,255,0.6)', line: 'rgba(255,255,255,0.14)',
  panel: '#170c0b', panel2: '#26100f', ember: '#ff5227', gold: '#ffb648',
  green: '#3ddc84', error: '#ff6b6b',
};

// ── projeto em disco ────────────────────────────────────────
const PROJETO = 'Projeto1';
const RAIZ = FileSystem.documentDirectory + 'engine3d/' + PROJETO + '/';
const PASTAS = ['models', 'scripts', 'animations', 'scenes', 'exports'];
const ROTULO_PASTA = {
  models: 'Modelos', scripts: 'Scripts', animations: 'Animações', scenes: 'Cenas', exports: 'Exportados',
};

const SCRIPT_GIRAR = `// obj = objeto 3D (THREE.Object3D). api = ferramentas da engine.
function start(obj, api) {
}

function update(obj, dt, api) {
  obj.rotation.y += dt;
}
`;

const SCRIPT_CONTROLE = `// Joystick (esquerda) move o objeto. Botão "Pular" criado por JS.
let vy = 0;

function start(obj, api) {
  api.ui.button('pular', { text: 'Pular', x: 86, y: 62, w: 84, h: 84 }, {
    down: () => { if (obj.position.y <= 0.51) vy = 6; },
  });
  api.follow(obj); // câmera acompanha o objeto
}

function update(obj, dt, api) {
  obj.position.x += api.input.x * 4 * dt;
  obj.position.z -= api.input.y * 4 * dt;
  vy -= 15 * dt;
  obj.position.y += vy * dt;
  if (obj.position.y < 0.5) { obj.position.y = 0.5; vy = 0; }
}
`;

const CORES = [0xff7a4d, 0xffb648, 0x3ddc84, 0x4fa3f7, 0xa78bfa, 0xff2e7e, 0xdddddd];

// ── utilidades ──────────────────────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOK = (() => { const t = new Uint8Array(128); for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i; return t; })();

function b64ToBuffer(b64) {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOK[clean.charCodeAt(i)], b = LOOK[clean.charCodeAt(i + 1)];
    const c = LOOK[clean.charCodeAt(i + 2)], d = LOOK[clean.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (p < len) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < len) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.buffer;
}

function bufferToB64(buf) {
  const b = new Uint8Array(buf);
  const partes = [];
  for (let i = 0; i < b.length; i += 3) {
    const a = b[i], c = b[i + 1], d = b[i + 2];
    partes.push(
      B64[a >> 2] + B64[((a & 3) << 4) | ((c || 0) >> 4)] +
      (i + 1 < b.length ? B64[((c & 15) << 2) | ((d || 0) >> 6)] : '=') +
      (i + 2 < b.length ? B64[d & 63] : '='),
    );
  }
  return partes.join('');
}

const fmt = (n) => String(Math.round(n * 100) / 100);
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const nomeSeguro = (n) => n.replace(/[^A-Za-z0-9._-]/g, '_');
const extDe = (n) => (n.split('.').pop() || '').toLowerCase();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// três.js no RN não tem Blob/URL para texturas embutidas: tiramos mapas sem imagem
function limparTexturas(obj) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'alphaMap']
        .forEach((k) => { if (m[k] && !m[k].image) m[k] = null; });
      m.needsUpdate = true;
    });
  });
}

async function parseModelo(buf, ext) {
  await esperar(30); // deixa a UI desenhar "Carregando…" antes de travar o JS no parse
  if (ext === 'fbx') {
    const obj = new FBXLoader().parse(buf, '');
    limparTexturas(obj);
    return { obj, clips: obj.animations || [] };
  }
  return new Promise((res, rej) => {
    const loader = new GLTFLoader();
    loader.register((parser) => {
      parser.loadTexture = async () => new THREE.Texture();
      return { name: 'RN_SEM_TEXTURA' };
    });
    loader.parse(buf, '', (g) => { limparTexturas(g.scene); res({ obj: g.scene, clips: g.animations || [] }); }, rej);
  });
}

function normalizar(obj) {
  const b = new THREE.Box3().setFromObject(obj);
  const s = b.getSize(new THREE.Vector3());
  const max = Math.max(s.x, s.y, s.z) || 1;
  obj.scale.multiplyScalar(2 / max);
  const b2 = new THREE.Box3().setFromObject(obj);
  obj.position.y -= b2.min.y;
}

// ── qualidade / otimização (o que as engines grandes fazem) ──
// Baixa = sem sombra; Média = sombra 1024; Alta = sombra 2048. A sombra segue a
// câmera (só a área perto de você é calculada), por isso fica nítida sem pesar.
const QUAL = [
  { nome: 'Baixa', sombra: false, mapa: 512, tam: 12, dist: 50 },
  { nome: 'Média', sombra: true, mapa: 1024, tam: 16, dist: 100 },
  { nome: 'Alta', sombra: true, mapa: 2048, tam: 24, dist: 220 },
];

function contaMeshes(obj) { let n = 0; obj.traverse((o) => { if (o.isMesh) n++; }); return n; }
function contaTris(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0)) / 3;
  });
  return Math.round(n);
}
function ligarSombras(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
}

// Otimiza um modelo importado:
// 1) junta materiais iguais  2) funde malhas que usam o mesmo material em UMA só
// (menos draw calls)  3) trava as matrizes do que não se mexe  4) calcula esferas de corte.
// Modelo com animação não tem as malhas fundidas (quebraria os ossos).
function otimizarModelo(root, temAnimacao) {
  const antes = contaMeshes(root);
  root.updateMatrixWorld(true);

  // 1) materiais duplicados
  const cache = new Map();
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || !o.material) return;
    const m = o.material;
    const chave = [m.type, m.color && m.color.getHex(), m.roughness, m.metalness, m.opacity,
      m.transparent, m.side, m.emissive && m.emissive.getHex(), m.vertexColors, !!m.map].join('|');
    if (cache.has(chave)) {
      if (cache.get(chave) !== m) { m.dispose(); o.material = cache.get(chave); }
    } else cache.set(chave, m);
  });

  // 2) fundir malhas por material
  if (!temAnimacao) {
    const merge = BufferGeometryUtils.mergeGeometries || BufferGeometryUtils.mergeBufferGeometries;
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const grupos = new Map();
    root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.geometry) return;
      if (!grupos.has(o.material)) grupos.set(o.material, []);
      grupos.get(o.material).push(o);
    });
    grupos.forEach((meshes, material) => {
      if (meshes.length < 2) return;
      try {
        // só os atributos que TODAS as malhas têm
        const comuns = Object.keys(meshes[0].geometry.attributes)
          .filter((k) => meshes.every((m) => m.geometry.attributes[k]));
        const todasIndexadas = meshes.every((m) => !!m.geometry.index);
        const geos = meshes.map((m) => {
          let g = m.geometry.clone();
          if (!todasIndexadas && g.index) g = g.toNonIndexed();
          Object.keys(g.attributes).forEach((k) => { if (!comuns.includes(k)) g.deleteAttribute(k); });
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld));
          return g;
        });
        const fundida = merge(geos, false);
        if (!fundida) return;
        const novo = new THREE.Mesh(fundida, material);
        novo.castShadow = true; novo.receiveShadow = true;
        root.add(novo);
        meshes.forEach((m) => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); });
        geos.forEach((g) => g.dispose());
      } catch (e) { /* esse grupo fica como estava */ }
    });
  }

  // 3) matrizes travadas nos filhos estáticos  4) esferas de corte
  root.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    if (o !== root && !temAnimacao && !o.isSkinnedMesh) { o.updateMatrix(); o.matrixAutoUpdate = false; }
  });
  return { antes, depois: contaMeshes(root) };
}

// ── componentes pequenos ────────────────────────────────────
function Chip({ label, on, onPress, color, small, onLongPress }) {
  return (
    <TouchableOpacity
      onPress={onPress} onLongPress={onLongPress}
      style={[st.chip, small && { paddingVertical: 4, paddingHorizontal: 8 },
        on && { backgroundColor: color || C.ember, borderColor: color || C.ember }]}>
      <Text style={[st.chipTxt, on && { color: '#000', fontWeight: '700' }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function NumField({ label, value, onCommit, color }) {
  const [t, setT] = useState(fmt(value));
  const foco = useRef(false);
  useEffect(() => { if (!foco.current) setT(fmt(value)); }, [value]);
  return (
    <View style={st.num}>
      <Text style={[st.numLbl, { color }]}>{label}</Text>
      <TextInput
        style={st.numInput}
        value={t}
        onFocus={() => { foco.current = true; }}
        onChangeText={setT}
        onEndEditing={() => {
          foco.current = false;
          const n = parseFloat(String(t).replace(',', '.'));
          if (!isNaN(n)) onCommit(n); else setT(fmt(value));
        }}
        keyboardType="numbers-and-punctuation"
        selectTextOnFocus
      />
    </View>
  );
}

function Joystick({ onChange }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 46;
  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (e) => {
      let dx = e.nativeEvent.locationX - R - 14, dy = e.nativeEvent.locationY - R - 14;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      setKnob({ x: dx, y: dy });
      onChange(dx / R, -dy / R);
    },
    onPanResponderRelease: () => { setKnob({ x: 0, y: 0 }); onChange(0, 0); },
    onPanResponderTerminate: () => { setKnob({ x: 0, y: 0 }); onChange(0, 0); },
  })).current;
  return (
    <View style={st.joy} {...pr.panHandlers}>
      <View style={st.joyBase} pointerEvents="none">
        <View style={[st.joyKnob, { transform: [{ translateX: knob.x }, { translateY: knob.y }] }]} />
      </View>
    </View>
  );
}

// ════════════════════════════════════════════════════════════
export default function Engine3D({ onClose }) {
  const insets = useSafeAreaInsets();
  const eng = useRef({
    gl: null, renderer: null, scene: null, camera: null, raf: 0,
    items: new Map(), nextId: 1, selId: null,
    box: null, gizmo: null, arrows: [],
    orbit: { yaw: 0.8, pitch: 0.5, dist: 9, target: new THREE.Vector3(0, 0.5, 0) },
    size: { w: 1, h: 1 },
    playing: false, clock: new THREE.Clock(), time: 0,
    runtime: [], snapshot: null, follow: null,
    mode: 'move', axis: 'x', snap: false,
    input: { x: 0, y: 0, buttons: {} }, ui: new Map(), logs: [],
    frame: 0, fpsCount: 0, fpsT: 0, api: null,
    dirty: true, lastRender: 0, quality: 1, sun: null, shadowOn: true, distMax: 100,
    acc: 0, lowT: 0, autoOtim: true,
  }).current;

  const [list, setList] = useState([]);
  const [selId, setSelId] = useState(null);
  const [mode, setMode] = useState('move');
  const [axis, setAxis] = useState('x');
  const [snap, setSnap] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [aba, setAba] = useState('hier');
  const [arquivos, setArquivos] = useState({});
  const [mostrarScript, setMostrarScript] = useState(false);
  const [scriptText, setScriptText] = useState('');
  const [hud, setHud] = useState([]);
  const [logs, setLogs] = useState([]);
  const [fps, setFps] = useState(0);
  const [qualidade, setQualidade] = useState(1);
  const [stats, setStats] = useState('');
  const [mostrarStats, setMostrarStats] = useState(true);
  const [autoOtim, setAutoOtim] = useState(true);
  const [joystick, setJoystick] = useState(true);
  const [msg, setMsg] = useState('');
  const [, setTick] = useState(0);
  const stopRef = useRef(() => {});
  const qualRef = useRef(() => {});

  const bump = () => { eng.dirty = true; setTick((t) => t + 1); };
  eng.mode = mode; eng.axis = axis; eng.snap = snap; eng.autoOtim = autoOtim;

  const aviso = (t) => { setMsg(t); };
  const pushLog = (t) => { eng.logs = [...eng.logs.slice(-5), t]; };

  // ── tela deitada ──────────────────────────────────────────
  useEffect(() => {
    if (ScreenOrientation) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    }
    return () => {
      if (ScreenOrientation) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    };
  }, []);

  // ── disco: pastas do projeto ──────────────────────────────
  const garantirPastas = async () => {
    for (const p of PASTAS) {
      try { await FileSystem.makeDirectoryAsync(RAIZ + p, { intermediates: true }); } catch (e) { /* já existe */ }
    }
  };

  const atualizarArquivos = async () => {
    const out = {};
    for (const p of PASTAS) {
      try { out[p] = await FileSystem.readDirectoryAsync(RAIZ + p); } catch (e) { out[p] = []; }
    }
    setArquivos(out);
  };

  // ── câmera orbital ────────────────────────────────────────
  const applyCamera = () => {
    const { yaw, pitch, dist, target } = eng.orbit;
    const cam = eng.camera; if (!cam) return;
    eng.dirty = true;
    cam.position.set(
      target.x + dist * Math.cos(pitch) * Math.sin(yaw),
      target.y + dist * Math.sin(pitch),
      target.z + dist * Math.cos(pitch) * Math.cos(yaw),
    );
    cam.lookAt(target);
  };

  const enquadrar = () => {
    const it = eng.selId && eng.items.get(eng.selId);
    if (!it) return;
    const b = new THREE.Box3().setFromObject(it.obj);
    const c = b.getCenter(new THREE.Vector3());
    const sz = b.getSize(new THREE.Vector3()).length() || 1;
    eng.orbit.target.copy(c);
    eng.orbit.dist = Math.max(2, sz * 1.8);
    applyCamera();
  };

  // ── API entregue aos scripts do jogo ──────────────────────
  const itemDe = (obj) => { for (const it of eng.items.values()) if (it.obj === obj) return it; return null; };
  const syncHud = () => setHud([...eng.ui.values()]);

  const tocarClip = (it, nome) => {
    if (!it.mixer) it.mixer = new THREE.AnimationMixer(it.obj);
    const clip = it.clips.find((c) => c.name === nome);
    if (!clip) return;
    if (it.action) it.action.stop();
    it.action = it.mixer.clipAction(clip);
    it.action.reset().play();
  };
  const pararClip = (it) => { if (it.action) { it.action.stop(); it.action = null; } };

  const makeApi = () => ({
    THREE, scene: eng.scene, camera: eng.camera, input: eng.input,
    find: (n) => { for (const it of eng.items.values()) if (it.name === n) return it.obj; return null; },
    play: (obj, clip) => { const it = itemDe(obj); if (it) tocarClip(it, clip); },
    stop: (obj) => { const it = itemDe(obj); if (it) pararClip(it); },
    follow: (obj) => { eng.follow = obj; },
    log: (...a) => pushLog(a.map(String).join(' ')),
    ui: {
      button: (id, o = {}, h = {}) => {
        const hh = typeof h === 'function' ? { down: h } : h;
        eng.ui.set(id, { id, text: o.text || id, x: o.x ?? 80, y: o.y ?? 70, w: o.w ?? 72, h: o.h ?? 72, down: hh.down, up: hh.up });
        syncHud();
      },
      remove: (id) => { eng.ui.delete(id); delete eng.input.buttons[id]; syncHud(); },
      clear: () => { eng.ui.clear(); eng.input.buttons = {}; syncHud(); },
    },
  });

  // ── cena ──────────────────────────────────────────────────
  const onContextCreate = useCallback((gl) => {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    eng.gl = gl;
    const canvas = {
      width: w, height: h, style: {}, clientWidth: w, clientHeight: h,
      addEventListener() {}, removeEventListener() {}, getContext: () => gl,
    };
    eng.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x2a1a17, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    eng.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x2a1a17, 25, 90);
    scene.add(new THREE.HemisphereLight(0xfff1e6, 0x40302c, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    eng.sun = sun;

    // ambiente plano: chão grande + grade
    const chao = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x4a3732, roughness: 1 }),
    );
    chao.rotation.x = -Math.PI / 2;
    chao.receiveShadow = true;
    scene.add(chao);
    const grade = new THREE.GridHelper(100, 100, 0xff5227, 0x6b4a40);
    grade.position.y = 0.01;
    scene.add(grade);
    eng.scene = scene;
    qualRef.current(1); // qualidade inicial: Média (sombra 1024)

    eng.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 500);
    applyCamera();

    eng.box = new THREE.BoxHelper(new THREE.Object3D(), 0xffb648);
    eng.box.visible = false;
    scene.add(eng.box);

    // setas do gizmo (X vermelho, Y verde, Z azul)
    const gizmo = new THREE.Group();
    const mk = (d, hex) => {
      const a = new THREE.ArrowHelper(d, new THREE.Vector3(), 1.3, hex, 0.32, 0.2);
      a.line.material.depthTest = false; a.cone.material.depthTest = false;
      a.line.renderOrder = 999; a.cone.renderOrder = 999;
      return a;
    };
    eng.arrows = [
      mk(new THREE.Vector3(1, 0, 0), 0xff5a5a),
      mk(new THREE.Vector3(0, 1, 0), 0x5aff7a),
      mk(new THREE.Vector3(0, 0, 1), 0x5a9bff),
    ];
    eng.arrows.forEach((a) => gizmo.add(a));
    gizmo.visible = false;
    scene.add(gizmo);
    eng.gizmo = gizmo;
    eng.api = makeApi();

    const falhaScript = (r, e) => {
      stopRef.current();
      aviso('Erro no script "' + r.nome + '": ' + e.message);
    };

    const loop = () => {
      eng.raf = requestAnimationFrame(loop);
      const dt = Math.min(eng.clock.getDelta(), 0.05);
      const agora = Date.now();
      eng.frame++;

      if (eng.playing) {
        eng.time += dt;
        // passo fixo de 60 Hz (fixedUpdate): lógica estável mesmo se o fps oscilar
        eng.acc += dt;
        let passos = 0;
        while (eng.acc >= 1 / 60 && passos < 5) {
          eng.acc -= 1 / 60; passos++;
          for (const r of eng.runtime) {
            if (!r.fixed) continue;
            try { r.fixed(r.obj, 1 / 60, eng.api); } catch (e) { falhaScript(r, e); return; }
          }
        }
        if (passos === 5) eng.acc = 0;
        for (const r of eng.runtime) {
          if (!r.update) continue;
          try {
            const t0 = Date.now();
            r.update(r.obj, dt, eng.api);
            // protege o jogo: script que passa de 40ms em 5 frames seguidos é desligado
            if (Date.now() - t0 > 40) {
              if (++r.lento >= 5) { r.update = null; pushLog('Script "' + r.nome + '" desligado: muito lento'); }
            } else r.lento = 0;
          } catch (e) { falhaScript(r, e); return; }
        }
        if (eng.follow) {
          eng.orbit.target.lerp(eng.follow.position, Math.min(1, dt * 6));
          applyCamera();
        }
      }

      // animações (play e pré-visualização no editor)
      let animando = false;
      eng.items.forEach((it) => { if (it.mixer && it.action) { it.mixer.update(dt); animando = true; } });

      // corte por distância: objeto longe demais nem entra na GPU
      if (eng.frame % 10 === 0) {
        const cp = eng.camera.position;
        eng.items.forEach((it) => {
          const v = it.id === eng.selId || cp.distanceTo(it.obj.position) <= eng.distMax;
          if (it.obj.visible !== v) { it.obj.visible = v; eng.dirty = true; }
        });
      }

      // render sob demanda: no editor, cena parada não gasta GPU nem bateria
      const precisa = eng.playing || eng.dirty || animando || agora - eng.lastRender > 500;
      if (precisa) {
        const sel = eng.selId && eng.items.get(eng.selId);
        if (sel && !eng.playing) {
          if (eng.frame % 5 === 0 || eng.dirty) eng.box.setFromObject(sel.obj);
          eng.box.visible = true;
          const p = new THREE.Vector3(); sel.obj.getWorldPosition(p);
          eng.gizmo.position.copy(p);
          eng.gizmo.scale.setScalar(Math.max(0.3, eng.orbit.dist * 0.16));
          eng.gizmo.visible = true;
          eng.arrows.forEach((a, i) => a.scale.setScalar('xyz'[i] === eng.axis ? 1.25 : 0.8));
        } else { eng.box.visible = false; eng.gizmo.visible = false; }

        // a sombra acompanha o foco da câmera (área pequena = sombra nítida)
        if (eng.shadowOn && eng.sun) {
          const t = eng.orbit.target;
          eng.sun.target.position.copy(t);
          eng.sun.position.set(t.x + 6, t.y + 12, t.z + 8);
          eng.sun.target.updateMatrixWorld();
        }

        renderer.render(scene, eng.camera);
        gl.endFrameEXP();
        eng.lastRender = agora; eng.dirty = false; eng.fpsCount++;
      }

      if (agora - eng.fpsT >= 500) {
        const f = Math.round((eng.fpsCount * 1000) / (agora - eng.fpsT));
        if (eng.playing || animando || f > 8) setFps(f);
        const inf = renderer.info;
        setStats(inf.render.calls + ' draw · ' + Math.round(inf.render.triangles / 1000) + 'k tri · ' + inf.memory.geometries + ' geo');
        // qualidade automática: fps baixo por 3s seguidos no Play → desce um nível
        if (eng.playing) {
          eng.lowT = f < 24 ? eng.lowT + 0.5 : 0;
          if (eng.lowT >= 3 && eng.quality > 0) { eng.lowT = 0; qualRef.current(eng.quality - 1, true); }
        }
        eng.fpsCount = 0; eng.fpsT = agora;
        if (eng.playing) setLogs([...eng.logs]);
      }
    };
    eng.fpsT = Date.now();
    loop();

    // abre a cena salva do projeto, se existir
    (async () => { await garantirPastas(); await carregarCena(true); await atualizarArquivos(); })();
  }, []);

  useEffect(() => () => cancelAnimationFrame(eng.raf), []);

  // o viewport mudou (tela virou): reajusta o renderer
  const onViewLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    eng.size = { w: width, h: height };
    setTimeout(() => {
      if (!eng.renderer || !eng.gl) return;
      const w = eng.gl.drawingBufferWidth, h = eng.gl.drawingBufferHeight;
      eng.canvas.width = w; eng.canvas.height = h;
      eng.renderer.setSize(w, h, false);
      eng.camera.aspect = w / h;
      eng.camera.updateProjectionMatrix();
      eng.dirty = true;
    }, 120);
  };

  // ── itens da cena ─────────────────────────────────────────
  const registrar = (it, selecionar = true) => {
    it.id = eng.nextId++;
    it.obj.userData.engId = it.id;
    it.clips = it.clips || [];
    it.script = it.script || '';
    ligarSombras(it.obj);
    it.tris = contaTris(it.obj);
    eng.items.set(it.id, it);
    eng.scene.add(it.obj);
    setList((l) => [...l, { id: it.id, name: it.name }]);
    if (selecionar) selecionar_(it.id);
    return it;
  };

  const selecionar_ = (id) => {
    eng.selId = id;
    setSelId(id);
    const it = id && eng.items.get(id);
    setScriptText(it ? it.script || '' : '');
    bump();
  };

  const criarPrimitiva = (tipo, cor = CORES[0]) => {
    const mat = new THREE.MeshStandardMaterial({ color: cor });
    let geo;
    if (tipo === 'cubo') geo = new THREE.BoxGeometry(1, 1, 1);
    else if (tipo === 'esfera') geo = new THREE.SphereGeometry(0.6, 32, 16);
    else geo = new THREE.PlaneGeometry(4, 4);
    const m = new THREE.Mesh(geo, mat);
    if (tipo === 'plano') m.rotation.x = -Math.PI / 2; else m.position.y = tipo === 'cubo' ? 0.5 : 0.6;
    return m;
  };

  const addPrimitiva = (tipo) => {
    if (!eng.scene) return;
    const nome = tipo[0].toUpperCase() + tipo.slice(1);
    registrar({ name: nome + ' ' + eng.nextId, kind: tipo, obj: criarPrimitiva(tipo), color: CORES[0] });
  };

  const carregarArquivoModelo = async (pasta, nome) => {
    const b64 = await FileSystem.readAsStringAsync(RAIZ + pasta + '/' + nome, { encoding: 'base64' });
    return parseModelo(b64ToBuffer(b64), extDe(nome));
  };

  const addModeloDoProjeto = async (nome) => {
    try {
      aviso('Carregando ' + nome + '…');
      const r = await carregarArquivoModelo('models', nome);
      normalizar(r.obj);
      let info = '';
      if (eng.autoOtim) {
        const o = otimizarModelo(r.obj, r.clips.length > 0);
        if (o.depois < o.antes) info = 'Otimizado: ' + o.antes + ' → ' + o.depois + ' malhas.';
      }
      registrar({ name: nome.replace(/\.[^.]+$/, ''), kind: 'model', file: nome, obj: r.obj, clips: r.clips });
      aviso(info);
    } catch (e) { aviso('Erro ao carregar modelo: ' + (e && e.message)); }
  };

  const remover = () => {
    const it = eng.selId && eng.items.get(eng.selId);
    if (!it) return;
    pararClip(it);
    eng.scene.remove(it.obj);
    eng.items.delete(it.id);
    setList((l) => l.filter((i) => i.id !== it.id));
    selecionar_(null);
  };

  const duplicar = () => {
    const it = eng.selId && eng.items.get(eng.selId);
    if (!it) return;
    const o = it.obj.clone(true);
    o.position.x += 1;
    registrar({ ...it, id: undefined, name: it.name + ' cópia', obj: o, mixer: null, action: null });
  };

  // tamanho automático: ajusta o objeto selecionado para ~1 unidade
  const autoTamanho = () => {
    const it = eng.selId && eng.items.get(eng.selId);
    if (!it) return;
    const b = new THREE.Box3().setFromObject(it.obj);
    const s = b.getSize(new THREE.Vector3());
    const max = Math.max(s.x, s.y, s.z) || 1;
    it.obj.scale.multiplyScalar(1 / max);
    const b2 = new THREE.Box3().setFromObject(it.obj);
    it.obj.position.y -= b2.min.y;
    bump();
  };

  // ── importar arquivos para o projeto ──────────────────────
  const importar = async (pasta) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      const f = res.assets[0];
      const ext = extDe(f.name);
      if (!['glb', 'gltf', 'fbx'].includes(ext)) { aviso('Use .glb, .gltf ou .fbx.'); return; }
      await garantirPastas();
      const nome = nomeSeguro(f.name);
      await FileSystem.copyAsync({ from: f.uri, to: RAIZ + pasta + '/' + nome });
      await atualizarArquivos();
      if (pasta === 'models') await addModeloDoProjeto(nome);
      else await aplicarAnimacao(nome);
    } catch (e) { aviso('Erro ao importar: ' + e.message); }
  };

  const aplicarAnimacao = async (nome) => {
    const it = eng.selId && eng.items.get(eng.selId);
    if (!it) { aviso('Selecione um objeto para receber a animação.'); return; }
    try {
      aviso('Lendo animação…');
      const r = await carregarArquivoModelo('animations', nome);
      it.clips = [...it.clips, ...r.clips];
      aviso(r.clips.length + ' animação(ões) em "' + it.name + '".');
      bump();
    } catch (e) { aviso('Erro na animação: ' + e.message); }
  };

  const anexarScript = async (nome) => {
    const it = eng.selId && eng.items.get(eng.selId);
    if (!it) { aviso('Selecione um objeto para receber o script.'); return; }
    const txt = await FileSystem.readAsStringAsync(RAIZ + 'scripts/' + nome);
    it.script = txt; setScriptText(txt); aviso('Script "' + nome + '" anexado.');
  };

  const apagarArquivo = async (pasta, nome) => {
    try { await FileSystem.deleteAsync(RAIZ + pasta + '/' + nome, { idempotent: true }); } catch (e) { /* */ }
    await atualizarArquivos();
  };

  // ── salvar / abrir cena ───────────────────────────────────
  const salvarCena = async () => {
    try {
      await garantirPastas();
      const itens = [];
      for (const it of eng.items.values()) {
        const o = it.obj;
        itens.push({
          name: it.name, kind: it.kind, file: it.file || null, color: it.color || null,
          p: o.position.toArray(), r: [o.rotation.x, o.rotation.y, o.rotation.z], s: o.scale.toArray(),
          script: it.script || '', clip: it.clip || null,
        });
        if (it.script && it.script.trim()) {
          await FileSystem.writeAsStringAsync(RAIZ + 'scripts/' + nomeSeguro(it.name) + '.js', it.script);
        }
      }
      await FileSystem.writeAsStringAsync(RAIZ + 'scenes/main.json', JSON.stringify({ v: 2, itens }));
      await atualizarArquivos();
      aviso('Cena salva.');
    } catch (e) { aviso('Erro ao salvar: ' + e.message); }
  };

  const carregarCena = async (silencioso) => {
    try {
      const info = await FileSystem.getInfoAsync(RAIZ + 'scenes/main.json');
      if (!info.exists) return;
      const dados = JSON.parse(await FileSystem.readAsStringAsync(RAIZ + 'scenes/main.json'));
      eng.items.forEach((it) => eng.scene.remove(it.obj));
      eng.items.clear(); setList([]); selecionar_(null);
      for (const d of dados.itens) {
        let obj; let clips = [];
        if (d.kind === 'model') {
          try {
            const r = await carregarArquivoModelo('models', d.file); obj = r.obj; clips = r.clips;
            if (eng.autoOtim) otimizarModelo(obj, clips.length > 0);
          }
          catch (e) { continue; }
        } else obj = criarPrimitiva(d.kind, d.color || CORES[0]);
        obj.position.fromArray(d.p); obj.rotation.set(d.r[0], d.r[1], d.r[2]); obj.scale.fromArray(d.s);
        registrar({ name: d.name, kind: d.kind, file: d.file, color: d.color, obj, clips, script: d.script, clip: d.clip }, false);
      }
      if (!silencioso) aviso('Cena aberta.');
    } catch (e) { if (!silencioso) aviso('Erro ao abrir cena: ' + e.message); }
  };

  // ── exportar ──────────────────────────────────────────────
  const compartilhar = async (uri) => {
    if (Sharing && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri);
    else aviso('Salvo em: ' + uri);
  };

  const exportar = async (tipo) => {
    const objs = [...eng.items.values()].map((i) => i.obj);
    if (!objs.length) { aviso('A cena está vazia.'); return; }
    try {
      await garantirPastas();
      let uri;
      if (tipo === 'glb') {
        aviso('Exportando GLB…');
        const buf = await new Promise((res, rej) => {
          new GLTFExporter().parse(objs, res, rej, { binary: true, onlyVisible: false });
        });
        uri = RAIZ + 'exports/cena.glb';
        await FileSystem.writeAsStringAsync(uri, bufferToB64(buf), { encoding: 'base64' });
      } else if (tipo === 'obj') {
        const g = new THREE.Group();
        objs.forEach((o) => { g.add(o.clone(true)); });
        uri = RAIZ + 'exports/cena.obj';
        await FileSystem.writeAsStringAsync(uri, new OBJExporter().parse(g));
      } else {
        await salvarCena();
        uri = RAIZ + 'scenes/main.json';
      }
      await atualizarArquivos();
      aviso('');
      await compartilhar(uri);
    } catch (e) {
      aviso(tipo === 'glb'
        ? 'GLB falhou (o RN não tem Blob completo). Use OBJ ou Cena. Detalhe: ' + (e && e.message)
        : 'Erro ao exportar: ' + (e && e.message));
    }
  };

  // ── Play / Stop ───────────────────────────────────────────
  const iniciarPlay = () => {
    if (eng.playing) return;
    // guarda tudo (incluindo ossos) para restaurar no Stop
    eng.snapshot = new Map();
    eng.items.forEach((it) => it.obj.traverse((o) => {
      eng.snapshot.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
    }));
    eng.runtime = []; eng.ui.clear(); eng.input.buttons = {}; eng.input.x = 0; eng.input.y = 0;
    eng.logs = []; eng.follow = null; syncHud();
    eng.api = makeApi();
    try {
      eng.items.forEach((it) => {
        if (!it.script || !it.script.trim()) return;
        const fab = new Function(
          'THREE',
          it.script + '\nreturn { start: typeof start === "function" ? start : null,' +
          ' update: typeof update === "function" ? update : null,' +
          ' fixed: typeof fixedUpdate === "function" ? fixedUpdate : null };',
        );
        const f = fab(THREE);
        eng.runtime.push({ nome: it.name, obj: it.obj, start: f.start, update: f.update, fixed: f.fixed, lento: 0 });
      });
      eng.runtime.forEach((r) => r.start && r.start(r.obj, eng.api));
    } catch (e) {
      aviso('Erro no script: ' + e.message);
      eng.runtime = []; eng.ui.clear(); syncHud();
      return;
    }
    eng.items.forEach((it) => { if (it.clip) tocarClip(it, it.clip); });
    eng.time = 0; eng.acc = 0; eng.lowT = 0; eng.clock.getDelta();
    eng.playing = true; setPlaying(true); aviso('');
  };

  const pararPlay = () => {
    eng.playing = false; setPlaying(false);
    eng.runtime = []; eng.follow = null;
    eng.items.forEach((it) => { if (it.mixer) { it.mixer.stopAllAction(); it.action = null; } });
    if (eng.snapshot) {
      eng.snapshot.forEach((st_, o) => { o.position.copy(st_.p); o.quaternion.copy(st_.q); o.scale.copy(st_.s); });
      eng.snapshot = null;
    }
    eng.ui.clear(); eng.input.buttons = {}; eng.input.x = 0; eng.input.y = 0; syncHud();
    eng.orbit.target.set(0, 0.5, 0); applyCamera();
    bump();
  };
  stopRef.current = pararPlay;

  // ── qualidade (sombra, distância de desenho) ─────────────
  const aplicarQualidade = (q, auto) => {
    const c = QUAL[q];
    eng.quality = q; setQualidade(q);
    eng.shadowOn = c.sombra; eng.distMax = c.dist;
    if (eng.renderer && eng.sun) {
      eng.renderer.shadowMap.enabled = c.sombra;
      const sun = eng.sun;
      sun.castShadow = c.sombra;
      sun.shadow.mapSize.set(c.mapa, c.mapa);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      const cam = sun.shadow.camera;
      cam.left = -c.tam; cam.right = c.tam; cam.top = c.tam; cam.bottom = -c.tam;
      cam.near = 1; cam.far = 70;
      cam.updateProjectionMatrix();
      // materiais precisam recompilar quando a sombra liga/desliga
      eng.scene.traverse((o) => {
        if (!o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; });
      });
    }
    eng.dirty = true;
    if (auto) { pushLog('Qualidade reduzida para ' + c.nome + ' (fps baixo)'); }
  };
  qualRef.current = aplicarQualidade;

  const otimizarSelecionado = async () => {
    const it = eng.selId && eng.items.get(eng.selId);
    if (!it || it.kind !== 'model') { aviso('Selecione um modelo importado para otimizar.'); return; }
    aviso('Otimizando…');
    await esperar(30);
    try {
      const r = otimizarModelo(it.obj, it.clips.length > 0);
      it.tris = contaTris(it.obj);
      aviso(it.clips.length
        ? 'Materiais unidos. Malhas mantidas (' + r.antes + '): o modelo tem animação.'
        : 'Malhas: ' + r.antes + ' → ' + r.depois + ' (menos draw calls).');
      bump();
    } catch (e) { aviso('Erro ao otimizar: ' + e.message); }
  };

  // ── voltar ────────────────────────────────────────────────
  const sair = async () => {
    if (eng.playing) pararPlay();
    await salvarCena();
    onClose && onClose();
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { sair(); return true; });
    return () => sub.remove();
  }, []);

  // ── toque: orbitar, selecionar, arrastar ─────────────────
  const touch = useRef({ mode: 'none', last: null, dist: 0, moved: 0, downId: null }).current;
  const ndc = (x, y) => new THREE.Vector2((x / eng.size.w) * 2 - 1, -(y / eng.size.h) * 2 + 1);
  const pick = (x, y) => {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc(x, y), eng.camera);
    const hits = rc.intersectObjects([...eng.items.values()].map((i) => i.obj), true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && o.userData.engId == null) o = o.parent;
    return o ? o.userData.engId : null;
  };
  const toScreen = (v) => {
    const p = v.clone().project(eng.camera);
    return new THREE.Vector2(((p.x + 1) / 2) * eng.size.w, ((1 - p.y) / 2) * eng.size.h);
  };
  const dragObjeto = (dx, dy) => {
    const it = eng.items.get(eng.selId); if (!it) return;
    const o = it.obj, ax = eng.axis;
    const dir = new THREE.Vector3(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0);
    if (eng.mode === 'rotate') {
      it.acc = (it.acc || 0) + (dx - dy) * 0.012;
      if (eng.snap) { const passo = rad(15); const v = Math.round(it.acc / passo) * passo; o.rotation[ax] += v; it.acc -= v; }
      else { o.rotation[ax] += it.acc; it.acc = 0; }
      return;
    }
    const s0 = toScreen(o.position);
    const d = toScreen(o.position.clone().add(dir)).sub(s0);
    const delta = (dx * d.x + dy * d.y) / (d.lengthSq() || 1);
    const passo = eng.mode === 'move' ? 0.5 : 0.25;
    it.acc = (it.acc || 0) + delta;
    let aplica = it.acc;
    if (eng.snap) { aplica = Math.round(it.acc / passo) * passo; if (aplica === 0) return; it.acc -= aplica; }
    else it.acc = 0;
    if (eng.mode === 'move') o.position[ax] += aplica;
    else o.scale[ax] = Math.max(0.05, o.scale[ax] + aplica);
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const t = e.nativeEvent.touches;
      touch.moved = 0;
      if (t.length >= 2) {
        touch.mode = 'pinch';
        touch.dist = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        return;
      }
      const { locationX: x, locationY: y } = e.nativeEvent;
      touch.last = { x, y };
      const id = pick(x, y);
      touch.downId = id;
      touch.mode = id && id === eng.selId && !eng.playing ? 'object' : 'orbit';
    },
    onPanResponderMove: (e) => {
      eng.dirty = true;
      const t = e.nativeEvent.touches;
      if (t.length >= 2) {
        const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
        if (touch.mode !== 'pinch') { touch.mode = 'pinch'; touch.dist = d; }
        eng.orbit.dist = Math.min(90, Math.max(1.5, eng.orbit.dist * (touch.dist / d)));
        touch.dist = d; applyCamera(); return;
      }
      const { locationX: x, locationY: y } = e.nativeEvent;
      if (!touch.last) { touch.last = { x, y }; return; }
      const dx = x - touch.last.x, dy = y - touch.last.y;
      touch.last = { x, y };
      touch.moved += Math.abs(dx) + Math.abs(dy);
      if (touch.mode === 'object') dragObjeto(dx, dy);
      else if (touch.mode === 'orbit') {
        eng.orbit.yaw -= dx * 0.008;
        eng.orbit.pitch = Math.min(1.5, Math.max(-0.1, eng.orbit.pitch + dy * 0.008));
        applyCamera();
      }
    },
    onPanResponderRelease: () => {
      if (touch.mode !== 'pinch' && touch.moved < 8 && !eng.playing) selecionar_(touch.downId || null);
      touch.mode = 'none'; touch.last = null; bump();
    },
  })).current;

  // ── UI ────────────────────────────────────────────────────
  const sel = selId && eng.items.get(selId);
  const o = sel && sel.obj;
  const setP = (ax, v) => { o.position[ax] = v; bump(); };
  const setR = (ax, v) => { o.rotation[ax] = rad(v); bump(); };
  const setS = (ax, v) => { o.scale[ax] = Math.max(0.01, v); bump(); };
  const AX = [['x', '#ff5a5a'], ['y', '#5aff7a'], ['z', '#5a9bff']];

  const mudarScript = (txt) => { setScriptText(txt); if (sel) sel.script = txt; };
  const corar = (hex) => {
    if (!sel || !sel.obj.isMesh) return;
    sel.obj.material.color.setHex(hex); sel.color = hex; bump();
  };

  const padL = Math.max(insets.left, 6), padR = Math.max(insets.right, 6);

  return (
    <View style={st.root}>
      {/* ── barra de cima ── */}
      <View style={[st.top, { paddingLeft: padL, paddingRight: padR }]}>
        <TouchableOpacity onPress={sair} style={st.back}><Text style={st.backTxt}>‹ Voltar</Text></TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingHorizontal: 6 }}>
          <Chip small label="Salvar" onPress={salvarCena} />
          <Chip small label="+ Cubo" onPress={() => addPrimitiva('cubo')} />
          <Chip small label="+ Esfera" onPress={() => addPrimitiva('esfera')} />
          <Chip small label="+ Plano" onPress={() => addPrimitiva('plano')} />
          <Chip small label="Importar modelo" onPress={() => importar('models')} />
          <Chip small label="Exportar GLB" onPress={() => exportar('glb')} />
          <Chip small label="Exportar OBJ" onPress={() => exportar('obj')} />
          <Chip small label="Exportar cena" onPress={() => exportar('cena')} />
        </ScrollView>
        <Text style={st.fps}>{fps} fps</Text>
        <TouchableOpacity onPress={playing ? pararPlay : iniciarPlay}
          style={[st.play, { backgroundColor: playing ? C.error : C.green }]}>
          <Text style={st.playTxt}>{playing ? 'Stop' : 'Play'}</Text>
        </TouchableOpacity>
      </View>

      <View style={st.body}>
        {/* ── painel esquerdo: hierarquia / arquivos ── */}
        <View style={[st.left, { paddingLeft: padL }]}>
          <View style={st.tabs}>
            <Chip small label="Objetos" on={aba === 'hier'} onPress={() => setAba('hier')} />
            <Chip small label="Arquivos" on={aba === 'arq'} onPress={() => { setAba('arq'); atualizarArquivos(); }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 5, paddingVertical: 6 }}>
            {aba === 'hier' ? (
              list.length ? list.map((i) => (
                <Chip key={i.id} small label={i.name} on={i.id === selId} color={C.gold} onPress={() => selecionar_(i.id)} />
              )) : <Text style={st.dim}>Cena vazia. Adicione um objeto ou importe um modelo.</Text>
            ) : (
              <>
                <Chip small label="Importar animação (FBX/GLB)" onPress={() => importar('animations')} />
                {PASTAS.map((p) => (
                  <View key={p} style={{ gap: 4 }}>
                    <Text style={st.pasta}>{ROTULO_PASTA[p]}/</Text>
                    {(arquivos[p] || []).length === 0 && <Text style={st.dim}>vazio</Text>}
                    {(arquivos[p] || []).map((nome) => (
                      <Chip key={p + nome} small label={nome}
                        onPress={() => {
                          if (p === 'models') addModeloDoProjeto(nome);
                          else if (p === 'animations') aplicarAnimacao(nome);
                          else if (p === 'scripts') anexarScript(nome);
                          else if (p === 'scenes') carregarCena(false);
                          else compartilhar(RAIZ + p + '/' + nome);
                        }}
                        onLongPress={() => apagarArquivo(p, nome)} />
                    ))}
                  </View>
                ))}
                <Text style={st.dim}>Toque: usar o arquivo. Segure: apagar.</Text>
              </>
            )}
          </ScrollView>
        </View>

        {/* ── viewport ── */}
        <View style={st.view} onLayout={onViewLayout}>
          <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
          <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

          {/* HUD do jogo (botões criados por JS + joystick) */}
          {playing && hud.map((b) => (
            <TouchableOpacity
              key={b.id} activeOpacity={0.7}
              style={[st.hudBtn, { left: b.x + '%', top: b.y + '%', width: b.w, height: b.h, borderRadius: b.h / 2 }]}
              onPressIn={() => { eng.input.buttons[b.id] = true; try { b.down && b.down(); } catch (e) { pushLog(String(e.message)); } }}
              onPressOut={() => { eng.input.buttons[b.id] = false; try { b.up && b.up(); } catch (e) { pushLog(String(e.message)); } }}>
              <Text style={st.hudTxt}>{b.text}</Text>
            </TouchableOpacity>
          ))}
          {playing && joystick && (
            <View style={st.joyWrap}><Joystick onChange={(x, y) => { eng.input.x = x; eng.input.y = y; }} /></View>
          )}
          {playing && logs.length > 0 && (
            <View style={st.logs} pointerEvents="none">
              {logs.map((l, i) => <Text key={i} style={st.logTxt} numberOfLines={1}>{l}</Text>)}
            </View>
          )}
          {playing && <View style={st.badge} pointerEvents="none"><Text style={st.badgeTxt}>Executando</Text></View>}
          {mostrarStats && !!stats && (
            <View style={st.stats} pointerEvents="none"><Text style={st.statsTxt}>{stats}</Text></View>
          )}
          {!!msg && (
            <TouchableOpacity style={st.toast} onPress={() => setMsg('')} activeOpacity={0.9}>
              <Text style={st.toastTxt}>{msg}</Text>
            </TouchableOpacity>
          )}

          {/* ferramentas de transformação */}
          {!playing && (
            <View style={st.tools}>
              <Chip small label="Mover" on={mode === 'move'} onPress={() => setMode('move')} />
              <Chip small label="Girar" on={mode === 'rotate'} onPress={() => setMode('rotate')} />
              <Chip small label="Escalar" on={mode === 'scale'} onPress={() => setMode('scale')} />
              {AX.map(([a, col]) => (
                <Chip key={a} small label={a.toUpperCase()} on={axis === a} color={col} onPress={() => setAxis(a)} />
              ))}
              <Chip small label="Grade" on={snap} onPress={() => setSnap((v) => !v)} />
              <Chip small label="Foco" onPress={enquadrar} />
            </View>
          )}

          {/* editor de script */}
          {mostrarScript && sel && !playing && (
            <View style={st.editor}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <Text style={[st.pasta, { flex: 1 }]} numberOfLines={1}>Script de {sel.name}</Text>
                <Chip small label="Girar" onPress={() => mudarScript(SCRIPT_GIRAR)} />
                <Chip small label="Controle" onPress={() => mudarScript(SCRIPT_CONTROLE)} />
                <Chip small label="Fechar" color={C.gold} on onPress={() => setMostrarScript(false)} />
              </View>
              <TextInput
                style={st.code} multiline value={scriptText} onChangeText={mudarScript}
                placeholder="function start(obj, api) {}  function update(obj, dt, api) {}"
                placeholderTextColor={C.dim} autoCapitalize="none" autoCorrect={false} spellCheck={false}
              />
            </View>
          )}
        </View>

        {/* ── painel direito: inspetor ── */}
        <View style={[st.right, { paddingRight: padR }]}>
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {sel ? (
              <>
                <Text style={st.pasta} numberOfLines={1}>{sel.name}</Text>
                <Text style={st.sec}>Posição</Text>
                <View style={st.rowNum}>{AX.map(([a, col]) => (
                  <NumField key={a} label={a.toUpperCase()} color={col} value={o.position[a]} onCommit={(v) => setP(a, v)} />))}</View>
                <Text style={st.sec}>Rotação (°)</Text>
                <View style={st.rowNum}>{AX.map(([a, col]) => (
                  <NumField key={a} label={a.toUpperCase()} color={col} value={deg(o.rotation[a])} onCommit={(v) => setR(a, v)} />))}</View>
                <Text style={st.sec}>Escala</Text>
                <View style={st.rowNum}>{AX.map(([a, col]) => (
                  <NumField key={a} label={a.toUpperCase()} color={col} value={o.scale[a]} onCommit={(v) => setS(a, v)} />))}</View>

                <Text style={[st.dim, sel.tris > 80000 && { color: C.error }]}>
                  {Math.round((sel.tris || 0) / 100) / 10}k triângulos{sel.tris > 80000 ? ' — pesado, use Otimizar' : ''}
                </Text>
                <View style={st.rowWrap}>
                  <Chip small label="Otimizar" color={C.green} on onPress={otimizarSelecionado} />
                  <Chip small label="Tamanho auto" onPress={autoTamanho} />
                  <Chip small label="Duplicar" onPress={duplicar} />
                  <Chip small label="Excluir" color={C.error} on onPress={remover} />
                </View>

                {sel.obj.isMesh && (
                  <>
                    <Text style={st.sec}>Cor</Text>
                    <View style={st.rowWrap}>
                      {CORES.map((hx) => (
                        <TouchableOpacity key={hx} onPress={() => corar(hx)}
                          style={[st.cor, { backgroundColor: '#' + hx.toString(16).padStart(6, '0') }]} />
                      ))}
                    </View>
                  </>
                )}

                <Text style={st.sec}>Script (JS)</Text>
                <Chip small label={mostrarScript ? 'Fechar editor' : (sel.script ? 'Editar script' : 'Criar script')}
                  on={mostrarScript} onPress={() => setMostrarScript((v) => !v)} />

                {sel.clips.length > 0 && (
                  <>
                    <Text style={st.sec}>Animações</Text>
                    <View style={st.rowWrap}>
                      {sel.clips.map((c, i) => (
                        <Chip key={c.name + i} small label={c.name || 'clip ' + i} color={C.green}
                          on={sel.clip === c.name}
                          onPress={() => { sel.clip = c.name; tocarClip(sel, c.name); bump(); }} />
                      ))}
                      <Chip small label="Parar" onPress={() => { sel.clip = null; pararClip(sel); bump(); }} />
                    </View>
                    <Text style={st.dim}>A animação marcada toca sozinha no Play.</Text>
                  </>
                )}
              </>
            ) : (
              <Text style={st.dim}>
                Toque num objeto para selecionar. Arraste o fundo para orbitar e use dois dedos para zoom.
                Arraste o objeto selecionado para mover no eixo escolhido.
              </Text>
            )}
            <Text style={st.sec}>Qualidade</Text>
            <View style={st.rowWrap}>
              {QUAL.map((c, i) => (
                <Chip key={c.nome} small label={c.nome} on={qualidade === i} color={C.gold} onPress={() => aplicarQualidade(i)} />
              ))}
            </View>
            <Text style={st.dim}>
              {QUAL[qualidade].sombra ? 'Sombra ' + QUAL[qualidade].mapa + ' ligada' : 'Sombra desligada'} · desenha até {QUAL[qualidade].dist} m
            </Text>
            <View style={st.rowWrap}>
              <Chip small label={autoOtim ? 'Otimizar ao importar: sim' : 'Otimizar ao importar: não'} on={autoOtim} onPress={() => setAutoOtim((v) => !v)} />
              <Chip small label={mostrarStats ? 'Estatísticas: sim' : 'Estatísticas: não'} on={mostrarStats} onPress={() => setMostrarStats((v) => !v)} />
              {playing === false && (
                <Chip small label={joystick ? 'Joystick: ligado' : 'Joystick: desligado'} on={joystick} onPress={() => setJoystick((v) => !v)} />
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.panel },
  top: { flexDirection: 'row', alignItems: 'center', height: 44, borderBottomWidth: 1, borderColor: C.line, backgroundColor: C.panel },
  back: { paddingHorizontal: 8, paddingVertical: 6 },
  backTxt: { color: C.ink, fontSize: 14, fontWeight: '600' },
  fps: { color: C.dim, fontSize: 11, marginHorizontal: 8 },
  play: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 8, marginRight: 4 },
  playTxt: { color: '#000', fontWeight: '800', fontSize: 13 },
  body: { flex: 1, flexDirection: 'row' },
  left: { width: 170, borderRightWidth: 1, borderColor: C.line, backgroundColor: C.panel, paddingRight: 6 },
  right: { width: 210, borderLeftWidth: 1, borderColor: C.line, backgroundColor: C.panel, paddingLeft: 8, paddingTop: 8 },
  view: { flex: 1, backgroundColor: '#000' },
  tabs: { flexDirection: 'row', gap: 6, paddingTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel2 },
  chipTxt: { color: C.ink, fontSize: 12 },
  pasta: { color: C.gold, fontSize: 12, fontWeight: '700' },
  sec: { color: C.dim, fontSize: 11 },
  dim: { color: C.dim, fontSize: 11 },
  rowNum: { flexDirection: 'row', gap: 4 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  num: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.panel2, borderRadius: 6, borderWidth: 1, borderColor: C.line, paddingLeft: 4 },
  numLbl: { fontSize: 10, fontWeight: '800' },
  numInput: { flex: 1, color: C.ink, fontSize: 11, paddingVertical: 4, paddingHorizontal: 3, minWidth: 0 },
  cor: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: C.line },
  tools: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', gap: 6, flexWrap: 'wrap', right: 8 },
  hudBtn: { position: 'absolute', backgroundColor: 'rgba(255,82,39,0.55)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' },
  hudTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  joyWrap: { position: 'absolute', left: 16, bottom: 16 },
  joy: { width: 120, height: 120, padding: 14 },
  joyBase: { width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  joyKnob: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.7)' },
  logs: { position: 'absolute', left: 8, top: 8, maxWidth: '55%', backgroundColor: 'rgba(0,0,0,0.5)', padding: 6, borderRadius: 6 },
  logTxt: { color: '#9fe', fontSize: 11 },
  stats: { position: 'absolute', right: 8, top: 34, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statsTxt: { color: '#9fe', fontSize: 10 },
  badge: { position: 'absolute', right: 8, top: 8, backgroundColor: C.green, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  badgeTxt: { color: '#000', fontWeight: '700', fontSize: 11 },
  toast: { position: 'absolute', left: 10, right: 10, top: 36, backgroundColor: 'rgba(0,0,0,0.82)', padding: 10, borderRadius: 8 },
  toastTxt: { color: C.ink, fontSize: 12 },
  editor: { position: 'absolute', left: 8, right: 8, top: 8, bottom: 44, backgroundColor: 'rgba(23,12,11,0.97)', borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 8 },
  code: {
    flex: 1, color: C.ink, backgroundColor: C.panel2, borderRadius: 8, padding: 8, fontSize: 12,
    textAlignVertical: 'top', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
