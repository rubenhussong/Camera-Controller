import { Object3D, Quaternion, Vector3, Vector3Like } from "three";
import { AXIS } from "./utils/mathUtils";
import { CameraSaveState } from "./SaveState";

/**
 * Has two ControlStates now and end.
 * Provides methods for direct manipulation of the end state and two methods update and jumpToEnd to adjust the now state before applying it to an object like a Camera.
 */
export abstract class ControlStateInterpolator<T extends ControlState> {
  protected abstract now: T;
  protected abstract end: T;

  // ==================== A P P L Y
  applyToObject = (c: Object3D) => {
    c.up.copy(this.now.up);
    c.position.copy(this.now.position);
    c.quaternion.copy(this.now.orientation);
  };

  // ==================== S E T T E R
  abstract setFromObject: (c: Object3D) => void;
  setPosition = (to: Vector3Like) => this.end.setPosition(to);
  setOrbitCenter = (to: Vector3Like) => this.end.setOrbitCenter(to);
  lookAt = (target: Vector3Like) => this.end.lookAt(target); // Target is in same object space like camera

  // ==================== S A V E   S T A T E
  saveState = () => this.now.saveState();
  loadState = (state: CameraSaveState) => this.end.loadState(state);

  // ==================== T R A N S F O R M
  abstract dolly: (
    scale: number,
    minStep?: number,
    minDistance?: number,
    maxDistance?: number
  ) => void;
  abstract clampDistance: (min: number, max: number) => void;

  abstract rotateLeft: (theta: number) => void; // left at current camera orientation
  abstract rotateUp: (phi: number) => void; // up at current camera orientation

  abstract panUp: (delta: number, fov: number) => void;
  abstract panLeft: (delta: number, fov: number) => void;

  // ==================== U P D A T E
  abstract jumpToEnd: () => void;
  abstract discardEnd: () => void;
  abstract update: (smoothTime: number, deltaTime: number) => boolean; // Returns if the another update is needed
}

export abstract class ControlState {
  orbitCenter = new Vector3();

  // ==================== H E L P E R
  protected _orientation = new Quaternion();

  protected _position = AXIS.Z.clone();
  protected _offset = AXIS.Z.clone();

  protected _right = AXIS.X.clone();
  protected _up = AXIS.Y.clone();
  protected _forward = AXIS.Z.clone().negate();

  // ==================== G E T T E R
  get position() {
    return this._position.addVectors(this.orbitCenter, this.offset);
  }
  abstract get offset(): Vector3;
  abstract get distance(): number;
  abstract get orientation(): Quaternion;
  abstract get right(): Vector3;
  abstract get up(): Vector3;
  abstract get forward(): Vector3;

  // ==================== S E T T E R
  abstract setPosition: (to: Vector3Like) => void;
  abstract setOrbitCenter: (to: Vector3Like) => void;
  abstract lookAt: (target: Vector3Like) => void; // Target is in same object space

  // ==================== S A V E   S T A T E
  saveState = () => ({
    orbitCenter: this.orbitCenter.clone(),
    offset: this.offset.clone(),
    forward: this.forward.clone().normalize(),
    up: this.up.clone().normalize(),
  });
  abstract loadState: (state: CameraSaveState) => ControlState;
}
