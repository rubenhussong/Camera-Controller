import {
  Vector3,
  Quaternion,
  Vector3Like,
  Spherical,
  Matrix4,
  Object3D,
} from "three";
import {
  ControlState,
  ControlStateInterpolator,
} from "../ControlStateInterpolator";
import {
  AXIS,
  EPSILON,
  approxEqual,
  approxEqualVec3,
  approxZeroVec3,
} from "../utils/mathUtils";
import { SmoothDamper } from "../utils/SmoothDamper";
import { DEG2RAD, clamp, euclideanModulo } from "three/src/math/MathUtils.js";
import { SaveState } from "../utils/SaveState";

/**
 * Realizes the 'orbit' mode.
 * Works similar to OrbitControls but with smoothDamping for all transformations and in object spaces.
 */
export class OrbitInterpolator extends ControlStateInterpolator<OrbitState> {
  protected now = new OrbitState(); // actual state
  protected end = new OrbitState(); // target state

  // ===== Update Variables (for smooth damping)
  private velocityOrbitCenter = new Vector3();
  private velocityPhi = { value: 0 };
  private velocityTheta = { value: 0 };
  private velocityDistance = { value: 0 };
  private velocityUp = new Vector3();

  // ===== Helper Variables
  private reuseVec = new Vector3();

  constructor(camera?: Object3D, orbitCenter?: Vector3Like) {
    super();
    camera && this.setFromObject(camera);
    orbitCenter && this.setOrbitCenter(orbitCenter);
    this.jumpToEnd();
  }

  // ==================== S E T T E R

  /**
   * Sets the up vector and offset of the end state based on the object up vector and quaternion.
   * Updates the orbit center to be in the viewing direction. Maintains the current distance.
   * @param o object, usually a camera
   */
  setFromObject = (o: Object3D) => {
    this.end.up = o.up;
    const offset = AXIS.Z.clone()
      .applyQuaternion(o.quaternion)
      .multiplyScalar(this.end.distance);
    this.end.orbitCenter.copy(o.position).sub(offset);
    this.end.offset = offset;
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
   * Rotates end state around up vector along the current latitude line.
   * @param theta angle
   */
  rotateLeft = (theta: number) => (this.end.theta += theta);

  /**
   * Rotates end state around the orbitCenter along the current longitude line.
   * Stops at the poles to prevent object from being upside down.
   * @param phi angle
   */
  rotateUp = (phi: number) => (this.end.phi -= phi);

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
    this.end.orbitCenter.addScaledVector(this.now.tangent, -delta * step);
  };

  // ==================== U P D A T E

  /**
   * Fast-forwards to the end state by copying it to the now state.
   * All angles are normalized to ensure state unambiguity.
   */
  jumpToEnd = () => {
    this.end.normalize();
    this.now.orbitCenter.copy(this.end.orbitCenter);
    this.now.phi = this.end.phi;
    this.now.theta = this.end.theta;
    this.now.distance = this.end.distance;
  };

  /**
   * Copies the now state to the end state.
   * All angles are normalized to ensure state unambiguity.
   */
  discardEnd = () => {
    this.now.normalize();
    this.end.orbitCenter.copy(this.now.orbitCenter);
    this.end.phi = this.now.phi;
    this.end.theta = this.now.theta;
    this.end.distance = this.now.distance;
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
    // Phi
    if (approxEqual(this.now.phi, this.end.phi)) {
      this.velocityPhi.value = 0;
      this.now.phi = this.end.phi;
    } else {
      this.now.phi = SmoothDamper.damp(
        this.now.phi,
        this.end.phi,
        this.velocityPhi,
        smoothTime,
        Infinity,
        deltaTime
      );
      needsUpdate = true;
    }
    // Theta
    if (approxEqual(this.now.theta, this.end.theta)) {
      this.velocityTheta.value = 0;
      this.now.theta = this.end.theta;
    } else {
      this.now.theta = SmoothDamper.damp(
        this.now.theta,
        this.end.theta,
        this.velocityTheta,
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
    // UpVector
    if (approxEqualVec3(this.now.up, this.end.up)) {
      this.velocityUp.set(0, 0, 0);
      this.now.up = this.end.up;
    } else {
      this.now.up = SmoothDamper.dampVec3(
        this.now.up,
        this.end.up,
        this.velocityUp,
        smoothTime,
        Infinity,
        deltaTime,
        this.reuseVec
      );
      needsUpdate = true;
    }
    if (!needsUpdate) this.discardEnd();
    return needsUpdate;
  };
}

/**
 * Models the current object state as orbit center, up vector and spherical.
 * The vertical rotation is limited to the range [EPS, PI - EPS] to prevent the object from being upside down.
 * The horizontal rotation is only incremental during an interaction and is normalized to the range [0, 2 * PI[ when idle.
 */
class OrbitState extends ControlState {
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

  /**
   * Sets theta to range [0, 2*PI[ and phi to range [EPS, PI - EPS]
   * @returns this
   */
  normalize = () => {
    this.theta = euclideanModulo(this.theta, Math.PI * 2);
    this.spherical.makeSafe();
    return this;
  };

  // ==================== G E T T E R

  /**
   * @returns position relative to orbit center
   */
  get offset(): Vector3 {
    const offset = this._offset.setFromSpherical(this.spherical);
    offset.applyQuaternion(this.fromYToUp);
    return offset;
  }

  /**
   * @returns distance from orbit center
   */
  get distance(): number {
    return this.spherical.radius;
  }

  /**
   * @returns horizontal rotation around up vector
   */
  get theta(): number {
    return this.spherical.theta;
  }

  /**
   * @returns vertical rotation around right vector
   */
  get phi(): number {
    return this.spherical.phi;
  }

  /**
   * @returns object rotation
   */
  get orientation(): Quaternion {
    const rotation = this.reuseMatrix
      .identity()
      .lookAt(this.position, this.orbitCenter, this.up);
    return this._orientation.setFromRotationMatrix(rotation);
  }

  /**
   * @returns right direction
   */
  get right(): Vector3 {
    return this._right.crossVectors(this.forward, this.up);
  }

  /**
   * @returns up direction
   */
  get up(): Vector3 {
    return this._up;
  }

  /**
   * @returns viewing direction
   */
  get forward(): Vector3 {
    return this._forward.copy(this.offset).normalize().negate();
  }

  /**
   * @returns local "up" dependent on actual position; orthogonal to right and viewing directions
   */
  get tangent(): Vector3 {
    return this._tangent.crossVectors(this.right, this.forward);
  }

  // ==================== S E T T E R

  /**
   * Resets the spherical to stores a new offset.
   * Takes the up vector into account and maintains full horizontal turns.
   * @param to new offset
   */
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

  /**
   * Sets the distance to the orbit center.
   * Prevents the distance from being 0 or less.
   * @param v new distance
   */
  set distance(v: number) {
    this.spherical.radius = Math.max(EPSILON, v);
  }

  /**
   * Sets horizontal rotation around up vector
   * @param v new angle
   */
  set theta(v: number) {
    this.spherical.theta = v;
  }

  /**
   * Sets vertical rotation around right vector
   * Prevents the angle from being out of the range [EPS, PI - EPS]
   * @param v new angle
   */
  set phi(v: number) {
    this.spherical.phi = v;
    this.spherical.makeSafe();
  }

  /**
   * Resets the up vector and updates the spherical position to maintain offset.
   * @param v new up vector
   */
  set up(v: Vector3Like) {
    if (approxEqualVec3(this.up, v)) return;
    const offset = this.offset;
    this._up.copy(v);
    this.fromUpToY.setFromUnitVectors(this.up, AXIS.Y);
    this.fromYToUp.copy(this.fromUpToY).invert();
    this.offset = offset;
  }

  /**
   * Updates the position.
   * The orbit center is maintained and the object rotation is updated to look at the orbit center.
   * @param to new position
   */
  setPosition = (to: Vector3Like) => {
    this.offset = new Vector3().subVectors(to, this.orbitCenter);
  };

  /**
   * Updates the orbit center.
   * To maintain the camera position the offset is updated.
   * As object center and viewing direction are not handled seperatly, this changes the object rotation.
   * @param to new orbit center
   */
  setOrbitCenter = (to: Vector3Like) => {
    if (approxEqualVec3(this.orbitCenter, to)) return;
    this.offset = this.position.clone().sub(to);
    this.orbitCenter.copy(to);
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
   * As OrbitState specifies forward as inverse offset, forward is ignored, except offset is zero.
   * @param state the SaveState to be loaded
   * @returns this
   */
  loadState = (state: SaveState) => {
    this.orbitCenter.copy(state.orbitCenter);
    this.up = state.up;
    this.offset = approxZeroVec3(state.offset)
      ? state.forward.clone().negate().setLength(EPSILON)
      : state.offset.clone();
    this.normalize();
    return this;
  };
}
