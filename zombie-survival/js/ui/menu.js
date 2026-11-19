// Các màn menu dạng DOM: menu chính, tạo game (nhập seed), cách chơi, cài đặt, tạm dừng, game over.
// Chỉ hiển thị theo appState.screen (state.js); các việc như bắt đầu chơi thì gọi callbacks do main.js cung cấp.
// Phần HTML nằm trong index.html (các <section data-screen="...">).

import { SCREENS, changeScreen, onScreenChange } from '../state.js';
import { SEED } from '../config.js';
import { hasSavedGame, saveSettings } from '../utils/storage.js';
import { randomInt } from '../utils/math.js';

function createRandomSeedText() {
  return String(randomInt(Math.random, 1, SEED.maxRandomSeed));
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

function refreshDynamicTexts(appState) {
  document.getElementById('continue-button').hidden = !hasSavedGame();
  document.getElementById('best-nights-label').textContent = `Kỷ lục: ${appState.bestNights} đêm`;
  document.getElementById('pause-seed').textContent = appState.game ? `Seed đảo: ${appState.game.seedText}` : '';
  if (appState.lastResult) {
    const result = appState.lastResult;
    document.getElementById('result-nights').textContent = String(result.nightsSurvived);
    document.getElementById('result-best').textContent = String(result.bestNights);
    document.getElementById('result-kills').textContent = `Đã hạ ${result.zombiesKilled} zombie · Đảo ${result.seedText}`;
  }
}

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
 * callbacks = { onStartGame(seedText), onContinue(), onPause(), onResume(),
 *               onQuitToMenu(), onPlayAgain(), onSettingsChange(settings) }
 */
export function setupMenus(appState, callbacks) {
  const menuLayer = document.getElementById('menu-layer');
  const seedInput = document.getElementById('seed-input');
  const fillSettingsForm = bindSettingsForm(appState, callbacks.onSettingsChange);

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
    refreshDynamicTexts(appState);
    if (screenName === SCREENS.SETTINGS) fillSettingsForm();
    showOnlyScreen(menuLayer, screenName);
    focusFirstButton(menuLayer, screenName);
  }

  onScreenChange(appState, renderScreen);
  renderScreen(appState.screen);
}
