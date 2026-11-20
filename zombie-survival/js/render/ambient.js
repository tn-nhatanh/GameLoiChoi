// Sinh vật trang trí bay quanh màn hình cho đảo thêm sinh động: bướm pastel ban ngày, đom đóm lập loè ban đêm.
// Thuần hình ảnh — không va chạm, không ảnh hưởng gameplay, không lưu. Dùng lại một mảng object cố định (không tạo rác).
// Được renderer.js gọi mỗi frame: updateAmbient() rồi drawButterflies() (dưới lớp đêm) và drawFireflies() (trên lớp đêm).

import { AMBIENT, COLORS } from '../config.js';
import { fillCircle, fillEllipse } from './shapes.js';

const BUTTERFLY_DAY_DARKNESS = 0.25; // trời tối hơn mức này thì bướm đi ngủ
const FIREFLY_NIGHT_DARKNESS = 0.2; // tối hơn mức này thì đom đóm ra
const FADE_SPEED = 1.5; // tốc độ hiện / ẩn dần (1/giây)
const MAX_STEP_SECONDS = 0.1;

function createCritter() {
  return { x: 0, y: 0, angle: 0, turn: 0, phase: Math.random() * Math.PI * 2, colorIndex: 0, isPlaced: false };
}

export function createAmbient() {
  return {
    butterflies: Array.from({ length: AMBIENT.butterflyCount }, createCritter),
    fireflies: Array.from({ length: AMBIENT.fireflyCount }, createCritter),
    butterflyAlpha: 1,
    fireflyAlpha: 0,
    lastTimeSeconds: null,
  };
}

/** Đặt lại ở một chỗ ngẫu nhiên trong khung camera. */
function placeInView(critter, camera) {
  critter.x = camera.x + Math.random() * camera.viewWidth;
  critter.y = camera.y + Math.random() * camera.viewHeight;
  critter.angle = Math.random() * Math.PI * 2;
  critter.colorIndex = Math.floor(Math.random() * COLORS.butterflyWings.length);
  critter.isPlaced = true;
}

function isFarOutside(critter, camera) {
  const margin = AMBIENT.respawnMargin;
  return (
    critter.x < camera.x - margin ||
    critter.x > camera.x + camera.viewWidth + margin ||
    critter.y < camera.y - margin ||
    critter.y > camera.y + camera.viewHeight + margin
  );
}

/** Bay lượn: hướng bay đổi dần theo một "tay lái" ngẫu nhiên → đường bay cong mềm. */
function flutter(critter, camera, speed, deltaSeconds) {
  if (!critter.isPlaced || isFarOutside(critter, camera)) placeInView(critter, camera);
  critter.turn += (Math.random() * 2 - 1) * AMBIENT.turnRate * deltaSeconds * 4;
  critter.turn = Math.max(-AMBIENT.turnRate, Math.min(AMBIENT.turnRate, critter.turn));
  critter.angle += critter.turn * deltaSeconds;
  critter.x += Math.cos(critter.angle) * speed * deltaSeconds;
  critter.y += Math.sin(critter.angle) * speed * deltaSeconds;
  critter.phase += AMBIENT.flapSpeed * deltaSeconds;
}

function approach(current, target, step) {
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}

export function updateAmbient(ambient, camera, timeSeconds, darkness) {
  const deltaSeconds = ambient.lastTimeSeconds === null ? 0 : Math.min(MAX_STEP_SECONDS, Math.max(0, timeSeconds - ambient.lastTimeSeconds));
  ambient.lastTimeSeconds = timeSeconds;
  ambient.butterflyAlpha = approach(ambient.butterflyAlpha, darkness < BUTTERFLY_DAY_DARKNESS ? 1 : 0, FADE_SPEED * deltaSeconds);
  ambient.fireflyAlpha = approach(ambient.fireflyAlpha, darkness > FIREFLY_NIGHT_DARKNESS ? 1 : 0, FADE_SPEED * deltaSeconds);
  if (ambient.butterflyAlpha > 0) {
    for (const butterfly of ambient.butterflies) flutter(butterfly, camera, AMBIENT.butterflySpeed, deltaSeconds);
  }
  if (ambient.fireflyAlpha > 0) {
    for (const firefly of ambient.fireflies) flutter(firefly, camera, AMBIENT.fireflySpeed, deltaSeconds);
  }
}

/** Bướm: hai cặp cánh tròn vỗ (co giãn theo chiều ngang) quanh thân nhỏ. */
export function drawButterflies(ctx, ambient) {
  if (ambient.butterflyAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = ambient.butterflyAlpha;
  for (const butterfly of ambient.butterflies) {
    const flap = 0.35 + Math.abs(Math.sin(butterfly.phase)) * 0.65;
    const color = COLORS.butterflyWings[butterfly.colorIndex];
    const lift = Math.sin(butterfly.phase * 0.25) * 4; // nhấp nhô lên xuống
    const y = butterfly.y + lift;
    for (const side of [-1, 1]) {
      fillEllipse(ctx, butterfly.x + side * 4 * flap, y - 2, 4.2 * flap, 4.2, color);
      fillEllipse(ctx, butterfly.x + side * 3 * flap, y + 3, 3 * flap, 2.8, color);
    }
    fillEllipse(ctx, butterfly.x, y, 1.2, 4, COLORS.outline);
  }
  ctx.restore();
}

/** Đom đóm: chấm vàng có quầng sáng, nhấp nháy lệch pha nhau. Vẽ SAU lớp đêm để sáng nổi bật. */
export function drawFireflies(ctx, ambient) {
  if (ambient.fireflyAlpha <= 0) return;
  ctx.save();
  for (const firefly of ambient.fireflies) {
    const glow = 0.4 + Math.max(0, Math.sin(firefly.phase * 0.18)) * 0.6;
    ctx.globalAlpha = ambient.fireflyAlpha * glow;
    fillCircle(ctx, firefly.x, firefly.y, 7, COLORS.fireflyGlow);
    fillCircle(ctx, firefly.x, firefly.y, 2.2, COLORS.firefly);
  }
  ctx.restore();
}
