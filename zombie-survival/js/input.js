// Gom mọi nguồn điều khiển (bàn phím, chuột, cần điều khiển ảo) về một giao diện chung theo "hành động".
// Game chỉ hỏi: đang đi hướng nào? ngắm hướng nào? có bắn không? vừa bấm "interact" chưa?
// Nút và cần cảm ứng (ui/touchControls.js) đẩy dữ liệu vào đây qua setTouchMove / setTouchAim / triggerAction.

import { KEY_BINDINGS, INPUT } from './config.js';
import { normalizeInto } from './utils/math.js';

export const DEVICES = Object.freeze({ DESKTOP: 'desktop', TOUCH: 'touch' });

/** Đảo bảng phím tắt: từ mã phím → tên hành động. */
function buildActionLookup(bindings) {
  const lookup = new Map();
  for (const [action, keyCodes] of Object.entries(bindings)) {
    for (const keyCode of keyCodes) lookup.set(keyCode, action);
  }
  return lookup;
}

function detectInitialDevice() {
  const isCoarse = window.matchMedia?.('(pointer: coarse)').matches;
  return isCoarse ? DEVICES.TOUCH : DEVICES.DESKTOP;
}

/** Không bắt phím khi người chơi đang gõ trong ô nhập (ví dụ ô seed). */
function isTypingTarget(target) {
  return target instanceof HTMLElement && target.closest('input, textarea, select') !== null;
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.actionByKeyCode = buildActionLookup(KEY_BINDINGS);
    this.heldKeyCodes = new Set();
    this.pressedActions = new Set(); // hành động vừa bấm trong frame này
    this.mouse = { x: 0, y: 0, isDown: false, hasPosition: false };
    this.touchMove = { x: 0, y: 0 };
    this.touchAim = { x: 0, y: 0, isActive: false, isFiring: false };
    this.device = detectInitialDevice();
    this.deviceListeners = [];

    // Object dùng lại mỗi frame để tránh tạo rác.
    this.moveVector = { x: 0, y: 0 };
    this.aimVector = { x: 0, y: 0 };
  }

  attach() {
    window.addEventListener('keydown', (event) => this.handleKeyDown(event));
    window.addEventListener('keyup', (event) => this.handleKeyUp(event));
    window.addEventListener('blur', () => this.releaseAll());
    window.addEventListener('pointerdown', (event) => this.detectDevice(event), { capture: true });
    window.addEventListener('pointermove', (event) => this.handleMouseMove(event));
    window.addEventListener('pointerup', (event) => this.handleMouseUp(event));
    this.canvas.addEventListener('pointerdown', (event) => this.handleMouseDown(event));
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false });
  }

  /** Lăn chuột để đổi ô trên thanh nhanh. */
  handleWheel(event) {
    event.preventDefault();
    if (event.deltaY === 0) return;
    this.pressedActions.add(event.deltaY > 0 ? 'hotbarNext' : 'hotbarPrev');
  }

  // ---------- Thiết bị đang dùng ----------

  onDeviceChange(listener) {
    this.deviceListeners.push(listener);
  }

  setDevice(nextDevice) {
    if (this.device === nextDevice) return;
    this.device = nextDevice;
    for (const listener of this.deviceListeners) listener(nextDevice);
  }

  detectDevice(event) {
    this.setDevice(event.pointerType === 'touch' ? DEVICES.TOUCH : DEVICES.DESKTOP);
  }

  // ---------- Bàn phím ----------

  handleKeyDown(event) {
    if (isTypingTarget(event.target)) return;
    const action = this.actionByKeyCode.get(event.code);
    if (!action) return;
    event.preventDefault();
    this.setDevice(DEVICES.DESKTOP);
    this.heldKeyCodes.add(event.code);
    if (!event.repeat) this.pressedActions.add(action);
  }

  handleKeyUp(event) {
    this.heldKeyCodes.delete(event.code);
  }

  isActionHeld(action) {
    return KEY_BINDINGS[action].some((keyCode) => this.heldKeyCodes.has(keyCode));
  }

  // ---------- Chuột ----------

  handleMouseMove(event) {
    if (event.pointerType === 'touch') return;
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;
    this.mouse.hasPosition = true;
  }

  handleMouseDown(event) {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    this.handleMouseMove(event);
    this.mouse.isDown = true;
  }

  handleMouseUp(event) {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    this.mouse.isDown = false;
  }

  // ---------- Cảm ứng (được gọi từ ui/touchControls.js) ----------

  setTouchMove(x, y) {
    this.touchMove.x = x;
    this.touchMove.y = y;
  }

  setTouchAim(x, y, isActive) {
    this.touchAim.x = x;
    this.touchAim.y = y;
    this.touchAim.isActive = isActive;
    this.touchAim.isFiring = isActive && Math.hypot(x, y) >= INPUT.aimFireThreshold;
  }

  /** Nút cảm ứng gọi hàm này để "bấm" một hành động, giống như nhấn phím. */
  triggerAction(action) {
    this.pressedActions.add(action);
  }

  // ---------- Truy vấn cho game ----------

  /** Hướng di chuyển, độ dài tối đa 1. Cần ảo cho phép đi chậm khi kéo nhẹ. */
  getMoveVector() {
    if (this.touchMove.x !== 0 || this.touchMove.y !== 0) {
      this.moveVector.x = this.touchMove.x;
      this.moveVector.y = this.touchMove.y;
      return this.moveVector;
    }
    const horizontal = Number(this.isActionHeld('moveRight')) - Number(this.isActionHeld('moveLeft'));
    const vertical = Number(this.isActionHeld('moveDown')) - Number(this.isActionHeld('moveUp'));
    return normalizeInto(this.moveVector, horizontal, vertical);
  }

  /**
   * Hướng ngắm (vector đơn vị) tính từ điểm gốc trên màn hình (thường là vị trí nhân vật),
   * hoặc null nếu hiện không ngắm.
   */
  getAimDirection(originScreenX, originScreenY) {
    if (this.device === DEVICES.TOUCH) {
      if (!this.touchAim.isActive) return null;
      return normalizeInto(this.aimVector, this.touchAim.x, this.touchAim.y);
    }
    if (!this.mouse.hasPosition) return null;
    const offsetX = this.mouse.x - originScreenX;
    const offsetY = this.mouse.y - originScreenY;
    if (Math.hypot(offsetX, offsetY) < INPUT.minAimDistance) return null;
    return normalizeInto(this.aimVector, offsetX, offsetY);
  }

  /** Đang giữ nút hành động chính: chuột trái, hoặc kéo cần ngắm quá ngưỡng. */
  isFireHeld() {
    return this.device === DEVICES.TOUCH ? this.touchAim.isFiring : this.mouse.isDown;
  }

  /** Muốn chạy nhanh: giữ Shift, hoặc đẩy cần di chuyển gần hết cỡ. */
  wantsSprint() {
    if (this.device === DEVICES.TOUCH) return Math.hypot(this.touchMove.x, this.touchMove.y) >= INPUT.touchSprintThreshold;
    return this.isActionHeld('sprint');
  }

  wasActionPressed(action) {
    return this.pressedActions.has(action);
  }

  /** Gọi ở cuối mỗi frame: xoá các lần "vừa bấm". */
  endFrame() {
    this.pressedActions.clear();
  }

  /** Thả hết phím và chuột, ví dụ khi cửa sổ mất focus. */
  releaseAll() {
    this.heldKeyCodes.clear();
    this.pressedActions.clear();
    this.mouse.isDown = false;
    this.setTouchMove(0, 0);
    this.setTouchAim(0, 0, false);
  }
}
