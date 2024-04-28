import {
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Spherical,
  Vector3,
  Vector3Like,
} from "three";
import {
  EPSILON,
  approxEqual,
  approxEqualVec3,
  approxZeroVec3,
  smoothDamp,
  smoothDampVec3,
} from "../mathUtils";
import { DEG2RAD, clamp, euclideanModulo } from "three/src/math/MathUtils.js";
import { CameraSaveState, CameraState } from "../CameraState";

const AXIS = {
  X: new Vector3(1, 0, 0),
  Y: new Vector3(0, 1, 0),
  Z: new Vector3(0, 0, 1),
};

export class OrbitState extends CameraState<OrbitState> {
  private spherical; // Spherical position of the camera relative to orbitCenter

  // ===== Helper Variables
  private _tangent = AXIS.Y.clone(); // Local "up" dependent on actual position
  private reuseMatrix = new Matrix4();

  // For converting between up space and y-is-up space. Are set in up setter and used in setOffset.
  private fromUpToY = new Quaternion();
  private fromYToUp = new Quaternion();

  constructor(camera?: PerspectiveCamera, orbitCenter = new Vector3()) {
    super();
    this.spherical = new Spherical();
    this._up = AXIS.Y.clone();
    camera && this.setFromCamera(camera);
    this.setOrbitCenter(orbitCenter);
  }

  // ==================== G E T T E R

  protected get offset() {
    const offset = this._offset.setFromSpherical(this.spherical);
    offset.applyQuaternion(this.fromYToUp);
    return offset;
  }

  protected get orientation() {
    const rotation = this.reuseMatrix
      .identity()
      .lookAt(this.position, this.orbitCenter, this.up);
    return this._orientation.setFromRotationMatrix(rotation);
  }

  protected get right() {
    return this._right.crossVectors(this.forward, this.up);
  }

  protected get up() {
    return this._up;
  }

  protected get forward() {
    return this._forward.copy(this.offset).normalize().negate();
  }

  protected get tangent() {
    return this._tangent.crossVectors(this.right, this.forward);
  }

  protected get distance() {
    return this.spherical.radius;
  }

  protected get theta() {
    return this.spherical.theta;
  }

  protected get phi() {
    return this.spherical.phi;
  }

  // ==================== S E T T E R

  protected set distance(d: number) {
    this.spherical.radius = Math.max(EPSILON, d);
  }

  protected set theta(theta: number) {
    this.spherical.theta = theta;
  }

  protected set phi(phi: number) {
    this.spherical.phi = phi;
    this.spherical.makeSafe();
  }

  // Changes the up vector while maintaining the camera position relatively to the orbitCenter.
  protected set up(v: Vector3) {
    if (approxEqualVec3(this.up, v)) return;
    const offset = this.offset;
    this._up.copy(v);
    this.fromUpToY.setFromUnitVectors(this._up, AXIS.Y);
    this.fromYToUp.copy(this.fromUpToY).invert();
    this.offset = offset;
  }

  private set offset(to: Vector3) {
    if (approxEqualVec3(this.offset, to)) return;
    if (approxZeroVec3(to)) {
      this.distance = EPSILON;
    } else {
      const oldTheta = this.theta;
      const turns = Math.trunc(oldTheta / (2 * Math.PI));
      to.applyQuaternion(this.fromUpToY);
      this.spherical.setFromVector3(to);
      this.theta += turns * 2 * Math.PI; // Maintain full horizontal turns
      // Take shorter way
      if (oldTheta - this.theta > Math.PI) this.theta + 2 * Math.PI;
      else if (this.theta - oldTheta > Math.PI) this.theta - 2 * Math.PI;
      this.spherical.makeSafe();
      this.distance = Math.max(EPSILON, this.distance);
    }
  }

  // ==================== A P I   G E N E R A L

  copy = (that: OrbitState) => {
    this.orbitCenter.copy(that.orbitCenter);
    this.spherical.copy(that.spherical);
    this.up = that.up;
    return this;
  };

  clone = () => new OrbitState().copy(this);

  // Sets theta to range [0, 2*PI] and phi to range [EPS, PI - EPS]
  normalize = () => {
    this.theta = euclideanModulo(this.theta, Math.PI * 2);
    this.spherical.makeSafe();
    return this;
  };

  // ==================== A P I   T R A N S F O R M S

  dolly = (scale: number, minStep = 0) => {
    const delta = this.distance * scale - this.distance;
    this.distance += Math.sign(delta) * Math.max(minStep, Math.abs(delta));
  };

  clampDistance = (min: number, max: number) => {
    this.distance = clamp(this.distance, min, max);
  };

  rotateLeft = (theta: number) => (this.theta += theta);

  rotateUp = (phi: number) => (this.phi -= phi);

  panUp = (delta: number, fov: number) => {
    // Half of the fov is center to top of screen.
    const step = 2 * Math.tan(fov * DEG2RAD * 0.5) * this.distance;
    this.orbitCenter.addScaledVector(this.tangent, -delta * step);
  };

  panLeft = (delta: number, fov: number) => {
    // Half of the fov is center to top of screen.
    const step = 2 * Math.tan(fov * DEG2RAD * 0.5) * this.distance;
    this.orbitCenter.addScaledVector(this.right, -delta * step);
  };

  // ==================== A P I   S E T T E R

  setFromCamera = (c: PerspectiveCamera) => {
    const forward = AXIS.Z.clone().negate().applyQuaternion(c.quaternion);
    const offset = forward.clone().multiplyScalar(-this.distance);
    this.orbitCenter.copy(c.position).sub(offset);
    this.up = c.up;
    this.offset = offset;
    this.normalize();
  };

  // Update spherical to maintain orbitCenter
  setPosition = (to: Vector3Like) => {
    this.offset = new Vector3().subVectors(to, this.orbitCenter);
  };

  // Update forward to maintain camera position
  setOrbitCenter = (to: Vector3Like) => {
    if (approxEqualVec3(this.orbitCenter, to)) return;
    this.offset = this.position.clone().sub(to);
    this.orbitCenter.copy(to);
  };

  // Sets orbitCenter, because OrbitState specifies forward as negative offset direction.
  // Target is in the same object space like the camera.
  lookAt = (target: Vector3Like) => this.setOrbitCenter(target);

  // ==================== A P I   S A V E   S T A T E

  // As OrbitState specifies forward as inverse offset, forward is ignored, except offset is zero.
  loadState = (state: CameraSaveState) => {
    this.orbitCenter.copy(state.orbitCenter);
    this.up = state.up;
    const offset = approxZeroVec3(state.offset)
      ? state.offset.clone()
      : state.forward.clone().negate().setLength(EPSILON);
    this.offset = offset;
    this.normalize();
    return this;
  };

  saveState = () => ({
    orbitCenter: this.orbitCenter.clone(),
    offset: this.offset.clone(),
    forward: this.forward.clone().normalize(),
    up: this.up.clone().normalize(),
  });

  // ==================== A P I   I N T E R P O L A T I O N

  private velocityPhi = { value: 0 };
  private velocityTheta = { value: 0 };
  private velocityRadius = { value: 0 };
  private velocityOrbitCenter = new Vector3();
  private velocityUpVector = new Vector3();

  private _newUpVector = new Vector3();
  smoothDampTo = (
    target: OrbitState,
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
    // Phi
    if (approxEqual(this.phi, target.phi)) {
      this.velocityPhi.value = 0;
      this.phi = target.phi;
    } else {
      this.phi = smoothDamp(
        this.phi,
        target.phi,
        this.velocityPhi,
        smoothTime,
        Infinity,
        deltaTime
      );
      reachedTarget = false;
    }
    // Theta
    if (approxEqual(this.theta, target.theta)) {
      this.velocityTheta.value = 0;
      this.theta = target.theta;
    } else {
      this.theta = smoothDamp(
        this.theta,
        target.theta,
        this.velocityTheta,
        smoothTime,
        Infinity,
        deltaTime
      );
      reachedTarget = false;
    }
    // Distance
    if (approxEqual(this.distance, target.distance)) {
      this.velocityRadius.value = 0;
      this.distance = target.distance;
    } else {
      this.distance = smoothDamp(
        this.distance,
        target.distance,
        this.velocityRadius,
        smoothTime,
        Infinity,
        deltaTime
      );
      reachedTarget = false;
    }
    // UpVector
    if (approxEqualVec3(this.up, target.up)) {
      this.velocityUpVector.set(0, 0, 0);
      this.up = target.up;
    } else {
      this.up = smoothDampVec3(
        this.up,
        target.up,
        this.velocityUpVector,
        smoothTime,
        Infinity,
        deltaTime,
        this._newUpVector
      );
      reachedTarget = false;
    }
    return reachedTarget;
  };
}
