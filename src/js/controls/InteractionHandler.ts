// Event button value for mouse keys
const MOUSE = { LEFT: 0, RIGHT: 2 };

// To store the active action
const ACTION = {
  NONE: -1,
  DOLLY: 0,
  ROTATE: 1,
  PAN: 2,
  TOUCH_DOLLY: 3,
  TOUCH_ROTATE: 4,
  TOUCH_PAN: 5,
};

/**
 * Responsible for everything that has to do with user interaction.
 * The Controls class extends this abstract class and implements in particular the three transformation methods dolly, rotate and pan, as well as optional effects onEnable and onDisable.
 * The InteractionHandler is initially deactivated.
 */
export abstract class InteractionHandler {
  private domElement: HTMLElement;

  protected enabled: boolean;

  constructor(domElement: HTMLElement) {
    this.domElement = domElement;
    this.enabled = false;
  }

  // ==================== A P I

  dollyEnabled = true;
  rotateEnabled = true;
  panEnabled = true;

  /**
   * Start listening to user interaction.
   */
  enable = () => {
    if (this.enabled) return;
    this.onEnable();
    this.startListeningToUser();
    this.enabled = true;
  };

  /**
   * End listening to user interaction.
   */
  disable = () => {
    if (!this.enabled) return;
    this.enabled = false;
    this.stopListeningToUser();
    this.onDisable();
  };

  // ==================== I N T E R N A L   V A R I A B L E S

  // Stores the active action
  private action: number = ACTION.NONE;

  // Gets updated on touch and mouse interaction
  private lastPointer = new Pointer();
  private pointer = new Pointer();

  // ==================== A B S T R A C T S

  // Additional effects that can optionally be overwritten by the extending class and trigger on enable/disable.
  protected onEnable = () => {};
  protected onDisable = () => {};

  protected abstract dolly: (direction: number) => void;
  protected abstract rotate: (deltaX: number, deltaY: number) => void;
  protected abstract pan: (deltaX: number, deltaY: number) => void;

  // ==================== E V E N T S   L I S T E N E R S

  // Start controlling by user interaction
  private startListeningToUser = () => {
    this.domElement.addEventListener("mousedown", this.onMouseDown);
    this.domElement.addEventListener("wheel", this.onWheel);
    this.domElement.addEventListener("touchstart", this.onTouchStart);
  };

  // Stop controlling by user interaction
  private stopListeningToUser = () => {
    this.domElement.removeEventListener("mousedown", this.onMouseDown);
    this.domElement.removeEventListener("wheel", this.onWheel);
    this.domElement.removeEventListener("touchstart", this.onTouchStart);
    this.stopMouseChangeListeners();
    this.stopTouchChangeListeners();
  };

  // ========== Mouse Change Event Listeners

  // Start listening for events that cause an action triggered by the mouse to be canceled.
  private startMouseChangeListeners = () => {
    this.domElement.addEventListener("mouseup", this.onMouseUp);
    this.domElement.addEventListener("mouseleave", this.onMouseLeave);
    this.domElement.addEventListener("mousemove", this.onMouseMove);
  };

  // Stop listening for events that trigger the action abort. (The action has probably been canceled.)
  private stopMouseChangeListeners = () => {
    this.domElement.removeEventListener("mouseup", this.onMouseUp);
    this.domElement.removeEventListener("mouseleave", this.onMouseLeave);
    this.domElement.removeEventListener("mousemove", this.onMouseMove);
  };

  // ========== Touch Change Event Listeners

  // Start listening for events that cause an action triggered by touch to be canceled.
  private startTouchChangeListeners = () => {
    this.domElement.addEventListener("touchend", this.onTouchEnd);
    this.domElement.addEventListener("touchcancel", this.onTouchCancel);
    this.domElement.addEventListener("touchmove", this.onTouchMove);
  };

  // Stop listening for events that trigger the action abort. (The action has probably been canceled.)
  private stopTouchChangeListeners = () => {
    this.domElement.removeEventListener("touchend", this.onTouchEnd);
    this.domElement.removeEventListener("touchcancel", this.onTouchCancel);
    this.domElement.removeEventListener("touchmove", this.onTouchMove);
  };

  // ========== Mouse Events

  private onMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    this.handleMouseStart(e);
  };

  private onMouseUp = (e: MouseEvent) => {
    e.preventDefault();
    this.handleMouseStop();
  };

  private onMouseLeave = (e: MouseEvent) => {
    e.preventDefault();
    this.handleMouseStop();
  };

  private onMouseMove = (e: MouseEvent) => {
    e.preventDefault();
    this.handleMouseMove(e);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.handleMouseWheel(e);
  };

  // ========== Touch Events

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    this.handleTouchStart(e);
  };

  private onTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    this.handleTouchStop();
  };

  private onTouchCancel = (e: TouchEvent) => {
    e.preventDefault();
    this.handleTouchStop();
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.handleTouchMove(e);
  };

  // ========== Context Menu

  // Prevents the context menu from appearing.
  private preventContextMenu = () => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      this.domElement.removeEventListener("contextmenu", onContextMenu);
    };
    this.domElement.addEventListener("contextmenu", onContextMenu);
  };

  // ==================== E V E N T S   H A N D L E R S

  // ========== Mouse Event Handlers

  /**
   * Activate an action depending on which mouse button is pressed.
   * @param e the mouse event
   */
  private handleMouseStart = (e: MouseEvent) => {
    switch (e.button) {
      case MOUSE.LEFT: {
        if (!this.rotateEnabled) return this.handleMouseStop();
        this.action = ACTION.ROTATE;
        break;
      }
      case MOUSE.RIGHT: {
        if (!this.panEnabled) return this.handleMouseStop();
        this.action = ACTION.PAN;
        break;
      }
      default: {
        return this.handleMouseStop();
      }
    }
    this.lastPointer.set(e.clientX, e.clientY);
    this.preventContextMenu();
    this.startMouseChangeListeners();
  };

  // Cancel action that has been triggered by the mouse.
  private handleMouseStop = () => {
    this.action = ACTION.NONE;
    this.stopMouseChangeListeners();
  };

  /**
   * Trigger a transformation based on the active action and the distance traveled by the mouse.
   * @param e the mouse event
   */
  private handleMouseMove = (e: MouseEvent) => {
    this.pointer.set(e.clientX, e.clientY);
    const delta = this.getRelativePointerDelta();

    switch (this.action) {
      case ACTION.ROTATE: {
        if (!this.rotateEnabled) return this.handleMouseStop();
        this.rotate(delta.x, delta.y);
        break;
      }
      case ACTION.PAN: {
        if (!this.panEnabled) return this.handleMouseStop();
        this.pan(delta.x, delta.y);
        break;
      }
      default: {
        return this.handleMouseStop();
      }
    }
    this.lastPointer.copy(this.pointer);
  };

  // Dolly on mouse wheel
  private handleMouseWheel = (e: WheelEvent) => {
    if (!this.dollyEnabled) return;
    this.action = ACTION.DOLLY;
    this.dolly(Math.sign(e.deltaY));
    this.action = ACTION.NONE;
  };

  // ========== Touch Event Handlers

  /**
   * Activate an action depending on how many fingers touch the screen.
   * @param e the touch event
   */
  private handleTouchStart = (e: TouchEvent) => {
    switch (e.touches.length) {
      case 1: {
        if (!this.rotateEnabled) return this.handleTouchStop();
        this.action = ACTION.TOUCH_ROTATE;
        break;
      }
      case 2: {
        if (!this.dollyEnabled) return this.handleTouchStop();
        this.action = ACTION.TOUCH_DOLLY;
        break;
      }
      case 3: {
        if (!this.panEnabled) return this.handleTouchStop();
        this.action = ACTION.TOUCH_PAN;
        break;
      }
      default: {
        return this.handleTouchStop();
      }
    }
    this.lastPointer.set(e.touches[0].clientX, e.touches[0].clientY);
    this.preventContextMenu();
    this.startTouchChangeListeners();
  };

  // Cancel action that has been triggered by touch.
  private handleTouchStop = () => {
    this.action = ACTION.NONE;
    this.stopTouchChangeListeners();
  };

  /**
   * Triggering a transformation based on the active action and the distance traveled by the finger/s.
   * @param e the mouse event
   */
  // TODO: Test
  private handleTouchMove = (e: TouchEvent) => {
    this.pointer.set(e.touches[0].clientX, e.touches[0].clientY);
    const delta = this.getRelativePointerDelta();
    switch (this.action) {
      case ACTION.TOUCH_ROTATE: {
        if (!this.rotateEnabled) return this.handleTouchStop();
        this.rotate(delta.x, delta.y);
        break;
      }
      case ACTION.TOUCH_DOLLY: {
        if (!this.dollyEnabled) return this.handleTouchStop();
        // TODO: This might not work nicely. Test! Probably it needs a custom touchDolly method that evaluates delta instead of direction.
        this.dolly(delta.y);
        break;
      }
      case ACTION.TOUCH_PAN: {
        if (!this.panEnabled) return this.handleTouchStop();
        this.pan(-delta.x, delta.y);
        break;
      }
      default: {
        return this.handleTouchStop();
      }
    }
    this.lastPointer.copy(this.pointer);
  };

  // ==================== U T I L I T Y

  // Returns the distance between the last two positions on the screen in relation to its size.
  private getRelativePointerDelta = () => {
    return Pointer.getDelta(this.pointer, this.lastPointer).scale(
      1 / this.domElement.clientHeight
    );
  };
}

/**
 * A two-dimensional vector to store a position on the screen.
 */
class Pointer {
  x: number;
  y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set = (x: number, y: number) => {
    this.x = x;
    this.y = y;
    return this;
  };

  copy = (p: Pointer) => this.set(p.x, p.y);

  static getDelta = (p1: Pointer, p2: Pointer) => {
    return new Pointer(p1.x - p2.x, p1.y - p2.y);
  };

  scale = (factor: number) => {
    this.x *= factor;
    this.y *= factor;
    return this;
  };
}
