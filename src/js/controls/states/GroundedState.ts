import {
  Euler,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  Vector3Like,
} from "three";
import { CameraSaveState, CameraState } from "../CameraState";
import { RAD2DEG, clamp, euclideanModulo } from "three/src/math/MathUtils.js";
import {
  approxEqual,
  approxEqualQuat,
  approxEqualVec3,
  approxCollinear,
  smoothDamp,
  smoothDampQuat,
  smoothDampVec3,
  approxParallel,
  EPSILON,
  approxAntiparallel,
  approxZeroVec3,
  approxZero,
} from "../mathUtils";

const AXIS = {
  X: new Vector3(1, 0, 0),
  Y: new Vector3(0, 1, 0),
  Z: new Vector3(0, 0, 1),
};

/**
 * Like being on a planet.
 * Rotate updates view direction.
 * Panning rotates slowly around the orbitCenter and updates view direction likewise.
 * Zoom moves camera along view direction.
 */
export class GroundedState extends CameraState<GroundedState> {
  private offsetQuat; // Orientation from orbitCenter
  private _lookUpAngle; // Angle between view direction and down vector
  private _distance;

  // ===== Helper Variables
  private reuseQuat = new Quaternion();
  private reuseEuler = new Euler();
  private reuseVec = new Vector3();

  constructor(camera?: PerspectiveCamera, orbitCenter = new Vector3()) {
    super();
    this.orbitCenter.copy(orbitCenter);
    this.offsetQuat = new Quaternion();
    this._distance = 1;
    this._lookUpAngle = EPSILON;
    camera && this.setFromCamera(camera);
  }

  // ==================== S E T T I N G S
  // GroundedState has a very different handling than OrbitState and IsotropicState. To avoid reconfiguration on every mode change, GroundedState has its own settings.

  static dollySpeedScale = 2;
  static rotateSpeedScale = 0.25;
  static panSpeedScale = 0.1 * Math.PI;

  static smoothTimeScale = 1.5;

  // ==================== G E T T E R

  protected get offset() {
    return this._offset
      .set(0, 0, this.distance)
      .applyQuaternion(this.offsetQuat);
  }

  protected get orientation() {
    return this._orientation
      .setFromAxisAngle(AXIS.X, this.lookUpAngle)
      .premultiply(this.offsetQuat);
  }

  protected get up() {
    return this._up.copy(AXIS.Z).applyQuaternion(this.offsetQuat);
  }

  protected get right() {
    return this._right.copy(AXIS.X).applyQuaternion(this.offsetQuat);
  }

  protected get forward() {
    return this._forward
      .copy(AXIS.Z)
      .negate()
      .applyQuaternion(this.orientation);
  }

  protected get lookUpAngle() {
    return this._lookUpAngle;
  }

  protected get distance() {
    return this._distance;
  }

  // ==================== S E T T E R

  protected set lookUpAngle(v: number) {
    this._lookUpAngle = Math.max(EPSILON, Math.min(Math.PI - EPSILON, v));
  }

  protected set distance(v: number) {
    this._distance = Math.max(EPSILON, v);
  }

  // ==================== A P I   G E N E R A L

  copy = (that: GroundedState) => {
    this.orbitCenter.copy(that.orbitCenter);
    this.distance = that.distance;
    this.offsetQuat.copy(that.offsetQuat);
    this.lookUpAngle = that.lookUpAngle;
    return this;
  };

  clone = () => new GroundedState().copy(this);

  // Sets all quaternion angles to range [0, 2*PI]
  normalize = () => {
    this.offsetQuat.normalize();
    const euler = this.reuseEuler.setFromQuaternion(this.offsetQuat);
    euler.x = euclideanModulo(euler.x, 2 * Math.PI);
    euler.y = euclideanModulo(euler.y, 2 * Math.PI);
    euler.z = euclideanModulo(euler.z, 2 * Math.PI);
    this.offsetQuat.setFromEuler(euler);
    return this;
  };

  // ==================== A P I   T R A N S F O R M S

  // Move along viewing direction. Update quaternion, scale distance
  // TODO: This results in problems with the spherical interpolation
  dolly = (scale: number, minStep = 0) => {
    if (scale === 0) return;
    const step = Math.sign(1 - scale) * minStep * GroundedState.dollySpeedScale;
    const deltaOffset = this.reuseVec.copy(this.forward).multiplyScalar(step);
    this.addOffset(deltaOffset);
  };

  private addOffset = (delta: Vector3) => {
    const direction = Math.sign(this.forward.dot(delta));
    const newOffset = this.reuseVec.addVectors(this.offset, delta);
    this.distance = newOffset.length();
    const oldUp = this.up;
    const newUp = newOffset.normalize();
    const angle = direction * oldUp.angleTo(newUp);
    this.lookUpAngle += angle;
    const rotation = this.reuseQuat.setFromUnitVectors(this.up, newUp);
    this.offsetQuat.premultiply(rotation);
  };

  clampDistance = (min: number, max: number) => {
    this.distance = clamp(this.distance, min, max);
  };

  // Horizontal rotation of view direction
  rotateLeft = (theta: number) => {
    const angle = -theta * GroundedState.rotateSpeedScale;
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.Z, angle);
    this.offsetQuat.multiply(rotation);
  };

  // Vertical rotation of view direction
  // TODO: Should be incremented
  rotateUp = (phi: number) => {
    this.lookUpAngle += phi * GroundedState.rotateSpeedScale;
  };

  panLeft = (delta: number, _: number) => {
    const angle = -delta * GroundedState.panSpeedScale;
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.Y, angle);
    this.offsetQuat.multiply(rotation);
  };

  panUp = (delta: number, _: number) => {
    const angle = delta * GroundedState.panSpeedScale;
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.X, angle);
    this.offsetQuat.multiply(rotation);
  };

  // ==================== A P I   S E T T E R

  // Calculates positionQuat from camera position relatively to the orbitCenter.
  // Sets polarAngle as angle between relative camera direction and view direction.
  setFromCamera = (c: PerspectiveCamera) => {
    this.distance = this.orbitCenter.distanceTo(c.position);
    if (approxZero(this.distance)) {
      this.offsetQuat.copy(c.quaternion); // Orbit center in front
      this.lookUpAngle = 0;
    }
    const down = this.orbitCenter.clone().sub(c.position).normalize();
    const forward = AXIS.Z.clone().negate().applyQuaternion(c.quaternion);
    if (approxAntiparallel(forward, down)) {
      const downRotation = new Quaternion().setFromAxisAngle(AXIS.X, Math.PI);
      this.offsetQuat = c.quaternion.clone().multiply(downRotation);
    } else if (!approxParallel(forward, down)) {
      const downRotation = new Quaternion().setFromUnitVectors(forward, down);
      this.offsetQuat = c.quaternion.clone().premultiply(downRotation);
    }
    this.lookUpAngle = down.angleTo(forward);
  };

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

  // ==================== A P I   S A V E   S T A T E

  // Forward and up should be unit vectors
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
    return this;
  };

  saveState = () => ({
    orbitCenter: this.orbitCenter.clone(),
    offset: this.offset.clone(),
    forward: this.forward.clone().normalize(),
    up: this.up.clone().normalize(),
  });

  // ==================== A P I   I N T E R P O L A T I O N

  private velocityOrbitCenter = new Vector3();
  private velocityDistance = { value: 0 };
  private velocityQuaternion = new Quaternion(0, 0, 0, 0);
  private velocityPolarAngle = { value: 0 };

  smoothDampTo = (
    target: GroundedState,
    smoothTime: number,
    deltaTime: number
  ) => {
    let reachedTarget = true;
    // OrbitCenter
    if (approxEqualVec3(this.orbitCenter, target.orbitCenter)) {
      this.velocityOrbitCenter.set(0, 0, 0);
      this.orbitCenter.copy(target.orbitCenter);
    } else {
      smoothDampVec3(
        this.orbitCenter,
        target.orbitCenter,
        this.velocityOrbitCenter,
        smoothTime * GroundedState.smoothTimeScale,
        Infinity,
        deltaTime,
        this.orbitCenter
      );
      reachedTarget = false;
    }
    // Distance
    if (approxEqual(this.distance, target.distance)) {
      this.velocityDistance.value = 0;
      this.distance = target.distance;
    } else {
      this.distance = smoothDamp(
        this.distance,
        target.distance,
        this.velocityDistance,
        smoothTime * GroundedState.smoothTimeScale,
        Infinity,
        deltaTime
      );
      reachedTarget = false;
    }
    // Quaternion
    if (approxEqualQuat(this.offsetQuat, target.offsetQuat)) {
      this.velocityQuaternion.set(0, 0, 0, 0);
      this.offsetQuat.copy(target.offsetQuat);
    } else {
      smoothDampQuat(
        this.offsetQuat,
        target.offsetQuat,
        this.velocityQuaternion,
        smoothTime * GroundedState.smoothTimeScale,
        deltaTime,
        this.offsetQuat
      );
      reachedTarget = false;
    }
    // Polar Angle
    if (approxEqual(this.lookUpAngle, target.lookUpAngle)) {
      this.velocityPolarAngle.value = 0;
      this.lookUpAngle = target.lookUpAngle;
    } else {
      this.lookUpAngle = smoothDamp(
        this.lookUpAngle,
        target.lookUpAngle,
        this.velocityPolarAngle,
        smoothTime * GroundedState.smoothTimeScale,
        Infinity,
        deltaTime
      );
      reachedTarget = false;
    }
    return reachedTarget;
  };
}
