import { expect, describe, it } from "vitest";
import { OrbitState } from "../../../js/camera-controls/camera-states/OrbitState";
import { PerspectiveCamera } from "three";

describe("setCamera", async () => {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 10);
  const orbitState = new OrbitState(camera);

  it("Should set correct angles", async () => {
    expect(orbitState["spherical"].theta).toBeCloseTo(0);
    expect(orbitState["spherical"].phi).toBeCloseTo(Math.PI / 2);
  });
  it("Should set correct distance", async () => {
    expect(orbitState["spherical"].radius).toBeCloseTo(10);
  });
});

describe("getRelativeCameraPosition", async () => {
  const x = 2;
  const y = -8;
  const z = 10;
  const camera = new PerspectiveCamera();
  camera.position.set(x, y, z);
  const orbitState = new OrbitState(camera);

  it("Should return initial camera position before any transformation", async () => {
    const relCamPos = orbitState["getRelativePosition"]();
    expect(relCamPos.x).toBeCloseTo(x);
    expect(relCamPos.y).toBeCloseTo(y);
    expect(relCamPos.z).toBeCloseTo(z);
  });
});

describe("rotateLeft", async () => {
  const x = 2;
  const y = -8;
  const z = 10;
  const camera = new PerspectiveCamera();
  camera.position.set(x, y, z);
  const orbitState = new OrbitState(camera);

  orbitState.rotateLeft(Math.PI / 2);

  it("Should rotate around y-axis", async () => {
    const relCamPos = orbitState["getRelativePosition"]();
    expect(relCamPos.x).toBeCloseTo(z);
    expect(relCamPos.y).toBeCloseTo(y);
    expect(relCamPos.z).toBeCloseTo(-x);
  });
});

describe("rotateUp", async () => {
  const x = 0;
  const y = -5;
  const z = -5;
  const camera = new PerspectiveCamera();
  camera.position.set(x, y, z);
  const orbitState = new OrbitState(camera);

  orbitState.rotateUp(Math.PI / 2);

  it("Should rotate around x-axis", async () => {
    const relCamPos = orbitState["getRelativePosition"]();
    expect(relCamPos.x).toBeCloseTo(x);
    expect(relCamPos.y).toBeCloseTo(-z);
    expect(relCamPos.z).toBeCloseTo(-y);
  });
});
