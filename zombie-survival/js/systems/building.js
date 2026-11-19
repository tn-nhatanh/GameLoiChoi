// Xây dựng: bóng mờ chọn ô (xanh = đặt được, đỏ = vướng), đặt công trình từ túi đồ, hư hỏng khi bị đập, sửa bằng gỗ.
// Công trình nằm trong game.structures (để duyệt) và world.structureByTile (để tra theo ô khi va chạm / tìm đường).
// Dùng STRUCTURES/BUILD trong config.js; bẫy gây sát thương được xử lý trong combat.js.

import { STRUCTURES, BUILD } from '../config.js';
import { TILE, getTile, getObjectAtTile, getStructureAtTile, isInsideMap, tileIndexOf, pixelToTile } from '../world/mapGen.js';
import { circleOverlapsSquare } from '../world/collision.js';
import { markFlowFieldDirty } from './pathfinding.js';
import { removeItem, countItem, takeFromSlot } from './inventory.js';
import { getHeldStructureType } from './items.js';
import { removeWhere } from '../utils/math.js';
import { emit } from '../utils/events.js';

const STRUCTURE_HIT_SHAKE_SECONDS = 0.2;
const CAMPFIRE_SMOKE_INTERVAL_SECONDS = 0.35; // khói bốc lên từ đống lửa (chỉ để trang trí)
const CAMPFIRE_SMOKE_HEIGHT = 16;

/**
 * Toạ độ: x là tâm ô, y là MÉP DƯỚI của ô (để sắp xếp chiều sâu khi vẽ: vật thấp hơn che vật cao hơn),
 * centerY là tâm ô (dùng cho ánh sáng, khoảng cách).
 */
function createStructure(world, structureType, tileX, tileY, health) {
  const size = world.tileSize;
  return {
    type: 'structure', // renderer chọn hàm vẽ theo type
    structureType,
    tileX,
    tileY,
    x: (tileX + 0.5) * size,
    y: (tileY + 1) * size - 1,
    centerY: (tileY + 0.5) * size,
    health,
    maxHealth: STRUCTURES[structureType].maxHealth,
    trapCooldown: 0,
    hitTimer: 0,
    smokeTimer: 0,
    flickerPhase: Math.random() * Math.PI * 2,
  };
}

export function addStructure(game, structureType, tileX, tileY, health = STRUCTURES[structureType].maxHealth) {
  const structure = createStructure(game.world, structureType, tileX, tileY, health);
  game.structures.push(structure);
  game.world.structureByTile.set(tileIndexOf(game.world, tileX, tileY), structure);
  markFlowFieldDirty(game.flowField);
  return structure;
}

export function removeStructure(game, structure) {
  game.world.structureByTile.delete(tileIndexOf(game.world, structure.tileX, structure.tileY));
  removeWhere(game.structures, (candidate) => candidate === structure);
  markFlowFieldDirty(game.flowField);
}

// ---------- Kiểm tra chỗ đặt ----------

/** Có người / thú / zombie đứng đè lên ô không (chỉ quan trọng với công trình chắn đường). */
function isTileOccupiedByCreature(game, tileX, tileY) {
  const size = game.world.tileSize;
  const overlaps = (entity) => circleOverlapsSquare(entity, tileX * size, tileY * size, size);
  return overlaps(game.player) || game.zombies.some(overlaps) || game.animals.some(overlaps);
}

/** Đặt được khi: trong map, trên đất, không có cây/đá/bụi, chưa có công trình, không đè lên sinh vật. */
export function canPlaceStructure(game, structureType, tileX, tileY) {
  const world = game.world;
  if (!isInsideMap(world, tileX, tileY) || getTile(world, tileX, tileY) === TILE.WATER) return false;
  if (getObjectAtTile(world, tileX, tileY) || getStructureAtTile(world, tileX, tileY)) return false;
  if (STRUCTURES[structureType].blocks === 'none') return true;
  return !isTileOccupiedByCreature(game, tileX, tileY);
}

function isWithinBuildReach(game, tileX, tileY) {
  const size = game.world.tileSize;
  const distance = Math.hypot((tileX + 0.5) * size - game.player.x, (tileY + 0.5) * size - game.player.y);
  return distance <= BUILD.reachTiles * size;
}

/**
 * Cập nhật bóng mờ: máy tính → ô dưới con trỏ chuột; cảm ứng → ô ngay trước mặt nhân vật.
 * controls.pointerWorld có giá trị khi đang dùng chuột.
 */
export function updateBuildGhost(game, controls) {
  const ghost = game.buildGhost;
  ghost.structureType = getHeldStructureType(game);
  ghost.isActive = ghost.structureType !== null;
  if (!ghost.isActive) return;

  const world = game.world;
  const player = game.player;
  const reach = BUILD.touchPlaceDistanceTiles * world.tileSize;
  const targetX = controls.pointerWorld ? controls.pointerWorld.x : player.x + player.facingX * reach;
  const targetY = controls.pointerWorld ? controls.pointerWorld.y : player.y + player.facingY * reach;
  ghost.tileX = pixelToTile(world, targetX);
  ghost.tileY = pixelToTile(world, targetY);
  ghost.isInReach = isWithinBuildReach(game, ghost.tileX, ghost.tileY);
  ghost.isValid = ghost.isInReach && canPlaceStructure(game, ghost.structureType, ghost.tileX, ghost.tileY);
}

/** Đặt công trình đang cầm vào ô của bóng mờ. Trả về true nếu đặt được. */
export function placeHeldStructure(game) {
  const ghost = game.buildGhost;
  if (!ghost.isActive) return false;
  if (!ghost.isValid) {
    emit(game, 'sound', { name: 'error' });
    if (!ghost.isInReach) emit(game, 'toast', { text: 'Xa quá! Lại gần hơn để xây.' });
    return false;
  }
  takeFromSlot(game.inventory, game.player.selectedSlot, 1);
  const structure = addStructure(game, ghost.structureType, ghost.tileX, ghost.tileY);
  emit(game, 'particles', { preset: 'buildDust', x: structure.x, y: structure.centerY });
  emit(game, 'sound', { name: 'place' });
  return true;
}

// ---------- Hư hỏng & sửa chữa ----------

export function damageStructure(game, structure, amount) {
  structure.health -= amount;
  structure.hitTimer = STRUCTURE_HIT_SHAKE_SECONDS;
  emit(game, 'particles', { preset: 'woodChips', x: structure.x, y: structure.centerY });
  emit(game, 'sound', { name: 'structureHit', x: structure.x, y: structure.centerY });
  if (structure.health > 0) {
    markFlowFieldDirty(game.flowField); // tường yếu đi → zombie có thể đổi ý chọn chỗ đập
    return;
  }
  removeStructure(game, structure);
  emit(game, 'particles', { preset: 'buildDust', x: structure.x, y: structure.centerY });
  emit(game, 'sound', { name: 'structureBreak', x: structure.x, y: structure.centerY });
}

export function isDamaged(structure) {
  return structure.health < structure.maxHealth;
}

export function canAffordRepair(game) {
  return countItem(game.inventory, 'wood') >= BUILD.repairWoodCost;
}

export function repairStructure(game, structure) {
  if (!canAffordRepair(game)) {
    emit(game, 'toast', { text: `Cần ${BUILD.repairWoodCost} gỗ để sửa.` });
    return false;
  }
  removeItem(game.inventory, 'wood', BUILD.repairWoodCost);
  structure.health = Math.min(structure.maxHealth, structure.health + BUILD.repairHealthPerUse);
  emit(game, 'particles', { preset: 'buildDust', x: structure.x, y: structure.centerY });
  emit(game, 'sound', { name: 'repair' });
  return true;
}

/** Công trình gần (x, y) nhất trong bán kính range thoả điều kiện, hoặc null. */
export function findNearestStructure(game, x, y, range, matches) {
  let nearest = null;
  let nearestDistance = range;
  for (const structure of game.structures) {
    const distance = Math.hypot(structure.x - x, structure.centerY - y);
    if (distance <= nearestDistance && matches(structure)) {
      nearest = structure;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** Đồng hồ rung khi bị đập và khói đống lửa. */
export function updateStructureTimers(game, deltaSeconds) {
  for (const structure of game.structures) {
    structure.hitTimer = Math.max(0, structure.hitTimer - deltaSeconds);
    structure.trapCooldown = Math.max(0, structure.trapCooldown - deltaSeconds);
    if (structure.structureType === 'campfire') emitCampfireSmoke(game, structure, deltaSeconds);
  }
}

function emitCampfireSmoke(game, campfire, deltaSeconds) {
  campfire.smokeTimer -= deltaSeconds;
  if (campfire.smokeTimer > 0) return;
  campfire.smokeTimer = CAMPFIRE_SMOKE_INTERVAL_SECONDS;
  emit(game, 'particles', { preset: 'smoke', x: campfire.x, y: campfire.centerY - CAMPFIRE_SMOKE_HEIGHT });
}
