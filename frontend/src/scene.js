// Visualisasi Three.js: scene HANYA membaca state engine lalu menggambarnya.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STATIONS, DURATION } from "./engine.js";

const STATION_X = { loading: -7, assembly: 0, inspection: 7 };
const STATION_NAME = { loading: "Chassis Loading", assembly: "Wheel Assembly", inspection: "Quality Inspection" };
const SPAWN_X = -12;
const FINISHED = new THREE.Vector3(12.5, 0.3, 0);
const REJECT = new THREE.Vector3(10.5, 0.3, 4.2);
const LAMP = { idle: 0x8a94a6, running: 0x2ecc71, down: 0xe74c3c };
const WHEEL_POS = [[-1, 0.38, 0.85], [-1, 0.38, -0.85], [1, 0.38, 0.85], [1, 0.38, -0.85]]; // 4 posisi roda
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function makeLabel(text) {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(15,23,32,0.85)";
  g.fillRect(0, 0, 320, 64);
  g.fillStyle = "#e6edf3";
  g.font = "bold 26px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 160, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c) }));
  sprite.scale.set(4, 0.8, 1);
  return sprite;
}

export class Scene3D {
  constructor(container, engine) {
    this.container = container;
    this.engine = engine;
    this.cur = null; // unit yang sedang diproses: { no, group, wheels, target }
    this.leaving = []; // unit yang sudah selesai dan bergerak ke Finished / Reject
    this.time = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f1720);
    this._isLight = false; // track tema saat ini
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(2, 9, 17);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); // putar dan zoom dengan mouse
    this.controls.target.set(3, 0.5, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 35;
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(6, 12, 8);
    this.scene.add(sun);

    this.buildFactory();
    this.geo = { body: new THREE.BoxGeometry(3, 0.35, 1.5), cabin: new THREE.BoxGeometry(1.4, 0.4, 1.2), wheel: new THREE.CylinderGeometry(0.38, 0.38, 0.3, 24) };
    this.mat = {
      body: new THREE.MeshStandardMaterial({ color: 0x3b82f6 }),
      cabin: new THREE.MeshStandardMaterial({ color: 0x93c5fd }),
      wheel: new THREE.MeshStandardMaterial({ color: 0x111827 }),
    };

    engine.addEventListener("finished", (e) => this.onFinished(e.detail));
    engine.addEventListener("loaded", () => this.clearUnits());
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  buildFactory() {
    this.floorMat = new THREE.MeshStandardMaterial({ color: 0x18222d });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.grid = new THREE.GridHelper(40, 40, 0x2a3a4a, 0x1f2c39);
    this.scene.add(floor, this.grid);

    const conveyor = new THREE.Mesh(new THREE.BoxGeometry(26, 0.3, 2.6), new THREE.MeshStandardMaterial({ color: 0x3a4452 }));
    conveyor.position.set(1, 0.15, 0);
    this.scene.add(conveyor);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5b6676 });
    this.lamps = {};
    for (const key of STATIONS) {
      const x = STATION_X[key];
      for (const z of [-1.9, 1.9]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), frameMat);
        post.position.set(x, 1.5, z);
        this.scene.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 4.1), frameMat);
      beam.position.set(x, 3, 0);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 20), new THREE.MeshStandardMaterial({ color: LAMP.idle, emissive: LAMP.idle, emissiveIntensity: 0.6 }));
      lamp.position.set(x, 3.45, 0);
      const label = makeLabel(STATION_NAME[key]);
      label.position.set(x, 4.3, 0);
      this.scene.add(beam, lamp, label);
      this.lamps[key] = lamp;
    }

    const fin = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 3), new THREE.MeshStandardMaterial({ color: 0x1f8a4c }));
    fin.position.set(FINISHED.x + 0.5, 0.08, 0);
    const rej = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 2.4), new THREE.MeshStandardMaterial({ color: 0xb4232a }));
    rej.position.set(REJECT.x, 0.08, REJECT.z);
    const lf = makeLabel("Finished Goods");
    lf.position.set(FINISHED.x + 0.5, 1.6, 0);
    const lr = makeLabel("Reject");
    lr.position.set(REJECT.x, 1.6, REJECT.z);
    this.scene.add(fin, rej, lf, lr);
  }

  makeUnit(unit) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.geo.body, this.mat.body);
    body.position.y = 0.45;
    const cabin = new THREE.Mesh(this.geo.cabin, this.mat.cabin);
    cabin.position.y = 0.85;
    group.add(body, cabin);
    const wheels = WHEEL_POS.map((p, i) => {
      const w = new THREE.Mesh(this.geo.wheel, this.mat.wheel);
      w.rotation.x = Math.PI / 2;
      w.position.set(...p);
      w.visible = false;
      w.userData.installable = i < unit.wheels; // unit NG: roda ke-4 tidak pernah terpasang
      group.add(w);
      return w;
    });
    group.position.set(SPAWN_X, 0.3, 0);
    this.scene.add(group);
    return { no: unit.no, group, wheels, target: new THREE.Vector3(SPAWN_X, 0.3, 0), age: 0 };
  }

  clearUnits() {
    for (const u of [this.cur, ...this.leaving]) if (u) this.scene.remove(u.group);
    this.cur = null;
    this.leaving = [];
  }

  onFinished({ unitNo, status }) {
    if (!this.cur || this.cur.no !== unitNo) return;
    this.cur.target.copy(status === "OK" ? FINISHED : REJECT);
    this.cur.age = 0;
    this.leaving.push(this.cur);
    this.cur = null;
  }

  update(dt) {
    this.time += dt;
    const e = this.engine;
    if (e.unit && (!this.cur || this.cur.no !== e.unit.no)) this.cur = this.makeUnit(e.unit);

    if (this.cur && e.unit && this.cur.no === e.unit.no) {
      const u = e.unit;
      this.cur.target.set(STATION_X[STATIONS[Math.min(u.stage, 2)]], 0.3, 0);
      // roda dipasang satu per satu mengikuti progres Wheel Assembly
      const p = u.stage === 1 ? u.elapsed / DURATION[1] : u.stage > 1 ? 1 : 0;
      this.cur.wheels.forEach((w, i) => {
        const t = w.userData.installable ? clamp((p - i * 0.2 - 0.05) / 0.15, 0, 1) : 0;
        w.visible = t > 0;
        w.position.y = 0.38 + (1 - t) * 1.2;
      });
    }

    const k = Math.min(1, 4 * dt); // gerak halus menuju target
    for (const u of [this.cur, ...this.leaving]) if (u) u.group.position.lerp(u.target, k);
    for (const u of this.leaving) u.age += dt;
    this.leaving = this.leaving.filter((u) => {
      if (u.age <= 2.5) return true;
      this.scene.remove(u.group);
      return false;
    });

    for (const key of STATIONS) { // lampu: abu = idle, hijau = running, merah berkedip = down
      const m = this.lamps[key].material;
      const st = e.stations[key];
      m.color.setHex(LAMP[st]);
      m.emissive.setHex(LAMP[st]);
      m.emissiveIntensity = st === "down" ? 0.6 + 0.5 * Math.sin(this.time * 9) : 0.7;
    }
  }

  resize() {
    const w = this.container.clientWidth || 800;
    const h = this.container.clientHeight || 450;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setTheme(isLight) {
    this._isLight = isLight;
    if (isLight) {
      this.scene.background.setHex(0xdce8f2);
      this.floorMat.color.setHex(0xb8cdd9);
      // Hapus grid lama, buat baru dengan warna light
      this.scene.remove(this.grid);
      this.grid = new THREE.GridHelper(40, 40, 0x8aaab8, 0xa0bfcc);
      this.scene.add(this.grid);
    } else {
      this.scene.background.setHex(0x0f1720);
      this.floorMat.color.setHex(0x18222d);
      // Hapus grid lama, buat baru dengan warna dark
      this.scene.remove(this.grid);
      this.grid = new THREE.GridHelper(40, 40, 0x2a3a4a, 0x1f2c39);
      this.scene.add(this.grid);
    }
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
