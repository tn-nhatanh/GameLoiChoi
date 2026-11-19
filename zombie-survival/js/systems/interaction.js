// Điều phối hai nút hành động của người chơi:
//  - Hành động chính (chuột trái / cần ngắm): tuỳ món đang cầm — bắn súng, vung rìu/cuốc/tay, ăn, đặt công trình.
//  - Tương tác (E / nút "Dùng"): tuỳ thứ ở gần — đặt công trình, ngủ, nướng thịt, hái quả, sửa, chặt cây, ăn.
// findInteraction() cũng được HUD dùng để hiện gợi ý "E: Hái quả". Gọi các system khác để làm việc thật.

import { PLAYER, ITEMS } from '../config.js';
import { getObjectAtTile, pixelToTile } from '../world/mapGen.js';
import { isNight } from './dayNight.js';
import { hasBerries, isHarvestable, pickBerries } from './gathering.js';
import { placeHeldStructure, findNearestStructure, isDamaged, canAffordRepair, repairStructure } from './building.js';
import { meleeSwing, swingAtResource, fireGun } from './combat.js';
import { canSleep, startSleeping, eatFromSlot } from './survival.js';
import { countItem, removeItem } from './inventory.js';
import { giveItemToPlayer } from '../entities/pickup.js';
import { getSelectedItemId, isFood, isHoldingGun, getHeldStructureType } from './items.js';
import { emit } from '../utils/events.js';

export const INTERACTION = Object.freeze({
  NONE: 'none',
  PLACE: 'place',
  SLEEP: 'sleep',
  SET_SPAWN: 'setSpawn',
  COOK: 'cook',
  PICK_BERRIES: 'pickBerries',
  REPAIR: 'repair',
  HARVEST: 'harvest',
  EAT: 'eat',
});

function setInteraction(out, kind, target, label) {
  out.kind = kind;
  out.target = target;
  out.label = label;
  return out;
}

/** Bụi còn quả hoặc cây/đá còn khai thác được, gần người chơi nhất trong tầm tay. */
function findNearestResource(game) {
  const { world, player } = game;
  const searchTiles = Math.ceil(PLAYER.interactRange / world.tileSize);
  const centerX = pixelToTile(world, player.x);
  const centerY = pixelToTile(world, player.y);
  let nearest = null;
  let nearestDistance = PLAYER.interactRange;
  for (let tileY = centerY - searchTiles; tileY <= centerY + searchTiles; tileY++) {
    for (let tileX = centerX - searchTiles; tileX <= centerX + searchTiles; tileX++) {
      const object = getObjectAtTile(world, tileX, tileY);
      if (!object || !(hasBerries(object) || isHarvestable(object))) continue;
      const distance = Math.hypot(object.x - player.x, object.y - player.y);
      if (distance <= nearestDistance) {
        nearest = object;
        nearestDistance = distance;
      }
    }
  }
  return nearest;
}

function findNearbyStructure(game, matches) {
  return findNearestStructure(game, game.player.x, game.player.y, PLAYER.interactRange, matches);
}

/**
 * Xác định nút Tương tác lúc này sẽ làm gì, theo thứ tự ưu tiên.
 * Ghi kết quả vào `out` ({ kind, target, label }) để dùng lại object mỗi frame.
 */
export function findInteraction(game, out) {
  const heldStructure = getHeldStructureType(game);
  if (heldStructure) return setInteraction(out, INTERACTION.PLACE, null, `Đặt ${ITEMS[heldStructure].name}`);

  const bed = findNearbyStructure(game, (structure) => structure.structureType === 'bed');
  if (bed && isNight(game.dayNight)) return setInteraction(out, INTERACTION.SLEEP, bed, 'Ngủ');

  const hasRawMeat = countItem(game.inventory, 'rawMeat') > 0;
  const campfire = hasRawMeat && findNearbyStructure(game, (structure) => structure.structureType === 'campfire');
  if (campfire) return setInteraction(out, INTERACTION.COOK, campfire, 'Nướng thịt');

  const resource = findNearestResource(game);
  if (resource && hasBerries(resource)) return setInteraction(out, INTERACTION.PICK_BERRIES, resource, 'Hái quả');

  const damaged = canAffordRepair(game) && findNearbyStructure(game, isDamaged);
  if (damaged) {
    return setInteraction(out, INTERACTION.REPAIR, damaged, `Sửa ${ITEMS[damaged.structureType].name}`);
  }

  if (resource) {
    return setInteraction(out, INTERACTION.HARVEST, resource, resource.type === 'tree' ? 'Chặt cây' : 'Đập đá');
  }
  if (bed) return setInteraction(out, INTERACTION.SET_SPAWN, bed, 'Đặt điểm hồi sinh');

  const selectedItemId = getSelectedItemId(game);
  if (isFood(selectedItemId)) return setInteraction(out, INTERACTION.EAT, null, `Ăn ${ITEMS[selectedItemId].name}`);
  return setInteraction(out, INTERACTION.NONE, null, '');
}

function cookMeat(game) {
  removeItem(game.inventory, 'rawMeat', 1);
  giveItemToPlayer(game, ITEMS.rawMeat.cooksInto, 1);
  emit(game, 'sound', { name: 'cook' });
  emit(game, 'particles', { preset: 'spark', x: game.player.x, y: game.player.y });
}

function trySleep(game, bed) {
  if (canSleep(game)) startSleeping(game, bed);
  else emit(game, 'toast', { text: 'Zombie ở gần quá, không ngủ được!' });
}

function setRespawnPoint(game, bed) {
  game.respawnBed = bed;
  emit(game, 'sound', { name: 'pick' });
  emit(game, 'toast', { text: 'Đã đặt điểm hồi sinh ở giường này.' });
}

/** Thực hiện tương tác đã tìm được bằng findInteraction(). */
export function performInteraction(game, interaction) {
  const { kind, target } = interaction;
  if (kind === INTERACTION.PLACE) placeHeldStructure(game);
  else if (kind === INTERACTION.SLEEP) trySleep(game, target);
  else if (kind === INTERACTION.SET_SPAWN) setRespawnPoint(game, target);
  else if (kind === INTERACTION.COOK) cookMeat(game);
  else if (kind === INTERACTION.PICK_BERRIES) pickBerries(game, target);
  else if (kind === INTERACTION.REPAIR) repairStructure(game, target);
  else if (kind === INTERACTION.HARVEST) swingAtResource(game, target);
  else if (kind === INTERACTION.EAT) eatFromSlot(game, game.player.selectedSlot);
}

/**
 * Hành động chính khi đang giữ chuột trái / kéo cần ngắm.
 * controls.primaryHeld: đang giữ; controls.primaryPressed: vừa mới bấm (frame này).
 */
export function usePrimaryAction(game, controls) {
  if (!controls.primaryHeld) return;
  if (isHoldingGun(game)) {
    fireGun(game);
    return;
  }
  if (getHeldStructureType(game)) {
    if (controls.primaryPressed) placeHeldStructure(game);
    return;
  }
  if (isFood(getSelectedItemId(game))) {
    if (controls.primaryPressed) eatFromSlot(game, game.player.selectedSlot);
    return;
  }
  meleeSwing(game);
}
