import {
  ControlState,
  ControlStateInterpolator,
} from "../ControlStateInterpolator";
import {
  Vector3,
  Quaternion,
  Vector3Like,
  Matrix4,
  Euler,
  Object3D,
} from "three";
import { clamp, euclideanModulo } from "three/src/math/MathUtils.js";
import {
  AXIS,
  EPSILON,
  approxAntiparallel,
  approxCollinear,
  approxEqual,
  approxEqualQuat,
  approxEqualVec3,
  approxParallel,
  approxZeroVec3,
} from "../utils/mathUtils";
import { SmoothDamper } from "../utils/SmoothDamper";
import { SaveState } from "../utils/SaveState";

/**
 * Realizes the 'grounded' mode.
 * Movement like on a planet:
 * - The offset direction is the up vector.
 * - The view direction is detached from the orbit center.
 * - The orbit center is fixed, panning is actually a slow rotation around it.
 * - Rotate triggers a rotation around the object itself instead of the orbit center.
 */
export class GroundedInterpolator extends ControlStateInterpolator<GroundedState> {
  protected now = new GroundedState(); // actual state
  protected end = new GroundedState(); // target state

  // ===== Update Variables (for smooth damping)
  private velocityOrbitCenter = new Vector3();
  private velocityQuaternion = new Quaternion(0, 0, 0, 0);
  private velocityLookUpAngle = { value: 0 };
  private velocityDistance = { value: 0 };
  private velocityTranslation = new Vector3();

  // ===== Helper Variables
  private reuseQuat = new Quaternion();

  constructor(object?: Object3D, orbitCenter?: Vector3Like) {
    super();
    object && this.setFromObject(object);
    orbitCenter && this.setOrbitCenter(orbitCenter);
    this.jumpToEnd();
  }

  // ==================== S E T T E R

  /**
   * Sets end state offset quaternion based on object quaternion.
   * Updates the orbit center to maintain look up angle and distance.
   * @param o object, usually a camera
   */
  setFromObject = (o: Object3D) => {
    this.end.offsetQuat
      .setFromAxisAngle(AXIS.X, this.end.lookUpAngle)
      .invert()
      .premultiply(o.quaternion);
    this.end.orbitCenter.subVectors(o.position, this.end.offset);
  };

  // ==================== T R A N S F O R M

  /**
   * Moves end state along or against viewing direction.
   * Clamps the end state distance to the orbit center.
   * @param scale direction, forward if greater 1, backward if smaller
   * @param minStep minimum step
   * @param minDistance minimum distance to orbit center
   * @param maxDistance maximum distance to orbit center
   * To reduce complexity, two assumptions are made:
   * 1. Current distance, including prior translations, remains within limits by not resetting them during user actions.
   * 2. The translation only alters the distance linearly, which is not the case, if the current offset is near the minimum and the viewing direction just below the tangent. Ignored because it will probably only lead to rare inaccuracies.
   */
  dolly = (
    scale: number,
    minStep = 0,
    minDist = EPSILON,
    maxDist = Infinity
  ) => {
    if (scale === 0) return;
    const direction = this.now.forward.multiplyScalar(Math.sign(1 - scale));
    let step = minStep + Math.abs(1 - scale) * Math.sqrt(this.now.distance);
    const newDist = this.end.offset
      .add(this.end.translation)
      .addScaledVector(direction, step)
      .length();
    if (newDist < minDist) step += newDist - minDist; // Comply with lower limit
    else if (newDist > maxDist) step += maxDist - newDist; // Comply with upper limit
    this.end.translation.addScaledVector(direction, step);
  };

  /**
   * Limits the end state distance from orbit center.
   * This does not take the translation into account.
   * @param min minimum distance
   * @param max maximum distance
   */
  clampDistance = (min: number, max: number) => {
    this.end.distance = clamp(this.end.distance, min, max);
  };

  /**
   * Rotates the end state view direction horizontally around up vector.
   * @param theta angle
   */
  rotateLeft = (theta: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.Z, -theta);
    this.end.offsetQuat.multiply(rotation);
  };

  /**
   * Rotates the end state view direction vertically around right vector.
   * Stops at the poles to prevent object from being upside down.
   * @param phi angle
   */
  rotateUp = (phi: number) => {
    this.end.lookUpAngle += phi;
  };

  /**
   * Rotates the end state horizontally around orbit center.
   * Because the view direction does not depend on the orbit center, this is a movement to the sides and feels like panning on a planet surface.
   * @param delta angle
   */
  panLeft = (delta: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.Y, -delta);
    this.end.offsetQuat.multiply(rotation);
  };

  /**
   * Rotates the end state vertically around orbit center.
   * Because the view direction does not depend on the orbit center, this is a movement to the front or back and feels like panning on a planet surface.
   * @param delta angle
   */
  panUp = (delta: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.X, delta);
    this.end.offsetQuat.multiply(rotation);
  };

  // ==================== U P D A T E

  /**
   * Fast-forwards to the end state by copying it to the now state.
   * All angles are normalized to ensure state unambiguity.
   */
  jumpToEnd = () => {
    this.end.normalize();
    this.now.orbitCenter.copy(this.end.orbitCenter);
    this.now.offsetQuat.copy(this.end.offsetQuat);
    this.now.lookUpAngle = this.end.lookUpAngle;
    this.now.distance = this.end.distance;
    this.now.translation.copy(this.end.translation); // Will be zero because normalized
  };

  /**
   * Copies the now state to the end state.
   * All angles are normalized to ensure state unambiguity.
   */
  discardEnd = () => {
    this.now.normalize();
    this.end.orbitCenter.copy(this.now.orbitCenter);
    this.end.offsetQuat.copy(this.now.offsetQuat);
    this.end.lookUpAngle = this.now.lookUpAngle;
    this.end.distance = this.now.distance;
    this.end.translation.copy(this.now.translation); // Will be zero because normalized
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
    if (approxEqualQuat(this.now.offsetQuat, this.end.offsetQuat)) {
      this.velocityQuaternion.set(0, 0, 0, 0);
      this.now.offsetQuat.copy(this.end.offsetQuat);
    } else {
      SmoothDamper.dampQuat(
        this.now.offsetQuat,
        this.end.offsetQuat,
        this.velocityQuaternion,
        smoothTime,
        deltaTime,
        this.now.offsetQuat
      );
      needsUpdate = true;
    }
    // Look up angle
    if (approxEqual(this.now.lookUpAngle, this.end.lookUpAngle)) {
      this.velocityLookUpAngle.value = 0;
      this.now.lookUpAngle = this.end.lookUpAngle;
    } else {
      this.now.lookUpAngle = SmoothDamper.damp(
        this.now.lookUpAngle,
        this.end.lookUpAngle,
        this.velocityLookUpAngle,
        smoothTime,
        Infinity,
        deltaTime
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
    // Translation
    if (approxZeroVec3(this.end.translation, EPSILON / 100)) {
      this.velocityTranslation.set(0, 0, 0);
      this.now.translation.copy(this.end.translation);
    } else {
      const delta = SmoothDamper.dampVec3(
        this.now.translation,
        this.end.translation,
        this.velocityTranslation,
        smoothTime,
        Infinity,
        deltaTime,
        this.now.translation // Add translation
      );
      this.end.applyTranslation(delta); // Apply delta ...
      this.now.applyTranslation(delta); // ... to remove translation again.
      needsUpdate = true;
    }
    if (!needsUpdate) this.discardEnd();
    return needsUpdate;
  };
}

/**
 * Models the current object state as orbit center, quaternion, look up angle and distance.
 * Rotation rotates the view direction and panning rotates around the orbitCenter.
 * The object’s up vector is continuously updated to the offset direction, so the orbit center is always down.
 * The vertical rotation is limited to the range [EPS, PI - EPS] to prevent the object from being upside down.
 */
class GroundedState extends ControlState {
  offsetQuat = new Quaternion(); // Orientation from orbitCenter
  private _lookUpAngle = EPSILON; // Angle between view direction and down vector
  private _distance = 1;

  /**
   * Additional offset used for linear interpolation.
   * Call applyTranslation to take it into account.
   */
  translation = new Vector3();

  // ===== Helper Variables
  private reuseVec = new Vector3();
  private reuseQuat = new Quaternion();
  private reuseEuler = new Euler();

  /**
   * Converts the translation into an update of the quaternion, look up angle and distance.
   * Sets all angles to range [0, 2*PI[
   * @returns this
   */
  normalize = () => {
    this.applyTranslation();
    this.translation.set(0, 0, 0);
    this.offsetQuat.normalize();
    const euler = this.reuseEuler.setFromQuaternion(this.offsetQuat);
    euler.x = euclideanModulo(euler.x, 2 * Math.PI);
    euler.y = euclideanModulo(euler.y, 2 * Math.PI);
    euler.z = euclideanModulo(euler.z, 2 * Math.PI);
    this.offsetQuat.setFromEuler(euler);
    return this;
  };

  // ==================== T R A N S F O R M

  /**
   * Converts a translation into an update of the offset quaternion, look up angle and distance.
   * Maintains orbitCenter and view direction.
   * @param delta the share of the translation that should be taken into account
   */
  applyTranslation = (delta: Vector3Like = this.translation) => {
    const newOffset = this.reuseVec.addVectors(this.offset, delta);
    this.distance = newOffset.length();
    const oldUp = this.up;
    const newUp = newOffset.normalize();
    const angle = Math.sign(this.forward.dot(delta)) * oldUp.angleTo(newUp);
    this.lookUpAngle += angle;
    const rotation = this.reuseQuat.setFromUnitVectors(this.up, newUp);
    this.offsetQuat.premultiply(rotation);
    this.translation.sub(delta);
  };

  // ==================== G E T T E R

  /**
   * @returns position relative to orbit center
   */
  get offset(): Vector3 {
    return this._offset
      .set(0, 0, this.distance)
      .applyQuaternion(this.offsetQuat);
  }

  /**
   * @returns distance from orbit center
   */
  get distance(): number {
    return this._distance;
  }

  /**
   * @returns angle between down vector and view direction
   */
  get lookUpAngle() {
    return this._lookUpAngle;
  }

  /**
   * @returns object rotation
   */
  get orientation(): Quaternion {
    return this._orientation
      .setFromAxisAngle(AXIS.X, this.lookUpAngle)
      .premultiply(this.offsetQuat);
  }

  /**
   * @returns right direction
   */
  get right(): Vector3 {
    return this._right.copy(AXIS.X).applyQuaternion(this.offsetQuat);
  }

  /**
   * @returns up direction
   */
  get up(): Vector3 {
    return this._up.copy(AXIS.Z).applyQuaternion(this.offsetQuat);
  }

  /**
   * @returns viewing direction
   */
  get forward(): Vector3 {
    return this._forward
      .copy(AXIS.Z)
      .negate()
      .applyQuaternion(this.orientation);
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
   * Sets angle between down vector and view direction.
   * Prevents the angle from being out of the range [EPS, PI - EPS]
   * @param v new look up angle
   */
  set lookUpAngle(v: number) {
    this._lookUpAngle = clamp(v, EPSILON, Math.PI - EPSILON);
  }

  /**
   * Updates the position.
   * Maintains the orbit center and the view direction.
   * @param to new position
   */
  setPosition = (to: Vector3Like) => {
    if (approxEqualVec3(this.position, to)) return;
    this.distance = this.orbitCenter.distanceTo(to);
    if (approxEqualVec3(this.orbitCenter, to)) return;
    const forward = this.forward;
    const newUp = new Vector3().subVectors(to, this.orbitCenter).normalize();
    const oldUp = this.up;
    const rotation = new Quaternion().setFromUnitVectors(oldUp, newUp);
    this.offsetQuat.premultiply(rotation);
    this.lookAt(this.position.clone().add(forward));
  };

  /**
   * Updates the orbit center.
   * To maintain the camera position the offset is updated.
   * Also maintains the view direction.
   * @param to new orbit center
   */
  setOrbitCenter = (to: Vector3Like) => {
    if (approxEqualVec3(this.orbitCenter, to)) return;
    const position = this.position;
    this.distance = position.distanceTo(to);
    this.orbitCenter.copy(to);
    if (!approxEqualVec3(position, to)) return;
    const forward = this.forward;
    const oldUp = this.up;
    const newUp = position.clone().sub(to).normalize();
    if (approxParallel(oldUp, newUp)) return;
    const rotation = new Quaternion().setFromUnitVectors(oldUp, newUp);
    this.offsetQuat.premultiply(rotation);
    this.lookAt(this.position.clone().add(forward));
  };

  /**
   * Updates the rotation to look in the direction of a certain point in the object space.
   * Maintains the position and the orbitCenter.
   * Updates the quaternion yaw (horizontal view direction) and the look up angle (vertical view direction).
   * @param target where the object should look
   */
  lookAt = (target: Vector3Like) => {
    if (approxEqualVec3(this.position, target)) return;
    const newForward = new Vector3()
      .subVectors(target, this.position)
      .normalize();
    if (approxParallel(this.forward, newForward)) return; // Already looking at target
    const up = this.up;
    // Rotate view horizontally
    if (!approxCollinear(newForward, up)) {
      const oldRight = this.right;
      const newRight = newForward.clone().cross(up);
      if (approxAntiparallel(oldRight, newRight)) {
        const rot = new Quaternion().setFromAxisAngle(AXIS.Z, Math.PI);
        this.offsetQuat.multiply(rot);
      } else if (!approxParallel(oldRight, newRight)) {
        const rot = new Quaternion().setFromUnitVectors(oldRight, newRight);
        this.offsetQuat.premultiply(rot);
      }
    }
    // Rotate view vertically
    this.lookUpAngle = Math.PI - up.angleTo(newForward);
  };

  // ==================== S A V E   S T A T E

  /**
   * Resets this state based on a SaveState.
   * Because the GroundedState up vector is always the normalized offset, there are SaveStates that cannot be displayed. Offset and forward are prioritized over the SaveState up vector.
   * @param state the SaveState to be loaded
   * @returns this
   */
  loadState = (state: SaveState) => {
    const forward = state.forward.clone().normalize();
    const up = approxZeroVec3(state.offset)
      ? forward.clone().negate()
      : state.offset.clone().normalize();
    const right = [up, state.up, AXIS.Y, AXIS.Z] // Fallbacks, if horizontal view direction is ambiguous
      .find((v) => !approxCollinear(forward, v))! // Non-null assertion because AXIS.Z is orthogonal to AXIS.Y
      .clone()
      .cross(forward)
      .negate()
      .normalize();
    const tangent = up.clone().cross(right);
    const rotation = new Matrix4().makeBasis(right, tangent, up);
    this.offsetQuat.setFromRotationMatrix(rotation).normalize();
    this.orbitCenter.copy(state.orbitCenter);
    this.distance = state.offset.length();
    this.lookUpAngle = Math.PI - up.angleTo(forward);
    this.translation.set(0, 0, 0);
    return this;
  };
}
