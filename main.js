const { Plugin, Modal, Setting, Notice, TFile, TFolder, ItemView, FuzzySuggestModal, normalizePath } = require('obsidian');

const MAX_DIMENSION = 20000;
const MIN_DIMENSION = 2000;
const DIMENSION_STEP = 2000;
const JPEG_QUALITY = 1;
const TILE_W = 2048;
const BAND_H = 512;
const LABEL_H = 26;
const MAX_VIDEO_BYTES = 400 * 1024 * 1024;
const DEFAULT_SETTINGS = { longestSide: 8000, padding: 200, theme: 'obsidian', hideFilenames: true, exportDir: '' };

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'];
const VIDEO_EXT = ['mp4', 'webm', 'ogv', 'mov', 'mkv', 'm4v'];
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', mkv: 'video/x-matroska',
};
const PRESET_RGB = { 1: '233, 49, 71', 2: '236, 117, 0', 3: '224, 172, 0', 4: '8, 185, 78', 5: '0, 191, 188', 6: '120, 82, 238' };

const LIGHT = { bg: '#ffffff', card: '#ffffff', border: '#b9bcc4', text: '#222222', muted: '#6b6b6b', accent: '#7c4ddb', edge: '#8a8f98', codeBg: '#eef0f3' };
const DARK = { bg: '#1e1e1e', card: '#242424', border: '#595959', text: '#dadada', muted: '#9a9a9a', accent: '#a78bfa', edge: '#7b7b7b', codeBg: '#303030' };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/ JPEG ENCODER /
const JPEG_ZIGZAG = new Uint8Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

const JPEG_QY = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const JPEG_QC = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
];

const JPEG_DC_Y_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const JPEG_DC_C_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const JPEG_DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const JPEG_AC_Y_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const JPEG_AC_Y_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];
const JPEG_AC_C_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const JPEG_AC_C_VALS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
  0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];

const JPEG_AASF = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.5411961, 0.275899379];

function jpegBuildHuffman(bits, vals) {
  const code = new Int32Array(256), len = new Uint8Array(256);
  let c = 0, k = 0;
  for (let l = 1; l <= 16; l++) {
    for (let i = 0; i < bits[l - 1]; i++) { code[vals[k]] = c; len[vals[k]] = l; k++; c++; }
    c <<= 1;
  }
  return { code, len };
}

class JpegStreamEncoder {
  constructor(width, height, quality) {
    this.w = width;
    this.h = height;
    this.chunks = [];
    this.buf = new Uint8Array(1 << 20);
    this.pos = 0;
    this.bitBuf = 0;
    this.bitCnt = 0;
    this.pred = [0, 0, 0];
    this.rowsDone = 0;
    this.block = new Float32Array(64);
    this.zz = new Int32Array(64);
    this.planes = [new Float32Array(0), new Float32Array(0), new Float32Array(0)];

    const q = clampInt(Math.round(quality * 100), 1, 100);
    const scale = q < 50 ? 5000 / q : 200 - q * 2;
    const mk = (t) => t.map((v) => clampInt(Math.floor((v * scale + 50) / 100), 1, 255));
    this.qt = [mk(JPEG_QY), mk(JPEG_QC)]; // natural (row-major) order
    this.fd = this.qt.map((t) => {
      const f = new Float32Array(64);
      for (let i = 0; i < 64; i++) f[i] = 1 / (t[i] * JPEG_AASF[i >> 3] * JPEG_AASF[i & 7] * 8);
      return f;
    });
    this.huff = {
      dc: [jpegBuildHuffman(JPEG_DC_Y_BITS, JPEG_DC_VALS), jpegBuildHuffman(JPEG_DC_C_BITS, JPEG_DC_VALS)],
      ac: [jpegBuildHuffman(JPEG_AC_Y_BITS, JPEG_AC_Y_VALS), jpegBuildHuffman(JPEG_AC_C_BITS, JPEG_AC_C_VALS)],
    };
    this.writeHeader();
  }

  emit(b) {
    if (this.pos >= this.buf.length) { this.chunks.push(this.buf); this.buf = new Uint8Array(1 << 20); this.pos = 0; }
    this.buf[this.pos++] = b;
  }
  word(v) { this.emit((v >> 8) & 255); this.emit(v & 255); }
  bytes(arr) { for (let i = 0; i < arr.length; i++) this.emit(arr[i]); }

  writeHeader() {
    this.word(0xffd8);
    this.word(0xffe0); this.word(16); this.bytes([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
    // Quant tables (zigzag order)
    for (let t = 0; t < 2; t++) {
      this.word(0xffdb); this.word(67); this.emit(t);
      for (let k = 0; k < 64; k++) this.emit(this.qt[t][JPEG_ZIGZAG[k]]);
    }
    this.word(0xffc0); this.word(17); this.emit(8); this.word(this.h); this.word(this.w); this.emit(3);
    this.bytes([1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
    // Huffman tables
    const dht = (cls, id, bits, vals) => {
      this.word(0xffc4); this.word(2 + 1 + 16 + vals.length); this.emit((cls << 4) | id);
      this.bytes(bits); this.bytes(vals);
    };
    dht(0, 0, JPEG_DC_Y_BITS, JPEG_DC_VALS);
    dht(1, 0, JPEG_AC_Y_BITS, JPEG_AC_Y_VALS);
    dht(0, 1, JPEG_DC_C_BITS, JPEG_DC_VALS);
    dht(1, 1, JPEG_AC_C_BITS, JPEG_AC_C_VALS);
    this.word(0xffda); this.word(12); this.emit(3); this.bytes([1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);
  }

  putBits(code, len) {
    this.bitBuf = (this.bitBuf << len) | code;
    this.bitCnt += len;
    while (this.bitCnt >= 8) {
      const b = (this.bitBuf >>> (this.bitCnt - 8)) & 255;
      this.emit(b);
      if (b === 255) this.emit(0);
      this.bitCnt -= 8;
    }
    this.bitBuf &= (1 << this.bitCnt) - 1;
  }

  dctQuant(comp) {
    const d = this.block, fd = this.fd[comp ? 1 : 0], zz = this.zz;
    for (let pass = 0; pass < 2; pass++) {
      const step = pass === 0 ? 1 : 8, outer = pass === 0 ? 8 : 1;
      for (let i = 0; i < 8; i++) {
        const o = i * outer;
        const d0 = d[o], d1 = d[o + step], d2 = d[o + 2 * step], d3 = d[o + 3 * step];
        const d4 = d[o + 4 * step], d5 = d[o + 5 * step], d6 = d[o + 6 * step], d7 = d[o + 7 * step];
        const t0 = d0 + d7, t7 = d0 - d7, t1 = d1 + d6, t6 = d1 - d6, t2 = d2 + d5, t5 = d2 - d5, t3 = d3 + d4, t4 = d3 - d4;
        let t10 = t0 + t3; const t13 = t0 - t3; let t11 = t1 + t2; let t12 = t1 - t2;
        d[o] = t10 + t11; d[o + 4 * step] = t10 - t11;
        const z1 = (t12 + t13) * 0.707106781;
        d[o + 2 * step] = t13 + z1; d[o + 6 * step] = t13 - z1;
        t10 = t4 + t5; t11 = t5 + t6; t12 = t6 + t7;
        const z5 = (t10 - t12) * 0.382683433;
        const z2 = 0.5411961 * t10 + z5, z4 = 1.306562965 * t12 + z5, z3 = t11 * 0.707106781;
        const z11 = t7 + z3, z13 = t7 - z3;
        d[o + 5 * step] = z13 + z2; d[o + 3 * step] = z13 - z2;
        d[o + step] = z11 + z4; d[o + 7 * step] = z11 - z4;
      }
    }
    for (let k = 0; k < 64; k++) {
      const i = JPEG_ZIGZAG[k];
      const v = d[i] * fd[i];
      let r = v > 0 ? (v + 0.5) | 0 : (v - 0.5) | 0;
      // The standard AC Huffman tables only cover magnitudes up to 1023 (matters at quality 100).
      if (k > 0) { if (r > 1023) r = 1023; else if (r < -1023) r = -1023; }
      zz[k] = r;
    }
  }

  encodeBlock(comp) {
    const zz = this.zz, dc = this.huff.dc[comp ? 1 : 0], ac = this.huff.ac[comp ? 1 : 0];
    const diff = zz[0] - this.pred[comp];
    this.pred[comp] = zz[0];
    let a = diff < 0 ? -diff : diff;
    let size = a ? 32 - Math.clz32(a) : 0;
    this.putBits(dc.code[size], dc.len[size]);
    if (size) this.putBits(diff < 0 ? (diff - 1) & ((1 << size) - 1) : diff, size);

    let run = 0;
    for (let k = 1; k < 64; k++) {
      const v = zz[k];
      if (v === 0) { run++; continue; }
      while (run > 15) { this.putBits(ac.code[0xf0], ac.len[0xf0]); run -= 16; }
      a = v < 0 ? -v : v;
      size = 32 - Math.clz32(a);
      const sym = (run << 4) | size;
      this.putBits(ac.code[sym], ac.len[sym]);
      this.putBits(v < 0 ? (v - 1) & ((1 << size) - 1) : v, size);
      run = 0;
    }
    if (run > 0) this.putBits(ac.code[0], ac.len[0]);
  }

  addRows(rgba, rows) {
    const w = this.w, blocksX = (w + 7) >> 3, blocksY = (rows + 7) >> 3, blk = this.block;
    for (let by = 0; by < blocksY; by++) {
      for (let bx = 0; bx < blocksX; bx++) {
        // Build the three component blocks for this MCU (edge pixels are replicated).
        for (let comp = 0; comp < 3; comp++) {
          for (let j = 0; j < 8; j++) {
            const y = Math.min(by * 8 + j, rows - 1);
            const rowOff = y * w * 4;
            for (let i = 0; i < 8; i++) {
              const x = Math.min(bx * 8 + i, w - 1);
              const p = rowOff + x * 4;
              const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
              blk[j * 8 + i] = comp === 0
                ? 0.299 * r + 0.587 * g + 0.114 * b - 128
                : comp === 1
                  ? -0.168736 * r - 0.331264 * g + 0.5 * b
                  : 0.5 * r - 0.418688 * g - 0.081312 * b;
            }
          }
          this.dctQuant(comp);
          this.encodeBlock(comp);
        }
      }
    }
    this.rowsDone += rows;
  }

  finish() {
    if (this.bitCnt > 0) this.putBits((1 << (8 - this.bitCnt)) - 1, 8 - this.bitCnt);
    this.word(0xffd9);
    this.chunks.push(this.buf.subarray(0, this.pos));
    return this.chunks;
  }
}

function clampInt(v, lo, hi) { return Math.min(hi, Math.max(lo, v | 0)); }

/ THEME /

function getTheme(mode) {
  const cs = getComputedStyle(document.body);
  const v = (name) => (cs.getPropertyValue(name) || '').trim();
  const validColor = (x) => !!x && typeof CSS !== 'undefined' && CSS.supports('color', x);

  const isDark = mode === 'dark' || (mode === 'obsidian' && document.body.classList.contains('theme-dark'));
  const theme = Object.assign({}, isDark ? DARK : LIGHT);
  theme.opaque = theme.bg; // guaranteed-opaque colour painted under the real background

  const presets = {};
  for (const k of Object.keys(PRESET_RGB)) presets[k] = PRESET_RGB[k].split(',').map(Number);

  if (mode === 'obsidian') {
    const pick = (key, names) => {
      for (const n of names) {
        const x = v(n);
        if (validColor(x)) { theme[key] = x; return; }
      }
    };
    pick('bg', ['--canvas-background', '--background-primary']);
    pick('card', ['--background-primary']);
    pick('border', ['--text-faint']);
    pick('text', ['--text-normal']);
    pick('muted', ['--text-muted']);
    pick('accent', ['--text-accent', '--interactive-accent']);
    pick('edge', ['--text-faint']);
    pick('codeBg', ['--code-background', '--background-secondary']);
    for (const k of Object.keys(PRESET_RGB)) {
      const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(v('--canvas-color-' + k));
      if (m) presets[k] = [+m[1], +m[2], +m[3]];
    }
  }

  theme.presets = presets;
  theme.fonts = {
    text: (v('--font-text') || cs.fontFamily || 'sans-serif') + ', sans-serif',
    mono: (v('--font-monospace') || 'monospace') + ', monospace',
  };
  return theme;
}

function resolveColor(color, theme) {
  if (!color) return null;
  const s = String(color).trim();
  if (theme.presets[s]) return theme.presets[s];
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
  return null;
}

const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;


function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

/ MARKDOWN RENDERER /

function parseInline(text) {
  const runs = [];
  const st = { b: false, i: false, s: false, h: false };
  const add = (t, extra) => { if (t) runs.push(Object.assign({ text: t, b: st.b, i: st.i, s: st.s, h: st.h }, extra || {})); };
  const re = /(`[^`\n]+`)|(!?\[\[[^\]]+\]\])|(!?\[[^\]]*\]\([^)]*\))|(\*\*|~~|==|\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    add(text.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) {
      add(m[1].slice(1, -1), { c: true });
    } else if (m[2]) {
      const embed = m[2][0] === '!';
      const parts = m[2].replace(/^!?\[\[|\]\]$/g, '').split('|');
      const label = parts.length > 1 ? parts.slice(1).join('|') : (parts[0].split('#')[0].split('/').pop() || parts[0]);
      if (embed) add('[' + label + ']'); else add(label, { l: true });
    } else if (m[3]) {
      const mm = /^!?\[([^\]]*)\]\(([^)]*)\)/.exec(m[3]);
      add(mm[1] || mm[2], { l: true });
    } else {
      const mk = m[4];
      const key = { '**': 'b', '~~': 's', '==': 'h', '*': 'i' }[mk];
      const prev = text[m.index - 1], next = text[last];
      const ok = !st[key] ? (next && !/\s/.test(next)) : (prev && !/\s/.test(prev));
      if (ok) st[key] = !st[key]; else add(mk);
    }
  }
  add(text.slice(last));
  return runs;
}

function pieceFont(run, size, boldBase, fonts) {
  if (run.c) return `400 ${size * 0.9}px ${fonts.mono}`;
  return `${run.i ? 'italic ' : ''}${run.b || boldBase ? 700 : 400} ${size}px ${fonts.text}`;
}

function wrapRuns(ctx, runs, maxW, size, boldBase, fonts) {
  const lines = [[]];
  let x = 0;
  const push = (text, run, w) => { lines[lines.length - 1].push({ text, run, w }); x += w; };
  for (const run of runs) {
    ctx.font = pieceFont(run, size, boldBase, fonts);
    for (const piece of run.text.split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) {
        if (x > 0) push(' ', run, ctx.measureText(' ').width);
        continue;
      }
      const w = ctx.measureText(piece).width;
      if (x > 0 && x + w > maxW) { lines.push([]); x = 0; }
      if (w <= maxW) { push(piece, run, w); continue; }
      let chunk = '';
      for (const ch of Array.from(piece)) {
        if (chunk && ctx.measureText(chunk + ch).width > maxW) {
          push(chunk, run, ctx.measureText(chunk).width);
          lines.push([]); x = 0; chunk = ch;
        } else chunk += ch;
      }
      if (chunk) push(chunk, run, ctx.measureText(chunk).width);
    }
  }
  return lines;
}

function drawLine(ctx, line, x, top, lh, size, boldBase, color, env) {
  const { theme, fonts } = env;
  ctx.textBaseline = 'middle';
  const cy = top + lh / 2;
  let cx = x;
  for (const p of line) {
    const r = p.run;
    ctx.font = pieceFont(r, size, boldBase, fonts);
    if (r.c) { ctx.fillStyle = theme.codeBg; rr(ctx, cx - 2, top + lh * 0.15, p.w + 4, lh * 0.7, 3); ctx.fill(); }
    if (r.h) { ctx.fillStyle = 'rgba(255, 208, 0, 0.4)'; ctx.fillRect(cx, top + lh * 0.12, p.w, lh * 0.76); }
    ctx.fillStyle = r.l ? theme.accent : color;
    ctx.fillText(p.text, cx, cy);
    if (r.l || r.s) {
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = Math.max(1, size / 16);
      const ly = r.s ? cy : cy + size * 0.5;
      ctx.beginPath(); ctx.moveTo(cx, ly); ctx.lineTo(cx + p.w, ly); ctx.stroke();
    }
    cx += p.w;
  }
}

function drawMarkdown(ctx, text, x, y, width, maxY, env) {
  const { theme, fonts } = env;
  const base = 16;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let inCode = false;

  for (let li = 0; li < lines.length && y < maxY; li++) {
    const line = lines[li];

    if (/^\s*```/.test(line)) { inCode = !inCode; y += 2; continue; }
    if (inCode) {
      const lh = base * 1.4;
      ctx.fillStyle = theme.codeBg; ctx.fillRect(x - 4, y, width + 8, lh);
      ctx.font = `400 ${base * 0.88}px ${fonts.mono}`;
      ctx.fillStyle = theme.text; ctx.textBaseline = 'middle';
      ctx.fillText(line, x, y + lh / 2);
      y += lh; continue;
    }
    if (!line.trim()) { y += base * 0.7; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      y += base * 0.4;
      ctx.strokeStyle = theme.border; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke();
      y += base * 0.8; continue;
    }

    let size = base, bold = false, indent = 0, color = theme.text, prefix = null, quote = false, content = line, m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      size = base * [1.8, 1.5, 1.3, 1.15, 1.05, 1][m[1].length - 1];
      bold = true; content = m[2]; y += size * 0.25;
    } else if ((m = /^(\s*)([-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/.exec(line))) {
      const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
      indent = 22 + depth * 20;
      prefix = /^\d/.test(m[2]) ? m[2] : (m[3] !== undefined ? (m[3] === ' ' ? '☐' : '☑') : '•');
      content = m[4];
    } else if ((m = /^\s*>+\s?(.*)$/.exec(line))) {
      quote = true; indent = 14; color = theme.muted; content = m[1];
    }

    const lh = size * 1.5;
    const wrapped = wrapRuns(ctx, parseInline(content), Math.max(20, width - indent), size, bold, fonts);

    if (quote) { ctx.fillStyle = theme.border; ctx.fillRect(x + 2, y, 3, lh * wrapped.length); }
    if (prefix) {
      ctx.font = `400 ${size}px ${fonts.text}`; ctx.fillStyle = theme.muted; ctx.textBaseline = 'middle';
      ctx.fillText(prefix, x + indent - 20 + (prefix === '•' ? 4 : 0), y + lh / 2);
    }
    for (const l of wrapped) {
      if (y > maxY) break;
      drawLine(ctx, l, x + indent, y, lh, size, bold, color, env);
      y += lh;
    }
  }
  return y;
}

/ CANVAS TO SCENE /

function sanitizeCanvas(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const nodes = (Array.isArray(data.nodes) ? data.nodes : []).map((n) => Object.assign({}, n, {
    x: Number(n.x) || 0,
    y: Number(n.y) || 0,
    width: Math.max(1, Number(n.width) || 250),
    height: Math.max(1, Number(n.height) || 60),
  }));
  return { nodes, edges: Array.isArray(data.edges) ? data.edges : [] };
}

const nodeHasLabel = (n, hideFilenames) => (n.type === 'file' && !hideFilenames) || n.type === 'link' || (n.type === 'group' && !!n.label);

function computeWorld(data, padding, hideFilenames = false) {
  if (!data || !data.nodes.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of data.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y - (nodeHasLabel(n, hideFilenames) ? LABEL_H : 0));
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const pad = Math.max(0, padding);
  return { minX: minX - pad, minY: minY - pad, W: maxX - minX + pad * 2, H: maxY - minY + pad * 2 };
}

function outputSize(world, longest) {
  const scale = longest / Math.max(world.W, world.H);
  return { scale, w: Math.max(1, Math.round(world.W * scale)), h: Math.max(1, Math.round(world.H * scale)) };
}

const SIDE = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

function anchor(n, side) {
  switch (side) {
    case 'top': return [n.x + n.width / 2, n.y];
    case 'bottom': return [n.x + n.width / 2, n.y + n.height];
    case 'left': return [n.x, n.y + n.height / 2];
    default: return [n.x + n.width, n.y + n.height / 2];
  }
}

function autoSides(a, b) {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2);
  const dy = b.y + b.height / 2 - (a.y + a.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['right', 'left'] : ['left', 'right'];
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

function edgeGeometry(e, from, to, theme) {
  let fs = e.fromSide, ts = e.toSide;
  if (!SIDE[fs] || !SIDE[ts]) {
    const a = autoSides(from, to);
    if (!SIDE[fs]) fs = a[0];
    if (!SIDE[ts]) ts = a[1];
  }
  const p0 = anchor(from, fs), p3 = anchor(to, ts);
  const off = Math.min(Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) * 0.5, 200);
  const p1 = [p0[0] + SIDE[fs][0] * off, p0[1] + SIDE[fs][1] * off];
  const p2 = [p3[0] + SIDE[ts][0] * off, p3[1] + SIDE[ts][1] * off];
  const color = resolveColor(e.color, theme);
  return {
    p0, p1, p2, p3, fs, ts, color,
    arrowTo: e.toEnd !== 'none',
    arrowFrom: e.fromEnd === 'arrow',
    mid: [(p0[0] + 3 * p1[0] + 3 * p2[0] + p3[0]) / 8, (p0[1] + 3 * p1[1] + 3 * p2[1] + p3[1]) / 8],
  };
}

function drawArrow(ctx, tip, dir) {
  const len = 14, half = 7, px = -dir[1], py = dir[0];
  const bx = tip[0] - dir[0] * len, by = tip[1] - dir[1] * len;
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(bx + px * half, by + py * half);
  ctx.lineTo(bx - px * half, by - py * half);
  ctx.closePath();
  ctx.fill();
}

function drawEdge(ctx, g, theme) {
  const stroke = g.color ? rgba(g.color, 1) : theme.edge;
  ctx.strokeStyle = stroke; ctx.fillStyle = stroke; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(g.p0[0], g.p0[1]);
  ctx.bezierCurveTo(g.p1[0], g.p1[1], g.p2[0], g.p2[1], g.p3[0], g.p3[1]);
  ctx.stroke();
  if (g.arrowTo) drawArrow(ctx, g.p3, [-SIDE[g.ts][0], -SIDE[g.ts][1]]);
  if (g.arrowFrom) drawArrow(ctx, g.p0, [-SIDE[g.fs][0], -SIDE[g.fs][1]]);
}

function drawEdgeLabel(ctx, text, pos, env) {
  const { theme, fonts } = env;
  ctx.font = `400 14px ${fonts.text}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const w = Math.min(ctx.measureText(text).width, 300) + 16, h = 24;
  rr(ctx, pos.x - w / 2, pos.y - h / 2, w, h, 6);
  ctx.fillStyle = theme.card; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = pos.color ? rgba(pos.color, 1) : theme.border; ctx.stroke();
  ctx.fillStyle = theme.text;
  ctx.fillText(fitText(ctx, text, 300), pos.x - w / 2 + 8, pos.y);
}

function drawCard(ctx, n, color, env) {
  rr(ctx, n.x, n.y, n.width, n.height, 8);
  ctx.fillStyle = env.theme.card; ctx.fill();
  if (color) { ctx.fillStyle = rgba(color, 0.1); ctx.fill(); }
  ctx.lineWidth = 2; ctx.strokeStyle = color ? rgba(color, 1) : env.theme.border; ctx.stroke();
}

function drawTopLabel(ctx, label, n, env) {
  ctx.font = `400 14px ${env.fonts.text}`; ctx.fillStyle = env.theme.muted;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(fitText(ctx, label, n.width), n.x + 2, n.y - LABEL_H / 2 + 1);
}

function drawGroup(ctx, n, env) {
  const { theme, fonts } = env;
  const c = resolveColor(n.color, theme);
  rr(ctx, n.x, n.y, n.width, n.height, 12);
  ctx.fillStyle = c ? rgba(c, 0.08) : 'rgba(128, 128, 128, 0.07)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = c ? rgba(c, 0.9) : theme.border; ctx.stroke();
  if (n.label) {
    ctx.font = `400 15px ${fonts.text}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const w = Math.min(ctx.measureText(n.label).width + 16, Math.max(40, n.width));
    rr(ctx, n.x, n.y - LABEL_H, w, 22, 6);
    ctx.fillStyle = c ? rgba(c, 0.2) : 'rgba(128, 128, 128, 0.2)'; ctx.fill();
    ctx.fillStyle = theme.text;
    ctx.fillText(fitText(ctx, n.label, w - 16), n.x + 8, n.y - LABEL_H + 12);
  }
}

function drawPlaceholder(ctx, n, lines, env) {
  ctx.font = `400 15px ${env.fonts.text}`; ctx.fillStyle = env.theme.muted;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lh = 22, top = n.y + n.height / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((t, i) => ctx.fillText(fitText(ctx, t, n.width - 20), n.x + n.width / 2, top + i * lh));
  ctx.textAlign = 'left';
}

function drawNode(ctx, n, res, env) {
  const { theme, fonts } = env;
  const color = resolveColor(n.color, theme);
  const pad = 14;

  if (n.type === 'text') {
    drawCard(ctx, n, color, env);
    ctx.save(); rr(ctx, n.x + 2, n.y + 2, n.width - 4, n.height - 4, 6); ctx.clip();
    drawMarkdown(ctx, stripFrontmatter(String(n.text || '')), n.x + pad, n.y + pad, n.width - pad * 2, n.y + n.height, env);
    ctx.restore();
    return;
  }

  if (n.type === 'link') {
    drawTopLabel(ctx, 'Link', n, env);
    drawCard(ctx, n, color, env);
    ctx.save(); rr(ctx, n.x + 2, n.y + 2, n.width - 4, n.height - 4, 6); ctx.clip();
    const lines = wrapRuns(ctx, [{ text: String(n.url || ''), l: true }], n.width - pad * 2, 16, false, fonts);
    lines.forEach((l, i) => drawLine(ctx, l, n.x + pad, n.y + pad + i * 24, 24, 16, false, theme.text, env));
    ctx.restore();
    return;
  }

  if (n.type === 'file') {
    const name = String(n.file || '').split('/').pop().replace(/\.md$/i, '') + (n.subpath ? ' ' + n.subpath : '');
    if (!env.hideFilenames) drawTopLabel(ctx, name, n, env);
    const r = res.get(n.id) || { kind: 'missing' };

    if (r.kind === 'image' || r.kind === 'video') {
      ctx.save(); rr(ctx, n.x, n.y, n.width, n.height, 8); ctx.clip();
      if (r.kind === 'video') { ctx.fillStyle = '#000'; ctx.fillRect(n.x, n.y, n.width, n.height); }
      const iw = r.img.naturalWidth || r.img.width || n.width, ih = r.img.naturalHeight || r.img.height || n.height;
      const s = Math.min(n.width / iw, n.height / ih);
      ctx.drawImage(r.img, n.x + (n.width - iw * s) / 2, n.y + (n.height - ih * s) / 2, iw * s, ih * s);
      ctx.restore();
      if (color) { rr(ctx, n.x, n.y, n.width, n.height, 8); ctx.lineWidth = 2; ctx.strokeStyle = rgba(color, 1); ctx.stroke(); }
      return;
    }

    drawCard(ctx, n, color, env);
    ctx.save(); rr(ctx, n.x + 2, n.y + 2, n.width - 4, n.height - 4, 6); ctx.clip();
    if (r.kind === 'md') drawMarkdown(ctx, r.text, n.x + pad, n.y + pad, n.width - pad * 2, n.y + n.height, env);
    else if (r.kind === 'other') drawPlaceholder(ctx, n, [String(n.file || '').split('/').pop(), r.note || r.ext.toUpperCase() + ' file'], env);
    else drawPlaceholder(ctx, n, ['File not found', String(n.file || '')], env);
    ctx.restore();
  }
}

/ TILES TO JPG /

function buildScene(data, theme, hideFilenames) {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const box = (n) => [n.x - 4, n.y - (nodeHasLabel(n, hideFilenames) ? LABEL_H : 0) - 4, n.x + n.width + 4, n.y + n.height + 4];

  const groups = data.nodes.filter((n) => n.type === 'group')
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .map((n) => ({ n, box: box(n) }));
  const nodes = data.nodes.filter((n) => n.type !== 'group').map((n) => ({ n, box: box(n) }));

  const edges = [], labels = [];
  for (const e of data.edges) {
    const a = byId.get(e.fromNode), b = byId.get(e.toNode);
    if (!a || !b) continue;
    const g = edgeGeometry(e, a, b, theme);
    const xs = [g.p0[0], g.p1[0], g.p2[0], g.p3[0]], ys = [g.p0[1], g.p1[1], g.p2[1], g.p3[1]];
    edges.push({ g, box: [Math.min(...xs) - 20, Math.min(...ys) - 20, Math.max(...xs) + 20, Math.max(...ys) + 20] });
    if (e.label) labels.push({ text: String(e.label), pos: { x: g.mid[0], y: g.mid[1], color: g.color }, box: [g.mid[0] - 170, g.mid[1] - 16, g.mid[0] + 170, g.mid[1] + 16] });
  }
  return { groups, nodes, edges, labels };
}

const boxHit = (b, v) => b[0] < v[2] && b[2] > v[0] && b[1] < v[3] && b[3] > v[1];

function renderTile(ctx, cw, ch, scene, res, env, world, scale, bx, by) {
  const { theme } = env;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.opaque; ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, cw, ch);

  ctx.setTransform(scale, 0, 0, scale, -world.minX * scale - bx, -world.minY * scale - by);
  ctx.textAlign = 'left';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const view = [world.minX + bx / scale, world.minY + by / scale, world.minX + (bx + cw) / scale, world.minY + (by + ch) / scale];
  const guarded = (fn) => { ctx.save(); try { fn(); } catch (err) { console.warn('MM Canvas Export: draw error', err); } finally { ctx.restore(); } };

  for (const g of scene.groups) if (boxHit(g.box, view)) guarded(() => drawGroup(ctx, g.n, env));
  for (const e of scene.edges) if (boxHit(e.box, view)) guarded(() => drawEdge(ctx, e.g, theme));
  for (const n of scene.nodes) if (boxHit(n.box, view)) guarded(() => drawNode(ctx, n.n, res, env));
  for (const l of scene.labels) if (boxHit(l.box, view)) guarded(() => drawEdgeLabel(ctx, l.text, l.pos, env));
}

async function renderToJpeg(data, res, theme, world, size, quality, onProgress, hideFilenames = false) {
  const { w, h, scale } = size;
  const env = { theme, fonts: theme.fonts, hideFilenames };
  const scene = buildScene(data, theme, hideFilenames);

  const cw = Math.min(TILE_W, w), ch = Math.min(BAND_H, h);
  const tile = document.createElement('canvas');
  tile.width = cw; tile.height = ch;
  const ctx = tile.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create a 2D drawing context.');

  const enc = new JpegStreamEncoder(w, h, quality);
  const band = new Uint8ClampedArray(w * ch * 4);

  for (let by = 0; by < h; by += BAND_H) {
    const bh = Math.min(BAND_H, h - by);
    for (let bx = 0; bx < w; bx += TILE_W) {
      const tw = Math.min(TILE_W, w - bx);
      renderTile(ctx, cw, ch, scene, res, env, world, scale, bx, by);
      const img = ctx.getImageData(0, 0, tw, bh);
      if (img.data[3] !== 255) throw new Error('The drawing surface returned empty pixels (canvas not available).');
      for (let r = 0; r < bh; r++) band.set(img.data.subarray(r * tw * 4, (r + 1) * tw * 4), (r * w + bx) * 4);
    }
    enc.addRows(band, bh);
    onProgress && onProgress(Math.min(1, (by + bh) / h));
    await new Promise((r) => setTimeout(r, 0)); // keep Obsidian responsive
  }
  tile.width = tile.height = 0;
  return new Blob(enc.finish(), { type: 'image/jpeg' });
}

/ RESOURCES /

function stripFrontmatter(t) {
  return t.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function prepareNote(text, subpath) {
  text = stripFrontmatter(text);
  const name = (subpath || '').split('#').filter(Boolean).pop();
  if (!name || name.startsWith('^')) return text;
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => {
    const m = /^(#{1,6})\s+(.*)$/.exec(l);
    return m && m[2].trim().toLowerCase() === name.trim().toLowerCase();
  });
  if (start < 0) return text;
  const level = /^(#+)/.exec(lines[start])[1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i]);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = url;
  });
}

function waitFor(el, evt, ms) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); el.removeEventListener(evt, ok); el.removeEventListener('error', bad); };
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('Media error')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timed out')); }, ms);
    el.addEventListener(evt, ok);
    el.addEventListener('error', bad);
  });
}

async function captureVideoFrame(url) {
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.playsInline = true;
  try {
    const loaded = waitFor(v, 'loadeddata', 20000);
    v.src = url;
    await loaded;
    const dur = v.duration;
    const t = isFinite(dur) && dur > 0 ? Math.min(0.1, dur / 2) : 0; // just past 0 so a frame is decoded
    if (t > 0) { const seeked = waitFor(v, 'seeked', 20000); v.currentTime = t; await seeked; }
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) throw new Error('No video track');
    const k = Math.min(1, 3840 / Math.max(vw, vh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(vw * k)); c.height = Math.max(1, Math.round(vh * k));
    const cctx = c.getContext('2d');
    cctx.drawImage(v, 0, 0, c.width, c.height);
    cctx.getImageData(0, 0, 1, 1); // throws if the frame came from a cross-origin source (tainted canvas)
    return c;
  } finally {
    v.removeAttribute('src');
    try { v.load(); } catch (e) { /* ignore */ }
  }
}

async function loadVideo(app, f, ext, urls) {
  try { return { kind: 'video', img: await captureVideoFrame(app.vault.getResourcePath(f)) }; } catch (err) {
    console.warn('MM Canvas Export: direct video load failed, trying blob fallback', f.path, err);
  }
  const note = 'Video (preview unavailable)';
  if (f.stat && f.stat.size > MAX_VIDEO_BYTES) return { kind: 'other', ext, note: 'Video (too large to preview)' };
  try {
    const url = URL.createObjectURL(new Blob([await app.vault.readBinary(f)], { type: MIME[ext] }));
    urls.push(url);
    return { kind: 'video', img: await captureVideoFrame(url) };
  } catch (err) {
    console.warn('MM Canvas Export: could not read video frame', f.path, err);
    return { kind: 'other', ext, note };
  }
}

async function loadResources(app, data) {
  const map = new Map();
  const urls = [];
  await Promise.all(data.nodes.filter((n) => n.type === 'file').map(async (n) => {
    const f = app.vault.getAbstractFileByPath(normalizePath(String(n.file || '')));
    if (!(f instanceof TFile)) { map.set(n.id, { kind: 'missing' }); return; }
    const ext = f.extension.toLowerCase();
    try {
      if (ext === 'md') {
        map.set(n.id, { kind: 'md', text: prepareNote(await app.vault.cachedRead(f), n.subpath) });
      } else if (IMAGE_EXT.includes(ext)) {
        // Blob URLs are same-origin, so the canvas never becomes "tainted" and can still be read back.
        const url = URL.createObjectURL(new Blob([await app.vault.readBinary(f)], { type: MIME[ext] }));
        urls.push(url);
        map.set(n.id, { kind: 'image', img: await loadImage(url) });
      } else if (VIDEO_EXT.includes(ext)) {
        map.set(n.id, await loadVideo(app, f, ext, urls));
      } else {
        map.set(n.id, { kind: 'other', ext });
      }
    } catch (err) {
      console.warn('MM Canvas Export: could not load', n.file, err);
      map.set(n.id, { kind: 'other', ext });
    }
  }));
  return { map, urls };
}

/ EXPORT PATH /

function getElectronDialog() {
  const attempts = [
    () => window.require('electron').remote.dialog,
    () => window.require('@electron/remote').dialog,
    () => window.electron.remote.dialog,
  ];
  for (const get of attempts) {
    try { const d = get(); if (d && typeof d.showOpenDialog === 'function') return d; } catch (e) { /* try next */ }
  }
  return null;
}

async function pickDiskFolder(startDir) {
  const dialog = getElectronDialog();
  if (dialog) {
    const r = await dialog.showOpenDialog({
      title: 'Choose export folder',
      defaultPath: startDir || undefined,
      buttonLabel: 'Export',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths || !r.filePaths.length) return null;
    return { kind: 'disk', dir: r.filePaths[0] };
  }
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      return { kind: 'handle', handle: await window.showDirectoryPicker({ mode: 'readwrite' }) };
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
    }
  }
  return undefined;
}

async function saveToDestination(app, dest, baseName, buf) {
  if (dest.kind === 'disk') {
    const fs = window.require('fs'), path = window.require('path');
    let full = path.join(dest.dir, `${baseName}.jpg`);
    for (let i = 1; fs.existsSync(full); i++) full = path.join(dest.dir, `${baseName} ${i}.jpg`);
    await fs.promises.writeFile(full, new Uint8Array(buf));
    return full;
  }
  if (dest.kind === 'handle') {
    const exists = async (n) => { try { await dest.handle.getFileHandle(n); return true; } catch (e) { return false; } };
    let name = `${baseName}.jpg`;
    for (let i = 1; await exists(name); i++) name = `${baseName} ${i}.jpg`;
    const fh = await dest.handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(buf);
    await w.close();
    return `${dest.handle.name}/${name}`;
  }
  // 'vault' (fallback only)
  const dir = dest.folder.path === '/' ? '' : dest.folder.path + '/';
  let path = normalizePath(`${dir}${baseName}.jpg`);
  for (let i = 1; app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${dir}${baseName} ${i}.jpg`);
  await app.vault.createBinary(path, buf);
  return path + ' (in your vault)';
}

/ FALLBACK /

function orderFolders(folders, preferredPaths) {
  const byPath = new Map(folders.map((f) => [f.path, f]));
  const first = [];
  for (const p of preferredPaths) {
    const f = p && byPath.get(p);
    if (f && !first.includes(f)) first.push(f);
  }
  const rest = folders.filter((f) => !first.includes(f)).sort((a, b) => a.path.localeCompare(b.path));
  return first.concat(rest);
}

class FolderPickerModal extends FuzzySuggestModal {
  constructor(app, folders, done) {
    super(app);
    this.folders = folders;
    this.done = done;
    this.settled = false;
    this.setPlaceholder('Choose export folder');
  }

  getItems() { return this.folders; }
  getItemText(folder) { return folder.path === '/' ? '/ (vault root)' : folder.path; }
  onChooseItem(folder) { this.finish(folder); }

  onClose() {
    super.onClose();
    setTimeout(() => this.finish(null), 0);
  }

  finish(value) {
    if (this.settled) return;
    this.settled = true;
    this.done(value);
  }
}

/ EXPORT /

class ExportModal extends Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.s = Object.assign({}, plugin.settings);
    this.data = null;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mm-canvas-export-modal');
    contentEl.createEl('h2', { text: 'Export canvas as image file' });
    contentEl.createEl('p', { text: this.file.path, cls: 'mm-canvas-export-path' });

    this.data = await this.plugin.loadCanvasData(this.file);
    if (!this.data || !computeWorld(this.data, 0)) {
      contentEl.createEl('p', { text: this.data ? 'This canvas is empty — nothing to export.' : 'Could not read this canvas file.', cls: 'mm-canvas-export-error' });
      return;
    }

    const sizeSetting = new Setting(contentEl).setName('Image resolution');
    const showSize = (v) => sizeSetting.setName(`ㅤImage resolution: ${v / 1000} 000 px`);
    showSize(this.s.longestSide);
    sizeSetting.addSlider((sl) => sl
      .setLimits(MIN_DIMENSION, MAX_DIMENSION, DIMENSION_STEP)
      .setValue(this.s.longestSide)
      .onChange((v) => { this.s.longestSide = v; showSize(v); }));

    new Setting(contentEl)
      .setName('ㅤMargin')
      .addText((t) => {
        t.inputEl.type = 'number';
        t.inputEl.addClass('mm-canvas-export-num');
        t.setValue(String(this.s.padding)).onChange((v) => {
          const n = parseInt(v, 10);
          this.s.padding = isFinite(n) ? clamp(n, 0, 2000) : 0;
        });
      });

    new Setting(contentEl)
      .setName('ㅤAppearance')
      .addDropdown((d) => d
        .addOption('obsidian', 'Current theme')
        .addOption('light', 'Light')
        .addOption('dark', 'Dark')
        .setValue(this.s.theme)
        .onChange((v) => { this.s.theme = v; }));

    new Setting(contentEl)
      .setName('ㅤHide filenames')
      .addToggle((t) => t.setValue(this.s.hideFilenames !== false).onChange((v) => { this.s.hideFilenames = v; }));

    new Setting(contentEl)
      .addButton((b) => {
        this.exportBtn = b;
        b.setButtonText('Export image').setCta().onClick(() => this.doExport());
      })
      .addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()));
  }

  async doExport() {
    this.exportBtn.setDisabled(true);
    const dest = await this.plugin.pickDestination(this.file);
    if (!dest) { this.exportBtn.setDisabled(false); return; } // cancelled: stay in the dialog
    this.exportBtn.setButtonText('Exporting…');
    if (dest.kind === 'disk') this.s.exportDir = dest.dir; // reopen the picker here next time
    this.plugin.settings = Object.assign({}, this.s);
    await this.plugin.saveSettings();
    const ok = await this.plugin.exportCanvas(this.file, this.data, this.s, dest);
    if (ok) this.close();
    else this.exportBtn.setDisabled(false).setButtonText('Export image');
  }

  onClose() { this.contentEl.empty(); }
}

/ PLUGIN /

module.exports = class MMCanvasExport extends Plugin {
  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'export-canvas-jpg',
      name: 'Export as image file',
      checkCallback: (checking) => {
        const file = this.getActiveCanvasFile();
        if (!file) return false;
        if (!checking) this.openDialog(file);
        return true;
      },
    });

    this.addRibbonIcon('image-down', 'MM Canvas Export: export as image file', () => {
      const file = this.getActiveCanvasFile();
      if (file) this.openDialog(file); else new Notice('Open a canvas first.');
    });

    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && file.extension === 'canvas') {
        menu.addItem((item) => item.setTitle('Export as image file').setIcon('image-down').onClick(() => this.openDialog(file)));
      }
    }));
  }

  async loadSettings() {
    const saved = (await this.loadData()) || {};
    const settings = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) settings[key] = saved[key] !== undefined ? saved[key] : DEFAULT_SETTINGS[key];
    const steps = Math.round((parseInt(settings.longestSide, 10) || DEFAULT_SETTINGS.longestSide) / DIMENSION_STEP);
    settings.longestSide = clamp(steps * DIMENSION_STEP, MIN_DIMENSION, MAX_DIMENSION);
    settings.hideFilenames = settings.hideFilenames !== false; // on unless explicitly switched off
    this.settings = settings;
  }

  async saveSettings() { await this.saveData(this.settings); }

  getActiveCanvasFile() {
    const view = this.app.workspace.getActiveViewOfType(ItemView);
    return view && view.getViewType() === 'canvas' && view.file instanceof TFile ? view.file : null;
  }

  openDialog(file) { new ExportModal(this.app, this, file).open(); }

  async pickDestination(file) {
    const disk = await pickDiskFolder(this.settings.exportDir);
    if (disk === null) return null;
    if (disk) return disk;
    new Notice('Folder browsing is not available on this device, so pick a folder inside your vault instead.', 6000);
    const folders = this.app.vault.getAllLoadedFiles().filter((f) => f instanceof TFolder);
    const ordered = orderFolders(folders, [file.parent && file.parent.path]);
    const folder = await new Promise((resolve) => new FolderPickerModal(this.app, ordered, resolve).open());
    return folder ? { kind: 'vault', folder } : null;
  }

  async loadCanvasData(file) {
    try {
      const leaf = this.app.workspace.getLeavesOfType('canvas').find((l) => l.view && l.view.file && l.view.file.path === file.path);
      let raw = leaf && typeof leaf.view.getViewData === 'function' ? leaf.view.getViewData() : null;
      if (!raw) raw = await this.app.vault.read(file);
      return sanitizeCanvas(JSON.parse(raw));
    } catch (err) {
      console.error('MM Canvas Export: cannot read canvas', err);
      return null;
    }
  }

  async exportCanvas(file, data, s, dest) {
    const notice = new Notice('MM Canvas Export: Loading images and videos', 0);
    let urls = [];
    try {
      const world = computeWorld(data, s.padding, s.hideFilenames);
      if (!world) throw new Error('The canvas is empty.');

      const loaded = await loadResources(this.app, data);
      urls = loaded.urls;
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const theme = getTheme(s.theme);

      const size = outputSize(world, clamp(s.longestSide, MIN_DIMENSION, MAX_DIMENSION));
      const blob = await renderToJpeg(data, loaded.map, theme, world, size, JPEG_QUALITY,
        (p) => notice.setMessage(`MM Canvas Export: Rendering ${Math.round(p * 100)}%`), s.hideFilenames);

      const buf = await blob.arrayBuffer();
      const where = await saveToDestination(this.app, dest, file.basename, buf);

      notice.hide();
      new Notice(`Exported to ${where}`, 8000);
      return true;
    } catch (err) {
      console.error('MM Canvas Export failed', err);
      notice.hide();
      new Notice('MM Canvas Export failed: ' + (err && err.message ? err.message : err), 8000);
      return false;
    } finally {
      urls.forEach((u) => URL.revokeObjectURL(u));
    }
  }
};
