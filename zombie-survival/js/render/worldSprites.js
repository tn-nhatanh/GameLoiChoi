// Hình vẽ đồ vật trong thế giới: cây, đá, bụi quả (kể cả lúc đã khai thác), công trình, vật phẩm rơi, đạn,
// bóng mờ khi xây, và icon vật phẩm (dùng chung cho túi đồ, thanh nhanh, đồ cầm trên tay).
// Mọi hình đều ghép từ render/shapes.js; *_SHAPE / số trong hàm vẽ là kích thước hình học, không ảnh hưởng gameplay.

import { COLORS, RENDER, WORLD } from '../config.js';
import {
  FULL_CIRCLE,
  fillCircle,
  fillEllipse,
  fillRoundedRect,
  roundedRectPath,
  drawSoftShadow,
  drawHealthBar,
} from './shapes.js';

/** Hình công trình được thiết kế trong ô 48x48 rồi phóng to/thu nhỏ theo kích thước thật. */
const STRUCTURE_DESIGN_SIZE = 48;
/** Icon vật phẩm được thiết kế trong hộp 32x32, tâm ở (0, 0). */
const ICON_DESIGN_SIZE = 32;
const HIT_SHAKE = { speed: 70, amount: 2.5, seconds: 0.18 };
const CRACK_HEALTH_RATIO = 0.5; // dưới nửa máu thì hiện vết nứt

// =====================================================================
// Cây, đá, bụi
// =====================================================================

/** Cây (px ở tỉ lệ 1). Gốc toạ độ là chân thân cây. */
const TREE_SHAPE = {
  shadowWidth: 22,
  shadowHeight: 8,
  trunkWidth: 14,
  trunkHeight: 24,
  trunkCorner: 5,
  trunkShadeX: 2,
  trunkShadeWidth: 5,
  canopyY: -38,
  canopyRadius: 22,
  sideLobeX: 15,
  sideLobeY: 7,
  sideLobeRadius: 15,
  shadeDrop: 4,
  highlightX: -8,
  highlightY: -9,
  highlightRadius: 8,
  stumpWidth: 12,
  stumpHeight: 9,
  stumpTopHeight: 5,
};

const ROCK_SHAPE = {
  shadowWidth: 20,
  shadowHeight: 7,
  bodyY: -11,
  bodyWidth: 18,
  bodyHeight: 14,
  bumpX: 9,
  bumpY: -17,
  bumpRadius: 9,
  shadeDrop: 3,
  highlightX: -6,
  highlightY: -16,
  highlightWidth: 6,
  highlightHeight: 3.5,
  pebbles: [
    { x: -7, y: -3, width: 6, height: 4 },
    { x: 5, y: -2, width: 5, height: 3.5 },
    { x: 0, y: -7, width: 4, height: 3 },
  ],
};

const BUSH_SHAPE = {
  shadowWidth: 20,
  shadowHeight: 7,
  lobes: [
    { x: -9, y: -10, radius: 11 },
    { x: 9, y: -10, radius: 11 },
    { x: 0, y: -17, radius: 13 },
  ],
  shadeDrop: 3,
  berryRadius: 3.2,
  berries: [
    { x: -9, y: -12 },
    { x: 6, y: -19 },
    { x: 10, y: -9 },
    { x: -2, y: -7 },
  ],
};

function hitShakeOffset(object, frame) {
  if (object.hitTimer <= 0 || frame.reducedMotion) return 0;
  return Math.sin(frame.timeSeconds * HIT_SHAKE.speed) * HIT_SHAKE.amount * (object.hitTimer / HIT_SHAKE.seconds);
}

function drawTreeStump(ctx) {
  const shape = TREE_SHAPE;
  drawSoftShadow(ctx, 0, 0, shape.shadowWidth * 0.7, shape.shadowHeight * 0.8);
  fillRoundedRect(ctx, -shape.stumpWidth / 2, -shape.stumpHeight, shape.stumpWidth, shape.stumpHeight, 4, COLORS.trunk);
  fillEllipse(ctx, 0, -shape.stumpHeight, shape.stumpWidth / 2, shape.stumpTopHeight / 2, COLORS.stump);
  fillEllipse(ctx, 0, -shape.stumpHeight, shape.stumpWidth / 5, shape.stumpTopHeight / 5, COLORS.trunkShade);
}

/** Cây: thân bo góc nâu sữa, tán ba cụm tròn lắc lư nhẹ theo gió. Đã chặt thì còn gốc. */
export function drawTree(ctx, tree, frame) {
  const shape = TREE_SHAPE;
  ctx.save();
  ctx.translate(tree.x + hitShakeOffset(tree, frame), tree.y);
  ctx.scale(tree.scale, tree.scale);
  if (tree.isDepleted) {
    drawTreeStump(ctx);
    ctx.restore();
    return;
  }
  const sway = frame.reducedMotion
    ? 0
    : Math.sin(frame.timeSeconds * RENDER.treeSwaySpeed + tree.swayPhase) * RENDER.treeSwayAmount;
  drawSoftShadow(ctx, 0, 0, shape.shadowWidth, shape.shadowHeight);
  fillRoundedRect(ctx, -shape.trunkWidth / 2, -shape.trunkHeight, shape.trunkWidth, shape.trunkHeight, shape.trunkCorner, COLORS.trunk);
  fillRoundedRect(ctx, shape.trunkShadeX, -shape.trunkHeight, shape.trunkShadeWidth, shape.trunkHeight, shape.trunkCorner, COLORS.trunkShade);

  ctx.translate(sway, shape.canopyY);
  const lobes = [
    [-shape.sideLobeX, shape.sideLobeY, shape.sideLobeRadius],
    [shape.sideLobeX, shape.sideLobeY, shape.sideLobeRadius],
    [0, 0, shape.canopyRadius],
  ];
  for (const [x, y, radius] of lobes) fillCircle(ctx, x, y + shape.shadeDrop, radius, COLORS.leavesShade);
  for (const [x, y, radius] of lobes) fillCircle(ctx, x, y, radius, COLORS.leaves);
  fillCircle(ctx, shape.highlightX, shape.highlightY, shape.highlightRadius, COLORS.leavesHighlight);
  ctx.restore();
}

function drawRockBody(ctx) {
  const shape = ROCK_SHAPE;
  fillEllipse(ctx, 0, shape.bodyY + shape.shadeDrop, shape.bodyWidth, shape.bodyHeight, COLORS.rockShade);
  fillCircle(ctx, shape.bumpX, shape.bumpY + shape.shadeDrop, shape.bumpRadius, COLORS.rockShade);
  fillEllipse(ctx, 0, shape.bodyY, shape.bodyWidth, shape.bodyHeight, COLORS.rock);
  fillCircle(ctx, shape.bumpX, shape.bumpY, shape.bumpRadius, COLORS.rock);
  fillEllipse(ctx, shape.highlightX, shape.highlightY, shape.highlightWidth, shape.highlightHeight, COLORS.rockHighlight);
}

/** Đá: khối tròn tím xám nhạt; đã đập vỡ thì còn vài viên sỏi. */
export function drawRock(ctx, rock, frame) {
  const shape = ROCK_SHAPE;
  ctx.save();
  ctx.translate(rock.x + hitShakeOffset(rock, frame), rock.y);
  ctx.scale(rock.scale, rock.scale);
  if (rock.isDepleted) {
    for (const pebble of shape.pebbles) fillEllipse(ctx, pebble.x, pebble.y, pebble.width, pebble.height, COLORS.rockShade);
  } else {
    drawSoftShadow(ctx, 0, 0, shape.shadowWidth, shape.shadowHeight);
    drawRockBody(ctx);
  }
  ctx.restore();
}

/** Bụi quả: ba cụm lá tròn, có chấm quả hồng khi còn quả. */
export function drawBush(ctx, bush) {
  const shape = BUSH_SHAPE;
  ctx.save();
  ctx.translate(bush.x, bush.y);
  ctx.scale(bush.scale, bush.scale);
  drawSoftShadow(ctx, 0, 0, shape.shadowWidth, shape.shadowHeight);
  for (const lobe of shape.lobes) fillCircle(ctx, lobe.x, lobe.y + shape.shadeDrop, lobe.radius, COLORS.bushShade);
  for (const lobe of shape.lobes) fillCircle(ctx, lobe.x, lobe.y, lobe.radius, COLORS.bush);
  if (!bush.isDepleted) {
    for (const berry of shape.berries) fillCircle(ctx, berry.x, berry.y, shape.berryRadius, COLORS.berry);
  }
  ctx.restore();
}

// =====================================================================
// Công trình (thiết kế trong ô 48x48, gốc ở góc trên-trái của ô)
// =====================================================================

function drawWallShape(ctx, faceColor) {
  fillRoundedRect(ctx, 1, -8, 46, 20, 7, COLORS.plankTop); // mặt trên (nhô lên tạo cảm giác có chiều cao)
  fillRoundedRect(ctx, 1, 6, 46, 41, 7, faceColor); // mặt trước
  for (const plankX of [12.5, 24, 35.5]) fillRoundedRect(ctx, plankX - 1, 10, 2, 32, 1, COLORS.plankShade);
  fillRoundedRect(ctx, 1, 40, 46, 7, 4, COLORS.plankShade);
}

function drawDoorShape(ctx) {
  drawWallShape(ctx, COLORS.doorPlank);
  fillRoundedRect(ctx, 12, 12, 24, 30, 10, COLORS.plank); // ô cửa
  fillCircle(ctx, 31, 28, 3.5, COLORS.doorKnob);
}

function drawFenceShape(ctx) {
  fillRoundedRect(ctx, 2, 16, 44, 6, 3, COLORS.plankShade);
  fillRoundedRect(ctx, 2, 31, 44, 6, 3, COLORS.plankShade);
  for (const postX of [6, 20, 34]) {
    fillRoundedRect(ctx, postX, 6, 8, 38, 4, COLORS.plank);
    fillCircle(ctx, postX + 4, 8, 4, COLORS.plankTop);
  }
}

function drawTrapShape(ctx) {
  const centerX = 24;
  const centerY = 26;
  const toothCount = 8;
  fillCircle(ctx, centerX, centerY, 17, COLORS.trapBase);
  for (let tooth = 0; tooth < toothCount; tooth++) {
    const angle = (tooth / toothCount) * FULL_CIRCLE;
    fillCircle(ctx, centerX + Math.cos(angle) * 12.5, centerY + Math.sin(angle) * 12.5, 3.6, COLORS.trapTeeth);
  }
  fillCircle(ctx, centerX, centerY, 6, COLORS.rockShade);
}

function drawFlame(ctx, timeSeconds) {
  const flicker = 1 + Math.sin(timeSeconds * 12) * 0.08 + Math.sin(timeSeconds * 19) * 0.05;
  fillEllipse(ctx, 0, -7 * flicker, 8 * flicker, 11 * flicker, COLORS.flame);
  fillCircle(ctx, 0, -16 * flicker, 4 * flicker, COLORS.flame);
  fillEllipse(ctx, 0, -5 * flicker, 4.5 * flicker, 6.5 * flicker, COLORS.flameInner);
}

function drawCampfireShape(ctx, timeSeconds) {
  const stoneCount = 7;
  ctx.save();
  ctx.translate(24, 30);
  for (let stone = 0; stone < stoneCount; stone++) {
    const angle = (stone / stoneCount) * FULL_CIRCLE;
    fillCircle(ctx, Math.cos(angle) * 15, Math.sin(angle) * 9, 5, COLORS.campfireStone);
  }
  for (const rotation of [-0.5, 0.5]) {
    ctx.save();
    ctx.rotate(rotation);
    fillRoundedRect(ctx, -13, -3.5, 26, 7, 3.5, COLORS.log);
    ctx.restore();
  }
  drawFlame(ctx, timeSeconds);
  ctx.restore();
}

function drawBedShape(ctx) {
  fillRoundedRect(ctx, 4, 2, 40, 44, 9, COLORS.bedFrame);
  fillRoundedRect(ctx, 9, 7, 30, 11, 5.5, COLORS.bedPillow);
  fillRoundedRect(ctx, 6, 21, 36, 23, 8, COLORS.bedBlanket);
  fillRoundedRect(ctx, 6, 21, 36, 5, 2.5, COLORS.backpackOutline);
}

const STRUCTURE_SHAPES = {
  wall: (ctx) => drawWallShape(ctx, COLORS.plank),
  door: drawDoorShape,
  fence: drawFenceShape,
  trap: drawTrapShape,
  campfire: drawCampfireShape,
  bed: drawBedShape,
};

/** Vẽ hình công trình vừa khít một ô vuông cạnh `size` (gốc toạ độ ở góc trên-trái ô). */
export function drawStructureShape(ctx, structureType, size, timeSeconds) {
  const scale = size / STRUCTURE_DESIGN_SIZE;
  ctx.save();
  ctx.scale(scale, scale);
  STRUCTURE_SHAPES[structureType](ctx, timeSeconds);
  ctx.restore();
}

function drawCracks(ctx) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.plankShade;
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(19, 22);
  ctx.lineTo(15, 28);
  ctx.moveTo(32, 26);
  ctx.lineTo(28, 33);
  ctx.lineTo(33, 38);
  ctx.stroke();
  ctx.restore();
}

/** Công trình trong thế giới: hình + vết nứt khi yếu + thanh máu khi bị hư. */
export function drawStructure(ctx, structure, frame) {
  const size = WORLD.tileSize;
  const shakeX = hitShakeOffset(structure, frame);
  ctx.save();
  ctx.translate(structure.tileX * size + shakeX, structure.tileY * size);
  drawStructureShape(ctx, structure.structureType, size, frame.timeSeconds + structure.flickerPhase);
  const healthRatio = structure.health / structure.maxHealth;
  if (healthRatio < CRACK_HEALTH_RATIO && structure.structureType !== 'trap') {
    ctx.scale(size / STRUCTURE_DESIGN_SIZE, size / STRUCTURE_DESIGN_SIZE);
    drawCracks(ctx);
  }
  ctx.restore();
  if (healthRatio < 1) drawHealthBar(ctx, structure.x, structure.tileY * size - 14, size * 0.7, healthRatio, COLORS.structureHealthFill);
}

/** Bóng mờ khi đang chọn chỗ xây: ô tô xanh (đặt được) hoặc đỏ (vướng). */
export function drawBuildGhost(ctx, ghost, frame) {
  if (!ghost.isActive) return;
  const size = WORLD.tileSize;
  const left = ghost.tileX * size;
  const top = ghost.tileY * size;
  roundedRectPath(ctx, left + 2, top + 2, size - 4, size - 4, 10);
  ctx.fillStyle = ghost.isValid ? COLORS.ghostValid : COLORS.ghostInvalid;
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.translate(left, top);
  drawStructureShape(ctx, ghost.structureType, size, frame.timeSeconds);
  ctx.restore();
}

// =====================================================================
// Icon vật phẩm (hộp 32x32, tâm ở 0,0)
// =====================================================================

function drawMeatIcon(ctx, meatColor) {
  fillRoundedRect(ctx, 3, -3, 12, 5, 2.5, COLORS.bone);
  fillCircle(ctx, 15, -4, 3, COLORS.bone);
  fillCircle(ctx, 15, 1.5, 3, COLORS.bone);
  fillEllipse(ctx, -4, 0, 11, 9, meatColor, -0.3);
  fillEllipse(ctx, -7, -3, 3.5, 2, 'rgba(255,255,255,0.45)', -0.3);
}

function drawToolIcon(ctx, drawHead) {
  ctx.save();
  ctx.rotate(0.6);
  fillRoundedRect(ctx, -2, -12, 4.5, 27, 2.2, COLORS.toolHandle);
  drawHead(ctx);
  ctx.restore();
}

const ITEM_ICONS = {
  wood(ctx) {
    fillRoundedRect(ctx, -13, -1, 26, 10, 5, COLORS.log);
    fillRoundedRect(ctx, -11, -10, 24, 10, 5, COLORS.trunk);
    fillCircle(ctx, 9, -5, 4.5, COLORS.stump);
    fillCircle(ctx, 9, -5, 1.5, COLORS.trunkShade);
  },
  stone(ctx) {
    fillEllipse(ctx, 0, 4, 13, 10, COLORS.rockShade);
    fillEllipse(ctx, 0, 1, 13, 10, COLORS.rock);
    fillEllipse(ctx, -4, -3, 4, 2.5, COLORS.rockHighlight);
  },
  berry(ctx) {
    fillEllipse(ctx, 6, -10, 6, 3, COLORS.bushShade, -0.5);
    for (const [x, y] of [[-5, 3], [5, 4], [0, -4]]) {
      fillCircle(ctx, x, y, 6.2, COLORS.berry);
      fillCircle(ctx, x - 2, y - 2, 1.6, '#ffffff');
    }
  },
  rawMeat: (ctx) => drawMeatIcon(ctx, COLORS.meatRaw),
  cookedMeat: (ctx) => drawMeatIcon(ctx, COLORS.meatCooked),
  hide(ctx) {
    for (const [x, y] of [[-10, -8], [10, -8], [-10, 8], [10, 8]]) fillCircle(ctx, x, y, 4.5, COLORS.hide);
    fillEllipse(ctx, 0, 0, 12, 10, COLORS.hide);
    fillCircle(ctx, -3, -2, 2.2, COLORS.deerOutline);
    fillCircle(ctx, 4, 3, 1.8, COLORS.deerOutline);
  },
  axe: (ctx) => drawToolIcon(ctx, (c) => fillEllipse(c, 5, -9, 8, 6, COLORS.tool)),
  pickaxe: (ctx) => drawToolIcon(ctx, (c) => fillEllipse(c, 0, -11, 13, 4, COLORS.tool)),
  gun(ctx) {
    fillRoundedRect(ctx, -13, -7, 22, 11, 5.5, COLORS.gunBody);
    fillRoundedRect(ctx, 6, -5, 10, 6, 3, COLORS.gunAccent);
    fillRoundedRect(ctx, -9, -1, 7, 13, 3.5, COLORS.gunAccent);
    fillCircle(ctx, -6, -3, 2, '#ffffff');
  },
  ammo(ctx) {
    for (const x of [-10, -3, 4]) {
      fillRoundedRect(ctx, x, -8, 6, 17, 3, COLORS.ammo);
      fillCircle(ctx, x + 3, -8, 3, COLORS.bulletOutline);
    }
  },
};

/** Vẽ icon vật phẩm, tâm tại (x, y), cạnh `size` px. */
export function drawItemIcon(ctx, itemId, x, y, size, timeSeconds = 0) {
  ctx.save();
  ctx.translate(x, y);
  if (ITEM_ICONS[itemId]) {
    const scale = size / ICON_DESIGN_SIZE;
    ctx.scale(scale, scale);
    ITEM_ICONS[itemId](ctx);
  } else if (STRUCTURE_SHAPES[itemId]) {
    ctx.translate(-size / 2, -size / 2);
    drawStructureShape(ctx, itemId, size, timeSeconds);
  }
  ctx.restore();
}

// =====================================================================
// Vật phẩm rơi & đạn
// =====================================================================

const PICKUP_ICON_SIZE = 24;
const PICKUP_COUNT_FONT = '800 11px Nunito, system-ui, sans-serif';

export function drawPickup(ctx, pickup, frame) {
  const bob = frame.reducedMotion
    ? 0
    : Math.abs(Math.sin(frame.timeSeconds * RENDER.pickupBobSpeed + pickup.bobPhase)) * RENDER.pickupBobHeight;
  drawSoftShadow(ctx, pickup.x, pickup.y + 6, 9, 3.5);
  drawItemIcon(ctx, pickup.itemId, pickup.x, pickup.y - bob - 4, PICKUP_ICON_SIZE, frame.timeSeconds);
  if (pickup.count <= 1) return;
  ctx.font = PICKUP_COUNT_FONT;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.damageTextOutline;
  ctx.fillStyle = COLORS.outline;
  ctx.strokeText(String(pickup.count), pickup.x + 10, pickup.y + 8);
  ctx.fillText(String(pickup.count), pickup.x + 10, pickup.y + 8);
}

export function drawBullet(ctx, bullet) {
  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 213, 138, 0.55)';
  ctx.beginPath();
  ctx.moveTo(bullet.previousX, bullet.previousY);
  ctx.lineTo(bullet.x, bullet.y);
  ctx.stroke();
  fillCircle(ctx, bullet.x, bullet.y, bullet.radius + 1, COLORS.bulletOutline);
  fillCircle(ctx, bullet.x, bullet.y, bullet.radius, COLORS.bullet);
}
