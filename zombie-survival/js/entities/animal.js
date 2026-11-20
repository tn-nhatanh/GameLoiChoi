// Thú: thỏ (thấy người là chạy), hươu (đứng nhìn cảnh giác rồi mới chạy), lợn rừng (bị đánh thì húc lại),
// và vật nuôi gà/cừu/bò (hiền, đi theo khi bạn cầm món chúng thích, "đang yêu" thì đi tìm bạn đời — xem husbandry.js).
// Mỗi con có một "trạng thái" và bộ đếm giờ cho trạng thái đó. Dùng ANIMALS/ANIMAL_SPAWN/HUSBANDRY trong config.js.

import { ANIMALS, ANIMAL_SPAWN, COMBAT, MAP_GEN, HUSBANDRY } from '../config.js';
import { TILE, getTile, isOpenGround, getStructureAtTile, pixelToTile } from '../world/mapGen.js';
import { getSelectedItemId } from '../systems/items.js';
import { moveWithCollision } from '../world/collision.js';
import { findSpawnSpotAround } from './zombie.js';
import { damagePlayer } from '../systems/combat.js';
import { randomRange, randomInt, removeWhere, pickWeighted } from '../utils/math.js';

const STATES = Object.freeze({
  IDLE: 'idle',
  WANDER: 'wander',
  ALERT: 'alert',
  FLEE: 'flee',
  CHARGE: 'charge',
  FOLLOW: 'follow', // vật nuôi đi theo người đang cầm món nó thích
  LOVE: 'love', // vật nuôi đang yêu, đi về phía bạn đời
});
const VOICE_FIRST_SECONDS = { min: 3, max: 20 };
const HOP_SPEED = 14; // nhịp nhún khi chạy (chỉ để vẽ)
const BOAR_ATTACK_GAP = 6;
const FLEE_ANGLE_JITTER = 0.6; // chạy trốn hơi chệch hướng cho tự nhiên (radian)
const INITIAL_SPAWN_ATTEMPTS = 400;

/** options.isBaby: con non nhỏ hơn (HUSBANDRY.babyScale) và lớn dần (systems/husbandry.js). */
export function createAnimal(species, x, y, options = {}) {
  const stats = ANIMALS[species];
  const isBaby = Boolean(options.isBaby);
  const laysEggs = species === 'chicken' && !isBaby;
  return {
    type: 'animal',
    species,
    x,
    y,
    radius: stats.radius * (isBaby ? HUSBANDRY.babyScale : 1),
    // Vật nuôi (systems/husbandry.js)
    isBaby,
    growTimer: isBaby ? HUSBANDRY.babyGrowSeconds : 0,
    loveTimer: 0,
    breedCooldown: 0,
    mate: null,
    productTimer: laysEggs ? randomRange(Math.random, stats.eggSeconds.min, stats.eggSeconds.max) : 0,
    isSheared: false,
    voiceTimer: randomRange(Math.random, VOICE_FIRST_SECONDS.min, VOICE_FIRST_SECONDS.max),
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    state: STATES.IDLE,
    stateTimer: randomRange(Math.random, ANIMAL_SPAWN.idleMinSeconds, ANIMAL_SPAWN.idleMaxSeconds),
    moveAngle: Math.random() * Math.PI * 2,
    facingX: 1,
    facingY: 0,
    isMoving: false,
    hopPhase: 0,
    knockbackX: 0,
    knockbackY: 0,
    hurtTimer: 0,
    healthBarTimer: 0,
    attackCooldown: 0,
    wasHurt: false,
    isDead: false,
    canPassDoors: false,
  };
}

// ---------- Sinh thú ----------

function isFreeGround(world, x, y) {
  const tileX = pixelToTile(world, x);
  const tileY = pixelToTile(world, y);
  return isOpenGround(world, tileX, tileY) && !getStructureAtTile(world, tileX, tileY);
}

/** Một đàn vật nuôi đứng quanh (centerX, centerY). */
function spawnHerd(game, species, centerX, centerY) {
  const size = randomInt(Math.random, ANIMAL_SPAWN.herdSize.min, ANIMAL_SPAWN.herdSize.max);
  for (let member = 0; member < size; member++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * ANIMAL_SPAWN.herdSpread;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    if (isFreeGround(game.world, x, y)) game.animals.push(createAnimal(species, x, y));
  }
}

function randomPointNearSpawn(world) {
  const angle = Math.random() * Math.PI * 2;
  const tiles = randomRange(Math.random, ANIMAL_SPAWN.nearSpawnHerdTiles.min, ANIMAL_SPAWN.nearSpawnHerdTiles.max);
  return { x: world.spawn.x + Math.cos(angle) * tiles * world.tileSize, y: world.spawn.y + Math.sin(angle) * tiles * world.tileSize };
}

function randomTileCenter(world) {
  return {
    x: (Math.floor(Math.random() * world.widthInTiles) + 0.5) * world.tileSize,
    y: (Math.floor(Math.random() * world.heightInTiles) + 0.5) * world.tileSize,
  };
}

/** Tìm một chỗ trên đồng cỏ; nearSpawn = true thì tìm trong vành đai quanh điểm xuất phát. */
function findHerdSpot(world, nearSpawn) {
  for (let attempt = 0; attempt < INITIAL_SPAWN_ATTEMPTS; attempt++) {
    const point = nearSpawn ? randomPointNearSpawn(world) : randomTileCenter(world);
    const isGrass = getTile(world, pixelToTile(world, point.x), pixelToTile(world, point.y)) === TILE.GRASS;
    if (isGrass && isFreeGround(world, point.x, point.y)) return point;
  }
  return null;
}

/** Vật nuôi sống thành đàn trên đồng cỏ; đàn đầu tiên (gà) luôn ở gần điểm xuất phát để dễ gặp. */
function spawnFarmHerds(game) {
  let isFirstHerd = true;
  for (const [species, herdCount] of Object.entries(ANIMAL_SPAWN.farmHerds)) {
    for (let herd = 0; herd < herdCount; herd++) {
      const spot = findHerdSpot(game.world, isFirstHerd);
      isFirstHerd = false;
      if (spot) spawnHerd(game, species, spot.x, spot.y);
    }
  }
}

/**
 * Rải thú khắp đảo lúc bắt đầu game (thú rừng tránh quanh điểm xuất phát cho người chơi khỏi giật mình).
 * includeFarm = false khi tải bản lưu đã có sẵn vật nuôi của người chơi.
 */
export function spawnInitialAnimals(game, includeFarm = true) {
  const { world } = game;
  if (includeFarm) spawnFarmHerds(game);
  for (const [species, count] of Object.entries(ANIMAL_SPAWN.initialCount)) {
    let placed = 0;
    for (let attempt = 0; attempt < INITIAL_SPAWN_ATTEMPTS && placed < count; attempt++) {
      const tileX = Math.floor(Math.random() * world.widthInTiles);
      const tileY = Math.floor(Math.random() * world.heightInTiles);
      const x = (tileX + 0.5) * world.tileSize;
      const y = (tileY + 0.5) * world.tileSize;
      const isNearSpawn = Math.hypot(x - world.spawn.x, y - world.spawn.y) < MAP_GEN.spawnClearRadiusTiles * 2 * world.tileSize;
      if (isNearSpawn || !isOpenGround(world, tileX, tileY) || getStructureAtTile(world, tileX, tileY)) continue;
      game.animals.push(createAnimal(species, x, y));
      placed++;
    }
  }
}

/** Thỉnh thoảng sinh thêm thú ngoài tầm nhìn để đảo không bị săn sạch. */
function countWildAnimals(game) {
  let count = 0;
  for (const animal of game.animals) if (!ANIMALS[animal.species].isFarm) count++;
  return count;
}

/** Chỉ thú rừng được sinh thêm; vật nuôi thì người chơi phải tự nhân giống. */
export function maintainAnimalPopulation(game, deltaSeconds) {
  game.animalRespawnTimer -= deltaSeconds;
  if (game.animalRespawnTimer > 0 || countWildAnimals(game) >= ANIMAL_SPAWN.maxAlive) return;
  game.animalRespawnTimer = ANIMAL_SPAWN.respawnIntervalSeconds;
  const spot = findSpawnSpotAround(game, ANIMAL_SPAWN.respawnMinDistance, ANIMAL_SPAWN.respawnMaxDistance, ANIMAL_SPAWN.spawnAttempts);
  if (spot) game.animals.push(createAnimal(pickWeighted(Math.random, ANIMAL_SPAWN.initialCount), spot.x, spot.y));
}

// ---------- Trạng thái ----------

function setState(animal, state, seconds) {
  animal.state = state;
  animal.stateTimer = seconds;
}

function startFleeing(animal, player) {
  const awayAngle = Math.atan2(animal.y - player.y, animal.x - player.x);
  animal.moveAngle = awayAngle + (Math.random() * 2 - 1) * FLEE_ANGLE_JITTER;
  setState(animal, STATES.FLEE, ANIMAL_SPAWN.fleeSeconds);
}

/** Hết giờ đứng yên thì đi lang thang, hết giờ lang thang thì đứng nghỉ. */
function cycleIdleAndWander(animal) {
  if (animal.stateTimer > 0) return;
  if (animal.state === STATES.WANDER) {
    setState(animal, STATES.IDLE, randomRange(Math.random, ANIMAL_SPAWN.idleMinSeconds, ANIMAL_SPAWN.idleMaxSeconds));
  } else {
    animal.moveAngle = Math.random() * Math.PI * 2;
    setState(animal, STATES.WANDER, randomRange(Math.random, ANIMAL_SPAWN.wanderMinSeconds, ANIMAL_SPAWN.wanderMaxSeconds));
  }
}

function reactRabbit(animal, player, distance) {
  if (animal.wasHurt || distance < ANIMALS.rabbit.senseRadius) startFleeing(animal, player);
}

/** Hươu: thấy người thì đứng nhìn; người tiến sát hơn hoặc nhìn đủ lâu mà người vẫn còn đó thì chạy. */
function reactDeer(animal, player, distance) {
  const stats = ANIMALS.deer;
  if (animal.wasHurt || distance < stats.fleeRadius) {
    startFleeing(animal, player);
  } else if (animal.state === STATES.ALERT) {
    if (animal.stateTimer <= 0) {
      if (distance < stats.alertRadius) startFleeing(animal, player);
      else setState(animal, STATES.IDLE, ANIMAL_SPAWN.idleMinSeconds);
    }
  } else if (animal.state !== STATES.FLEE && distance < stats.alertRadius) {
    setState(animal, STATES.ALERT, stats.alertSeconds);
  }
}

function reactBoar(animal) {
  if (animal.wasHurt) setState(animal, STATES.CHARGE, ANIMALS.boar.angrySeconds);
}

/**
 * Vật nuôi: bị đánh thì hoảng chạy; đang yêu và đã có đôi thì đi tìm nhau;
 * thấy người cầm món mình thích ở gần thì lẽo đẽo đi theo; còn lại thì gặm cỏ, đi dạo.
 */
function reactFarmAnimal(animal, player, distance, game) {
  if (animal.wasHurt) {
    animal.loveTimer = 0;
    startFleeing(animal, player);
    return;
  }
  if (animal.state === STATES.FLEE) return;
  if (animal.loveTimer > 0 && animal.mate) {
    animal.state = STATES.LOVE;
    return;
  }
  const isTempted = getSelectedItemId(game) === ANIMALS[animal.species].favoriteFood && distance < HUSBANDRY.followRadius;
  if (isTempted) {
    animal.state = STATES.FOLLOW;
    return;
  }
  if (animal.state === STATES.FOLLOW || animal.state === STATES.LOVE) {
    setState(animal, STATES.IDLE, ANIMAL_SPAWN.idleMinSeconds);
  }
}

const REACTIONS = {
  rabbit: reactRabbit,
  deer: reactDeer,
  boar: reactBoar,
  chicken: reactFarmAnimal,
  sheep: reactFarmAnimal,
  cow: reactFarmAnimal,
};

// ---------- Di chuyển ----------

function moveAnimal(game, animal, angle, speed, deltaSeconds) {
  animal.facingX = Math.cos(angle);
  animal.facingY = Math.sin(angle);
  animal.isMoving = true;
  moveWithCollision(game.world, animal, animal.facingX * speed * deltaSeconds, animal.facingY * speed * deltaSeconds);
}

function chargeAtPlayer(game, animal, deltaSeconds) {
  const { player } = game;
  const distance = Math.hypot(player.x - animal.x, player.y - animal.y);
  if (player.isDead) return;
  if (distance <= animal.radius + player.radius + BOAR_ATTACK_GAP) {
    if (animal.attackCooldown <= 0) {
      animal.attackCooldown = ANIMALS.boar.attackCooldownSeconds;
      damagePlayer(game, ANIMALS.boar.damage, animal.x, animal.y);
    }
    return;
  }
  moveAnimal(game, animal, Math.atan2(player.y - animal.y, player.x - animal.x), ANIMALS.boar.chargeSpeed, deltaSeconds);
}

/** Đi về phía (targetX, targetY), dừng khi còn cách stopDistance; đứng lại thì quay mặt về phía đó. */
function walkToward(game, animal, targetX, targetY, stopDistance, speed, deltaSeconds) {
  const angle = Math.atan2(targetY - animal.y, targetX - animal.x);
  if (Math.hypot(targetX - animal.x, targetY - animal.y) > stopDistance) {
    moveAnimal(game, animal, angle, speed, deltaSeconds);
    return;
  }
  animal.facingX = Math.cos(angle);
  animal.facingY = Math.sin(angle);
}

/** Đi theo người chơi / đi tìm bạn đời. Trả về true nếu đã xử lý. */
function actOnFarmState(game, animal, deltaSeconds) {
  const speed = ANIMALS[animal.species].walkSpeed * HUSBANDRY.followSpeedMultiplier;
  if (animal.state === STATES.FOLLOW) {
    walkToward(game, animal, game.player.x, game.player.y, HUSBANDRY.followStopDistance, speed, deltaSeconds);
    return true;
  }
  if (animal.state === STATES.LOVE && animal.mate) {
    walkToward(game, animal, animal.mate.x, animal.mate.y, 0, speed, deltaSeconds);
    return true;
  }
  return false;
}

function actOnState(game, animal, deltaSeconds) {
  const stats = ANIMALS[animal.species];
  animal.isMoving = false;
  if (actOnFarmState(game, animal, deltaSeconds)) return;
  if (animal.state === STATES.FLEE) moveAnimal(game, animal, animal.moveAngle, stats.fleeSpeed, deltaSeconds);
  else if (animal.state === STATES.WANDER) moveAnimal(game, animal, animal.moveAngle, stats.walkSpeed, deltaSeconds);
  else if (animal.state === STATES.CHARGE) chargeAtPlayer(game, animal, deltaSeconds);
  else if (animal.state === STATES.ALERT) {
    const { player } = game;
    const angle = Math.atan2(player.y - animal.y, player.x - animal.x);
    animal.facingX = Math.cos(angle);
    animal.facingY = Math.sin(angle);
  }
  if (animal.stateTimer <= 0 && (animal.state === STATES.FLEE || animal.state === STATES.CHARGE)) {
    setState(animal, STATES.IDLE, ANIMAL_SPAWN.idleMinSeconds);
  }
  if (animal.state === STATES.IDLE || animal.state === STATES.WANDER) cycleIdleAndWander(animal);
}

function applyKnockbackMotion(game, animal, deltaSeconds) {
  if (animal.knockbackX === 0 && animal.knockbackY === 0) return;
  moveWithCollision(game.world, animal, animal.knockbackX * deltaSeconds, animal.knockbackY * deltaSeconds);
  const decay = Math.exp(-COMBAT.knockbackDecay * deltaSeconds);
  animal.knockbackX *= decay;
  animal.knockbackY *= decay;
  if (Math.hypot(animal.knockbackX, animal.knockbackY) < 1) {
    animal.knockbackX = 0;
    animal.knockbackY = 0;
  }
}

function updateTimers(animal, deltaSeconds) {
  animal.stateTimer -= deltaSeconds;
  animal.attackCooldown -= deltaSeconds;
  animal.hurtTimer = Math.max(0, animal.hurtTimer - deltaSeconds);
  animal.healthBarTimer = Math.max(0, animal.healthBarTimer - deltaSeconds);
  if (animal.isMoving) animal.hopPhase += HOP_SPEED * deltaSeconds;
}

export function updateAnimals(game, deltaSeconds) {
  const { player } = game;
  for (const animal of game.animals) {
    if (animal.isDead) continue;
    updateTimers(animal, deltaSeconds);
    const distance = Math.hypot(player.x - animal.x, player.y - animal.y);
    if (!player.isDead) REACTIONS[animal.species](animal, player, distance, game);
    animal.wasHurt = false;
    applyKnockbackMotion(game, animal, deltaSeconds);
    actOnState(game, animal, deltaSeconds);
  }
  removeWhere(game.animals, (animal) => animal.isDead);
  maintainAnimalPopulation(game, deltaSeconds);
}
