// Điều phối hai nút hành động của người chơi:
//  - Tương tác (E / nút "Dùng"): tuỳ món đang cầm và thứ ở gần — đặt công trình, cho thú ăn, xén lông, vắt sữa,
//    cày đất, gieo hạt, ngủ, nướng, thu hoạch, hái, sửa, chặt cây, cắt cỏ, mở bàn chế tạo, ăn.
//  - Hành động chính (chuột trái / nút tròn lớn trên điện thoại): làm việc của món đang cầm, không có thì vung tay/công cụ.
// findInteraction() cũng được HUD dùng để hiện gợi ý "E: Hái quả". Gọi các system khác để làm việc thật.

import { PLAYER, ITEMS, INPUT, ANIMALS } from '../config.js';
import { getObjectAtTile, pixelToTile } from '../world/mapGen.js';
import { isNight } from './dayNight.js';
import { isHarvestable, isPickableFood, isCuttableGrass, getPickLabel, pickObject } from './gathering.js';
import { placeHeldStructure, findNearestStructure, isDamaged, canAffordRepair, repairStructure } from './building.js';
import { meleeSwing, swingAtResource, fireGun } from './combat.js';
import { canSleep, startSleeping, eatFromSlot } from './survival.js';
import { findSlotIndex, takeFromSlot } from './inventory.js';
import { tillTarget, plantTarget, findNearestRipePlot, harvestPlot } from './farming.js';
import { findFeedableAnimal, findShearableSheep, findMilkableCow, feedAnimal, shearSheep, milkCow } from './husbandry.js';
import { giveItemToPlayer } from '../entities/pickup.js';
import { getSelectedItemId, getHeldToolType, isFood, isHoldingGun, getHeldStructureType } from './items.js';
import { emit } from '../utils/events.js';

export const INTERACTION = Object.freeze({
  NONE: 'none',
  PLACE: 'place',
  FEED: 'feed',
  SHEAR: 'shear',
  MILK: 'milk',
  TILL: 'till',
  PLANT: 'plant',
  SLEEP: 'sleep',
  SET_SPAWN: 'setSpawn',
  COOK: 'cook',
  HARVEST_CROP: 'harvestCrop',
  PICK: 'pick',
  REPAIR: 'repair',
  HARVEST: 'harvest',
  CUT_GRASS: 'cutGrass',
  OPEN_CRAFTING: 'openCrafting',
  EAT: 'eat',
});

const ANIMAL_NAMES = { chicken: 'gà', sheep: 'cừu', cow: 'bò' };
const scratchInteraction = { kind: INTERACTION.NONE, target: null, label: '' };

function setInteraction(out, kind, target, label) {
  out.kind = kind;
  out.target = target;
  out.label = label;
  return out;
}

/** Đồ vật trên map gần người chơi nhất (trong tầm tay) thoả điều kiện, hoặc null. */
function findNearestObject(game, matches) {
  const { world, player } = game;
  const searchTiles = Math.ceil(PLAYER.interactRange / world.tileSize);
  const centerX = pixelToTile(world, player.x);
  const centerY = pixelToTile(world, player.y);
  let nearest = null;
  let nearestDistance = PLAYER.interactRange;
  for (let tileY = centerY - searchTiles; tileY <= centerY + searchTiles; tileY++) {
    for (let tileX = centerX - searchTiles; tileX <= centerX + searchTiles; tileX++) {
      const object = getObjectAtTile(world, tileX, tileY);
      if (!object || !matches(object)) continue;
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

/** Ô túi đầu tiên chứa món nướng được (thịt sống, khoai, trứng), hoặc -1. */
function findCookableSlot(game) {
  return findSlotIndex(game.inventory, (slot) => Boolean(ITEMS[slot.itemId].cooksInto));
}

// ---------- Tìm việc cần làm ----------

/** Việc gắn với món đang cầm: đặt công trình, cho ăn, xén lông, vắt sữa, cày, gieo. */
function findItemAction(game, out) {
  const heldStructure = getHeldStructureType(game);
  if (heldStructure) return setInteraction(out, INTERACTION.PLACE, null, `Đặt ${ITEMS[heldStructure].name}`);

  const hungryAnimal = findFeedableAnimal(game, PLAYER.interactRange);
  if (hungryAnimal) return setInteraction(out, INTERACTION.FEED, hungryAnimal, `Cho ${ANIMAL_NAMES[hungryAnimal.species]} ăn`);

  const toolType = getHeldToolType(game);
  const sheep = toolType === 'shears' && findShearableSheep(game, PLAYER.interactRange);
  if (sheep) return setInteraction(out, INTERACTION.SHEAR, sheep, 'Xén lông cừu');
  const cow = getSelectedItemId(game) === 'bucket' && findMilkableCow(game, PLAYER.interactRange);
  if (cow) return setInteraction(out, INTERACTION.MILK, cow, 'Vắt sữa bò');

  const farmAction = game.farmTarget.isActive ? game.farmTarget.action : null;
  if (farmAction === 'till') return setInteraction(out, INTERACTION.TILL, null, 'Cày đất');
  if (farmAction === 'plant') return setInteraction(out, INTERACTION.PLANT, null, `Gieo ${ITEMS[getSelectedItemId(game)].name}`);
  return setInteraction(out, INTERACTION.NONE, null, '');
}

/** Việc với thứ ở gần: giường, đống lửa, ruộng chín, cây cỏ, công trình hư, bàn chế tạo. */
function findWorldAction(game, out) {
  const bed = findNearbyStructure(game, (structure) => structure.structureType === 'bed');
  if (bed && isNight(game.dayNight)) return setInteraction(out, INTERACTION.SLEEP, bed, 'Ngủ');

  const cookableSlot = findCookableSlot(game);
  const campfire = cookableSlot !== -1 && findNearbyStructure(game, (structure) => structure.structureType === 'campfire');
  if (campfire) {
    const itemName = ITEMS[game.inventory.slots[cookableSlot].itemId].name;
    return setInteraction(out, INTERACTION.COOK, campfire, `Nướng ${itemName}`);
  }

  const ripePlot = findNearestRipePlot(game, game.player.x, game.player.y, PLAYER.interactRange);
  if (ripePlot) return setInteraction(out, INTERACTION.HARVEST_CROP, ripePlot, 'Thu hoạch');

  const food = findNearestObject(game, isPickableFood);
  if (food) return setInteraction(out, INTERACTION.PICK, food, getPickLabel(food));

  const damaged = canAffordRepair(game) && findNearbyStructure(game, isDamaged);
  if (damaged) return setInteraction(out, INTERACTION.REPAIR, damaged, `Sửa ${ITEMS[damaged.structureType].name}`);

  const resource = findNearestObject(game, isHarvestable);
  if (resource) return setInteraction(out, INTERACTION.HARVEST, resource, resource.type === 'tree' ? 'Chặt cây' : 'Đập đá');

  const grass = findNearestObject(game, isCuttableGrass);
  if (grass) return setInteraction(out, INTERACTION.CUT_GRASS, grass, 'Cắt cỏ');

  const workbench = findNearbyStructure(game, (structure) => structure.structureType === 'workbench');
  if (workbench) return setInteraction(out, INTERACTION.OPEN_CRAFTING, workbench, 'Dùng bàn chế tạo');
  if (bed) return setInteraction(out, INTERACTION.SET_SPAWN, bed, 'Đặt điểm hồi sinh');
  return setInteraction(out, INTERACTION.NONE, null, '');
}

/**
 * Xác định nút Tương tác lúc này sẽ làm gì, theo thứ tự ưu tiên.
 * Ghi kết quả vào `out` ({ kind, target, label }) để dùng lại object mỗi frame.
 */
export function findInteraction(game, out) {
  if (findItemAction(game, out).kind !== INTERACTION.NONE) return out;
  if (findWorldAction(game, out).kind !== INTERACTION.NONE) return out;
  const selectedItemId = getSelectedItemId(game);
  if (isFood(selectedItemId)) return setInteraction(out, INTERACTION.EAT, null, `Ăn ${ITEMS[selectedItemId].name}`);
  return out;
}

// ---------- Thực hiện ----------

function cookFood(game) {
  const slotIndex = findCookableSlot(game);
  if (slotIndex === -1) return;
  const { itemId } = takeFromSlot(game.inventory, slotIndex, 1);
  giveItemToPlayer(game, ITEMS[itemId].cooksInto, 1);
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

const PERFORMERS = {
  [INTERACTION.PLACE]: (game) => placeHeldStructure(game),
  [INTERACTION.FEED]: (game, target) => feedAnimal(game, target),
  [INTERACTION.SHEAR]: (game, target) => shearSheep(game, target),
  [INTERACTION.MILK]: (game, target) => milkCow(game, target),
  [INTERACTION.TILL]: (game) => tillTarget(game),
  [INTERACTION.PLANT]: (game) => plantTarget(game),
  [INTERACTION.SLEEP]: (game, target) => trySleep(game, target),
  [INTERACTION.SET_SPAWN]: (game, target) => setRespawnPoint(game, target),
  [INTERACTION.COOK]: (game) => cookFood(game),
  [INTERACTION.HARVEST_CROP]: (game, target) => harvestPlot(game, target),
  [INTERACTION.PICK]: (game, target) => pickObject(game, target),
  [INTERACTION.REPAIR]: (game, target) => repairStructure(game, target),
  [INTERACTION.HARVEST]: (game, target) => swingAtResource(game, target),
  [INTERACTION.CUT_GRASS]: (game, target) => pickObject(game, target),
  [INTERACTION.OPEN_CRAFTING]: (game) => emit(game, 'openCrafting', {}),
  [INTERACTION.EAT]: (game) => eatFromSlot(game, game.player.selectedSlot),
};

/** Thực hiện tương tác đã tìm được bằng findInteraction(). */
export function performInteraction(game, interaction) {
  PERFORMERS[interaction.kind]?.(game, interaction.target);
}

// ---------- Hành động chính & tự ngắm ----------

function isAutoAimTarget(creature) {
  return !creature.isDead && !creature.isFading && !(creature.type === 'animal' && ANIMALS[creature.species].isFarm);
}

/** Sinh vật gần nhất trong tầm: ưu tiên zombie, sau đó thú rừng (không nhắm vật nuôi của mình). */
function findNearestCreature(game, range) {
  const { player } = game;
  for (const list of [game.zombies, game.animals]) {
    let nearest = null;
    let nearestDistance = range;
    for (const creature of list) {
      if (!isAutoAimTarget(creature)) continue;
      const distance = Math.hypot(creature.x - player.x, creature.y - player.y) - creature.radius;
      if (distance < nearestDistance) {
        nearest = creature;
        nearestDistance = distance;
      }
    }
    if (nearest) return nearest;
  }
  return null;
}

/**
 * Điện thoại chỉ có một cần di chuyển nên không ngắm tay được: khi bấm nút hành động,
 * tự quay về zombie/thú gần nhất (súng tầm xa, cận chiến tầm gần); không có thì quay về cây/đá/cỏ gần nhất.
 */
function aimAtNearestTarget(game, controls) {
  const usingGun = isHoldingGun(game);
  const range = usingGun ? INPUT.autoAimGunRange : INPUT.autoAimMeleeRange;
  let target = findNearestCreature(game, range);
  if (!target && !usingGun) target = findNearestObject(game, (object) => isHarvestable(object) || isCuttableGrass(object));
  if (!target) return;
  const { player } = game;
  const distance = Math.hypot(target.x - player.x, target.y - player.y);
  if (distance < 1) return;
  controls.hasAim = true;
  controls.aimX = (target.x - player.x) / distance;
  controls.aimY = (target.y - player.y) / distance;
  player.facingX = controls.aimX;
  player.facingY = controls.aimY;
}

/** Món cầm trên tay không dùng để đánh (đồ ăn, công trình, hạt giống, xô): bấm là dùng, giữ không vung. */
function isGentleItem(itemId) {
  const info = itemId ? ITEMS[itemId] : null;
  return Boolean(info && (info.food || info.structure || info.seedOf || itemId === 'bucket'));
}

/**
 * Hành động chính khi đang giữ chuột trái / nút hành động.
 * controls.primaryHeld: đang giữ; controls.primaryPressed: vừa mới bấm (frame này);
 * controls.autoAim: điện thoại → tự quay về mục tiêu gần nhất trước khi bắn/vung.
 */
export function usePrimaryAction(game, controls) {
  if (!controls.primaryHeld) return;
  if (controls.primaryPressed && findItemAction(game, scratchInteraction).kind !== INTERACTION.NONE) {
    performInteraction(game, scratchInteraction);
    return;
  }
  const itemId = getSelectedItemId(game);
  if (isGentleItem(itemId) && !isHoldingGun(game)) {
    if (controls.primaryPressed && isFood(itemId)) eatFromSlot(game, game.player.selectedSlot);
    return;
  }
  if (controls.autoAim) aimAtNearestTarget(game, controls);
  if (isHoldingGun(game)) fireGun(game);
  else meleeSwing(game);
}

/** Chữ trên nút hành động chính (điện thoại): cho biết bấm vào sẽ làm gì. */
export function getPrimaryActionLabel(game) {
  if (findItemAction(game, scratchInteraction).kind !== INTERACTION.NONE) {
    return scratchInteraction.label.split(' ')[0];
  }
  const itemId = getSelectedItemId(game);
  if (isHoldingGun(game)) return 'Bắn';
  if (isFood(itemId)) return 'Ăn';
  if (isGentleItem(itemId)) return 'Cầm';
  return 'Đánh';
}
