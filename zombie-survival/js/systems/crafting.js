// Chế tạo: kiểm tra đủ nguyên liệu và đổi nguyên liệu thành vật phẩm theo RECIPES trong config.js.
// Kết quả bỏ vào túi đồ (systems/inventory.js); túi đầy thì từ chối, không làm mất nguyên liệu.
// Được gọi bởi ui/craftingPanel.js.

import { RECIPES } from '../config.js';
import { hasItems, removeItems, addItem, canFit } from './inventory.js';
import { emit } from '../utils/events.js';

export function getRecipe(recipeId) {
  return RECIPES.find((recipe) => recipe.id === recipeId) ?? null;
}

export function canCraft(inventory, recipe) {
  return hasItems(inventory, recipe.cost);
}

/**
 * Chế tạo một lần. Trả về { ok, reason } để giao diện hiện thông báo phù hợp.
 * reason: 'missing' (thiếu nguyên liệu) | 'full' (túi đầy).
 */
export function craftRecipe(game, recipeId) {
  const recipe = getRecipe(recipeId);
  const inventory = game.inventory;
  if (!recipe || !canCraft(inventory, recipe)) return { ok: false, reason: 'missing' };
  if (!canFit(inventory, recipe.result, recipe.count)) return { ok: false, reason: 'full' };

  removeItems(inventory, recipe.cost);
  addItem(inventory, recipe.result, recipe.count);
  emit(game, 'sound', { name: 'craft' });
  return { ok: true };
}
