// Cấu hình trung tâm của game: MỌI con số cân bằng (tốc độ, máu, giá chế tạo, thời gian, màu...) nằm ở đây.
// Các file khác chỉ import từ đây, không tự viết số "ma thuật".
// Muốn chỉnh độ khó hay cảm giác điều khiển thì sửa file này trước tiên.

// =====================================================================
// Vòng lặp, hiển thị, điều khiển
// =====================================================================

/** Vòng lặp chính (main.js) */
export const LOOP = {
  // dt tối đa cho một frame (giây). Khi tab bị ẩn lâu rồi quay lại,
  // dt rất lớn sẽ làm nhân vật "dịch chuyển tức thời" — nên chặn lại.
  maxDeltaSeconds: 0.1,
};

/** Hiển thị canvas */
export const DISPLAY = {
  // Giới hạn devicePixelRatio để máy màn hình nét cao không phải vẽ quá nhiều pixel.
  maxPixelRatio: 2,
};

/** Điều khiển (input.js, ui/touchControls.js) */
export const INPUT = {
  joystickRadius: 56, // bán kính vùng kéo cần điều khiển ảo (px, trước khi nhân tỉ lệ)
  joystickDeadZone: 0.15, // 0..1 — dưới ngưỡng này coi như không kéo
  aimFireThreshold: 0.55, // 0..1 — kéo cần ngắm quá ngưỡng này thì tự bắn / vung rìu
  touchSprintThreshold: 0.92, // 0..1 — đẩy cần di chuyển gần hết cỡ thì chạy nhanh
  minAimDistance: 4, // chuột gần nhân vật hơn khoảng này (px) thì bỏ qua hướng ngắm
};

/**
 * Phím tắt. Mỗi hành động có thể gán nhiều phím (dùng KeyboardEvent.code,
 * nên không phụ thuộc kiểu gõ tiếng Việt / bố cục bàn phím).
 */
export const KEY_BINDINGS = {
  moveUp: ['KeyW', 'ArrowUp'],
  moveDown: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  craft: ['KeyQ', 'KeyI'],
  build: ['KeyB'],
  reload: ['KeyR'],
  pause: ['Escape', 'KeyP'],
  hotbar1: ['Digit1'],
  hotbar2: ['Digit2'],
  hotbar3: ['Digit3'],
  hotbar4: ['Digit4'],
  hotbar5: ['Digit5'],
  hotbar6: ['Digit6'],
  hotbar7: ['Digit7'],
  hotbar8: ['Digit8'],
  hotbar9: ['Digit9'],
};

/** Nút cảm ứng: tỉ lệ phóng to theo lựa chọn trong Cài đặt */
export const TOUCH_SIZE_SCALES = {
  small: 0.85,
  medium: 1,
  large: 1.25,
};

/** Cài đặt mặc định khi người chơi chưa lưu gì */
export const DEFAULT_SETTINGS = {
  soundOn: true,
  touchSize: 'medium', // một trong các khoá của TOUCH_SIZE_SCALES
  screenShake: true,
};

/** Seed tạo map */
export const SEED = {
  maxRandomSeed: 999999, // seed ngẫu nhiên là số từ 1 đến giá trị này
};

/** Giao diện */
export const UI = {
  toastSeconds: 2.2, // thời gian hiện thông báo nhỏ
  hurtFlashSeconds: 0.35, // viền hồng nháy khi bị đánh
};

/** Lưu game (utils/storage.js, state.js) */
export const SAVE = {
  autosaveSeconds: 20, // tự lưu mỗi 20 giây khi đang chơi
  version: 1, // tăng khi đổi cấu trúc bản lưu
  maxWorlds: 10, // giữ tối đa 10 thế giới; quá thì xoá thế giới lâu không chơi nhất
};

/** Khoá localStorage — đổi hậu tố v1 khi cấu trúc dữ liệu lưu thay đổi */
export const STORAGE_KEYS = {
  settings: 'zombie-survival.settings.v1',
  bestNights: 'zombie-survival.best.v1',
  worldIndex: 'zombie-survival.worlds.v1', // danh sách thế giới (tóm tắt)
  worldPrefix: 'zombie-survival.world.v1.', // + ID thế giới → bản lưu đầy đủ
  legacySave: 'zombie-survival.save.v1', // bản lưu một ô kiểu cũ, tự chuyển sang dạng mới
};

// =====================================================================
// Thế giới
// =====================================================================

/** Kích thước thế giới (world/mapGen.js) */
export const WORLD = {
  tileSize: 48, // cạnh một ô lưới (px) — cũng là ô xây dựng
  widthInTiles: 160,
  heightInTiles: 160,
};

/** Sinh map bằng noise (world/mapGen.js). Xem giải thích chi tiết trong mapGen.js. */
export const MAP_GEN = {
  elevationFrequency: 0.045, // tần số noise độ cao: nhỏ → khối đất to liền mạch, lớn → lởm chởm
  moistureFrequency: 0.07, // tần số noise độ ẩm (quyết định chỗ nào là rừng)
  octaves: 4, // số lớp noise chồng lên nhau (nhiều → mép đảo chi tiết hơn)
  persistence: 0.5, // mỗi lớp sau yếu còn bao nhiêu so với lớp trước
  lacunarity: 2, // mỗi lớp sau dày gấp bao nhiêu lần lớp trước
  noiseContrast: 1.8, // kéo giãn noise quanh 0.5 để bớt "đều đều"
  islandBlend: 0.5, // 0 = chỉ dùng noise, 1 = chỉ dùng hình tròn → đảo
  islandFalloffPower: 2.2, // càng lớn thì đất càng lan ra sát mép rồi mới dốc xuống biển
  waterLevel: 0.42, // độ cao dưới mức này là nước
  sandLevel: 0.47, // từ mực nước đến mức này là bãi cát
  forestMoisture: 0.56, // đất có độ ẩm trên mức này là rừng
  lakeCount: { min: 3, max: 6 },
  lakeRadiusTiles: { min: 1.6, max: 3.4 },
  lakeEdgeWobble: 0.35, // 0..1 — độ méo mép hồ để hồ không tròn vành vạnh
  lakeWobbleLobes: { min: 2, max: 4 }, // số "múi" lồi lõm quanh mép hồ
  lakePlacementAttempts: 120, // số lần thử tìm chỗ đặt hồ
  lakeShoreMarginTiles: 3, // hồ phải cách biển ít nhất chừng này ô
  spawnClearRadiusTiles: 3, // quanh điểm xuất phát không có cây/đá
  objectJitter: 4, // lệch ngẫu nhiên vị trí đồ vật khỏi tâm ô (px) cho tự nhiên
  objectChance: {
    forestTree: 0.5, // xác suất mỗi ô rừng có cây
    grassTree: 0.04,
    grassRock: 0.018,
    grassBush: 0.025,
    sandRock: 0.03,
  },
};

/** Đồ vật trên map: cây, đá, bụi quả */
export const WORLD_OBJECTS = {
  tree: { isBlocking: true, collisionRadius: 9, minScale: 0.9, maxScale: 1.15 },
  rock: { isBlocking: true, collisionRadius: 15, minScale: 0.85, maxScale: 1.1 },
  bush: { isBlocking: false, collisionRadius: 0, minScale: 0.9, maxScale: 1.1 },
};

/** Thu thập tài nguyên (systems/gathering.js) */
export const HARVEST = {
  // Tay không 12 nhát, rìu 4 nhát mới đổ (xem TOOLS.treeDamage)
  tree: { maxHealth: 12, dropItem: 'wood', dropMin: 4, dropMax: 6, regrowSeconds: 150 },
  rock: { maxHealth: 8, dropItem: 'stone', dropMin: 3, dropMax: 5, regrowSeconds: 200 },
  bush: { dropItem: 'berry', dropMin: 2, dropMax: 3, regrowSeconds: 90 },
  regrowRetrySeconds: 3, // nếu có ai đứng chắn chỗ cây mọc lại thì đợi thêm chừng này
};

/** Camera (world/camera.js) */
export const CAMERA = {
  followSharpness: 7, // càng lớn camera bám càng sát (đơn vị 1/giây)
  minVisibleWorldSpan: 520, // chiều ngắn của màn hình luôn thấy ít nhất chừng này px thế giới
  minZoom: 0.6, // không thu nhỏ quá mức này trên màn hình rất bé
  maxZoom: 1,
};

// =====================================================================
// Người chơi & sinh tồn
// =====================================================================

/** Người chơi (entities/player.js) */
export const PLAYER = {
  radius: 18, // bán kính thân (px)
  walkSpeed: 170, // tốc độ đi bộ (px/giây)
  sprintMultiplier: 1.55, // chạy nhanh gấp bao nhiêu lần đi bộ
  walkCycleSpeed: 12, // tốc độ nhún nhảy khi đi (radian/giây)
  aimGuideLength: 46, // độ dài vạch ngắm hiển thị (px)
  interactRange: 78, // khoảng cách tối đa (tâm tới tâm, px) để tương tác với đồ vật
  eatCooldownSeconds: 0.5,
  startingItems: [{ itemId: 'berry', count: 3 }],
};

/** Máu, đói, thể lực (systems/survival.js) */
export const SURVIVAL = {
  maxHealth: 100,
  maxHunger: 100, // 100 = no bụng, 0 = đói lả
  maxStamina: 100,
  hungerDrainPerSecond: 0.34, // no → đói hết trong khoảng 5 phút
  coldHungerMultiplier: 1.6, // ban đêm ở xa đống lửa thì đói nhanh hơn (lạnh)
  starvingDamagePerSecond: 1.5, // mất máu mỗi giây khi đói lả
  wellFedRatio: 0.6, // độ no trên mức này (tỉ lệ) thì máu tự hồi
  healthRegenPerSecond: 0.5,
  warmHealthRegenPerSecond: 1.4, // hồi máu khi ngồi cạnh đống lửa
  sleepingHealthRegenPerSecond: 3,
  sprintStaminaPerSecond: 24,
  meleeStaminaCost: 5,
  staminaRegenPerSecond: 20,
  staminaRegenDelaySeconds: 0.8, // nghỉ chừng này giây mới bắt đầu hồi thể lực
  minStaminaToSprint: 8,
  hurtInvulnerableSeconds: 0.45, // sau khi bị đánh được miễn sát thương ngắn
  respawnHealthRatio: 0.6, // hồi sinh ở giường với 60% máu
  sleepTimeScale: 6, // khi ngủ, thời gian trôi nhanh gấp 6 lần
  sleepSafeRadius: 320, // có zombie trong bán kính này (px) thì không ngủ được / bị đánh thức
  starvingToastIntervalSeconds: 12,
};

// =====================================================================
// Vật phẩm, chế tạo, xây dựng
// =====================================================================

/**
 * Vật phẩm. stackSize = số lượng tối đa trong một ô túi.
 * food: hunger/health hồi khi ăn (health âm = ăn sống bị đau bụng).
 * tool: loại công cụ dùng trong TOOLS. structure: loại công trình trong STRUCTURES.
 */
export const ITEMS = {
  wood: { name: 'Gỗ', stackSize: 50 },
  stone: { name: 'Đá', stackSize: 50 },
  berry: { name: 'Quả mọng', stackSize: 20, food: { hunger: 12, health: 2 } },
  rawMeat: { name: 'Thịt sống', stackSize: 10, food: { hunger: 14, health: -4 }, cooksInto: 'cookedMeat' },
  cookedMeat: { name: 'Thịt nướng', stackSize: 10, food: { hunger: 40, health: 12 } },
  hide: { name: 'Da thú', stackSize: 20 },
  axe: { name: 'Rìu', stackSize: 1, tool: 'axe' },
  pickaxe: { name: 'Cuốc', stackSize: 1, tool: 'pickaxe' },
  gun: { name: 'Súng', stackSize: 1, isGun: true },
  ammo: { name: 'Đạn', stackSize: 60 },
  wall: { name: 'Tường gỗ', stackSize: 20, structure: 'wall' },
  door: { name: 'Cửa', stackSize: 10, structure: 'door' },
  fence: { name: 'Hàng rào', stackSize: 20, structure: 'fence' },
  trap: { name: 'Bẫy', stackSize: 10, structure: 'trap' },
  campfire: { name: 'Đống lửa', stackSize: 5, structure: 'campfire' },
  bed: { name: 'Giường', stackSize: 3, structure: 'bed' },
  workbench: { name: 'Bàn chế tạo', stackSize: 3, structure: 'workbench' },
};

/** Trạm chế tạo (systems/crafting.js): công thức có `station` chỉ làm được khi đứng gần trạm đó. */
export const CRAFTING = {
  stationRange: 130, // đứng cách bàn chế tạo trong khoảng này (px) mới dùng được
};

/**
 * Công thức chế tạo (systems/crafting.js). Thứ tự ở đây là thứ tự hiện trong bảng.
 * Không có `station` = làm bằng tay ở đâu cũng được; station: 'workbench' = phải đứng gần bàn chế tạo.
 */
export const RECIPES = [
  { id: 'axe', result: 'axe', count: 1, cost: { wood: 5, stone: 2 } },
  { id: 'pickaxe', result: 'pickaxe', count: 1, cost: { wood: 5, stone: 3 } },
  { id: 'workbench', result: 'workbench', count: 1, cost: { wood: 12, stone: 4 } },
  { id: 'campfire', result: 'campfire', count: 1, cost: { wood: 6, stone: 3 } },
  { id: 'fence', result: 'fence', count: 2, cost: { wood: 4 } },
  { id: 'wall', result: 'wall', count: 1, cost: { wood: 6 }, station: 'workbench' },
  { id: 'door', result: 'door', count: 1, cost: { wood: 8 }, station: 'workbench' },
  { id: 'trap', result: 'trap', count: 1, cost: { wood: 4, stone: 4 }, station: 'workbench' },
  { id: 'bed', result: 'bed', count: 1, cost: { wood: 10, hide: 3 }, station: 'workbench' },
  { id: 'gun', result: 'gun', count: 1, cost: { wood: 10, stone: 12, hide: 2 }, station: 'workbench' },
  { id: 'ammo', result: 'ammo', count: 6, cost: { stone: 3, wood: 1 }, station: 'workbench' },
];

/** Túi đồ (systems/inventory.js) */
export const INVENTORY = {
  slotCount: 20,
  hotbarSize: 9, // 9 ô đầu là thanh nhanh (phím 1–9). Màn hẹp chỉ hiện 6 ô (xem style.css)
};

/** Công cụ: sát thương lên sinh vật và lên cây/đá mỗi nhát. "hand" = tay không. */
export const TOOLS = {
  hand: { creatureDamage: 6, treeDamage: 1, rockDamage: 1 },
  axe: { creatureDamage: 14, treeDamage: 3, rockDamage: 1 },
  pickaxe: { creatureDamage: 11, treeDamage: 1, rockDamage: 3 },
};

/**
 * Công trình (systems/building.js).
 * blocks: 'all' = chặn mọi thứ, 'creatures' = chỉ chặn zombie/thú (người chơi đi qua cửa được), 'none' = đi xuyên.
 */
export const STRUCTURES = {
  wall: { maxHealth: 220, blocks: 'all' },
  door: { maxHealth: 180, blocks: 'creatures' },
  fence: { maxHealth: 90, blocks: 'all' },
  trap: { maxHealth: 60, blocks: 'none', trapDamage: 24, trapCooldownSeconds: 0.9, trapWearPerHit: 10 },
  campfire: { maxHealth: 100, blocks: 'all', lightRadius: 210, warmRadius: 140 },
  bed: { maxHealth: 120, blocks: 'none' },
  workbench: { maxHealth: 150, blocks: 'all' },
};

/** Xây và sửa */
export const BUILD = {
  reachTiles: 3.2, // chỉ đặt được trong bán kính này quanh người chơi (tính bằng ô)
  touchPlaceDistanceTiles: 1.25, // trên điện thoại, bóng mờ nằm trước mặt chừng này ô
  repairWoodCost: 1, // mỗi lần sửa tốn 1 gỗ
  repairHealthPerUse: 45,
};

// =====================================================================
// Chiến đấu
// =====================================================================

/** Cận chiến & va chạm (systems/combat.js) */
export const COMBAT = {
  meleeArcRadians: 1.9, // góc quét của một nhát vung (~110°)
  meleeReach: 40, // tầm với tính từ mép thân người chơi (px)
  meleeCooldownSeconds: 0.42,
  meleeSwingSeconds: 0.2, // thời gian hoạt ảnh vung
  knockbackSpeed: 220, // vận tốc bị đẩy lùi khi trúng đòn (px/giây)
  knockbackDecay: 9, // độ "phanh" của lực đẩy lùi (1/giây)
  hurtFlashSeconds: 0.15, // sinh vật nháy trắng khi trúng đòn
  shakeOnPlayerHurt: 6, // độ rung màn hình khi người chơi bị đánh (px)
  shakeOnShoot: 1.5,
};

/** Súng (entities/bullet.js, systems/combat.js) */
export const GUN = {
  damage: 22,
  bulletSpeed: 720, // px/giây
  bulletRange: 560, // bay tối đa chừng này px
  bulletRadius: 4,
  fireIntervalSeconds: 0.26,
  magazineSize: 8,
  reloadSeconds: 1.3,
  spreadRadians: 0.05, // lệch ngẫu nhiên nhỏ cho tự nhiên
  maxBullets: 64, // số đạn bay cùng lúc tối đa (tái sử dụng object)
};

/** Các loại zombie (entities/zombie.js). speed: px/giây. */
export const ZOMBIES = {
  normal: { radius: 17, maxHealth: 40, speed: 62, damage: 10, structureDamage: 12, attackCooldownSeconds: 1 },
  runner: { radius: 14, maxHealth: 24, speed: 112, damage: 7, structureDamage: 7, attackCooldownSeconds: 0.8 },
  brute: { radius: 24, maxHealth: 150, speed: 44, damage: 22, structureDamage: 35, attackCooldownSeconds: 1.4 },
};

/** Hành vi chung của zombie */
export const ZOMBIE_BEHAVIOR = {
  attackGap: 8, // khoảng hở (px) giữa hai thân mà zombie đã đánh tới được
  healthGrowthPerNight: 0.1, // mỗi đêm zombie trâu hơn 10%
  fadeSeconds: 2.2, // thời gian tan biến lúc trời sáng
  separationStrength: 60, // lực đẩy nhau để không chồng lên nhau
  wobbleSpeed: 9, // tốc độ lắc lư khi đi
  ammoDropChance: 0.3, // xác suất rơi đạn khi bị hạ
  ammoDropMin: 1,
  ammoDropMax: 3,
};

/** Đợt zombie ban đêm (systems/dayNight.js) */
export const WAVES = {
  baseCount: 4, // đêm 1 có 4 con
  extraPerNight: 3, // mỗi đêm sau thêm 3 con
  maxCount: 70,
  maxAlive: 35, // số zombie cùng lúc tối đa
  spawnWindowFraction: 0.75, // rải zombie trong 75% đầu của đêm
  spawnMinDistance: 620, // xuất hiện ngoài màn hình, cách người chơi chừng này px
  spawnMaxDistance: 900,
  spawnAttempts: 30,
  runnerFromNight: 2,
  runnerWeightPerNight: 0.12,
  runnerMaxWeight: 0.45,
  bruteFromNight: 3,
  bruteWeightPerNight: 0.07,
  bruteMaxWeight: 0.3,
};

/** Tìm đường cho zombie (systems/pathfinding.js) */
export const PATHFINDING = {
  fieldRadiusTiles: 40, // chỉ tính bản đồ đường đi trong bán kính này quanh người chơi
  recomputeSeconds: 0.35, // tính lại tối đa mỗi 0.35 giây
  structureBaseCost: 6, // "giá" đi xuyên một công trình (phải đập) — càng cao zombie càng thích đi vòng
  structureHealthCost: 0.04, // cộng thêm theo máu công trình (tường càng chắc càng ít bị chọn)
  directChaseDistance: 70, // ở gần hơn thế thì lao thẳng vào người chơi
};

// =====================================================================
// Thú rừng
// =====================================================================

/** Các loài thú (entities/animal.js). drops: vật phẩm rơi khi bị săn. */
export const ANIMALS = {
  rabbit: {
    radius: 11,
    maxHealth: 15,
    walkSpeed: 55,
    fleeSpeed: 190,
    senseRadius: 150, // thấy người trong bán kính này là chạy
    drops: [
      { itemId: 'rawMeat', min: 1, max: 1 },
      { itemId: 'hide', min: 0, max: 1 },
    ],
  },
  deer: {
    radius: 16,
    maxHealth: 30,
    walkSpeed: 45,
    fleeSpeed: 175,
    alertRadius: 240, // thấy người thì đứng nhìn cảnh giác
    fleeRadius: 150, // lại gần hơn nữa thì bỏ chạy
    alertSeconds: 1.4,
    drops: [
      { itemId: 'rawMeat', min: 2, max: 2 },
      { itemId: 'hide', min: 1, max: 2 },
    ],
  },
  boar: {
    radius: 17,
    maxHealth: 50,
    walkSpeed: 40,
    chargeSpeed: 150,
    damage: 10,
    attackCooldownSeconds: 1.1,
    angrySeconds: 10, // bị đánh thì hung hăng phản công trong chừng này giây
    drops: [
      { itemId: 'rawMeat', min: 3, max: 3 },
      { itemId: 'hide', min: 1, max: 1 },
    ],
  },
};

/** Sinh và duy trì số lượng thú */
export const ANIMAL_SPAWN = {
  initialCount: { rabbit: 22, deer: 12, boar: 9 },
  maxAlive: 40,
  respawnIntervalSeconds: 10,
  respawnMinDistance: 650, // sinh thêm ngoài tầm nhìn
  respawnMaxDistance: 1200,
  spawnAttempts: 30,
  wanderMinSeconds: 1,
  wanderMaxSeconds: 3,
  idleMinSeconds: 1,
  idleMaxSeconds: 3.5,
  fleeSeconds: 2.5, // chạy trốn ít nhất chừng này giây
};

/** Vật phẩm rơi trên đất (entities/pickup.js) */
export const PICKUPS = {
  radius: 10,
  magnetRadius: 90, // lại gần chừng này thì vật phẩm bay vào người
  magnetSpeed: 320,
  collectRadius: 22,
  lifetimeSeconds: 240, // nằm trên đất quá lâu thì biến mất
  scatterSpeed: 120, // tốc độ văng ra khi rơi
  scatterDecay: 6,
  droppedPickupDelaySeconds: 1.5, // đồ tự vứt ra thì một lúc sau mới hút lại
};

// =====================================================================
// Ngày đêm & ánh sáng
// =====================================================================

/**
 * Chu kỳ ngày đêm (systems/dayNight.js). Các mốc là tỉ lệ trong một ngày (0 = bình minh).
 * Ví dụ ngày 240 giây: ban ngày ~132s, chạng vạng ~17s, đêm ~77s, rạng sáng ~14s.
 */
export const DAY_NIGHT = {
  dayLengthSeconds: 240, // một ngày trọn vẹn (sáng + tối) dài 4 phút
  startTimeOfDay: 0.04, // bắt đầu game vào buổi sáng sớm
  duskStart: 0.55, // bắt đầu tối dần
  nightStart: 0.62, // zombie bắt đầu kéo đến
  dawnStart: 0.94, // trời hửng sáng, zombie tan biến
  maxDarkness: 0.6, // độ tối tối đa của lớp phủ đêm (0..1) — không bao giờ đen kịt
};

/** Lớp phủ đêm và nguồn sáng (render/effects.js) */
export const LIGHTING = {
  resolution: 0.5, // vẽ lớp phủ ở nửa độ phân giải cho nhẹ (ánh sáng mờ nên không cần nét)
  nightColor: '64, 58, 120', // xanh tím nhạt (RGB) — không dùng đen
  playerLightRadius: 140,
  playerLightIntensity: 0.75, // người chơi tự toả sáng nhẹ để không bị lạc trong đêm (0..1)
  campfireFlickerAmount: 10, // lửa chập chờn ± chừng này px
  campfireFlickerSpeed: 9,
  warmGlowAlpha: 0.22, // quầng cam ấm quanh đống lửa
  muzzleLightRadius: 70,
};

// =====================================================================
// Hiệu ứng & âm thanh
// =====================================================================

/** Hạt hiệu ứng (render/effects.js). colors: chọn ngẫu nhiên một màu. */
export const PARTICLES = {
  poolSize: 360,
  presets: {
    woodChips: { colors: ['#c29f82', '#a9876c', '#9fd6a8'], count: 7, speed: [60, 160], life: [0.35, 0.7], size: [2.5, 5], gravity: 300 },
    leaves: { colors: ['#9fd6a8', '#bce6c2', '#88c795'], count: 14, speed: [40, 140], life: [0.6, 1.1], size: [3, 6], gravity: 80 },
    stoneDust: { colors: ['#d3cde0', '#b6aec8', '#ebe7f2'], count: 8, speed: [60, 170], life: [0.3, 0.6], size: [2.5, 5], gravity: 320 },
    berryPop: { colors: ['#f59fae', '#ffc4cf', '#a5dba8'], count: 8, speed: [40, 120], life: [0.4, 0.7], size: [2.5, 4.5], gravity: 200 },
    zombiePuff: { colors: ['#c4ebb2', '#a8dc96', '#e5f7dc'], count: 6, speed: [40, 130], life: [0.3, 0.6], size: [3, 6], gravity: 0 },
    zombieVanish: { colors: ['#e5f7dc', '#c4ebb2', '#ffffff'], count: 16, speed: [30, 110], life: [0.6, 1.2], size: [3, 7], gravity: -60 },
    animalPuff: { colors: ['#fff4e6', '#f3dcc2', '#ffffff'], count: 6, speed: [40, 120], life: [0.3, 0.6], size: [3, 5], gravity: 0 },
    buildDust: { colors: ['#f6e9c9', '#e9d8b0', '#c29f82'], count: 12, speed: [50, 140], life: [0.4, 0.8], size: [3, 6], gravity: 120 },
    spark: { colors: ['#fff1a8', '#ffd58a'], count: 4, speed: [80, 200], life: [0.12, 0.25], size: [2, 3.5], gravity: 0 },
    smoke: { colors: ['rgba(255,255,255,0.7)', 'rgba(230,226,240,0.6)'], count: 1, speed: [8, 24], life: [1, 1.6], size: [4, 8], gravity: -40 },
    heal: { colors: ['#b8f0c8', '#ffffff'], count: 6, speed: [20, 60], life: [0.5, 0.9], size: [2.5, 4], gravity: -90 },
  },
};

/** Số sát thương bay lên */
export const DAMAGE_NUMBERS = {
  poolSize: 48,
  riseSpeed: 42,
  lifeSeconds: 0.9,
};

/** Rung màn hình */
export const SCREEN_SHAKE = {
  decayPerSecond: 8,
  maxOffset: 10,
};

/** Âm thanh tạo bằng WebAudio (utils/audio.js) */
export const AUDIO = {
  masterVolume: 0.35,
  minRepeatSeconds: 0.045, // cùng một tiếng không phát dày hơn mức này
  hearingDistance: 900, // tiếng ở xa hơn chừng này (px) thì gần như không nghe
};

// =====================================================================
// Vẽ
// =====================================================================

/** Vẽ thế giới (render/) */
export const RENDER = {
  terrainChunkTiles: 8, // mặt đất được vẽ sẵn theo từng khối 8x8 ô rồi lưu lại
  maxCachedChunks: 40, // số khối giữ trong bộ nhớ; quá thì bỏ khối lâu không dùng
  terrainMaxResolution: 1.5, // độ nét tối đa của khối mặt đất — giới hạn để đỡ tốn RAM trên điện thoại
  landBlobRadius: 0.72, // bán kính "giọt" đất so với cạnh ô → bờ biển bo tròn
  shallowWaterRadius: 1.1, // vùng nước nông sáng màu quanh bờ, so với cạnh ô
  decorationChance: { grassTuft: 0.3, waterWave: 0.1, sandDot: 0.25 },
  objectCullMarginTiles: 2, // vẽ dư ra ngoài màn hình (ô) để tán cây cao không bị cắt
  treeSwaySpeed: 1.6, // tốc độ lắc lư của tán cây (radian/giây)
  treeSwayAmount: 2.5, // biên độ lắc lư (px)
  healthBarShowSeconds: 2.5, // thanh máu trên đầu sinh vật hiện chừng này giây sau khi trúng đòn
  pickupBobSpeed: 4,
  pickupBobHeight: 3,
};

/** Minimap (ui/minimap.js). Kích thước khung đặt trong style.css (--minimap-size). */
export const MINIMAP = {
  playerDotRadius: 3.5,
  zombieDotRadius: 2,
  viewRectLineWidth: 1.5,
};

/** Bảng màu pastel cho phần vẽ bằng canvas */
export const COLORS = {
  grass: '#c6ebd0', // xanh bạc hà
  grassTuft: '#acdcb8',
  forestGround: '#b4dfc0',
  water: '#acd8ef', // xanh trời nhạt
  shallowWater: '#c4e6f5',
  waterWave: 'rgba(255, 255, 255, 0.6)',
  sand: '#f6e9c9', // kem
  sandDot: '#e9d8b0',
  trunk: '#c29f82', // nâu sữa
  trunkShade: '#a9876c',
  stump: '#d6b89c',
  leaves: '#9fd6a8', // xanh lá dịu
  leavesShade: '#88c795',
  leavesHighlight: '#bce6c2',
  rock: '#d3cde0',
  rockShade: '#b6aec8',
  rockHighlight: '#ebe7f2',
  bush: '#a5dba8',
  bushShade: '#8cc993',
  berry: '#f59fae',
  shadow: 'rgba(70, 80, 100, 0.16)',
  outline: '#4a4058',
  playerBody: '#ffdcb4',
  playerOutline: '#e3ab7c',
  playerCheek: '#ffb8b8',
  backpack: '#a6c8f0',
  backpackOutline: '#7fa7d6',
  eye: '#4a4058',
  eyeShine: '#ffffff',
  aimGuide: 'rgba(74, 64, 88, 0.28)',
  aimGuideFiring: 'rgba(255, 150, 120, 0.75)',
  muzzleFlash: '#fff1a8',
  bullet: '#ffd58a',
  bulletOutline: '#f0a868',
  zombieNormal: '#bfe6ac',
  zombieNormalOutline: '#94c987',
  zombieRunner: '#d4f0b0',
  zombieRunnerOutline: '#a9d18a',
  zombieBrute: '#a6d49a',
  zombieBruteOutline: '#7fb27a',
  zombieMouth: '#7a9c74',
  rabbit: '#fff6ec',
  rabbitOutline: '#e8d6c4',
  rabbitInnerEar: '#ffc9d2',
  deer: '#e8c39e',
  deerOutline: '#c99f7a',
  deerSpot: '#fff3e2',
  antler: '#f3e2c8',
  boar: '#d9a9a0',
  boarOutline: '#b9877f',
  boarSnout: '#f2c3bb',
  tusk: '#fffaf0',
  nose: '#f59fae',
  hitFlash: 'rgba(255, 255, 255, 0.75)',
  healthBarBack: 'rgba(74, 64, 88, 0.25)',
  healthBarFill: '#ff9a8b',
  structureHealthFill: '#ffd58a',
  plank: '#dcb994',
  plankShade: '#c29f82',
  plankTop: '#ecd2b4',
  doorPlank: '#e7c7a0',
  doorKnob: '#ffd58a',
  trapBase: '#c9c2d6',
  trapTeeth: '#f4f1f8',
  flame: '#ffb48a',
  flameInner: '#fff1a8',
  campfireStone: '#d3cde0',
  log: '#b48a6a',
  bedFrame: '#d9b48f',
  bedBlanket: '#a6c8f0',
  bedPillow: '#ffffff',
  hide: '#e3c3a0',
  meatRaw: '#ffb3b8',
  meatCooked: '#c98a64',
  bone: '#fff7ea',
  tool: '#b6aec8',
  toolHandle: '#c29f82',
  gunBody: '#c7b8ea',
  gunAccent: '#9d8fd0',
  ammo: '#ffd58a',
  ghostValid: 'rgba(140, 220, 160, 0.55)',
  ghostInvalid: 'rgba(255, 150, 150, 0.55)',
  damageText: '#ff7f73',
  healText: '#5fbf7f',
  damageTextOutline: '#ffffff',
  minimapPlayer: '#ff8f7d',
  minimapZombie: '#5f9b55',
  minimapStructure: '#c29f82',
  minimapView: 'rgba(255, 255, 255, 0.9)',
};
