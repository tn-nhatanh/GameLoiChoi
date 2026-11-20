// Hình vẽ cây cỏ: các loại cây (sồi, thông, bạch dương, anh đào, cây táo), cỏ cao, hoa, nấm, cà rốt/khoai dại,
// lau sậy, ô ruộng và cây trồng theo từng giai đoạn. Cỏ hoa lay theo gió và rạp sang bên khi có người đi qua.
// Mọi hàm vẽ có dạng drawX(ctx, object, frame); số trong *_SHAPE chỉ là kích thước hình vẽ, không ảnh hưởng gameplay.

import { COLORS, RENDER, FLORA, FARMING, WORLD } from '../config.js';
import { FULL_CIRCLE, fillCircle, fillEllipse, fillRoundedRect, roundedRectPath, drawSoftShadow } from './shapes.js';

const HIT_SHAKE = { speed: 70, amount: 2.5, seconds: 0.18 };
const WIND_POSITION_WAVE = 0.012; // gió lan dần theo vị trí → cỏ lay thành "sóng" chứ không đồng loạt

// =====================================================================
// Gió & rạp cỏ
// =====================================================================

/** Góc nghiêng (radian) của ngọn cỏ/hoa: gió nhẹ + rạp sang bên khi người chơi đi sát. */
function plantLean(object, frame) {
  if (frame.reducedMotion) return 0;
  const wind = Math.sin(frame.timeSeconds * FLORA.windSpeed + object.swayPhase + object.x * WIND_POSITION_WAVE) * FLORA.windAmount;
  const offsetX = object.x - frame.playerX;
  const distance = Math.hypot(offsetX, object.y - frame.playerY);
  if (distance >= FLORA.bendRadius) return wind;
  const push = (1 - distance / FLORA.bendRadius) * FLORA.bendAmount;
  return wind + (offsetX >= 0 ? push : -push);
}

function hitShakeOffset(object, frame) {
  if (object.hitTimer <= 0 || frame.reducedMotion) return 0;
  return Math.sin(frame.timeSeconds * HIT_SHAKE.speed) * HIT_SHAKE.amount * (object.hitTimer / HIT_SHAKE.seconds);
}

/** Một lá/ngọn cong từ gốc (baseX, 0) lên cao `height`, nghiêng theo `lean`. */
function strokeBlade(ctx, baseX, height, lean, color, width) {
  const tipX = baseX + Math.sin(lean) * height;
  const tipY = -Math.cos(lean) * height;
  ctx.beginPath();
  ctx.moveTo(baseX, 0);
  ctx.quadraticCurveTo(baseX + (tipX - baseX) * 0.2, tipY * 0.55, tipX, tipY);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

// =====================================================================
// Cây
// =====================================================================

/** Tán tròn ba cụm (sồi, táo, anh đào). Gốc toạ độ: chân thân cây. */
const ROUND_TREE = {
  shadowWidth: 22,
  shadowHeight: 8,
  trunkWidth: 14,
  trunkHeight: 24,
  canopyY: -38,
  canopyRadius: 22,
  sideLobeX: 15,
  sideLobeY: 7,
  sideLobeRadius: 15,
  shadeDrop: 4,
  highlight: { x: -8, y: -9, radius: 8 },
  apples: [
    { x: -12, y: 6 },
    { x: 9, y: -6 },
    { x: 15, y: 9 },
    { x: -2, y: 12 },
    { x: -6, y: -12 },
  ],
  appleRadius: 3.6,
  blossoms: [
    { x: -14, y: -2 },
    { x: 6, y: -14 },
    { x: 16, y: 4 },
    { x: 1, y: 9 },
  ],
};

const ROUND_TREE_COLORS = {
  oak: { leaves: COLORS.leaves, shade: COLORS.leavesShade, highlight: COLORS.leavesHighlight },
  apple: { leaves: COLORS.leaves, shade: COLORS.leavesShade, highlight: COLORS.leavesHighlight },
  sakura: { leaves: COLORS.sakura, shade: COLORS.sakuraShade, highlight: COLORS.sakuraHighlight },
};

function drawTrunk(ctx, width, height, color, shadeColor) {
  fillRoundedRect(ctx, -width / 2, -height, width, height, 5, color);
  fillRoundedRect(ctx, width / 2 - 5, -height, 4, height, 2, shadeColor);
}

function drawRoundCanopy(ctx, tree) {
  const shape = ROUND_TREE;
  const palette = ROUND_TREE_COLORS[tree.variant] ?? ROUND_TREE_COLORS.oak;
  const lobes = [
    [-shape.sideLobeX, shape.sideLobeY, shape.sideLobeRadius],
    [shape.sideLobeX, shape.sideLobeY, shape.sideLobeRadius],
    [0, 0, shape.canopyRadius],
  ];
  for (const [x, y, radius] of lobes) fillCircle(ctx, x, y + shape.shadeDrop, radius, palette.shade);
  for (const [x, y, radius] of lobes) fillCircle(ctx, x, y, radius, palette.leaves);
  fillCircle(ctx, shape.highlight.x, shape.highlight.y, shape.highlight.radius, palette.highlight);
  if (tree.variant === 'apple' && tree.fruitTimer <= 0) {
    for (const apple of shape.apples) {
      fillCircle(ctx, apple.x, apple.y, shape.appleRadius, COLORS.apple);
      fillCircle(ctx, apple.x - 1, apple.y - 1.2, 1.1, '#ffffff');
    }
  }
  if (tree.variant === 'sakura') {
    for (const blossom of shape.blossoms) fillCircle(ctx, blossom.x, blossom.y, 3, '#ffffff');
  }
}

/** Thông: thân ngắn, ba tầng tán hình tam giác bo tròn chồng lên nhau. */
const PINE = {
  trunkWidth: 10,
  trunkHeight: 16,
  tiers: [
    { y: -12, halfWidth: 22, height: 22 },
    { y: -26, halfWidth: 18, height: 20 },
    { y: -39, halfWidth: 13, height: 17 },
  ],
  cornerRound: 7,
};

function fillRoundedTriangle(ctx, topY, halfWidth, height, color) {
  ctx.beginPath();
  ctx.moveTo(0, topY - height);
  ctx.lineTo(halfWidth, topY);
  ctx.lineTo(-halfWidth, topY);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = PINE.cornerRound;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.stroke(); // nét dày bo góc → tam giác không có góc nhọn
  ctx.fill();
}

function drawPineCanopy(ctx) {
  for (const tier of PINE.tiers) fillRoundedTriangle(ctx, tier.y + 3, tier.halfWidth, tier.height, COLORS.pineShade);
  for (const tier of PINE.tiers) fillRoundedTriangle(ctx, tier.y, tier.halfWidth, tier.height, COLORS.pine);
  fillEllipse(ctx, -5, PINE.tiers[2].y - 8, 3.5, 5, COLORS.pineHighlight);
}

/** Bạch dương: thân trắng có vệt, tán vàng xanh cao và thon. */
const BIRCH_MARKS = [
  { y: -8, x: -3, width: 5 },
  { y: -15, x: 0, width: 4 },
  { y: -22, x: -4, width: 4 },
];

function drawBirchCanopy(ctx) {
  const lobes = [
    [0, -46, 15],
    [-10, -34, 12],
    [10, -33, 12],
    [0, -28, 13],
  ];
  for (const [x, y, radius] of lobes) fillCircle(ctx, x, y + 3, radius, COLORS.birchLeavesShade);
  for (const [x, y, radius] of lobes) fillCircle(ctx, x, y, radius, COLORS.birchLeaves);
  fillCircle(ctx, -5, -50, 5, '#e2f5cf');
}

function drawTreeStump(ctx, isBirch) {
  drawSoftShadow(ctx, 0, 0, 15, 6);
  fillRoundedRect(ctx, -6, -9, 12, 9, 4, isBirch ? COLORS.birchTrunk : COLORS.trunk);
  fillEllipse(ctx, 0, -9, 6, 2.5, COLORS.stump);
  fillEllipse(ctx, 0, -9, 2.4, 1, COLORS.trunkShade);
}

function drawTreeBody(ctx, tree, sway) {
  const variant = tree.variant;
  if (variant === 'pine') {
    drawSoftShadow(ctx, 0, 0, 20, 7);
    drawTrunk(ctx, PINE.trunkWidth, PINE.trunkHeight, COLORS.trunk, COLORS.trunkShade);
    ctx.translate(sway * 0.6, 0);
    drawPineCanopy(ctx);
    return;
  }
  if (variant === 'birch') {
    drawSoftShadow(ctx, 0, 0, 18, 7);
    fillRoundedRect(ctx, -5.5, -30, 11, 30, 5, COLORS.birchTrunk);
    for (const mark of BIRCH_MARKS) fillRoundedRect(ctx, mark.x, mark.y, mark.width, 2, 1, COLORS.birchMark);
    ctx.translate(sway, 0);
    drawBirchCanopy(ctx);
    return;
  }
  drawSoftShadow(ctx, 0, 0, ROUND_TREE.shadowWidth, ROUND_TREE.shadowHeight);
  drawTrunk(ctx, ROUND_TREE.trunkWidth, ROUND_TREE.trunkHeight, COLORS.trunk, COLORS.trunkShade);
  ctx.translate(sway, ROUND_TREE.canopyY);
  drawRoundCanopy(ctx, tree);
}

/** Cây: hình theo loại (variant), tán lắc lư nhẹ theo gió, rung khi bị chặt; đã chặt thì còn gốc. */
export function drawTree(ctx, tree, frame) {
  ctx.save();
  ctx.translate(tree.x + hitShakeOffset(tree, frame), tree.y);
  ctx.scale(tree.scale, tree.scale);
  if (tree.isDepleted) {
    drawTreeStump(ctx, tree.variant === 'birch');
  } else {
    const sway = frame.reducedMotion
      ? 0
      : Math.sin(frame.timeSeconds * RENDER.treeSwaySpeed + tree.swayPhase) * RENDER.treeSwayAmount;
    drawTreeBody(ctx, tree, sway);
  }
  ctx.restore();
}

// =====================================================================
// Cỏ cao, hoa, lau sậy
// =====================================================================

/** Bụi cỏ: các lá cong toả ra từ gốc. [vị trí gốc, chiều cao, độ nghiêng sẵn] */
const GRASS_BLADES = [
  [-7, 15, -0.35],
  [-3, 21, -0.12],
  [1, 24, 0.05],
  [5, 19, 0.22],
  [8, 14, 0.42],
];
const STUBBLE_BLADES = [
  [-4, 5, -0.3],
  [0, 6, 0],
  [4, 5, 0.3],
];

export function drawTallGrass(ctx, grass, frame) {
  ctx.save();
  ctx.translate(grass.x, grass.y);
  ctx.scale(grass.scale, grass.scale);
  ctx.lineCap = 'round';
  if (grass.isDepleted) {
    for (const [baseX, height, lean] of STUBBLE_BLADES) strokeBlade(ctx, baseX, height, lean, COLORS.tallGrassShade, 2.5);
    ctx.restore();
    return;
  }
  const lean = plantLean(grass, frame);
  for (const [baseX, height, tilt] of GRASS_BLADES) strokeBlade(ctx, baseX, height, tilt + lean, COLORS.tallGrassShade, 4);
  for (const [baseX, height, tilt] of GRASS_BLADES) strokeBlade(ctx, baseX, height * 0.92, tilt + lean, COLORS.tallGrass, 2.6);
  const tip = GRASS_BLADES[2];
  fillCircle(ctx, tip[0] + Math.sin(tip[2] + lean) * tip[1], -Math.cos(tip[2] + lean) * tip[1], 2, COLORS.tallGrassTip);
  ctx.restore();
}

/** Một bông hoa: cuống cong, năm cánh tròn quanh nhị vàng. */
function drawBlossom(ctx, baseX, height, lean, petalColor, petalRadius) {
  const headX = baseX + Math.sin(lean) * height;
  const headY = -Math.cos(lean) * height;
  strokeBlade(ctx, baseX, height, lean, COLORS.flowerStem, 2);
  fillEllipse(ctx, baseX + 3, -height * 0.35, 3.5, 1.8, COLORS.flowerStem, -0.5);
  const petalCount = 5;
  for (let petal = 0; petal < petalCount; petal++) {
    const angle = (petal / petalCount) * FULL_CIRCLE;
    fillCircle(ctx, headX + Math.cos(angle) * petalRadius, headY + Math.sin(angle) * petalRadius, petalRadius * 0.85, petalColor);
  }
  fillCircle(ctx, headX, headY, petalRadius * 0.7, COLORS.flowerCenter);
}

/** Hoa mọc thành khóm 2–3 bông; màu theo object.variant. */
const FLOWER_CLUSTER = [
  [-6, 13, -0.15, 3.4],
  [5, 17, 0.12, 3.8],
  [0, 9, 0.02, 3],
];

export function drawFlower(ctx, flower, frame) {
  if (flower.isDepleted) return;
  const lean = plantLean(flower, frame);
  const petalColor = COLORS.flowerPetals[flower.variant] ?? COLORS.flowerPetals[0];
  ctx.save();
  ctx.translate(flower.x, flower.y);
  ctx.scale(flower.scale, flower.scale);
  ctx.lineCap = 'round';
  drawSoftShadow(ctx, 0, 1, 9, 3);
  for (const [baseX, height, tilt, petalRadius] of FLOWER_CLUSTER) {
    drawBlossom(ctx, baseX, height, tilt + lean, petalColor, petalRadius);
  }
  ctx.restore();
}

/** Lau sậy ven nước: thân dài mảnh, ngọn bông nâu. */
const REED_STALKS = [
  [-6, 26, -0.12],
  [-1, 34, 0],
  [5, 29, 0.14],
  [9, 20, 0.28],
];

export function drawReed(ctx, reed, frame) {
  if (reed.isDepleted) return;
  const lean = plantLean(reed, frame) * 0.6;
  ctx.save();
  ctx.translate(reed.x, reed.y);
  ctx.scale(reed.scale, reed.scale);
  ctx.lineCap = 'round';
  for (const [baseX, height, tilt] of REED_STALKS) {
    const angle = tilt + lean;
    strokeBlade(ctx, baseX, height, angle, COLORS.reed, 2.4);
    if (height > 25) {
      const tipX = baseX + Math.sin(angle) * height * 0.9;
      const tipY = -Math.cos(angle) * height * 0.9;
      fillEllipse(ctx, tipX, tipY, 2.6, 5.5, COLORS.reedTip, angle);
    }
  }
  ctx.restore();
}

// =====================================================================
// Nấm, cà rốt dại, khoai dại
// =====================================================================

function drawMushroomShape(ctx, x, size) {
  fillRoundedRect(ctx, x - size * 0.28, -size * 0.75, size * 0.56, size * 0.75, size * 0.2, COLORS.mushroomStem);
  ctx.beginPath();
  ctx.ellipse(x, -size * 0.7, size * 0.75, size * 0.62, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = COLORS.mushroomCap;
  ctx.fill();
  fillEllipse(ctx, x, -size * 0.7, size * 0.75, size * 0.14, COLORS.mushroomCapShade);
  fillCircle(ctx, x - size * 0.3, -size * 1.0, size * 0.13, COLORS.mushroomSpot);
  fillCircle(ctx, x + size * 0.2, -size * 1.12, size * 0.1, COLORS.mushroomSpot);
}

export function drawMushroom(ctx, mushroom) {
  if (mushroom.isDepleted) return;
  ctx.save();
  ctx.translate(mushroom.x, mushroom.y);
  ctx.scale(mushroom.scale, mushroom.scale);
  drawSoftShadow(ctx, 0, 0, 12, 4);
  drawMushroomShape(ctx, 6, 9);
  drawMushroomShape(ctx, -4, 13);
  ctx.restore();
}

function drawCarrotTop(ctx, x, y, lean) {
  for (const tilt of [-0.45, 0, 0.45]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt + lean);
    fillEllipse(ctx, 0, -9, 3.2, 8, COLORS.carrotLeaf);
    ctx.restore();
  }
  fillEllipse(ctx, x, y + 1, 4.5, 3.2, COLORS.carrot);
  fillEllipse(ctx, x - 1.2, y, 1.6, 1, COLORS.carrotShade);
}

export function drawWildCarrot(ctx, plant, frame) {
  if (plant.isDepleted) return;
  const lean = plantLean(plant, frame) * 0.5;
  ctx.save();
  ctx.translate(plant.x, plant.y);
  ctx.scale(plant.scale, plant.scale);
  drawSoftShadow(ctx, 0, 1, 10, 3.5);
  drawCarrotTop(ctx, -5, -1, lean);
  drawCarrotTop(ctx, 6, 2, lean);
  ctx.restore();
}

function drawPotatoBush(ctx, centerX, centerY, scale, withFlowers) {
  const leaves = [
    [-6, -4, 6],
    [6, -4, 6],
    [0, -9, 7],
    [0, 0, 6],
  ];
  for (const [x, y, radius] of leaves) fillCircle(ctx, centerX + x * scale, centerY + y * scale + 1.5, radius * scale, COLORS.tallGrassShade);
  for (const [x, y, radius] of leaves) fillCircle(ctx, centerX + x * scale, centerY + y * scale, radius * scale, COLORS.potatoLeaf);
  if (!withFlowers) return;
  for (const [x, y] of [[-5, -9], [4, -12], [7, -3]]) {
    fillCircle(ctx, centerX + x * scale, centerY + y * scale, 2.2 * scale, COLORS.potatoFlower);
    fillCircle(ctx, centerX + x * scale, centerY + y * scale, 0.9 * scale, COLORS.flowerCenter);
  }
}

export function drawWildPotato(ctx, plant) {
  if (plant.isDepleted) return;
  ctx.save();
  ctx.translate(plant.x, plant.y);
  ctx.scale(plant.scale, plant.scale);
  drawSoftShadow(ctx, 0, 1, 12, 4);
  drawPotatoBush(ctx, 0, -2, 1, true);
  ctx.restore();
}

// =====================================================================
// Ruộng & cây trồng
// =====================================================================

/** Bốn cây trên một ô ruộng (toạ độ so với tâm ô). */
const CROP_SPOTS = [
  [-11, -9],
  [11, -9],
  [-11, 10],
  [11, 10],
];
const PLOT_INSET = 3;

/** Đất ruộng (vẽ phẳng dưới mọi thứ): ô bo góc, đất ẩm màu sẫm hơn, có rãnh luống. */
export function drawPlotSoil(ctx, plot) {
  const size = WORLD.tileSize;
  const left = plot.tileX * size + PLOT_INSET;
  const top = plot.tileY * size + PLOT_INSET;
  const inner = size - PLOT_INSET * 2;
  fillRoundedRect(ctx, left, top + 2, inner, inner, 9, COLORS.soilEdge);
  fillRoundedRect(ctx, left, top, inner, inner, 9, plot.isWet ? COLORS.soilWet : COLORS.soil);
  for (const rowY of [0.3, 0.68]) fillRoundedRect(ctx, left + 5, top + inner * rowY, inner - 10, 3.5, 2, COLORS.soilFurrow);
}

function drawSprout(ctx, x, y, lean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);
  fillEllipse(ctx, -2.5, -4, 2.6, 1.6, COLORS.wheatYoung, -0.6);
  fillEllipse(ctx, 2.5, -4, 2.6, 1.6, COLORS.wheatYoung, 0.6);
  fillRoundedRect(ctx, -0.8, -4, 1.6, 4, 0.8, COLORS.wheatYoung);
  ctx.restore();
}

function drawWheatPlant(ctx, x, y, stage, lean) {
  const height = [6, 12, 19, 22][stage];
  const isRipe = stage >= FARMING.stages - 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  for (const tilt of [-0.25, 0, 0.25]) {
    strokeBlade(ctx, tilt * 6, height, tilt + lean, isRipe ? COLORS.wheatShade : COLORS.wheatStalk, 2);
    if (isRipe) {
      const angle = tilt + lean;
      fillEllipse(ctx, tilt * 6 + Math.sin(angle) * height, -Math.cos(angle) * height, 2.4, 5, COLORS.wheat, angle);
    }
  }
  ctx.restore();
}

function drawCarrotPlant(ctx, x, y, stage, lean) {
  if (stage >= FARMING.stages - 1) {
    drawCarrotTop(ctx, x, y, lean);
    return;
  }
  const scale = [0.45, 0.65, 0.85][stage];
  for (const tilt of [-0.45, 0, 0.45]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt + lean);
    fillEllipse(ctx, 0, -8 * scale, 3 * scale, 7.5 * scale, COLORS.carrotLeaf);
    ctx.restore();
  }
}

function drawPotatoPlant(ctx, x, y, stage) {
  const isRipe = stage >= FARMING.stages - 1;
  const scale = [0.35, 0.5, 0.65, 0.72][stage];
  if (isRipe) fillEllipse(ctx, x + 3, y + 1, 3.6, 2.6, COLORS.potato);
  drawPotatoBush(ctx, x, y, scale, isRipe);
}

/** Cây trồng trên ô ruộng (vẽ theo chiều sâu cùng người và thú). */
export function drawCrop(ctx, plot, frame) {
  if (!plot.crop) return;
  const lean = plantLean(plot, frame) * 0.5;
  for (const [offsetX, offsetY] of CROP_SPOTS) {
    const x = plot.x + offsetX;
    const y = plot.centerY + offsetY;
    if (plot.stage === 0) drawSprout(ctx, x, y, lean);
    else if (plot.crop === 'wheat') drawWheatPlant(ctx, x, y, plot.stage, lean);
    else if (plot.crop === 'carrot') drawCarrotPlant(ctx, x, y, plot.stage, lean);
    else drawPotatoPlant(ctx, x, y, plot.stage);
  }
}

/** Khung ô đang nhắm để cày / gieo: xanh = làm được, hồng = không được. */
export function drawFarmTarget(ctx, target) {
  if (!target.isActive) return;
  const size = WORLD.tileSize;
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = target.action ? COLORS.farmTargetValid : COLORS.farmTargetInvalid;
  roundedRectPath(ctx, target.tileX * size + 3, target.tileY * size + 3, size - 6, size - 6, 10);
  ctx.stroke();
  ctx.restore();
}
