// Trồng trọt: cày ô cỏ thành ruộng (cuốc làm đất), gieo hạt / củ giống, cây lớn qua các giai đoạn rồi thu hoạch.
// Ruộng gần nước (hồ, biển) là đất ẩm → cây lớn nhanh hơn. Ô ruộng lưu trong game.plots và world.plotByTile.
// Dùng FARMING/ITEMS trong config.js; được gọi từ interaction.js (nút Dùng / hành động chính) và main.js (mỗi frame).

import { FARMING, ITEMS } from '../config.js';
import { TILE, getTile, getObjectAtTile, getStructureAtTile, isInsideMap, tileIndexOf, pixelToTile } from '../world/mapGen.js';
import { spawnDrops } from '../entities/pickup.js';
import { clearObject, isClearable } from './gathering.js';
import { takeFromSlot } from './inventory.js';
import { getSelectedItemId, getHeldToolType } from './items.js';
import { emit } from '../utils/events.js';

const PARTICLE_HEIGHT = 10;

// ---------- Ô ruộng ----------

/** Trong bán kính FARMING.waterRangeTiles có ô nước nào không → đất ẩm. Nước không đổi nên chỉ tính một lần. */
function isNearWater(world, tileX, tileY) {
  const range = FARMING.waterRangeTiles;
  for (let offsetY = -range; offsetY <= range; offsetY++) {
    for (let offsetX = -range; offsetX <= range; offsetX++) {
      if (getTile(world, tileX + offsetX, tileY + offsetY) === TILE.WATER) return true;
    }
  }
  return false;
}

/** x là tâm ô, y là mép dưới ô (để sắp chiều sâu khi vẽ cây trồng), centerY là tâm ô. */
function createPlot(world, tileX, tileY) {
  const size = world.tileSize;
  return {
    type: 'plot', // renderer vẽ cây trồng theo type này
    tileX,
    tileY,
    x: (tileX + 0.5) * size,
    y: (tileY + 1) * size - 2,
    centerY: (tileY + 0.5) * size,
    isWet: isNearWater(world, tileX, tileY),
    crop: null, // 'wheat' | 'carrot' | 'potato' | null
    stage: 0,
    growth: 0, // số giây đã lớn trong giai đoạn hiện tại
    swayPhase: Math.random() * Math.PI * 2,
  };
}

export function getPlotAtTile(world, tileX, tileY) {
  return world.plotByTile.get(tileIndexOf(world, tileX, tileY));
}

export function addPlot(game, tileX, tileY) {
  const plot = createPlot(game.world, tileX, tileY);
  game.plots.push(plot);
  game.world.plotByTile.set(tileIndexOf(game.world, tileX, tileY), plot);
  return plot;
}

export function isRipe(plot) {
  return plot.crop !== null && plot.stage >= FARMING.stages - 1;
}

/** Cày được khi: ô cỏ/rừng, chưa có ruộng/công trình, không có cây/đá (cỏ hoa nhỏ thì dọn đi được). */
export function canTill(world, tileX, tileY) {
  if (!isInsideMap(world, tileX, tileY)) return false;
  const tile = getTile(world, tileX, tileY);
  if (tile !== TILE.GRASS && tile !== TILE.FOREST) return false;
  if (getPlotAtTile(world, tileX, tileY) || getStructureAtTile(world, tileX, tileY)) return false;
  const object = getObjectAtTile(world, tileX, tileY);
  return !object || object.isDepleted || isClearable(object);
}

// ---------- Ô đang nhắm tới ----------

/** Vật phẩm đang cầm có gieo được không ('wheat' | 'carrot' | 'potato' | null). */
export function getHeldSeedCrop(game) {
  const itemId = getSelectedItemId(game);
  return itemId ? (ITEMS[itemId].seedOf ?? null) : null;
}

export function isHoldingHoe(game) {
  return getHeldToolType(game) === 'hoe';
}

/**
 * Ô đang nhắm để cày / gieo, chỉ khi cầm cuốc làm đất hoặc hạt giống.
 * Dùng chuột: ô dưới con trỏ (nếu trong tầm). Cảm ứng / bàn phím: ô ngay trước mặt nhân vật.
 * Ghi vào game.farmTarget = { isActive, tileX, tileY, action: 'till' | 'plant' | null }.
 */
export function updateFarmTarget(game, controls) {
  const target = game.farmTarget;
  const seedCrop = getHeldSeedCrop(game);
  target.isActive = isHoldingHoe(game) || seedCrop !== null;
  target.action = null;
  if (!target.isActive) return;

  const { world, player } = game;
  const size = world.tileSize;
  const pointer = controls.pointerWorld;
  const usePointer = pointer && Math.hypot(pointer.x - player.x, pointer.y - player.y) <= FARMING.pointerReachTiles * size;
  const reach = FARMING.reachTiles * size;
  target.tileX = pixelToTile(world, usePointer ? pointer.x : player.x + player.facingX * reach);
  target.tileY = pixelToTile(world, usePointer ? pointer.y : player.y + player.facingY * reach);

  if (isHoldingHoe(game)) {
    if (canTill(world, target.tileX, target.tileY)) target.action = 'till';
  } else {
    const plot = getPlotAtTile(world, target.tileX, target.tileY);
    if (plot && plot.crop === null) target.action = 'plant';
  }
}

// ---------- Hành động ----------

export function tillTarget(game) {
  const { world, farmTarget } = game;
  if (farmTarget.action !== 'till') return false;
  const object = getObjectAtTile(world, farmTarget.tileX, farmTarget.tileY);
  if (object) clearObject(game, object);
  const plot = addPlot(game, farmTarget.tileX, farmTarget.tileY);
  emit(game, 'particles', { preset: 'soil', x: plot.x, y: plot.centerY });
  emit(game, 'sound', { name: 'till', x: plot.x, y: plot.centerY });
  farmTarget.action = null;
  return true;
}

export function plantTarget(game) {
  const { world, farmTarget, player } = game;
  if (farmTarget.action !== 'plant') return false;
  const plot = getPlotAtTile(world, farmTarget.tileX, farmTarget.tileY);
  const crop = getHeldSeedCrop(game);
  if (!plot || plot.crop !== null || !crop) return false;
  takeFromSlot(game.inventory, player.selectedSlot, 1);
  plot.crop = crop;
  plot.stage = 0;
  plot.growth = 0;
  emit(game, 'particles', { preset: 'sprout', x: plot.x, y: plot.centerY });
  emit(game, 'sound', { name: 'plant', x: plot.x, y: plot.centerY });
  farmTarget.action = null;
  return true;
}

/** Ruộng đã chín gần (x, y) nhất trong bán kính range, hoặc null. */
export function findNearestRipePlot(game, x, y, range) {
  let nearest = null;
  let nearestDistance = range;
  for (const plot of game.plots) {
    if (!isRipe(plot)) continue;
    const distance = Math.hypot(plot.x - x, plot.centerY - y);
    if (distance <= nearestDistance) {
      nearest = plot;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** Thu hoạch: rơi nông sản (lúa mì còn rơi thêm hạt để gieo tiếp); ô ruộng trống lại. */
export function harvestPlot(game, plot) {
  if (!isRipe(plot)) return false;
  spawnDrops(game, FARMING.crops[plot.crop].harvest, plot.x, plot.centerY);
  plot.crop = null;
  plot.stage = 0;
  plot.growth = 0;
  emit(game, 'particles', { preset: 'grassCut', x: plot.x, y: plot.centerY - PARTICLE_HEIGHT });
  emit(game, 'sound', { name: 'harvest', x: plot.x, y: plot.centerY });
  return true;
}

// ---------- Lớn lên ----------

export function updateFarming(game, deltaSeconds) {
  for (const plot of game.plots) {
    if (plot.crop === null || isRipe(plot)) continue;
    plot.growth += deltaSeconds * (plot.isWet ? FARMING.wetGrowthMultiplier : 1);
    if (plot.growth < FARMING.crops[plot.crop].stageSeconds) continue;
    plot.growth = 0;
    plot.stage += 1;
    if (isRipe(plot)) emit(game, 'particles', { preset: 'sprout', x: plot.x, y: plot.centerY - PARTICLE_HEIGHT });
  }
}

// ---------- Lưu & tải ----------

export function serializePlots(game) {
  return game.plots.map((plot) => [plot.tileX, plot.tileY, plot.crop, plot.stage, Math.round(plot.growth)]);
}

export function restorePlots(game, savedPlots) {
  for (const [tileX, tileY, crop, stage, growth] of savedPlots ?? []) {
    if (!canTill(game.world, tileX, tileY)) continue;
    const object = getObjectAtTile(game.world, tileX, tileY);
    if (object) clearObject(game, object);
    const plot = addPlot(game, tileX, tileY);
    if (crop && FARMING.crops[crop]) {
      plot.crop = crop;
      plot.stage = Math.min(stage, FARMING.stages - 1);
      plot.growth = growth;
    }
  }
}
