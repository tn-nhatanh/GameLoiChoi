// Vẽ mặt đất (nước, cát, cỏ, rừng) theo từng khối ô vuông, vẽ một lần rồi lưu lại để dùng mãi.
// Mỗi frame chỉ dán (drawImage) các khối đang nằm trong camera → nhanh hơn rất nhiều so với vẽ từng ô.
// Dùng world/mapGen.js (loại ô), world/noise.js (vị trí hoạ tiết cố định theo seed). Được gọi bởi renderer.js.

import { COLORS, RENDER } from '../config.js';
import { TILE, getTile } from '../world/mapGen.js';
import { hash2D } from '../world/noise.js';

/**
 * Các lớp màu vẽ chồng lên nhau, từ dưới lên. Mỗi ô có loại >= minTile được vẽ thành
 * một "giọt" tròn hơi to hơn ô → các giọt kề nhau hoà vào nhau, bờ biển tự bo tròn mềm mại.
 */
const TERRAIN_LAYERS = [
  { minTile: TILE.SAND, color: COLORS.shallowWater, radiusRatio: RENDER.shallowWaterRadius },
  { minTile: TILE.SAND, color: COLORS.sand, radiusRatio: RENDER.landBlobRadius },
  { minTile: TILE.GRASS, color: COLORS.grass, radiusRatio: RENDER.landBlobRadius },
  { minTile: TILE.FOREST, color: COLORS.forestGround, radiusRatio: RENDER.landBlobRadius },
];

/** Vẽ dư ra ngoài khối chừng này ô, vì giọt của ô hàng xóm có thể tràn sang. */
const CHUNK_PADDING_TILES = 2;
/** Vẽ mỗi khối to hơn 1px để không lộ đường kẻ mảnh giữa hai khối khi zoom lẻ. */
const SEAM_OVERLAP = 1;
/** "Muối" cho hash hoạ tiết, để không trùng với hash của noise địa hình. */
const DECORATION_SALT = 0x5bd1e995;

/** Hình dáng hoạ tiết, tính theo cạnh ô (chỉ để trang trí). */
const DECORATION_SHAPE = {
  maxOffset: 0.3, // hoạ tiết lệch tối đa 30% cạnh ô khỏi tâm
  tuftWidth: 0.09,
  tuftHeight: 0.1,
  tuftLineWidth: 2.5,
  waveWidth: 0.16,
  waveLineWidth: 2.5,
  sandDotRadius: 0.04,
};

function drawTerrainLayer(ctx, world, layer, fromX, fromY, toX, toY) {
  const size = world.tileSize;
  const radius = layer.radiusRatio * size;
  ctx.beginPath();
  for (let tileY = fromY; tileY <= toY; tileY++) {
    for (let tileX = fromX; tileX <= toX; tileX++) {
      if (getTile(world, tileX, tileY) < layer.minTile) continue;
      const centerX = (tileX + 0.5) * size;
      const centerY = (tileY + 0.5) * size;
      ctx.moveTo(centerX + radius, centerY);
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    }
  }
  ctx.fillStyle = layer.color;
  ctx.fill(); // một lần fill cho cả lớp → nhanh, và các giọt hợp lại thành một mảng liền
}

function isOpenWater(world, tileX, tileY) {
  return (
    getTile(world, tileX, tileY) === TILE.WATER &&
    getTile(world, tileX - 1, tileY) === TILE.WATER &&
    getTile(world, tileX + 1, tileY) === TILE.WATER &&
    getTile(world, tileX, tileY - 1) === TILE.WATER &&
    getTile(world, tileX, tileY + 1) === TILE.WATER
  );
}

function drawGrassTuft(ctx, x, y, size) {
  const halfWidth = DECORATION_SHAPE.tuftWidth * size;
  const height = DECORATION_SHAPE.tuftHeight * size;
  ctx.moveTo(x - halfWidth, y - height);
  ctx.lineTo(x, y);
  ctx.lineTo(x + halfWidth, y - height);
}

function drawWave(ctx, x, y, size) {
  const halfWidth = DECORATION_SHAPE.waveWidth * size;
  ctx.moveTo(x - halfWidth, y);
  ctx.quadraticCurveTo(x - halfWidth / 2, y + halfWidth / 2, x, y);
  ctx.quadraticCurveTo(x + halfWidth / 2, y + halfWidth / 2, x + halfWidth, y);
}

/** Chọn hoạ tiết cho một ô dựa trên hash cố định → cùng seed luôn cùng hoạ tiết. */
function addDecoration(paths, world, tileX, tileY) {
  const chance = hash2D(tileX, tileY, world.seed ^ DECORATION_SALT);
  const size = world.tileSize;
  const maxOffset = DECORATION_SHAPE.maxOffset * size;
  const x = (tileX + 0.5) * size + (hash2D(tileX, tileY, world.seed + 1) * 2 - 1) * maxOffset;
  const y = (tileY + 0.5) * size + (hash2D(tileX, tileY, world.seed + 2) * 2 - 1) * maxOffset;
  const tile = getTile(world, tileX, tileY);

  if (tile >= TILE.GRASS && chance < RENDER.decorationChance.grassTuft) drawGrassTuft(paths.tufts, x, y, size);
  else if (tile === TILE.SAND && chance < RENDER.decorationChance.sandDot) {
    const radius = DECORATION_SHAPE.sandDotRadius * size;
    paths.sandDots.moveTo(x + radius, y);
    paths.sandDots.arc(x, y, radius, 0, Math.PI * 2);
  } else if (chance < RENDER.decorationChance.waterWave && isOpenWater(world, tileX, tileY)) {
    drawWave(paths.waves, x, y, size);
  }
}

function drawDecorations(ctx, world, fromX, fromY, toX, toY) {
  const paths = { tufts: new Path2D(), sandDots: new Path2D(), waves: new Path2D() };
  for (let tileY = fromY; tileY <= toY; tileY++) {
    for (let tileX = fromX; tileX <= toX; tileX++) addDecoration(paths, world, tileX, tileY);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = DECORATION_SHAPE.tuftLineWidth;
  ctx.strokeStyle = COLORS.grassTuft;
  ctx.stroke(paths.tufts);
  ctx.lineWidth = DECORATION_SHAPE.waveLineWidth;
  ctx.strokeStyle = COLORS.waterWave;
  ctx.stroke(paths.waves);
  ctx.fillStyle = COLORS.sandDot;
  ctx.fill(paths.sandDots);
}

/** Vẽ một khối mặt đất ra canvas riêng, ở độ phân giải `resolution` (pixel thật / pixel thế giới). */
function renderChunk(world, chunkX, chunkY, resolution) {
  const chunkTiles = RENDER.terrainChunkTiles;
  const chunkPixels = chunkTiles * world.tileSize;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(chunkPixels * resolution);
  canvas.height = canvas.width;
  const ctx = canvas.getContext('2d');

  const firstTileX = chunkX * chunkTiles;
  const firstTileY = chunkY * chunkTiles;
  ctx.scale(resolution, resolution);
  ctx.translate(-firstTileX * world.tileSize, -firstTileY * world.tileSize);
  ctx.fillStyle = COLORS.water;
  ctx.fillRect(firstTileX * world.tileSize, firstTileY * world.tileSize, chunkPixels, chunkPixels);

  const lastTileX = firstTileX + chunkTiles - 1;
  const lastTileY = firstTileY + chunkTiles - 1;
  for (const layer of TERRAIN_LAYERS) {
    drawTerrainLayer(
      ctx,
      world,
      layer,
      firstTileX - CHUNK_PADDING_TILES,
      firstTileY - CHUNK_PADDING_TILES,
      lastTileX + CHUNK_PADDING_TILES,
      lastTileY + CHUNK_PADDING_TILES,
    );
  }
  drawDecorations(ctx, world, firstTileX, firstTileY, lastTileX, lastTileY);
  return canvas;
}

/**
 * Bộ nhớ đệm khối mặt đất. Map của JS giữ thứ tự chèn, nên ta dùng nó như hàng đợi LRU:
 * mỗi lần dùng một khối thì chuyển nó xuống cuối; khi đầy thì bỏ khối ở đầu (lâu không dùng nhất).
 */
export function createTerrainCache(world) {
  const chunks = new Map();
  const chunkPixels = RENDER.terrainChunkTiles * world.tileSize;
  const chunkCountX = Math.ceil(world.widthInTiles / RENDER.terrainChunkTiles);
  const chunkCountY = Math.ceil(world.heightInTiles / RENDER.terrainChunkTiles);
  let cachedResolution = 0;

  function getChunk(chunkX, chunkY) {
    const key = chunkY * chunkCountX + chunkX;
    let canvas = chunks.get(key);
    if (canvas) {
      chunks.delete(key);
    } else {
      canvas = renderChunk(world, chunkX, chunkY, cachedResolution);
      if (chunks.size >= RENDER.maxCachedChunks) chunks.delete(chunks.keys().next().value);
    }
    chunks.set(key, canvas);
    return canvas;
  }

  return {
    /** ctx đã được renderer đặt sẵn phép biến đổi camera (toạ độ thế giới). */
    draw(ctx, camera, resolution) {
      if (resolution !== cachedResolution) {
        chunks.clear(); // đổi độ phân giải (xoay máy, zoom) thì vẽ lại cho nét
        cachedResolution = resolution;
      }
      const fromX = Math.max(0, Math.floor(camera.x / chunkPixels));
      const fromY = Math.max(0, Math.floor(camera.y / chunkPixels));
      const toX = Math.min(chunkCountX - 1, Math.floor((camera.x + camera.viewWidth) / chunkPixels));
      const toY = Math.min(chunkCountY - 1, Math.floor((camera.y + camera.viewHeight) / chunkPixels));
      const drawSize = chunkPixels + SEAM_OVERLAP;
      for (let chunkY = fromY; chunkY <= toY; chunkY++) {
        for (let chunkX = fromX; chunkX <= toX; chunkX++) {
          ctx.drawImage(getChunk(chunkX, chunkY), chunkX * chunkPixels, chunkY * chunkPixels, drawSize, drawSize);
        }
      }
    },
  };
}
