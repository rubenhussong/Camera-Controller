import { Quaternion, Vector3, Vector3Like } from "three";

export const EPSILON = 1e-5;

export const AXIS = {
  X: new Vector3(1, 0, 0),
  Y: new Vector3(0, 1, 0),
  Z: new Vector3(0, 0, 1),
};

export const approxZero = (v: number, error: number = EPSILON) => {
  return Math.abs(v) <= error;
};

export const approxZeroVec3 = (v: Vector3Like, error = EPSILON) => {
  return (
    approxZero(v.x, error) && approxZero(v.y, error) && approxZero(v.z, error)
  );
};

export const approxEqual = (a: number, b: number, error = EPSILON) => {
  return approxZero(a - b, error);
};

export const approxEqualVec3 = (
  a: Vector3Like,
  b: Vector3Like,
  error = EPSILON
) => {
  return (
    approxEqual(a.x, b.x, error) &&
    approxEqual(a.y, b.y, error) &&
    approxEqual(a.z, b.z, error)
  );
};

export const approxEqualQuat = (
  a: Quaternion,
  b: Quaternion,
  error = EPSILON
) => {
  return (
    approxEqual(a.x, b.x, error) &&
    approxEqual(a.y, b.y, error) &&
    approxEqual(a.z, b.z, error) &&
    approxEqual(a.w, b.w, error)
  );
};

export const approxCollinear = (
  a: Vector3,
  b: Vector3Like,
  error = EPSILON
) => {
  return approxEqual(Math.abs(a.dot(b)), 1, error);
};

export const approxParallel = (a: Vector3, b: Vector3Like, error = EPSILON) => {
  return approxEqual(a.dot(b), 1, error);
};

export const approxAntiparallel = (
  a: Vector3,
  b: Vector3Like,
  error = EPSILON
) => {
  return approxEqual(a.dot(b), -1, error);
};
