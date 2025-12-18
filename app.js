import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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
  if (!c) {
    setThreeStatus(`座標未登録: ${id}`);
    return;
  }

  if (!viewer) {
    setThreeStatus("3D読み込み中…（少し待ってからクリックしてください）");
    return;
  }

  window.clearTimeout(coordBlinkTimeout);
  coordBlinkTimeout = window.setTimeout(() => {
    viewer?.clearHighlight?.();
  }, 1800);

  viewer.highlightCoord({
    coord: c,
    side: cFront ? "front" : "back",
    id,
  });
}

function render() {
  const ids = filterIds();
  renderList(ids);
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

  let mixer = null;
  let modelBounds = null;
  let highlightMesh = null;
  let highlightInterval = 0;

  const setHighlightVisible = (on) => {
    if (!highlightMesh) return;
    highlightMesh.visible = on;
  };

  const clearHighlight = () => {
    window.clearInterval(highlightInterval);
    highlightInterval = 0;
    setHighlightVisible(false);
  };

  const highlightCoord = ({ coord, side, id }) => {
    if (!modelBounds) {
      setThreeStatus("3D読み込み中…（座標の反映待ち）");
      return;
    }
    if (!highlightMesh) return;

    const xNorm = (coord?.x ?? 0) / 100;
    const yNorm = (coord?.y ?? 0) / 230;

    const x = THREE.MathUtils.lerp(modelBounds.min.x, modelBounds.max.x, xNorm);
    const y = THREE.MathUtils.lerp(modelBounds.max.y, modelBounds.min.y, yNorm);
    const zPad = (modelBounds.max.z - modelBounds.min.z) * 0.03 || 0.02;
    const z = side === "back" ? modelBounds.min.z - zPad : modelBounds.max.z + zPad;

    highlightMesh.position.set(x, y, z);

    clearHighlight();
    setHighlightVisible(true);
    let on = true;
    highlightInterval = window.setInterval(() => {
      on = !on;
      setHighlightVisible(on);
    }, 180);
    setThreeStatus(`highlight: ${id}`);
  };

  loader.load(
    modelUrl.toString(),
    (gltf) => {
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

      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
        setThreeStatus(`loaded: ${gltf.animations.length} animation(s)`);
      } else {
        setThreeStatus("loaded");
      }
    },
    (ev) => {
      if (!ev.total) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      setThreeStatus(`loading... ${pct}%`);
    },
    (err) => {
      console.error(err);
      setThreeStatus("failed to load glb (check path / server)");
    },
  );

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
    highlightCoord,
    clearHighlight,
    dispose() {
      clearHighlight();
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
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
  modelUrl: new URL("../scene (2).glb", import.meta.url),
});
