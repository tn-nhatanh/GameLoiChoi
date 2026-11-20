// Bản đồ nhỏ ở góc màn hình: toàn bộ hòn đảo, khung vùng camera đang nhìn, chấm vị trí người chơi.
// Ảnh đảo (1 pixel = 1 ô) được tạo một lần mỗi khi có map mới; mỗi frame chỉ dán ảnh và vẽ chấm.
// Canvas #minimap nằm trong HUD (index.html); kích thước khung đặt bằng CSS (--minimap-size).

import { COLORS, DISPLAY, MINIMAP } from '../config.js';
import { TILE } from '../world/mapGen.js';

const TILE_COLORS = {
  [TILE.WATER]: COLORS.water,
  [TILE.SAND]: COLORS.sand,
  [TILE.GRASS]: COLORS.grass,
  [TILE.FOREST]: COLORS.forestGround,
};

const OBJECT_COLORS = {
  tree: COLORS.leavesShade,
  rock: COLORS.rockShade,
  bush: COLORS.bushShade,
};

/** '#a1b2c3' → [161, 178, 195] */
function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function buildColorLookup(colorsByKey) {
  const lookup = {};
  for (const [key, hex] of Object.entries(colorsByKey)) lookup[key] = hexToRgb(hex);
  return lookup;
}

/** Vẽ cả đảo ra một canvas nhỏ, mỗi ô một pixel; ô có đồ vật thì tô màu đồ vật. */
function buildWorldImage(world) {
  const tileRgb = buildColorLookup(TILE_COLORS);
  const objectRgb = buildColorLookup(OBJECT_COLORS);
  const image = document.createElement('canvas');
  image.width = world.widthInTiles;
  image.height = world.heightInTiles;
  const imageCtx = image.getContext('2d');
  const pixels = imageCtx.createImageData(image.width, image.height);

  for (let tileIndex = 0; tileIndex < world.tiles.length; tileIndex++) {
    const objectIndex = world.objectIndexByTile[tileIndex];
    const object = objectIndex >= 0 ? world.objects[objectIndex] : null;
    // Cỏ, hoa, nấm... không có màu riêng → hiện màu đất bên dưới.
    const rgb = (object && objectRgb[object.type]) || tileRgb[world.tiles[tileIndex]];
    const pixelOffset = tileIndex * 4;
    pixels.data[pixelOffset] = rgb[0];
    pixels.data[pixelOffset + 1] = rgb[1];
    pixels.data[pixelOffset + 2] = rgb[2];
    pixels.data[pixelOffset + 3] = 255;
  }
  imageCtx.putImageData(pixels, 0, 0);
  return image;
}

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  let worldImage = null;
  let imageWorld = null;
  let sizeCss = 0; // 0 = cần đo lại (sau khi đổi kích thước cửa sổ)
  let pixelRatio = 1;

  /** Đo kích thước khung và chỉnh độ phân giải canvas cho nét. Chỉ đo khi cần, tránh ép trình duyệt tính lại layout mỗi frame. */
  function measureIfNeeded() {
    if (sizeCss > 0) return;
    sizeCss = canvas.clientWidth;
    pixelRatio = Math.min(window.devicePixelRatio || 1, DISPLAY.maxPixelRatio);
    canvas.width = Math.round(sizeCss * pixelRatio);
    canvas.height = canvas.width;
  }

  function drawViewRect(camera, scaleX, scaleY) {
    ctx.lineWidth = MINIMAP.viewRectLineWidth;
    ctx.strokeStyle = COLORS.minimapView;
    ctx.strokeRect(camera.x * scaleX, camera.y * scaleY, camera.viewWidth * scaleX, camera.viewHeight * scaleY);
  }

  /** Ruộng, công trình (ô vuông nhỏ) và zombie (chấm xanh) — vẽ lại mỗi frame vì chúng thay đổi liên tục. */
  function drawDynamicMarkers(game, scaleX, scaleY) {
    const tileSizeOnMap = Math.max(1, game.world.tileSize * scaleX);
    ctx.fillStyle = COLORS.minimapFarm;
    for (const plot of game.plots) {
      ctx.fillRect(plot.tileX * tileSizeOnMap, plot.tileY * tileSizeOnMap, tileSizeOnMap, tileSizeOnMap);
    }
    ctx.fillStyle = COLORS.minimapStructure;
    for (const structure of game.structures) {
      ctx.fillRect(structure.tileX * tileSizeOnMap, structure.tileY * tileSizeOnMap, tileSizeOnMap, tileSizeOnMap);
    }
    ctx.fillStyle = COLORS.minimapZombie;
    for (const zombie of game.zombies) {
      ctx.beginPath();
      ctx.arc(zombie.x * scaleX, zombie.y * scaleY, MINIMAP.zombieDotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayerDot(player, scaleX, scaleY) {
    ctx.beginPath();
    ctx.arc(player.x * scaleX, player.y * scaleY, MINIMAP.playerDotRadius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.minimapPlayer;
    ctx.fill();
    ctx.lineWidth = MINIMAP.viewRectLineWidth;
    ctx.strokeStyle = COLORS.eyeShine;
    ctx.stroke();
  }

  return {
    /** Gọi khi cửa sổ đổi kích thước. */
    markResized() {
      sizeCss = 0;
    },

    draw(game) {
      if (game.world !== imageWorld) {
        worldImage = buildWorldImage(game.world);
        imageWorld = game.world;
      }
      measureIfNeeded();
      if (sizeCss === 0) return; // HUD đang ẩn

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, sizeCss, sizeCss);
      ctx.drawImage(worldImage, 0, 0, sizeCss, sizeCss);
      const scaleX = sizeCss / game.world.pixelWidth;
      const scaleY = sizeCss / game.world.pixelHeight;
      drawDynamicMarkers(game, scaleX, scaleY);
      drawViewRect(game.camera, scaleX, scaleY);
      drawPlayerDot(game.player, scaleX, scaleY);
    },
  };
}
