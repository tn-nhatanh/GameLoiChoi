// Sinh hòn đảo theo seed: chia ô nước/cát/cỏ/rừng bằng noise, đào hồ, chọn điểm xuất phát, rải cây/đá/bụi quả,
// rồi rải thêm cây cỏ nhỏ (cỏ cao, hoa, nấm, cà rốt/khoai dại, lau sậy) thành từng mảng tự nhiên.
// Kết quả là object "world" chứa lưới ô (Uint8Array) và danh sách đồ vật; dùng config.js (WORLD, MAP_GEN, FLORA...).

import { WORLD, MAP_GEN, WORLD_OBJECTS, HARVEST, FLORA, COLORS } from '../config.js';
import { createValueNoise2D, fractalNoise2D, hash2D } from './noise.js';
import { createSeededRandom, randomInt, clamp, lerp } from '../utils/math.js';

/**
 * Loại ô. Thứ tự số có ý nghĩa: càng lớn càng "sâu trong đất liền".
 * render/terrainCache.js vẽ chồng các lớp theo đúng thứ tự này.
 */
export const TILE = Object.freeze({ WATER: 0, SAND: 1, GRASS: 2, FOREST: 3 });

const NO_OBJECT = -1;
const MOISTURE_SEED_SALT = 0x9e3779b9; // trộn vào seed để noise độ ẩm khác noise độ cao
// "Muối" riêng cho lượt rải cây cỏ và loại cây: dùng nguồn ngẫu nhiên RIÊNG, nên thêm cây cỏ mới
// không làm xê dịch cây/đá cũ → các bản lưu cũ (ghi theo id đồ vật) vẫn khớp.
const FLORA_SEED_SALT = 0x2545f491;
const GRASS_PATCH_SALT = 0x68e31da4;
const FLOWER_PATCH_SALT = 0x1b56c4e9;
const TREE_VARIANT_SALT = 0x7feb352d;
const PATCH_EDGE = 0.45; // noise mảng dưới mức này coi như không có mảng
const PATCH_SOFTNESS = 0.35; // độ rộng vùng chuyển tiếp từ mép mảng vào giữa mảng

// ---------- Tra cứu ô (dùng ở nhiều nơi) ----------

export function isInsideMap(world, tileX, tileY) {
  return tileX >= 0 && tileY >= 0 && tileX < world.widthInTiles && tileY < world.heightInTiles;
}

/** Ngoài map được coi là nước, nên không ai đi ra khỏi đảo được. */
export function getTile(world, tileX, tileY) {
  return isInsideMap(world, tileX, tileY) ? world.tiles[tileY * world.widthInTiles + tileX] : TILE.WATER;
}

export function getObjectAtTile(world, tileX, tileY) {
  if (!isInsideMap(world, tileX, tileY)) return null;
  const objectIndex = world.objectIndexByTile[tileY * world.widthInTiles + tileX];
  return objectIndex === NO_OBJECT ? null : world.objects[objectIndex];
}

export function pixelToTile(world, pixel) {
  return Math.floor(pixel / world.tileSize);
}

export function tileIndexOf(world, tileX, tileY) {
  return tileY * world.widthInTiles + tileX;
}

export function tileCenter(world, tileX, tileY) {
  return { x: (tileX + 0.5) * world.tileSize, y: (tileY + 0.5) * world.tileSize };
}

/** Công trình người chơi xây tại ô này (hoặc undefined). */
export function getStructureAtTile(world, tileX, tileY) {
  if (!isInsideMap(world, tileX, tileY)) return undefined;
  return world.structureByTile.get(tileIndexOf(world, tileX, tileY));
}

/** Ô đất trống tự nhiên: không phải nước, không có cây/đá chắn (chưa xét công trình). */
export function isOpenGround(world, tileX, tileY) {
  if (getTile(world, tileX, tileY) === TILE.WATER) return false;
  return !getObjectAtTile(world, tileX, tileY)?.isBlocking;
}

// ---------- Điểm vào ----------

export function generateWorld(seedNumber) {
  const world = createEmptyWorld(seedNumber);
  // Mọi số ngẫu nhiên đều lấy từ bộ sinh có seed và theo thứ tự cố định → cùng seed, cùng map.
  const random = createSeededRandom(seedNumber);
  fillTerrain(world);
  carveLakes(world, random);
  world.spawn = findSpawnPoint(world);
  placeObjects(world, random);
  placeFlora(world);
  return world;
}

function createEmptyWorld(seed) {
  const { tileSize, widthInTiles, heightInTiles } = WORLD;
  const tileCount = widthInTiles * heightInTiles;
  return {
    seed,
    tileSize,
    widthInTiles,
    heightInTiles,
    pixelWidth: widthInTiles * tileSize,
    pixelHeight: heightInTiles * tileSize,
    tiles: new Uint8Array(tileCount),
    objects: [],
    objectIndexByTile: new Int32Array(tileCount).fill(NO_OBJECT),
    // Công trình người chơi xây (systems/building.js): chỉ số ô → công trình.
    structureByTile: new Map(),
    // Ô ruộng đã cày (systems/farming.js): chỉ số ô → ô ruộng.
    plotByTile: new Map(),
    spawn: { x: 0, y: 0 },
  };
}

// ---------- Bước 1: địa hình ----------

/** Kéo giãn giá trị noise quanh 0.5 (value noise nhiều lớp thường dồn về giữa, trông nhạt nhẽo). */
function stretchContrast(value) {
  return clamp((value - 0.5) * MAP_GEN.noiseContrast + 0.5, 0, 1);
}

/** Khoảng cách từ ô tới tâm map: 0 ở tâm, 1 ở giữa cạnh map, lớn hơn 1 ở các góc. */
function distanceFromCenter(world, tileX, tileY) {
  const normalizedX = ((tileX + 0.5) / world.widthInTiles) * 2 - 1;
  const normalizedY = ((tileY + 0.5) / world.heightInTiles) * 2 - 1;
  return Math.hypot(normalizedX, normalizedY);
}

/**
 * Độ cao của một ô = trộn giữa noise và "hình đảo":
 *   islandShape = 1 - distance^power    (≈1 ở tâm, ≤0 ở mép map)
 *   elevation   = lerp(noise, islandShape, islandBlend)
 * Ở tâm gần như chắc chắn là đất, ở mép chắc chắn là biển,
 * còn vùng giữa do noise quyết định → bờ biển khúc khuỷu, có vịnh và mũi đất.
 */
function computeElevation(world, elevationNoise, tileX, tileY) {
  const rawNoise = fractalNoise2D(
    elevationNoise,
    tileX * MAP_GEN.elevationFrequency,
    tileY * MAP_GEN.elevationFrequency,
    MAP_GEN,
  );
  const islandShape = 1 - Math.pow(distanceFromCenter(world, tileX, tileY), MAP_GEN.islandFalloffPower);
  return lerp(stretchContrast(rawNoise), islandShape, MAP_GEN.islandBlend);
}

function computeMoisture(moistureNoise, tileX, tileY) {
  const rawNoise = fractalNoise2D(
    moistureNoise,
    tileX * MAP_GEN.moistureFrequency,
    tileY * MAP_GEN.moistureFrequency,
    MAP_GEN,
  );
  return stretchContrast(rawNoise);
}

/** Độ cao quyết định nước/cát/đất; trên đất thì độ ẩm quyết định cỏ hay rừng. */
function classifyTile(elevation, moisture) {
  if (elevation < MAP_GEN.waterLevel) return TILE.WATER;
  if (elevation < MAP_GEN.sandLevel) return TILE.SAND;
  return moisture > MAP_GEN.forestMoisture ? TILE.FOREST : TILE.GRASS;
}

function fillTerrain(world) {
  const elevationNoise = createValueNoise2D(world.seed);
  const moistureNoise = createValueNoise2D((world.seed ^ MOISTURE_SEED_SALT) >>> 0);
  for (let tileY = 0; tileY < world.heightInTiles; tileY++) {
    for (let tileX = 0; tileX < world.widthInTiles; tileX++) {
      const elevation = computeElevation(world, elevationNoise, tileX, tileY);
      const moisture = computeMoisture(moistureNoise, tileX, tileY);
      world.tiles[tileY * world.widthInTiles + tileX] = classifyTile(elevation, moisture);
    }
  }
}

// ---------- Bước 2: hồ nước ----------

/** Mọi ô trong hình vuông bán kính `reach` quanh (centerX, centerY) đều là đất (không phải nước). */
function isSurroundedByLand(world, centerX, centerY, reach) {
  for (let offsetY = -reach; offsetY <= reach; offsetY++) {
    for (let offsetX = -reach; offsetX <= reach; offsetX++) {
      if (getTile(world, centerX + offsetX, centerY + offsetY) === TILE.WATER) return false;
    }
  }
  return true;
}

/**
 * Đào một hồ hình tròn "méo": bán kính thay đổi theo góc bằng một sóng sin
 * (số múi và pha ngẫu nhiên), nên mỗi hồ có hình dạng riêng nhưng vẫn mềm mại.
 */
function carveLake(world, centerX, centerY, radius, random) {
  const lobeCount = randomInt(random, MAP_GEN.lakeWobbleLobes.min, MAP_GEN.lakeWobbleLobes.max);
  const wobblePhase = random() * Math.PI * 2;
  const reach = Math.ceil(radius * (1 + MAP_GEN.lakeEdgeWobble));

  for (let offsetY = -reach; offsetY <= reach; offsetY++) {
    for (let offsetX = -reach; offsetX <= reach; offsetX++) {
      const angle = Math.atan2(offsetY, offsetX);
      const edgeRadius = radius * (1 + MAP_GEN.lakeEdgeWobble * Math.sin(angle * lobeCount + wobblePhase));
      const tileX = centerX + offsetX;
      const tileY = centerY + offsetY;
      if (Math.hypot(offsetX, offsetY) <= edgeRadius && isInsideMap(world, tileX, tileY)) {
        world.tiles[tileY * world.widthInTiles + tileX] = TILE.WATER;
      }
    }
  }
}

/**
 * Thử ngẫu nhiên nhiều vị trí; chỉ đào hồ ở chỗ nằm sâu trong đất liền
 * (cách biển và cách hồ khác một khoảng) để hồ không nối ra biển hay dính vào nhau.
 */
function carveLakes(world, random) {
  const targetCount = randomInt(random, MAP_GEN.lakeCount.min, MAP_GEN.lakeCount.max);
  let carvedCount = 0;
  for (let attempt = 0; attempt < MAP_GEN.lakePlacementAttempts && carvedCount < targetCount; attempt++) {
    const radius = lerp(MAP_GEN.lakeRadiusTiles.min, MAP_GEN.lakeRadiusTiles.max, random());
    const centerX = randomInt(random, 0, world.widthInTiles - 1);
    const centerY = randomInt(random, 0, world.heightInTiles - 1);
    const reach = Math.ceil(radius * (1 + MAP_GEN.lakeEdgeWobble)) + MAP_GEN.lakeShoreMarginTiles;
    if (!isSurroundedByLand(world, centerX, centerY, reach)) continue;
    carveLake(world, centerX, centerY, radius, random);
    carvedCount++;
  }
}

// ---------- Bước 3: điểm xuất phát ----------

function isGrassPatch(world, tileX, tileY) {
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      if (getTile(world, tileX + offsetX, tileY + offsetY) !== TILE.GRASS) return false;
    }
  }
  return true;
}

/**
 * Tìm bãi cỏ (3x3 ô cỏ) gần tâm map nhất: quét từng "vòng vuông" lớn dần quanh tâm.
 * Nếu đảo kỳ lạ không có bãi cỏ nào thì lấy luôn tâm map.
 */
function findSpawnPoint(world) {
  const centerX = Math.floor(world.widthInTiles / 2);
  const centerY = Math.floor(world.heightInTiles / 2);
  const maxRing = Math.max(centerX, centerY);

  for (let ring = 0; ring <= maxRing; ring++) {
    for (let offsetY = -ring; offsetY <= ring; offsetY++) {
      for (let offsetX = -ring; offsetX <= ring; offsetX++) {
        const isOnRing = Math.max(Math.abs(offsetX), Math.abs(offsetY)) === ring;
        if (isOnRing && isGrassPatch(world, centerX + offsetX, centerY + offsetY)) {
          return tileCenter(world, centerX + offsetX, centerY + offsetY);
        }
      }
    }
  }
  return tileCenter(world, centerX, centerY);
}

// ---------- Bước 4: đồ vật ----------

/** Một lần tung xúc xắc quyết định ô này có gì, tuỳ loại đất. */
function pickObjectType(tile, random) {
  const roll = random();
  const chance = MAP_GEN.objectChance;
  if (tile === TILE.FOREST) return roll < chance.forestTree ? 'tree' : null;
  if (tile === TILE.SAND) return roll < chance.sandRock ? 'rock' : null;
  if (tile !== TILE.GRASS) return null;
  if (roll < chance.grassTree) return 'tree';
  if (roll < chance.grassTree + chance.grassRock) return 'rock';
  if (roll < chance.grassTree + chance.grassRock + chance.grassBush) return 'bush';
  return null;
}

/**
 * Không cho hai vật cản nằm sát nhau theo hàng ngang/dọc, chỉ cho chéo nhau.
 * Nhờ vậy giữa các cây luôn có khe chéo đủ rộng để người (và zombie) len qua.
 * Chỉ cần xét ô bên trái và bên trên, vì ta quét từ trái sang phải, trên xuống dưới.
 */
function hasBlockingNeighbor(world, tileX, tileY) {
  return Boolean(getObjectAtTile(world, tileX - 1, tileY)?.isBlocking || getObjectAtTile(world, tileX, tileY - 1)?.isBlocking);
}

function isNearSpawn(world, tileX, tileY) {
  const spawnTileX = pixelToTile(world, world.spawn.x);
  const spawnTileY = pixelToTile(world, world.spawn.y);
  return Math.hypot(tileX - spawnTileX, tileY - spawnTileY) <= MAP_GEN.spawnClearRadiusTiles;
}

/** Chọn một khoá theo bảng tỉ lệ { khoá: tỉ lệ } với số roll trong [0, 1). */
function pickByShare(shares, roll) {
  let total = 0;
  for (const [key, share] of Object.entries(shares)) {
    total += share;
    if (roll < total) return key;
  }
  return Object.keys(shares)[0];
}

/** Kiểu dáng đồ vật: loại cây (sồi, thông, anh đào...) hoặc màu hoa — băm theo ô nên luôn cố định. */
function pickVariant(world, type, tileX, tileY) {
  const roll = hash2D(tileX, tileY, world.seed ^ TREE_VARIANT_SALT);
  if (type === 'tree') {
    const shares = getTile(world, tileX, tileY) === TILE.FOREST ? FLORA.forestTrees : FLORA.grassTrees;
    return pickByShare(shares, roll);
  }
  if (type === 'flower') return Math.floor(roll * Math.min(FLORA.flowerColors, COLORS.flowerPetals.length));
  return 0;
}

function addObject(world, type, tileX, tileY, random) {
  const settings = WORLD_OBJECTS[type];
  const center = tileCenter(world, tileX, tileY);
  const object = {
    id: world.objects.length,
    type,
    tileX,
    tileY,
    x: center.x + (random() * 2 - 1) * MAP_GEN.objectJitter,
    y: center.y + (random() * 2 - 1) * MAP_GEN.objectJitter,
    scale: lerp(settings.minScale, settings.maxScale, random()),
    swayPhase: random() * Math.PI * 2, // lệch pha để các cây không lắc đồng loạt
    variant: pickVariant(world, type, tileX, tileY), // loại cây / màu hoa
    fruitTimer: 0, // cây táo: 0 = đang có quả, > 0 = đang chờ ra quả
    isBlocking: settings.isBlocking,
    collisionRadius: settings.collisionRadius,
    // Trạng thái thu thập (systems/gathering.js)
    health: HARVEST[type].maxHealth ?? 0,
    isDepleted: false, // cây đã đổ / đá đã vỡ / bụi đã hết quả
    regrowTimer: 0,
    hitTimer: 0, // > 0 thì đang rung vì vừa bị đánh (chỉ để vẽ)
  };
  world.objects.push(object);
  world.objectIndexByTile[tileY * world.widthInTiles + tileX] = object.id;
}

function placeObjects(world, random) {
  for (let tileY = 0; tileY < world.heightInTiles; tileY++) {
    for (let tileX = 0; tileX < world.widthInTiles; tileX++) {
      // Luôn tung xúc xắc trước khi lọc, để thứ tự số ngẫu nhiên không đổi → map ổn định theo seed.
      const type = pickObjectType(getTile(world, tileX, tileY), random);
      if (!type || isNearSpawn(world, tileX, tileY)) continue;
      if (WORLD_OBJECTS[type].isBlocking && hasBlockingNeighbor(world, tileX, tileY)) continue;
      addObject(world, type, tileX, tileY, random);
    }
  }
}

// ---------- Bước 5: cây cỏ nhỏ ----------

function isNextToWater(world, tileX, tileY) {
  return (
    getTile(world, tileX - 1, tileY) === TILE.WATER ||
    getTile(world, tileX + 1, tileY) === TILE.WATER ||
    getTile(world, tileX, tileY - 1) === TILE.WATER ||
    getTile(world, tileX, tileY + 1) === TILE.WATER
  );
}

/** Độ dày của "mảng" tại ô (0 = ngoài mảng, 1 = giữa mảng), lấy từ noise tần số thấp. */
function patchDensity(noise, tileX, tileY) {
  const value = noise(tileX * FLORA.patchFrequency, tileY * FLORA.patchFrequency);
  return clamp((value - PATCH_EDGE) / PATCH_SOFTNESS, 0, 1);
}

/** Thử lần lượt từng loại với xác suất riêng, cộng dồn trên cùng một lần tung. */
function pickFromChances(roll, chances) {
  let total = 0;
  for (const [type, chance] of chances) {
    total += chance;
    if (roll < total) return type;
  }
  return null;
}

function pickFloraType(world, tileX, tileY, roll, grassPatch, flowerPatch) {
  const tile = getTile(world, tileX, tileY);
  if (tile === TILE.WATER) return null;
  if (isNextToWater(world, tileX, tileY)) return roll < FLORA.reed ? 'reed' : null;
  if (tile === TILE.FOREST) {
    return pickFromChances(roll, [
      ['mushroom', FLORA.mushroom],
      ['tallGrass', FLORA.forestTallGrass],
      ['flower', FLORA.forestFlower],
    ]);
  }
  if (tile !== TILE.GRASS) return null;
  return pickFromChances(roll, [
    ['wildCarrot', FLORA.wildCarrot],
    ['wildPotato', FLORA.wildPotato],
    ['flower', FLORA.flower.base + FLORA.flower.patch * flowerPatch],
    ['tallGrass', FLORA.tallGrass.base + FLORA.tallGrass.patch * grassPatch],
  ]);
}

/**
 * Lượt rải thứ hai: cỏ cao, hoa, nấm, cây dại, lau sậy trên các ô còn trống.
 * Cỏ và hoa dày lên ở giữa các "mảng" (noise tần số thấp) → trông như đồng cỏ, vạt hoa tự nhiên.
 * Những thứ này không chắn đường nên mọc sát điểm xuất phát cũng được.
 */
function placeFlora(world) {
  const random = createSeededRandom((world.seed ^ FLORA_SEED_SALT) >>> 0);
  const grassNoise = createValueNoise2D((world.seed ^ GRASS_PATCH_SALT) >>> 0);
  const flowerNoise = createValueNoise2D((world.seed ^ FLOWER_PATCH_SALT) >>> 0);
  for (let tileY = 0; tileY < world.heightInTiles; tileY++) {
    for (let tileX = 0; tileX < world.widthInTiles; tileX++) {
      const roll = random(); // luôn tung trước khi lọc để thứ tự số ngẫu nhiên ổn định
      if (getObjectAtTile(world, tileX, tileY)) continue;
      const grassPatch = patchDensity(grassNoise, tileX, tileY);
      const flowerPatch = patchDensity(flowerNoise, tileX, tileY);
      const type = pickFloraType(world, tileX, tileY, roll, grassPatch, flowerPatch);
      if (type) addObject(world, type, tileX, tileY, random);
    }
  }
}
