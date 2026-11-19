// Tiện ích nhỏ quanh vật phẩm: vật phẩm đang cầm, loại công cụ, có phải đồ ăn / công trình không.
// Gom ở đây để các system khác không phải tự tra ITEMS trong config.js.
// Dùng bởi interaction.js, combat.js, building.js, ui/hud.js.

import { ITEMS, INVENTORY } from '../config.js';
import { getSlot, findSlotIndex, moveSlot } from './inventory.js';
import { emit } from '../utils/events.js';

/** Ô đang chọn trên thanh nhanh, hoặc null nếu ô trống. */
export function getSelectedSlot(game) {
  return getSlot(game.inventory, game.player.selectedSlot);
}

export function getSelectedItemId(game) {
  return getSelectedSlot(game)?.itemId ?? null;
}

export function getItemInfo(itemId) {
  return itemId ? ITEMS[itemId] : null;
}

/** Loại công cụ cận chiến đang cầm: 'axe' | 'pickaxe' | 'hand'. */
export function getHeldToolType(game) {
  return getItemInfo(getSelectedItemId(game))?.tool ?? 'hand';
}

export function isHoldingGun(game) {
  return Boolean(getItemInfo(getSelectedItemId(game))?.isGun);
}

/** Loại công trình đang cầm (đang ở chế độ xây), hoặc null. */
export function getHeldStructureType(game) {
  return getItemInfo(getSelectedItemId(game))?.structure ?? null;
}

export function isFood(itemId) {
  return Boolean(getItemInfo(itemId)?.food);
}

export function isStructureItem(itemId) {
  return Boolean(getItemInfo(itemId)?.structure);
}

// ---------- Chọn ô trên thanh nhanh ----------

export function selectHotbarSlot(game, slotIndex) {
  if (slotIndex < 0 || slotIndex >= INVENTORY.hotbarSize) return;
  game.player.selectedSlot = slotIndex;
}

/** Lăn chuột: sang ô kế bên (quay vòng). */
export function cycleHotbar(game, direction) {
  const size = INVENTORY.hotbarSize;
  selectHotbarSlot(game, (game.player.selectedSlot + direction + size) % size);
}

/** Đưa vật phẩm ở ô phía sau túi lên thanh nhanh: ưu tiên ô trống, hết chỗ thì đổi với ô cuối. */
function bringToHotbar(game, slotIndex) {
  if (slotIndex < INVENTORY.hotbarSize) return slotIndex;
  const inventory = game.inventory;
  let target = INVENTORY.hotbarSize - 1;
  for (let index = 0; index < INVENTORY.hotbarSize; index++) {
    if (inventory.slots[index] === null) {
      target = index;
      break;
    }
  }
  moveSlot(inventory, slotIndex, target);
  return target;
}

/**
 * Phím B / nút "Xây": chọn công trình kế tiếp trong túi.
 * Đã duyệt hết một vòng thì thoát chế độ xây, trở lại món đang cầm trước đó.
 */
export function cycleBuildSelection(game) {
  const player = game.player;
  const isBuilding = isStructureItem(getSelectedItemId(game));
  const startIndex = isBuilding ? player.selectedSlot + 1 : 0;
  const foundIndex = findSlotIndex(game.inventory, (slot) => isStructureItem(slot.itemId), startIndex);

  if (foundIndex === -1) {
    emit(game, 'toast', { text: 'Chưa có công trình nào. Mở Chế tạo để làm tường, cửa, lửa trại…' });
    emit(game, 'sound', { name: 'error' });
    return;
  }
  if (isBuilding && foundIndex <= player.selectedSlot) {
    player.selectedSlot = player.slotBeforeBuild;
    return;
  }
  if (!isBuilding) player.slotBeforeBuild = player.selectedSlot;
  player.selectedSlot = bringToHotbar(game, foundIndex);
}
