import { Vector3 } from "three";

/**
 * Bridge class for saving and tranlating between instances of different ControlState implementations.
 */
export class SaveState {
  orbitCenter = new Vector3();
  offset = new Vector3(0, 0, 1);
  forward = new Vector3(0, 0, -1);
  up = new Vector3(0, 1, 0);
}
