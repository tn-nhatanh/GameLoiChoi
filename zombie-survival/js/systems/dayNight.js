// Chu kỳ ngày đêm và các đợt zombie ban đêm.
// Thời gian là một đồng hồ đếm giây liên tục; "giờ trong ngày" = phần lẻ của (đồng hồ / độ dài ngày), 0 = bình minh.
// Khi trời chuyển sang đêm: lên kế hoạch đợt zombie; khi rạng sáng: cộng điểm và cho zombie tan biến.
// Dùng DAY_NIGHT/WAVES trong config.js, entities/zombie.js để sinh zombie; render/effects.js đọc độ tối.

import { DAY_NIGHT, WAVES } from '../config.js';
import { spawnZombieNearPlayer } from '../entities/zombie.js';
import { clamp, pickWeighted } from '../utils/math.js';
import { emit } from '../utils/events.js';

const WAVE_RETRY_SECONDS = 1; // không tìm được chỗ / đủ zombie rồi thì thử lại sau 1 giây

export function createDayNightState(clockSeconds = DAY_NIGHT.startTimeOfDay * DAY_NIGHT.dayLengthSeconds) {
  return {
    clockSeconds,
    wasNight: false,
    wave: { nightNumber: 0, remaining: 0, spawnTimer: 0, intervalSeconds: 1 },
  };
}

/** Giờ trong ngày, từ 0 (bình minh) đến gần 1. */
export function getTimeOfDay(dayNight) {
  return (dayNight.clockSeconds / DAY_NIGHT.dayLengthSeconds) % 1;
}

/** Ngày thứ mấy (bắt đầu từ 1). Đêm của ngày N gọi là "Đêm N". */
export function getDayNumber(dayNight) {
  return Math.floor(dayNight.clockSeconds / DAY_NIGHT.dayLengthSeconds) + 1;
}

export function isNight(dayNight) {
  const timeOfDay = getTimeOfDay(dayNight);
  return timeOfDay >= DAY_NIGHT.nightStart && timeOfDay < DAY_NIGHT.dawnStart;
}

function smoothStep(edgeStart, edgeEnd, value) {
  const t = clamp((value - edgeStart) / (edgeEnd - edgeStart), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Độ tối của lớp phủ (0 = sáng hẳn, maxDarkness = tối nhất):
 * tăng mượt trong lúc chạng vạng (duskStart → nightStart), giữ nguyên suốt đêm,
 * rồi giảm mượt khi rạng sáng (dawnStart → hết ngày).
 */
export function getDarkness(dayNight) {
  const timeOfDay = getTimeOfDay(dayNight);
  const fadeIn = smoothStep(DAY_NIGHT.duskStart, DAY_NIGHT.nightStart, timeOfDay);
  const fadeOut = 1 - smoothStep(DAY_NIGHT.dawnStart, 1, timeOfDay);
  return DAY_NIGHT.maxDarkness * Math.min(fadeIn, fadeOut);
}

/** Tiến độ của pha hiện tại (0..1) để vẽ thanh thời gian trên HUD. */
export function getPhaseProgress(dayNight) {
  const timeOfDay = getTimeOfDay(dayNight);
  if (isNight(dayNight)) return (timeOfDay - DAY_NIGHT.nightStart) / (DAY_NIGHT.dawnStart - DAY_NIGHT.nightStart);
  const dayLength = 1 - (DAY_NIGHT.dawnStart - DAY_NIGHT.nightStart);
  const sinceDawn = (timeOfDay - DAY_NIGHT.dawnStart + 1) % 1;
  return sinceDawn / dayLength;
}

// ---------- Đợt zombie ----------

/** Số zombie của đêm N, rải đều trong spawnWindowFraction đầu đêm. */
function planWave(nightNumber) {
  const total = Math.min(WAVES.maxCount, WAVES.baseCount + WAVES.extraPerNight * (nightNumber - 1));
  const nightSeconds = (DAY_NIGHT.dawnStart - DAY_NIGHT.nightStart) * DAY_NIGHT.dayLengthSeconds;
  return {
    nightNumber,
    remaining: total,
    spawnTimer: 0,
    intervalSeconds: (nightSeconds * WAVES.spawnWindowFraction) / total,
  };
}

/** Đêm càng muộn càng nhiều zombie chạy nhanh và zombie to khoẻ. */
function pickZombieVariant(nightNumber) {
  const weights = { normal: 1 };
  if (nightNumber >= WAVES.runnerFromNight) {
    const nightsIn = nightNumber - WAVES.runnerFromNight + 1;
    weights.runner = Math.min(WAVES.runnerMaxWeight, WAVES.runnerWeightPerNight * nightsIn);
  }
  if (nightNumber >= WAVES.bruteFromNight) {
    const nightsIn = nightNumber - WAVES.bruteFromNight + 1;
    weights.brute = Math.min(WAVES.bruteMaxWeight, WAVES.bruteWeightPerNight * nightsIn);
  }
  return pickWeighted(Math.random, weights);
}

function startNight(game) {
  const nightNumber = getDayNumber(game.dayNight);
  game.dayNight.wave = planWave(nightNumber);
  emit(game, 'sound', { name: 'nightStart' });
  emit(game, 'toast', { text: `Đêm ${nightNumber} buông xuống… Zombie đang tới!` });
}

function endNight(game) {
  game.nightsSurvived += 1;
  game.dayNight.wave.remaining = 0;
  for (const zombie of game.zombies) zombie.isFading = true;
  emit(game, 'sound', { name: 'dawn' });
  emit(game, 'toast', { text: `Trời sáng rồi! Đã sống sót ${game.nightsSurvived} đêm.` });
}

function spawnWaveZombies(game, deltaSeconds) {
  const wave = game.dayNight.wave;
  wave.spawnTimer -= deltaSeconds;
  if (wave.remaining <= 0 || wave.spawnTimer > 0) return;
  if (game.zombies.length >= WAVES.maxAlive) {
    wave.spawnTimer = WAVE_RETRY_SECONDS;
    return;
  }
  const didSpawn = spawnZombieNearPlayer(game, pickZombieVariant(wave.nightNumber), wave.nightNumber);
  if (didSpawn) wave.remaining -= 1;
  wave.spawnTimer = didSpawn ? wave.intervalSeconds : WAVE_RETRY_SECONDS;
}

export function updateDayNight(game, deltaSeconds) {
  const dayNight = game.dayNight;
  dayNight.clockSeconds += deltaSeconds;
  const night = isNight(dayNight);
  if (night && !dayNight.wasNight) startNight(game);
  else if (!night && dayNight.wasNight) endNight(game);
  dayNight.wasNight = night;
  if (night) spawnWaveZombies(game, deltaSeconds);
}
