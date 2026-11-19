// Điều khiển cảm ứng: cần di chuyển (nửa trái), cần ngắm kiêm bắn (nửa phải), các nút tròn hành động.
// Dùng Pointer Events và theo dõi từng pointerId, nên nhiều ngón tay hoạt động cùng lúc.
// Đẩy dữ liệu vào input.js; phần tử DOM nằm trong index.html (#touch-controls), kiểu dáng trong style.css.

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
  const aimStick = createFloatingStick(
    rootElement.querySelector('[data-stick="aim"]'),
    getRadius,
    (x, y, isActive) => input.setTouchAim(x, y, isActive),
  );
  bindActionButtons(rootElement, input);
  const interactButton = rootElement.querySelector('[data-game-action="interact"]');

  return {
    /** Đổi chữ trên nút Tương tác theo ngữ cảnh, ví dụ "Đặt" khi đang xây. */
    setInteractLabel(text) {
      if (interactButton.textContent !== text) interactButton.textContent = text;
    },
    setVisible(isVisible) {
      if (rootElement.hidden === !isVisible) return;
      rootElement.hidden = !isVisible;
      if (!isVisible) {
        moveStick.reset();
        aimStick.reset();
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
