import { ControlMode } from "../types/ControlMode";

interface OnChangeMethods<T> {
  beforeChange?(v: T, m: ControlMode): void;
  afterChange?(v: T, m: ControlMode): void;
}

export class ModeSpecificSetting<T> {
  isotropic: T;
  grounded: T;
  orbit: T;

  constructor(props: { [key in ControlMode]: T } & OnChangeMethods<T>) {
    this.isotropic = props.isotropic;
    this.grounded = props.grounded;
    this.orbit = props.orbit;
    return new Proxy(this, {
      set: (target, prop, value) => {
        if (prop in target) {
          props.beforeChange && props.beforeChange(value, prop as ControlMode);
          target[prop as keyof this] = value;
          props.afterChange && props.afterChange(value, prop as ControlMode);
          return true;
        }
        return false;
      },
      get: (target, prop) => {
        if (prop in target) return target[prop as keyof this];
      },
    });
  }
}
