// SMART AUTOMOTIVE MANUFACTURING - SCENE.JS
// Realistic 3D Manufacturing Floor
// Compatible with engine.js
// ============================================================

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STATIONS, DURATION } from "./engine.js";

// ============================================================
// CONFIGURATION
// ============================================================

const STATION_X = {
    loading: -7,
    assembly: 0,
    inspection: 7
};

const FINISHED = new THREE.Vector3(14, 0.25, -3.6);
const REJECT = new THREE.Vector3(14, 0.25, 3.6);

const CAR_COLORS = [
    0x2563eb,
    0xef4444,
    0xf59e0b,
    0x64748b,
    0x9333ea
];

const LAMP = {
    idle: 0x94a3b8,
    running: 0x22c55e,
    down: 0xef4444
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function createMaterial(
    color,
    metalness = 0,
    roughness = 0.5
) {
    return new THREE.MeshStandardMaterial({
        color,
        metalness,
        roughness
    });
}

function addBox(
    parent,
    width,
    height,
    depth,
    mat,
    x,
    y,
    z,
    options = {}
) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        mat
    );

    mesh.position.set(x, y, z);

    if (options.rotationY) {
        mesh.rotation.y = options.rotationY;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    parent.add(mesh);

    return mesh;
}

function addCylinder(
    parent,
    radiusTop,
    radiusBottom,
    height,
    mat,
    x,
    y,
    z,
    segments = 24
) {
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(
            radiusTop,
            radiusBottom,
            height,
            segments
        ),
        mat
    );

    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    parent.add(mesh);

    return mesh;
}

function makeLabel(text) {
    const canvas = document.createElement("canvas");

    canvas.width = 512;
    canvas.height = 128;

    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#172033";
    ctx.fillRect(0, 0, 512, 128);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);

    const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
            map: texture,
            transparent: false
        })
    );

    sprite.scale.set(3.2, 0.8, 1);

    return sprite;
}

// ============================================================
// SCENE CLASS
// ============================================================

export class Scene3D {

    constructor(container, engine) {

        this.container = container;
        this.engine = engine;

        this.cur = null;
        this.preview = null;
        this.leaving = [];

        this.rollers = [];
        this.stationObjects = {};
        this.rackTires = [];
        this.outputObjects = {};

        this.time = 0;

        // ----------------------------------------------------
        // RENDERER
        // ----------------------------------------------------

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 2)
        );

        this.renderer.shadowMap.enabled = true;

        this.renderer.shadowMap.type =
            THREE.PCFSoftShadowMap;

        this.renderer.outputColorSpace =
            THREE.SRGBColorSpace;

        this.renderer.toneMapping =
            THREE.ACESFilmicToneMapping;

        this.renderer.toneMappingExposure = 1.22;

        container.appendChild(
            this.renderer.domElement
        );

        // ----------------------------------------------------
        // SCENE
        // ----------------------------------------------------

        this.scene = new THREE.Scene();

        this.scene.background =
            new THREE.Color(0xc7d2dc);

        this.scene.fog = new THREE.Fog(
            0xc7d2dc,
            48,
            95
        );

        // ----------------------------------------------------
        // CAMERA
        // ----------------------------------------------------

        this.camera = new THREE.PerspectiveCamera(
            43,
            1,
            0.1,
            150
        );

        this.camera.position.set(
            11,
            10,
            16
        );

        // ----------------------------------------------------
        // ORBIT CONTROLS
        // ----------------------------------------------------

        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );

        this.controls.target.set(
            0,
            0.8,
            0
        );

        this.controls.enableDamping = true;

        this.controls.dampingFactor = 0.06;

        this.controls.minDistance = 9;
        this.controls.maxDistance = 42;

        this.controls.maxPolarAngle =
            Math.PI * 0.48;

        // ----------------------------------------------------
        // LIGHTING
        // ----------------------------------------------------

        const hemisphere = new THREE.HemisphereLight(
            0xeaf4ff,
            0x64748b,
            2.0
        );

        this.scene.add(hemisphere);

        const mainLight = new THREE.DirectionalLight(
            0xffffff,
            2.4
        );

        mainLight.position.set(-8,
            18,
            12
        );

        mainLight.castShadow = true;

        mainLight.shadow.mapSize.set(
            2048,
            2048
        );

        mainLight.shadow.camera.left = -25;
        mainLight.shadow.camera.right = 25;
        mainLight.shadow.camera.top = 22;
        mainLight.shadow.camera.bottom = -22;

        this.scene.add(mainLight);

        const fillLight = new THREE.DirectionalLight(
            0xdbeafe,
            0.8
        );

        fillLight.position.set(
            12,
            10, -10
        );

        this.scene.add(fillLight);

        // ----------------------------------------------------
        // BUILD MANUFACTURING AREA
        // ----------------------------------------------------

        this.buildFactory();

        // ----------------------------------------------------
        // ENGINE EVENTS
        // ----------------------------------------------------

        this.handleFinished = (event) => {
            this.onFinished(event.detail);
        };

        this.handleLoaded = () => {
            this.clearUnits();
        };

        engine.addEventListener(
            "finished",
            this.handleFinished
        );

        engine.addEventListener(
            "loaded",
            this.handleLoaded
        );

        // ----------------------------------------------------
        // RESIZE
        // ----------------------------------------------------

        this.resizeObserver = new ResizeObserver(
            () => this.resize()
        );

        this.resizeObserver.observe(container);

        this.resize();
    }

    // ========================================================
    // BUILD FACTORY
    // ========================================================

    buildFactory() {

        // ----------------------------------------------------
        // MANUFACTURING FLOOR
        // ----------------------------------------------------

        const floorMat = createMaterial(
            0x89949c,
            0.04,
            0.96
        );

        this.floor = new THREE.Mesh(
            new THREE.PlaneGeometry(55, 35),
            floorMat
        );

        this.floor.rotation.x = -Math.PI / 2;

        this.floor.receiveShadow = true;

        this.scene.add(this.floor);

        // Subtle floor grid

        const grid = new THREE.GridHelper(
            55,
            55,
            0x718096,
            0x8997a5
        );

        grid.position.y = 0.012;

        grid.material.transparent = true;
        grid.material.opacity = 0.13;

        this.scene.add(grid);

        // ----------------------------------------------------
        // DISTANT FACTORY BACKDROP
        // Open sides, no columns, no canopy, no black portal frames.
        // A single clean rear wall and broad clerestory windows give
        // the scene an indoor manufacturing scale without blocking it.
        // ----------------------------------------------------

        const rearWallMat = createMaterial(0xd5dde2, 0.08, 0.88);
        addBox(
            this.scene,
            55,
            7.5,
            0.35,
            rearWallMat,
            0,
            3.75, -16
        );

        const windowMat = new THREE.MeshPhysicalMaterial({
            color: 0xb8d9e8,
            metalness: 0.08,
            roughness: 0.18,
            transparent: true,
            opacity: 0.72,
            clearcoat: 0.8
        });

        // Wide high windows; no vertical support posts.
        [-17, 0, 17].forEach((x) => {
            addBox(
                this.scene,
                14.5,
                2.15,
                0.045,
                windowMat,
                x,
                5.55, -15.79
            );
        });

        const wallBandMat = createMaterial(0x647789, 0.25, 0.65);
        addBox(
            this.scene,
            55,
            0.16,
            0.08,
            wallBandMat,
            0,
            1.05, -15.77
        );

        // ----------------------------------------------------
        // FLOOR MARKINGS
        // ----------------------------------------------------

        const yellowMat = createMaterial(
            0xfacc15,
            0.1,
            0.6
        );

        const whiteMat = createMaterial(
            0xffffff,
            0,
            0.7
        );

        // Production lane

        [-3.2, 3.2].forEach((z) => {

            addBox(
                this.scene,
                30,
                0.025,
                0.07,
                yellowMat,
                0,
                0.025,
                z
            );

        });

        // Workstation floor markings

        Object.values(STATION_X).forEach((x) => {

            const marking = new THREE.Mesh(
                new THREE.BoxGeometry(
                    3.8,
                    0.025,
                    5.5
                ),
                new THREE.MeshBasicMaterial({
                    color: 0xfacc15,
                    transparent: true,
                    opacity: 0.10
                })
            );

            marking.position.set(
                x,
                0.025,
                0
            );

            this.scene.add(marking);

        });

        // Walking path

        for (let x = -13; x <= 13; x += 1.2) {

            addBox(
                this.scene,
                0.55,
                0.018,
                0.035,
                whiteMat,
                x,
                0.035,
                6.5
            );

        }


        // ----------------------------------------------------
        // OPEN FACTORY LIGHTING
        // No ceiling frames, hanging rods, walls or floor pillars.
        // The scene is illuminated by non-physical light sources.
        // ----------------------------------------------------

        const openFactoryFill = new THREE.DirectionalLight(
            0xeaf4ff,
            1.15
        );

        openFactoryFill.position.set(-6, 14, 8);
        this.scene.add(openFactoryFill);

        const openFactoryRim = new THREE.DirectionalLight(
            0xcbdfff,
            0.65
        );

        openFactoryRim.position.set(10, 9, -8);
        this.scene.add(openFactoryRim);

        // ----------------------------------------------------
        // CONVEYOR SYSTEM
        // ----------------------------------------------------

        this.buildConveyor();
        this.buildOutputSortingArea();

        // ----------------------------------------------------
        // WORKSTATIONS
        // ----------------------------------------------------

        this.buildStations();

        // ----------------------------------------------------
        // PRODUCTION INFORMATION BOARDS
        // ----------------------------------------------------

        this.buildProductionBoards();

    }

    // ========================================================
    // CONVEYOR
    // ========================================================


    buildConveyor() {

        const baseMat = createMaterial(0x334155, 0.8, 0.35);
        const rollerMat = createMaterial(0xb8c4ce, 0.85, 0.25);
        const sideMat = createMaterial(0x475569, 0.75, 0.3);
        const yellowMat = createMaterial(0xfacc15, 0.35, 0.4);

        // Main conveyor stops before the sorting junction.
        const conveyorLength = 23.2;
        const conveyorCenter = -1.1;

        addBox(
            this.scene,
            conveyorLength,
            0.38,
            2.5,
            baseMat,
            conveyorCenter,
            0.35,
            0
        );

        addBox(
            this.scene,
            conveyorLength - 0.3,
            0.08,
            2.25,
            sideMat,
            conveyorCenter,
            0.57,
            0
        );

        // Main rollers
        const rollerGeometry = new THREE.CylinderGeometry(
            0.095, 0.095, 2.2, 24
        );

        rollerGeometry.rotateX(Math.PI / 2);

        for (let i = 0; i < 40; i++) {

            const rollerGroup = new THREE.Group();

            const roller = new THREE.Mesh(
                rollerGeometry,
                rollerMat
            );

            roller.castShadow = true;
            roller.receiveShadow = true;

            rollerGroup.add(roller);

            rollerGroup.position.set(-12.7 + i * 0.59,
                0.67,
                0
            );

            this.scene.add(rollerGroup);
            this.rollers.push(rollerGroup);
        }

        // Yellow side rails
        for (const z of[-1.25, 1.25]) {

            addBox(
                this.scene,
                conveyorLength,
                0.16,
                0.12,
                yellowMat,
                conveyorCenter,
                0.68,
                z
            );

        }

        // Conveyor supports
        const supportMat = createMaterial(
            0x475569, 0.8, 0.35
        );

        for (const x of[-11, -6, 0, 6, 9]) {

            for (const z of[-0.9, 0.9]) {

                addBox(
                    this.scene,
                    0.12,
                    0.34,
                    0.12,
                    supportMat,
                    x,
                    0.16,
                    z
                );

            }

        }

        // Main conveyor motor
        const motor = addCylinder(
            this.scene,
            0.25,
            0.25,
            0.75,
            createMaterial(0x2563eb, 0.65, 0.3), -13.2,
            0.35,
            1.5
        );

        motor.rotation.z = Math.PI / 2;

    }

    // ========================================================
    // OUTPUT SORTING AREA - GOOD / NG SEPARATION
    // ========================================================


    buildOutputSortingArea() {

        const steel = createMaterial(0x334155, 0.78, 0.34);
        const rollerMat = createMaterial(0x94a3b8, 0.82, 0.24);
        const greenMat = createMaterial(0x15803d, 0.18, 0.55);
        const redMat = createMaterial(0xb91c1c, 0.18, 0.55);
        const whiteMat = createMaterial(0xf8fafc, 0.05, 0.7);

        this.outputObjects = {};
        this.transferBranches = {};

        const laneX = 17.8;

        const lanes = [{
                key: "good",
                z: -3.6,
                color: greenMat,
                label: "GOOD / OK OUTPUT",
                floorColor: 0x16a34a
            },
            {
                key: "ng",
                z: 3.6,
                color: redMat,
                label: "NG / REJECT OUTPUT",
                floorColor: 0xdc2626
            }
        ];

        // ----------------------------------------------------
        // TWO SEPARATE STRAIGHT OUTPUT CONVEYORS
        // ----------------------------------------------------

        lanes.forEach((lane) => {

            const bay = new THREE.Mesh(
                new THREE.PlaneGeometry(8.2, 3.0),
                new THREE.MeshBasicMaterial({
                    color: lane.floorColor,
                    transparent: true,
                    opacity: 0.12,
                    side: THREE.DoubleSide
                })
            );

            bay.rotation.x = -Math.PI / 2;
            bay.position.set(laneX, 0.035, lane.z);

            this.scene.add(bay);

            // Conveyor bed
            addBox(
                this.scene,
                8.0,
                0.38,
                2.35,
                steel,
                laneX,
                0.35,
                lane.z
            );

            // Output rollers
            const rollerGeometry = new THREE.CylinderGeometry(
                0.085,
                0.085,
                2.15,
                20
            );

            rollerGeometry.rotateX(Math.PI / 2);

            for (let i = 0; i < 17; i++) {

                const roller = new THREE.Mesh(
                    rollerGeometry,
                    rollerMat
                );

                roller.position.set(
                    14.0 + i * 0.47,
                    0.67,
                    lane.z
                );

                roller.castShadow = true;
                roller.receiveShadow = true;

                this.scene.add(roller);

            }

            // Side rails
            for (const side of[-1, 1]) {

                addBox(
                    this.scene,
                    8.0,
                    0.16,
                    0.10,
                    lane.color,
                    laneX,
                    0.72,
                    lane.z + side * 1.2
                );

            }

            // Output label
            const label = makeLabel(lane.label);

            label.position.set(
                laneX,
                2.2,
                lane.z
            );

            label.scale.set(3.6, 0.8, 1);

            this.scene.add(label);

            this.outputObjects[lane.key] = {
                bay,
                label,
                color: lane.floorColor
            };

        });

        // ----------------------------------------------------
        // CENTRAL SORTING JUNCTION
        // ----------------------------------------------------

        // One common transition platform.
        // It connects the main conveyor to both branches.

        addBox(
            this.scene,
            1.8,
            0.38,
            4.8,
            steel,
            10.5,
            0.35,
            0
        );

        const junctionRollerGeometry =
            new THREE.CylinderGeometry(
                0.085,
                0.085,
                4.45,
                20
            );

        junctionRollerGeometry.rotateX(Math.PI / 2);

        for (let i = 0; i < 5; i++) {

            const roller = new THREE.Mesh(
                junctionRollerGeometry,
                rollerMat
            );

            roller.position.set(
                9.8 + i * 0.34,
                0.67,
                0
            );

            roller.castShadow = true;
            roller.receiveShadow = true;

            this.scene.add(roller);

        }

        // ----------------------------------------------------
        // Y-SHAPED TRANSFER BRANCHES
        // ----------------------------------------------------

        const branchDefinitions = [{
                key: "good",
                z: -3.6,
                color: 0x15803d
            },
            {
                key: "ng",
                z: 3.6,
                color: 0xb91c1c
            }
        ];

        branchDefinitions.forEach((branch) => {

            const sign = Math.sign(branch.z);

            const curve = new THREE.CatmullRomCurve3([
                new THREE.Vector3(11.3, 0.67, sign * 1.2),
                new THREE.Vector3(12.0, 0.67, sign * 2.0),
                new THREE.Vector3(13.8, 0.67, sign * 3.6)
            ], false, "catmullrom", 0.35);

            const bedMat = createMaterial(
                0x334155, 0.75, 0.38
            );

            const railMat = createMaterial(
                branch.color, 0.3, 0.4
            );

            const rollerBranchMat = createMaterial(
                0xb8c4ce, 0.86, 0.22
            );

            const rollerGeometry = new THREE.CylinderGeometry(
                0.085,
                0.085,
                2.12,
                18
            );

            const yAxis = new THREE.Vector3(0, 1, 0);

            // ------------------------------------------------
            // CURVED BED SEGMENTS
            // ------------------------------------------------

            const segments = 20;
            let previous = curve.getPointAt(0);

            for (let i = 1; i <= segments; i++) {

                const t = i / segments;
                const point = curve.getPointAt(t);
                const tangent = curve.getTangentAt(t).normalize();

                const midpoint = previous.clone().add(point).multiplyScalar(0.5);

                const length = previous.distanceTo(point) + 0.04;

                const yaw = Math.atan2(-tangent.z,
                    tangent.x
                );

                const bed = new THREE.Mesh(
                    new THREE.BoxGeometry(
                        length,
                        0.30,
                        2.18
                    ),
                    bedMat
                );

                bed.position.set(
                    midpoint.x,
                    0.40,
                    midpoint.z
                );

                bed.rotation.y = yaw;
                bed.castShadow = true;
                bed.receiveShadow = true;

                this.scene.add(bed);

                previous = point;

            }

            // ------------------------------------------------
            // ROLLERS ALONG THE CURVE
            // ------------------------------------------------

            const rollerCount = 19;

            for (let i = 0; i < rollerCount; i++) {

                const t = i / (rollerCount - 1);

                const point = curve.getPointAt(t);
                const tangent = curve.getTangentAt(t).normalize();

                const roller = new THREE.Mesh(
                    rollerGeometry,
                    rollerBranchMat
                );

                roller.position.set(
                    point.x,
                    0.67,
                    point.z
                );

                const axis = new THREE.Vector3(-tangent.z,
                    0,
                    tangent.x
                ).normalize();

                roller.quaternion.setFromUnitVectors(
                    yAxis,
                    axis
                );

                roller.castShadow = true;
                roller.receiveShadow = true;

                this.scene.add(roller);

            }

            // ------------------------------------------------
            // SAFETY RAILS
            // Only the outer rail at the beginning.
            // Both rails are added after branches separate.
            // ------------------------------------------------

            const outerSide = sign;

            const railSegments = 15;

            for (let i = 0; i < railSegments; i++) {

                const t1 = i / railSegments;
                const t2 = (i + 1) / railSegments;

                const p1 = curve.getPointAt(t1);
                const p2 = curve.getPointAt(t2);

                const midpoint = p1.clone().add(p2).multiplyScalar(0.5);

                const tangent = curve.getTangentAt(
                    (t1 + t2) / 2
                ).normalize();

                const normal = new THREE.Vector3(-tangent.z,
                    0,
                    tangent.x
                ).normalize();

                const length = p1.distanceTo(p2) + 0.04;
                const yaw = Math.atan2(-tangent.z, tangent.x);

                const sides = t1 < 0.55 ? [outerSide] : [-1, 1];

                sides.forEach((side) => {

                    const rail = new THREE.Mesh(
                        new THREE.BoxGeometry(
                            length,
                            0.13,
                            0.10
                        ),
                        railMat
                    );

                    rail.position.set(
                        midpoint.x + normal.x * side * 1.12,
                        0.79,
                        midpoint.z + normal.z * side * 1.12
                    );

                    rail.rotation.y = yaw;
                    rail.castShadow = true;

                    this.scene.add(rail);

                });

            }

            this.transferBranches[branch.key] = curve;

        });

        // ----------------------------------------------------
        // PHYSICAL DIVIDER BETWEEN OUTPUT LANES
        // ----------------------------------------------------

        const dividerMat = createMaterial(
            0xfacc15, 0.25, 0.48
        );

        const dividerDark = createMaterial(
            0x1e293b, 0.55, 0.42
        );

        addBox(
            this.scene,
            8.0,
            0.45,
            0.14,
            dividerDark,
            17.8,
            0.28,
            0
        );

        addBox(
            this.scene,
            8.0,
            0.06,
            0.18,
            dividerMat,
            17.8,
            0.54,
            0
        );

    }


    // ========================================================
    // BUILD WORKSTATIONS
    // ========================================================

    buildStations() {

        const data = [{
                id: "loading",
                title: "LOADING",
                subtitle: "CHASSIS LOADING",
                x: STATION_X.loading,
                color: 0x2563eb
            },
            {
                id: "assembly",
                title: "ASSEMBLY",
                subtitle: "WHEEL ASSEMBLY",
                x: STATION_X.assembly,
                color: 0xf59e0b
            },
            {
                id: "inspection",
                title: "INSPECTION",
                subtitle: "QUALITY CONTROL",
                x: STATION_X.inspection,
                color: 0x16a34a
            }
        ];

        data.forEach((station) => {

            const group = new THREE.Group();

            group.position.set(
                station.x,
                0,
                0
            );

            this.scene.add(group);

            // Independent modular canopy for this workstation
            this.buildStationCanopy(group, station);

            // ------------------------------------------------
            // WORKSTATION LABEL
            // ------------------------------------------------

            const label = makeLabel(
                station.title
            );

            label.position.set(
                0,
                4.2, -3
            );

            group.add(label);

            // ------------------------------------------------
            // INDUSTRIAL STACK LIGHT WITH SUPPORT POLE
            // ------------------------------------------------

            const signalSteel = createMaterial(
                0x334155,
                0.85,
                0.3
            );

            // Mounting base
            addBox(
                group,
                0.42,
                0.12,
                0.42,
                signalSteel,
                1.7,
                0.06, -1.5
            );

            // Vertical support pole
            addCylinder(
                group,
                0.055,
                0.075,
                2.45,
                signalSteel,
                1.7,
                1.33, -1.5
            );

            // Lamp holder
            addCylinder(
                group,
                0.19,
                0.22,
                0.15,
                signalSteel,
                1.7,
                2.62, -1.5
            );

            // Indicator lamp
            const beaconMaterial =
                new THREE.MeshStandardMaterial({
                    color: station.color,
                    emissive: station.color,
                    emissiveIntensity: 0.9,
                    roughness: 0.25
                });

            const beacon = new THREE.Mesh(
                new THREE.SphereGeometry(
                    0.17,
                    20,
                    16
                ),
                beaconMaterial
            );

            beacon.position.set(
                1.7,
                2.79, -1.5
            );

            group.add(beacon);

            this.stationObjects[station.id] = {
                group,
                beacon,
                beaconMaterial,
                color: station.color
            };

        });

        // ----------------------------------------------------
        // LOADING EQUIPMENT
        // ----------------------------------------------------

        this.buildLoadingStation(
            this.stationObjects.loading.group
        );

        // ----------------------------------------------------
        // ASSEMBLY EQUIPMENT
        // ----------------------------------------------------

        this.buildAssemblyStation(
            this.stationObjects.assembly.group
        );

        // ----------------------------------------------------
        // INSPECTION EQUIPMENT
        // ----------------------------------------------------

        this.buildInspectionStation(
            this.stationObjects.inspection.group
        );

    }


    // ========================================================
    // MODULAR CANOPY - ONE INDEPENDENT CANOPY PER STATION
    // Open front and sides; only two slim rear support posts.
    // ========================================================

    buildStationCanopy(group, station) {

        const frameMat = createMaterial(0x334155, 0.82, 0.32);
        const roofMat = createMaterial(0xdce4e9, 0.28, 0.48);
        const undersideMat = createMaterial(0xf1f5f9, 0.12, 0.62);
        const accentMat = createMaterial(station.color, 0.35, 0.42);

        const roofY = 5.55;
        const roofZ = -0.35;
        const roofWidth = 6.15;
        const roofDepth = 6.15;
        const rearZ = -3.15;
        const postX = 2.72;

        // Two slim supports placed at the rear only.
        [-postX, postX].forEach((x) => {
            addBox(group, 0.14, 5.25, 0.14, frameMat, x, 2.625, rearZ);
            addBox(group, 0.42, 0.10, 0.38, frameMat, x, 0.05, rearZ);
        });

        // Rear beam and cantilever arms support the roof without front pillars.
        addBox(group, roofWidth, 0.18, 0.18, frameMat, 0, 5.18, rearZ);

        [-postX, postX].forEach((x) => {
            addBox(group, 0.14, 0.16, roofDepth, frameMat, x, 5.18, roofZ);
        });

        // Separate roof panel for this station.
        addBox(group, roofWidth, 0.18, roofDepth, roofMat, 0, roofY, roofZ);
        addBox(group, roofWidth - 0.24, 0.045, roofDepth - 0.24, undersideMat, 0, roofY - 0.115, roofZ);

        // Station-colored front fascia.
        addBox(
            group,
            roofWidth,
            0.16,
            0.12,
            accentMat,
            0,
            5.38,
            roofZ + roofDepth / 2 - 0.06
        );

        // LED strips mounted under the canopy.
        const ledMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xeaf4ff,
            emissiveIntensity: 1.25,
            roughness: 0.25
        });

        [-1.7, 0, 1.7].forEach((z) => {
            addBox(group, 3.8, 0.055, 0.15, ledMat, 0, roofY - 0.17, z);
        });

        const canopyLight = new THREE.PointLight(0xeaf4ff, 0.9, 11);
        canopyLight.position.set(0, 4.95, -0.25);
        group.add(canopyLight);

        // Hanging station sign at the open/front edge.
        const sign = makeLabel(station.title);
        sign.position.set(0, 4.78, roofZ + roofDepth / 2 - 0.42);
        sign.scale.set(2.65, 0.62, 1);
        group.add(sign);

        return { canopyLight, sign };
    }

    // ========================================================
    // LOADING STATION
    // ========================================================

    buildLoadingStation(group) {

        const steel = createMaterial(
            0x475569,
            0.8,
            0.35
        );

        const orange = createMaterial(
            0xf97316,
            0.4,
            0.3
        );

        // Component workbench

        addBox(
            group,
            2.0,
            0.14,
            1.0,
            steel, -1.4,
            1.05, -2.5
        );

        // Workbench legs

        for (const x of[-2.25, -0.55]) {

            addBox(
                group,
                0.09,
                1,
                0.09,
                steel,
                x,
                0.5, -2.5
            );

        }

        // Component containers

        const boxColors = [
            0x2563eb,
            0xf59e0b,
            0x94a3b8
        ];

        boxColors.forEach((color, index) => {

            addBox(
                group,
                0.45,
                0.4,
                0.45,
                createMaterial(color, 0.25, 0.5), -2.0 + index * 0.6,
                1.32, -2.5
            );

        });

        // Compact robotic arm base

        addCylinder(
            group,
            0.42,
            0.48,
            0.35,
            steel,
            1.25,
            0.75, -2.5
        );

        const robotBody = addBox(
            group,
            0.55,
            0.85,
            0.55,
            orange,
            1.25,
            1.35, -2.5
        );

        robotBody.rotation.z = -0.1;

        // Robot arm

        const arm = addBox(
            group,
            0.2,
            1.15,
            0.2,
            orange,
            1.55,
            2.15, -2.5
        );

        arm.rotation.z = -0.5;

        addCylinder(
            group,
            0.15,
            0.15,
            0.25,
            steel,
            1.8,
            2.55, -2.5
        );

        // Robot gripper

        addBox(
            group,
            0.55,
            0.12,
            0.25,
            steel,
            2.05,
            2.9, -2.5
        );

    }

    // ========================================================
    // ASSEMBLY STATION
    // ========================================================

    buildAssemblyStation(group) {

        const steel = createMaterial(
            0x475569,
            0.8,
            0.3
        );

        const dark = createMaterial(
            0x1e293b,
            0.7,
            0.4
        );

        const orange = createMaterial(
            0xf59e0b,
            0.4,
            0.3
        );

        // Main assembly machine

        addBox(
            group,
            1.6,
            2.3,
            1.2,
            steel, -2.2,
            1.25, -2.5
        );

        // Machine control panel

        addBox(
            group,
            0.9,
            0.75,
            0.08,
            dark, -2.2,
            1.75, -1.85
        );

        // Screen

        const screenMat =
            new THREE.MeshStandardMaterial({
                color: 0x38bdf8,
                emissive: 0x0284c7,
                emissiveIntensity: 1.3,
                roughness: 0.2
            });

        addBox(
            group,
            0.65,
            0.38,
            0.035,
            screenMat, -2.2,
            1.85, -1.78
        );

        // Machine buttons

        for (let i = 0; i < 3; i++) {

            addCylinder(
                group,
                0.055,
                0.055,
                0.07,
                createMaterial(
                    [0x22c55e, 0xef4444, 0xfacc15][i]
                ), -2.5 + i * 0.3,
                1.3, -1.78
            );

        }

        // Assembly press body

        addBox(
            group,
            1.8,
            0.22,
            0.65,
            steel,
            0.3,
            2.75, -2.5
        );

        // Press base

        addBox(
            group,
            1.8,
            0.2,
            0.9,
            steel,
            0.3,
            0.85, -2.5
        );

        // Compact press actuator

        const cylinder = addCylinder(
            group,
            0.18,
            0.18,
            1.5,
            createMaterial(0x94a3b8, 0.85, 0.25),
            0.3,
            1.95, -2.5
        );

        // Press head

        this.pressHead = addBox(
            group,
            0.95,
            0.22,
            0.65,
            orange,
            0.3,
            1.45, -2.5
        );

        // Overheat effect group

        this.overheatGroup = new THREE.Group();

        this.overheatGroup.position.set(
            0.3,
            1.9, -2.5
        );

        group.add(this.overheatGroup);

        // Heat core

        const heatCore = new THREE.Mesh(
            new THREE.SphereGeometry(
                0.55,
                24,
                20
            ),
            new THREE.MeshBasicMaterial({
                color: 0xff3b1f,
                transparent: true,
                opacity: 0.3
            })
        );

        heatCore.scale.set(
            1.5,
            0.8,
            1
        );

        this.overheatGroup.add(heatCore);

        // Heat rings

        this.overheatRings = [];

        for (let i = 0; i < 3; i++) {

            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(
                    0.55 + i * 0.22,
                    0.035,
                    8,
                    48
                ),
                new THREE.MeshBasicMaterial({
                    color: i === 0 ?
                        0xff3b1f : 0xffa21a,
                    transparent: true,
                    opacity: 0.7
                })
            );

            ring.rotation.x = Math.PI / 2;

            ring.position.y = i * 0.15;

            this.overheatGroup.add(ring);

            this.overheatRings.push(ring);

        }

        // Overheat light

        this.overheatLight = new THREE.PointLight(
            0xff3b1f,
            0,
            9
        );

        this.overheatLight.position.set(
            0.3,
            2.5, -2.5
        );

        group.add(this.overheatLight);

        // Warning label

        this.overheatWarning = makeLabel(
            "OVERHEAT WARNING"
        );

        this.overheatWarning.position.set(
            0.3,
            3.7, -2.5
        );

        this.overheatWarning.scale.set(
            3,
            0.75,
            1
        );

        this.overheatWarning.visible = false;

        group.add(this.overheatWarning);

        this.overheatGroup.visible = false;

        // ----------------------------------------------------
        // WHEEL ASSEMBLY ROBOT + TIRE FEED RACK
        // ----------------------------------------------------

        // Low tire rack on the operator side of the conveyor.
        const rackSteel = createMaterial(0x475569, 0.82, 0.32);
        const rackTop = createMaterial(0x64748b, 0.72, 0.38);

        addBox(
            group,
            4.6,
            0.14,
            0.72,
            rackTop,
            3.65,
            0.72,
            2.45
        );

        for (const x of[1.55, 5.75]) {
            for (const z of[2.18, 2.72]) {
                addBox(
                    group,
                    0.12,
                    0.68,
                    0.12,
                    rackSteel,
                    x,
                    0.34,
                    z
                );
            }
        }

        // Four small tire locating blocks on the rack.
        for (let i = 0; i < 4; i++) {
            addBox(
                group,
                0.12,
                0.12,
                0.48,
                rackSteel,
                2.15 + i * 0.95,
                0.86,
                2.45
            );
        }

        // Four real tire stock units are visible on the rack from the start.
        // These are separate from the car's wheel meshes and move one by one
        // to the car during the assembly cycle.
        this.rackTires = [];

        const stockTireMat = createMaterial(0x101820, 0.02, 0.94);
        const stockRimMat = createMaterial(0xcbd5e1, 0.88, 0.22);
        const stockHubMat = createMaterial(0x475569, 0.82, 0.28);

        for (let i = 0; i < 4; i++) {
            const stockWheel = new THREE.Group();

            const home = new THREE.Vector3(
                2.05 + i * 0.95,
                1.21,
                2.45
            );

            stockWheel.position.copy(home);

            const stockTire = new THREE.Mesh(
                new THREE.CylinderGeometry(0.42, 0.42, 0.25, 32),
                stockTireMat
            );
            stockTire.rotation.x = Math.PI / 2;
            stockTire.castShadow = true;
            stockTire.receiveShadow = true;
            stockWheel.add(stockTire);

            const stockRim = new THREE.Mesh(
                new THREE.CylinderGeometry(0.25, 0.25, 0.27, 32),
                stockRimMat
            );
            stockRim.rotation.x = Math.PI / 2;
            stockWheel.add(stockRim);

            const stockHub = new THREE.Mesh(
                new THREE.CylinderGeometry(0.09, 0.09, 0.29, 20),
                stockHubMat
            );
            stockHub.rotation.x = Math.PI / 2;
            stockWheel.add(stockHub);

            for (let spokeIndex = 0; spokeIndex < 5; spokeIndex++) {
                const angle = (spokeIndex / 5) * Math.PI * 2;
                const spoke = new THREE.Mesh(
                    new THREE.BoxGeometry(0.055, 0.34, 0.035),
                    stockRimMat
                );
                spoke.position.set(
                    Math.cos(angle) * 0.12,
                    Math.sin(angle) * 0.12,
                    0
                );
                spoke.rotation.z = angle;
                stockWheel.add(spoke);
            }

            stockWheel.userData.homePosition = home.clone();
            group.add(stockWheel);
            this.rackTires.push(stockWheel);
        }

        // Robot pedestal.
        const robotOrange = createMaterial(0xf97316, 0.55, 0.3);
        const robotDark = createMaterial(0x1e293b, 0.82, 0.28);
        const robotMetal = createMaterial(0x94a3b8, 0.9, 0.22);

        addCylinder(
            group,
            0.42,
            0.48,
            0.34,
            robotDark,
            2.45,
            0.42,
            1.25
        );

        this.wheelRobot = new THREE.Group();
        this.wheelRobot.position.set(2.45, 0.58, 1.25);
        group.add(this.wheelRobot);

        // Shoulder joint.
        addCylinder(
            this.wheelRobot,
            0.28,
            0.28,
            0.34,
            robotMetal,
            0,
            0.12,
            0
        );

        // Upper arm.
        const robotUpperArm = addBox(
            this.wheelRobot,
            0.28,
            0.30,
            1.15,
            robotOrange,
            0,
            0.40, -0.62
        );

        robotUpperArm.rotation.x = -0.12;

        // Elbow joint.
        addCylinder(
            this.wheelRobot,
            0.20,
            0.20,
            0.36,
            robotDark,
            0,
            0.55, -1.12
        );

        // Forearm.
        const robotForearm = addBox(
            this.wheelRobot,
            0.22,
            0.24,
            0.82,
            robotOrange,
            0,
            0.58, -1.48
        );

        robotForearm.rotation.x = 0.08;

        // Pneumatic wheel nut runner, facing the car.
        this.wheelTool = addCylinder(
            this.wheelRobot,
            0.13,
            0.13,
            0.48,
            robotMetal,
            0,
            0.58, -1.92
        );

        // Bake the tool axle orientation so rotation.z spins the socket correctly.
        this.wheelTool.geometry.rotateX(Math.PI / 2);

        addCylinder(
            this.wheelRobot,
            0.075,
            0.075,
            0.16,
            robotDark,
            0,
            0.58, -2.20
        );

        // Keep the robot parked until a car reaches Assembly.
        this.wheelRobot.visible = false;
        this.assemblyElapsed = 0;
        this.assemblyUnitId = null;
        this.assemblyInstallOrder = [0, 1, 2, 3];
        this.assemblyPhaseDuration = 1.5;

    }

    // ========================================================
    // INSPECTION STATION
    // ========================================================

    buildInspectionStation(group) {

        const steel = createMaterial(
            0x64748b,
            0.8,
            0.3
        );

        const dark = createMaterial(
            0x1e293b,
            0.6,
            0.4
        );

        const cyan =
            new THREE.MeshStandardMaterial({
                color: 0x22d3ee,
                emissive: 0x06b6d4,
                emissiveIntensity: 1.3
            });

        // Inspection machine

        addBox(
            group,
            1.5,
            1.5,
            1.2,
            steel,
            2.0,
            1, -2.5
        );

        // Inspection monitor

        addBox(
            group,
            0.9,
            0.65,
            0.1,
            dark,
            2.0,
            2.15, -1.85
        );

        const monitorScreen = addBox(
            group,
            0.72,
            0.46,
            0.035,
            cyan,
            2.0,
            2.15, -1.78
        );

        // Camera pedestal

        addBox(
            group,
            0.35,
            1.3,
            0.35,
            steel,
            0.8,
            0.65, -2.5
        );

        // Camera housing

        addBox(
            group,
            0.55,
            0.4,
            0.45,
            dark,
            0.8,
            1.5, -2.5
        );

        // Camera lens

        const lens = addCylinder(
            group,
            0.14,
            0.14,
            0.16,
            createMaterial(0x0ea5e9, 0.4, 0.15),
            0.8,
            1.5, -2.22
        );

        lens.rotation.x = Math.PI / 2;

        // Inspection light

        addBox(
            group,
            1.3,
            0.08,
            0.12,
            cyan,
            0.8,
            1.95, -2.5
        );

        // Scanner indicator

        const scanLight = new THREE.PointLight(
            0x22d3ee,
            0.8,
            5
        );

        scanLight.position.set(
            0.8,
            2.2, -2.5
        );

        group.add(scanLight);

        this.inspectionLight = scanLight;

    }

    // ========================================================
    // PRODUCTION BOARDS
    // ========================================================

    buildProductionBoards() {

        const boardMat = createMaterial(
            0x1e293b,
            0.3,
            0.5
        );

        // Production board at the back

        addBox(
            this.scene,
            4.5,
            1.6,
            0.15,
            boardMat,
            0,
            3.85, -15.75
        );

        const label = makeLabel(
            "AUTOMOTIVE PRODUCTION LINE"
        );

        label.position.set(
            0,
            3.85, -15.6
        );

        label.scale.set(
            4,
            1,
            1
        );

        this.scene.add(label);

    }

    // ========================================================
    // REALISTIC CAR MODEL
    // ========================================================

    makeUnit(id) {

        const car = new THREE.Group();

        car.name = `car-${id}`;

        const color = CAR_COLORS[
            (Number(id) - 1 + CAR_COLORS.length) %
            CAR_COLORS.length
        ];

        const bodyMat =
            new THREE.MeshPhysicalMaterial({
                color,
                metalness: 0.35,
                roughness: 0.27,
                clearcoat: 1,
                clearcoatRoughness: 0.15
            });

        const darkMat = createMaterial(
            0x172033,
            0.25,
            0.5
        );

        const glassMat =
            new THREE.MeshPhysicalMaterial({
                color: 0x93c5fd,
                metalness: 0.15,
                roughness: 0.12,
                transparent: true,
                opacity: 0.65,
                clearcoat: 1
            });

        const chromeMat = createMaterial(
            0xcbd5e1,
            0.85,
            0.18
        );

        // ----------------------------------------------------
        // MAIN BODY
        // ----------------------------------------------------

        addBox(
            car,
            3.5,
            0.65,
            1.7,
            bodyMat,
            0,
            0.88,
            0
        );

        // Front hood

        addBox(
            car,
            1.05,
            0.18,
            1.65,
            bodyMat,
            1.15,
            1.25,
            0
        );

        // Rear trunk

        addBox(
            car,
            0.8,
            0.18,
            1.65,
            bodyMat, -1.25,
            1.25,
            0
        );

        // ----------------------------------------------------
        // CABIN
        // ----------------------------------------------------

        addBox(
            car,
            1.9,
            0.85,
            1.4,
            bodyMat, -0.05,
            1.58,
            0
        );

        // Front windshield

        const frontGlass = addBox(
            car,
            0.07,
            0.63,
            1.28,
            glassMat,
            0.9,
            1.62,
            0
        );

        frontGlass.rotation.z = -0.28;

        // Rear windshield

        const rearGlass = addBox(
            car,
            0.07,
            0.63,
            1.28,
            glassMat, -1.0,
            1.62,
            0
        );

        rearGlass.rotation.z = 0.28;

        // Side windows

        for (const z of[-0.715, 0.715]) {

            addBox(
                car,
                1.35,
                0.48,
                0.035,
                glassMat, -0.05,
                1.65,
                z
            );

        }

        // ----------------------------------------------------
        // BUMPERS
        // ----------------------------------------------------

        addBox(
            car,
            0.18,
            0.25,
            1.85,
            darkMat,
            1.82,
            0.72,
            0
        );

        addBox(
            car,
            0.18,
            0.25,
            1.85,
            darkMat, -1.82,
            0.72,
            0
        );

        // Front grille

        addBox(
            car,
            0.045,
            0.25,
            0.85,
            darkMat,
            1.92,
            0.95,
            0
        );

        // ----------------------------------------------------
        // HEADLIGHTS
        // ----------------------------------------------------

        const headlightMat =
            new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0xe0f2fe,
                emissiveIntensity: 1.6
            });

        for (const z of[-0.6, 0.6]) {

            addBox(
                car,
                0.07,
                0.18,
                0.38,
                headlightMat,
                1.87,
                1.05,
                z
            );

        }

        // Rear lights

        const rearLightMat =
            new THREE.MeshStandardMaterial({
                color: 0xef4444,
                emissive: 0xdc2626,
                emissiveIntensity: 1
            });

        for (const z of[-0.6, 0.6]) {

            addBox(
                car,
                0.07,
                0.18,
                0.38,
                rearLightMat, -1.87,
                1.05,
                z
            );

        }

        // ----------------------------------------------------
        // SIDE MIRRORS
        // ----------------------------------------------------

        for (const z of[-0.9, 0.9]) {

            addBox(
                car,
                0.22,
                0.13,
                0.22,
                bodyMat,
                0.72,
                1.6,
                z
            );

        }

        // ----------------------------------------------------
        // WHEELS
        // ----------------------------------------------------

        const wheels = [];

        const wheelPositions = [
            [1.05, 0.95, 0.9],
            [-1.15, 0.95, 0.9],
            [1.05, 0.95, -0.9],
            [-1.15, 0.95, -0.9]
        ];

        const tireMat = createMaterial(
            0x111827,
            0.02,
            0.92
        );

        wheelPositions.forEach((position) => {

            const wheel = new THREE.Group();

            wheel.position.set(
                position[0],
                position[1],
                position[2]
            );

            // Tire

            const tire = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    0.42,
                    0.42,
                    0.25,
                    32
                ),
                tireMat
            );

            tire.rotation.x = Math.PI / 2;

            tire.castShadow = true;

            wheel.add(tire);

            // Rim

            const rim = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    0.25,
                    0.25,
                    0.27,
                    32
                ),
                chromeMat
            );

            rim.rotation.x = Math.PI / 2;

            wheel.add(rim);

            // Hub

            const hub = new THREE.Mesh(
                new THREE.CylinderGeometry(
                    0.09,
                    0.09,
                    0.29,
                    20
                ),
                darkMat
            );

            hub.rotation.x = Math.PI / 2;

            wheel.add(hub);

            // Rim spokes

            for (let i = 0; i < 5; i++) {

                const angle =
                    (i / 5) * Math.PI * 2;

                const spoke = new THREE.Mesh(
                    new THREE.BoxGeometry(
                        0.055,
                        0.34,
                        0.035
                    ),
                    chromeMat
                );

                spoke.position.set(
                    Math.cos(angle) * 0.12,
                    Math.sin(angle) * 0.12,
                    0
                );

                spoke.rotation.z = angle;

                wheel.add(spoke);

            }

            car.add(wheel);

            wheels.push(wheel);

        });

        // ----------------------------------------------------
        // UNDERCARRIAGE
        // ----------------------------------------------------

        addBox(
            car,
            2.8,
            0.16,
            1.35,
            darkMat,
            0,
            0.48,
            0
        );

        // ----------------------------------------------------
        // FINAL SETUP
        // ----------------------------------------------------

        car.traverse((object) => {

            if (object.isMesh) {

                object.castShadow = true;
                object.receiveShadow = true;

            }

        });

        car.position.set(
            STATION_X.loading,
            0.25,
            0
        );

        this.scene.add(car);

        return {
            id,
            group: car,
            wheels,
            station: "loading",
            progress: 0,
            status: "running",
            wheelCount: 4,
            isPreview: false
        };

    }

    // ========================================================
    // REMOVE CAR
    // ========================================================

    removeCar(car) {

        if (!car || !car.group) return;

        this.scene.remove(car.group);

        car.group.traverse((object) => {

            if (object.isMesh) {

                if (object.geometry) {
                    object.geometry.dispose();
                }

                if (object.material) {

                    if (Array.isArray(object.material)) {

                        object.material.forEach(
                            (mat) => mat.dispose()
                        );

                    } else {

                        object.material.dispose();

                    }

                }

            }

        });

    }

    // ========================================================
    // CLEAR ALL UNITS
    // ========================================================

    clearUnits() {

        if (this.cur) {

            this.removeCar(this.cur);

            this.cur = null;

        }

        if (this.preview) {

            this.removeCar(this.preview);

            this.preview = null;

        }

        this.leaving.forEach((car) => {

            this.removeCar(car);

        });

        this.leaving = [];

        // Restore all four tires to the feed rack after reset.
        this.rackTires.forEach((stockWheel) => {
            stockWheel.position.copy(stockWheel.userData.homePosition);
            stockWheel.visible = true;
        });

        this.assemblyElapsed = 0;
        this.assemblyUnitId = null;
    }

    // ========================================================
    // PREVIEW CAR
    // ========================================================

    createPreviewCar() {

        if (this.preview || this.cur) return;

        const preview = this.makeUnit("1");

        preview.id = "preview";

        preview.isPreview = true;

        preview.status = "preview";

        preview.group.position.set(
            STATION_X.loading,
            0.25,
            0
        );

        preview.group.scale.setScalar(0.95);

        this.preview = preview;

    }

    // ========================================================
    // CREATE ACTIVE PRODUCTION CAR
    // ========================================================

    createActiveCar(engineUnit) {

        if (!engineUnit) return;

        if (this.preview) {
            this.removeCar(this.preview);
            this.preview = null;
        }

        if (this.cur) {
            this.removeCar(this.cur);
            this.cur = null;
        }

        const car = this.makeUnit(engineUnit.no);

        car.id = engineUnit.no;
        car.wheelCount = Number(
            engineUnit.wheels !== undefined && engineUnit.wheels !== null ?
            engineUnit.wheels :
            4
        );
        car.missingWheel = -1;

        if (car.wheels.length >= 4 && car.wheelCount === 3) {
            let missingWheel = Number(engineUnit.missingWheel);

            if (!Number.isInteger(missingWheel) ||
                missingWheel < 0 ||
                missingWheel > 3) {
                missingWheel = (Number(engineUnit.no) - 1) % 4;
            }

            car.missingWheel = missingWheel;
        }

        // A new chassis enters Loading without installed wheels.
        // Four separate stock tires remain visible on the assembly rack.
        car.wheelTargets = car.wheels.map(
            (wheel) => wheel.position.clone()
        );

        car.wheels.forEach((wheel, index) => {
            wheel.visible = false;
            wheel.position.copy(car.wheelTargets[index]);
        });

        this.rackTires.forEach((stockWheel) => {
            stockWheel.position.copy(stockWheel.userData.homePosition);
            stockWheel.visible = true;
        });

        this.assemblyElapsed = 0;
        this.assemblyUnitId = null;
        this.cur = car;
    }

    // ========================================================
    // FINISHED CAR CALLBACK
    // ========================================================


    createOutputRoute(car, rejected) {

        const laneZ = rejected ? 3.6 : -3.6;

        const start = car.group.position.clone();

        start.y = 0.25;
        start.z = 0;

        // Follow the main conveyor first,
        // then enter the correct Y-shaped branch.

        const points = [
            start,

            new THREE.Vector3(
                9.0,
                0.25,
                0
            ),

            new THREE.Vector3(
                10.5,
                0.25,
                0
            ),

            new THREE.Vector3(
                11.3,
                0.25,
                Math.sign(laneZ) * 1.2
            ),

            new THREE.Vector3(
                12.0,
                0.25,
                Math.sign(laneZ) * 2.0
            ),

            new THREE.Vector3(
                13.8,
                0.25,
                laneZ
            ),

            new THREE.Vector3(
                17.8,
                0.25,
                laneZ
            ),

            new THREE.Vector3(
                20.8,
                0.25,
                laneZ
            )
        ];

        return new THREE.CatmullRomCurve3(
            points,
            false,
            "catmullrom",
            0.35
        );

    }


    // ========================================================
    // FINISHED CAR CALLBACK
    // ========================================================

    onFinished(detail) {

        if (!this.cur) return;

        const result = String(
            (detail && detail.status) || ""
        ).toLowerCase();

        const rejected =
            result.includes("ng") ||
            result.includes("reject") ||
            result.includes("fail") ||
            this.cur.wheelCount === 3;

        this.cur.result = rejected ? "NG" : "OK";
        this.cur.outputCurve = this.createOutputRoute(this.cur, rejected);
        this.cur.outputElapsed = 0;
        this.cur.outputDuration = 5.2;
        this.cur.outputDwell = 0;
        this.cur.outputStarted = true;

        // Do not assign a destination and independently damp X/Z.
        // The car is now driven along the physical curved conveyor path.
        this.leaving.push(this.cur);
        this.cur = null;

    }

    // ========================================================
    // UPDATE SIMULATION
    // ========================================================

    update(engineState, delta = 0.016) {

            if (!engineState) return;

            const dt = Math.min(
                Math.max(delta, 0),
                0.05
            );

            const elapsed =
                performance.now() * 0.001;

            const stationState =
                engineState.stations || {};

            // ----------------------------------------------------
            // PREVIEW CAR
            // ----------------------------------------------------

            const hasWorkOrder = !!engineState.wo;

            const hasActiveUnit = !!engineState.unit;

            const validPreviewStatus = [
                "ready",
                "running",
                "paused"
            ].includes(engineState.status);

            if (
                hasWorkOrder &&
                validPreviewStatus &&
                !hasActiveUnit &&
                !this.cur &&
                !this.preview
            ) {

                this.createPreviewCar();

            }

            // Remove preview when work order is cleared

            if (!hasWorkOrder && this.preview) {

                this.removeCar(this.preview);

                this.preview = null;

            }

            // ----------------------------------------------------
            // ACTIVE PRODUCTION UNIT
            // ----------------------------------------------------

            if (engineState.unit) {

                const unit = engineState.unit;

                if (!this.cur ||
                    this.cur.isPreview ||
                    String(this.cur.id) !== String(unit.no)
                ) {

                    this.createActiveCar(unit);

                }

            }

            // ----------------------------------------------------
            // UPDATE STATION BEACONS
            // ----------------------------------------------------

            Object.keys(this.stationObjects).forEach(
                (station) => {

                    const object =
                        this.stationObjects[station];

                    const status =
                        stationState[station] || "idle";

                    const mat = object.beaconMaterial;

                    if (status === "down") {

                        mat.color.set(LAMP.down);

                        mat.emissive.set(0xff2020);

                        mat.emissiveIntensity =
                            1.5 + Math.sin(elapsed * 9) * 0.7;

                        object.beacon.scale.setScalar(
                            1 + Math.sin(elapsed * 9) * 0.12
                        );

                    } else if (status === "running") {

                        mat.color.set(LAMP.running);

                        mat.emissive.set(0x16a34a);

                        mat.emissiveIntensity = 1.2;

                        object.beacon.scale.setScalar(1);

                    } else {

                        mat.color.set(object.color);

                        mat.emissive.set(object.color);

                        mat.emissiveIntensity = 0.8;

                        object.beacon.scale.setScalar(1);

                    }

                }
            );

            // ----------------------------------------------------
            // ANIMATE CONVEYOR ROLLERS
            // ----------------------------------------------------

            let conveyorMoving = false;

            if (
                this.cur &&
                engineState.unit &&
                engineState.status === "running" &&
                !engineState.downtime
            ) {
                const conveyorStage = THREE.MathUtils.clamp(
                    Number(engineState.unit.stage) || 0,
                    0,
                    STATIONS.length - 1
                );

                const conveyorStation = STATIONS[conveyorStage];
                const conveyorTargetX =
                    STATION_X[conveyorStation] !== undefined ?
                    STATION_X[conveyorStation] :
                    STATION_X.loading;

                conveyorMoving =
                    Math.abs(this.cur.group.position.x - conveyorTargetX) > 0.18;
            }

            if (conveyorMoving) {
                this.rollers.forEach((rollerGroup) => {
                    const rollerMesh = rollerGroup.children[0];
                    if (rollerMesh) {
                        // Slow, consistent rotation around each roller axle.
                        rollerMesh.rotation.z -= dt * 0.72;
                    }
                });
            }

            // ----------------------------------------------------
            // MOVE ACTIVE CAR
            // ----------------------------------------------------

            if (this.cur && engineState.unit) {

                const unit = engineState.unit;

                const stage = THREE.MathUtils.clamp(
                    Number(unit.stage) || 0,
                    0,
                    STATIONS.length - 1
                );

                const station = STATIONS[stage];

                const targetX =
                    STATION_X[station] !== undefined ?
                    STATION_X[station] :
                    STATION_X.loading;

                const previousStation = this.cur.station;

                this.cur.group.position.x =
                    THREE.MathUtils.damp(
                        this.cur.group.position.x,
                        targetX,
                        8.0,
                        dt
                    );

                this.cur.station = station;

                // Keep the chassis stable on the conveyor.
                if (engineState.downtime && station === "assembly") {
                    this.cur.group.position.y =
                        0.25 + Math.sin(elapsed * 18) * 0.012;
                } else {
                    this.cur.group.position.y =
                        THREE.MathUtils.damp(
                            this.cur.group.position.y,
                            0.25,
                            6,
                            dt
                        );
                }

                this.cur.group.rotation.z =
                    THREE.MathUtils.damp(
                        this.cur.group.rotation.z,
                        0,
                        6,
                        dt
                    );

                // ------------------------------------------------
                // ONE-BY-ONE WHEEL INSTALLATION
                // Rack stock stays visible until that exact tire is picked.
                // The matching wheel on the chassis appears only after fitment.
                // ------------------------------------------------

                if (station === "assembly") {

                    const unitId = String(unit.no);

                    if (
                        previousStation !== "assembly" ||
                        this.assemblyUnitId !== unitId
                    ) {
                        this.assemblyElapsed = 0;
                        this.assemblyUnitId = unitId;

                        this.cur.wheels.forEach((wheel, index) => {
                            wheel.visible = false;
                            wheel.position.copy(this.cur.wheelTargets[index]);
                        });

                        this.rackTires.forEach((stockWheel) => {
                            stockWheel.position.copy(stockWheel.userData.homePosition);
                            stockWheel.visible = true;
                        });

                        if (this.wheelRobot) {
                            this.wheelRobot.rotation.set(0, 0, 0);
                        }
                    }

                    const canInstall =
                        engineState.status === "running" &&
                        !engineState.downtime;

                    if (canInstall) {
                        this.assemblyElapsed += dt;
                    }

                    const stationDuration = Number(DURATION[1]) || 7;
                    // Engine.js defines DURATION as [2, 3, 2].
                    // Reserve about 16% of the assembly stage as a visual
                    // buffer, while still giving every tire its own sequence.
                    const phaseDuration = Math.max(
                        0.45,
                        Math.min(0.68, stationDuration * 0.21)
                    );
                    const totalInstallTime = phaseDuration * 4;
                    const installOrder = [0, 1, 2, 3];

                    // Keep the car and assembly group matrices current before
                    // converting each wheel target into rack-local coordinates.
                    this.cur.group.updateMatrixWorld(true);
                    const assemblyGroup = this.stationObjects.assembly.group;
                    assemblyGroup.updateMatrixWorld(true);

                    installOrder.forEach((wheelIndex, orderIndex) => {
                        const carWheel = this.cur.wheels[wheelIndex];
                        const stockWheel = this.rackTires[wheelIndex];
                        const target = this.cur.wheelTargets[wheelIndex];

                        const phaseStart = orderIndex * phaseDuration;
                        const phaseProgress = THREE.MathUtils.clamp(
                            (this.assemblyElapsed - phaseStart) / phaseDuration,
                            0,
                            1
                        );

                        const targetWorld = this.cur.group.localToWorld(
                            target.clone()
                        );
                        const targetRackLocal = assemblyGroup.worldToLocal(
                            targetWorld.clone()
                        );

                        // NG deliberately skips one tire. Its stock tire remains
                        // on the rack and its chassis hub remains empty.
                        if (wheelIndex === this.cur.missingWheel) {
                            carWheel.visible = false;
                            stockWheel.visible = true;
                            stockWheel.position.copy(stockWheel.userData.homePosition);
                            return;
                        }

                        if (this.assemblyElapsed >= (orderIndex + 1) * phaseDuration) {
                            // This tire has completed alignment and tightening.
                            stockWheel.visible = false;
                            carWheel.visible = true;
                            carWheel.position.copy(target);
                        } else if (this.assemblyElapsed >= phaseStart) {
                            // Only the current tire leaves the rack.
                            stockWheel.visible = true;
                            carWheel.visible = false;

                            const transferProgress = THREE.MathUtils.clamp(
                                (phaseProgress - 0.08) / 0.68,
                                0,
                                1
                            );

                            const eased = transferProgress * transferProgress *
                                (3 - 2 * transferProgress);

                            stockWheel.position.lerpVectors(
                                stockWheel.userData.homePosition,
                                targetRackLocal,
                                eased
                            );

                            // A visible lift arc before the wheel meets the hub.
                            stockWheel.position.y +=
                                Math.sin(transferProgress * Math.PI) * 0.38;

                            // Small alignment movement while the nut runner tightens.
                            if (phaseProgress > 0.76) {
                                stockWheel.rotation.z =
                                    Math.sin(elapsed * 18) * 0.025;
                            } else {
                                stockWheel.rotation.z = 0;
                            }
                        } else {
                            // Tires waiting for their turn remain on the rack.
                            stockWheel.visible = true;
                            stockWheel.position.copy(stockWheel.userData.homePosition);
                            carWheel.visible = false;
                        }
                    });

                    // Robot approaches each tire in sequence and tightens it.
                    if (this.wheelRobot) {
                        const processFinished =
                            this.assemblyElapsed >= totalInstallTime;

                        this.wheelRobot.visible = !processFinished;

                        if (!processFinished) {
                            const step = Math.min(
                                3,
                                Math.floor(this.assemblyElapsed / phaseDuration)
                            );
                            const stepProgress =
                                (this.assemblyElapsed - step * phaseDuration) /
                                phaseDuration;

                            const robotAngles = [0.18, -0.18, 0.38, -0.38];

                            this.wheelRobot.rotation.y =
                                THREE.MathUtils.damp(
                                    this.wheelRobot.rotation.y,
                                    robotAngles[step],
                                    3.2,
                                    dt
                                );

                            if (
                                canInstall &&
                                stepProgress >= 0.76 &&
                                stepProgress < 1 &&
                                this.wheelTool
                            ) {
                                this.wheelTool.rotation.z += dt * 12;
                            }
                        }
                    }

                } else {

                    if (this.wheelRobot) {
                        this.wheelRobot.visible = false;
                    }

                    if (station === "inspection") {
                        // Inspection sees only tires fitted to the chassis.
                        this.cur.wheels.forEach((wheel, index) => {
                            const installed = index !== this.cur.missingWheel;
                            wheel.visible = installed;
                            if (installed && this.cur.wheelTargets[index]) {
                                wheel.position.copy(this.cur.wheelTargets[index]);
                            }
                        });

                        // Hide used stock tires. For NG, the missing tire stays
                        // visibly on the rack as evidence of the missing part.
                        this.rackTires.forEach((stockWheel, index) => {
                            stockWheel.visible = index === this.cur.missingWheel;
                            if (stockWheel.visible) {
                                stockWheel.position.copy(stockWheel.userData.homePosition);
                            }
                        });
                    } else if (station === "loading") {
                        this.cur.wheels.forEach((wheel) => {
                            wheel.visible = false;
                        });
                    }
                }
            }

            // ----------------------------------------------------
            // PREVIEW CAR ANIMATION
            // ----------------------------------------------------

            if (this.preview) {

                this.preview.group.position.y =
                    0.25 + Math.sin(elapsed * 1.5) * 0.015;

            }

            // ----------------------------------------------------
            // ASSEMBLY OVERHEAT VISUAL EFFECT
            // Based on engine.js downtime state
            // ----------------------------------------------------

            const isOverheating =
                Boolean(engineState.downtime) &&
                engineState.stations &&
                engineState.stations.assembly === "down";

            if (this.overheatGroup) {

                this.overheatGroup.visible = isOverheating;

                this.overheatWarning.visible =
                    isOverheating;

                if (isOverheating) {

                    const pulse =
                        0.5 + 0.5 * Math.sin(elapsed * 8);

                    this.overheatGroup.scale.setScalar(
                        0.85 + pulse * 0.25
                    );

                    this.overheatGroup.rotation.y =
                        elapsed * 0.5;

                    this.overheatLight.intensity =
                        1.8 + pulse * 1.7;

                    this.overheatRings.forEach(
                        (ring, index) => {

                            ring.rotation.z =
                                elapsed *
                                (index % 2 === 0 ? 1 : -1);

                            ring.material.opacity =
                                0.35 + pulse * 0.45;

                        }
                    );

                } else {

                    this.overheatLight.intensity = 0;

                    this.overheatGroup.scale.setScalar(1);

                    this.overheatGroup.rotation.set(0, 0, 0);

                }

            }

            // ----------------------------------------------------
            // ANIMATE ASSEMBLY STATION
            // ----------------------------------------------------

            const assembly =
                this.stationObjects.assembly;

            if (assembly) {

                if (
                    stationState.assembly === "running"
                ) {

                    assembly.group.rotation.y =
                        Math.sin(elapsed * 2) * 0.008;

                } else {

                    assembly.group.rotation.y = 0;

                }

            }

            // ----------------------------------------------------
            // ANIMATE INSPECTION LIGHT
            // ----------------------------------------------------

            const inspection =
                this.stationObjects.inspection;

            if (inspection) {

                if (
                    stationState.inspection === "running"
                ) {

                    this.inspectionLight.intensity =
                        1 + Math.sin(elapsed * 6) * 0.4;

                } else {

                    this.inspectionLight.intensity = 0.8;

                }

            }

            // ----------------------------------------------------
            // SMOOTH OUTPUT TRANSFER - FOLLOW CURVED ROLLER PATH
            // ----------------------------------------------------

            const remainingCars = [];

            this.leaving.forEach((car) => {

                if (!car.outputCurve) {
                    remainingCars.push(car);
                    return;
                }

                if (car.outputElapsed < car.outputDuration) {

                    car.outputElapsed += dt;

                    const rawProgress = THREE.MathUtils.clamp(
                        car.outputElapsed / car.outputDuration,
                        0,
                        1
                    );

                    // Smooth acceleration and deceleration, with no vertical arc.
                    const easedProgress = rawProgress * rawProgress * (3 - 2 * rawProgress);
                    const point = car.outputCurve.getPointAt(easedProgress);
                    const tangent = car.outputCurve.getTangentAt(easedProgress).normalize();

                    car.group.position.set(
                        point.x,
                        0.25,
                        point.z
                    );

                    // Car nose follows the conveyor curve smoothly.
                    const targetYaw = Math.atan2(-tangent.z, tangent.x);
                    car.group.rotation.y = THREE.MathUtils.damp(
                        car.group.rotation.y,
                        targetYaw,
                        5.5,
                        dt
                    );

                    // Keep the chassis level while turning.
                    car.group.rotation.x = 0;
                    car.group.rotation.z = 0;

                    remainingCars.push(car);

                } else {

                    // Briefly remain on the output conveyor before leaving the scene.
                    car.outputDwell += dt;

                    if (car.outputDwell < 1.25) {
                        remainingCars.push(car);
                    } else {
                        this.removeCar(car);
                    }

                }

            });

            this.leaving = remainingCars;

        } // PENUTUP METHOD update()

    // ========================================================
    // RESIZE
    // ========================================================

    resize() {
        if (!this.renderer || !this.camera) return;

        const width =
            this.container.clientWidth || window.innerWidth;

        const height =
            this.container.clientHeight || window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 2)
        );
    }

    // ========================================================
    // THEME
    // ========================================================

    setTheme(theme = "dark") {
        // main.js may pass a boolean (true = light, false = dark)
        // or a string ("light" / "dark").
        const isDark = theme === "dark" || theme === false;

        const background = isDark ? 0x263442 : 0xc7d2dc;

        this.scene.background = new THREE.Color(background);

        this.scene.fog = new THREE.Fog(
            background,
            48,
            95
        );

        if (this.floor) {
            this.floor.material.color.set(
                isDark ? 0x66737d : 0x89949c
            );
        }
    }

    // ========================================================
    // RENDER
    // ========================================================

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;

        this.controls.update();

        this.renderer.render(this.scene, this.camera);
    }

    // ========================================================
    // DISPOSE
    // ========================================================

    dispose() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        this.engine.removeEventListener(
            "finished",
            this.handleFinished
        );

        this.engine.removeEventListener(
            "loaded",
            this.handleLoaded
        );

        this.clearUnits();

        if (this.controls) {
            this.controls.dispose();
        }

        if (this.renderer) {
            this.renderer.dispose();

            if (this.renderer.domElement.parentElement) {
                this.renderer.domElement.parentElement.removeChild(
                    this.renderer.domElement
                );
            }
        }
    }

}