// Vật phẩm rơi trên đất (gỗ khi cây đổ, thịt khi săn thú, đạn từ zombie...).
// Văng nhẹ ra khi rơi, tự bay vào người chơi khi lại gần (nếu túi còn chỗ), biến mất nếu nằm quá lâu.
// Dùng systems/inventory.js để nhặt; được vẽ bởi render/worldSprites.js.

import { PICKUPS } from '../config.js';
import { TILE, getTile, pixelToTile } from '../world/mapGen.js';
import { addItem, canFit } from '../systems/inventory.js';
import { randomInt, removeWhere } from '../utils/math.js';
import { emit } from '../utils/events.js';

export function spawnPickup(game, itemId, count, x, y, pickupDelaySeconds = 0) {
  const angle = Math.random() * Math.PI * 2;
  const speed = PICKUPS.scatterSpeed * (0.5 + Math.random() * 0.5);
  game.pickups.push({
    type: 'pickup',
    itemId,
    count,
    x,
    y,
    velocityX: Math.cos(angle) * speed,
    velocityY: Math.sin(angle) * speed,
    ageSeconds: 0,
    pickupDelay: pickupDelaySeconds,
    bobPhase: Math.random() * Math.PI * 2,
  });
}

/** Rơi đồ theo bảng drops: [{ itemId, min, max }] (dùng khi săn thú, hạ zombie, chặt cây). */
export function spawnDrops(game, drops, x, y) {
  for (const drop of drops) {
    const count = randomInt(Math.random, drop.min, drop.max);
    if (count > 0) spawnPickup(game, drop.itemId, count, x, y);
  }
}

/** Bỏ thẳng vào túi; phần không vừa thì rơi xuống đất cạnh người chơi. */
export function giveItemToPlayer(game, itemId, count) {
  const leftover = addItem(game.inventory, itemId, count);
  if (leftover > 0) {
    spawnPickup(game, itemId, leftover, game.player.x, game.player.y);
    emit(game, 'toast', { text: 'Túi đầy! Đồ rơi xuống đất.' });
  }
}

/** Trượt theo vận tốc văng ra, nhưng không trôi xuống nước. */
function slideOnGround(game, pickup, deltaSeconds) {
  const nextX = pickup.x + pickup.velocityX * deltaSeconds;
  const nextY = pickup.y + pickup.velocityY * deltaSeconds;
  const world = game.world;
  if (getTile(world, pixelToTile(world, nextX), pixelToTile(world, nextY)) !== TILE.WATER) {
    pickup.x = nextX;
    pickup.y = nextY;
  }
  const decay = Math.exp(-PICKUPS.scatterDecay * deltaSeconds);
  pickup.velocityX *= decay;
  pickup.velocityY *= decay;
}

function pullTowardPlayer(pickup, player, distance, deltaSeconds) {
  const step = Math.min(distance, PICKUPS.magnetSpeed * deltaSeconds);
  pickup.x += ((player.x - pickup.x) / distance) * step;
  pickup.y += ((player.y - pickup.y) / distance) * step;
}

function tryCollect(game, pickup) {
  const leftover = addItem(game.inventory, pickup.itemId, pickup.count);
  if (leftover === pickup.count) return;
  pickup.count = leftover;
  emit(game, 'sound', { name: 'pickup' });
}

export function updatePickups(game, deltaSeconds) {
  const player = game.player;
  for (const pickup of game.pickups) {
    pickup.ageSeconds += deltaSeconds;
    pickup.pickupDelay -= deltaSeconds;
    slideOnGround(game, pickup, deltaSeconds);
    if (pickup.pickupDelay > 0 || player.isDead) continue;

    const distance = Math.hypot(player.x - pickup.x, player.y - pickup.y);
    if (distance > PICKUPS.magnetRadius || !canFit(game.inventory, pickup.itemId, 1)) continue;
    if (distance <= PICKUPS.collectRadius) tryCollect(game, pickup);
    else pullTowardPlayer(pickup, player, distance, deltaSeconds);
  }
  removeWhere(game.pickups, (pickup) => pickup.count <= 0 || pickup.ageSeconds > PICKUPS.lifetimeSeconds);
}
