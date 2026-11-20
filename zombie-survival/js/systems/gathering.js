// Thu thập tài nguyên: chặt cây (nhiều nhát mới đổ), đập đá, hái quả/táo/nấm, nhổ cà rốt/khoai dại, cắt cỏ (rơi hạt).
// Mọi thứ đều mọc lại sau một thời gian; cây cỏ nhỏ bị dọn khi cày ruộng / xây lên thì chờ ô trống mới mọc lại.
// Trạng thái nằm ngay trên object của map (tạo trong world/mapGen.js). Gọi bởi combat.js, interaction.js, farming.js.

import { HARVEST, TOOLS, WORLD_OBJECTS } from '../config.js';
import { getStructureAtTile, tileIndexOf } from '../world/mapGen.js';
import { spawnPickup, giveItemToPlayer } from '../entities/pickup.js';
import { markFlowFieldDirty } from './pathfinding.js';
import { randomInt, removeWhere } from '../utils/math.js';
import { emit } from '../utils/events.js';

/** Hiệu ứng theo loại: nơi tung hạt (độ cao so với chân), loại hạt, tiếng. Chỉ để trình bày. */
const RESOURCE_EFFECTS = {
  tree: { effectHeight: 34, hitParticles: 'woodChips', hitSound: 'chop', breakParticles: 'leaves', breakSound: 'treeFall' },
  rock: { effectHeight: 12, hitParticles: 'stoneDust', hitSound: 'mine', breakParticles: 'stoneDust', breakSound: 'rockBreak' },
};
const PICK_EFFECT_HEIGHT = 14;
const APPLE_EFFECT_HEIGHT = 40;
const HIT_SHAKE_SECONDS = 0.18; // cây/đá rung nhẹ khi bị đánh
const DROP_PILE_SIZE = 2; // chia đồ rơi thành nhiều đống nhỏ văng ra cho vui mắt

/** Chữ trên nút Dùng khi đứng cạnh thứ hái được. */
const PICK_LABELS = {
  bush: 'Hái quả',
  apple: 'Hái táo',
  mushroom: 'Hái nấm',
  wildCarrot: 'Nhổ cà rốt',
  wildPotato: 'Đào khoai',
  tallGrass: 'Cắt cỏ',
};
const PICK_PARTICLES = { bush: 'berryPop', mushroom: 'berryPop', wildCarrot: 'soil', wildPotato: 'soil', tallGrass: 'grassCut' };

export function isHarvestable(object) {
  return !object.isDepleted && (object.type === 'tree' || object.type === 'rock');
}

export function isAppleTreeWithFruit(object) {
  return object.type === 'tree' && object.variant === 'apple' && !object.isDepleted && object.fruitTimer <= 0;
}

/** Thứ hái được bằng tay (không tính cỏ): bụi quả, cây táo có quả, nấm, cây dại. */
export function isPickableFood(object) {
  if (isAppleTreeWithFruit(object)) return true;
  if (object.isDepleted) return false;
  return object.type === 'bush' || object.type === 'mushroom' || object.type === 'wildCarrot' || object.type === 'wildPotato';
}

export function isCuttableGrass(object) {
  return object.type === 'tallGrass' && !object.isDepleted;
}

export function getPickLabel(object) {
  return isAppleTreeWithFruit(object) ? PICK_LABELS.apple : PICK_LABELS[object.type];
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

function pickApples(game, tree) {
  const settings = HARVEST.apple;
  giveItemToPlayer(game, settings.dropItem, randomInt(Math.random, settings.dropMin, settings.dropMax));
  tree.fruitTimer = settings.regrowSeconds;
  game.fruitingTrees.push(tree);
  emit(game, 'particles', { preset: 'leaves', x: tree.x, y: tree.y - APPLE_EFFECT_HEIGHT, count: 6 });
  emit(game, 'sound', { name: 'pick' });
}

/** Cắt cỏ cao: thỉnh thoảng rơi hạt lúa mì (như cách kiếm hạt giống đầu tiên). */
export function cutGrass(game, grass) {
  const settings = HARVEST.tallGrass;
  startRegrowing(game, grass);
  if (Math.random() < settings.dropChance) {
    spawnPickup(game, settings.dropItem, randomInt(Math.random, settings.dropMin, settings.dropMax), grass.x, grass.y);
  }
  emit(game, 'particles', { preset: 'grassCut', x: grass.x, y: grass.y - PICK_EFFECT_HEIGHT / 2 });
  emit(game, 'sound', { name: 'grass', x: grass.x, y: grass.y });
}

/** Hái / nhổ / cắt thứ đang đứng cạnh (nút Dùng). */
export function pickObject(game, object) {
  if (isAppleTreeWithFruit(object)) {
    pickApples(game, object);
    return;
  }
  if (object.type === 'tallGrass') {
    cutGrass(game, object);
    return;
  }
  const settings = HARVEST[object.type];
  giveItemToPlayer(game, settings.dropItem, randomInt(Math.random, settings.dropMin, settings.dropMax));
  startRegrowing(game, object);
  emit(game, 'particles', { preset: PICK_PARTICLES[object.type], x: object.x, y: object.y - PICK_EFFECT_HEIGHT });
  emit(game, 'sound', { name: 'pick' });
}

/** Cây cỏ nhỏ có thể bị dọn đi (khi cày đất / xây công trình lên ô đó). */
export function isClearable(object) {
  return Boolean(HARVEST[object.type]?.clearable);
}

/** Dọn cây cỏ nhỏ khỏi ô: không rơi gì, chờ ô trống trở lại mới mọc. */
export function clearObject(game, object) {
  if (object.isDepleted || !isClearable(object)) return;
  startRegrowing(game, object);
}

/** Có ai/cái gì đứng đúng chỗ cây sắp mọc không (mọc đè lên thì bị kẹt hoặc đè lên ruộng/nhà). */
function isSpotOccupied(game, object) {
  const { world } = game;
  if (getStructureAtTile(world, object.tileX, object.tileY)) return true;
  if (world.plotByTile.has(tileIndexOf(world, object.tileX, object.tileY))) return true;
  if (!WORLD_OBJECTS[object.type].isBlocking) return false;
  const isTouching = (entity) =>
    Math.hypot(entity.x - object.x, entity.y - object.y) < entity.radius + object.collisionRadius;
  return isTouching(game.player) || game.zombies.some(isTouching) || game.animals.some(isTouching);
}

function restoreResource(game, object) {
  object.isDepleted = false;
  object.health = HARVEST[object.type].maxHealth ?? 0;
  object.fruitTimer = 0;
  object.isBlocking = WORLD_OBJECTS[object.type].isBlocking;
  if (object.isBlocking) markFlowFieldDirty(game.flowField);
}

function updateFruit(game, deltaSeconds) {
  for (const tree of game.fruitingTrees) tree.fruitTimer -= deltaSeconds;
  removeWhere(game.fruitingTrees, (tree) => tree.fruitTimer <= 0);
}

export function updateRegrowth(game, deltaSeconds) {
  for (const object of game.regrowingObjects) {
    object.regrowTimer -= deltaSeconds;
    if (object.regrowTimer > 0) continue;
    if (isSpotOccupied(game, object)) {
      object.regrowTimer = HARVEST.regrowRetrySeconds;
      continue;
    }
    restoreResource(game, object);
  }
  removeWhere(game.regrowingObjects, (object) => !object.isDepleted);
  updateFruit(game, deltaSeconds);
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
