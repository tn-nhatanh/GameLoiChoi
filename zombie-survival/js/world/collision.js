// Va chạm giữa vật hình tròn (người chơi, thú, zombie) với thế giới:
// không đi xuống ô nước, không đi xuyên cây/đá hay công trình chắn đường. Bụi quả, bẫy, giường thì đi qua được.
// Dùng các hàm tra cứu ô của world/mapGen.js. Được gọi bởi entities/player.js, zombie.js, animal.js.

import { STRUCTURES } from '../config.js';
import { TILE, getTile, getObjectAtTile, getStructureAtTile, pixelToTile } from './mapGen.js';
import { clamp } from '../utils/math.js';

/**
 * Công trình có chặn entity này không?
 * Cửa ('creatures') chỉ chặn zombie và thú; người chơi có cờ canPassDoors nên đi qua được.
 */
export function doesStructureBlock(structure, entity) {
  const blocks = STRUCTURES[structure.structureType].blocks;
  if (blocks === 'all') return true;
  if (blocks === 'creatures') return !entity.canPassDoors;
  return false;
}

/**
 * Di chuyển `entity` ({ x, y, radius }) thêm (deltaX, deltaY).
 * Xử lý trục X rồi trục Y riêng: khi đi chéo vào tường, phần song song với tường
 * vẫn được giữ lại → nhân vật "trượt" dọc theo vật cản thay vì đứng khựng.
 */
export function moveWithCollision(world, entity, deltaX, deltaY) {
  entity.x += deltaX;
  pushOutOfWorld(world, entity);
  entity.y += deltaY;
  pushOutOfWorld(world, entity);
}

/** Đẩy hình tròn ra khỏi một ô vuông nếu đang chồng lên. */
function pushOutOfSquare(entity, left, top, size) {
  const closestX = clamp(entity.x, left, left + size);
  const closestY = clamp(entity.y, top, top + size);
  const offsetX = entity.x - closestX;
  const offsetY = entity.y - closestY;
  const distance = Math.hypot(offsetX, offsetY);
  if (distance >= entity.radius) return;

  if (distance > 0) {
    const pushDistance = entity.radius - distance;
    entity.x += (offsetX / distance) * pushDistance;
    entity.y += (offsetY / distance) * pushDistance;
    return;
  }
  pushCenterOutOfSquare(entity, left, top, size);
}

/** Trường hợp hiếm: tâm đã lọt hẳn vào ô → đẩy ra cạnh gần nhất. */
function pushCenterOutOfSquare(entity, left, top, size) {
  const toLeft = entity.x - left;
  const toRight = left + size - entity.x;
  const toTop = entity.y - top;
  const toBottom = top + size - entity.y;
  const nearest = Math.min(toLeft, toRight, toTop, toBottom);
  if (nearest === toLeft) entity.x = left - entity.radius;
  else if (nearest === toRight) entity.x = left + size + entity.radius;
  else if (nearest === toTop) entity.y = top - entity.radius;
  else entity.y = top + size + entity.radius;
}

/** Hình tròn có đang chồng lên ô vuông không (dùng khi kiểm tra chỗ đặt công trình). */
export function circleOverlapsSquare(circle, left, top, size) {
  const closestX = clamp(circle.x, left, left + size);
  const closestY = clamp(circle.y, top, top + size);
  return Math.hypot(circle.x - closestX, circle.y - closestY) < circle.radius;
}

/** Đẩy hình tròn ra khỏi một vật cản tròn (thân cây, tảng đá, sinh vật khác). */
export function pushOutOfCircle(entity, centerX, centerY, obstacleRadius) {
  let offsetX = entity.x - centerX;
  let offsetY = entity.y - centerY;
  let distance = Math.hypot(offsetX, offsetY);
  const minimumDistance = entity.radius + obstacleRadius;
  if (distance >= minimumDistance) return;
  if (distance === 0) {
    offsetX = 1;
    offsetY = 0;
    distance = 1;
  }
  const pushDistance = minimumDistance - distance;
  entity.x += (offsetX / distance) * pushDistance;
  entity.y += (offsetY / distance) * pushDistance;
}

/**
 * Kiểm tra các ô quanh entity (thêm 1 ô lề vì đồ vật có thể lệch khỏi tâm ô)
 * và đẩy entity ra khỏi mọi ô nước / công trình / vật cản đang chạm.
 */
export function pushOutOfWorld(world, entity) {
  const size = world.tileSize;
  const minTileX = pixelToTile(world, entity.x - entity.radius) - 1;
  const maxTileX = pixelToTile(world, entity.x + entity.radius) + 1;
  const minTileY = pixelToTile(world, entity.y - entity.radius) - 1;
  const maxTileY = pixelToTile(world, entity.y + entity.radius) + 1;

  for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
      const structure = getStructureAtTile(world, tileX, tileY);
      const isSolidSquare =
        getTile(world, tileX, tileY) === TILE.WATER || (structure !== undefined && doesStructureBlock(structure, entity));
      if (isSolidSquare) pushOutOfSquare(entity, tileX * size, tileY * size, size);
      const object = getObjectAtTile(world, tileX, tileY);
      if (object?.isBlocking) pushOutOfCircle(entity, object.x, object.y, object.collisionRadius);
    }
  }
  entity.x = clamp(entity.x, entity.radius, world.pixelWidth - entity.radius);
  entity.y = clamp(entity.y, entity.radius, world.pixelHeight - entity.radius);
}
