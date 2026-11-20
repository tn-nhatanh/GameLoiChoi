// Trạng thái ứng dụng (đang ở màn nào, cài đặt, kỷ lục) và một phiên chơi (đảo, người chơi, túi đồ, zombie...).
// Các system giao tiếp với nhau qua object `game` này thay vì biến toàn cục.
// Cũng chứa việc tạo bản lưu (snapshot) và khôi phục phiên chơi từ bản lưu (utils/storage.js ghi xuống localStorage).

import { SAVE, ANIMAL_SPAWN, PLAYER, SURVIVAL, STRUCTURES, HARVEST } from './config.js';
import { loadSettings, loadBestNights, createWorldId } from './utils/storage.js';
import { hashStringToSeed, clamp } from './utils/math.js';
import { createPlayer } from './entities/player.js';
import { createBulletPool } from './entities/bullet.js';
import { spawnInitialAnimals } from './entities/animal.js';
import { generateWorld, isInsideMap } from './world/mapGen.js';
import { createCamera } from './world/camera.js';
import { createInventory, addItem, serializeInventory, deserializeInventory } from './systems/inventory.js';
import { createDayNightState, isNight, getDayNumber } from './systems/dayNight.js';
import { createFlowField } from './systems/pathfinding.js';
import { addStructure } from './systems/building.js';
import { applySavedResourceState } from './systems/gathering.js';
import { serializePlots, restorePlots } from './systems/farming.js';
import { serializeFarmAnimals, restoreFarmAnimals } from './systems/husbandry.js';

export const SCREENS = Object.freeze({
  MAIN_MENU: 'mainMenu',
  NEW_GAME: 'newGame',
  HOW_TO_PLAY: 'howToPlay',
  SETTINGS: 'settings',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAME_OVER: 'gameOver',
  WORLDS: 'worlds', // danh sách thế giới đã lưu
});

export function createAppState() {
  return {
    screen: SCREENS.MAIN_MENU,
    returnScreen: SCREENS.MAIN_MENU, // màn quay lại khi bấm "Quay lại" ở Cài đặt / Cách chơi
    settings: loadSettings(),
    bestNights: loadBestNights(),
    reducedMotion: false, // main.js đồng bộ với prefers-reduced-motion
    game: null, // phiên chơi hiện tại, null khi chưa chơi
    lastResult: null, // { nightsSurvived, bestNights, zombiesKilled, seedText } cho màn Game Over
    lastSavedAt: null, // thời điểm tự lưu gần nhất (ms), hiện ở màn tạm dừng
    screenListeners: [],
  };
}

/** Đổi màn hình và báo cho các listener (menu, HUD, nút cảm ứng). */
export function changeScreen(appState, nextScreen) {
  const previousScreen = appState.screen;
  if (previousScreen === nextScreen) return;
  appState.screen = nextScreen;
  for (const listener of appState.screenListeners) listener(nextScreen, previousScreen);
}

export function onScreenChange(appState, listener) {
  appState.screenListeners.push(listener);
}

export function isPlaying(appState) {
  return appState.screen === SCREENS.PLAYING;
}

// ---------- Phiên chơi ----------

/** Khung phiên chơi: sinh đảo theo seed, đặt người chơi ở điểm xuất phát, các danh sách rỗng. */
function createGameSession(seedText, worldId) {
  const seedNumber = hashStringToSeed(seedText);
  const world = generateWorld(seedNumber);
  return {
    worldId, // mỗi lần chơi một đảo là một "thế giới" riêng, có bản lưu riêng (cùng seed vẫn khác ID)
    seedText,
    seedNumber,
    elapsedSeconds: 0,
    nightsSurvived: 0,
    zombiesKilled: 0,
    world,
    camera: createCamera(),
    player: createPlayer(world.spawn.x, world.spawn.y),
    inventory: createInventory(),
    dayNight: createDayNightState(),
    structures: [],
    zombies: [],
    animals: [],
    pickups: [],
    bullets: createBulletPool(),
    regrowingObjects: [], // cây/đá/bụi đang chờ mọc lại
    fruitingTrees: [], // cây táo đang chờ ra quả
    plots: [], // ô ruộng đã cày (systems/farming.js)
    farmTarget: { isActive: false, tileX: 0, tileY: 0, action: null }, // ô đang nhắm để cày / gieo
    recentlyHitObjects: [], // cây/đá đang rung vì vừa bị đánh
    flowField: createFlowField(world),
    pathStep: { tileX: 0, tileY: 0 }, // object dùng lại khi zombie hỏi đường
    buildGhost: { isActive: false, structureType: null, tileX: 0, tileY: 0, isValid: false, isInReach: false },
    respawnBed: null,
    animalRespawnTimer: ANIMAL_SPAWN.respawnIntervalSeconds,
    events: [], // xem utils/events.js
  };
}

export function startNewGameSession(seedText) {
  const game = createGameSession(seedText, createWorldId());
  for (const { itemId, count } of PLAYER.startingItems) addItem(game.inventory, itemId, count);
  spawnInitialAnimals(game);
  return game;
}

// ---------- Lưu & tải ----------

/** Chỉ lưu những gì khác với map gốc (cây đã chặt, công trình...) — map thì sinh lại từ seed. */
export function createSaveSnapshot(game) {
  const { player, dayNight } = game;
  const changedObjects = game.world.objects
    .filter((object) => object.isDepleted || object.health < (HARVEST[object.type].maxHealth ?? 0))
    .map((object) => [object.id, object.health, object.isDepleted ? 1 : 0, Math.round(object.regrowTimer)]);
  return {
    version: SAVE.version,
    worldId: game.worldId,
    dayNumber: getDayNumber(dayNight), // để hiện trong danh sách thế giới
    seedText: game.seedText,
    elapsedSeconds: game.elapsedSeconds,
    nightsSurvived: game.nightsSurvived,
    zombiesKilled: game.zombiesKilled,
    clockSeconds: dayNight.clockSeconds,
    wave: { ...dayNight.wave },
    player: {
      x: player.x,
      y: player.y,
      health: player.health,
      hunger: player.hunger,
      stamina: player.stamina,
      selectedSlot: player.selectedSlot,
      gunMagazine: player.gunMagazine,
    },
    inventory: serializeInventory(game.inventory),
    structures: game.structures.map((structure) => [
      structure.structureType,
      structure.tileX,
      structure.tileY,
      Math.round(structure.health),
    ]),
    respawnBedIndex: game.structures.indexOf(game.respawnBed),
    objects: changedObjects,
    plots: serializePlots(game),
    farmAnimals: serializeFarmAnimals(game),
  };
}

function restorePlayer(player, saved) {
  player.x = saved.x;
  player.y = saved.y;
  player.health = clamp(saved.health, 1, SURVIVAL.maxHealth);
  player.hunger = clamp(saved.hunger, 0, SURVIVAL.maxHunger);
  player.stamina = clamp(saved.stamina, 0, SURVIVAL.maxStamina);
  player.selectedSlot = saved.selectedSlot ?? 0;
  player.gunMagazine = saved.gunMagazine ?? 0;
}

function restoreStructures(game, savedStructures, respawnBedIndex) {
  savedStructures.forEach(([structureType, tileX, tileY, health], index) => {
    if (!STRUCTURES[structureType] || !isInsideMap(game.world, tileX, tileY)) return;
    const structure = addStructure(game, structureType, tileX, tileY, health);
    if (index === respawnBedIndex) game.respawnBed = structure;
  });
}

function restoreObjects(game, savedObjects) {
  for (const [id, health, isDepleted, regrowTimer] of savedObjects) {
    const object = game.world.objects[id];
    if (object) applySavedResourceState(game, object, { health, isDepleted: isDepleted === 1, regrowTimer });
  }
}

/** Dựng lại phiên chơi từ bản lưu. Bản lưu hỏng / khác phiên bản thì trả về null. */
export function restoreGameSession(snapshot) {
  if (!snapshot || snapshot.version !== SAVE.version || typeof snapshot.seedText !== 'string') return null;
  try {
    const game = createGameSession(snapshot.seedText, snapshot.worldId ?? createWorldId());
    game.elapsedSeconds = snapshot.elapsedSeconds;
    game.nightsSurvived = snapshot.nightsSurvived;
    game.zombiesKilled = snapshot.zombiesKilled ?? 0;
    game.dayNight.clockSeconds = snapshot.clockSeconds;
    game.dayNight.wasNight = isNight(game.dayNight); // không báo "đêm bắt đầu" lại lần nữa
    game.dayNight.wave = { ...game.dayNight.wave, ...snapshot.wave };
    restorePlayer(game.player, snapshot.player);
    game.inventory = deserializeInventory(snapshot.inventory); // tự bỏ qua vật phẩm không còn tồn tại
    restoreObjects(game, snapshot.objects);
    restoreStructures(game, snapshot.structures, snapshot.respawnBedIndex);
    restorePlots(game, snapshot.plots);
    // Bản lưu cũ (trước khi có vật nuôi) thì rải đàn vật nuôi mới; còn lại thì lấy đúng đàn đã nuôi.
    const hasSavedFarm = Array.isArray(snapshot.farmAnimals);
    spawnInitialAnimals(game, !hasSavedFarm);
    if (hasSavedFarm) restoreFarmAnimals(game, snapshot.farmAnimals);
    return game;
  } catch {
    return null;
  }
}
