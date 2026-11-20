// Lưu và tải dữ liệu bằng localStorage: cài đặt, kỷ lục, và NHIỀU thế giới đã lưu (mỗi đảo một bản lưu riêng).
// Mọi thao tác đều bọc try/catch vì localStorage có thể bị chặn (chế độ ẩn danh, hết dung lượng...).
// Cấu trúc: một "mục lục" nhỏ (danh sách thế giới + thông tin tóm tắt) và mỗi thế giới một khoá riêng chứa bản lưu đầy đủ.

import { STORAGE_KEYS, DEFAULT_SETTINGS, TOUCH_SIZE_SCALES, SAVE } from '../config.js';

function readJson(key, fallbackValue) {
  try {
    const rawText = window.localStorage.getItem(key);
    return rawText === null ? fallbackValue : JSON.parse(rawText);
  } catch {
    return fallbackValue;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeKey(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Không xoá được thì bỏ qua, game vẫn chạy bình thường.
  }
}

// ---------- Cài đặt & kỷ lục ----------

/** Gộp cài đặt đã lưu với mặc định, loại bỏ giá trị không hợp lệ. */
export function loadSettings() {
  const stored = readJson(STORAGE_KEYS.settings, {});
  const settings = { ...DEFAULT_SETTINGS };
  if (typeof stored.soundOn === 'boolean') settings.soundOn = stored.soundOn;
  if (typeof stored.screenShake === 'boolean') settings.screenShake = stored.screenShake;
  if (stored.touchSize in TOUCH_SIZE_SCALES) settings.touchSize = stored.touchSize;
  return settings;
}

export function saveSettings(settings) {
  return writeJson(STORAGE_KEYS.settings, settings);
}

export function loadBestNights() {
  const value = readJson(STORAGE_KEYS.bestNights, 0);
  return Number.isFinite(value) ? value : 0;
}

export function saveBestNights(nights) {
  return writeJson(STORAGE_KEYS.bestNights, nights);
}

// ---------- Nhiều thế giới ----------

function worldKey(worldId) {
  return STORAGE_KEYS.worldPrefix + worldId;
}

/** Tạo ID ngắn, gần như không trùng: thời gian + chút ngẫu nhiên. */
export function createWorldId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function readWorldIndex() {
  const index = readJson(STORAGE_KEYS.worldIndex, []);
  return Array.isArray(index) ? index.filter((entry) => entry && typeof entry.id === 'string') : [];
}

function writeWorldIndex(index) {
  return writeJson(STORAGE_KEYS.worldIndex, index);
}

/** Thông tin tóm tắt để hiện trong danh sách (không cần đọc cả bản lưu). */
function summarize(snapshot) {
  return {
    id: snapshot.worldId,
    seedText: snapshot.seedText,
    nightsSurvived: snapshot.nightsSurvived,
    dayNumber: snapshot.dayNumber ?? 1,
    savedAt: Date.now(),
  };
}

/**
 * Bản lưu kiểu cũ (chỉ một ô) → chuyển sang dạng nhiều thế giới, để người chơi cũ không mất tiến trình.
 * Chỉ chạy một lần: xong thì xoá khoá cũ.
 */
function migrateLegacySave() {
  const legacy = readJson(STORAGE_KEYS.legacySave, null);
  if (!legacy || typeof legacy.seedText !== 'string') return;
  legacy.worldId = legacy.worldId ?? createWorldId();
  saveWorld(legacy);
  removeKey(STORAGE_KEYS.legacySave);
}

/** Danh sách thế giới đã lưu, mới chơi gần nhất đứng đầu. */
export function listSavedWorlds() {
  migrateLegacySave();
  return readWorldIndex().sort((first, second) => second.savedAt - first.savedAt);
}

export function loadWorld(worldId) {
  const snapshot = readJson(worldKey(worldId), null);
  return snapshot && typeof snapshot.seedText === 'string' ? snapshot : null;
}

export function deleteWorld(worldId) {
  removeKey(worldKey(worldId));
  writeWorldIndex(readWorldIndex().filter((entry) => entry.id !== worldId));
}

/**
 * Lưu (hoặc ghi đè) một thế giới. Quá SAVE.maxWorlds thế giới thì xoá thế giới lâu không chơi nhất.
 * Trả về thời điểm lưu (ms) hoặc null nếu không lưu được.
 */
export function saveWorld(snapshot) {
  if (!writeJson(worldKey(snapshot.worldId), snapshot)) return null;
  const summary = summarize(snapshot);
  const index = readWorldIndex().filter((entry) => entry.id !== snapshot.worldId);
  index.push(summary);
  index.sort((first, second) => second.savedAt - first.savedAt);
  for (const oldEntry of index.splice(SAVE.maxWorlds)) removeKey(worldKey(oldEntry.id));
  return writeWorldIndex(index) ? summary.savedAt : null;
}
