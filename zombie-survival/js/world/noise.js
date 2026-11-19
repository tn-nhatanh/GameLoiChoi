// Tạo noise 2D theo seed (value noise + nhiều lớp chồng nhau) để chia vùng nước, cát, cỏ, rừng.
// Cùng seed → cùng giá trị noise → cùng map. Không phụ thuộc Math.random.
// Dùng bởi world/mapGen.js (địa hình) và render/terrainCache.js (vị trí hoạ tiết trang trí).

/**
 * Băm cặp toạ độ nguyên (x, y) cùng seed thành số thực trong [0, 1).
 * Đây là "giá trị ngẫu nhiên cố định" tại mỗi điểm lưới.
 */
export function hash2D(x, y, seed) {
  let hash = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

/** Độ lệch giữa các lớp noise — số lẻ bất kỳ, không phải số cân bằng game. */
const OCTAVE_OFFSET = 17.31;

/** Đường cong mượt (smoothstep) để chỗ nối giữa các ô lưới không bị gãy góc. */
function smoothCurve(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Value noise: đặt một giá trị ngẫu nhiên tại mỗi điểm lưới nguyên,
 * rồi nội suy mượt giữa 4 góc của ô chứa điểm (x, y).
 * Trả về hàm noise(x, y) → [0, 1).
 */
export function createValueNoise2D(seed) {
  return function valueNoise(x, y) {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const weightX = smoothCurve(x - cellX);
    const weightY = smoothCurve(y - cellY);

    const topLeft = hash2D(cellX, cellY, seed);
    const topRight = hash2D(cellX + 1, cellY, seed);
    const bottomLeft = hash2D(cellX, cellY + 1, seed);
    const bottomRight = hash2D(cellX + 1, cellY + 1, seed);

    const top = topLeft + (topRight - topLeft) * weightX;
    const bottom = bottomLeft + (bottomRight - bottomLeft) * weightX;
    return top + (bottom - top) * weightY;
  };
}

/**
 * Fractal noise (fBm): cộng nhiều lớp noise, mỗi lớp sau dày hơn (lacunarity)
 * và yếu hơn (persistence). Lớp đầu tạo hình dáng lớn, các lớp sau thêm chi tiết mép.
 * Kết quả được chuẩn hoá về [0, 1).
 */
export function fractalNoise2D(noise, x, y, { octaves, persistence, lacunarity }) {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let amplitudeSum = 0;
  for (let octave = 0; octave < octaves; octave++) {
    // Dịch mỗi lớp đi một đoạn để các lớp không trùng điểm lưới (tránh hoạ tiết lặp lộ liễu).
    const offset = octave * OCTAVE_OFFSET;
    total += noise(x * frequency + offset, y * frequency + offset) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return total / amplitudeSum;
}
