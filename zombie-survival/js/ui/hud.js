// HUD khi đang chơi: thanh máu/đói/thể lực, đồng hồ ngày đêm, thanh nhanh, đạn, gợi ý tương tác, thông báo, viền đỏ khi bị đánh.
// Chỉ cập nhật DOM khi giá trị thực sự đổi (so với lần trước) để không làm trình duyệt tính lại layout vô ích.
// Phần HTML ở index.html (#hud); main.js gọi update() mỗi frame. Icon vật phẩm lấy từ ui/itemIcons.js.

import { UI, SURVIVAL, INVENTORY, GUN, ITEMS } from '../config.js';
import { getDayNumber, isNight, getPhaseProgress } from '../systems/dayNight.js';
import { isHoldingGun } from '../systems/items.js';
import { countItem } from '../systems/inventory.js';
import { getItemIconUrl } from './itemIcons.js';

const LOW_RATIO = 0.25; // thanh dưới 25% thì nhấp nháy cảnh báo

/** Gán text / style chỉ khi khác giá trị cũ. */
function createDomWriter() {
  const previous = new Map();
  return function write(element, key, value, apply) {
    const cacheKey = `${element.id}:${key}`;
    if (previous.get(cacheKey) === value) return;
    previous.set(cacheKey, value);
    apply(value);
  };
}

function buildHotbar(container, onSelectSlot) {
  const slots = [];
  for (let index = 0; index < INVENTORY.hotbarSize; index++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item-slot hotbar-slot';
    button.dataset.slot = String(index);
    button.innerHTML = `<span class="slot-key">${index + 1}</span><img class="slot-icon" alt="" hidden><span class="slot-count"></span>`;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelectSlot(index);
    });
    container.append(button);
    slots.push({
      button,
      icon: button.querySelector('.slot-icon'),
      count: button.querySelector('.slot-count'),
    });
  }
  return slots;
}

function renderHotbar(slots, game) {
  slots.forEach((slotView, index) => {
    const slot = game.inventory.slots[index];
    slotView.button.classList.toggle('is-selected', index === game.player.selectedSlot);
    slotView.button.setAttribute('aria-label', slot ? `${ITEMS[slot.itemId].name} × ${slot.count}` : `Ô ${index + 1} trống`);
    slotView.icon.hidden = !slot;
    if (slot) slotView.icon.src = getItemIconUrl(slot.itemId);
    slotView.count.textContent = slot && slot.count > 1 ? String(slot.count) : '';
  });
}

/** callbacks = { onSelectSlot(index) } */
export function setupHud(callbacks) {
  const byId = (id) => document.getElementById(id);
  const elements = {
    hud: byId('hud'),
    toast: byId('toast'),
    health: byId('bar-health'),
    hunger: byId('bar-hunger'),
    stamina: byId('bar-stamina'),
    temperature: byId('status-temperature'),
    clock: byId('clock'),
    clockLabel: byId('clock-label'),
    clockFill: byId('clock-fill'),
    prompt: byId('prompt'),
    ammo: byId('ammo'),
    vignette: byId('hurt-vignette'),
  };
  const hotbarSlots = buildHotbar(byId('hotbar'), callbacks.onSelectSlot);
  const write = createDomWriter();
  let toastSecondsLeft = 0;
  let hurtSecondsLeft = 0;
  let renderedInventoryVersion = -1;
  let renderedSelectedSlot = -1;

  function updateBar(element, value, max) {
    const percent = Math.round((value / max) * 100);
    write(element, 'width', percent, (next) => {
      element.style.width = `${Math.max(0, next)}%`;
      element.parentElement.classList.toggle('is-low', next / 100 < LOW_RATIO);
    });
  }

  function updateStats(player) {
    updateBar(elements.health, player.health, SURVIVAL.maxHealth);
    updateBar(elements.hunger, player.hunger, SURVIVAL.maxHunger);
    updateBar(elements.stamina, player.stamina, SURVIVAL.maxStamina);
    const temperature = player.isWarm ? 'Ấm áp' : player.isCold ? 'Lạnh' : '';
    write(elements.temperature, 'text', temperature, (text) => {
      elements.temperature.textContent = text;
      elements.temperature.hidden = text === '';
      elements.temperature.classList.toggle('is-cold', text === 'Lạnh');
    });
  }

  function updateClock(game) {
    const night = isNight(game.dayNight);
    const label = `${night ? 'Đêm' : 'Ngày'} ${getDayNumber(game.dayNight)}`;
    write(elements.clockLabel, 'text', label, (text) => {
      elements.clockLabel.textContent = text;
      elements.clock.classList.toggle('is-night', night);
    });
    const progress = Math.round(getPhaseProgress(game.dayNight) * 100);
    write(elements.clockFill, 'width', progress, (percent) => {
      elements.clockFill.style.width = `${percent}%`;
    });
  }

  function updatePrompt(game, interactionLabel, isTouch) {
    let text = '';
    if (game.player.isSleeping) text = 'Đang ngủ… di chuyển để thức dậy';
    else if (interactionLabel) text = isTouch ? `Dùng: ${interactionLabel}` : `E · ${interactionLabel}`;
    write(elements.prompt, 'text', text, (value) => {
      elements.prompt.textContent = value;
      elements.prompt.hidden = value === '';
    });
  }

  function updateAmmo(game) {
    const player = game.player;
    let text = '';
    if (isHoldingGun(game)) {
      const reserve = countItem(game.inventory, 'ammo');
      text = player.reloadTimer > 0 ? 'Đang nạp đạn…' : `Đạn ${player.gunMagazine}/${GUN.magazineSize} · còn ${reserve}`;
    }
    write(elements.ammo, 'text', text, (value) => {
      elements.ammo.textContent = value;
      elements.ammo.hidden = value === '';
    });
  }

  function updateHotbar(game) {
    if (game.inventory.version === renderedInventoryVersion && game.player.selectedSlot === renderedSelectedSlot) return;
    renderedInventoryVersion = game.inventory.version;
    renderedSelectedSlot = game.player.selectedSlot;
    renderHotbar(hotbarSlots, game);
  }

  function updateTimers(deltaSeconds) {
    if (toastSecondsLeft > 0) {
      toastSecondsLeft -= deltaSeconds;
      if (toastSecondsLeft <= 0) elements.toast.classList.remove('is-visible');
    }
    if (hurtSecondsLeft > 0) {
      hurtSecondsLeft -= deltaSeconds;
      if (hurtSecondsLeft <= 0) elements.vignette.classList.remove('is-visible');
    }
  }

  return {
    setVisible(isVisible) {
      elements.hud.hidden = !isVisible;
    },

    showToast(message) {
      elements.toast.textContent = message;
      elements.toast.classList.add('is-visible');
      toastSecondsLeft = UI.toastSeconds;
    },

    flashHurt() {
      elements.vignette.classList.add('is-visible');
      hurtSecondsLeft = UI.hurtFlashSeconds;
    },

    /** Bắt buộc vẽ lại thanh nhanh (ví dụ sau khi bắt đầu phiên chơi mới). */
    invalidate() {
      renderedInventoryVersion = -1;
    },

    /** info = { interactionLabel, isTouch } */
    update(game, deltaSeconds, info) {
      updateTimers(deltaSeconds);
      if (!game) return;
      updateStats(game.player);
      updateClock(game);
      updatePrompt(game, info.interactionLabel, info.isTouch);
      updateAmmo(game);
      updateHotbar(game);
    },
  };
}
