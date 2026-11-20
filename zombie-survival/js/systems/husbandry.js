// Chăn nuôi: cho vật nuôi ăn món chúng thích → "đang yêu" → hai con cùng loài gặp nhau thì đẻ ra con non.
// Gà đẻ trứng, cừu cho xén lông (lông mọc lại), bò cho vắt sữa bằng xô gỗ. Con non lớn dần thành con trưởng thành.
// Trạng thái nằm trên chính object thú (entities/animal.js); dùng ANIMALS/HUSBANDRY trong config.js.

import { ANIMALS, HUSBANDRY } from '../config.js';
import { createAnimal } from '../entities/animal.js';
import { spawnPickup, giveItemToPlayer } from '../entities/pickup.js';
import { takeFromSlot } from './inventory.js';
import { getSelectedItemId } from './items.js';
import { randomInt, randomRange } from '../utils/math.js';
import { emit } from '../utils/events.js';

const EFFECT_HEIGHT = 16;
const VOICE_SECONDS = { min: 9, max: 24 }; // thỉnh thoảng kêu một tiếng cho sinh động
const VOICE_DISTANCE = 420; // chỉ kêu khi ở gần người chơi
const VOICES = { chicken: 'cluck', sheep: 'baa', cow: 'moo' };

export function isFarmAnimal(animal) {
  return Boolean(ANIMALS[animal.species].isFarm);
}

/** Con trưởng thành đang yêu / mới đẻ thì không ăn thêm; con non lúc nào cũng ăn được (để lớn nhanh). */
function canBeFed(animal) {
  if (animal.isBaby) return true;
  return animal.loveTimer <= 0 && animal.breedCooldown <= 0;
}

/** Thú gần (x, y) nhất trong bán kính range thoả điều kiện, hoặc null. */
function findNearestAnimal(game, range, matches) {
  const { player } = game;
  let nearest = null;
  let nearestDistance = range;
  for (const animal of game.animals) {
    if (animal.isDead || !matches(animal)) continue;
    const distance = Math.hypot(animal.x - player.x, animal.y - player.y) - animal.radius;
    if (distance <= nearestDistance) {
      nearest = animal;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function findFeedableAnimal(game, range) {
  const foodItemId = getSelectedItemId(game);
  if (!foodItemId) return null;
  return findNearestAnimal(
    game,
    range,
    (animal) => isFarmAnimal(animal) && ANIMALS[animal.species].favoriteFood === foodItemId && canBeFed(animal),
  );
}

export function findShearableSheep(game, range) {
  return findNearestAnimal(game, range, (animal) => animal.species === 'sheep' && !animal.isBaby && !animal.isSheared);
}

export function findMilkableCow(game, range) {
  return findNearestAnimal(game, range, (animal) => animal.species === 'cow' && !animal.isBaby && animal.productTimer <= 0);
}

// ---------- Hành động của người chơi ----------

export function feedAnimal(game, animal) {
  takeFromSlot(game.inventory, game.player.selectedSlot, 1);
  if (animal.isBaby) {
    animal.growTimer -= HUSBANDRY.babyGrowSeconds * HUSBANDRY.babyFeedGrowRatio;
    emit(game, 'particles', { preset: 'sprout', x: animal.x, y: animal.y - EFFECT_HEIGHT });
  } else {
    animal.loveTimer = HUSBANDRY.loveSeconds;
    emit(game, 'particles', { preset: 'love', x: animal.x, y: animal.y - EFFECT_HEIGHT });
  }
  emit(game, 'sound', { name: 'eat', x: animal.x, y: animal.y });
}

export function shearSheep(game, sheep) {
  const settings = ANIMALS.sheep;
  sheep.isSheared = true;
  sheep.productTimer = settings.woolRegrowSeconds;
  spawnPickup(game, 'wool', randomInt(Math.random, settings.shearWool.min, settings.shearWool.max), sheep.x, sheep.y);
  emit(game, 'particles', { preset: 'wool', x: sheep.x, y: sheep.y - EFFECT_HEIGHT });
  emit(game, 'sound', { name: 'shear', x: sheep.x, y: sheep.y });
}

/** Vắt sữa: xô gỗ trên tay biến thành xô sữa. */
export function milkCow(game, cow) {
  takeFromSlot(game.inventory, game.player.selectedSlot, 1);
  giveItemToPlayer(game, 'milk', 1);
  cow.productTimer = ANIMALS.cow.milkSeconds;
  emit(game, 'sound', { name: 'moo', x: cow.x, y: cow.y });
  emit(game, 'particles', { preset: 'heal', x: cow.x, y: cow.y - EFFECT_HEIGHT });
}

// ---------- Ghép đôi & sinh con ----------

function countFarmAnimals(game) {
  let count = 0;
  for (const animal of game.animals) if (!animal.isDead && isFarmAnimal(animal)) count++;
  return count;
}

function isLookingForMate(animal) {
  return !animal.isDead && !animal.isBaby && animal.loveTimer > 0 && animal.mate === null;
}

/** Con đang yêu mà chưa có đôi thì tìm con cùng loài cũng đang yêu gần nhất. */
function pairUp(game, animal) {
  let best = null;
  let bestDistance = HUSBANDRY.mateSearchRadius;
  for (const other of game.animals) {
    if (other === animal || other.species !== animal.species || !isLookingForMate(other)) continue;
    const distance = Math.hypot(other.x - animal.x, other.y - animal.y);
    if (distance < bestDistance) {
      best = other;
      bestDistance = distance;
    }
  }
  if (!best) return;
  animal.mate = best;
  best.mate = animal;
}

function endLove(animal) {
  animal.loveTimer = 0;
  animal.mate = null;
}

function giveBirth(game, parent, mate) {
  const baby = createAnimal(parent.species, (parent.x + mate.x) / 2, (parent.y + mate.y) / 2, { isBaby: true });
  game.animals.push(baby);
  for (const animal of [parent, mate]) {
    endLove(animal);
    animal.breedCooldown = HUSBANDRY.breedCooldownSeconds;
  }
  emit(game, 'particles', { preset: 'love', x: baby.x, y: baby.y - EFFECT_HEIGHT, count: 12 });
  emit(game, 'sound', { name: 'love', x: baby.x, y: baby.y });
}

function updateCourtship(game, animal) {
  if (animal.mate && (animal.mate.isDead || animal.mate.mate !== animal || animal.loveTimer <= 0)) animal.mate = null;
  if (animal.loveTimer <= 0) return;
  if (animal.mate === null) {
    pairUp(game, animal);
    return;
  }
  const mate = animal.mate;
  const touching = Math.hypot(mate.x - animal.x, mate.y - animal.y) <= animal.radius + mate.radius + HUSBANDRY.mateDistance;
  if (!touching) return;
  if (countFarmAnimals(game) >= HUSBANDRY.maxFarmAnimals) {
    endLove(animal);
    endLove(mate);
    emit(game, 'toast', { text: 'Trang trại đông quá rồi, không đẻ thêm được nữa!' });
    return;
  }
  giveBirth(game, animal, mate);
}

// ---------- Sản phẩm & lớn lên ----------

function growUp(animal) {
  animal.isBaby = false;
  animal.radius = ANIMALS[animal.species].radius;
  if (animal.species === 'chicken') animal.productTimer = randomRange(Math.random, ANIMALS.chicken.eggSeconds.min, ANIMALS.chicken.eggSeconds.max);
}

function layEgg(game, chicken) {
  const settings = ANIMALS.chicken.eggSeconds;
  chicken.productTimer = randomRange(Math.random, settings.min, settings.max);
  spawnPickup(game, 'egg', 1, chicken.x, chicken.y);
  emit(game, 'sound', { name: 'cluck', x: chicken.x, y: chicken.y });
}

function updateProducts(game, animal, deltaSeconds) {
  if (animal.isBaby) {
    animal.growTimer -= deltaSeconds;
    if (animal.growTimer <= 0) growUp(animal);
    return;
  }
  animal.productTimer = Math.max(0, animal.productTimer - deltaSeconds);
  if (animal.productTimer > 0) return;
  if (animal.species === 'chicken') layEgg(game, animal);
  else if (animal.species === 'sheep') animal.isSheared = false; // lông đã mọc lại
}

function updateVoice(game, animal, deltaSeconds) {
  animal.voiceTimer -= deltaSeconds;
  if (animal.voiceTimer > 0) return;
  animal.voiceTimer = randomRange(Math.random, VOICE_SECONDS.min, VOICE_SECONDS.max);
  const { player } = game;
  if (Math.hypot(animal.x - player.x, animal.y - player.y) < VOICE_DISTANCE) {
    emit(game, 'sound', { name: VOICES[animal.species], x: animal.x, y: animal.y });
  }
}

export function updateHusbandry(game, deltaSeconds) {
  for (const animal of game.animals) {
    if (animal.isDead || !isFarmAnimal(animal)) continue;
    animal.loveTimer = Math.max(0, animal.loveTimer - deltaSeconds);
    animal.breedCooldown = Math.max(0, animal.breedCooldown - deltaSeconds);
    updateProducts(game, animal, deltaSeconds);
    updateCourtship(game, animal);
    updateVoice(game, animal, deltaSeconds);
  }
}

// ---------- Lưu & tải (vật nuôi được lưu, thú rừng thì sinh lại) ----------

export function serializeFarmAnimals(game) {
  return game.animals
    .filter((animal) => !animal.isDead && isFarmAnimal(animal))
    .map((animal) => [
      animal.species,
      Math.round(animal.x),
      Math.round(animal.y),
      animal.isBaby ? 1 : 0,
      Math.round(animal.growTimer),
      Math.round(animal.productTimer),
      animal.isSheared ? 1 : 0,
    ]);
}

export function restoreFarmAnimals(game, savedAnimals) {
  for (const [species, x, y, isBaby, growTimer, productTimer, isSheared] of savedAnimals) {
    if (!ANIMALS[species]?.isFarm) continue;
    const animal = createAnimal(species, x, y, { isBaby: isBaby === 1 });
    animal.growTimer = growTimer;
    animal.productTimer = productTimer;
    animal.isSheared = isSheared === 1;
    game.animals.push(animal);
  }
}
