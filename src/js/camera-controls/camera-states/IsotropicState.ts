import {
  Euler,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  Vector3Like,
} from "three";
import { CameraSaveState, CameraState } from "../CameraState";
import { DEG2RAD, clamp, euclideanModulo } from "three/src/math/MathUtils.js";
import {
  EPSILON,
  approxAntiparallel,
  approxEqual,
  approxEqualQuat,
  approxEqualVec3,
  approxParallel,
  approxZero,
  smoothDamp,
  smoothDampQuat,
  smoothDampVec3,
} from "../mathUtils";

const AXIS = {
  X: new Vector3(1, 0, 0),
  Y: new Vector3(0, 1, 0),
  Z: new Vector3(0, 0, 1),
};

/**
 * IsotropicState detaches the camera from a global up by setting the camera up-vector to the tangent on each update.
 * In comparison to the SphericalState this allows a vertical rotation over the poles. In many cases this would feel upside down.
 */
export class IsotropicState extends CameraState<IsotropicState> {
  private quaternion = new Quaternion();
  private _distance: number;

  // ===== Helper Variables
  private reuseQuat = new Quaternion();
  private reuseEuler = new Euler();

  constructor(camera?: PerspectiveCamera, orbitCenter = new Vector3()) {
    super();
    this._distance = 1;
    camera && this.setFromCamera(camera);
    this.setOrbitCenter(orbitCenter);
  }

  // ==================== G E T T E R

  protected get offset() {
    return this._offset.copy(this.forward).multiplyScalar(-this.distance);
  }

  // TODO: Quaternion should maintain unit length thus normalize should not be necessary
  protected get orientation() {
    return this._orientation.copy(this.quaternion).normalize();
  }

  protected get right() {
    return this._right.copy(AXIS.X).applyQuaternion(this.quaternion);
  }

  protected get up() {
    return this._up.copy(AXIS.Y).applyQuaternion(this.quaternion);
  }

  protected get forward() {
    return this._forward.copy(AXIS.Z).negate().applyQuaternion(this.quaternion);
  }

  protected get distance() {
    return this._distance;
  }

  // ==================== S E T T E R

  protected set distance(v: number) {
    this._distance = Math.max(EPSILON, v);
  }

  // ==================== A P I   G E N E R A L

  copy = (that: IsotropicState) => {
    this.orbitCenter.copy(that.orbitCenter);
    this.distance = that.distance;
    this.quaternion.copy(that.quaternion);
    return this;
  };

  clone = () => new IsotropicState().copy(this);

  // Sets all quaternion angles to range [0, 2*PI]
  normalize = () => {
    this.quaternion.normalize();
    const euler = this.reuseEuler.setFromQuaternion(this.quaternion);
    euler.x = euclideanModulo(euler.x, 2 * Math.PI);
    euler.y = euclideanModulo(euler.y, 2 * Math.PI);
    euler.z = euclideanModulo(euler.z, 2 * Math.PI);
    this.quaternion.setFromEuler(euler);
    return this;
  };

  // ==================== A P I   T R A N S F O R S

  dolly = (scale: number, minStep = 0) => {
    const delta = this.distance * scale - this.distance;
    this.distance += Math.sign(delta) * Math.max(minStep, Math.abs(delta));
  };

  clampDistance = (min: number, max: number) => {
    this.distance = clamp(this.distance, min, max);
  };

  rotateLeft = (theta: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.Y, theta);
    this.quaternion.multiply(rotation);
  };

  rotateUp = (phi: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.X, -phi);
    this.quaternion.multiply(rotation);
  };

  panUp = (delta: number, fov: number) => {
    // Half of the fov is center to top of screen.
    const step = 2 * Math.tan(fov * DEG2RAD * 0.5) * this.distance;
    this.orbitCenter.addScaledVector(this.up, -delta * step);
  };

  panLeft = (delta: number, fov: number) => {
    // Half of the fov is center to top of screen.
    const step = 2 * Math.tan(fov * DEG2RAD * 0.5) * this.distance;
    this.orbitCenter.addScaledVector(this.right, -delta * step);
  };

  // ==================== A P I   S E T T E R

  // Updates orbitCenter to lie in front on camera.
  setFromCamera = (c: PerspectiveCamera) => {
    this.quaternion.copy(c.quaternion);
    this.orbitCenter.subVectors(c.position, this.offset);
  };

  // Maintains orbitCenter, updates camera orientation to look at orbitCenter.
  setPosition = (to: Vector3Like) => {
    if (approxEqualVec3(to, this.position)) return;
    if (approxEqualVec3(to, this.orbitCenter)) return (this.distance = 0);
    const offset = new Vector3().subVectors(this.orbitCenter, to);
    this.distance = offset.length();
    const newForward = offset.negate().normalize();
    const oldForward = this.forward;
    const rot = new Quaternion().setFromUnitVectors(oldForward, newForward);
    this.quaternion.premultiply(rot);
  };

  // Changes orbitCenter and updates looking direction to maintain the camera position.
  setOrbitCenter = (to: Vector3Like) => {
    if (approxEqualVec3(to, this.orbitCenter)) return;
    const oldForward = this.forward;
    const position = this.position;
    this.distance = position.distanceTo(to);
    const newForward = position.clone().sub(to).negate().normalize();
    // If new orbitCenter is in same direction as old orbitCenter
    if (approxZero(this.distance) || approxParallel(oldForward, newForward)) {
      this.orbitCenter.copy(to);
      return;
    }
    const rotation = approxAntiparallel(oldForward, newForward)
      ? new Quaternion().setFromAxisAngle(this.up, Math.PI) // Turn around
      : new Quaternion().setFromUnitVectors(oldForward, newForward);
    this.quaternion.premultiply(rotation);
  };

  // Changes the orbitCenter, because IsotropicState does not differentiate orbitCenter and looking direction.
  lookAt = (target: Vector3Like) => this.setOrbitCenter(target);

  // ==================== A P I   S A V E   S T A T E

  // OrbitState defines forward as inverse offset, which is why SaveState forward is ignored.
  // Problems like zero distance or collinear forward and up should be handled by the saveState method or the user.
  loadState = (state: CameraSaveState) => {
    this.orbitCenter.copy(state.orbitCenter);
    this.distance = state.offset.length();
    const forward = state.offset.clone().normalize().negate();
    const right = forward.clone().cross(state.up);
    const up = right.clone().cross(forward);
    const rotation = new Matrix4().makeBasis(right, up, forward.negate());
    this.quaternion.setFromRotationMatrix(rotation);
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

  smoothDampTo = (
    target: IsotropicState,
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
        smoothTime,
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
        smoothTime,
        Infinity,
        deltaTime
      );
      reachedTarget = false;
    }
    // Quaternion
    if (approxEqualQuat(this.quaternion, target.quaternion)) {
      this.velocityQuaternion.set(0, 0, 0, 0);
      this.quaternion.copy(target.quaternion);
    } else {
      smoothDampQuat(
        this.quaternion,
        target.quaternion,
        this.velocityQuaternion,
        smoothTime,
        deltaTime,
        this.quaternion
      );
      reachedTarget = false;
    }
    return reachedTarget;
  };
}
