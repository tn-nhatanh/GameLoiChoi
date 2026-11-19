// Vẽ toàn bộ thế giới mỗi frame, chỉ phần camera nhìn thấy, theo thứ tự lớp:
//   mặt đất → đồ nằm phẳng (bẫy, giường, vật phẩm rơi) → bóng mờ xây, vạch ngắm
//   → vật có chiều cao (cây, đá, công trình, sinh vật, người chơi) sắp theo y → đạn, hạt
//   → lớp phủ đêm + nguồn sáng → số sát thương (để luôn đọc được kể cả ban đêm).
// Dùng terrainCache.js, sprites.js, worldSprites.js, effects.js; camera ở world/camera.js.

import { COLORS, PLAYER, RENDER, STRUCTURES, LIGHTING } from '../config.js';
import { getObjectAtTile } from '../world/mapGen.js';
import { getVisibleTileRange } from '../world/camera.js';
import { getDarkness } from '../systems/dayNight.js';
import { getSelectedItemId, isHoldingGun } from '../systems/items.js';
import { createTerrainCache } from './terrainCache.js';
import { drawPlayer, drawZombie, drawAnimal } from './sprites.js';
import { drawTree, drawRock, drawBush, drawStructure, drawPickup, drawBullet, drawBuildGhost } from './worldSprites.js';
import { drawParticles, drawDamageNumbers, drawNightOverlay } from './effects.js';

/** Hàm vẽ theo `type` của entity. Thêm loại mới chỉ cần thêm một dòng. */
const DRAW_BY_TYPE = {
  player: drawPlayer,
  tree: drawTree,
  rock: drawRock,
  bush: drawBush,
  structure: drawStructure,
  zombie: drawZombie,
  animal: drawAnimal,
};

/** Hình dáng vạch ngắm (chỉ là tỉ lệ hình vẽ, không ảnh hưởng gameplay). */
const AIM_GUIDE_SHAPE = {
  startFromBody: 1.3,
  lineWidth: 4,
  dashPattern: [2, 9],
  muzzleFlashRadius: 7,
};
const VISIBILITY_MARGIN = 80; // vẽ dư ngoài mép màn hình (px) để sinh vật không "bật" ra đột ngột
const MAX_LIGHTS = 64;

function isFlatStructure(structure) {
  return STRUCTURES[structure.structureType].blocks === 'none';
}

function isVisible(camera, x, y) {
  return (
    x > camera.x - VISIBILITY_MARGIN &&
    x < camera.x + camera.viewWidth + VISIBILITY_MARGIN &&
    y > camera.y - VISIBILITY_MARGIN &&
    y < camera.y + camera.viewHeight + VISIBILITY_MARGIN
  );
}

/** Vạch ngắm chỉ hiện khi cầm súng; đang bắn thì có chớp sáng đầu nòng. */
function drawAimGuide(ctx, game) {
  const { player } = game;
  if (!isHoldingGun(game) || player.isSleeping || player.isDead) return;
  const startDistance = player.radius * AIM_GUIDE_SHAPE.startFromBody;
  const endDistance = startDistance + PLAYER.aimGuideLength;
  const startX = player.x + player.facingX * startDistance;
  const startY = player.y + player.facingY * startDistance;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = AIM_GUIDE_SHAPE.lineWidth;
  ctx.setLineDash(AIM_GUIDE_SHAPE.dashPattern);
  ctx.strokeStyle = player.muzzleTimer > 0 ? COLORS.aimGuideFiring : COLORS.aimGuide;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(player.x + player.facingX * endDistance, player.y + player.facingY * endDistance);
  ctx.stroke();
  ctx.restore();

  if (player.muzzleTimer > 0) {
    ctx.beginPath();
    ctx.arc(startX, startY, AIM_GUIDE_SHAPE.muzzleFlashRadius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.muzzleFlash;
    ctx.fill();
  }
}

/**
 * Đặt phép biến đổi: toạ độ thế giới → pixel thật trên canvas (cộng rung màn hình).
 * Làm tròn phần dịch chuyển theo pixel thật để mặt đất không bị nhoè khi camera trượt.
 */
function applyCameraTransform(ctx, camera, pixelRatio, shakeX, shakeY) {
  const scale = pixelRatio * camera.zoom;
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    -Math.round((camera.x - shakeX) * scale),
    -Math.round((camera.y - shakeY) * scale),
  );
}

function compareByDepth(first, second) {
  return first.y - second.y;
}

export function createRenderer(ctx) {
  let terrainCache = null;
  let terrainWorld = null;
  // Object dùng lại mỗi frame để tránh tạo rác.
  const drawList = [];
  const tileRange = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const frame = { timeSeconds: 0, reducedMotion: false, heldItemId: null };
  const lights = Array.from({ length: MAX_LIGHTS }, () => ({ x: 0, y: 0, radius: 0, intensity: 1, isWarm: false }));
  let lightCount = 0;

  function getTerrainCache(world) {
    if (world !== terrainWorld) {
      terrainCache = createTerrainCache(world);
      terrainWorld = world;
    }
    return terrainCache;
  }

  function addLight(x, y, radius, intensity, isWarm) {
    if (lightCount >= MAX_LIGHTS) return;
    const light = lights[lightCount++];
    light.x = x;
    light.y = y;
    light.radius = radius;
    light.intensity = intensity;
    light.isWarm = isWarm;
  }

  /** Nguồn sáng: người chơi (nhẹ), đống lửa (chập chờn, ấm), chớp đầu nòng súng. */
  function collectLights(game) {
    lightCount = 0;
    const { player } = game;
    if (!player.isDead) addLight(player.x, player.y, LIGHTING.playerLightRadius, LIGHTING.playerLightIntensity, false);
    if (player.muzzleTimer > 0) {
      addLight(player.x + player.facingX * player.radius * 2, player.y + player.facingY * player.radius * 2, LIGHTING.muzzleLightRadius, 1, true);
    }
    for (const structure of game.structures) {
      if (structure.structureType !== 'campfire') continue;
      const flicker = frame.reducedMotion
        ? 0
        : Math.sin(frame.timeSeconds * LIGHTING.campfireFlickerSpeed + structure.flickerPhase) * LIGHTING.campfireFlickerAmount;
      addLight(structure.x, structure.centerY, STRUCTURES.campfire.lightRadius + flicker, 1, true);
    }
  }

  function drawGroundLayer(game) {
    for (const structure of game.structures) {
      if (isFlatStructure(structure) && isVisible(game.camera, structure.x, structure.y)) drawStructure(ctx, structure, frame);
    }
    for (const pickup of game.pickups) {
      if (isVisible(game.camera, pickup.x, pickup.y)) drawPickup(ctx, pickup, frame);
    }
  }

  /** Gom mọi vật có chiều cao đang nhìn thấy rồi sắp xếp theo y. */
  function collectDepthSorted(game) {
    drawList.length = 0;
    const { camera, world } = game;
    getVisibleTileRange(camera, world, RENDER.objectCullMarginTiles, tileRange);
    for (let tileY = tileRange.minY; tileY <= tileRange.maxY; tileY++) {
      for (let tileX = tileRange.minX; tileX <= tileRange.maxX; tileX++) {
        const object = getObjectAtTile(world, tileX, tileY);
        if (object) drawList.push(object);
      }
    }
    for (const structure of game.structures) {
      if (!isFlatStructure(structure) && isVisible(camera, structure.x, structure.y)) drawList.push(structure);
    }
    for (const list of [game.zombies, game.animals]) {
      for (const creature of list) if (isVisible(camera, creature.x, creature.y)) drawList.push(creature);
    }
    drawList.push(game.player);
    drawList.sort(compareByDepth);
  }

  function drawBullets(game) {
    for (const bullet of game.bullets) if (bullet.isActive) drawBullet(ctx, bullet);
  }

  return {
    /** viewport = { width, height, pixelRatio } theo pixel CSS; effects từ render/effects.js. */
    render(appState, viewport, effects) {
      ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
      ctx.fillStyle = COLORS.water;
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      const game = appState.game;
      if (!game) return;
      frame.timeSeconds = game.elapsedSeconds;
      frame.reducedMotion = appState.reducedMotion;
      frame.heldItemId = getSelectedItemId(game);
      const { camera } = game;
      const terrainResolution = Math.min(viewport.pixelRatio * camera.zoom, RENDER.terrainMaxResolution);

      applyCameraTransform(ctx, camera, viewport.pixelRatio, effects.shakeX, effects.shakeY);
      getTerrainCache(game.world).draw(ctx, camera, terrainResolution);
      drawGroundLayer(game);
      drawBuildGhost(ctx, game.buildGhost, frame);
      drawAimGuide(ctx, game);
      collectDepthSorted(game);
      for (const entity of drawList) DRAW_BY_TYPE[entity.type](ctx, entity, frame);
      drawBullets(game);
      drawParticles(ctx, effects);

      collectLights(game);
      drawNightOverlay(ctx, effects, viewport, camera, getDarkness(game.dayNight), lights, lightCount);

      applyCameraTransform(ctx, camera, viewport.pixelRatio, effects.shakeX, effects.shakeY);
      drawDamageNumbers(ctx, effects);
    },
  };
}
