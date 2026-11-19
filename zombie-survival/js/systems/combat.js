// Chiến đấu: vung rìu/cuốc/tay (cận chiến), bắn súng và nạp đạn, đạn trúng sinh vật, bẫy cắn zombie,
// gây sát thương / đẩy lùi / hạ gục sinh vật, và người chơi bị đánh.
// "Sinh vật" (creature) là zombie hoặc thú: cùng có x, y, radius, health, knockback... nên dùng chung hàm.
// Liên quan: entities/bullet.js, entities/pickup.js (rơi đồ), systems/gathering.js (vung trúng cây/đá).

import { COMBAT, TOOLS, GUN, ZOMBIE_BEHAVIOR, STRUCTURES, ANIMALS, SURVIVAL, RENDER } from '../config.js';
import { getObjectAtTile, pixelToTile } from '../world/mapGen.js';
import { circleOverlapsSquare } from '../world/collision.js';
import { spawnBullet } from '../entities/bullet.js';
import { spawnDrops } from '../entities/pickup.js';
import { isHarvestable, hitResource } from './gathering.js';
import { damageStructure } from './building.js';
import { countItem, removeItem } from './inventory.js';
import { getHeldToolType, isHoldingGun } from './items.js';
import { spendStamina, wakeUp } from './survival.js';
import { angleDifference } from '../utils/math.js';
import { emit } from '../utils/events.js';

const DAMAGE_NUMBER_HEIGHT = 1.4; // số sát thương hiện cao hơn tâm sinh vật 1.4 lần bán kính
const MUZZLE_FLASH_SECONDS = 0.06;
const MUZZLE_OFFSET = 10; // đầu nòng cách mép thân (px)
const PLAYER_KNOCKBACK_RATIO = 0.6; // người chơi bị đẩy lùi nhẹ hơn sinh vật

// ---------- Sát thương ----------

function applyKnockback(entity, fromX, fromY, strength) {
  const offsetX = entity.x - fromX;
  const offsetY = entity.y - fromY;
  const distance = Math.hypot(offsetX, offsetY) || 1;
  entity.knockbackX = (offsetX / distance) * strength;
  entity.knockbackY = (offsetY / distance) * strength;
}

function killCreature(game, creature) {
  creature.isDead = true;
  if (creature.type === 'zombie') {
    game.zombiesKilled += 1;
    emit(game, 'particles', { preset: 'zombieVanish', x: creature.x, y: creature.y });
    emit(game, 'sound', { name: 'zombieDie', x: creature.x, y: creature.y });
    if (Math.random() < ZOMBIE_BEHAVIOR.ammoDropChance) {
      spawnDrops(game, [{ itemId: 'ammo', min: ZOMBIE_BEHAVIOR.ammoDropMin, max: ZOMBIE_BEHAVIOR.ammoDropMax }], creature.x, creature.y);
    }
    return;
  }
  spawnDrops(game, ANIMALS[creature.species].drops, creature.x, creature.y);
  emit(game, 'particles', { preset: 'animalPuff', x: creature.x, y: creature.y });
  emit(game, 'sound', { name: 'animalDie', x: creature.x, y: creature.y });
}

/** Gây sát thương cho zombie hoặc thú, từ hướng (fromX, fromY). */
export function damageCreature(game, creature, amount, fromX, fromY) {
  if (creature.isDead || creature.isFading) return;
  creature.health -= amount;
  creature.hurtTimer = COMBAT.hurtFlashSeconds;
  creature.healthBarTimer = RENDER.healthBarShowSeconds;
  creature.wasHurt = true; // thú đọc cờ này ở frame sau để phản ứng (chạy trốn / phản công)
  applyKnockback(creature, fromX, fromY, COMBAT.knockbackSpeed);

  const isZombie = creature.type === 'zombie';
  emit(game, 'damageNumber', { x: creature.x, y: creature.y - creature.radius * DAMAGE_NUMBER_HEIGHT, amount: -amount });
  emit(game, 'particles', { preset: isZombie ? 'zombiePuff' : 'animalPuff', x: creature.x, y: creature.y });
  emit(game, 'sound', { name: isZombie ? 'zombieHit' : 'animalHit', x: creature.x, y: creature.y });
  if (creature.health <= 0) killCreature(game, creature);
}

/** Người chơi bị đánh. Có khoảng miễn sát thương ngắn để không bị "rút máu" liên tục. */
export function damagePlayer(game, amount, fromX, fromY) {
  const player = game.player;
  if (player.isDead || player.invulnerableTimer > 0) return false;
  player.health -= amount;
  player.invulnerableTimer = SURVIVAL.hurtInvulnerableSeconds;
  applyKnockback(player, fromX, fromY, COMBAT.knockbackSpeed * PLAYER_KNOCKBACK_RATIO);
  if (player.isSleeping) wakeUp(game, 'Á! Bị tấn công!');
  emit(game, 'playerHurt', {});
  emit(game, 'shake', { strength: COMBAT.shakeOnPlayerHurt });
  emit(game, 'sound', { name: 'playerHurt' });
  emit(game, 'damageNumber', { x: player.x, y: player.y - player.radius * DAMAGE_NUMBER_HEIGHT, amount: -amount });
  return true;
}

// ---------- Cận chiến ----------

/** Mục tiêu có nằm trong hình quạt trước mặt người chơi không. */
function isInMeleeArc(player, target, targetRadius) {
  const offsetX = target.x - player.x;
  const offsetY = target.y - player.y;
  const distance = Math.hypot(offsetX, offsetY);
  if (distance > player.radius + COMBAT.meleeReach + targetRadius) return false;
  if (distance < player.radius + targetRadius) return true; // dính sát người thì luôn trúng
  const facingAngle = Math.atan2(player.facingY, player.facingX);
  return Math.abs(angleDifference(facingAngle, Math.atan2(offsetY, offsetX))) <= COMBAT.meleeArcRadians / 2;
}

function hitCreaturesInArc(game, damage) {
  let hitCount = 0;
  for (const list of [game.zombies, game.animals]) {
    for (const creature of list) {
      if (creature.isDead || creature.isFading || !isInMeleeArc(game.player, creature, creature.radius)) continue;
      damageCreature(game, creature, damage, game.player.x, game.player.y);
      hitCount++;
    }
  }
  return hitCount;
}

/** Cây/đá gần nhất trong hình quạt (duyệt các ô quanh người chơi). */
function findResourceInArc(game) {
  const { world, player } = game;
  const searchTiles = Math.ceil((player.radius + COMBAT.meleeReach) / world.tileSize) + 1;
  const centerX = pixelToTile(world, player.x);
  const centerY = pixelToTile(world, player.y);
  let nearest = null;
  let nearestDistance = Infinity;
  for (let tileY = centerY - searchTiles; tileY <= centerY + searchTiles; tileY++) {
    for (let tileX = centerX - searchTiles; tileX <= centerX + searchTiles; tileX++) {
      const object = getObjectAtTile(world, tileX, tileY);
      if (!object || !isHarvestable(object) || !isInMeleeArc(player, object, object.collisionRadius)) continue;
      const distance = Math.hypot(object.x - player.x, object.y - player.y);
      if (distance < nearestDistance) {
        nearest = object;
        nearestDistance = distance;
      }
    }
  }
  return nearest;
}

function beginSwing(game) {
  const player = game.player;
  player.meleeCooldown = COMBAT.meleeCooldownSeconds;
  player.swingTimer = COMBAT.meleeSwingSeconds;
  spendStamina(player, SURVIVAL.meleeStaminaCost);
  emit(game, 'sound', { name: 'swing' });
}

/** Vung công cụ đang cầm: ưu tiên trúng sinh vật, không có thì trúng cây/đá trước mặt. */
export function meleeSwing(game) {
  if (game.player.meleeCooldown > 0) return;
  beginSwing(game);
  const toolType = getHeldToolType(game);
  if (hitCreaturesInArc(game, TOOLS[toolType].creatureDamage) > 0) return;
  const resource = findResourceInArc(game);
  if (resource) hitResource(game, resource, toolType);
}

/** Quay mặt về phía cây/đá rồi vung (dùng cho nút Tương tác). */
export function swingAtResource(game, resource) {
  const player = game.player;
  if (player.meleeCooldown > 0) return;
  const distance = Math.hypot(resource.x - player.x, resource.y - player.y) || 1;
  player.facingX = (resource.x - player.x) / distance;
  player.facingY = (resource.y - player.y) / distance;
  beginSwing(game);
  hitResource(game, resource, getHeldToolType(game));
}

// ---------- Súng ----------

export function startReload(game) {
  const player = game.player;
  if (!isHoldingGun(game) || player.reloadTimer > 0 || player.gunMagazine >= GUN.magazineSize) return;
  if (countItem(game.inventory, 'ammo') === 0) {
    emit(game, 'toast', { text: 'Hết đạn! Chế tạo thêm đạn nhé.' });
    emit(game, 'sound', { name: 'error' });
    return;
  }
  player.reloadTimer = GUN.reloadSeconds;
  emit(game, 'sound', { name: 'reload' });
}

function finishReload(game) {
  const player = game.player;
  const taken = removeItem(game.inventory, 'ammo', GUN.magazineSize - player.gunMagazine);
  player.gunMagazine += taken;
  emit(game, 'sound', { name: 'reloadDone' });
}

/** Đếm thời gian nạp đạn; đổi sang món khác giữa chừng thì huỷ. */
export function updateReload(game, deltaSeconds) {
  const player = game.player;
  if (player.reloadTimer <= 0) return;
  if (!isHoldingGun(game)) {
    player.reloadTimer = 0;
    return;
  }
  player.reloadTimer -= deltaSeconds;
  if (player.reloadTimer <= 0) finishReload(game);
}

export function fireGun(game) {
  const player = game.player;
  if (player.gunCooldown > 0 || player.reloadTimer > 0) return;
  if (player.gunMagazine <= 0) {
    player.gunCooldown = GUN.fireIntervalSeconds;
    startReload(game);
    return;
  }
  player.gunMagazine -= 1;
  player.gunCooldown = GUN.fireIntervalSeconds;
  player.muzzleTimer = MUZZLE_FLASH_SECONDS;

  const angle = Math.atan2(player.facingY, player.facingX) + (Math.random() * 2 - 1) * GUN.spreadRadians;
  const muzzleDistance = player.radius + MUZZLE_OFFSET;
  spawnBullet(game, player.x + player.facingX * muzzleDistance, player.y + player.facingY * muzzleDistance, angle);
  emit(game, 'sound', { name: 'shoot' });
  emit(game, 'shake', { strength: COMBAT.shakeOnShoot });
  if (player.gunMagazine === 0) startReload(game);
}

/** Đạn trúng zombie/thú: gây sát thương rồi biến mất (mỗi viên trúng một con). */
export function resolveBulletHits(game) {
  for (const bullet of game.bullets) {
    if (!bullet.isActive) continue;
    for (const list of [game.zombies, game.animals]) {
      const target = list.find(
        (creature) =>
          !creature.isDead &&
          !creature.isFading &&
          Math.hypot(creature.x - bullet.x, creature.y - bullet.y) < creature.radius + bullet.radius,
      );
      if (!target) continue;
      damageCreature(game, target, GUN.damage, bullet.previousX, bullet.previousY);
      bullet.isActive = false;
      break;
    }
  }
}

// ---------- Bẫy ----------

/** Bẫy cắn sinh vật đầu tiên dẫm lên, rồi nghỉ một chút; mỗi lần cắn bẫy mòn đi. */
export function updateTraps(game) {
  const size = game.world.tileSize;
  for (const trap of game.structures) {
    if (trap.structureType !== 'trap' || trap.trapCooldown > 0) continue;
    const isOnTrap = (creature) =>
      !creature.isDead && !creature.isFading && circleOverlapsSquare(creature, trap.tileX * size, trap.tileY * size, size);
    const victim = game.zombies.find(isOnTrap) ?? game.animals.find(isOnTrap);
    if (!victim) continue;

    const settings = STRUCTURES.trap;
    damageCreature(game, victim, settings.trapDamage, trap.x, trap.centerY);
    trap.trapCooldown = settings.trapCooldownSeconds;
    emit(game, 'sound', { name: 'trap', x: trap.x, y: trap.centerY });
    damageStructure(game, trap, settings.trapWearPerHit);
  }
}
