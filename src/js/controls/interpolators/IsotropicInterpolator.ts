import { Euler, Matrix4, Object3D, Vector3Like } from "three";
import { Vector3, Quaternion } from "three";
import {
  ControlState,
  ControlStateInterpolator,
} from "../ControlStateInterpolator";
import {
  AXIS,
  EPSILON,
  approxAntiparallel,
  approxEqual,
  approxEqualQuat,
  approxEqualVec3,
  approxParallel,
  approxZero,
  approxZeroVec3,
} from "../utils/mathUtils";
import { SmoothDamper } from "../utils/SmoothDamper";
import { DEG2RAD, clamp, euclideanModulo } from "three/src/math/MathUtils.js";
import { SaveState } from "../utils/SaveState";

/**
 * Realizes the 'isotropic' mode.
 * Works similar to TrackballControls but with smoothDamping for all transformations and in object spaces.
 */
export class IsotropicInterpolator extends ControlStateInterpolator<IsotropicState> {
  protected now = new IsotropicState(); // actual state
  protected end = new IsotropicState(); // target state

  // ===== Update Variables (for smooth damping)
  private velocityOrbitCenter = new Vector3();
  private velocityQuaternion = new Quaternion(0, 0, 0, 0);
  private velocityDistance = { value: 0 };

  // ===== Helper Variables
  private reuseQuat = new Quaternion();

  constructor(camera?: Object3D, orbitCenter?: Vector3Like) {
    super();
    camera && this.setFromObject(camera);
    orbitCenter && this.setOrbitCenter(orbitCenter);
    this.jumpToEnd();
  }

  // ==================== S E T T E R

  /**
   * Sets end state quaternion based on the object quaternion.
   * Updates the orbit center to be in the viewing direction. Maintains the current distance.
   * @param o object, usually a camera
   */
  setFromObject = (o: Object3D) => {
    this.end.quaternion.copy(o.quaternion);
    this.end.orbitCenter.subVectors(o.position, this.end.offset);
  };

  // ==================== T R A N S F O R M

  /**
   * Scales and clamps the end state distance to the orbit center.
   * @param scale scaling factor
   * @param minStep minimum step for small distances
   * @param minDistance minimum distance to orbit center
   * @param maxDistance maximum distance to orbit center
   */
  dolly = (
    scale: number,
    minStep = 0,
    minDistance = EPSILON,
    maxDistance = Infinity
  ) => {
    const delta = this.end.distance * (scale - 1);
    this.end.distance += Math.sign(delta) * Math.max(minStep, Math.abs(delta));
    this.clampDistance(minDistance, maxDistance);
  };

  /**
   * Limits the end state distance from orbit center.
   * @param min minimum distance
   * @param max maximum distance
   */
  clampDistance = (min: number, max: number) => {
    this.end.distance = clamp(this.end.distance, min, max);
  };

  /**
   * Rotates end state around up vector.
   * Because the up vector is calculated from the current rotation, this leads to a rotation around the orbit center in contrast to the 'orbit' mode.
   * @param theta angle
   */
  rotateLeft = (theta: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.Y, theta);
    this.end.quaternion.multiply(rotation);
  };

  /**
   * Rotates end state around right vector.
   * There is no restriction at the poles. Actually what is considered the poles rotate with the object.
   * @param phi angle
   */
  rotateUp = (phi: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.X, -phi);
    this.end.quaternion.multiply(rotation);
  };

  /**
   * Shifts the end state orbit center horizontally.
   * @param delta Percentage by which the orbit center should be moved towards the edge of the screen.
   * @param fov field of view of camera to calculate screen height at orbit center
   */
  panLeft = (delta: number, fov: number) => {
    const step = 2 * Math.tan(fov * DEG2RAD * 0.5) * this.now.distance;
    this.end.orbitCenter.addScaledVector(this.now.right, -delta * step);
  };

  /**
   * Shifts the end state orbit center vertically.
   * @param delta Percentage by which the orbit center should be moved towards the edge of the screen.
   * @param fov field of view of camera to calculate screen height at orbit center
   */
  panUp = (delta: number, fov: number) => {
    const step = 2 * Math.tan(fov * DEG2RAD * 0.5) * this.now.distance;
    this.end.orbitCenter.addScaledVector(this.now.up, -delta * step);
  };

  // ==================== U P D A T E

  /**
   * Fast-forwards to the end state by copying it to the now state.
   * All angles are normalized to ensure state unambiguity.
   */
  jumpToEnd = () => {
    this.end.normalize();
    this.now.orbitCenter.copy(this.end.orbitCenter);
    this.now.distance = this.end.distance;
    this.now.quaternion.copy(this.end.quaternion);
  };

  /**
   * Copies the now state to the end state.
   * All angles are normalized to ensure state unambiguity.
   */
  discardEnd = () => {
    this.now.normalize();
    this.end.orbitCenter.copy(this.now.orbitCenter);
    this.end.distance = this.now.distance;
    this.end.quaternion.copy(this.now.quaternion);
  };

  /**
   * Smooth damps the now state towards the end state.
   * @returns if another update is needed for the now state to reach the end state
   */
  update = (smoothTime: number, deltaTime: number) => {
    let needsUpdate = false;
    // OrbitCenter
    if (approxEqualVec3(this.now.orbitCenter, this.end.orbitCenter)) {
      this.velocityOrbitCenter.set(0, 0, 0);
      this.now.orbitCenter.copy(this.end.orbitCenter);
    } else {
      SmoothDamper.dampVec3(
        this.now.orbitCenter,
        this.end.orbitCenter,
        this.velocityOrbitCenter,
        smoothTime,
        Infinity,
        deltaTime,
        this.now.orbitCenter
      );
      needsUpdate = true;
    }
    // Quaternion
    if (approxEqualQuat(this.now.quaternion, this.end.quaternion)) {
      this.velocityQuaternion.set(0, 0, 0, 0);
      this.now.quaternion.copy(this.end.quaternion);
    } else {
      SmoothDamper.dampQuat(
        this.now.quaternion,
        this.end.quaternion,
        this.velocityQuaternion,
        smoothTime,
        deltaTime,
        this.now.quaternion
      );
      needsUpdate = true;
    }
    // Distance
    if (approxEqual(this.now.distance, this.end.distance)) {
      this.velocityDistance.value = 0;
      this.now.distance = this.end.distance;
    } else {
      this.now.distance = SmoothDamper.damp(
        this.now.distance,
        this.end.distance,
        this.velocityDistance,
        smoothTime,
        Infinity,
        deltaTime
      );
      needsUpdate = true;
    }
    if (!needsUpdate) this.discardEnd();
    return needsUpdate;
  };
}

/**
 * Models the current object state as orbit center, quaternion and distance.
 * The vertical rotation is not restricted at the poles.
 * The object’s up vector is continuously updated to the tangent. It can therefore also be upside down. This should be used for scenarios without a global up.
 */
class IsotropicState extends ControlState {
  quaternion = new Quaternion();
  private _distance = 1;

  // ===== Helper Variables
  private reuseEuler = new Euler();

  /**
   * Sets all angles to range [0, 2*PI[
   * @returns this
   */
  normalize = () => {
    this.quaternion.normalize();
    const euler = this.reuseEuler.setFromQuaternion(this.quaternion);
    euler.x = euclideanModulo(euler.x, 2 * Math.PI);
    euler.y = euclideanModulo(euler.y, 2 * Math.PI);
    euler.z = euclideanModulo(euler.z, 2 * Math.PI);
    this.quaternion.setFromEuler(euler);
  };

  // ==================== G E T T E R

  /**
   * @returns position relative to orbit center
   */
  get offset(): Vector3 {
    return this._offset.copy(this.forward).multiplyScalar(-this.distance);
  }

  /**
   * @returns distance from orbit center
   */
  get distance(): number {
    return this._distance;
  }

  /**
   * @returns object rotation
   */
  get orientation(): Quaternion {
    // TODO: Quaternion should maintain unit length, thus normalize should not be necessary
    return this._orientation.copy(this.quaternion).normalize();
  }

  /**
   * @returns right direction
   */
  get right(): Vector3 {
    return this._right.copy(AXIS.X).applyQuaternion(this.quaternion);
  }

  /**
   * @returns up direction
   */
  get up(): Vector3 {
    return this._up.copy(AXIS.Y).applyQuaternion(this.quaternion);
  }

  /**
   * @returns viewing direction
   */
  get forward(): Vector3 {
    return this._forward.copy(AXIS.Z).negate().applyQuaternion(this.quaternion);
  }

  // ==================== S E T T E R

  /**
   * Sets the distance to the orbit center.
   * Prevents the distance from being 0 or less.
   * @param v new distance
   */
  set distance(v: number) {
    this._distance = Math.max(EPSILON, v);
  }

  /**
   * Updates the position.
   * The orbit center is maintained and the object rotation is updated to look at the orbit center.
   * @param to new position
   */
  setPosition = (to: Vector3Like) => {
    if (approxEqualVec3(to, this.position)) return;
    this.distance = this.orbitCenter.distanceTo(to);
    if (approxZero(this.distance)) return;
    const newForward = new Vector3().copy(to).sub(this.orbitCenter).normalize();
    const oldForward = this.forward;
    const rot = new Quaternion().setFromUnitVectors(oldForward, newForward);
    this.quaternion.premultiply(rot);
  };

  /**
   * Updates the orbit center.
   * To maintain the camera position the offset is updated.
   * As object center and viewing direction are not handled seperatly, this changes the object rotation.
   * @param to new orbit center
   */
  setOrbitCenter = (to: Vector3Like) => {
    if (approxEqualVec3(to, this.orbitCenter)) return;
    const oldForward = this.forward;
    const position = this.position;
    this.orbitCenter.copy(to);
    this.distance = position.distanceTo(to);
    if (approxZero(this.distance)) return;
    const newForward = new Vector3().copy(to).sub(position).normalize();
    if (approxParallel(oldForward, newForward)) return;
    const rotation = approxAntiparallel(oldForward, newForward)
      ? new Quaternion().setFromAxisAngle(this.up, Math.PI) // Turn around
      : new Quaternion().setFromUnitVectors(oldForward, newForward);
    this.quaternion.premultiply(rotation);
  };

  /**
   * Updates the rotation to look in the direction of a certain point in the object space.
   * As object center and viewing direction are not handled seperatly, this changes the orbit center. The distance is maintained.
   * @param target where the object should look
   */
  lookAt = (target: Vector3Like) => {
    const position = this.position;
    const offset = position.clone().sub(target).setLength(this.distance);
    const orbitCenter = position.clone().sub(offset);
    this.setOrbitCenter(orbitCenter);
  };

  // ==================== S A V E   S T A T E

  /**
   * Resets this state based on a SaveState.
   * As IsotropicState specifies forward as inverse offset, forward is ignored, except offset is zero.
   * @param state the SaveState to be loaded
   * @returns this
   */
  loadState = (state: SaveState) => {
    this.orbitCenter.copy(state.orbitCenter);
    this.distance = state.offset.length();
    const forward = approxZeroVec3(state.offset)
      ? state.forward.clone()
      : state.offset.clone().negate().normalize();
    const right = forward.clone().cross(state.up);
    const up = right.clone().cross(forward);
    const rotation = new Matrix4().makeBasis(right, up, forward.negate());
    this.quaternion.setFromRotationMatrix(rotation);
    return this;
  };
}
