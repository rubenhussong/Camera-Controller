import { Vector3 } from "three";

// State for translation between different CameraState implementations
export class CameraSaveState {
  orbitCenter = new Vector3();
  offset = new Vector3(0, 0, 1);
  forward = new Vector3(0, 0, -1);
  up = new Vector3(0, 1, 0);
}
