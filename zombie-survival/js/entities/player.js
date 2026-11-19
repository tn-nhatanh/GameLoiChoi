// Nhân vật người chơi: vị trí, hướng nhìn, chỉ số sinh tồn, và các bộ đếm giờ (hồi chiêu, nạp đạn, miễn sát thương).
// Mỗi frame nhận "controls" đã được chuẩn hoá từ input.js nên không biết gì về bàn phím hay cảm ứng.
// Va chạm qua world/collision.js; máu/đói/thể lực do systems/survival.js quản lý; vẽ trong render/sprites.js.

import { PLAYER, SURVIVAL, COMBAT } from '../config.js';
import { moveWithCollision } from '../world/collision.js';
import { spendStamina } from '../systems/survival.js';

export function createPlayer(x, y) {
  return {
    type: 'player', // renderer dùng type để chọn hàm vẽ
    x,
    y,
    radius: PLAYER.radius,
    canPassDoors: true, // người chơi đi qua cửa của mình được, zombie thì không
    facingX: 0, // hướng đang nhìn (vector đơn vị) — mặc định nhìn xuống
    facingY: 1,
    isMoving: false,
    isSprinting: false,
    isAiming: false,
    walkCycle: 0, // pha nhún nhảy khi đi, dùng cho hoạt ảnh

    // Sinh tồn (systems/survival.js)
    health: SURVIVAL.maxHealth,
    hunger: SURVIVAL.maxHunger,
    stamina: SURVIVAL.maxStamina,
    staminaRegenDelay: 0,
    isWarm: false,
    isCold: false,
    isSleeping: false,
    isDead: false,
    starvingToastTimer: 0,

    // Hành động & chiến đấu
    selectedSlot: 0, // ô đang chọn trên thanh nhanh
    slotBeforeBuild: 0, // ô đang cầm trước khi bấm B, để thoát chế độ xây thì trả lại
    meleeCooldown: 0,
    swingTimer: 0,
    gunCooldown: 0,
    gunMagazine: 0, // số đạn trong băng (súng mới chế tạo thì băng rỗng, cần nạp)
    reloadTimer: 0,
    muzzleTimer: 0,
    eatCooldown: 0,
    invulnerableTimer: 0,
    knockbackX: 0,
    knockbackY: 0,
  };
}

/** controls = { moveX, moveY, aimX, aimY, hasAim, wantsSprint } */
export function updatePlayer(player, controls, deltaSeconds, world) {
  updateTimers(player, deltaSeconds);
  if (player.isSleeping || player.isDead) {
    player.isMoving = false;
    player.isSprinting = false;
    return;
  }
  applyKnockback(player, deltaSeconds, world);
  movePlayer(player, controls, deltaSeconds, world);
  updateFacing(player, controls);
  player.isAiming = controls.hasAim;
}

function updateTimers(player, deltaSeconds) {
  player.meleeCooldown -= deltaSeconds;
  player.swingTimer = Math.max(0, player.swingTimer - deltaSeconds);
  player.gunCooldown -= deltaSeconds;
  player.muzzleTimer = Math.max(0, player.muzzleTimer - deltaSeconds);
  player.eatCooldown -= deltaSeconds;
  player.invulnerableTimer -= deltaSeconds;
}

function applyKnockback(player, deltaSeconds, world) {
  if (player.knockbackX === 0 && player.knockbackY === 0) return;
  moveWithCollision(world, player, player.knockbackX * deltaSeconds, player.knockbackY * deltaSeconds);
  const decay = Math.exp(-COMBAT.knockbackDecay * deltaSeconds);
  player.knockbackX *= decay;
  player.knockbackY *= decay;
  if (Math.hypot(player.knockbackX, player.knockbackY) < 1) {
    player.knockbackX = 0;
    player.knockbackY = 0;
  }
}

/** Chạy nhanh khi giữ Shift (hoặc đẩy cần hết cỡ) và còn thể lực; chạy tốn thể lực mỗi giây. */
function movePlayer(player, controls, deltaSeconds, world) {
  player.isMoving = controls.moveX !== 0 || controls.moveY !== 0;
  player.isSprinting = player.isMoving && controls.wantsSprint && player.stamina > SURVIVAL.minStaminaToSprint;
  const speed = PLAYER.walkSpeed * (player.isSprinting ? PLAYER.sprintMultiplier : 1);
  if (player.isSprinting) spendStamina(player, SURVIVAL.sprintStaminaPerSecond * deltaSeconds);

  const distance = speed * deltaSeconds;
  moveWithCollision(world, player, controls.moveX * distance, controls.moveY * distance);
  if (player.isMoving) {
    const cycleMultiplier = player.isSprinting ? PLAYER.sprintMultiplier : 1;
    player.walkCycle += PLAYER.walkCycleSpeed * cycleMultiplier * deltaSeconds;
  }
}

/** Ưu tiên hướng ngắm; nếu không ngắm thì nhìn theo hướng đang đi. */
function updateFacing(player, controls) {
  if (controls.hasAim) {
    player.facingX = controls.aimX;
    player.facingY = controls.aimY;
  } else if (player.isMoving) {
    const length = Math.hypot(controls.moveX, controls.moveY);
    player.facingX = controls.moveX / length;
    player.facingY = controls.moveY / length;
  }
}
