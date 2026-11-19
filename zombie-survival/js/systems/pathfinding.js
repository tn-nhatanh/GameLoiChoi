// Tìm đường cho zombie bằng "bản đồ khoảng cách" (flow field) tính từ vị trí người chơi.
// Thay vì mỗi zombie tự chạy A*, ta chạy Dijkstra MỘT lần từ ô người chơi ra xung quanh: mỗi ô biết
// "còn cách người chơi bao xa". Zombie chỉ cần bước sang ô hàng xóm có số nhỏ hơn → luôn đi đường ngắn nhất,
// tự vòng qua nước, cây, đá. Dùng bởi entities/zombie.js; building.js/gathering.js báo "bẩn" khi map đổi.
//
// Công trình (tường, rào...) KHÔNG bị coi là tường tuyệt đối mà là ô "rất đắt" (phải đập mới qua).
// Nếu còn đường vòng, zombie đi vòng; nếu người chơi bị rào kín, đường rẻ nhất sẽ xuyên qua
// công trình yếu nhất/gần nhất → zombie đi tới đó và đập.

import { PATHFINDING } from '../config.js';
import { isInsideMap, isOpenGround, getStructureAtTile, pixelToTile } from '../world/mapGen.js';
import { doesStructureBlock } from '../world/collision.js';

const DIAGONAL_STEP = Math.SQRT2;
/** 8 hướng: [dx, dy, độ dài bước] */
const NEIGHBOR_STEPS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, DIAGONAL_STEP],
  [1, -1, DIAGONAL_STEP],
  [-1, 1, DIAGONAL_STEP],
  [-1, -1, DIAGONAL_STEP],
];
/** "Hình nộm" zombie để hỏi công trình có chặn zombie không (cửa thì có). */
const ZOMBIE_PROBE = { canPassDoors: false };

/** Hàng đợi ưu tiên (min-heap) đơn giản: lấy ra ô có khoảng cách nhỏ nhất trước. */
function createMinHeap() {
  const indices = [];
  const priorities = [];

  function swap(first, second) {
    [indices[first], indices[second]] = [indices[second], indices[first]];
    [priorities[first], priorities[second]] = [priorities[second], priorities[first]];
  }

  return {
    get size() {
      return indices.length;
    },
    clear() {
      indices.length = 0;
      priorities.length = 0;
    },
    push(index, priority) {
      indices.push(index);
      priorities.push(priority);
      let child = indices.length - 1;
      while (child > 0) {
        const parent = (child - 1) >> 1;
        if (priorities[parent] <= priorities[child]) break;
        swap(parent, child);
        child = parent;
      }
    },
    /** Trả về [index, priority] của phần tử nhỏ nhất. */
    pop(out) {
      out[0] = indices[0];
      out[1] = priorities[0];
      const lastIndex = indices.pop();
      const lastPriority = priorities.pop();
      if (indices.length === 0) return out;
      indices[0] = lastIndex;
      priorities[0] = lastPriority;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < indices.length && priorities[left] < priorities[smallest]) smallest = left;
        if (right < indices.length && priorities[right] < priorities[smallest]) smallest = right;
        if (smallest === parent) break;
        swap(parent, smallest);
        parent = smallest;
      }
      return out;
    },
  };
}

export function createFlowField(world) {
  const tileCount = world.widthInTiles * world.heightInTiles;
  return {
    // Float64 (không dùng Float32): khoảng cách lưu vào mảng phải khớp tuyệt đối với số trong hàng đợi,
    // nếu bị làm tròn thì phép so sánh "đã có đường ngắn hơn" sẽ sai và bỏ sót ô.
    cost: new Float64Array(tileCount),
    // Thay vì xoá cả mảng cost mỗi lần tính lại, ta đánh "tem": ô nào có tem cũ coi như chưa tính.
    stamp: new Uint32Array(tileCount),
    currentStamp: 0,
    originTileX: -1,
    originTileY: -1,
    cooldown: 0,
    isDirty: true,
    heap: createMinHeap(),
    popped: [0, 0],
  };
}

/** Gọi khi map thay đổi (xây/phá công trình, cây đổ/mọc lại) để tính lại sớm. */
export function markFlowFieldDirty(field) {
  field.isDirty = true;
}

function structureCost(structure) {
  return PATHFINDING.structureBaseCost + structure.health * PATHFINDING.structureHealthCost;
}

/** Phí thêm khi bước vào ô: Infinity = không thể đi (nước, cây, đá), > 0 = phải đập công trình. */
function enterCost(world, tileX, tileY) {
  if (!isInsideMap(world, tileX, tileY) || !isOpenGround(world, tileX, tileY)) return Infinity;
  const structure = getStructureAtTile(world, tileX, tileY);
  if (structure && doesStructureBlock(structure, ZOMBIE_PROBE)) return structureCost(structure);
  return 0;
}

/** Đi chéo chỉ khi hai ô cạnh đều trống, để zombie không "lách qua góc" tường hay thân cây. */
function isCornerBlocked(world, tileX, tileY, stepX, stepY) {
  return enterCost(world, tileX + stepX, tileY) !== 0 || enterCost(world, tileX, tileY + stepY) !== 0;
}

/** Dijkstra từ ô người chơi, giới hạn trong hình vuông bán kính fieldRadiusTiles. */
function recomputeField(field, world, originX, originY) {
  const width = world.widthInTiles;
  const radius = PATHFINDING.fieldRadiusTiles;
  const stamp = ++field.currentStamp;
  const { heap, cost, popped } = field;

  heap.clear();
  const originIndex = originY * width + originX;
  field.stamp[originIndex] = stamp;
  cost[originIndex] = 0;
  heap.push(originIndex, 0);

  while (heap.size > 0) {
    const [index, distance] = heap.pop(popped);
    if (distance > cost[index]) continue; // bản cũ, đã có đường ngắn hơn
    const tileX = index % width;
    const tileY = (index - tileX) / width;

    for (const [stepX, stepY, stepLength] of NEIGHBOR_STEPS) {
      const nextX = tileX + stepX;
      const nextY = tileY + stepY;
      if (Math.abs(nextX - originX) > radius || Math.abs(nextY - originY) > radius) continue;
      const extraCost = enterCost(world, nextX, nextY);
      if (extraCost === Infinity) continue;
      if (stepX !== 0 && stepY !== 0 && isCornerBlocked(world, tileX, tileY, stepX, stepY)) continue;

      const nextIndex = nextY * width + nextX;
      const nextDistance = distance + stepLength + extraCost;
      if (field.stamp[nextIndex] === stamp && nextDistance >= cost[nextIndex]) continue;
      field.stamp[nextIndex] = stamp;
      cost[nextIndex] = nextDistance;
      heap.push(nextIndex, nextDistance);
    }
  }
}

/** Tính lại khi người chơi sang ô khác hoặc map vừa đổi, nhưng không dày hơn recomputeSeconds. */
export function updateFlowField(field, world, target, deltaSeconds) {
  field.cooldown -= deltaSeconds;
  const tileX = pixelToTile(world, target.x);
  const tileY = pixelToTile(world, target.y);
  const hasMoved = tileX !== field.originTileX || tileY !== field.originTileY;
  if (field.cooldown > 0 || (!field.isDirty && !hasMoved)) return;
  if (!isInsideMap(world, tileX, tileY)) return;

  recomputeField(field, world, tileX, tileY);
  field.originTileX = tileX;
  field.originTileY = tileY;
  field.cooldown = PATHFINDING.recomputeSeconds;
  field.isDirty = false;
}

export function getFlowCost(field, world, tileX, tileY) {
  if (!isInsideMap(world, tileX, tileY)) return Infinity;
  const index = tileY * world.widthInTiles + tileX;
  return field.stamp[index] === field.currentStamp ? field.cost[index] : Infinity;
}

/**
 * Ô kế tiếp zombie nên bước tới: hàng xóm có khoảng cách nhỏ nhất ("đi xuống dốc" về phía người chơi).
 * Trả về `out` ({ tileX, tileY }) hoặc null nếu không có đường (ngoài vùng tính / bị cô lập).
 */
export function findNextStep(field, world, tileX, tileY, out) {
  let bestCost = getFlowCost(field, world, tileX, tileY);
  let hasStep = false;
  for (const [stepX, stepY] of NEIGHBOR_STEPS) {
    const nextX = tileX + stepX;
    const nextY = tileY + stepY;
    const nextCost = getFlowCost(field, world, nextX, nextY);
    if (nextCost >= bestCost) continue;
    if (stepX !== 0 && stepY !== 0 && isCornerBlocked(world, tileX, tileY, stepX, stepY)) continue;
    bestCost = nextCost;
    out.tileX = nextX;
    out.tileY = nextY;
    hasStep = true;
  }
  return hasStep ? out : null;
}
