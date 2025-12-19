import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const els = {
  mode: document.getElementById("mode"),
  meridian: document.getElementById("meridian"),
  symptom: document.getElementById("symptom"),
  search: document.getElementById("search"),
  list: document.getElementById("list"),
  cardTpl: document.getElementById("card"),
  threeContainer: document.getElementById("threeContainer"),
  threeStatus: document.getElementById("threeStatus"),
};

let DB = { points: {}, symptoms: [] };
let coordsDB = { front: {}, back: {} };

let coordBlinkTimeout = 0;
let viewer = null;
let lastActiveIds = [];

// 手動対応表: card ID -> GLBノード名（PT_付き）
// 候補が複数あるものは配列で登録（見つかったものを使用）
const nodeNameMap = {
  // LI
  LI1: "PT_LI1",
  LI2: "PT_LI2",
  LI3: "PT_LI3",
  LI4: "PT_LI4",
  LI5: "PT_LI5",
  LI6: "PT_LI6",
  LI7: "PT_LI7",
  LI8: "PT_LI8",
  LI9: "PT_LI9",
  LI10: "PT_LI10",
  LI11: "PT_LI11",
  LI12: "PT_LI12",
  LI13: "PT_LI13",
  LI14: "PT_LI14",
  LI15: "PT_LI15",
  LI16: "PT_LI16",
  LI17: "PT_LI17",
  LI18: "PT_LI18",
  LI19: "PT_LI19",
  LI20: "PT_LI20",
  // ST
  ST1: "PT_ST1",
  ST2: "PT_ST2",
  ST3: "PT_ST3",
  ST4: "PT_ST4",
  ST5: "PT_ST5",
  ST6: "PT_ST6",
  ST7: "PT_ST7",
  ST8: "PT_ST8",
  ST9: "PT_ST9",
  ST10: "PT_ST10",
  ST11: "PT_ST11",
  ST12: "PT_ST12",
  ST13: "PT_ST13",
  ST14: "PT_ST14",
  ST15: "PT_ST15",
  ST16: "PT_ST16",
  ST17: "PT_ST17",
  ST18: "PT_ST18",
  ST19: "PT_ST19",
  ST20: "PT_ST20",
  ST21: "PT_ST21",
  ST22: "PT_ST22",
  ST23: "PT_ST23",
  ST24: "PT_ST24",
  ST25: "PT_ST25",
  ST26: "PT_ST26",
  ST27: "PT_ST27",
  ST28: "PT_ST28",
  ST29: "PT_ST29",
  ST30: "PT_ST30",
  ST31: "PT_ST31",
  ST32: "PT_ST32",
  ST33: "PT_ST33",
  ST34: "PT_ST34",
  ST35: "PT_ST35",
  ST36: "PT_ST36",
  // 有名ツボ追加
  PC6: "PT_PC6",
  HT7: "PT_HT7",
  SP6: "PT_SP6",
  LV3: ["PT_LV3", "PT_LR3"],
  LR3: ["PT_LV3", "PT_LR3"], // 別表記
  GB20: "PT_GB20",
  GB21: "PT_GB21",
  BL40: "PT_BL40",
  KI3: "PT_KI3",
  GV20: "PT_DU20", // 同義
  DU20: "PT_DU20",
  CV12: "PT_CV12",
  // 外関（Gaikan / Waiguan）
  TE5: ["PT_TE5", "PT_TB5", "PT_SJ5"],
  SJ5: ["PT_SJ5", "PT_TE5", "PT_TB5"],
  TB5: ["PT_TB5", "PT_TE5", "PT_SJ5"],
  // 風府
  GV16: ["PT_GV16", "PT_DU16"],
  DU16: ["PT_DU16", "PT_GV16"],
};

async function loadAll() {
  const [points, symptoms, coords] = await Promise.all([
    fetch("./data/points.json").then((r) => r.json()),
    fetch("./data/symptoms.json").then((r) => r.json()),
    fetch("./data/coords.json").then((r) => r.json()),
  ]);
  DB.points = points;
  DB.symptoms = symptoms;
  coordsDB = coords || coordsDB;

  const mers = new Set(Object.values(points).map((p) => p.meridian).filter(Boolean));
  [...mers].sort().forEach((m) => {
    const option = document.createElement("option");
    option.value = m;
    option.textContent = m;
    els.meridian.appendChild(option);
  });

  els.symptom.innerHTML = "";
  symptoms.forEach((s) => {
    const option = document.createElement("option");
    option.value = s.id;
    option.textContent = s.label;
    els.symptom.appendChild(option);
  });
  els.symptom.value = symptoms[0]?.id || "";

  render();
}

function filterIds() {
  const q = (els.search.value || "").toLowerCase().trim();
  const mer = els.meridian.value;
  const mode = els.mode.value;
  let ids = [];

  if (mode === "basic") {
    const sym = DB.symptoms.find((s) => s.id === els.symptom.value) || DB.symptoms[0];
    ids = sym ? sym.point_ids.slice() : [];
  } else {
    ids = Object.keys(DB.points || {});
  }

  if (mer) ids = ids.filter((id) => (DB.points[id]?.meridian || "") === mer);
  if (q) {
    ids = ids.filter((id) => {
      const p = DB.points[id] || {};
      return (
        id.toLowerCase().includes(q) ||
        (p.name_ja || "").includes(q) ||
        (p.name_en || "").toLowerCase().includes(q) ||
        (p.region || "").toLowerCase().includes(q)
      );
    });
  }
  return ids;
}

function cardNode(id) {
  const p = DB.points[id];
  if (!p) return null;

  const c = els.cardTpl.content.cloneNode(true);

  c.querySelector(".name").textContent = p.name_ja || id;
  c.querySelector(".mer").textContent = p.meridian || "";
  c.querySelector(".en").textContent = p.name_en ? p.name_en : "";
  c.querySelector(".region").textContent = p.region ? `部位：${p.region}` : "";

  const nice = p.location_simple?.trim() ? p.location_simple : p.location || "";
  c.querySelector(".loc").textContent = nice;

  const fxWrap = c.querySelector('[data-role="effects"]');
  if (Array.isArray(p.effects) && p.effects.length) {
    p.effects.forEach((tag) => {
      const span = document.createElement("span");
      span.className = "effect";
      span.textContent = tag;
      fxWrap.appendChild(span);
    });
  }

  c.querySelector(".depth").textContent = p.depth ? `深さ：${p.depth}` : "";
  c.querySelector(".src").textContent = p.source ? `出典：${p.source}` : "";

  const node = c.firstElementChild;
  node.dataset.id = id;
  node.style.cursor = "pointer";
  node.addEventListener("click", () => {
    selectCard(id);
    blinkCoord(id);
  });
  return node;
}

function renderList(ids) {
  els.list.innerHTML = "";
  ids.forEach((id) => {
    const node = cardNode(id);
    if (node) els.list.appendChild(node);
  });
}

function selectCard(id) {
  const card = [...els.list.children].find((n) => n.dataset.id === id);
  if (!card) return;

  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("bg-slate-100");
  setTimeout(() => card.classList.remove("bg-slate-100"), 800);
}

function blinkCoord(id) {
  const cFront = coordsDB?.front?.[id] ?? null;
  const cBack = coordsDB?.back?.[id] ?? null;
  const c = cFront ?? cBack;
  if (!viewer) {
    setThreeStatus("3D読み込み中…（少し待ってからクリックしてください）");
    return;
  }

  window.clearTimeout(coordBlinkTimeout);
  coordBlinkTimeout = window.setTimeout(() => {
    viewer?.clearHighlight?.();
  }, 1800);

  viewer.highlightPoint({
    coord: c,
    side: cFront ? "front" : cBack ? "back" : null,
    id,
  });
}

function render() {
  const ids = filterIds();
  lastActiveIds = ids;
  renderList(ids);
  if (viewer?.setActivePoints) viewer.setActivePoints(ids);
}

["change", "input"].forEach((ev) => {
  els.mode.addEventListener(ev, render);
  els.meridian.addEventListener(ev, render);
  els.symptom.addEventListener(ev, render);
  els.search.addEventListener(ev, render);
});

function setThreeStatus(message) {
  if (!els.threeStatus) return;
  els.threeStatus.textContent = message || "";
}

function startThreeViewer({ containerEl, modelUrl }) {
  if (!containerEl) return null;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "three-canvas";
  containerEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
  camera.position.set(0.7, 0.6, 1.2);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.35, 0);
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(2, 3, 2);
  scene.add(dir);

  const group = new THREE.Group();
  scene.add(group);

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/");
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);

  let mixer = null;
  let modelBounds = null;
  let highlightMesh = null;
  let highlightInterval = 0;
  const pointNodeIndex = new Map(); // key -> Object3D (aliases registered during traverse)
  const tmpV = new THREE.Vector3();
  const idleMarkers = new Map(); // id -> Mesh (soft glow)
  let passiveGeo = null;
  let passiveMat = null;

  const setHighlightVisible = (on) => {
    if (!highlightMesh) return;
    highlightMesh.visible = on;
  };

  const clearHighlight = () => {
    window.clearInterval(highlightInterval);
    highlightInterval = 0;
    setHighlightVisible(false);
  };

  const highlightPoint = ({ coord, side, id }) => {
    if (!highlightMesh || !modelBounds) {
      setThreeStatus("3D読み込み中…（座標の反映待ち）");
      return;
    }

    const ptName = (() => {
      const mapped = nodeNameMap[id.toUpperCase()];
      if (mapped) return Array.isArray(mapped) ? mapped[0] : mapped;
      const m = String(id).toUpperCase().match(/^([A-Z]+)(\d+)$/);
      if (!m) return null;
      const [, prefix, num] = m;
      const padded = num.padStart(2, "0");
      return `PT_${prefix}${padded}`;
    })();

    const aliases = (() => {
      const raw = String(id).toUpperCase();
      const m = raw.match(/^([A-Z]+)(\d+)$/);
      if (!m) {
        const mapped = nodeNameMap[raw];
        return Array.isArray(mapped) ? mapped : [mapped, raw].filter(Boolean);
      }
      const [, prefix, num] = m;
      const padded = num.padStart(2, "0");
      const numInt = Number(num).toString(); // leading zeroを削除した数値表記
      const mapped = nodeNameMap[raw];
      const mappedList = Array.isArray(mapped) ? mapped : [mapped].filter(Boolean);
      return [
        ...mappedList,
        ptName,
        `PT_${prefix}${num}`, // 非ゼロパディング
        `PT_${prefix}${padded}`,
        `PT_${prefix}${numInt}`,
        raw,
        `${prefix}${num}`,
        `${prefix}${padded}`,
        `${prefix}${numInt}`,
      ].filter(Boolean);
    })();

    const targetPos = (() => {
      const matched = aliases.find((a) => a && pointNodeIndex.has(a));
      if (matched) {
        const obj = pointNodeIndex.get(matched);
        obj.getWorldPosition(tmpV);
        group.worldToLocal(tmpV);
        setThreeStatus(`highlight: ${matched}`);
        return tmpV.clone();
      }
if (coord) {
  setThreeStatus(`ノード未検出（2D無効）: ${id}`);
  console.warn("node not found -> fallback blocked", { id, coord, aliases });
  return null;
}
      setThreeStatus(`ノード/座標なし: ${id}`);
      return null;
    })();

    if (!targetPos) return;
    highlightMesh.position.copy(targetPos);

    clearHighlight();
    setHighlightVisible(true);
    let on = true;
    highlightInterval = window.setInterval(() => {
      on = !on;
      setHighlightVisible(on);
    }, 180);
  };

  const getPointPosition = (id, coord, side) => {
    if (!modelBounds) return null;
    const raw = String(id).toUpperCase();
    const m = raw.match(/^([A-Z]+)(\d+)$/);
    const padded = m ? m[2].padStart(2, "0") : null;
    const numInt = m ? Number(m[2]).toString() : null;
    const mapped = nodeNameMap[raw];
    const mappedList = Array.isArray(mapped) ? mapped : [mapped].filter(Boolean);
    const aliases = [
      ...mappedList,
      m ? `PT_${m[1]}${m[2]}` : null,
      m ? `PT_${m[1]}${padded}` : null,
      m ? `PT_${m[1]}${numInt}` : null,
      raw,
      m ? `${m[1]}${m[2]}` : null,
      m ? `${m[1]}${padded}` : null,
      m ? `${m[1]}${numInt}` : null,
    ].filter(Boolean);

    const matched = aliases.find((a) => pointNodeIndex.has(a));
    if (matched) {
      const obj = pointNodeIndex.get(matched);
      obj.getWorldPosition(tmpV);
      group.worldToLocal(tmpV);
      return tmpV.clone();
    }

    if (coord) {
      const xNorm = (coord?.x ?? 0) / 100;
      const yNorm = (coord?.y ?? 0) / 230;
      const x = THREE.MathUtils.lerp(modelBounds.min.x, modelBounds.max.x, xNorm);
      const y = THREE.MathUtils.lerp(modelBounds.max.y, modelBounds.min.y, yNorm);
      const zPad = (modelBounds.max.z - modelBounds.min.z) * 0.03 || 0.02;
      const z = side === "back" ? modelBounds.min.z - zPad : modelBounds.max.z + zPad;
      return new THREE.Vector3(x, y, z);
    }
    return null;
  };

  const setActivePoints = (ids) => {
    if (!modelBounds || !highlightMesh) return;
    if (!passiveGeo || !passiveMat) {
      const r = Math.max(modelBounds.max.x - modelBounds.min.x, 1) * 0.006;
      passiveGeo = new THREE.SphereGeometry(r, 12, 10);
      passiveMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xfacc15,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.7,
      });
    }

    const next = new Set(ids || []);
    // 更新・生成
    next.forEach((id) => {
      const upper = String(id).toUpperCase();
      const cFront = coordsDB?.front?.[upper] ?? coordsDB?.front?.[id] ?? null;
      const cBack = coordsDB?.back?.[upper] ?? coordsDB?.back?.[id] ?? null;
      const pos = getPointPosition(id, cFront ?? cBack, cFront ? "front" : cBack ? "back" : null);
      if (!pos) return;
      let mesh = idleMarkers.get(id);
      if (!mesh) {
        mesh = new THREE.Mesh(passiveGeo, passiveMat);
        mesh.visible = true;
        idleMarkers.set(id, mesh);
        group.add(mesh);
      }
      mesh.position.copy(pos);
      mesh.visible = true;
    });

    // 非表示にする
    idleMarkers.forEach((mesh, id) => {
      if (!next.has(id)) mesh.visible = false;
    });
  };

  const onGltfLoaded = (gltf) => {
      group.add(gltf.scene);

      // ざっくり中央寄せ（モデルにより調整が必要）
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(center);

      modelBounds = new THREE.Box3().setFromObject(gltf.scene);
      const maxAxis = Math.max(size.x, size.y, size.z) || 1;
      camera.position.set(maxAxis * 0.9, maxAxis * 0.7, maxAxis * 1.2);
      controls.target.set(0, size.y * 0.1, 0);
      controls.update();

      const r = maxAxis * 0.012;
      highlightMesh = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 16),
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xfacc15,
          emissiveIntensity: 1.25,
        }),
      );
      highlightMesh.visible = false;
      group.add(highlightMesh);

      gltf.scene.traverse((obj) => {
        if (!obj?.name) return;
        const name = String(obj.name);
        const upper = name.toUpperCase();
        // 1) そのまま
        if (!pointNodeIndex.has(name)) pointNodeIndex.set(name, obj);
        if (!pointNodeIndex.has(upper)) pointNodeIndex.set(upper, obj);

        // 2) PT_ 接頭辞（推奨形式）
        if (upper.startsWith("PT_") && !pointNodeIndex.has(upper)) pointNodeIndex.set(upper, obj);

        // 3) LI4_合谷 など「<ID>_」形式
        const m = upper.match(/^([A-Z]+)(\d+)[_\\s-]?.*$/);
        if (m) {
          const [, prefix, num] = m;
          const compact = `${prefix}${num}`;
          const padded = `${prefix}${num.padStart(2, "0")}`;
          if (!pointNodeIndex.has(compact)) pointNodeIndex.set(compact, obj);
          if (!pointNodeIndex.has(padded)) pointNodeIndex.set(padded, obj);
          const pt = `PT_${padded}`;
          if (!pointNodeIndex.has(pt)) pointNodeIndex.set(pt, obj);
        }
      });

      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
        setThreeStatus(`loaded: ${gltf.animations.length} animation(s)`);
      } else {
        setThreeStatus("loaded");
      }

      // モデル読み込み後に、現在の絞り込みリストを再反映
      setActivePoints(lastActiveIds);
    };

  const onGltfError = (err) => {
    console.error(err);
    const msg = err?.message ? String(err.message) : String(err);
    setThreeStatus(`failed to load glb: ${msg}`);
  };

  const validateGlb = (arrayBuffer) => {
    const bytes = arrayBuffer.byteLength;
    if (bytes < 20) return { ok: false, reason: `too small (${bytes} bytes)` };

    const dv = new DataView(arrayBuffer);
    const magic =
      String.fromCharCode(dv.getUint8(0)) +
      String.fromCharCode(dv.getUint8(1)) +
      String.fromCharCode(dv.getUint8(2)) +
      String.fromCharCode(dv.getUint8(3));
    if (magic !== "glTF") return { ok: false, reason: `not a GLB (magic=${magic})` };

    const version = dv.getUint32(4, true);
    if (version !== 2) return { ok: false, reason: `unsupported version ${version}` };

    const declaredLen = dv.getUint32(8, true);
    if (declaredLen !== bytes) {
      return {
        ok: false,
        reason: `truncated or corrupt (header length=${declaredLen}, file size=${bytes})`,
      };
    }

    return { ok: true };
  };

  // `loader.load()` の内部エラー（RangeError）を避けるため、先にfetchして整合性チェックしてからparseする
  (async () => {
    try {
      setThreeStatus("downloading...");
      const res = await fetch(modelUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();

      const v = validateGlb(ab);
      if (!v.ok) throw new Error(`GLB ${v.reason}`);

      const basePath = new URL("./", modelUrl).toString();
      setThreeStatus("parsing...");
  loader.parse(ab, basePath, onGltfLoaded, onGltfError);
    } catch (e) {
      onGltfError(e);
    }
  })();

  const clock = new THREE.Clock();
  const resize = () => {
    const w = containerEl.clientWidth || 1;
    const h = containerEl.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();

  const onResize = () => resize();
  window.addEventListener("resize", onResize);

  let raf = 0;
  const tick = () => {
    raf = window.requestAnimationFrame(tick);
    const dt = clock.getDelta();
    controls.update();
    if (mixer) mixer.update(dt);
    renderer.render(scene, camera);
  };
  tick();

  return {
    highlightPoint,
    clearHighlight,
    setActivePoints,
    notifyModelReady() {
      setActivePoints(lastActiveIds);
    },
    dispose() {
      clearHighlight();
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      draco.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

loadAll();

// NOTE: `tubo1/` から見て、glb は1つ上の階層に置かれている想定。
// パスを変える場合はここだけ変更すればOK。
setThreeStatus("loading...");
viewer = startThreeViewer({
  containerEl: els.threeContainer,
  modelUrl: new URL("./assets/scene (2).glb", import.meta.url),
});
