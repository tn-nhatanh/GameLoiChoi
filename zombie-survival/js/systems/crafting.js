// Chế tạo: kiểm tra đủ nguyên liệu (và đứng gần bàn chế tạo nếu công thức cần), rồi đổi nguyên liệu thành vật phẩm.
// Công thức trong RECIPES (config.js): không có `station` = làm bằng tay; có `station` = phải đứng gần trạm đó.
// Kết quả bỏ vào túi đồ (systems/inventory.js); túi đầy thì từ chối, không làm mất nguyên liệu. Gọi từ ui/craftingPanel.js.

import { RECIPES, CRAFTING } from '../config.js';
import { hasItems, removeItems, addItem, canFit } from './inventory.js';
import { findNearestStructure } from './building.js';
import { emit } from '../utils/events.js';

export function getRecipe(recipeId) {
  return RECIPES.find((recipe) => recipe.id === recipeId) ?? null;
}

/** Người chơi có đang đứng gần một công trình loại `stationType` không. */
export function isNearStation(game, stationType) {
  const { player } = game;
  const isStation = (structure) => structure.structureType === stationType;
  return findNearestStructure(game, player.x, player.y, CRAFTING.stationRange, isStation) !== null;
}

/** Công thức này có dùng được ở chỗ đang đứng không (làm bằng tay, hoặc đang ở gần trạm cần thiết). */
export function hasRequiredStation(game, recipe) {
  return !recipe.station || isNearStation(game, recipe.station);
}

export function canCraft(game, recipe) {
  return hasRequiredStation(game, recipe) && hasItems(game.inventory, recipe.cost);
}

/**
 * Chế tạo một lần. Trả về { ok, reason } để giao diện hiện thông báo phù hợp.
 * reason: 'station' (chưa đứng gần bàn) | 'missing' (thiếu nguyên liệu) | 'full' (túi đầy).
 */
export function craftRecipe(game, recipeId) {
  const recipe = getRecipe(recipeId);
  const inventory = game.inventory;
  if (!recipe) return { ok: false, reason: 'missing' };
  if (!hasRequiredStation(game, recipe)) return { ok: false, reason: 'station' };
  if (!hasItems(inventory, recipe.cost)) return { ok: false, reason: 'missing' };
  if (!canFit(inventory, recipe.result, recipe.count)) return { ok: false, reason: 'full' };

  removeItems(inventory, recipe.cost);
  addItem(inventory, recipe.result, recipe.count);
  emit(game, 'sound', { name: 'craft' });
  return { ok: true };
}
