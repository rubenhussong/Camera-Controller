import { Object3D, Quaternion, Vector3, Vector3Like } from "three";
import { AXIS } from "./utils/mathUtils";
import { SaveState } from "./utils/SaveState";

/**
 * An OrbitXControls object has exactly one ControlStateInterpolator based on its current mode.
 * A ControlStateInterpolator has two ControlStates now and end.
 * It enables the direct manipulation of the end state, the updating of the now state and the application of the now state to an object such as a camera.
 */
export abstract class ControlStateInterpolator<T extends ControlState> {
  protected abstract now: T; // actual state
  protected abstract end: T; // target state

  // ==================== A P P L Y
  /**
   * Updates the up vector, the position and the quaternion of an object to the now state.
   * @param o usually a camera
   */
  applyToObject = (o: Object3D) => {
    o.up.copy(this.now.up);
    o.position.copy(this.now.position);
    o.quaternion.copy(this.now.orientation);
  };

  // ==================== S E T T E R

  /**
   * Updates the end state based on the object position and orientation.
   * This should not change the object at the next applyToObject call.
   * Therefore, the orbit center should be updated to maintain the distance to the camera and its orientation.
   * @param o object, usually a camera
   */
  abstract setFromObject: (o: Object3D) => void;

  /**
   * Updates the end state object position.
   * @param to new position
   */
  setPosition = (to: Vector3Like) => this.end.setPosition(to);

  /**
   * Updates the end state orbit center.
   * @param to new orbit center
   */
  setOrbitCenter = (to: Vector3Like) => this.end.setOrbitCenter(to);

  /**
   * Updates the end state rotation to look in the direction of a certain point in the object space.
   * @param to where the object should look at
   */
  lookAt = (target: Vector3Like) => this.end.lookAt(target);

  // ==================== S A V E   S T A T E

  /**
   * Converts the now state to a SaveState in order to save it or convert it to another ControlState.
   * @returns now state as a SaveState
   */
  saveState = () => this.now.saveState();

  /**
   * Loads a SaveState to the end state.
   * @param state the SaveState to be loaded
   * @returns this
   */
  loadState = (state: SaveState) => {
    this.end.loadState(state);
    return this;
  };

  // ==================== T R A N S F O R M

  /**
   * Moves end state towards the viewing direction and clamps distance.
   * Scales the distance to the orbit center, if the implementation does not seperate orbit center and viewing direction.
   * @param scale scaling factor for distance to orbit center or direction depending on implementation
   * @param minStep minimum step or actual step depending on implementation
   * @param minDistance minimum distance to orbit center
   * @param maxDistance maximum distance to orbit center
   */
  abstract dolly: (
    scale: number,
    minStep?: number,
    minDistance?: number,
    maxDistance?: number
  ) => void;

  /**
   * Limits the end state distance from orbit center.
   * @param min minimum distance
   * @param max maximum distance
   */
  abstract clampDistance: (min: number, max: number) => void;

  /**
   * Rotates end state horizontally around orbit center or object center depending on implementation.
   * @param theta angle
   */
  abstract rotateLeft: (theta: number) => void;

  /**
   * Rotates end state vertically around orbit center or object center depending on implementation
   * @param phi angle
   */
  abstract rotateUp: (phi: number) => void; // up at current camera orientation

  /**
   * Shifts or rotates end state vertically depending on implementation
   * @param delta step or angle
   * @param fov field of view of camera to calculate screen height at orbit center
   */
  abstract panUp: (delta: number, fov: number) => void;

  /**
   * Shifts or rotates end state horizontally depending on implementation
   * @param delta step or angle
   * @param fov field of view of camera to calculate screen height at orbit center
   */
  abstract panLeft: (delta: number, fov: number) => void;

  // ==================== U P D A T E

  /**
   * Fast-forwards to the end state by copying it to the now state.
   */
  abstract jumpToEnd: () => void;

  /**
   * Copies the now state to the end state.
   */
  abstract discardEnd: () => void;

  /**
   * Smooth damps the now state towards the end state.
   * @returns if another update is needed for the now state to reach the end state
   */
  abstract update: (smoothTime: number, deltaTime: number) => boolean;
}

/**
 * Specifies an object position to realize a controls mode.
 */
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
  /**
   * @returns absolute position
   */
  get position(): Vector3 {
    return this._position.addVectors(this.orbitCenter, this.offset);
  }
  /**
   * @returns position relative to orbit center
   */
  abstract get offset(): Vector3;
  /**
   * @returns distance from orbit center
   */
  abstract get distance(): number;
  /**
   * @returns object rotation
   */
  abstract get orientation(): Quaternion;
  /**
   * @returns right direction
   */
  abstract get right(): Vector3;
  /**
   * @returns up direction
   */
  abstract get up(): Vector3;
  /**
   * @returns view direction
   */
  abstract get forward(): Vector3;

  // ==================== S E T T E R

  /**
   * Updates the stored position.
   * Only changes the offset and leaves the orbitCenter unchanged. Updates the rotation if necessary.
   * @param to new position
   */
  abstract setPosition: (to: Vector3Like) => void;

  /**
   * Updates the orbit center.
   * Changes the offset to maintain the absolute object position. Updates the rotation if necessary.
   * @param to new orbit center
   */
  abstract setOrbitCenter: (to: Vector3Like) => void;

  /**
   * Updates the rotation to look in the direction of a certain point in the object space.
   * Changes the orbit center if necessary.
   * @param target where the object should look
   */
  abstract lookAt: (target: Vector3Like) => void;

  // ==================== S A V E   S T A T E

  /**
   * Converts this state to a SaveState in order to save it or convert it to another ControlState.
   * @returns this state as a SaveState
   */
  saveState = () => ({
    orbitCenter: this.orbitCenter.clone(),
    offset: this.offset.clone(),
    forward: this.forward.clone().normalize(),
    up: this.up.clone().normalize(),
  });

  /**
   * Resets this state based on a SaveState.
   * As many properties of the SaveState as possible should be adopted. Priorities may need to be set in order to take account of the limitations of the state implementation, for example, if view direction and orbit center are not differentiated.
   * @param state the SaveState to be loaded
   * @returns this
   */
  abstract loadState: (state: SaveState) => ControlState;
}
