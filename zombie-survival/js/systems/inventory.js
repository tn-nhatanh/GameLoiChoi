// Túi đồ: mảng ô cố định, mỗi ô chứa { itemId, count } hoặc null. 9 ô đầu là thanh nhanh.
// Chỉ thao tác dữ liệu, không biết gì về giao diện. Mỗi lần thay đổi tăng `version` để HUD biết mà vẽ lại.
// Dùng ITEMS/INVENTORY trong config.js; được dùng bởi crafting.js, pickup.js, interaction.js, ui/*.

import { ITEMS, INVENTORY } from '../config.js';

export function createInventory(slotCount = INVENTORY.slotCount) {
  return { slots: new Array(slotCount).fill(null), version: 0 };
}

function markChanged(inventory) {
  inventory.version++;
}

function stackSizeOf(itemId) {
  return ITEMS[itemId].stackSize;
}

export function getSlot(inventory, slotIndex) {
  return inventory.slots[slotIndex] ?? null;
}

export function countItem(inventory, itemId) {
  let total = 0;
  for (const slot of inventory.slots) if (slot?.itemId === itemId) total += slot.count;
  return total;
}

/** cost = { wood: 5, stone: 2 } */
export function hasItems(inventory, cost) {
  return Object.entries(cost).every(([itemId, count]) => countItem(inventory, itemId) >= count);
}

/** Còn chỗ cho thêm `count` vật phẩm này không (tính cả chồng lên ô sẵn có). */
export function canFit(inventory, itemId, count) {
  let room = 0;
  for (const slot of inventory.slots) {
    if (slot === null) room += stackSizeOf(itemId);
    else if (slot.itemId === itemId) room += stackSizeOf(itemId) - slot.count;
    if (room >= count) return true;
  }
  return false;
}

/**
 * Thêm vật phẩm: chồng lên các ô cùng loại trước, rồi mới dùng ô trống (từ trái sang).
 * Trả về số lượng KHÔNG nhét vừa (0 = vừa hết).
 */
export function addItem(inventory, itemId, count) {
  let remaining = count;
  const stackSize = stackSizeOf(itemId);
  for (const slot of inventory.slots) {
    if (remaining === 0) break;
    if (slot?.itemId !== itemId || slot.count >= stackSize) continue;
    const added = Math.min(stackSize - slot.count, remaining);
    slot.count += added;
    remaining -= added;
  }
  for (let index = 0; index < inventory.slots.length && remaining > 0; index++) {
    if (inventory.slots[index] !== null) continue;
    const added = Math.min(stackSize, remaining);
    inventory.slots[index] = { itemId, count: added };
    remaining -= added;
  }
  if (remaining !== count) markChanged(inventory);
  return remaining;
}

/** Lấy bớt vật phẩm, ưu tiên các ô ở cuối túi để giữ nguyên thanh nhanh. Trả về số đã lấy. */
export function removeItem(inventory, itemId, count) {
  let remaining = count;
  for (let index = inventory.slots.length - 1; index >= 0 && remaining > 0; index--) {
    const slot = inventory.slots[index];
    if (slot?.itemId !== itemId) continue;
    const taken = Math.min(slot.count, remaining);
    slot.count -= taken;
    remaining -= taken;
    if (slot.count === 0) inventory.slots[index] = null;
  }
  if (remaining !== count) markChanged(inventory);
  return count - remaining;
}

export function removeItems(inventory, cost) {
  for (const [itemId, count] of Object.entries(cost)) removeItem(inventory, itemId, count);
}

/** Lấy `count` vật phẩm ra khỏi một ô cụ thể (dùng khi ăn, đặt công trình, vứt đồ). */
export function takeFromSlot(inventory, slotIndex, count) {
  const slot = inventory.slots[slotIndex];
  if (!slot) return null;
  const taken = Math.min(slot.count, count);
  slot.count -= taken;
  if (slot.count === 0) inventory.slots[slotIndex] = null;
  markChanged(inventory);
  return { itemId: slot.itemId, count: taken };
}

/** Đổi chỗ hai ô; nếu cùng loại thì dồn chồng vào ô đích. */
export function moveSlot(inventory, fromIndex, toIndex) {
  if (fromIndex === toIndex) return;
  const from = inventory.slots[fromIndex];
  const to = inventory.slots[toIndex];
  if (from && to && from.itemId === to.itemId) {
    const moved = Math.min(from.count, stackSizeOf(to.itemId) - to.count);
    to.count += moved;
    from.count -= moved;
    if (from.count === 0) inventory.slots[fromIndex] = null;
  } else {
    inventory.slots[fromIndex] = to;
    inventory.slots[toIndex] = from;
  }
  markChanged(inventory);
}

/** Tìm ô đầu tiên (bắt đầu từ startIndex, quay vòng) thoả điều kiện. Trả về -1 nếu không có. */
export function findSlotIndex(inventory, matches, startIndex = 0) {
  const slotCount = inventory.slots.length;
  for (let step = 0; step < slotCount; step++) {
    const index = (startIndex + step) % slotCount;
    const slot = inventory.slots[index];
    if (slot && matches(slot)) return index;
  }
  return -1;
}

/** Dạng gọn để lưu vào localStorage: [[itemId, count] | null, ...] */
export function serializeInventory(inventory) {
  return inventory.slots.map((slot) => (slot ? [slot.itemId, slot.count] : null));
}

export function deserializeInventory(savedSlots) {
  const inventory = createInventory();
  savedSlots.forEach((saved, index) => {
    if (saved && ITEMS[saved[0]] && index < inventory.slots.length) {
      inventory.slots[index] = { itemId: saved[0], count: saved[1] };
    }
  });
  return inventory;
}
