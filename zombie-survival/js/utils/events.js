// Hàng đợi sự kiện của một phiên chơi: các system chỉ "báo" chuyện vừa xảy ra (phát tiếng, tung hạt bụi,
// hiện số sát thương, thông báo...), còn main.js đọc hàng đợi mỗi frame và chuyển cho audio / effects / HUD.
// Nhờ vậy logic game không phụ thuộc vào phần âm thanh và hình ảnh.

/**
 * Các loại sự kiện đang dùng:
 *   sound        { name, x?, y? }            — tiếng động (có x, y thì nhỏ dần theo khoảng cách)
 *   particles    { preset, x, y, count? }    — hạt hiệu ứng, preset nằm trong PARTICLES.presets
 *   damageNumber { x, y, amount, isHeal? }   — số bay lên
 *   shake        { strength }                — rung màn hình
 *   toast        { text }                    — thông báo nhỏ trên HUD
 *   playerHurt   {}                          — nháy viền hồng
 */
export function emit(game, type, data) {
  game.events.push({ type, ...data });
}

/** Lấy hết sự kiện ra để xử lý và làm rỗng hàng đợi. */
export function drainEvents(game, handleEvent) {
  for (const event of game.events) handleEvent(event);
  game.events.length = 0;
}
