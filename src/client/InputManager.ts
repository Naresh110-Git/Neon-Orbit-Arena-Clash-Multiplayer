import { PlayerInput } from '../shared/types.js';

export class InputManager {
  private keysDown: Set<string> = new Set();
  private touchDx: number = 0;
  private touchDy: number = 0;
  private touchBoost: boolean = false;
  private touchPulse: boolean = false;
  private sequence: number = 0;
  private isTouchDevice: boolean = false;

  // Virtual Joystick state
  private joystickActive: boolean = false;
  private joystickOriginX: number = 0;
  private joystickOriginY: number = 0;
  private joystickTouchId: number | null = null;
  private joystickRadius: number = 55;

  private joystickBaseEl: HTMLElement | null = null;
  private joystickKnobEl: HTMLElement | null = null;
  private mobileControlsEl: HTMLElement | null = null;

  constructor() {
    this.detectDeviceType();
    this.setupKeyboardListeners();
    this.setupMobileControls();
  }

  private detectDeviceType(): void {
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  public initDOMRefs(
    mobileContainer: HTMLElement,
    baseEl: HTMLElement,
    knobEl: HTMLElement,
    boostBtn: HTMLElement,
    pulseBtn: HTMLElement
  ): void {
    this.mobileControlsEl = mobileContainer;
    this.joystickBaseEl = baseEl;
    this.joystickKnobEl = knobEl;

    if (this.isTouchDevice) {
      this.mobileControlsEl.style.display = 'block';
    }

    // Touch events for Boost and Pulse buttons
    const bindTouchButton = (btn: HTMLElement, onDown: () => void, onUp: () => void) => {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onDown();
      }, { passive: false });

      const endHandler = (e: TouchEvent) => {
        e.preventDefault();
        onUp();
      };

      btn.addEventListener('touchend', endHandler, { passive: false });
      btn.addEventListener('touchcancel', endHandler, { passive: false });
    };

    bindTouchButton(boostBtn, () => { this.touchBoost = true; }, () => { this.touchBoost = false; });
    bindTouchButton(pulseBtn, () => { this.touchPulse = true; }, () => { this.touchPulse = false; });

    // Touch events for Dynamic Left Screen Joystick
    const leftTouchZone = document.getElementById('touch-zone-left');
    if (leftTouchZone) {
      leftTouchZone.addEventListener('touchstart', (e) => this.handleJoystickStart(e), { passive: false });
      leftTouchZone.addEventListener('touchmove', (e) => this.handleJoystickMove(e), { passive: false });
      leftTouchZone.addEventListener('touchend', (e) => this.handleJoystickEnd(e), { passive: false });
      leftTouchZone.addEventListener('touchcancel', (e) => this.handleJoystickEnd(e), { passive: false });
    }
  }

  private handleJoystickStart(e: TouchEvent): void {
    if (this.joystickActive) return;
    e.preventDefault();

    const touch = e.changedTouches[0];
    this.joystickTouchId = touch.identifier;
    this.joystickActive = true;
    this.joystickOriginX = touch.clientX;
    this.joystickOriginY = touch.clientY;

    if (this.joystickBaseEl && this.joystickKnobEl) {
      this.joystickBaseEl.style.display = 'block';
      this.joystickBaseEl.style.left = `${this.joystickOriginX}px`;
      this.joystickBaseEl.style.top = `${this.joystickOriginY}px`;
      this.joystickKnobEl.style.transform = `translate(0px, 0px)`;
    }
  }

  private handleJoystickMove(e: TouchEvent): void {
    if (!this.joystickActive) return;
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.joystickTouchId) {
        const deltaX = touch.clientX - this.joystickOriginX;
        const deltaY = touch.clientY - this.joystickOriginY;
        const dist = Math.hypot(deltaX, deltaY);

        const clampedDist = Math.min(dist, this.joystickRadius);
        const angle = Math.atan2(deltaY, deltaX);

        this.touchDx = (Math.cos(angle) * clampedDist) / this.joystickRadius;
        this.touchDy = (Math.sin(angle) * clampedDist) / this.joystickRadius;

        if (this.joystickKnobEl) {
          const knobX = Math.cos(angle) * clampedDist;
          const knobY = Math.sin(angle) * clampedDist;
          this.joystickKnobEl.style.transform = `translate(${knobX}px, ${knobY}px)`;
        }
        break;
      }
    }
  }

  private handleJoystickEnd(e: TouchEvent): void {
    if (!this.joystickActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.joystickTouchId) {
        this.joystickActive = false;
        this.joystickTouchId = null;
        this.touchDx = 0;
        this.touchDy = 0;

        if (this.joystickBaseEl && this.joystickKnobEl) {
          this.joystickBaseEl.style.display = 'none';
          this.joystickKnobEl.style.transform = `translate(0px, 0px)`;
        }
        break;
      }
    }
  }

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', (e) => {
      // Prevent browser scroll on space or arrow keys during game
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        if ((e.target as HTMLElement)?.tagName !== 'INPUT') {
          e.preventDefault();
        }
      }
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.touchDx = 0;
      this.touchDy = 0;
      this.touchBoost = false;
      this.touchPulse = false;
    });
  }

  private setupMobileControls(): void {
    // Prevent zoom/pinch gestures
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  public getPlayerInput(): PlayerInput {
    let dx = 0;
    let dy = 0;

    // Keyboard inputs (WASD + Arrows)
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) dy -= 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) dy += 1;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) dx -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) dx += 1;

    // Normalize diagonal keyboard vectors
    const kLen = Math.hypot(dx, dy);
    if (kLen > 1) {
      dx /= kLen;
      dy /= kLen;
    }

    // Merge Touch inputs if present
    if (Math.abs(this.touchDx) > 0.05 || Math.abs(this.touchDy) > 0.05) {
      dx = this.touchDx;
      dy = this.touchDy;
    }

    const boost = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight') || this.touchBoost;
    const pulse = this.keysDown.has('Space') || this.touchPulse;

    // Pulse is a one-shot trigger
    if (this.touchPulse) {
      this.touchPulse = false;
    }

    this.sequence++;

    return {
      dx: Math.round(dx * 100) / 100,
      dy: Math.round(dy * 100) / 100,
      boost,
      pulse,
      sequence: this.sequence,
    };
  }

  public isUsingTouch(): boolean {
    return this.isTouchDevice;
  }
}
