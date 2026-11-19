// Tạo ảnh icon vật phẩm (dạng data URL) cho giao diện DOM: thanh nhanh, túi đồ, bảng chế tạo.
// Vẽ một lần bằng render/worldSprites.js (cùng hình với trong thế giới) rồi lưu lại, lần sau dùng luôn.

import { drawItemIcon } from '../render/worldSprites.js';

const ICON_PIXEL_SIZE = 72; // vẽ to rồi để CSS thu nhỏ → nét trên màn hình độ phân giải cao
const ICON_DRAW_RATIO = 0.8; // icon chiếm 80% khung, chừa lề cho thoáng
const iconUrlCache = new Map();

export function getItemIconUrl(itemId) {
  if (iconUrlCache.has(itemId)) return iconUrlCache.get(itemId);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_PIXEL_SIZE;
  canvas.height = ICON_PIXEL_SIZE;
  const ctx = canvas.getContext('2d');
  drawItemIcon(ctx, itemId, ICON_PIXEL_SIZE / 2, ICON_PIXEL_SIZE / 2, ICON_PIXEL_SIZE * ICON_DRAW_RATIO);
  const url = canvas.toDataURL();
  iconUrlCache.set(itemId, url);
  return url;
}
