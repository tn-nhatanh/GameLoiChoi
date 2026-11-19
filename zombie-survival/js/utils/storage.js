// Lưu và tải dữ liệu bằng localStorage: cài đặt, kỷ lục, và bản lưu game.
// Mọi thao tác đều bọc try/catch vì localStorage có thể bị chặn (chế độ ẩn danh, hết dung lượng...).
// Dùng bởi state.js (cài đặt, kỷ lục) và main.js (tự động lưu — hoàn thiện ở giai đoạn 7).

import { STORAGE_KEYS, DEFAULT_SETTINGS, TOUCH_SIZE_SCALES } from '../config.js';

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

export function hasSavedGame() {
  return loadGame() !== null;
}

export function loadGame() {
  const saved = readJson(STORAGE_KEYS.save, null);
  return saved && typeof saved.seedText === 'string' ? saved : null;
}

export function saveGame(snapshot) {
  return writeJson(STORAGE_KEYS.save, snapshot);
}

export function clearSavedGame() {
  removeKey(STORAGE_KEYS.save);
}
