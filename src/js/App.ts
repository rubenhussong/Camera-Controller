import * as THREE from "three";
import Stats from "three/addons/libs/stats.module.js";
import { CONTROL_MODE, OrbitXController } from "./controls/OrbitXControls";
import { EPSILON } from "./controls/mathUtils";

// ==================== M A I N
const stats = createStats();
const renderer = createRenderer();

const camera = createPerspectiveCamera(0, 0, 10);
const controls = createControls(camera, CONTROL_MODE.GROUNDED);
controls.setOrbitCenter({ x: 0, y: 0, z: 0 });
controls.lookAt({ x: 0, y: 0, z: 0 });
// controls.setPosition({ x: 10, y: 10, z: 0 });

//controls.setOrbitCenter({ x: 0, y: 0, z: 0 });
// controls.loadState({
//   orbitCenter: new THREE.Vector3(0, 0, 0),
//   relativePosition: new THREE.Vector3(0, 0, 10),
//   eyeVector: new THREE.Vector3(0, 0, -1).normalize(),
//   upVector: new THREE.Vector3(0, 1, 0).normalize(),
// });

const scene = new THREE.Scene();
addLights();
// addAxisHelper(9);
addSphere(9.5, "beige");
// addSphere(4, "skyblue");

startListeningOnResize(() => (controls.needsUpdate = true));
startAnimating();
render();

// ==================== R E N D E R E R
function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  return renderer;
}

// ==================== S T A T S
function createStats(parent = document.body) {
  const stats = new Stats();
  parent.appendChild(stats.dom);
  return stats;
}

// ==================== C O N T R O L S
function createControls(
  camera: THREE.PerspectiveCamera,
  mode = CONTROL_MODE.ORBIT
) {
  const controls = new OrbitXController(renderer.domElement, mode);
  controls.setCamera(camera);
  controls.enable();
  return controls;
}

// ==================== C A M E R A
function createPerspectiveCamera(
  x = 0,
  y = 0,
  z = 0,
  fov = 50,
  near = EPSILON / 10,
  far = 1000
) {
  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.set(x, y, z);
  return camera;
}

// ==================== L I G H T S
function addLights() {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);
  const pointLight = new THREE.PointLight(0xffffff, 3, 1000, 0.01);
  pointLight.position.set(100, 0, 0);
  scene.add(pointLight);
}

// ==================== A X I S   H E L P E R
function addAxisHelper(size = 5) {
  const axesHelper = new THREE.AxesHelper(size);
  scene.add(axesHelper);
}

// ==================== M E S H E S
function addSphere(
  radius: number,
  color: THREE.ColorRepresentation,
  detail = 30,
  x = 0,
  y = 0,
  z = 0
) {
  const sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, detail),
    new THREE.MeshBasicMaterial({ color: color, wireframe: true })
  );
  sphere.position.set(x, y, z);
  scene.add(sphere);
}

function drawVector(
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: THREE.ColorRepresentation
) {
  const arrowHelper = new THREE.ArrowHelper(
    end.clone().normalize(),
    start,
    end.length(),
    color
  );
  scene.add(arrowHelper);
}

// ==================== R E S I Z E
function startListeningOnResize(handleResize: () => void) {
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    handleResize();
    render();
  }
  window.addEventListener("resize", onWindowResize, false);
}

// ==================== R E N D E R   L O O P
function startAnimating() {
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    const updated = controls.update(delta);

    if (updated) render();
    stats.update();
  }
  animate();
}

function render() {
  renderer.render(scene, camera);
}
