// Zombie: sinh ra ngoài màn hình vào ban đêm, đi theo "bản đồ khoảng cách" (systems/pathfinding.js) tới người chơi,
// đập công trình chắn đường, cắn người chơi, và tan biến dần khi trời sáng.
// Ba loại (thường, chạy nhanh, to khoẻ) có chỉ số trong ZOMBIES (config.js). Vẽ trong render/sprites.js.

import { ZOMBIES, ZOMBIE_BEHAVIOR, WAVES, PATHFINDING, COMBAT } from '../config.js';
import { isOpenGround, getStructureAtTile, pixelToTile } from '../world/mapGen.js';
import {
  moveWithCollision,
  pushOutOfWorld,
  doesStructureBlock,
  pushOutOfCircle,
  circleOverlapsSquare,
} from '../world/collision.js';
import { findNextStep } from '../systems/pathfinding.js';
import { damagePlayer } from '../systems/combat.js';
import { damageStructure } from '../systems/building.js';
import { randomRange, removeWhere } from '../utils/math.js';
import { emit } from '../utils/events.js';

const GROAN_INTERVAL = { min: 4, max: 10 }; // giây giữa hai tiếng "ư ử" (chỉ để vui tai)
const SPAWN_FADE_IN_SECONDS = 0.8;

export function createZombie(variant, x, y, nightNumber) {
  const stats = ZOMBIES[variant];
  const healthScale = 1 + ZOMBIE_BEHAVIOR.healthGrowthPerNight * (nightNumber - 1);
  return {
    type: 'zombie',
    variant,
    x,
    y,
    radius: stats.radius,
    health: stats.maxHealth * healthScale,
    maxHealth: stats.maxHealth * healthScale,
    speed: stats.speed,
    facingX: 0,
    facingY: 1,
    knockbackX: 0,
    knockbackY: 0,
    attackCooldown: 0,
    hurtTimer: 0,
    healthBarTimer: 0,
    wobblePhase: Math.random() * Math.PI * 2,
    groanTimer: randomRange(Math.random, GROAN_INTERVAL.min, GROAN_INTERVAL.max),
    alpha: 0, // hiện dần lúc mới xuất hiện
    isFading: false,
    isDead: false,
    canPassDoors: false,
  };
}

/** Tìm một ô đất trống trong vành khăn quanh người chơi (ngoài màn hình) để zombie xuất hiện. */
export function findSpawnSpotAround(game, minDistance, maxDistance, attempts) {
  const { world, player } = game;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = randomRange(Math.random, minDistance, maxDistance);
    const x = player.x + Math.cos(angle) * distance;
    const y = player.y + Math.sin(angle) * distance;
    const tileX = pixelToTile(world, x);
    const tileY = pixelToTile(world, y);
    if (isOpenGround(world, tileX, tileY) && !getStructureAtTile(world, tileX, tileY)) {
      return { x: (tileX + 0.5) * world.tileSize, y: (tileY + 0.5) * world.tileSize };
    }
  }
  return null;
}

export function spawnZombieNearPlayer(game, variant, nightNumber) {
  const spot = findSpawnSpotAround(game, WAVES.spawnMinDistance, WAVES.spawnMaxDistance, WAVES.spawnAttempts);
  if (!spot) return false;
  game.zombies.push(createZombie(variant, spot.x, spot.y, nightNumber));
  return true;
}

// ---------- Di chuyển ----------

function walkToward(game, zombie, targetX, targetY, deltaSeconds) {
  const offsetX = targetX - zombie.x;
  const offsetY = targetY - zombie.y;
  const distance = Math.hypot(offsetX, offsetY);
  if (distance < 1) return;
  zombie.facingX = offsetX / distance;
  zombie.facingY = offsetY / distance;
  const step = Math.min(distance, zombie.speed * deltaSeconds);
  moveWithCollision(game.world, zombie, zombie.facingX * step, zombie.facingY * step);
}

function applyKnockbackMotion(game, zombie, deltaSeconds) {
  if (zombie.knockbackX === 0 && zombie.knockbackY === 0) return;
  moveWithCollision(game.world, zombie, zombie.knockbackX * deltaSeconds, zombie.knockbackY * deltaSeconds);
  const decay = Math.exp(-COMBAT.knockbackDecay * deltaSeconds);
  zombie.knockbackX *= decay;
  zombie.knockbackY *= decay;
  if (Math.hypot(zombie.knockbackX, zombie.knockbackY) < 1) {
    zombie.knockbackX = 0;
    zombie.knockbackY = 0;
  }
}

// ---------- Tấn công ----------

function tryAttack(zombie, attack) {
  if (zombie.attackCooldown > 0) return;
  zombie.attackCooldown = ZOMBIES[zombie.variant].attackCooldownSeconds;
  attack();
}

function isTouchingPlayer(zombie, player) {
  return Math.hypot(player.x - zombie.x, player.y - zombie.y) <= zombie.radius + player.radius + ZOMBIE_BEHAVIOR.attackGap;
}

function isTouchingTile(game, zombie, tileX, tileY) {
  const size = game.world.tileSize;
  const reachCircle = { x: zombie.x, y: zombie.y, radius: zombie.radius + ZOMBIE_BEHAVIOR.attackGap };
  return circleOverlapsSquare(reachCircle, tileX * size, tileY * size, size);
}

/**
 * Bộ não zombie mỗi frame:
 * 1. Chạm người chơi → cắn.
 * 2. Ở gần → lao thẳng tới.
 * 3. Còn lại → hỏi bản đồ khoảng cách ô kế tiếp. Nếu ô đó là công trình chắn đường
 *    thì đi tới sát và đập; nếu không thì đi tới tâm ô đó.
 */
function thinkAndMove(game, zombie, deltaSeconds) {
  const { player, world } = game;
  if (!player.isDead && isTouchingPlayer(zombie, player)) {
    tryAttack(zombie, () => damagePlayer(game, ZOMBIES[zombie.variant].damage, zombie.x, zombie.y));
    return;
  }
  const distanceToPlayer = Math.hypot(player.x - zombie.x, player.y - zombie.y);
  const step =
    distanceToPlayer > PATHFINDING.directChaseDistance
      ? findNextStep(game.flowField, world, pixelToTile(world, zombie.x), pixelToTile(world, zombie.y), game.pathStep)
      : null;
  if (!step) {
    walkToward(game, zombie, player.x, player.y, deltaSeconds);
    return;
  }
  const structure = getStructureAtTile(world, step.tileX, step.tileY);
  if (structure && doesStructureBlock(structure, zombie) && isTouchingTile(game, zombie, step.tileX, step.tileY)) {
    tryAttack(zombie, () => damageStructure(game, structure, ZOMBIES[zombie.variant].structureDamage));
    return;
  }
  walkToward(game, zombie, (step.tileX + 0.5) * world.tileSize, (step.tileY + 0.5) * world.tileSize, deltaSeconds);
}

// ---------- Cập nhật ----------

function updateTimers(game, zombie, deltaSeconds) {
  zombie.attackCooldown -= deltaSeconds;
  zombie.hurtTimer = Math.max(0, zombie.hurtTimer - deltaSeconds);
  zombie.healthBarTimer = Math.max(0, zombie.healthBarTimer - deltaSeconds);
  zombie.wobblePhase += ZOMBIE_BEHAVIOR.wobbleSpeed * deltaSeconds;
  zombie.groanTimer -= deltaSeconds;
  if (zombie.groanTimer <= 0) {
    zombie.groanTimer = randomRange(Math.random, GROAN_INTERVAL.min, GROAN_INTERVAL.max);
    emit(game, 'sound', { name: 'zombieGroan', x: zombie.x, y: zombie.y });
  }
}

/** Trời sáng: mờ dần rồi tan thành bụi. */
function updateFading(game, zombie, deltaSeconds) {
  zombie.alpha -= deltaSeconds / ZOMBIE_BEHAVIOR.fadeSeconds;
  if (zombie.alpha > 0) return;
  zombie.isDead = true;
  emit(game, 'particles', { preset: 'zombieVanish', x: zombie.x, y: zombie.y });
}

/** Các zombie đẩy nhẹ nhau ra để không chồng lên thành một cục. */
function separateZombies(zombies, deltaSeconds) {
  const strength = ZOMBIE_BEHAVIOR.separationStrength * deltaSeconds;
  for (let first = 0; first < zombies.length; first++) {
    for (let second = first + 1; second < zombies.length; second++) {
      const a = zombies[first];
      const b = zombies[second];
      const offsetX = b.x - a.x;
      const offsetY = b.y - a.y;
      const distance = Math.hypot(offsetX, offsetY) || 1;
      const overlap = a.radius + b.radius - distance;
      if (overlap <= 0) continue;
      const push = Math.min(overlap / 2, strength);
      a.x -= (offsetX / distance) * push;
      a.y -= (offsetY / distance) * push;
      b.x += (offsetX / distance) * push;
      b.y += (offsetY / distance) * push;
    }
  }
}

export function updateZombies(game, deltaSeconds) {
  for (const zombie of game.zombies) {
    if (zombie.isFading) {
      updateFading(game, zombie, deltaSeconds);
      continue;
    }
    zombie.alpha = Math.min(1, zombie.alpha + deltaSeconds / SPAWN_FADE_IN_SECONDS);
    updateTimers(game, zombie, deltaSeconds);
    applyKnockbackMotion(game, zombie, deltaSeconds);
    thinkAndMove(game, zombie, deltaSeconds);
    if (!game.player.isDead) pushOutOfCircle(zombie, game.player.x, game.player.y, game.player.radius);
  }
  separateZombies(game.zombies, deltaSeconds);
  // Đẩy nhau có thể lỡ đẩy zombie lấn vào tường → đẩy ra lại.
  for (const zombie of game.zombies) pushOutOfWorld(game.world, zombie);
  removeWhere(game.zombies, (zombie) => zombie.isDead);
}
