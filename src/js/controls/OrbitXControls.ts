import { PerspectiveCamera, Vector3Like } from "three";
import { InteractionHandler } from "./InteractionHandler";
import { ControlMode } from "./types/ControlMode";
import { ModeSpecificSetting } from "./ModeSpecificSetting";
import { ControlStateInterpolator } from "./ControlStateInterpolator";
import { IsotropicInterpolator } from "./interpolators/IsotropicInterpolator";
import { GroundedInterpolator } from "./interpolators/GroundedInterpolator";
import { OrbitInterpolator } from "./interpolators/OrbitInterpolator";
import { CameraSaveState } from "./SaveState";

export class OrbitXControls extends InteractionHandler {
  private camera: PerspectiveCamera;
  private mode: ControlMode;
  private controlStateHandler: ControlStateInterpolator<any>;

  private defaultState: CameraSaveState;

  constructor(
    domElement: HTMLElement,
    camera: PerspectiveCamera,
    mode: ControlMode = "orbit"
  ) {
    super(domElement);
    this.camera = camera;
    this.mode = mode;
    this.controlStateHandler = this.getAnimatorFromMode(mode);
    this.defaultState = new CameraSaveState();
    this.needsUpdate = true;
    this.enable();
  }

  // ==================== S E T T I N G S

  needsUpdate = false;
  minDollyStep = 5e-3;

  dollySpeed = new ModeSpecificSetting<number>({
    isotropic: 0.3,
    grounded: 0.1,
    orbit: 0.3,
  });
  rotateSpeed = new ModeSpecificSetting<number>({
    isotropic: 2,
    grounded: 0.5,
    orbit: 2,
  });
  panSpeed = new ModeSpecificSetting<number>({
    isotropic: 1,
    grounded: 0.1 * Math.PI,
    orbit: 1,
  });

  // Approx. time in seconds to reach end state in update function
  smoothTime = new ModeSpecificSetting<number>({
    isotropic: 0.1,
    grounded: 0.15,
    orbit: 0.1,
  });

  minDistance = new ModeSpecificSetting<number>({
    isotropic: 0,
    grounded: 0,
    orbit: 0,
    beforeChange: (v, mode) => {
      if (v < 0) throw new Error("Min distance must be positive.");
      if (v > this.maxDistance[mode])
        throw new Error("Min distance must not be larger than max distance.");
    },
    afterChange: (_, mode) => {
      if (this.mode !== mode) return;
      this.clampDistance();
      this.internalUpdate();
    },
  });
  maxDistance = new ModeSpecificSetting<number>({
    isotropic: Infinity,
    grounded: Infinity,
    orbit: Infinity,
    beforeChange: (v, mode) => {
      if (v < 0) throw new Error("Max distance must be positive.");
      if (v < this.minDistance[mode])
        throw new Error("Max distance must not be smaller than min distance.");
    },
    afterChange: (_, mode) => {
      if (this.mode !== mode) return;
      this.clampDistance();
      this.internalUpdate();
    },
  });

  // ==================== M O D E

  setMode = (mode: ControlMode) => {
    if (this.mode === mode) return;
    this.mode = mode;
    const saveState = this.controlStateHandler.saveState();
    this.controlStateHandler = this.getAnimatorFromMode(mode);
    this.controlStateHandler.loadState(saveState);
    this.internalUpdate();
  };

  private getAnimatorFromMode = (
    mode: ControlMode
  ): ControlStateInterpolator<any> => {
    if (mode === "isotropic") {
      return new IsotropicInterpolator(this.camera);
    }
    if (mode === "grounded") {
      return new GroundedInterpolator(this.camera);
    }
    return new OrbitInterpolator(this.camera);
  };

  // ==================== E N A B L E  &  D I S A B L E

  // If camera has been moved manually while disabled, it likely gets a new orbitCenter on reenable
  protected onEnable = (transition = false) => {
    this.controlStateHandler.setFromObject(this.camera);
    this.internalUpdate(transition);
  };

  protected onDisable = () => {
    this.controlStateHandler.discardEnd();
  };

  // ==================== S E T T E R

  // setZoomLimits = (min: number, max: number, transition = false) => {
  //   if (min < EPSILON || max < EPSILON)
  //     throw new Error("Zoom limits must be positive.");
  //   if (min > max)
  //     throw new Error("Minimum zoom must not be smaller than max zoom.");
  //   this.minDistance = min;
  //   this.maxDistance = max;
  //   this.controlStateHandler.clampDistance(min, max);
  //   this.internalUpdate(transition);
  // };

  setCamera = (camera: PerspectiveCamera) => {
    this.camera = camera;
    this.controlStateHandler.setFromObject(this.camera);
    this.clampDistance();
    this.internalUpdate();
  };

  // Might change view direction if active mode does not seperate orbitCenter and view direction.
  setPosition = (position: Vector3Like, transition = false) => {
    this.controlStateHandler.setPosition(position);
    this.clampDistance();
    this.internalUpdate(transition);
  };

  /**
   * Might change camera rotation if active mode does not seperate orbit center and view direction.
   * @param orbitCenter New orbit center
   * @param transition If the camera should smoothDamp towards the new rotation
   */
  setOrbitCenter = (orbitCenter: Vector3Like, transition = false) => {
    this.controlStateHandler.setOrbitCenter(orbitCenter);
    this.clampDistance();
    this.internalUpdate(transition);
  };

  /**
   * Makes the camera look at a certain point in its object space.
   * Might change the orbit center if active mode does not seperate orbit center and view direction.
   * @param target Where the camera should look to
   * @param transition If the camera should smoothDamp towards the new rotation
   */
  lookAt = (target: Vector3Like, transition = false) => {
    this.controlStateHandler.lookAt(target);
    this.clampDistance();
    this.internalUpdate(transition);
  };

  private clampDistance() {
    this.controlStateHandler.clampDistance(
      this.minDistance[this.mode],
      this.maxDistance[this.mode]
    );
  }

  // ========== S T A T E   H A N D L I N G

  setDefaultState = (
    state: CameraSaveState = this.controlStateHandler.saveState()
  ) => {
    this.defaultState = state;
  };

  resetStateToDefault = (transition = false) => {
    this.loadState(this.defaultState, transition);
  };

  loadState = (state: CameraSaveState, transition = false) => {
    this.controlStateHandler.loadState(state);
    this.internalUpdate(transition);
  };

  // ==================== T R A N S F O R M

  protected rotate = (deltaX: number, deltaY: number) => {
    const rotateScale = Math.PI * this.rotateSpeed[this.mode];
    this.controlStateHandler.rotateUp(deltaY * rotateScale);
    this.controlStateHandler.rotateLeft(-deltaX * rotateScale);
    this.needsUpdate = true;
  };

  protected dolly = (direction: number) => {
    this.controlStateHandler.dolly(
      Math.pow(1 + direction * 0.05, this.dollySpeed[this.mode]),
      this.minDollyStep,
      this.minDistance[this.mode],
      this.maxDistance[this.mode]
    );
    this.needsUpdate = true;
  };

  protected pan = (deltaX: number, deltaY: number) => {
    const fov = this.camera.getEffectiveFOV();
    const panScale = this.panSpeed[this.mode];
    this.controlStateHandler.panUp(-deltaY * panScale, fov);
    this.controlStateHandler.panLeft(deltaX * panScale, fov);
    this.needsUpdate = true;
  };

  // ==================== U P D A T E

  update = (delta: number) => {
    if (!this.needsUpdate) return false;
    // By interaction
    const smoothTime = this.smoothTime[this.mode];
    this.needsUpdate = this.controlStateHandler.update(smoothTime, delta);
    this.controlStateHandler.applyToObject(this.camera);
    return true;
  };

  // Fast forward to final state on default
  private internalUpdate = (transition = false) => {
    if (!transition) this.controlStateHandler.jumpToEnd();
    this.needsUpdate = true;
  };
}
