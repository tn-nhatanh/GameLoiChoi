// Điều khiển cảm ứng (thiết kế cho điện thoại xoay ngang): MỘT cần di chuyển ở nửa trái,
// bên phải là nút tròn lớn "hành động" (giữ để đánh/bắn — game tự quay về mục tiêu gần nhất) và các nút nhỏ.
// Dùng Pointer Events theo từng pointerId nên nhiều ngón cùng lúc; đẩy dữ liệu vào input.js. DOM ở index.html.

import { INPUT, TOUCH_SIZE_SCALES } from '../config.js';

/**
 * Cần điều khiển "nổi": chạm vào đâu trong vùng thì gốc cần xuất hiện ở đó.
 * onChange(x, y, isActive) nhận vector trong khoảng [-1, 1].
 */
function createFloatingStick(zoneElement, getRadius, onChange) {
  const baseElement = zoneElement.querySelector('.joystick-base');
  const knobElement = zoneElement.querySelector('.joystick-knob');
  let activePointerId = null;
  let originX = 0;
  let originY = 0;

  function placeBaseAt(clientX, clientY) {
    const zoneRect = zoneElement.getBoundingClientRect();
    baseElement.style.left = `${clientX - zoneRect.left}px`;
    baseElement.style.top = `${clientY - zoneRect.top}px`;
    baseElement.classList.add('is-active');
  }

  function resetBase() {
    baseElement.style.left = '';
    baseElement.style.top = '';
    baseElement.classList.remove('is-active');
    knobElement.style.transform = '';
  }

  // Kẹp ngón tay trong bán kính cần, rồi bỏ vùng chết ở giữa để tránh trôi nhẹ.
  function updateFromPointer(clientX, clientY) {
    const radius = getRadius();
    let offsetX = clientX - originX;
    let offsetY = clientY - originY;
    const distance = Math.hypot(offsetX, offsetY);
    if (distance > radius) {
      offsetX = (offsetX / distance) * radius;
      offsetY = (offsetY / distance) * radius;
    }
    knobElement.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

    const strength = Math.min(distance / radius, 1);
    if (strength < INPUT.joystickDeadZone) {
      onChange(0, 0, true);
      return;
    }
    const scaledStrength = (strength - INPUT.joystickDeadZone) / (1 - INPUT.joystickDeadZone);
    onChange((offsetX / (distance || 1)) * scaledStrength, (offsetY / (distance || 1)) * scaledStrength, true);
  }

  function release(event) {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    resetBase();
    onChange(0, 0, false);
  }

  zoneElement.addEventListener('pointerdown', (event) => {
    if (activePointerId !== null) return;
    event.preventDefault();
    activePointerId = event.pointerId;
    zoneElement.setPointerCapture(event.pointerId);
    originX = event.clientX;
    originY = event.clientY;
    placeBaseAt(originX, originY);
    updateFromPointer(originX, originY);
  });

  zoneElement.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointerId) updateFromPointer(event.clientX, event.clientY);
  });

  zoneElement.addEventListener('pointerup', release);
  zoneElement.addEventListener('pointercancel', release);
  zoneElement.addEventListener('lostpointercapture', release);

  return {
    reset() {
      activePointerId = null;
      resetBase();
      onChange(0, 0, false);
    },
  };
}

/** Nút hành động: bấm xuống là kích hoạt ngay (không đợi nhả tay) để phản hồi nhanh. */
function bindActionButtons(container, input) {
  for (const button of container.querySelectorAll('[data-game-action]')) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      input.triggerAction(button.dataset.gameAction);
      button.classList.add('is-pressed');
    });
    const clearPressed = () => button.classList.remove('is-pressed');
    button.addEventListener('pointerup', clearPressed);
    button.addEventListener('pointercancel', clearPressed);
    button.addEventListener('pointerleave', clearPressed);
  }
}

/**
 * Nút hành động chính: giữ là "đang bấm" (đánh/bắn liên tục), nhả là thôi.
 * Bắt pointer để ngón tay trượt ra ngoài nút vẫn tính là đang giữ cho tới khi nhấc tay.
 */
function bindHoldButton(button, onChange) {
  let activePointerId = null;
  const release = (event) => {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    button.classList.remove('is-pressed');
    onChange(false);
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (activePointerId !== null) return;
    activePointerId = event.pointerId;
    button.setPointerCapture(event.pointerId);
    button.classList.add('is-pressed');
    onChange(true);
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  return () => {
    activePointerId = null;
    button.classList.remove('is-pressed');
    onChange(false);
  };
}

/**
 * Chặn cuộn trang, kéo-để-tải-lại và phóng to bằng hai ngón.
 * Vẫn cho phép cuộn bên trong khung menu / bảng chế tạo khi màn hình quá thấp.
 */
export function preventPageGestures() {
  const blockUnlessScrollable = (event) => {
    if (event.target instanceof Element && event.target.closest('.menu-card, .panel-card')) return;
    event.preventDefault();
  };
  document.addEventListener('touchmove', blockUnlessScrollable, { passive: false });
  // Safari iOS: sự kiện cử chỉ phóng to riêng.
  for (const gestureEvent of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(gestureEvent, (event) => event.preventDefault());
  }
  // Chặn double-tap zoom và nhấn giữ hiện menu ngữ cảnh.
  document.addEventListener('dblclick', (event) => event.preventDefault());
  document.addEventListener('contextmenu', (event) => {
    if (event.target instanceof Element && event.target.closest('#touch-controls')) event.preventDefault();
  });
}

export function setupTouchControls(input) {
  const rootElement = document.getElementById('touch-controls');
  let sizeScale = 1;
  const getRadius = () => INPUT.joystickRadius * sizeScale;

  const moveStick = createFloatingStick(
    rootElement.querySelector('[data-stick="move"]'),
    getRadius,
    (x, y) => input.setTouchMove(x, y),
  );
  const primaryButton = rootElement.querySelector('[data-hold-action="primary"]');
  const releasePrimary = bindHoldButton(primaryButton, (isHeld) => input.setTouchPrimary(isHeld));
  bindActionButtons(rootElement, input);
  const interactButton = rootElement.querySelector('[data-game-action="interact"]');
  const reloadButton = rootElement.querySelector('[data-game-action="reload"]');

  const setText = (element, text) => {
    if (element.textContent !== text) element.textContent = text;
  };

  return {
    /** Đổi chữ trên nút Dùng theo ngữ cảnh, ví dụ "Hái quả", "Cày đất". */
    setInteractLabel(text) {
      setText(interactButton, text);
      interactButton.classList.toggle('is-idle', text === 'Dùng');
    },
    /** Chữ trên nút hành động lớn: "Đánh", "Bắn", "Cày", "Gieo", "Ăn"... */
    setPrimaryLabel(text) {
      setText(primaryButton, text);
    },
    /** Nút Nạp đạn chỉ hiện khi đang cầm súng cho đỡ rối. */
    setReloadVisible(isVisible) {
      if (reloadButton.hidden === !isVisible) return;
      reloadButton.hidden = !isVisible;
    },
    setVisible(isVisible) {
      if (rootElement.hidden === !isVisible) return;
      rootElement.hidden = !isVisible;
      if (!isVisible) {
        moveStick.reset();
        releasePrimary();
      }
    },
    /** Đổi kích thước nút theo Cài đặt (CSS dùng biến --touch-scale). */
    setSizeName(sizeName) {
      sizeScale = TOUCH_SIZE_SCALES[sizeName] ?? 1;
      document.documentElement.style.setProperty('--touch-scale', String(sizeScale));
      document.documentElement.style.setProperty('--stick-radius', `${getRadius()}px`);
    },
  };
}
