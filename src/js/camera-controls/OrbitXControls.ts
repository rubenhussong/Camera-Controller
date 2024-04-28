import { PerspectiveCamera, Quaternion, Vector3, Vector3Like } from "three";
import { EPSILON } from "./mathUtils";
import { InteractionHandler } from "./InteractionHandler";
import { OrbitState } from "./camera-states/OrbitState";
import { CameraSaveState, CameraState, UniformState } from "./CameraState";
import { IsotropicState } from "./camera-states/IsotropicState";
import { GroundedState } from "./camera-states/GroundedState";

// TODO: Seperate LookAt from OrbitCenter
// TODO: Check if there is still an occasional jump on camera animation start after a lot of panning and rotating

export const CONTROL_MODE = {
  ISOTROPIC: 0,
  GROUNDED: 1,
  ORBIT: 2,
};

export class OrbitXController extends InteractionHandler {
  // Only transform camera (position, rotation, scale, up) while controller is disabled.
  private camera: PerspectiveCamera;

  private controlMode: number;
  private state: UniformState<CameraState<any>>;
  private stateEnd: UniformState<CameraState<any>>;

  private defaultState: CameraSaveState;

  constructor(domElement: HTMLElement, stateMode = CONTROL_MODE.ORBIT) {
    super(domElement);
    this.camera = null!;
    this.controlMode = Math.min(stateMode, CONTROL_MODE.ORBIT);
    switch (this.controlMode) {
      case CONTROL_MODE.ISOTROPIC: {
        this.state = new IsotropicState();
        this.stateEnd = new IsotropicState();
        break;
      }
      case CONTROL_MODE.GROUNDED: {
        this.state = new GroundedState();
        this.stateEnd = new GroundedState();
        break;
      }
      default: {
        this.state = new OrbitState();
        this.stateEnd = new OrbitState();
      }
    }
    this.defaultState = new CameraSaveState();
  }

  // ==================== A P I

  dollySpeed = 0.3;
  rotateSpeed = 2;
  panSpeed = 1;

  minDollyStep = 5e-3;

  smoothTime = 0.1; // Approx. time in seconds to reach end state in update function

  minDistance: number = EPSILON;
  maxDistance: number = Infinity;

  needsUpdate = false;

  // ==================== A B S T R A C T S

  // ========== E N A B L E  &  D I S A B L E

  // If the camera has been moved manually while disabled, it is likely that it will have a new orbitCenter after being reenabled.
  protected onEnable = (transition = false) => {
    if (!this.camera) {
      throw new Error("Camera Controller can not be enabled without a camera.");
    }
    this.stateEnd.setFromCamera(this.camera);
    this.internalUpdate(transition);
  };

  protected onDisable = () => {
    if (!this.camera) return;
    this.discardUpdates();
  };

  // ========== T R A N S F O R M A T I O N S

  protected rotate = (deltaX: number, deltaY: number) => {
    this.stateEnd.rotateUp(Math.PI * this.rotateSpeed * deltaY);
    this.stateEnd.rotateLeft(Math.PI * this.rotateSpeed * -deltaX);
    this.needsUpdate = true;
  };

  protected dolly = (direction: number) => {
    this.stateEnd.dolly(
      Math.pow(1 + direction * 0.05, this.dollySpeed),
      this.minDollyStep
    );
    this.stateEnd.clampDistance(this.minDistance, this.maxDistance);
    this.needsUpdate = true;
  };

  protected pan = (deltaX: number, deltaY: number) => {
    const fov = this.camera.getEffectiveFOV();
    this.stateEnd.panUp(-deltaY * this.panSpeed, fov);
    this.stateEnd.panLeft(deltaX * this.panSpeed, fov);
    this.needsUpdate = true;
  };

  // ==================== I N T E R N A L   M E T H O D S

  // Fast forward to final state on default
  private internalUpdate = (transition = false) => {
    if (!transition) this.state.copy(this.stateEnd);
    if (this.camera) {
      this.update(0, true);
      this.needsUpdate = true;
    }
  };

  // Discards potential further state change
  private discardUpdates = () => {
    this.stateEnd.copy(this.state);
    this.update(0, true);
  };

  // ==================== A P I   M E T H O D S

  // ========== S E T T E R

  setCamera = (camera: PerspectiveCamera) => {
    if (this.camera) this.discardUpdates();
    this.camera = camera;
    this.stateEnd.setFromCamera(this.camera);
    this.internalUpdate();
  };

  setPosition = (position: Vector3Like, transition = false) => {
    this.stateEnd.setPosition(position);
    this.internalUpdate(transition);
  };

  /**
   * Changes the position the camera orbits around on interaction.
   * This may change the looking direction if a state is active that does not seperate orbit center and looking direction.
   * @param orbitCenter New orbit center
   * @param transition If the camera should smoothDamp towards the new rotation
   */
  setOrbitCenter = (orbitCenter: Vector3Like, transition = false) => {
    this.stateEnd.setOrbitCenter(orbitCenter);
    this.internalUpdate(transition);
  };

  /**
   * Changes the camera rotation.
   * This may change the orbit center if a state is active that does not seperate orbit center and looking direction.
   * @param target Target position in the object space the camera is in.
   */
  lookAt = (target: Vector3Like, transition = false) => {
    this.stateEnd.lookAt(target);
    this.internalUpdate(transition);
  };

  /**
   * Changes the camera rotation.
   * This may change the orbit center if a state is active that does not seperate orbit center and looking direction.
   * @param target Target position in world coordinates
   */
  lookAtWorldPosition = (target: Vector3Like) => {
    // TODO: Set stateEnd and call internalUpdate
  };

  setZoomLimits = (min: number, max: number, transition = false) => {
    if (min < EPSILON || max < EPSILON)
      throw new Error("Zoom limits must be positive.");
    if (min > max)
      throw new Error("Minimum zoom must not be smaller than max zoom.");
    this.minDistance = min;
    this.maxDistance = max;
    this.stateEnd.clampDistance(min, max);
    this.internalUpdate(transition);
  };

  // ========== I S O T R O P I C
  // Like Trackball Controls

  setStateMode = (mode: number) => {
    mode = Math.min(mode, CONTROL_MODE.ORBIT);
    if (this.controlMode === mode) return;

    const saveState = this.state.saveState();
    const saveStateEnd = this.stateEnd.saveState();
    switch (mode) {
      case CONTROL_MODE.ISOTROPIC: {
        this.state = new IsotropicState();
        this.stateEnd = new IsotropicState();
        break;
      }
      case CONTROL_MODE.GROUNDED: {
        this.state = new GroundedState();
        this.stateEnd = new GroundedState();
        break;
      }
      default: {
        this.state = new OrbitState();
        this.stateEnd = new OrbitState();
      }
    }
    this.state.loadState(saveState);
    this.state.loadState(saveStateEnd);
    this.internalUpdate(true);
    this.controlMode = mode;
  };

  // ========== S T A T E   H A N D L I N G

  setDefaultState = (state: CameraSaveState = this.state.saveState()) => {
    this.defaultState = state;
  };

  resetStateToDefault = (transition = false) => {
    this.loadState(this.defaultState, transition);
  };

  loadState = (state: CameraSaveState, transition = false) => {
    this.stateEnd.loadState(state);
    this.internalUpdate(transition);
  };

  // ========== A N I M A T I O N

  /**
   * Animates the controlled camera from the transformation of c back to its initial transformation.
   * Transformation means the position, quaternion and up-vector.
   * @param c - other camera
   * @param duration
   * @param timingFunction
   */
  // TODO: Change c to a CameraSaveState
  // TODO: Disable controls while animating
  // TODO: Call internalUpdate and so on
  animateFrom = (
    c: PerspectiveCamera,
    duration = 1,
    timingFunction = (t: number) => t
  ) => {
    if (!this.camera) {
      throw new Error(
        "There is no camera available that could be animated. Call setCamera before animating."
      );
    }
    if (
      c.near !== this.camera.near ||
      c.far !== this.camera.far ||
      c.fov !== this.camera.fov ||
      c.aspect !== this.camera.aspect
    ) {
      throw new Error(
        "Near, far, fov, and aspect must be identical for both cameras to animate smoothly."
      );
    }

    // Copy initial position of controlled camera
    let initialPosition = this.camera.position.clone();
    let initialQuaternion = this.camera.quaternion.clone();
    let initialUp = this.camera.up.clone();

    // Orientierung von c1 auf c2 setzen
    copyCameraOrientation(this.camera, c);

    let startTime = Date.now(); // Change to Three.clock
    function animate() {
      let now = Date.now();
      let elapsed = (now - startTime) / 1000;
      let progress = timingFunction(Math.min(elapsed / duration, 1));

      c.position.lerp(initialPosition, progress);
      c.quaternion.slerp(initialQuaternion, progress);
      c.up.lerp(initialUp, progress);

      if (elapsed < duration) requestAnimationFrame(animate);
    }

    animate();
  };

  animateTo = (state: CameraSaveState) => {
    // TODO: Probably with some more props like duration and timing function
    // TODO: Implement
  };

  /**
   * Calculates the CameraState that the controlled camera would need to be in to have another cameras position, rotation and up-vector.
   * If the cameras are in different object spaces, this method translates the transformation of the other camera to the object space of this camera.
   * @param c other camera
   * @returns Camera Save State
   */
  getLocalTransformation = (c: PerspectiveCamera) => {
    // TODO: Convert
    return new CameraSaveState();
  };

  // ========== U P D A T E

  update = (delta: number, force = false) => {
    if (!force && !this.needsUpdate) return false;
    this.needsUpdate = !this.state.smoothDampTo(
      this.stateEnd,
      this.smoothTime,
      delta
    );
    this.state.applyToCamera(this.camera);
    return true;
  };
}

// c2 to c1 in object space
function copyCameraOrientation(c1: PerspectiveCamera, c2: PerspectiveCamera) {
  // Weltkoordinaten von c2 in Bezug auf die Szene berechnen
  let worldPositionC2 = new Vector3();
  let worldQuaternionC2 = new Quaternion();
  c2.getWorldPosition(worldPositionC2);
  c2.getWorldQuaternion(worldQuaternionC2);

  const inverseC1Quat = c1.quaternion.clone().invert();

  // Weltkoordinaten von c2 in Bezug auf c1 umrechnen
  let relativePositionC2 = worldPositionC2.clone().sub(c1.position);
  relativePositionC2.applyQuaternion(inverseC1Quat);

  // Relative Rotation von c2 zu c1 berechnen
  let relativeQuaternionC2 = worldQuaternionC2.clone().multiply(inverseC1Quat);

  // Kopieren der relativen Position und Rotation
  c1.position.add(relativePositionC2);
  c1.quaternion.multiply(relativeQuaternionC2);

  // Weltkoordinaten von Up-Vektor von c2 in Bezug auf c1 umrechnen
  let worldUpC2 = c2.up.clone().applyQuaternion(worldQuaternionC2);
  let relativeUpC2 = worldUpC2.clone().applyQuaternion(inverseC1Quat); // Not sure if this correct. In the original code this used the inverse of the updated quaternion.

  // Kopieren des Up-Vektors
  c1.up.copy(relativeUpC2);

  // Kopieren von Near und Far Clipping Planes
  c1.near = c2.near;
  c1.far = c2.far;

  // Kopieren des Field of View (FOV)
  c1.fov = c2.fov;

  // Kopieren des Aspect Ratio (falls nötig)
  c1.aspect = c2.aspect;
}
