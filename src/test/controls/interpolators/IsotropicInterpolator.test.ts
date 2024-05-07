import { Object3D } from "three";
import { expect, describe, it } from "vitest";
import { IsotropicInterpolator } from "../../../js/controls/interpolators/IsotropicInterpolator";

describe("setPosition", async () => {
  const object = new Object3D();
  object.position.z = 1;
  const interpolator = new IsotropicInterpolator(object);
  it("sets object to position", async () => {
    const position = { x: 5, y: -10, z: 20 };
    interpolator.setPosition(position);
    interpolator.jumpToEnd();
    interpolator.applyToObject(object);
    expect(object.position.x).toBeCloseTo(position.x);
    expect(object.position.y).toBeCloseTo(position.y);
    expect(object.position.z).toBeCloseTo(position.z);
  });
});
