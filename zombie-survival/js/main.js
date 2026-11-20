// Điểm khởi động: tạo canvas, nối các module (input, menu, HUD, bảng chế tạo, âm thanh, renderer) và chạy vòng lặp game.
// Vòng lặp dùng requestAnimationFrame, dt tính theo thời gian thực (giây) nên tốc độ game như nhau trên mọi máy.
// Thứ tự cập nhật mỗi frame xem ở hàm simulateWorld(); các system gửi sự kiện qua game.events (utils/events.js).

import { LOOP, DISPLAY, SAVE, SURVIVAL, PICKUPS, INVENTORY, AUDIO } from './config.js';
import {
  SCREENS,
  createAppState,
  changeScreen,
  onScreenChange,
  isPlaying,
  startNewGameSession,
  restoreGameSession,
  createSaveSnapshot,
} from './state.js';
import { Input, DEVICES } from './input.js';
import { updatePlayer } from './entities/player.js';
import { updateZombies } from './entities/zombie.js';
import { updateAnimals } from './entities/animal.js';
import { updateBullets } from './entities/bullet.js';
import { updatePickups, spawnPickup } from './entities/pickup.js';
import { fitCameraToViewport, snapCameraToTarget, followTarget, worldToScreen, screenToWorld } from './world/camera.js';
import { updateDayNight } from './systems/dayNight.js';
import { updateSurvival, updateSleep, handlePlayerDeath } from './systems/survival.js';
import { updateFlowField } from './systems/pathfinding.js';
import { updateRegrowth, updateHitShakes } from './systems/gathering.js';
import { updateBuildGhost, updateStructureTimers } from './systems/building.js';
import { updateReload, resolveBulletHits, updateTraps, startReload } from './systems/combat.js';
import { craftRecipe } from './systems/crafting.js';
import { moveSlot, takeFromSlot } from './systems/inventory.js';
import { selectHotbarSlot, cycleHotbar, cycleBuildSelection } from './systems/items.js';
import { INTERACTION, findInteraction, performInteraction, usePrimaryAction } from './systems/interaction.js';
import { createRenderer } from './render/renderer.js';
import {
  createEffects,
  clearEffects,
  updateEffects,
  spawnParticles,
  spawnDamageNumber,
  addShake,
} from './render/effects.js';
import { setupMenus } from './ui/menu.js';
import { setupHud } from './ui/hud.js';
import { createMinimap } from './ui/minimap.js';
import { setupCraftingPanel } from './ui/craftingPanel.js';
import { setupTouchControls, preventPageGestures } from './ui/touchControls.js';
import { createAudio } from './utils/audio.js';
import { listSavedWorlds, loadWorld, saveWorld, deleteWorld, saveBestNights } from './utils/storage.js';
import { drainEvents } from './utils/events.js';
import { clamp } from './utils/math.js';

const DROP_DISTANCE = 30; // vứt đồ ra trước mặt chừng này px
const MIN_AUDIBLE_VOLUME = 0.02;

// =====================================================================
// Màn hình & kích thước
// =====================================================================

/** Canvas phủ toàn màn hình; vẽ theo pixel thật (nhân pixelRatio) để hình không bị mờ. */
function resizeCanvas(canvas, viewport) {
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;
  viewport.pixelRatio = Math.min(window.devicePixelRatio || 1, DISPLAY.maxPixelRatio);
  canvas.width = Math.round(viewport.width * viewport.pixelRatio);
  canvas.height = Math.round(viewport.height * viewport.pixelRatio);
}

function watchReducedMotion(appState) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => {
    appState.reducedMotion = query.matches;
  };
  apply();
  query.addEventListener('change', apply);
}

/** HUD chỉ hiện khi đang chơi; nút cảm ứng chỉ hiện khi đang chơi bằng màn hình chạm và bảng chế tạo đóng. */
function syncOverlays(app) {
  const playing = isPlaying(app.state);
  const usingTouch = app.input.device === DEVICES.TOUCH;
  document.body.classList.toggle('is-touch', usingTouch);
  app.hud.setVisible(playing);
  app.touchControls.setVisible(playing && usingTouch && !app.craftingPanel.isOpen());
}

// =====================================================================
// Phiên chơi: bắt đầu, lưu, kết thúc
// =====================================================================

/** Lưu thế giới đang chơi vào ô lưu riêng của nó (theo game.worldId). */
function saveCurrentGame(app) {
  const game = app.state.game;
  if (!game || game.player.isDead) return;
  const savedAt = saveWorld(createSaveSnapshot(game));
  if (savedAt) app.state.lastSavedAt = savedAt;
}

function startSession(app, game) {
  fitCameraToViewport(game.camera, app.viewport);
  snapCameraToTarget(game.camera, game.player, game.world);
  app.state.game = game;
  app.autosaveTimer = SAVE.autosaveSeconds;
  app.wasPrimaryHeld = false;
  app.input.releaseAll();
  clearEffects(app.effects);
  app.hud.invalidate();
  changeScreen(app.state, SCREENS.PLAYING);
  saveCurrentGame(app);
}

function startNewGame(app, seedText) {
  startSession(app, startNewGameSession(seedText));
  const tip = app.input.device === DEVICES.TOUCH ? 'bấm "Dùng"' : 'bấm E';
  app.hud.showToast(`Đảo ${seedText} · Lại gần cây và ${tip} để chặt gỗ!`);
}

/** Vào lại một thế giới đã lưu; không truyền worldId thì lấy thế giới chơi gần nhất. */
function continueSavedWorld(app, worldId = listSavedWorlds()[0]?.id) {
  const game = worldId ? restoreGameSession(loadWorld(worldId)) : null;
  if (!game) {
    if (worldId) deleteWorld(worldId); // bản lưu hỏng thì bỏ đi
    changeScreen(app.state, SCREENS.MAIN_MENU);
    return;
  }
  startSession(app, game);
  app.hud.showToast(`Chào mừng trở lại đảo ${game.seedText}! Đã sống sót ${game.nightsSurvived} đêm.`);
}

function endGame(app) {
  const game = app.state.game;
  const appState = app.state;
  appState.bestNights = Math.max(appState.bestNights, game.nightsSurvived);
  saveBestNights(appState.bestNights);
  deleteWorld(game.worldId); // chết là hết: thế giới này không chơi tiếp được (vẫn có thể chơi lại đảo cùng seed)
  appState.lastResult = {
    nightsSurvived: game.nightsSurvived,
    bestNights: appState.bestNights,
    zombiesKilled: game.zombiesKilled,
    seedText: game.seedText,
  };
  changeScreen(appState, SCREENS.GAME_OVER);
}

function openCraftingPanel(app) {
  app.craftingPanel.open(app.state.game);
  app.input.releaseAll();
  app.audio.play('click');
  syncOverlays(app);
}

function closeCraftingPanel(app) {
  app.craftingPanel.close();
  app.input.releaseAll();
  syncOverlays(app);
}

function dropSlotOnGround(app, slotIndex) {
  const game = app.state.game;
  const taken = takeFromSlot(game.inventory, slotIndex, Infinity);
  if (!taken) return;
  const { player } = game;
  spawnPickup(
    game,
    taken.itemId,
    taken.count,
    player.x + player.facingX * DROP_DISTANCE,
    player.y + player.facingY * DROP_DISTANCE,
    PICKUPS.droppedPickupDelaySeconds,
  );
}

function createMenuCallbacks(app) {
  return {
    onStartGame: (seedText) => startNewGame(app, seedText),
    onContinue: () => continueSavedWorld(app),
    onLoadWorld: (worldId) => continueSavedWorld(app, worldId),
    onDeleteWorld: (worldId) => deleteWorld(worldId),
    onPause: () => {
      if (!isPlaying(app.state)) return;
      saveCurrentGame(app);
      changeScreen(app.state, SCREENS.PAUSED);
    },
    onResume: () => {
      app.input.releaseAll();
      changeScreen(app.state, SCREENS.PLAYING);
    },
    onQuitToMenu: () => {
      saveCurrentGame(app);
      if (app.craftingPanel.isOpen()) closeCraftingPanel(app);
      app.state.game = null;
      changeScreen(app.state, SCREENS.MAIN_MENU);
    },
    onPlayAgain: () => startNewGame(app, app.state.lastResult?.seedText ?? app.state.game?.seedText ?? '1'),
    onSettingsChange: (settings) => {
      app.touchControls.setSizeName(settings.touchSize);
      app.audio.setEnabled(settings.soundOn);
    },
  };
}

function createCraftingCallbacks(app) {
  return {
    onClose: () => closeCraftingPanel(app),
    onCraft: (recipeId) => {
      const result = craftRecipe(app.state.game, recipeId);
      if (!result.ok && result.reason === 'full') app.audio.play('error');
      return result;
    },
    onMoveSlot: (fromIndex, toIndex) => moveSlot(app.state.game.inventory, fromIndex, toIndex),
    onDropSlot: (slotIndex) => dropSlotOnGround(app, slotIndex),
  };
}

// =====================================================================
// Sự kiện từ các system → âm thanh, hiệu ứng, HUD
// =====================================================================

/** Tiếng ở xa nhỏ dần theo khoảng cách tới người chơi. */
function playEventSound(app, event) {
  let volume = 1;
  if (event.x !== undefined) {
    const { player } = app.state.game;
    volume = clamp(1 - Math.hypot(event.x - player.x, event.y - player.y) / AUDIO.hearingDistance, 0, 1);
  }
  if (volume > MIN_AUDIBLE_VOLUME) app.audio.play(event.name, volume);
}

function handleGameEvent(app, event) {
  const { settings, reducedMotion } = app.state;
  if (event.type === 'sound') playEventSound(app, event);
  else if (event.type === 'particles') spawnParticles(app.effects, event.preset, event.x, event.y, event.count, reducedMotion);
  else if (event.type === 'damageNumber') spawnDamageNumber(app.effects, event.x, event.y, event.amount, event.isHeal);
  else if (event.type === 'shake' && settings.screenShake && !reducedMotion) addShake(app.effects, event.strength);
  else if (event.type === 'toast') app.hud.showToast(event.text);
  else if (event.type === 'playerHurt') app.hud.flashHurt();
  else if (event.type === 'openCrafting' && !app.craftingPanel.isOpen()) openCraftingPanel(app);
}

function processGameEvents(app) {
  if (app.state.game) drainEvents(app.state.game, (event) => handleGameEvent(app, event));
}

// =====================================================================
// Điều khiển → hành động
// =====================================================================

/** Đọc input một lần mỗi frame, ghi vào object controls dùng lại. */
function readControls(app) {
  const { input, controls } = app;
  const { player, camera } = app.state.game;
  const move = input.getMoveVector();
  controls.moveX = move.x;
  controls.moveY = move.y;

  const playerOnScreen = worldToScreen(camera, player.x, player.y, app.screenPoint);
  const aim = input.getAimDirection(playerOnScreen.x, playerOnScreen.y);
  controls.hasAim = aim !== null;
  controls.aimX = aim ? aim.x : 0;
  controls.aimY = aim ? aim.y : 0;
  controls.wantsSprint = input.wantsSprint();

  const primaryHeld = input.isFireHeld();
  controls.primaryPressed = primaryHeld && !app.wasPrimaryHeld;
  controls.primaryHeld = primaryHeld;
  app.wasPrimaryHeld = primaryHeld;

  const usesMouse = input.device === DEVICES.DESKTOP && input.mouse.hasPosition;
  controls.pointerWorld = usesMouse ? screenToWorld(camera, input.mouse.x, input.mouse.y, app.pointerWorld) : null;
}

function handleHotbarKeys(app) {
  const { input } = app;
  const game = app.state.game;
  for (let slot = 1; slot <= INVENTORY.hotbarSize; slot++) {
    if (input.wasActionPressed(`hotbar${slot}`)) selectHotbarSlot(game, slot - 1);
  }
  if (input.wasActionPressed('hotbarNext')) cycleHotbar(game, 1);
  if (input.wasActionPressed('hotbarPrev')) cycleHotbar(game, -1);
}

/** Các hành động bấm một lần (đổi ô, xây, nạp đạn, tương tác) và hành động chính (giữ). */
function handlePlayerActions(app) {
  const { input } = app;
  const game = app.state.game;
  if (game.player.isSleeping || game.player.isDead) return;
  handleHotbarKeys(app);
  if (input.wasActionPressed('build')) cycleBuildSelection(game);
  if (input.wasActionPressed('reload')) startReload(game);
  updateBuildGhost(game, app.controls);
  if (input.wasActionPressed('interact')) performInteraction(game, findInteraction(game, app.interaction));
  usePrimaryAction(game, app.controls);
}

// =====================================================================
// Cập nhật thế giới
// =====================================================================

/** Một bước mô phỏng. Khi ngủ, bước này chạy nhiều lần mỗi frame để thời gian trôi nhanh. */
function simulateWorld(app, deltaSeconds) {
  const game = app.state.game;
  game.elapsedSeconds += deltaSeconds;
  updateDayNight(game, deltaSeconds);
  updatePlayer(game.player, app.controls, deltaSeconds, game.world);
  updateReload(game, deltaSeconds);
  updateSurvival(game, deltaSeconds);
  updateFlowField(game.flowField, game.world, game.player, deltaSeconds);
  updateZombies(game, deltaSeconds);
  updateAnimals(game, deltaSeconds);
  updateBullets(game, deltaSeconds);
  resolveBulletHits(game);
  updateTraps(game);
  updatePickups(game, deltaSeconds);
  updateRegrowth(game, deltaSeconds);
  updateHitShakes(game, deltaSeconds);
  updateStructureTimers(game, deltaSeconds);
}

function checkPlayerDeath(app) {
  const game = app.state.game;
  if (game.player.health > 0 || game.player.isDead) return;
  if (handlePlayerDeath(game) === 'gameOver') endGame(app);
}

function updateAutosave(app, deltaSeconds) {
  app.autosaveTimer -= deltaSeconds;
  if (app.autosaveTimer > 0) return;
  app.autosaveTimer = SAVE.autosaveSeconds;
  saveCurrentGame(app);
}

function updateGameplay(app, deltaSeconds) {
  const game = app.state.game;
  readControls(app);
  updateSleep(game, app.controls.moveX !== 0 || app.controls.moveY !== 0);
  handlePlayerActions(app);
  const steps = game.player.isSleeping ? SURVIVAL.sleepTimeScale : 1;
  for (let step = 0; step < steps; step++) simulateWorld(app, deltaSeconds);
  fitCameraToViewport(game.camera, app.viewport);
  followTarget(game.camera, game.player, game.world, deltaSeconds);
  checkPlayerDeath(app);
  updateAutosave(app, deltaSeconds);
}

/** Phím toàn cục: Esc/P tạm dừng hoặc đóng bảng; Q mở/đóng bảng chế tạo. */
function handleGlobalKeys(app) {
  const { input } = app;
  const screen = app.state.screen;
  const panelOpen = app.craftingPanel.isOpen();
  if (input.wasActionPressed('pause')) {
    if (panelOpen) closeCraftingPanel(app);
    else if (screen === SCREENS.PLAYING) app.menuCallbacks.onPause();
    else if (screen === SCREENS.PAUSED) app.menuCallbacks.onResume();
  }
  if (input.wasActionPressed('craft') && screen === SCREENS.PLAYING) {
    if (panelOpen) closeCraftingPanel(app);
    else openCraftingPanel(app);
  }
}

function updateHudInfo(app) {
  const game = app.state.game;
  if (!game || !isPlaying(app.state)) return;
  findInteraction(game, app.interaction);
  app.hudInfo.interactionLabel = app.interaction.label;
  app.hudInfo.isTouch = app.input.device === DEVICES.TOUCH;
  app.touchControls.setInteractLabel(app.interaction.kind === INTERACTION.PLACE ? 'Đặt' : 'Dùng');
}

function update(app, deltaSeconds) {
  handleGlobalKeys(app);
  const isWorldRunning = isPlaying(app.state) && !app.craftingPanel.isOpen();
  if (isWorldRunning) {
    updateGameplay(app, deltaSeconds);
    updateEffects(app.effects, deltaSeconds, app.state.reducedMotion);
  }
  processGameEvents(app);
  updateHudInfo(app);
  app.hud.update(isPlaying(app.state) ? app.state.game : null, deltaSeconds, app.hudInfo);
}

function render(app) {
  app.renderer.render(app.state, app.viewport, app.effects);
  if (isPlaying(app.state)) app.minimap.draw(app.state.game);
}

// =====================================================================
// Khởi động
// =====================================================================

function createApp() {
  const canvas = document.getElementById('game-canvas');
  const input = new Input(canvas);
  const app = {
    canvas,
    input,
    state: createAppState(),
    viewport: { width: 0, height: 0, pixelRatio: 1 },
    renderer: createRenderer(canvas.getContext('2d')),
    effects: createEffects(),
    audio: createAudio(),
    minimap: createMinimap(document.getElementById('minimap')),
    touchControls: setupTouchControls(input),
    // Object dùng lại mỗi frame để tránh tạo rác.
    controls: {
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      hasAim: false,
      wantsSprint: false,
      primaryHeld: false,
      primaryPressed: false,
      pointerWorld: null,
    },
    interaction: { kind: INTERACTION.NONE, target: null, label: '' },
    hudInfo: { interactionLabel: '', isTouch: false },
    screenPoint: { x: 0, y: 0 },
    pointerWorld: { x: 0, y: 0 },
    wasPrimaryHeld: false,
    autosaveTimer: SAVE.autosaveSeconds,
  };
  app.hud = setupHud({ onSelectSlot: (index) => app.state.game && selectHotbarSlot(app.state.game, index) });
  app.craftingPanel = setupCraftingPanel(createCraftingCallbacks(app));
  return app;
}

function bindWindowEvents(app) {
  const handleResize = () => {
    resizeCanvas(app.canvas, app.viewport);
    app.minimap.markResized();
  };
  window.addEventListener('resize', handleResize);
  window.visualViewport?.addEventListener('resize', handleResize);

  // Chuyển tab / khoá màn hình khi đang chơi thì tự tạm dừng và lưu.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    saveCurrentGame(app);
    if (isPlaying(app.state)) changeScreen(app.state, SCREENS.PAUSED);
  });
  window.addEventListener('pagehide', () => saveCurrentGame(app));

  // Trình duyệt chỉ cho phát tiếng sau lần chạm/bấm đầu tiên.
  const unlockAudio = () => app.audio.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // Tiếng "tách" nhẹ khi bấm nút menu.
  document.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.menu-button, .round-button')) app.audio.play('click');
  });
}

function startLoop(app) {
  let lastTimeMs = performance.now();
  function frame(timeMs) {
    const deltaSeconds = clamp((timeMs - lastTimeMs) / 1000, 0, LOOP.maxDeltaSeconds);
    lastTimeMs = timeMs;
    update(app, deltaSeconds);
    render(app);
    app.input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function boot() {
  const app = createApp();
  app.input.attach();
  preventPageGestures();
  resizeCanvas(app.canvas, app.viewport);
  bindWindowEvents(app);
  watchReducedMotion(app.state);
  app.touchControls.setSizeName(app.state.settings.touchSize);
  app.audio.setEnabled(app.state.settings.soundOn);

  app.menuCallbacks = createMenuCallbacks(app);
  setupMenus(app.state, app.menuCallbacks);
  onScreenChange(app.state, () => syncOverlays(app));
  // Đổi giữa chuột và cảm ứng thì hiện/ẩn nút cảm ứng. (Nút "Chế tạo" cảm ứng gửi hành động 'craft' qua input.)
  app.input.onDeviceChange(() => syncOverlays(app));
  syncOverlays(app);
  startLoop(app);
}

boot();
