// Hình vẽ nhân vật và sinh vật bằng canvas: người chơi, zombie (ngố, không đáng sợ), thỏ, hươu, lợn rừng.
// Mọi hàm vẽ có dạng drawX(ctx, entity, frame) với frame = { timeSeconds, reducedMotion, game }.
// Hình cơ bản ở render/shapes.js, icon đồ cầm tay ở render/worldSprites.js; *_SHAPE chỉ là tỉ lệ hình vẽ.

import { COLORS, COMBAT, ITEMS } from '../config.js';
import { fillCircle, fillEllipse, drawSoftShadow, drawHealthBar } from './shapes.js';
import { drawItemIcon } from './worldSprites.js';

/** Tỉ lệ các bộ phận của nhân vật, tính theo bán kính thân. */
const PLAYER_SHAPE = {
  outlineWidth: 0.14,
  bobHeight: 0.12,
  shadowOffsetY: 0.85,
  shadowWidth: 0.9,
  shadowHeight: 0.32,
  backpackDistance: 0.72,
  backpackRadius: 0.5,
  backpackInnerRatio: 0.8,
  eyeForward: 0.32,
  eyeSpacing: 0.36,
  eyeRadius: 0.17,
  eyeShineRadius: 0.07,
  cheekForward: 0.12,
  cheekSpacing: 0.62,
  cheekRadius: 0.13,
  handForward: 0.95,
  handSide: 0.55,
  handRadius: 0.22,
  heldItemSize: 1.25, // icon đồ cầm tay to bằng 1.25 lần bán kính thân
  blinkSpeed: 30, // nhấp nháy khi đang miễn sát thương
};

const ZOMBIE_SHAPE = {
  outlineWidth: 0.13,
  wobbleAngle: 0.12,
  bobHeight: 0.08,
  armForward: 0.95,
  armSide: 0.55,
  armRadius: 0.24,
  bigEyeRadius: 0.2, // một mắt to một mắt nhỏ cho ngố
  smallEyeRadius: 0.13,
  eyeForward: 0.3,
  eyeSpacing: 0.33,
  mouthForward: 0.55,
  mouthWidth: 0.28,
};

const SLEEP_TEXT_FONT = '800 14px Nunito, system-ui, sans-serif';
const ALERT_FONT = '900 16px Nunito, system-ui, sans-serif';
const HEALTH_BAR_WIDTH_RATIO = 2; // thanh máu dài gấp 2 bán kính
const HEALTH_BAR_OFFSET_RATIO = 1.7;

// =====================================================================
// Mắt, má, tay — dùng chung
// =====================================================================

/** Hai mắt có chấm sáng, lệch theo hướng nhìn; leftRadius/rightRadius khác nhau thì trông ngố. */
function drawEyes(ctx, centerX, centerY, radius, facingX, facingY, leftRadius, rightRadius) {
  const sideX = -facingY;
  const sideY = facingX;
  const forwardX = centerX + facingX * radius * PLAYER_SHAPE.eyeForward;
  const forwardY = centerY + facingY * radius * PLAYER_SHAPE.eyeForward;
  const spacing = radius * PLAYER_SHAPE.eyeSpacing;
  for (const [side, eyeRadius] of [[-1, leftRadius], [1, rightRadius]]) {
    const eyeX = forwardX + sideX * spacing * side;
    const eyeY = forwardY + sideY * spacing * side;
    const shineRadius = eyeRadius * 0.4;
    fillCircle(ctx, eyeX, eyeY, eyeRadius, COLORS.eye);
    fillCircle(ctx, eyeX - shineRadius, eyeY - shineRadius, shineRadius, COLORS.eyeShine);
  }
}

function drawClosedEyes(ctx, centerX, centerY, radius) {
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.eye;
  const spacing = radius * PLAYER_SHAPE.eyeSpacing;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(centerX + spacing * side, centerY, radius * 0.14, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
}

function drawCheeks(ctx, centerX, centerY, radius, facingX, facingY) {
  const sideX = -facingY;
  const sideY = facingX;
  const baseX = centerX + facingX * radius * PLAYER_SHAPE.cheekForward;
  const baseY = centerY + facingY * radius * PLAYER_SHAPE.cheekForward + radius * PLAYER_SHAPE.cheekForward;
  const spacing = radius * PLAYER_SHAPE.cheekSpacing;
  const cheekRadius = radius * PLAYER_SHAPE.cheekRadius;
  for (const side of [-1, 1]) {
    fillCircle(ctx, baseX + sideX * spacing * side, baseY + sideY * spacing * side, cheekRadius, COLORS.playerCheek);
  }
}

function drawOutlinedBody(ctx, x, y, radius, fillColor, outlineColor, outlineRatio) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.lineWidth = radius * outlineRatio;
  ctx.strokeStyle = outlineColor;
  ctx.stroke();
}

function drawHurtFlash(ctx, entity, x, y) {
  if (entity.hurtTimer > 0) fillCircle(ctx, x, y, entity.radius, COLORS.hitFlash);
}

export function drawCreatureHealthBar(ctx, creature) {
  if (creature.healthBarTimer <= 0 || creature.isDead) return;
  drawHealthBar(
    ctx,
    creature.x,
    creature.y - creature.radius * HEALTH_BAR_OFFSET_RATIO,
    creature.radius * HEALTH_BAR_WIDTH_RATIO,
    Math.max(0, creature.health / creature.maxHealth),
    COLORS.healthBarFill,
  );
}

// =====================================================================
// Người chơi
// =====================================================================

function drawBackpack(ctx, bodyX, bodyY, radius, facingX, facingY) {
  const backpackX = bodyX - facingX * radius * PLAYER_SHAPE.backpackDistance;
  const backpackY = bodyY - facingY * radius * PLAYER_SHAPE.backpackDistance;
  const backpackRadius = radius * PLAYER_SHAPE.backpackRadius;
  fillCircle(ctx, backpackX, backpackY, backpackRadius, COLORS.backpackOutline);
  fillCircle(ctx, backpackX, backpackY, backpackRadius * PLAYER_SHAPE.backpackInnerRatio, COLORS.backpack);
}

/** Góc vung: khi đang vung, đồ cầm quét từ một bên sang bên kia trong meleeSwingSeconds. */
function heldItemAngle(player) {
  const baseAngle = Math.atan2(player.facingY, player.facingX);
  if (player.swingTimer <= 0) return baseAngle;
  const progress = 1 - player.swingTimer / COMBAT.meleeSwingSeconds;
  return baseAngle + (progress - 0.5) * COMBAT.meleeArcRadians;
}

/** Bàn tay tròn cầm món đồ đang chọn (rìu, súng, gỗ...) phía trước mặt. */
function drawHeldItem(ctx, player, bodyX, bodyY, itemId) {
  const angle = heldItemAngle(player);
  const handX = bodyX + Math.cos(angle) * player.radius * PLAYER_SHAPE.handForward;
  const handY = bodyY + Math.sin(angle) * player.radius * PLAYER_SHAPE.handForward;
  if (itemId) {
    ctx.save();
    ctx.translate(handX, handY);
    if (ITEMS[itemId]?.isGun) ctx.rotate(angle);
    drawItemIcon(ctx, itemId, 0, 0, player.radius * PLAYER_SHAPE.heldItemSize);
    ctx.restore();
  }
  fillCircle(ctx, handX, handY, player.radius * PLAYER_SHAPE.handRadius, COLORS.playerOutline);
}

function drawSleepingPlayer(ctx, player, frame) {
  const { radius } = player;
  drawOutlinedBody(ctx, player.x, player.y, radius, COLORS.playerBody, COLORS.playerOutline, PLAYER_SHAPE.outlineWidth);
  drawClosedEyes(ctx, player.x, player.y, radius);
  const float = frame.reducedMotion ? 0 : Math.sin(frame.timeSeconds * 2) * 3;
  ctx.font = SLEEP_TEXT_FONT;
  ctx.fillStyle = COLORS.outline;
  ctx.textAlign = 'center';
  ctx.fillText('Zz', player.x + radius, player.y - radius - 6 + float);
}

/** Người chơi: bóng, ba lô phía sau, thân tròn, má hồng, mắt to, tay cầm đồ. */
export function drawPlayer(ctx, player, frame) {
  if (player.isDead) return;
  const { radius, facingX, facingY } = player;
  drawSoftShadow(ctx, player.x, player.y + radius * PLAYER_SHAPE.shadowOffsetY, radius * PLAYER_SHAPE.shadowWidth, radius * PLAYER_SHAPE.shadowHeight);
  if (player.isSleeping) {
    drawSleepingPlayer(ctx, player, frame);
    return;
  }
  const isBlinking = player.invulnerableTimer > 0 && Math.sin(frame.timeSeconds * PLAYER_SHAPE.blinkSpeed) > 0;
  ctx.save();
  if (isBlinking) ctx.globalAlpha = 0.55;
  const bobAmount = frame.reducedMotion || !player.isMoving ? 0 : Math.abs(Math.sin(player.walkCycle));
  const bodyX = player.x;
  const bodyY = player.y - bobAmount * radius * PLAYER_SHAPE.bobHeight;
  const heldItemId = frame.heldItemId;
  const isFacingUp = facingY < 0;

  if (isFacingUp) drawHeldItem(ctx, player, bodyX, bodyY, heldItemId); // tay ở sau lưng khi quay lên
  drawBackpack(ctx, bodyX, bodyY, radius, facingX, facingY);
  drawOutlinedBody(ctx, bodyX, bodyY, radius, COLORS.playerBody, COLORS.playerOutline, PLAYER_SHAPE.outlineWidth);
  drawCheeks(ctx, bodyX, bodyY, radius, facingX, facingY);
  const eyeRadius = radius * PLAYER_SHAPE.eyeRadius;
  drawEyes(ctx, bodyX, bodyY, radius, facingX, facingY, eyeRadius, eyeRadius);
  if (!isFacingUp) drawHeldItem(ctx, player, bodyX, bodyY, heldItemId);
  ctx.restore();
}

// =====================================================================
// Zombie
// =====================================================================

const ZOMBIE_COLORS = {
  normal: [COLORS.zombieNormal, COLORS.zombieNormalOutline],
  runner: [COLORS.zombieRunner, COLORS.zombieRunnerOutline],
  brute: [COLORS.zombieBrute, COLORS.zombieBruteOutline],
};

function drawZombieArms(ctx, zombie, x, y, color) {
  const { radius, facingX, facingY } = zombie;
  const sideX = -facingY;
  const sideY = facingX;
  for (const side of [-1, 1]) {
    fillCircle(
      ctx,
      x + facingX * radius * ZOMBIE_SHAPE.armForward + sideX * radius * ZOMBIE_SHAPE.armSide * side,
      y + facingY * radius * ZOMBIE_SHAPE.armForward + sideY * radius * ZOMBIE_SHAPE.armSide * side,
      radius * ZOMBIE_SHAPE.armRadius,
      color,
    );
  }
}

/** Miệng lượn sóng nhỏ, trông ngơ ngác chứ không hung dữ. */
function drawZombieMouth(ctx, zombie, x, y) {
  const { radius, facingX, facingY } = zombie;
  const mouthX = x + facingX * radius * ZOMBIE_SHAPE.mouthForward;
  const mouthY = y + facingY * radius * ZOMBIE_SHAPE.mouthForward + radius * 0.15;
  const halfWidth = radius * ZOMBIE_SHAPE.mouthWidth;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, radius * 0.1);
  ctx.strokeStyle = COLORS.zombieMouth;
  ctx.beginPath();
  ctx.moveTo(mouthX - halfWidth, mouthY);
  ctx.quadraticCurveTo(mouthX - halfWidth / 2, mouthY + halfWidth * 0.5, mouthX, mouthY);
  ctx.quadraticCurveTo(mouthX + halfWidth / 2, mouthY - halfWidth * 0.5, mouthX + halfWidth, mouthY);
  ctx.stroke();
}

export function drawZombie(ctx, zombie, frame) {
  const [bodyColor, outlineColor] = ZOMBIE_COLORS[zombie.variant];
  const { radius } = zombie;
  const wobble = frame.reducedMotion ? 0 : Math.sin(zombie.wobblePhase);
  const x = zombie.x;
  const y = zombie.y - Math.abs(wobble) * radius * ZOMBIE_SHAPE.bobHeight;

  ctx.save();
  ctx.globalAlpha = Math.max(0, zombie.alpha);
  drawSoftShadow(ctx, zombie.x, zombie.y + radius * 0.85, radius * 0.9, radius * 0.32);
  ctx.translate(x, y);
  ctx.rotate(wobble * ZOMBIE_SHAPE.wobbleAngle);
  ctx.translate(-x, -y);
  drawZombieArms(ctx, zombie, x, y, outlineColor);
  drawOutlinedBody(ctx, x, y, radius, bodyColor, outlineColor, ZOMBIE_SHAPE.outlineWidth);
  if (zombie.variant === 'runner') fillCircle(ctx, x - zombie.facingX * radius * 0.6, y - radius * 0.8, radius * 0.25, outlineColor);
  if (zombie.variant === 'brute') fillEllipse(ctx, x, y - radius * 0.55, radius * 0.45, radius * 0.18, outlineColor);
  drawEyes(ctx, x, y, radius, zombie.facingX, zombie.facingY, radius * ZOMBIE_SHAPE.bigEyeRadius, radius * ZOMBIE_SHAPE.smallEyeRadius);
  drawZombieMouth(ctx, zombie, x, y);
  drawHurtFlash(ctx, zombie, x, y);
  ctx.restore();
  drawCreatureHealthBar(ctx, zombie);
}

// =====================================================================
// Thú rừng
// =====================================================================

function hopOffset(animal, frame, height) {
  if (frame.reducedMotion || !animal.isMoving) return 0;
  return Math.abs(Math.sin(animal.hopPhase)) * height;
}

function drawRabbit(ctx, rabbit, frame) {
  const { radius, facingX, facingY } = rabbit;
  const x = rabbit.x;
  const y = rabbit.y - hopOffset(rabbit, frame, radius * 0.5);
  drawSoftShadow(ctx, rabbit.x, rabbit.y + radius * 0.8, radius * 0.9, radius * 0.3);
  fillCircle(ctx, x - facingX * radius * 0.9, y - facingY * radius * 0.6, radius * 0.4, COLORS.rabbit); // đuôi bông
  for (const side of [-1, 1]) {
    fillEllipse(ctx, x + side * radius * 0.35, y - radius * 1.1, radius * 0.28, radius * 0.7, COLORS.rabbitOutline);
    fillEllipse(ctx, x + side * radius * 0.35, y - radius * 1.1, radius * 0.14, radius * 0.48, COLORS.rabbitInnerEar);
  }
  drawOutlinedBody(ctx, x, y, radius, COLORS.rabbit, COLORS.rabbitOutline, 0.14);
  const eyeRadius = radius * 0.15;
  drawEyes(ctx, x, y, radius, facingX, facingY, eyeRadius, eyeRadius);
  fillCircle(ctx, x + facingX * radius * 0.65, y + facingY * radius * 0.65 + radius * 0.1, radius * 0.12, COLORS.nose);
  drawHurtFlash(ctx, rabbit, x, y);
}

function drawDeer(ctx, deer, frame) {
  const { radius, facingX, facingY } = deer;
  const x = deer.x;
  const y = deer.y - hopOffset(deer, frame, radius * 0.25);
  const headX = x + facingX * radius * 0.85;
  const headY = y + facingY * radius * 0.85 - radius * 0.2;
  drawSoftShadow(ctx, deer.x, deer.y + radius * 0.8, radius, radius * 0.32);
  drawOutlinedBody(ctx, x, y, radius, COLORS.deer, COLORS.deerOutline, 0.12);
  for (const [spotX, spotY] of [[-0.35, -0.2], [0.1, 0.3], [0.35, -0.35]]) {
    fillCircle(ctx, x + spotX * radius, y + spotY * radius, radius * 0.13, COLORS.deerSpot);
  }
  for (const side of [-1, 1]) {
    fillCircle(ctx, headX + side * radius * 0.38, headY - radius * 0.5, radius * 0.18, COLORS.antler);
    fillCircle(ctx, headX + side * radius * 0.55, headY - radius * 0.72, radius * 0.13, COLORS.antler);
  }
  drawOutlinedBody(ctx, headX, headY, radius * 0.55, COLORS.deer, COLORS.deerOutline, 0.14);
  const eyeRadius = radius * 0.1;
  drawEyes(ctx, headX, headY, radius * 0.55, facingX, facingY, eyeRadius, eyeRadius);
  drawHurtFlash(ctx, deer, x, y);
  if (deer.state === 'alert') {
    ctx.font = ALERT_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.outline;
    ctx.fillText('!', headX, headY - radius * 1.1);
  }
}

function drawBoar(ctx, boar, frame) {
  const { radius, facingX, facingY } = boar;
  const x = boar.x;
  const y = boar.y - hopOffset(boar, frame, radius * 0.2);
  const snoutX = x + facingX * radius * 0.8;
  const snoutY = y + facingY * radius * 0.8 + radius * 0.15;
  drawSoftShadow(ctx, boar.x, boar.y + radius * 0.8, radius, radius * 0.32);
  for (const side of [-1, 1]) {
    fillEllipse(ctx, x + side * radius * 0.6, y - radius * 0.75, radius * 0.25, radius * 0.3, COLORS.boarOutline);
  }
  drawOutlinedBody(ctx, x, y, radius, COLORS.boar, COLORS.boarOutline, 0.12);
  const eyeRadius = radius * 0.14;
  drawEyes(ctx, x, y - radius * 0.15, radius, facingX, facingY, eyeRadius, eyeRadius);
  if (boar.state === 'charge') {
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.outline;
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.5, y - radius * 0.55);
    ctx.lineTo(x - radius * 0.15, y - radius * 0.4);
    ctx.moveTo(x + radius * 0.5, y - radius * 0.55);
    ctx.lineTo(x + radius * 0.15, y - radius * 0.4);
    ctx.stroke();
  }
  for (const side of [-1, 1]) fillCircle(ctx, snoutX + side * radius * 0.42, snoutY + radius * 0.12, radius * 0.12, COLORS.tusk);
  fillEllipse(ctx, snoutX, snoutY, radius * 0.38, radius * 0.27, COLORS.boarSnout);
  for (const side of [-1, 1]) fillCircle(ctx, snoutX + side * radius * 0.13, snoutY, radius * 0.07, COLORS.boarOutline);
  drawHurtFlash(ctx, boar, x, y);
}

const ANIMAL_DRAWERS = { rabbit: drawRabbit, deer: drawDeer, boar: drawBoar };

export function drawAnimal(ctx, animal, frame) {
  ANIMAL_DRAWERS[animal.species](ctx, animal, frame);
  drawCreatureHealthBar(ctx, animal);
}
