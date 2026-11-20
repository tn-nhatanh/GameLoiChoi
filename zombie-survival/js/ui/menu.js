// Các màn menu dạng DOM: menu chính, tạo game (nhập seed), danh sách thế giới đã lưu, cách chơi, cài đặt, tạm dừng, game over.
// Chỉ hiển thị theo appState.screen (state.js); các việc như bắt đầu chơi / tải thế giới thì gọi callbacks do main.js cung cấp.
// Phần HTML nằm trong index.html (các <section data-screen="...">); danh sách thế giới đọc từ utils/storage.js.

import { SCREENS, changeScreen, onScreenChange } from '../state.js';
import { SEED } from '../config.js';
import { listSavedWorlds, saveSettings } from '../utils/storage.js';
import { randomInt } from '../utils/math.js';

const SAVED_TIME_FORMAT = { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' };

function createRandomSeedText() {
  return String(randomInt(Math.random, 1, SEED.maxRandomSeed));
}

function formatSavedTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleString('vi-VN', SAVED_TIME_FORMAT);
  } catch {
    return '';
  }
}

function showOnlyScreen(menuLayer, screenName) {
  for (const section of menuLayer.querySelectorAll('[data-screen]')) {
    section.hidden = section.dataset.screen !== screenName;
  }
  menuLayer.hidden = screenName === SCREENS.PLAYING;
}

/**
 * Đưa focus vào nút chính để chơi bằng bàn phím (Tab/Enter) được ngay.
 * Chỉ focus nút, không focus ô nhập — tránh bàn phím ảo trên điện thoại tự bật lên.
 */
function focusFirstButton(menuLayer, screenName) {
  const section = menuLayer.querySelector(`[data-screen="${screenName}"]`);
  const target = section?.querySelector('[data-autofocus]') ?? section?.querySelector('button:not([hidden])');
  target?.focus({ preventScroll: true });
}

/** Nút "Tiếp tục" (thế giới chơi gần nhất) và nút "Thế giới đã lưu" chỉ hiện khi có bản lưu. */
function refreshMainMenu(appState, savedWorlds) {
  const continueButton = document.getElementById('continue-button');
  const worldsButton = document.getElementById('worlds-button');
  const latest = savedWorlds[0];
  continueButton.hidden = !latest;
  worldsButton.hidden = savedWorlds.length === 0;
  if (latest) continueButton.textContent = `Tiếp tục · Đảo ${latest.seedText}`;
  worldsButton.textContent = `Thế giới đã lưu (${savedWorlds.length})`;
  document.getElementById('best-nights-label').textContent = `Kỷ lục: ${appState.bestNights} đêm`;
}

function refreshPauseScreen(appState) {
  const game = appState.game;
  document.getElementById('pause-seed').textContent = game ? `Đảo ${game.seedText} · đã sống sót ${game.nightsSurvived} đêm` : '';
  document.getElementById('pause-saved').textContent = appState.lastSavedAt
    ? `Đã tự lưu lúc ${formatSavedTime(appState.lastSavedAt)}`
    : '';
}

function refreshGameOver(appState) {
  const result = appState.lastResult;
  if (!result) return;
  document.getElementById('result-nights').textContent = String(result.nightsSurvived);
  document.getElementById('result-best').textContent = String(result.bestNights);
  document.getElementById('result-kills').textContent = `Đã hạ ${result.zombiesKilled} zombie · Đảo ${result.seedText}`;
}

// ---------- Danh sách thế giới ----------

/** Tạo một dòng thế giới bằng DOM (textContent) — seed do người chơi tự gõ nên không chèn thẳng vào HTML. */
function createWorldRow(world) {
  const row = document.createElement('li');
  row.className = 'world-row';

  const info = document.createElement('div');
  info.className = 'world-info';
  const title = document.createElement('span');
  title.className = 'world-title';
  title.textContent = `Đảo ${world.seedText}`;
  const meta = document.createElement('span');
  meta.className = 'muted-text world-meta';
  meta.textContent = `Ngày ${world.dayNumber} · sống sót ${world.nightsSurvived} đêm · ${formatSavedTime(world.savedAt)}`;
  info.append(title, meta);

  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'craft-button';
  playButton.dataset.worldPlay = world.id;
  playButton.textContent = 'Chơi';
  playButton.setAttribute('aria-label', `Chơi tiếp đảo ${world.seedText}`);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'world-delete-button';
  deleteButton.dataset.worldDelete = world.id;
  deleteButton.textContent = 'Xoá';
  deleteButton.setAttribute('aria-label', `Xoá đảo ${world.seedText}`);

  row.append(info, playButton, deleteButton);
  return row;
}

function renderWorldList(savedWorlds) {
  const list = document.getElementById('world-list');
  list.replaceChildren(...savedWorlds.map(createWorldRow));
  document.getElementById('world-list-empty').hidden = savedWorlds.length > 0;
}

/**
 * Bấm "Xoá" lần đầu chỉ hỏi lại ("Xoá thật?"), bấm lần nữa mới xoá — tránh lỡ tay mất thế giới.
 * Trả về true nếu đã xoá.
 */
function handleDeleteClick(button, onDeleteWorld) {
  if (button.dataset.confirming !== 'true') {
    button.dataset.confirming = 'true';
    button.textContent = 'Xoá thật?';
    button.classList.add('is-confirming');
    return false;
  }
  onDeleteWorld(button.dataset.worldDelete);
  return true;
}

function bindWorldList(appState, callbacks) {
  document.getElementById('world-list').addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const playButton = target?.closest('[data-world-play]');
    if (playButton) {
      callbacks.onLoadWorld(playButton.dataset.worldPlay);
      return;
    }
    const deleteButton = target?.closest('[data-world-delete]');
    if (!deleteButton || !handleDeleteClick(deleteButton, callbacks.onDeleteWorld)) return;
    const savedWorlds = listSavedWorlds();
    renderWorldList(savedWorlds);
    refreshMainMenu(appState, savedWorlds);
    if (savedWorlds.length === 0) changeScreen(appState, SCREENS.MAIN_MENU);
  });
}

// ---------- Cài đặt ----------

/** Gắn form Cài đặt với appState.settings, lưu ngay khi người chơi thay đổi. */
function bindSettingsForm(appState, onSettingsChange) {
  const soundInput = document.getElementById('setting-sound');
  const shakeInput = document.getElementById('setting-shake');
  const sizeInputs = document.querySelectorAll('input[name="touch-size"]');

  function fillForm() {
    soundInput.checked = appState.settings.soundOn;
    shakeInput.checked = appState.settings.screenShake;
    for (const input of sizeInputs) input.checked = input.value === appState.settings.touchSize;
  }

  function readForm() {
    appState.settings.soundOn = soundInput.checked;
    appState.settings.screenShake = shakeInput.checked;
    const checkedSize = [...sizeInputs].find((input) => input.checked);
    if (checkedSize) appState.settings.touchSize = checkedSize.value;
    saveSettings(appState.settings);
    onSettingsChange(appState.settings);
  }

  document.getElementById('settings-form').addEventListener('change', readForm);
  return fillForm;
}

/**
 * callbacks = { onStartGame(seedText), onContinue(), onLoadWorld(worldId), onDeleteWorld(worldId),
 *               onPause(), onResume(), onQuitToMenu(), onPlayAgain(), onSettingsChange(settings) }
 */
export function setupMenus(appState, callbacks) {
  const menuLayer = document.getElementById('menu-layer');
  const seedInput = document.getElementById('seed-input');
  const fillSettingsForm = bindSettingsForm(appState, callbacks.onSettingsChange);
  bindWorldList(appState, callbacks);

  const fillRandomSeed = () => {
    seedInput.value = createRandomSeedText();
  };

  // Mở màn phụ (Cài đặt / Cách chơi) và nhớ màn hiện tại để "Quay lại" đúng chỗ.
  const openSubScreen = (screenName) => {
    appState.returnScreen = appState.screen;
    changeScreen(appState, screenName);
  };

  const menuActions = {
    newGame: () => {
      fillRandomSeed();
      changeScreen(appState, SCREENS.NEW_GAME);
    },
    continue: callbacks.onContinue,
    worlds: () => changeScreen(appState, SCREENS.WORLDS),
    howToPlay: () => openSubScreen(SCREENS.HOW_TO_PLAY),
    settings: () => openSubScreen(SCREENS.SETTINGS),
    back: () => changeScreen(appState, appState.returnScreen),
    mainMenu: () => changeScreen(appState, SCREENS.MAIN_MENU),
    randomSeed: fillRandomSeed,
    pause: callbacks.onPause,
    resume: callbacks.onResume,
    quitToMenu: callbacks.onQuitToMenu,
    playAgain: callbacks.onPlayAgain,
  };

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-menu]') : null;
    if (button) menuActions[button.dataset.menu]?.();
  });

  document.getElementById('new-game-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const seedText = seedInput.value.trim() || createRandomSeedText();
    callbacks.onStartGame(seedText);
  });

  function renderScreen(screenName) {
    const savedWorlds = listSavedWorlds();
    refreshMainMenu(appState, savedWorlds);
    refreshPauseScreen(appState);
    refreshGameOver(appState);
    if (screenName === SCREENS.WORLDS) renderWorldList(savedWorlds);
    if (screenName === SCREENS.SETTINGS) fillSettingsForm();
    showOnlyScreen(menuLayer, screenName);
    focusFirstButton(menuLayer, screenName);
  }

  onScreenChange(appState, renderScreen);
  renderScreen(appState.screen);
}
