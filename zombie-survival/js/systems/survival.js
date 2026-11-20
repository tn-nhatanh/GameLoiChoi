// Sinh tồn: máu, đói, thể lực, ăn uống, sưởi ấm bên đống lửa, ngủ trên giường, chết và hồi sinh.
// Đói thì mất máu dần; no thì máu tự hồi (nhanh hơn khi ngồi cạnh lửa hoặc đang ngủ). Đêm lạnh làm đói nhanh hơn.
// Dùng SURVIVAL/ITEMS/STRUCTURES trong config.js; được gọi từ main.js và interaction.js.

import { SURVIVAL, ITEMS, STRUCTURES, PLAYER } from '../config.js';
import { isNight } from './dayNight.js';
import { takeFromSlot, getSlot } from './inventory.js';
import { removeStructure } from './building.js';
import { giveItemToPlayer } from '../entities/pickup.js';
import { clamp } from '../utils/math.js';
import { emit } from '../utils/events.js';

const HEAL_NUMBER_OFFSET_Y = 30; // số hồi máu hiện trên đầu nhân vật

export function isNearWarmCampfire(game) {
  const { player } = game;
  return game.structures.some(
    (structure) =>
      structure.structureType === 'campfire' &&
      Math.hypot(structure.x - player.x, structure.centerY - player.y) <= STRUCTURES.campfire.warmRadius,
  );
}

function drainHunger(game, deltaSeconds) {
  const player = game.player;
  const multiplier = player.isCold ? SURVIVAL.coldHungerMultiplier : 1;
  player.hunger = Math.max(0, player.hunger - SURVIVAL.hungerDrainPerSecond * multiplier * deltaSeconds);
}

function starve(game, deltaSeconds) {
  const player = game.player;
  player.health -= SURVIVAL.starvingDamagePerSecond * deltaSeconds;
  player.starvingToastTimer -= deltaSeconds;
  if (player.starvingToastTimer <= 0) {
    player.starvingToastTimer = SURVIVAL.starvingToastIntervalSeconds;
    emit(game, 'toast', { text: 'Bụng đói meo! Mau ăn gì đó.' });
  }
}

function regenerateHealth(player, deltaSeconds) {
  if (player.hunger / SURVIVAL.maxHunger < SURVIVAL.wellFedRatio) return;
  let rate = SURVIVAL.healthRegenPerSecond;
  if (player.isWarm) rate = SURVIVAL.warmHealthRegenPerSecond;
  if (player.isSleeping) rate = SURVIVAL.sleepingHealthRegenPerSecond;
  player.health = Math.min(SURVIVAL.maxHealth, player.health + rate * deltaSeconds);
}

function regenerateStamina(player, deltaSeconds) {
  player.staminaRegenDelay -= deltaSeconds;
  if (player.isSprinting || player.staminaRegenDelay > 0) return;
  player.stamina = Math.min(SURVIVAL.maxStamina, player.stamina + SURVIVAL.staminaRegenPerSecond * deltaSeconds);
}

export function spendStamina(player, amount) {
  player.stamina = Math.max(0, player.stamina - amount);
  player.staminaRegenDelay = SURVIVAL.staminaRegenDelaySeconds;
}

export function updateSurvival(game, deltaSeconds) {
  const player = game.player;
  if (player.isDead) return;
  player.isWarm = isNearWarmCampfire(game);
  player.isCold = isNight(game.dayNight) && !player.isWarm;
  drainHunger(game, deltaSeconds);
  if (player.hunger <= 0) starve(game, deltaSeconds);
  else regenerateHealth(player, deltaSeconds);
  regenerateStamina(player, deltaSeconds);
}

// ---------- Ăn uống ----------

/** Ăn một món ở ô slotIndex. Thịt sống hồi ít và làm đau bụng một chút. */
export function eatFromSlot(game, slotIndex) {
  const player = game.player;
  const slot = getSlot(game.inventory, slotIndex);
  const food = slot ? ITEMS[slot.itemId].food : null;
  if (!food || player.eatCooldown > 0) return false;

  const { itemId } = takeFromSlot(game.inventory, slotIndex, 1);
  const returnedItemId = ITEMS[itemId].returnsItem; // uống sữa xong còn lại cái xô
  if (returnedItemId) giveItemToPlayer(game, returnedItemId, 1);
  player.eatCooldown = PLAYER.eatCooldownSeconds;
  player.hunger = clamp(player.hunger + food.hunger, 0, SURVIVAL.maxHunger);
  player.health = clamp(player.health + food.health, 0, SURVIVAL.maxHealth);
  emit(game, 'sound', { name: 'eat' });
  emit(game, 'damageNumber', {
    x: player.x,
    y: player.y - HEAL_NUMBER_OFFSET_Y,
    amount: food.health,
    isHeal: food.health >= 0,
  });
  if (food.health > 0) emit(game, 'particles', { preset: 'heal', x: player.x, y: player.y });
  if (food.health < 0) emit(game, 'toast', { text: 'Ăn sống hơi đau bụng… Nướng lên ăn ngon hơn!' });
  return true;
}

// ---------- Ngủ ----------

export function hasZombieNearby(game, radius) {
  const { player } = game;
  return game.zombies.some((zombie) => !zombie.isFading && Math.hypot(zombie.x - player.x, zombie.y - player.y) < radius);
}

export function canSleep(game) {
  return isNight(game.dayNight) && !hasZombieNearby(game, SURVIVAL.sleepSafeRadius);
}

export function startSleeping(game, bed) {
  const player = game.player;
  player.isSleeping = true;
  player.x = bed.x;
  player.y = bed.centerY;
  game.respawnBed = bed;
  emit(game, 'sound', { name: 'sleep' });
  emit(game, 'toast', { text: 'Zzz… Thời gian trôi nhanh hơn. Di chuyển để thức dậy.' });
}

export function wakeUp(game, message) {
  game.player.isSleeping = false;
  if (message) emit(game, 'toast', { text: message });
}

/** Tự thức dậy khi trời sáng, có zombie lại gần, hoặc người chơi muốn đi. */
export function updateSleep(game, wantsToMove) {
  if (!game.player.isSleeping) return;
  if (!isNight(game.dayNight)) wakeUp(game, 'Chào buổi sáng!');
  else if (hasZombieNearby(game, SURVIVAL.sleepSafeRadius)) wakeUp(game, 'Có zombie! Dậy mau!');
  else if (wantsToMove) wakeUp(game, null);
}

// ---------- Chết & hồi sinh ----------

/** Giường dùng để hồi sinh: giường đã chọn (nếu còn), không thì giường bất kỳ. */
function findRespawnBed(game) {
  if (game.respawnBed && game.structures.includes(game.respawnBed)) return game.respawnBed;
  return game.structures.find((structure) => structure.structureType === 'bed') ?? null;
}

/**
 * Gọi khi máu về 0. Có giường thì hồi sinh tại đó (giường gãy, chỉ cứu được một lần).
 * Trả về 'respawned' hoặc 'gameOver'.
 */
export function handlePlayerDeath(game) {
  const player = game.player;
  const bed = findRespawnBed(game);
  if (!bed) {
    player.isDead = true;
    emit(game, 'sound', { name: 'gameOver' });
    return 'gameOver';
  }
  removeStructure(game, bed);
  game.respawnBed = null;
  player.health = SURVIVAL.maxHealth * SURVIVAL.respawnHealthRatio;
  player.x = bed.x;
  player.y = bed.centerY;
  player.isSleeping = false;
  player.invulnerableTimer = SURVIVAL.hurtInvulnerableSeconds;
  emit(game, 'sound', { name: 'respawn' });
  emit(game, 'toast', { text: 'Chiếc giường đã cứu bạn! (giường bị gãy rồi)' });
  return 'respawned';
}
