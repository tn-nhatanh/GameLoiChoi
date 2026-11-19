// Hiệu ứng hình ảnh: hạt (bụi gỗ, lá, khói...), số sát thương bay lên, rung màn hình, và lớp phủ ban đêm có nguồn sáng.
// Hạt và số dùng "bể" object cố định (vòng tròn): hết chỗ thì ghi đè cái cũ nhất, không tạo rác.
// main.js chuyển sự kiện từ game.events thành hiệu ứng; render/renderer.js gọi các hàm draw*.

import { PARTICLES, DAMAGE_NUMBERS, SCREEN_SHAKE, LIGHTING, COLORS, DAY_NIGHT } from '../config.js';
import { randomRange } from '../utils/math.js';

const DAMAGE_FONT = '900 16px Nunito, system-ui, sans-serif';
const PARTICLE_DRAG = 2.5; // hạt chậm dần theo thời gian (1/giây)
const LIGHT_SOFT_EDGE = 0.55; // từ 55% bán kính trở ra ánh sáng nhạt dần

export function createEffects() {
  return {
    particles: Array.from({ length: PARTICLES.poolSize }, () => ({
      isActive: false,
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
      life: 0,
      maxLife: 1,
      size: 1,
      color: '#fff',
      gravity: 0,
    })),
    nextParticle: 0,
    damageNumbers: Array.from({ length: DAMAGE_NUMBERS.poolSize }, () => ({
      isActive: false,
      x: 0,
      y: 0,
      text: '',
      color: '#fff',
      life: 0,
    })),
    nextDamageNumber: 0,
    shakeStrength: 0,
    shakeX: 0,
    shakeY: 0,
    lightCanvas: null,
    lightCtx: null,
  };
}

export function clearEffects(effects) {
  for (const particle of effects.particles) particle.isActive = false;
  for (const number of effects.damageNumbers) number.isActive = false;
  effects.shakeStrength = 0;
}

// ---------- Tạo hiệu ứng ----------

export function spawnParticles(effects, presetName, x, y, count, reducedMotion) {
  const preset = PARTICLES.presets[presetName];
  if (!preset) return;
  let total = count ?? preset.count;
  if (reducedMotion) total = Math.ceil(total / 2);
  for (let index = 0; index < total; index++) {
    const particle = effects.particles[effects.nextParticle];
    effects.nextParticle = (effects.nextParticle + 1) % effects.particles.length;
    const angle = Math.random() * Math.PI * 2;
    const speed = randomRange(Math.random, preset.speed[0], preset.speed[1]);
    particle.isActive = true;
    particle.x = x;
    particle.y = y;
    particle.velocityX = Math.cos(angle) * speed;
    particle.velocityY = Math.sin(angle) * speed;
    particle.maxLife = randomRange(Math.random, preset.life[0], preset.life[1]);
    particle.life = particle.maxLife;
    particle.size = randomRange(Math.random, preset.size[0], preset.size[1]);
    particle.color = preset.colors[Math.floor(Math.random() * preset.colors.length)];
    particle.gravity = preset.gravity;
  }
}

/** amount âm = sát thương (đỏ hồng), dương = hồi máu (xanh). */
export function spawnDamageNumber(effects, x, y, amount, isHeal) {
  const rounded = Math.round(Math.abs(amount));
  if (rounded === 0) return;
  const number = effects.damageNumbers[effects.nextDamageNumber];
  effects.nextDamageNumber = (effects.nextDamageNumber + 1) % effects.damageNumbers.length;
  number.isActive = true;
  number.x = x;
  number.y = y;
  number.text = isHeal ? `+${rounded}` : `-${rounded}`;
  number.color = isHeal ? COLORS.healText : COLORS.damageText;
  number.life = DAMAGE_NUMBERS.lifeSeconds;
}

export function addShake(effects, strength) {
  effects.shakeStrength = Math.min(SCREEN_SHAKE.maxOffset, Math.max(effects.shakeStrength, strength));
}

// ---------- Cập nhật ----------

function updateParticles(effects, deltaSeconds) {
  const drag = Math.exp(-PARTICLE_DRAG * deltaSeconds);
  for (const particle of effects.particles) {
    if (!particle.isActive) continue;
    particle.life -= deltaSeconds;
    if (particle.life <= 0) {
      particle.isActive = false;
      continue;
    }
    particle.velocityX *= drag;
    particle.velocityY = particle.velocityY * drag + particle.gravity * deltaSeconds;
    particle.x += particle.velocityX * deltaSeconds;
    particle.y += particle.velocityY * deltaSeconds;
  }
}

function updateDamageNumbers(effects, deltaSeconds, reducedMotion) {
  for (const number of effects.damageNumbers) {
    if (!number.isActive) continue;
    number.life -= deltaSeconds;
    if (number.life <= 0) number.isActive = false;
    else if (!reducedMotion) number.y -= DAMAGE_NUMBERS.riseSpeed * deltaSeconds;
  }
}

function updateShake(effects, deltaSeconds) {
  effects.shakeStrength *= Math.exp(-SCREEN_SHAKE.decayPerSecond * deltaSeconds);
  if (effects.shakeStrength < 0.1) effects.shakeStrength = 0;
  effects.shakeX = (Math.random() * 2 - 1) * effects.shakeStrength;
  effects.shakeY = (Math.random() * 2 - 1) * effects.shakeStrength;
}

export function updateEffects(effects, deltaSeconds, reducedMotion) {
  updateParticles(effects, deltaSeconds);
  updateDamageNumbers(effects, deltaSeconds, reducedMotion);
  updateShake(effects, deltaSeconds);
}

// ---------- Vẽ ----------

export function drawParticles(ctx, effects) {
  for (const particle of effects.particles) {
    if (!particle.isActive) continue;
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fillStyle = particle.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawDamageNumbers(ctx, effects) {
  ctx.font = DAMAGE_FONT;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.damageTextOutline;
  for (const number of effects.damageNumbers) {
    if (!number.isActive) continue;
    ctx.globalAlpha = Math.min(1, (number.life / DAMAGE_NUMBERS.lifeSeconds) * 2);
    ctx.strokeText(number.text, number.x, number.y);
    ctx.fillStyle = number.color;
    ctx.fillText(number.text, number.x, number.y);
  }
  ctx.globalAlpha = 1;
}

function ensureLightCanvas(effects, width, height) {
  const targetWidth = Math.max(1, Math.ceil(width * LIGHTING.resolution));
  const targetHeight = Math.max(1, Math.ceil(height * LIGHTING.resolution));
  if (!effects.lightCanvas) {
    effects.lightCanvas = document.createElement('canvas');
    effects.lightCtx = effects.lightCanvas.getContext('2d');
  }
  if (effects.lightCanvas.width !== targetWidth || effects.lightCanvas.height !== targetHeight) {
    effects.lightCanvas.width = targetWidth;
    effects.lightCanvas.height = targetHeight;
  }
  return effects.lightCtx;
}

/** "Khoét" một vùng sáng tròn, mềm mép vào lớp tối. */
function cutLight(lightCtx, x, y, radius, intensity) {
  const gradient = lightCtx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${intensity})`);
  gradient.addColorStop(LIGHT_SOFT_EDGE, `rgba(0, 0, 0, ${intensity * 0.7})`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  lightCtx.fillStyle = gradient;
  lightCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** Quầng cam ấm áp quanh đống lửa, vẽ đè nhẹ lên cảnh. */
function drawWarmGlow(ctx, x, y, radius, strength) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(255, 190, 130, ${LIGHTING.warmGlowAlpha * strength})`);
  gradient.addColorStop(1, 'rgba(255, 190, 130, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/**
 * Lớp phủ đêm: vẽ một lớp màu xanh tím (không phải đen) lên canvas phụ ở nửa độ phân giải,
 * dùng 'destination-out' để khoét các vùng sáng (người chơi, đống lửa, chớp súng), rồi dán lên màn hình.
 * lights: [{ x, y, radius, intensity, isWarm }] theo toạ độ thế giới.
 */
export function drawNightOverlay(ctx, effects, viewport, camera, darkness, lights, lightCount) {
  if (darkness <= 0.001) return;
  const lightCtx = ensureLightCanvas(effects, viewport.width, viewport.height);
  const scale = LIGHTING.resolution * camera.zoom;

  lightCtx.globalCompositeOperation = 'source-over';
  lightCtx.clearRect(0, 0, effects.lightCanvas.width, effects.lightCanvas.height);
  lightCtx.fillStyle = `rgba(${LIGHTING.nightColor}, ${darkness})`;
  lightCtx.fillRect(0, 0, effects.lightCanvas.width, effects.lightCanvas.height);
  lightCtx.globalCompositeOperation = 'destination-out';
  for (let index = 0; index < lightCount; index++) {
    const light = lights[index];
    cutLight(lightCtx, (light.x - camera.x) * scale, (light.y - camera.y) * scale, light.radius * scale, light.intensity);
  }

  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.drawImage(effects.lightCanvas, 0, 0, viewport.width, viewport.height);

  const glowStrength = darkness / DAY_NIGHT.maxDarkness; // quầng lửa đậm nhất lúc tối nhất
  for (let index = 0; index < lightCount; index++) {
    const light = lights[index];
    if (!light.isWarm) continue;
    drawWarmGlow(
      ctx,
      (light.x - camera.x) * camera.zoom,
      (light.y - camera.y) * camera.zoom,
      light.radius * camera.zoom,
      glowStrength,
    );
  }
}
