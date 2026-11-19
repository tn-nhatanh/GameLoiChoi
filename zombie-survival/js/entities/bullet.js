// Viên đạn: bay thẳng, hết tầm thì biến mất, trúng thân cây/tảng đá thì dừng lại.
// Dùng một "bể" (pool) số lượng cố định và tái sử dụng object, không tạo mới mỗi phát bắn.
// Va chạm với zombie/thú được xử lý trong systems/combat.js; vẽ trong render/worldSprites.js.

import { GUN } from '../config.js';
import { getObjectAtTile, pixelToTile } from '../world/mapGen.js';
import { emit } from '../utils/events.js';

export function createBulletPool() {
  return Array.from({ length: GUN.maxBullets }, () => ({
    type: 'bullet',
    isActive: false,
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
    velocityX: 0,
    velocityY: 0,
    distanceTravelled: 0,
    radius: GUN.bulletRadius,
  }));
}

/** Lấy một viên đang rảnh trong bể; nếu hết thì bỏ qua phát bắn (hiếm khi xảy ra). */
export function spawnBullet(game, x, y, angle) {
  const bullet = game.bullets.find((candidate) => !candidate.isActive);
  if (!bullet) return;
  bullet.isActive = true;
  bullet.x = x;
  bullet.y = y;
  bullet.previousX = x;
  bullet.previousY = y;
  bullet.velocityX = Math.cos(angle) * GUN.bulletSpeed;
  bullet.velocityY = Math.sin(angle) * GUN.bulletSpeed;
  bullet.distanceTravelled = 0;
}

function hitsObstacle(game, bullet) {
  const world = game.world;
  const object = getObjectAtTile(world, pixelToTile(world, bullet.x), pixelToTile(world, bullet.y));
  if (!object?.isBlocking) return false;
  return Math.hypot(object.x - bullet.x, object.y - bullet.y) < object.collisionRadius + bullet.radius;
}

export function updateBullets(game, deltaSeconds) {
  for (const bullet of game.bullets) {
    if (!bullet.isActive) continue;
    bullet.previousX = bullet.x;
    bullet.previousY = bullet.y;
    bullet.x += bullet.velocityX * deltaSeconds;
    bullet.y += bullet.velocityY * deltaSeconds;
    bullet.distanceTravelled += GUN.bulletSpeed * deltaSeconds;

    if (bullet.distanceTravelled > GUN.bulletRange) {
      bullet.isActive = false;
    } else if (hitsObstacle(game, bullet)) {
      bullet.isActive = false;
      emit(game, 'particles', { preset: 'spark', x: bullet.x, y: bullet.y });
    }
  }
}
