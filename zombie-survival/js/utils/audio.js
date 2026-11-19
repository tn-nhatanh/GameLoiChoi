// Âm thanh tạo bằng WebAudio (không cần file): mỗi tiếng là vài nốt dao động (oscillator) và/hoặc tiếng xì (noise)
// có bao âm (envelope) ngắn. Tiếng được chọn cho nhẹ nhàng, dễ thương — "pew" mềm thay vì tiếng súng thật.
// Trình duyệt chỉ cho phát âm thanh sau khi người dùng chạm/bấm, nên main.js gọi unlock() ở lần tương tác đầu.

import { AUDIO } from '../config.js';

const SILENT_GAIN = 0.0001; // exponentialRamp không về được 0 tuyệt đối
const NOISE_SECONDS = 1;

function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  return buffer;
}

/** Bao âm: lên nhanh tới `volume` rồi tắt dần trong `duration` giây. */
function applyEnvelope(gainNode, start, duration, volume, attack) {
  gainNode.gain.setValueAtTime(SILENT_GAIN, start);
  gainNode.gain.linearRampToValueAtTime(volume, start + attack);
  gainNode.gain.exponentialRampToValueAtTime(SILENT_GAIN, start + duration);
}

/** Một nốt: tần số có thể trượt từ `frequency` tới `endFrequency`. */
function tone(audio, output, delay, { frequency, endFrequency = frequency, duration, type = 'sine', volume = 0.4, attack = 0.005 }) {
  const { context } = audio;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  applyEnvelope(gain, start, duration, volume, attack);
  oscillator.connect(gain).connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/** Tiếng xì đã lọc: lowpass = trầm đục (gỗ, đất), highpass = sắc (đá, xèo xèo), bandpass = ở giữa. */
function noise(audio, output, delay, { duration, volume = 0.3, filterType = 'lowpass', frequency = 1000 }) {
  const { context, noiseBuffer } = audio;
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer;
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, start);
  applyEnvelope(gain, start, duration, volume, 0.004);
  source.connect(filter).connect(gain).connect(output);
  source.start(start, Math.random() * (NOISE_SECONDS - duration));
  source.stop(start + duration + 0.02);
}

/** Chuỗi nốt nhạc ngắn (giai điệu báo hiệu). */
function melody(audio, output, notes, spacing, duration, type, volume) {
  notes.forEach((frequency, index) => tone(audio, output, index * spacing, { frequency, duration, type, volume }));
}

/** Công thức từng tiếng: (audio, output) => void */
const SOUNDS = {
  click: (a, o) => tone(a, o, 0, { frequency: 660, duration: 0.05, type: 'triangle', volume: 0.25 }),
  chop: (a, o) => {
    noise(a, o, 0, { duration: 0.08, volume: 0.45, frequency: 1200 });
    tone(a, o, 0, { frequency: 190, endFrequency: 120, duration: 0.09, type: 'triangle', volume: 0.35 });
  },
  mine: (a, o) => {
    tone(a, o, 0, { frequency: 620, endFrequency: 420, duration: 0.08, type: 'triangle', volume: 0.3 });
    noise(a, o, 0, { duration: 0.05, volume: 0.25, filterType: 'highpass', frequency: 2500 });
  },
  treeFall: (a, o) => {
    noise(a, o, 0, { duration: 0.35, volume: 0.45, frequency: 500 });
    tone(a, o, 0.05, { frequency: 150, endFrequency: 70, duration: 0.35, volume: 0.35 });
  },
  rockBreak: (a, o) => {
    noise(a, o, 0, { duration: 0.2, volume: 0.45, filterType: 'bandpass', frequency: 1400 });
    tone(a, o, 0, { frequency: 320, endFrequency: 150, duration: 0.16, type: 'triangle', volume: 0.3 });
  },
  pick: (a, o) => tone(a, o, 0, { frequency: 880, endFrequency: 1320, duration: 0.09, volume: 0.3 }),
  pickup: (a, o) => {
    tone(a, o, 0, { frequency: 740, endFrequency: 1040, duration: 0.06, volume: 0.22 });
    tone(a, o, 0.05, { frequency: 1040, endFrequency: 1400, duration: 0.06, volume: 0.18 });
  },
  craft: (a, o) => melody(a, o, [523, 659, 784], 0.07, 0.1, 'triangle', 0.28),
  place: (a, o) => {
    tone(a, o, 0, { frequency: 210, endFrequency: 140, duration: 0.11, type: 'triangle', volume: 0.45 });
    noise(a, o, 0, { duration: 0.06, volume: 0.25, frequency: 800 });
  },
  error: (a, o) => tone(a, o, 0, { frequency: 230, endFrequency: 180, duration: 0.13, type: 'square', volume: 0.12 }),
  swing: (a, o) => noise(a, o, 0, { duration: 0.09, volume: 0.22, filterType: 'bandpass', frequency: 900 }),
  shoot: (a, o) => {
    tone(a, o, 0, { frequency: 900, endFrequency: 260, duration: 0.1, type: 'square', volume: 0.14 });
    noise(a, o, 0, { duration: 0.06, volume: 0.25, filterType: 'highpass', frequency: 1500 });
  },
  reload: (a, o) => tone(a, o, 0, { frequency: 330, duration: 0.05, type: 'triangle', volume: 0.25 }),
  reloadDone: (a, o) => melody(a, o, [440, 660], 0.06, 0.06, 'triangle', 0.25),
  zombieHit: (a, o) => {
    tone(a, o, 0, { frequency: 280, endFrequency: 200, duration: 0.09, volume: 0.35 });
    noise(a, o, 0, { duration: 0.05, volume: 0.2, frequency: 900 });
  },
  zombieDie: (a, o) => tone(a, o, 0, { frequency: 320, endFrequency: 90, duration: 0.38, type: 'triangle', volume: 0.35 }),
  zombieGroan: (a, o) => {
    tone(a, o, 0, { frequency: 135, endFrequency: 100, duration: 0.6, type: 'triangle', volume: 0.16, attack: 0.08 });
    tone(a, o, 0.02, { frequency: 140, endFrequency: 104, duration: 0.6, type: 'triangle', volume: 0.1, attack: 0.08 });
  },
  animalHit: (a, o) => tone(a, o, 0, { frequency: 760, endFrequency: 520, duration: 0.08, volume: 0.3 }),
  animalDie: (a, o) => tone(a, o, 0, { frequency: 620, endFrequency: 260, duration: 0.25, volume: 0.3 }),
  playerHurt: (a, o) => tone(a, o, 0, { frequency: 420, endFrequency: 250, duration: 0.16, type: 'square', volume: 0.16 }),
  eat: (a, o) => {
    for (const delay of [0, 0.09, 0.18]) noise(a, o, delay, { duration: 0.05, volume: 0.22, filterType: 'bandpass', frequency: 1600 });
  },
  cook: (a, o) => {
    noise(a, o, 0, { duration: 0.3, volume: 0.15, filterType: 'highpass', frequency: 3000 });
    tone(a, o, 0.05, { frequency: 600, endFrequency: 800, duration: 0.08, volume: 0.2 });
  },
  trap: (a, o) => {
    tone(a, o, 0, { frequency: 200, endFrequency: 90, duration: 0.1, type: 'square', volume: 0.2 });
    noise(a, o, 0, { duration: 0.05, volume: 0.25, frequency: 1500 });
  },
  structureHit: (a, o) => {
    noise(a, o, 0, { duration: 0.07, volume: 0.3, frequency: 700 });
    tone(a, o, 0, { frequency: 170, duration: 0.06, type: 'triangle', volume: 0.25 });
  },
  structureBreak: (a, o) => {
    noise(a, o, 0, { duration: 0.3, volume: 0.4, frequency: 600 });
    tone(a, o, 0, { frequency: 200, endFrequency: 80, duration: 0.3, type: 'triangle', volume: 0.3 });
  },
  repair: (a, o) => melody(a, o, [500, 700], 0.08, 0.07, 'triangle', 0.28),
  nightStart: (a, o) => melody(a, o, [392, 330, 262], 0.22, 0.3, 'sine', 0.25),
  dawn: (a, o) => melody(a, o, [262, 330, 392, 523], 0.15, 0.25, 'sine', 0.25),
  sleep: (a, o) => tone(a, o, 0, { frequency: 523, endFrequency: 392, duration: 0.45, volume: 0.2 }),
  respawn: (a, o) => melody(a, o, [392, 523, 659], 0.12, 0.2, 'sine', 0.25),
  gameOver: (a, o) => melody(a, o, [392, 330, 262, 196], 0.22, 0.3, 'triangle', 0.3),
};

export function createAudio() {
  const audio = { context: null, master: null, noiseBuffer: null };
  const lastPlayedAt = new Map();
  let isEnabled = true;

  function ensureContext() {
    if (audio.context) return audio.context;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audio.context = new AudioContextClass();
    audio.master = audio.context.createGain();
    audio.master.gain.value = AUDIO.masterVolume;
    audio.master.connect(audio.context.destination);
    audio.noiseBuffer = createNoiseBuffer(audio.context);
    return audio.context;
  }

  /** Cùng một tiếng không phát dày quá (ví dụ 20 zombie cùng bị trúng đạn). */
  function isThrottled(name) {
    const now = audio.context.currentTime;
    if (now - (lastPlayedAt.get(name) ?? -1) < AUDIO.minRepeatSeconds) return true;
    lastPlayedAt.set(name, now);
    return false;
  }

  return {
    /** Gọi trong sự kiện chạm/bấm đầu tiên của người dùng. */
    unlock() {
      try {
        const context = ensureContext();
        if (context?.state === 'suspended') context.resume();
      } catch {
        // Trình duyệt không hỗ trợ âm thanh: chơi không tiếng.
      }
    },

    setEnabled(enabled) {
      isEnabled = enabled;
    },

    /** volume 0..1 (main.js giảm dần theo khoảng cách tới người chơi). */
    play(name, volume = 1) {
      const sound = SOUNDS[name];
      if (!isEnabled || !sound || !audio.context || audio.context.state !== 'running') return;
      if (isThrottled(name)) return;
      const output = audio.context.createGain();
      output.gain.value = volume;
      output.connect(audio.master);
      try {
        sound(audio, output);
      } catch {
        // Một tiếng lỗi không được làm hỏng vòng lặp game.
      }
    },
  };
}
