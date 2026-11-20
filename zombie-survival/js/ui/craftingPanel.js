// Bảng "Túi đồ & Chế tạo": danh sách công thức (đủ nguyên liệu và đứng gần bàn chế tạo nếu cần thì bấm được) và lưới túi đồ
// (chạm một ô rồi chạm ô khác để đổi chỗ; có nút vứt đồ ra đất). Mở bằng Q / nút "Chế tạo"; thế giới tạm dừng khi mở.
// Chỉ hiển thị và gọi callbacks; việc thật nằm ở systems/crafting.js và systems/inventory.js (qua main.js).

import { RECIPES, ITEMS, INVENTORY } from '../config.js';
import { countItem } from '../systems/inventory.js';
import { canCraft, hasRequiredStation } from '../systems/crafting.js';
import { getItemIconUrl } from './itemIcons.js';

function renderCostChips(inventory, cost) {
  return Object.entries(cost)
    .map(([itemId, needed]) => {
      const owned = countItem(inventory, itemId);
      const missingClass = owned < needed ? ' is-missing' : '';
      return `<span class="cost-chip${missingClass}" title="${ITEMS[itemId].name}">
        <img src="${getItemIconUrl(itemId)}" alt="${ITEMS[itemId].name}">${owned}/${needed}</span>`;
    })
    .join('');
}

/** Chip báo công thức cần trạm chế tạo mà người chơi chưa đứng gần. */
function renderStationChip(game, recipe) {
  if (!recipe.station || hasRequiredStation(game, recipe)) return '';
  return `<span class="cost-chip station-chip">
    <img src="${getItemIconUrl(recipe.station)}" alt="">Cần ${ITEMS[recipe.station].name}</span>`;
}

function renderRecipeRow(game, recipe) {
  const resultName = ITEMS[recipe.result].name;
  const countText = recipe.count > 1 ? ` ×${recipe.count}` : '';
  const isCraftable = canCraft(game, recipe);
  return `<li class="recipe-row${isCraftable ? '' : ' is-locked'}">
    <img class="recipe-icon" src="${getItemIconUrl(recipe.result)}" alt="">
    <div class="recipe-info">
      <span class="recipe-name">${resultName}${countText}</span>
      <span class="recipe-cost">${renderStationChip(game, recipe)}${renderCostChips(game.inventory, recipe.cost)}</span>
    </div>
    <button class="craft-button" type="button" data-recipe="${recipe.id}" ${isCraftable ? '' : 'disabled'}
      aria-label="Chế tạo ${resultName}">Làm</button>
  </li>`;
}

function renderInventorySlot(slot, index, selectedIndex) {
  const classes = ['item-slot', 'inventory-slot'];
  if (index < INVENTORY.hotbarSize) classes.push('is-hotbar');
  if (index === selectedIndex) classes.push('is-selected');
  const label = slot ? `${ITEMS[slot.itemId].name} × ${slot.count}` : `Ô trống ${index + 1}`;
  const content = slot
    ? `<img class="slot-icon" src="${getItemIconUrl(slot.itemId)}" alt=""><span class="slot-count">${slot.count > 1 ? slot.count : ''}</span>`
    : '';
  return `<button type="button" class="${classes.join(' ')}" data-inventory-slot="${index}" aria-label="${label}">${content}</button>`;
}

/** callbacks = { onClose(), onCraft(recipeId), onMoveSlot(from, to), onDropSlot(index) } */
export function setupCraftingPanel(callbacks) {
  const layer = document.getElementById('craft-panel');
  const recipeList = document.getElementById('recipe-list');
  const inventoryGrid = document.getElementById('inventory-grid');
  const dropButton = document.getElementById('drop-button');
  const selectedLabel = document.getElementById('inventory-selected');
  let selectedIndex = -1;
  let currentGame = null;

  function render() {
    if (!currentGame) return;
    const inventory = currentGame.inventory;
    recipeList.innerHTML = RECIPES.map((recipe) => renderRecipeRow(currentGame, recipe)).join('');
    inventoryGrid.innerHTML = inventory.slots.map((slot, index) => renderInventorySlot(slot, index, selectedIndex)).join('');
    const selectedSlot = selectedIndex >= 0 ? inventory.slots[selectedIndex] : null;
    dropButton.disabled = !selectedSlot;
    selectedLabel.textContent = selectedSlot
      ? `Đang chọn: ${ITEMS[selectedSlot.itemId].name} × ${selectedSlot.count}. Chạm ô khác để chuyển.`
      : 'Chạm một ô rồi chạm ô khác để đổi chỗ. 9 ô viền xanh là thanh nhanh.';
  }

  function handleSlotClick(index) {
    const inventory = currentGame.inventory;
    if (selectedIndex === -1) {
      if (inventory.slots[index]) selectedIndex = index;
    } else if (selectedIndex === index) {
      selectedIndex = -1;
    } else {
      callbacks.onMoveSlot(selectedIndex, index);
      selectedIndex = -1;
    }
    render();
  }

  layer.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target === layer || target.closest('[data-panel="close"]')) {
      callbacks.onClose();
      return;
    }
    const recipeButton = target.closest('[data-recipe]');
    if (recipeButton) {
      const result = callbacks.onCraft(recipeButton.dataset.recipe);
      render();
      if (result?.reason === 'full') selectedLabel.textContent = 'Túi đầy! Hãy vứt bớt đồ rồi chế tạo lại.';
      return;
    }
    const slotButton = target.closest('[data-inventory-slot]');
    if (slotButton) handleSlotClick(Number(slotButton.dataset.inventorySlot));
  });

  dropButton.addEventListener('click', () => {
    if (selectedIndex < 0) return;
    callbacks.onDropSlot(selectedIndex);
    selectedIndex = -1;
    render();
  });

  return {
    isOpen() {
      return !layer.hidden;
    },
    open(game) {
      currentGame = game;
      selectedIndex = -1;
      layer.hidden = false;
      render();
      layer.querySelector('.craft-button:not([disabled])')?.focus({ preventScroll: true });
    },
    close() {
      layer.hidden = true;
      currentGame = null;
    },
    refresh: render,
  };
}
