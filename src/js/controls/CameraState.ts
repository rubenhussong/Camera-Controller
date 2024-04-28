import { PerspectiveCamera, Quaternion, Vector3, Vector3Like } from "three";

export abstract class CameraState<T extends CameraState<T>> {
  protected orbitCenter = new Vector3();

  // ==================== H E L P E R
  protected _orientation = new Quaternion();

  protected _position = new Vector3();
  protected _offset = new Vector3();

  protected _right = new Vector3();
  protected _up = new Vector3();
  protected _forward = new Vector3();

  // ==================== G E T T E R
  get position() {
    return this._position.addVectors(this.orbitCenter, this.offset);
  }
  protected abstract get offset(): Vector3;
  protected abstract get orientation(): Quaternion;
  protected abstract get up(): Vector3;
  protected abstract get forward(): Vector3;
  protected abstract get right(): Vector3;

  // ==================== A P I   G E N E R A L
  abstract copy: (that: T) => T;
  abstract clone: () => T;

  abstract normalize: () => T;

  applyToCamera = (c: PerspectiveCamera) => {
    c.up.copy(this.up);
    c.position.copy(this.position);
    c.quaternion.copy(this.orientation);
  };

  // ==================== A P I   T R A N S F O R M S
  abstract dolly: (scale: number, minStep?: number) => void;
  abstract clampDistance: (min: number, max: number) => void;

  abstract rotateLeft: (theta: number) => void; // left at current camera orientation
  abstract rotateUp: (phi: number) => void; // up at current camera orientation

  abstract panUp: (delta: number, fov: number) => void;
  abstract panLeft: (delta: number, fov: number) => void;

  // ==================== A P I   S E T T E R
  abstract setFromCamera: (c: PerspectiveCamera) => void;
  abstract setPosition: (to: Vector3Like) => void;
  abstract setOrbitCenter: (to: Vector3Like) => void;
  abstract lookAt: (target: Vector3Like) => void; // Target is in same object space like camera

  // ==================== A P I   S A V E   S T A T E
  abstract loadState: (state: CameraSaveState) => T;
  abstract saveState: () => CameraSaveState;

  // ==================== A P I   I N T E R P O L A T I O N
  abstract smoothDampTo: (
    target: T,
    smoothTime: number,
    deltaTime: number
  ) => boolean;
}

// Helper type for state tuple
export type UniformState<T extends CameraState<T>> = T;

// State for translation between different CameraState implementations
export class CameraSaveState {
  orbitCenter = new Vector3();
  offset = new Vector3(0, 0, 1);
  forward = new Vector3(0, 0, -1);
  up = new Vector3(0, 1, 0);
}
