import {
  Vector3,
  Quaternion,
  Vector3Like,
  Spherical,
  Matrix4,
  PerspectiveCamera,
} from "three";
import { CameraSaveState, State, StateAnimator } from "../StateAnimator";
import {
  AXIS,
  EPSILON,
  approxEqual,
  approxEqualVec3,
  approxZeroVec3,
  smoothDamp,
  smoothDampVec3,
} from "../mathUtils";
import { DEG2RAD, clamp, euclideanModulo } from "three/src/math/MathUtils.js";

export class OrbitAnimator extends StateAnimator<OrbitState> {
  protected now = new OrbitState();
  protected end = new OrbitState();

  // ===== Update Variables
  private velocityOrbitCenter = new Vector3();
  private velocityPhi = { value: 0 };
  private velocityTheta = { value: 0 };
  private velocityDistance = { value: 0 };
  private velocityUp = new Vector3();

  // ===== Helper Variables
  private reuseVec = new Vector3();

  constructor(camera?: PerspectiveCamera, orbitCenter?: Vector3Like) {
    super();
    camera && this.setFromCamera(camera);
    orbitCenter && this.setOrbitCenter(orbitCenter);
    this.jumpToEnd();
  }

  // ==================== S E T T E R

  // Updates orbitCenter to maintain camera position and orientation
  setFromCamera = (c: PerspectiveCamera) => {
    this.end.up = c.up;
    const offset = AXIS.Z.clone()
      .applyQuaternion(c.quaternion)
      .multiplyScalar(this.end.distance);
    this.end.orbitCenter.copy(c.position).sub(offset);
    this.end.offset = offset;
  };

  // ==================== T R A N S F O R M

  // Moves towards or away from orbitCenter
  dolly = (
    scale: number,
    minStep = 0,
    minDistance = EPSILON,
    maxDistance = Infinity
  ) => {
    const delta = this.end.distance * scale - this.end.distance;
    this.end.distance += Math.sign(delta) * Math.max(minStep, Math.abs(delta));
    this.clampDistance(minDistance, maxDistance);
  };

  clampDistance = (min: number, max: number) => {
    this.end.distance = clamp(this.end.distance, min, max);
  };

  // Horizontal rotation around up axis
  rotateLeft = (theta: number) => (this.end.theta += theta);

  // Vertical rotation around up axis
  rotateUp = (phi: number) => (this.end.phi -= phi);

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
    this.end.orbitCenter.addScaledVector(this.now.tangent, -delta * step);
  };

  // ==================== U P D A T E

  jumpToEnd = () => {
    this.end.normalize();
    this.now.orbitCenter.copy(this.end.orbitCenter);
    this.now.phi = this.end.phi;
    this.now.theta = this.end.theta;
    this.now.distance = this.end.distance;
  };

  discardEnd = () => {
    this.now.normalize();
    this.end.orbitCenter.copy(this.now.orbitCenter);
    this.end.phi = this.now.phi;
    this.end.theta = this.now.theta;
    this.end.distance = this.now.distance;
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
    // Phi
    if (approxEqual(this.now.phi, this.end.phi)) {
      this.velocityPhi.value = 0;
      this.now.phi = this.end.phi;
    } else {
      this.now.phi = smoothDamp(
        this.now.phi,
        this.end.phi,
        this.velocityPhi,
        smoothTime,
        Infinity,
        deltaTime
      );
      reachedEnd = false;
    }
    // Theta
    if (approxEqual(this.now.theta, this.end.theta)) {
      this.velocityTheta.value = 0;
      this.now.theta = this.end.theta;
    } else {
      this.now.theta = smoothDamp(
        this.now.theta,
        this.end.theta,
        this.velocityTheta,
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
    // UpVector
    if (approxEqualVec3(this.now.up, this.end.up)) {
      this.velocityUp.set(0, 0, 0);
      this.now.up = this.end.up;
    } else {
      this.now.up = smoothDampVec3(
        this.now.up,
        this.end.up,
        this.velocityUp,
        smoothTime,
        Infinity,
        deltaTime,
        this.reuseVec
      );
      reachedEnd = false;
    }
    if (reachedEnd) this.discardEnd();
    return reachedEnd;
  };
}

class OrbitState extends State {
  private spherical = new Spherical();

  // Conversion between up space and y-is-up space
  private fromYToUp = new Quaternion();
  private fromUpToY = new Quaternion();

  // ===== Helper Variables
  private _tangent = AXIS.Y.clone(); // Local "up" dependent on actual position
  private reuseMatrix = new Matrix4();

  constructor() {
    super();
    this._up.copy(AXIS.Y);
    this.fromUpToY.setFromUnitVectors(this.up, AXIS.Y);
    this.fromYToUp.copy(this.fromUpToY).invert();
  }

  // Sets theta to range [0, 2*PI] and phi to range [EPS, PI - EPS]
  normalize = () => {
    this.theta = euclideanModulo(this.theta, Math.PI * 2);
    this.spherical.makeSafe();
    return this;
  };

  // ==================== G E T T E R

  get offset(): Vector3 {
    const offset = this._offset.setFromSpherical(this.spherical);
    offset.applyQuaternion(this.fromYToUp);
    return offset;
  }

  get distance(): number {
    return this.spherical.radius;
  }

  get theta() {
    return this.spherical.theta;
  }

  get phi() {
    return this.spherical.phi;
  }

  get orientation(): Quaternion {
    const rotation = this.reuseMatrix
      .identity()
      .lookAt(this.position, this.orbitCenter, this.up);
    return this._orientation.setFromRotationMatrix(rotation);
  }

  get right(): Vector3 {
    return this._right.crossVectors(this.forward, this.up);
  }

  get up(): Vector3 {
    return this._up;
  }

  get forward(): Vector3 {
    return this._forward.copy(this.offset).normalize().negate();
  }

  // Local "up" dependent on actual position
  get tangent(): Vector3 {
    return this._tangent.crossVectors(this.right, this.forward);
  }

  // ==================== S E T T E R

  // Maintains full horizontal turns
  set offset(to: Vector3) {
    if (approxEqualVec3(this.offset, to)) return;
    if (approxZeroVec3(to)) {
      this.distance = EPSILON;
    } else {
      const oldTheta = this.theta;
      const turns = Math.trunc(oldTheta / (2 * Math.PI));
      to.applyQuaternion(this.fromUpToY);
      this.spherical.setFromVector3(to);
      this.spherical.makeSafe();
      this.theta += turns * 2 * Math.PI;
      // Take shorter way
      if (oldTheta - this.theta > Math.PI) this.theta += 2 * Math.PI;
      else if (this.theta - oldTheta > Math.PI) this.theta -= 2 * Math.PI;
    }
  }

  set distance(v: number) {
    this.spherical.radius = Math.max(EPSILON, v);
  }

  set theta(v: number) {
    this.spherical.theta = v;
  }

  set phi(v: number) {
    this.spherical.phi = v;
    this.spherical.makeSafe();
  }

  set up(v: Vector3Like) {
    if (approxEqualVec3(this.up, v)) return;
    const offset = this.offset;
    this._up.copy(v);
    this.fromUpToY.setFromUnitVectors(this.up, AXIS.Y);
    this.fromYToUp.copy(this.fromUpToY).invert();
    this.offset = offset;
  }

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

  // Updates orbitCenter, because OrbitState specifies view direction as negative offset direction
  // TODO: Maybe this should maintain the distance and only reset the orbitCenter to a point before or behind target.
  lookAt = (target: Vector3Like) => this.setOrbitCenter(target);

  // ==================== S A V E   S T A T E

  // As OrbitState specifies forward as inverse offset, forward is ignored, except offset is zero.
  loadState = (state: CameraSaveState) => {
    this.orbitCenter.copy(state.orbitCenter);
    this.up = state.up;
    this.offset = approxZeroVec3(state.offset)
      ? state.offset.clone()
      : state.forward.clone().negate().setLength(EPSILON);
    this.normalize();
    return this;
  };
}
