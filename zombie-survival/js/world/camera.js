// Camera: vùng thế giới đang nhìn thấy, bám mềm theo người chơi, và đổi toạ độ thế giới ↔ màn hình.
// camera.x / camera.y là toạ độ thế giới tại góc trên-trái màn hình; zoom < 1 nghĩa là thu nhỏ để thấy rộng hơn.
// Dùng bởi main.js (cập nhật), render/renderer.js (vẽ), input (đổi vị trí chuột thành hướng ngắm).

import { CAMERA } from '../config.js';
import { clamp, lerp } from '../utils/math.js';

export function createCamera() {
  return { x: 0, y: 0, zoom: 1, viewWidth: 0, viewHeight: 0 };
}

/**
 * Chọn mức zoom sao cho chiều ngắn của màn hình luôn thấy ít nhất minVisibleWorldSpan px thế giới.
 * Điện thoại màn nhỏ sẽ được thu nhỏ một chút để không bị "dí sát mặt".
 */
export function fitCameraToViewport(camera, viewport) {
  const shortSide = Math.min(viewport.width, viewport.height);
  camera.zoom = clamp(shortSide / CAMERA.minVisibleWorldSpan, CAMERA.minZoom, CAMERA.maxZoom);
  camera.viewWidth = viewport.width / camera.zoom;
  camera.viewHeight = viewport.height / camera.zoom;
}

/** Giữ camera trong map; nếu map nhỏ hơn màn hình thì căn giữa. */
function clampAxis(position, viewSize, worldSize) {
  if (viewSize >= worldSize) return (worldSize - viewSize) / 2;
  return clamp(position, 0, worldSize - viewSize);
}

function desiredX(camera, target, world) {
  return clampAxis(target.x - camera.viewWidth / 2, camera.viewWidth, world.pixelWidth);
}

function desiredY(camera, target, world) {
  return clampAxis(target.y - camera.viewHeight / 2, camera.viewHeight, world.pixelHeight);
}

/** Đặt camera ngay vào mục tiêu (khi bắt đầu game, hồi sinh...). */
export function snapCameraToTarget(camera, target, world) {
  camera.x = desiredX(camera, target, world);
  camera.y = desiredY(camera, target, world);
}

/**
 * Camera trượt mềm về phía mục tiêu. Hệ số 1 - e^(-k·dt) cho độ bám như nhau
 * dù máy chạy 30 hay 144 FPS (một hệ số cố định mỗi frame thì máy nhanh sẽ bám chặt hơn).
 */
export function followTarget(camera, target, world, deltaSeconds) {
  const blend = 1 - Math.exp(-CAMERA.followSharpness * deltaSeconds);
  camera.x = lerp(camera.x, desiredX(camera, target, world), blend);
  camera.y = lerp(camera.y, desiredY(camera, target, world), blend);
}

export function worldToScreen(camera, worldX, worldY, out) {
  out.x = (worldX - camera.x) * camera.zoom;
  out.y = (worldY - camera.y) * camera.zoom;
  return out;
}

export function screenToWorld(camera, screenX, screenY, out) {
  out.x = screenX / camera.zoom + camera.x;
  out.y = screenY / camera.zoom + camera.y;
  return out;
}

/** Khoảng ô đang nhìn thấy (cộng thêm lề), đã kẹp trong map. Ghi vào `out` để dùng lại object. */
export function getVisibleTileRange(camera, world, marginTiles, out) {
  const size = world.tileSize;
  out.minX = Math.max(0, Math.floor(camera.x / size) - marginTiles);
  out.minY = Math.max(0, Math.floor(camera.y / size) - marginTiles);
  out.maxX = Math.min(world.widthInTiles - 1, Math.floor((camera.x + camera.viewWidth) / size) + marginTiles);
  out.maxY = Math.min(world.heightInTiles - 1, Math.floor((camera.y + camera.viewHeight) / size) + marginTiles);
  return out;
}
