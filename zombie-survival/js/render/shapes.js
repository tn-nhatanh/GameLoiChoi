// Các hàm vẽ hình cơ bản dùng chung: hình tròn, elip, chữ nhật bo góc, bóng đổ mềm.
// Không có góc nhọn nào trong game — mọi thứ được ghép từ các hình này.
// Dùng bởi render/sprites.js, render/worldSprites.js.

import { COLORS } from '../config.js';

export const FULL_CIRCLE = Math.PI * 2;
const HEALTH_BAR_HEIGHT = 5;

export function fillCircle(ctx, x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, FULL_CIRCLE);
  ctx.fillStyle = color;
  ctx.fill();
}

export function fillEllipse(ctx, x, y, radiusX, radiusY, color, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, FULL_CIRCLE);
  ctx.fillStyle = color;
  ctx.fill();
}

export function roundedRectPath(ctx, x, y, width, height, corner) {
  const radius = Math.max(0, Math.min(corner, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

export function fillRoundedRect(ctx, x, y, width, height, corner, color) {
  roundedRectPath(ctx, x, y, width, height, corner);
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawSoftShadow(ctx, x, y, width, height) {
  fillEllipse(ctx, x, y, width, height, COLORS.shadow);
}

/** Thanh máu bo tròn nhỏ (ratio 0..1), canh giữa tại (centerX, y). */
export function drawHealthBar(ctx, centerX, y, width, ratio, fillColor) {
  const height = HEALTH_BAR_HEIGHT;
  fillRoundedRect(ctx, centerX - width / 2, y, width, height, height / 2, COLORS.healthBarBack);
  if (ratio > 0) fillRoundedRect(ctx, centerX - width / 2, y, width * ratio, height, height / 2, fillColor);
}
