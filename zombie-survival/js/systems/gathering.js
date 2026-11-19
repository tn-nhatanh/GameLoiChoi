// Thu thập tài nguyên: chặt cây (nhiều nhát mới đổ), đập đá, hái quả; cây/đá/bụi mọc lại sau một thời gian.
// Trạng thái nằm ngay trên object của map (health, isDepleted, regrowTimer — tạo trong world/mapGen.js).
// Được gọi bởi combat.js (vung công cụ trúng cây/đá) và interaction.js (nút Tương tác).

import { HARVEST, TOOLS, WORLD_OBJECTS } from '../config.js';
import { spawnPickup, giveItemToPlayer } from '../entities/pickup.js';
import { markFlowFieldDirty } from './pathfinding.js';
import { randomInt, removeWhere } from '../utils/math.js';
import { emit } from '../utils/events.js';

/** Hiệu ứng theo loại: nơi tung hạt (độ cao so với chân), loại hạt, tiếng. Chỉ để trình bày. */
const RESOURCE_EFFECTS = {
  tree: { effectHeight: 34, hitParticles: 'woodChips', hitSound: 'chop', breakParticles: 'leaves', breakSound: 'treeFall' },
  rock: { effectHeight: 12, hitParticles: 'stoneDust', hitSound: 'mine', breakParticles: 'stoneDust', breakSound: 'rockBreak' },
};
const BUSH_EFFECT_HEIGHT = 14;
const HIT_SHAKE_SECONDS = 0.18; // cây/đá rung nhẹ khi bị đánh
const DROP_PILE_SIZE = 2; // chia đồ rơi thành nhiều đống nhỏ văng ra cho vui mắt

export function isHarvestable(object) {
  return !object.isDepleted && (object.type === 'tree' || object.type === 'rock');
}

export function hasBerries(object) {
  return object.type === 'bush' && !object.isDepleted;
}

/** Một nhát rìu/cuốc/tay không vào cây hoặc đá. */
export function hitResource(game, object, toolType) {
  const effects = RESOURCE_EFFECTS[object.type];
  const damage = object.type === 'tree' ? TOOLS[toolType].treeDamage : TOOLS[toolType].rockDamage;
  object.health -= damage;
  if (object.hitTimer <= 0) game.recentlyHitObjects.push(object);
  object.hitTimer = HIT_SHAKE_SECONDS;
  emit(game, 'particles', { preset: effects.hitParticles, x: object.x, y: object.y - effects.effectHeight });
  emit(game, 'sound', { name: effects.hitSound, x: object.x, y: object.y });
  if (object.health <= 0) depleteResource(game, object);
}

function dropInPiles(game, itemId, total, x, y) {
  for (let remaining = total; remaining > 0; remaining -= DROP_PILE_SIZE) {
    spawnPickup(game, itemId, Math.min(DROP_PILE_SIZE, remaining), x, y);
  }
}

function startRegrowing(game, object) {
  object.isDepleted = true;
  object.regrowTimer = HARVEST[object.type].regrowSeconds;
  game.regrowingObjects.push(object);
}

/** Cây đổ / đá vỡ: rơi gỗ/đá, thành gốc cây (đi qua được), chờ mọc lại. */
function depleteResource(game, object) {
  const settings = HARVEST[object.type];
  const effects = RESOURCE_EFFECTS[object.type];
  startRegrowing(game, object);
  object.isBlocking = false;
  dropInPiles(game, settings.dropItem, randomInt(Math.random, settings.dropMin, settings.dropMax), object.x, object.y);
  emit(game, 'particles', { preset: effects.breakParticles, x: object.x, y: object.y - effects.effectHeight });
  emit(game, 'sound', { name: effects.breakSound, x: object.x, y: object.y });
  markFlowFieldDirty(game.flowField);
}

export function pickBerries(game, bush) {
  const settings = HARVEST.bush;
  giveItemToPlayer(game, settings.dropItem, randomInt(Math.random, settings.dropMin, settings.dropMax));
  startRegrowing(game, bush);
  emit(game, 'particles', { preset: 'berryPop', x: bush.x, y: bush.y - BUSH_EFFECT_HEIGHT });
  emit(game, 'sound', { name: 'pick' });
}

/** Có ai đứng đúng chỗ cây/đá sắp mọc không (mọc đè lên thì bị kẹt). */
function isSpotOccupied(game, object) {
  const isTouching = (entity) =>
    Math.hypot(entity.x - object.x, entity.y - object.y) < entity.radius + object.collisionRadius;
  return isTouching(game.player) || game.zombies.some(isTouching) || game.animals.some(isTouching);
}

function restoreResource(game, object) {
  object.isDepleted = false;
  object.health = HARVEST[object.type].maxHealth ?? 0;
  object.isBlocking = WORLD_OBJECTS[object.type].isBlocking;
  if (object.isBlocking) markFlowFieldDirty(game.flowField);
}

export function updateRegrowth(game, deltaSeconds) {
  for (const object of game.regrowingObjects) {
    object.regrowTimer -= deltaSeconds;
    if (object.regrowTimer > 0) continue;
    if (WORLD_OBJECTS[object.type].isBlocking && isSpotOccupied(game, object)) {
      object.regrowTimer = HARVEST.regrowRetrySeconds;
      continue;
    }
    restoreResource(game, object);
  }
  removeWhere(game.regrowingObjects, (object) => !object.isDepleted);
}

/** Đồng hồ rung khi bị đánh (chỉ để vẽ); chỉ duyệt các object vừa bị đánh. */
export function updateHitShakes(game, deltaSeconds) {
  for (const object of game.recentlyHitObjects) object.hitTimer -= deltaSeconds;
  removeWhere(game.recentlyHitObjects, (object) => object.hitTimer <= 0);
}

/** Khôi phục trạng thái từ bản lưu: đánh dấu đã bị khai thác và nối vào danh sách chờ mọc lại. */
export function applySavedResourceState(game, object, savedState) {
  object.health = savedState.health;
  if (!savedState.isDepleted) return;
  object.isDepleted = true;
  object.isBlocking = false;
  object.regrowTimer = savedState.regrowTimer;
  game.regrowingObjects.push(object);
}
