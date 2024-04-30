import { Euler, Matrix4, PerspectiveCamera, Vector3Like } from "three";
import { Vector3, Quaternion } from "three";
import { CameraSaveState, State, StateAnimator } from "../StateAnimator";
import {
  AXIS,
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
import { DEG2RAD, clamp, euclideanModulo } from "three/src/math/MathUtils.js";

export class IsotropicAnimator extends StateAnimator<IsotropicState> {
  protected now = new IsotropicState();
  protected end = new IsotropicState();

  // ===== Update Variables
  private velocityOrbitCenter = new Vector3();
  private velocityQuaternion = new Quaternion(0, 0, 0, 0);
  private velocityDistance = { value: 0 };

  // ===== Helper Variables
  private reuseQuat = new Quaternion();

  constructor(camera?: PerspectiveCamera, orbitCenter?: Vector3Like) {
    super();
    camera && this.setFromCamera(camera);
    orbitCenter && this.setOrbitCenter(orbitCenter);
    this.jumpToEnd();
  }

  // ==================== S E T T E R

  // Updates orbitCenter to maintain camera position and orientation
  setFromCamera = (c: PerspectiveCamera) => {
    this.end.quaternion.copy(c.quaternion);
    this.end.orbitCenter.subVectors(c.position, this.end.offset);
  };

  // ==================== T R A N S F O R M

  // Moves towards or away from orbitCenter
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

  clampDistance = (min: number, max: number) => {
    this.end.distance = clamp(this.end.distance, min, max);
  };

  // Horizontal rotation around orbitCenter
  rotateLeft = (theta: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.Y, theta);
    this.end.quaternion.multiply(rotation);
  };

  // Vertical rotation around orbitCenter
  rotateUp = (phi: number) => {
    const rotation = this.reuseQuat.setFromAxisAngle(AXIS.X, -phi);
    this.end.quaternion.multiply(rotation);
  };

  // Horizontal orbitCenter shift
  panLeft = (delta: number, fov: number) => {
    // Half of the fov is center to top of screen.
    const step = 2 * Math.tan(fov * DEG2RAD * 0.5) * this.now.distance;
    this.end.orbitCenter.addScaledVector(this.now.right, -delta * step);
  };

  // Vertical orbitCenter shift
  panUp = (delta: number, fov: number) => {
    // Half of the fov is center to top of screen.
    const step = 2 * Math.tan(fov * DEG2RAD * 0.5) * this.now.distance;
    this.end.orbitCenter.addScaledVector(this.now.up, -delta * step);
  };

  // ==================== U P D A T E

  jumpToEnd = () => {
    this.end.normalize();
    this.now.orbitCenter.copy(this.end.orbitCenter);
    this.now.distance = this.end.distance;
    this.now.quaternion.copy(this.end.quaternion);
  };

  discardEnd = () => {
    this.now.normalize();
    this.end.orbitCenter.copy(this.now.orbitCenter);
    this.end.distance = this.now.distance;
    this.end.quaternion.copy(this.now.quaternion);
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
    if (approxEqualQuat(this.now.quaternion, this.end.quaternion)) {
      this.velocityQuaternion.set(0, 0, 0, 0);
      this.now.quaternion.copy(this.end.quaternion);
    } else {
      smoothDampQuat(
        this.now.quaternion,
        this.end.quaternion,
        this.velocityQuaternion,
        smoothTime,
        deltaTime,
        this.now.quaternion
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
    if (reachedEnd) this.discardEnd();
    return reachedEnd;
  };
}

class IsotropicState extends State {
  quaternion = new Quaternion();
  private _distance = 1;

  // ===== Helper Variables
  private reuseEuler = new Euler();

  // Sets all angles to range [0, 2*PI]
  normalize = () => {
    this.quaternion.normalize();
    const euler = this.reuseEuler.setFromQuaternion(this.quaternion);
    euler.x = euclideanModulo(euler.x, 2 * Math.PI);
    euler.y = euclideanModulo(euler.y, 2 * Math.PI);
    euler.z = euclideanModulo(euler.z, 2 * Math.PI);
    this.quaternion.setFromEuler(euler);
  };

  // ==================== G E T T E R

  get distance(): number {
    return this._distance;
  }

  get offset(): Vector3 {
    return this._offset.copy(this.forward).multiplyScalar(-this.distance);
  }

  // TODO: Quaternion should maintain unit length, thus normalize should not be necessary
  get orientation(): Quaternion {
    return this._orientation.copy(this.quaternion).normalize();
  }

  get right(): Vector3 {
    return this._right.copy(AXIS.X).applyQuaternion(this.quaternion);
  }
  get up(): Vector3 {
    return this._up.copy(AXIS.Y).applyQuaternion(this.quaternion);
  }
  get forward(): Vector3 {
    return this._forward.copy(AXIS.Z).negate().applyQuaternion(this.quaternion);
  }

  // ==================== S E T T E R

  set distance(v: number) {
    this._distance = Math.max(EPSILON, v);
  }

  // Maintains orbitCenter, updates camera orientation to look at orbitCenter
  setPosition = (to: Vector3Like) => {
    if (approxEqualVec3(to, this.position)) return;
    this.distance = this.orbitCenter.distanceTo(to);
    if (approxZero(this.distance)) return;
    const newForward = new Vector3().copy(to).sub(this.orbitCenter).normalize();
    const oldForward = this.forward;
    const rot = new Quaternion().setFromUnitVectors(oldForward, newForward);
    this.quaternion.premultiply(rot);
  };

  // Updates view direction to maintain camera position
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

  // Updates orbitCenter, because IsotropicState specifies view direction as negative offset direction
  // TODO: Maybe this should maintain the distance and only reset the orbitCenter to a point before or behind target.
  lookAt = (target: Vector3Like) => this.setOrbitCenter(target);

  // ==================== S A V E   S T A T E

  loadState = (state: CameraSaveState) => {
    this.orbitCenter.copy(state.orbitCenter);
    this.distance = state.offset.length();
    const forward = state.offset.clone().negate().normalize();
    const right = forward.clone().cross(state.up);
    const up = right.clone().cross(forward);
    const rotation = new Matrix4().makeBasis(right, up, forward.negate());
    this.quaternion.setFromRotationMatrix(rotation);
    return this;
  };
}
