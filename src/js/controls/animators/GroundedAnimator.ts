import {
  Vector3,
  Quaternion,
  Vector3Like,
  Matrix4,
  Euler,
  PerspectiveCamera,
} from "three";
import { CameraSaveState, State, StateAnimator } from "../StateAnimator";
import {
  AXIS,
  EPSILON,
  approxAntiparallel,
  approxCollinear,
  approxEqual,
  approxEqualQuat,
  approxEqualVec3,
  approxParallel,
  approxZero,
  approxZeroVec3,
} from "../utils/mathUtils";
import {
  smoothDamp,
  smoothDampQuat,
  smoothDampVec3,
} from "../utils/interpolationUtils";
import { clamp, euclideanModulo } from "three/src/math/MathUtils.js";

export class GroundedAnimator extends StateAnimator<GroundedState> {
  protected now = new GroundedState();
  protected end = new GroundedState();

  // ===== Update Variables
  private velocityOrbitCenter = new Vector3();
  private velocityQuaternion = new Quaternion(0, 0, 0, 0);
  private velocityLookUpAngle = { value: 0 };
  private velocityDistance = { value: 0 };
  private velocityTranslation = new Vector3();

  // ===== Helper Variables
  private reuseQuat = new Quaternion();

  constructor(camera?: PerspectiveCamera, orbitCenter?: Vector3Like) {
    super();
    camera && this.setFromCamera(camera);
    orbitCenter && this.setOrbitCenter(orbitCenter);
    this.jumpToEnd();
  }

  // ==================== S E T T E R

  // Calculates positionQuat from camera position relatively to the orbitCenter.
  // Sets polarAngle as angle between relative camera direction and view direction.
  setFromCamera = (c: PerspectiveCamera) => {
    this.end.distance = this.end.orbitCenter.distanceTo(c.position);
    if (approxZero(this.end.distance)) {
      this.end.offsetQuat.copy(c.quaternion);
      this.end.lookUpAngle = EPSILON; // Shift camera back by EPSILON
    }
    const down = this.end.orbitCenter.clone().sub(c.position).normalize();
    const forward = AXIS.Z.clone().negate().applyQuaternion(c.quaternion);
    if (approxAntiparallel(forward, down)) {
      const downRotation = new Quaternion().setFromAxisAngle(AXIS.X, Math.PI);
      this.end.offsetQuat = c.quaternion.clone().multiply(downRotation);
    } else if (!approxParallel(forward, down)) {
      const downRotation = new Quaternion().setFromUnitVectors(forward, down);
      this.end.offsetQuat = c.quaternion.clone().premultiply(downRotation);
    }
    this.end.lookUpAngle = down.angleTo(forward);
  };

  // ==================== T R A N S F O R M

  // Move along viewing direction
  // To reduce complexity, two assumptions are made:
  // 1. Current distance, including prior translations, remains within limits by not resetting them during user actions.
  // 2. The translation only alters the distance linearly, which is not the case, if the current offset is near the minimum and the viewing direction just below the tangent. Ignored because it will probably only lead to rare inaccuracies.
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

  clampDistance = (min: number, max: number) => {
    this.end.distance = clamp(this.end.distance, min, max);
  };

  // Horizontal rotation of view direction
  rotateLeft = (theta: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.Z, -theta);
    this.end.offsetQuat.multiply(rotation);
  };

  // Vertical rotation of view direction
  rotateUp = (phi: number) => {
    this.end.lookUpAngle += phi;
  };

  // Horizontal rotation around orbitCenter
  panLeft = (delta: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.Y, -delta);
    this.end.offsetQuat.multiply(rotation);
  };

  // Vertical rotation around orbitCenter
  panUp = (delta: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.X, delta);
    this.end.offsetQuat.multiply(rotation);
  };

  // ==================== U P D A T E

  jumpToEnd = () => {
    this.end.normalize();
    this.now.orbitCenter.copy(this.end.orbitCenter);
    this.now.offsetQuat.copy(this.end.offsetQuat);
    this.now.lookUpAngle = this.end.lookUpAngle;
    this.now.distance = this.end.distance;
    this.now.translation.copy(this.end.translation); // Will be zero because normalized
  };

  discardEnd = () => {
    this.now.normalize();
    this.end.orbitCenter.copy(this.now.orbitCenter);
    this.end.offsetQuat.copy(this.now.offsetQuat);
    this.end.lookUpAngle = this.now.lookUpAngle;
    this.end.distance = this.now.distance;
    this.end.translation.copy(this.now.translation); // Will be zero because normalized
  };

  // Returns if more updates are needed to reach the end state
  update = (smoothTime: number, deltaTime: number) => {
    let reachedEnd = true;
    // OrbitCenter
    if (approxEqualVec3(this.now.orbitCenter, this.end.orbitCenter)) {
      this.velocityOrbitCenter.set(0, 0, 0);
      this.now.orbitCenter.copy(this.end.orbitCenter);
    } else {
      smoothDampVec3(
        this.now.orbitCenter,
        this.end.orbitCenter,
        this.velocityOrbitCenter,
        smoothTime,
        Infinity,
        deltaTime,
        this.now.orbitCenter
      );
      reachedEnd = false;
    }
    // Quaternion
    if (approxEqualQuat(this.now.offsetQuat, this.end.offsetQuat)) {
      this.velocityQuaternion.set(0, 0, 0, 0);
      this.now.offsetQuat.copy(this.end.offsetQuat);
    } else {
      smoothDampQuat(
        this.now.offsetQuat,
        this.end.offsetQuat,
        this.velocityQuaternion,
        smoothTime,
        deltaTime,
        this.now.offsetQuat
      );
      reachedEnd = false;
    }
    // Look up angle
    if (approxEqual(this.now.lookUpAngle, this.end.lookUpAngle)) {
      this.velocityLookUpAngle.value = 0;
      this.now.lookUpAngle = this.end.lookUpAngle;
    } else {
      this.now.lookUpAngle = smoothDamp(
        this.now.lookUpAngle,
        this.end.lookUpAngle,
        this.velocityLookUpAngle,
        smoothTime,
        Infinity,
        deltaTime
      );
      reachedEnd = false;
    }
    // Distance
    if (approxEqual(this.now.distance, this.end.distance)) {
      this.velocityDistance.value = 0;
      this.now.distance = this.end.distance;
    } else {
      this.now.distance = smoothDamp(
        this.now.distance,
        this.end.distance,
        this.velocityDistance,
        smoothTime,
        Infinity,
        deltaTime
      );
      reachedEnd = false;
    }
    // Translation
    if (approxZeroVec3(this.end.translation, EPSILON / 100)) {
      this.velocityTranslation.set(0, 0, 0);
      this.now.translation.copy(this.end.translation);
    } else {
      const delta = smoothDampVec3(
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
      reachedEnd = false;
    }
    if (reachedEnd) this.discardEnd();
    return reachedEnd;
  };
}

class GroundedState extends State {
  offsetQuat = new Quaternion(); // Orientation from orbitCenter
  private _lookUpAngle = EPSILON; // Angle between view direction and down vector
  private _distance = 1;

  // Additional offset used for linear interpolation. Call applyTranslation to take it into account.
  translation = new Vector3();

  // ===== Helper Variables
  private reuseVec = new Vector3();
  private reuseQuat = new Quaternion();
  private reuseEuler = new Euler();

  normalize = () => {
    this.applyTranslation(this.translation);
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

  // Takes translation into account by converting it to a distance, offsetQuat and lookUp angle update.
  // Maintains orbitCenter and view direction
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

  get offset(): Vector3 {
    return this._offset
      .set(0, 0, this.distance)
      .applyQuaternion(this.offsetQuat);
  }
  get distance(): number {
    return this._distance;
  }

  get lookUpAngle() {
    return this._lookUpAngle;
  }

  get orientation(): Quaternion {
    return this._orientation
      .setFromAxisAngle(AXIS.X, this.lookUpAngle)
      .premultiply(this.offsetQuat);
  }

  get right(): Vector3 {
    return this._right.copy(AXIS.X).applyQuaternion(this.offsetQuat);
  }

  get up(): Vector3 {
    return this._up.copy(AXIS.Z).applyQuaternion(this.offsetQuat);
  }

  get forward(): Vector3 {
    return this._forward
      .copy(AXIS.Z)
      .negate()
      .applyQuaternion(this.orientation);
  }

  // ==================== S E T T E R

  set lookUpAngle(v: number) {
    this._lookUpAngle = Math.max(EPSILON, Math.min(Math.PI - EPSILON, v));
  }

  set distance(v: number) {
    this._distance = Math.max(EPSILON, v);
  }

  // Maintains orbitCenter and view direction
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

  // Maintains camera position and view direction
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

  // Updates offsetQuat yaw and lookUpAngle
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

  loadState = (state: CameraSaveState) => {
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
