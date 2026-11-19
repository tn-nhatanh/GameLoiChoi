// Các hàm toán học nhỏ dùng chung: kẹp giá trị, nội suy, vector, và bộ sinh số ngẫu nhiên theo seed.
// Không phụ thuộc file nào khác. Được dùng bởi input.js, state.js, entities/, world/...

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from, to, t) {
  return from + (to - from) * t;
}

/**
 * Chuẩn hoá vector (x, y) về độ dài 1 và ghi vào `out` để tái sử dụng object,
 * tránh tạo rác mỗi frame. Vector quá ngắn thì trả về (0, 0).
 */
export function normalizeInto(out, x, y) {
  const length = Math.hypot(x, y);
  if (length < Number.EPSILON) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  out.x = x / length;
  out.y = y / length;
  return out;
}

/**
 * Băm chuỗi thành số nguyên 32-bit không dấu (thuật toán FNV-1a).
 * Nhờ vậy seed có thể là chữ bất kỳ, ví dụ "dao-xanh".
 */
export function hashStringToSeed(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Bộ sinh số ngẫu nhiên có seed (thuật toán mulberry32).
 * Cùng seed sẽ luôn cho cùng dãy số → cùng một map.
 * Trả về hàm, mỗi lần gọi cho một số thực trong [0, 1).
 */
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Số nguyên ngẫu nhiên trong [min, max] (bao gồm cả hai đầu). */
export function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** Số thực ngẫu nhiên trong [min, max). */
export function randomRange(random, min, max) {
  return min + random() * (max - min);
}

/** Độ chênh nhỏ nhất giữa hai góc, trong khoảng [-π, π]. */
export function angleDifference(fromAngle, toAngle) {
  let difference = toAngle - fromAngle;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

/**
 * Chọn một khoá theo trọng số, ví dụ { normal: 1, runner: 0.3 }.
 * Khoá có trọng số lớn hơn được chọn thường xuyên hơn.
 */
export function pickWeighted(random, weightsByKey) {
  let total = 0;
  for (const weight of Object.values(weightsByKey)) total += weight;
  let roll = random() * total;
  for (const [key, weight] of Object.entries(weightsByKey)) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return Object.keys(weightsByKey)[0];
}

/** Xoá các phần tử không thoả điều kiện ngay trong mảng (không tạo mảng mới). */
export function removeWhere(array, shouldRemove) {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < array.length; readIndex++) {
    const item = array[readIndex];
    if (!shouldRemove(item)) array[writeIndex++] = item;
  }
  array.length = writeIndex;
}
