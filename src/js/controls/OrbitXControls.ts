import { PerspectiveCamera, Quaternion, Vector3, Vector3Like } from "three";
import { EPSILON } from "./mathUtils";
import { InteractionHandler } from "./InteractionHandler";
import { CameraSaveState, StateAnimator } from "./StateAnimator";
import { IsotropicAnimator } from "./animators/IsotropicAnimator";
import { GroundedAnimator } from "./animators/GroundedAnimator";
import { OrbitAnimator } from "./animators/OrbitAnimator";

// TODO: Seperate LookAt from OrbitCenter
// TODO: Check if there is still an occasional jump on camera animation start after a lot of panning and rotating

export const MODE = {
  ISOTROPIC: 0,
  GROUNDED: 1,
  ORBIT: 2,
};

export class OrbitXControls extends InteractionHandler {
  // Only transform camera (position, rotation, scale, up) while controller is disabled.
  private camera: PerspectiveCamera;
  private stateAnimator: StateAnimator<any>;

  private mode: number;
  private defaultState: CameraSaveState;

  private minDistance: number = EPSILON;
  private maxDistance: number = Infinity;

  // ==================== A P I

  // Isotropic, Grounded, Orbit
  private dollySpeed = [0.3, 0.1, 0.3];
  private rotateSpeed = [2, 0.5, 2];
  private panSpeed = [1, 0.1 * Math.PI, 1];

  private minDollyStep = 5e-3;

  private smoothTime = [0.1, 0.15, 0.1]; // Approx. time in seconds to reach end state in update function

  needsUpdate = false;

  constructor(
    domElement: HTMLElement,
    camera: PerspectiveCamera,
    controlMode = MODE.ORBIT
  ) {
    super(domElement);
    this.camera = camera;
    this.mode = Math.min(controlMode, MODE.ORBIT);
    switch (this.mode) {
      case MODE.ISOTROPIC: {
        this.stateAnimator = new IsotropicAnimator(camera);
        break;
      }
      case MODE.GROUNDED: {
        this.stateAnimator = new GroundedAnimator(camera);
        break;
      }
      default: {
        this.stateAnimator = new OrbitAnimator(camera);
      }
    }
    this.defaultState = new CameraSaveState();
    this.needsUpdate = true;
  }

  // ==================== A B S T R A C T S

  // ========== E N A B L E  &  D I S A B L E

  // If camera has been moved manually while disabled, it likely gets a new orbitCenter on reenable
  protected onEnable = (transition = false) => {
    this.stateAnimator.setFromCamera(this.camera);
    this.internalUpdate(transition);
  };

  protected onDisable = () => {
    this.stateAnimator.discardEnd();
  };

  // ========== T R A N S F O R M

  protected rotate = (deltaX: number, deltaY: number) => {
    const rotateScale = Math.PI * this.rotateSpeed[this.mode];
    this.stateAnimator.rotateUp(deltaY * rotateScale);
    this.stateAnimator.rotateLeft(-deltaX * rotateScale);
    this.needsUpdate = true;
  };

  protected dolly = (direction: number) => {
    this.stateAnimator.dolly(
      Math.pow(1 + direction * 0.05, this.dollySpeed[this.mode]),
      this.minDollyStep,
      this.minDistance,
      this.maxDistance
    );
    this.needsUpdate = true;
  };

  protected pan = (deltaX: number, deltaY: number) => {
    const fov = this.camera.getEffectiveFOV();
    const panScale = this.panSpeed[this.mode];
    this.stateAnimator.panUp(-deltaY * panScale, fov);
    this.stateAnimator.panLeft(deltaX * panScale, fov);
    this.needsUpdate = true;
  };

  // ==================== I N T E R N A L   M E T H O D S

  // Fast forward to final state on default
  private internalUpdate = (transition = false) => {
    if (!transition) this.stateAnimator.jumpToEnd();
    this.needsUpdate = true;
  };

  // ==================== A P I   M E T H O D S

  // ========== S E T T E R

  setCamera = (camera: PerspectiveCamera) => {
    this.camera = camera;
    this.stateAnimator.setFromCamera(this.camera);
    this.stateAnimator.clampDistance(this.minDistance, this.maxDistance);
    this.internalUpdate();
  };

  // Might change view direction if active mode does not seperate orbitCenter and view direction.
  setPosition = (position: Vector3Like, transition = false) => {
    this.stateAnimator.setPosition(position);
    this.stateAnimator.clampDistance(this.minDistance, this.maxDistance);
    this.internalUpdate(transition);
  };

  /**
   * Might change camera rotation if active mode does not seperate orbit center and view direction.
   * @param orbitCenter New orbit center
   * @param transition If the camera should smoothDamp towards the new rotation
   */
  setOrbitCenter = (orbitCenter: Vector3Like, transition = false) => {
    this.stateAnimator.setOrbitCenter(orbitCenter);
    this.stateAnimator.clampDistance(this.minDistance, this.maxDistance);
    this.internalUpdate(transition);
  };

  /**
   * Makes the camera look at a certain point in its object space.
   * Might change the orbit center if active mode does not seperate orbit center and view direction.
   * @param target Where the camera should look to
   * @param transition If the camera should smoothDamp towards the new rotation
   */
  lookAt = (target: Vector3Like, transition = false) => {
    this.stateAnimator.lookAt(target);
    this.stateAnimator.clampDistance(this.minDistance, this.maxDistance);
    this.internalUpdate(transition);
  };

  setZoomLimits = (min: number, max: number, transition = false) => {
    if (min < EPSILON || max < EPSILON)
      throw new Error("Zoom limits must be positive.");
    if (min > max)
      throw new Error("Minimum zoom must not be smaller than max zoom.");
    this.minDistance = min;
    this.maxDistance = max;
    this.stateAnimator.clampDistance(min, max);
    this.internalUpdate(transition);
  };

  // ==================== M O D E

  setMode = (mode: number) => {
    mode = Math.min(mode, MODE.ORBIT);
    if (this.mode === mode) return;
    this.mode = mode;
    const saveState = this.stateAnimator.saveState();
    switch (this.mode) {
      case MODE.ISOTROPIC: {
        this.stateAnimator = new IsotropicAnimator();
        break;
      }
      case MODE.GROUNDED: {
        this.stateAnimator = new GroundedAnimator();
        break;
      }
      default: {
        this.stateAnimator = new OrbitAnimator();
      }
    }
    this.stateAnimator.loadState(saveState);
    this.internalUpdate();
  };

  // ========== S T A T E   H A N D L I N G

  setDefaultState = (
    state: CameraSaveState = this.stateAnimator.saveState()
  ) => {
    this.defaultState = state;
  };

  resetStateToDefault = (transition = false) => {
    this.loadState(this.defaultState, transition);
  };

  loadState = (state: CameraSaveState, transition = false) => {
    this.stateAnimator.loadState(state);
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

  update = (delta: number) => {
    if (!this.needsUpdate) return false;
    const smoothTime = this.smoothTime[this.mode];
    this.needsUpdate = !this.stateAnimator.update(smoothTime, delta);
    this.stateAnimator.applyToCamera(this.camera);
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
