// Thú rừng: thỏ (thấy người là chạy), hươu (đứng nhìn cảnh giác rồi mới chạy), lợn rừng (bị đánh thì húc lại).
// Mỗi con có một "trạng thái" (đứng yên, lang thang, cảnh giác, chạy trốn, húc) và bộ đếm giờ cho trạng thái đó.
// Dùng ANIMALS/ANIMAL_SPAWN trong config.js; bị săn trong systems/combat.js (rơi thịt và da).

import { ANIMALS, ANIMAL_SPAWN, COMBAT, MAP_GEN } from '../config.js';
import { isOpenGround, getStructureAtTile } from '../world/mapGen.js';
import { moveWithCollision } from '../world/collision.js';
import { findSpawnSpotAround } from './zombie.js';
import { damagePlayer } from '../systems/combat.js';
import { randomRange, removeWhere, pickWeighted } from '../utils/math.js';

const STATES = Object.freeze({ IDLE: 'idle', WANDER: 'wander', ALERT: 'alert', FLEE: 'flee', CHARGE: 'charge' });
const HOP_SPEED = 14; // nhịp nhún khi chạy (chỉ để vẽ)
const BOAR_ATTACK_GAP = 6;
const FLEE_ANGLE_JITTER = 0.6; // chạy trốn hơi chệch hướng cho tự nhiên (radian)
const INITIAL_SPAWN_ATTEMPTS = 400;

export function createAnimal(species, x, y) {
  const stats = ANIMALS[species];
  return {
    type: 'animal',
    species,
    x,
    y,
    radius: stats.radius,
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

/** Rải thú khắp đảo lúc bắt đầu game (tránh quanh điểm xuất phát cho người chơi khỏi giật mình). */
export function spawnInitialAnimals(game) {
  const { world } = game;
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
export function maintainAnimalPopulation(game, deltaSeconds) {
  game.animalRespawnTimer -= deltaSeconds;
  if (game.animalRespawnTimer > 0 || game.animals.length >= ANIMAL_SPAWN.maxAlive) return;
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

const REACTIONS = { rabbit: reactRabbit, deer: reactDeer, boar: reactBoar };

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

function actOnState(game, animal, deltaSeconds) {
  const stats = ANIMALS[animal.species];
  animal.isMoving = false;
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
    if (!player.isDead) REACTIONS[animal.species](animal, player, distance);
    animal.wasHurt = false;
    applyKnockbackMotion(game, animal, deltaSeconds);
    actOnState(game, animal, deltaSeconds);
  }
  removeWhere(game.animals, (animal) => animal.isDead);
  maintainAnimalPopulation(game, deltaSeconds);
}
