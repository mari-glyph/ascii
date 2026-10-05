// render.js
// Image → ASCII. Refactored from "Monospace" by Mikhail Bespalov
// (https://codepen.io/Mikhail-Bespalov/pen/JoPqYrz).
//
// renderAsciiFrame(image, options) → { ascii, canvas }
//   image        HTMLImageElement | HTMLCanvasElement | ImageBitmap
//   asciiWidth   columns
//   blockSize    pixelation block (1 = none)
//   brightness   −255..255, contrast −255..255
//   charset      dense | standard | blocks | binary | hex | manual (+ manualCharset)
//   dither       none | floyd | atkinson | noise | ordered
//   edgeMethod   none | sobel | dog
//   invert, ignoreWhite, edgeThreshold, dogThreshold, fontAspectRatio

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const CHARSETS = {
  dense: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^'. ",
  standard: '@%#*+=-:. ',
  blocks: '█▓▒░ ',
  binary: '01',
  hex: '0123456789ABCDEF',
};

// Error-diffusion kernels: [dx, dy, weight].
const KERNELS = {
  floyd: [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]],
  atkinson: [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]],
};
const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

function drawScaled(image, w, h, blockSize) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (blockSize > 1) {
    // Pixelate: shrink, then scale back up with nearest-neighbour.
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.ceil(w / blockSize));
    small.height = Math.max(1, Math.ceil(h / blockSize));
    small.getContext('2d').drawImage(image, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, w, h);
  } else {
    ctx.drawImage(image, 0, 0, w, h);
  }
  return canvas;
}

function grayscale(data, { brightness, contrast, invert }) {
  const k = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const gray = new Float32Array(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    let lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (invert) lum = 255 - lum;
    gray[j] = clamp(k * (lum - 128) + 128 + brightness, 0, 255);
  }
  return gray;
}

// ── edge paths ─────────────────────────────────────────────────────────────

function sobel(gray, w, h) {
  const mag = new Float32Array(w * h), angle = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const g = (dx, dy) => gray[(y + dy) * w + x + dx];
      const gx = -g(-1, -1) + g(1, -1) - 2 * g(-1, 0) + 2 * g(1, 0) - g(-1, 1) + g(1, 1);
      const gy = -g(-1, -1) - 2 * g(0, -1) - g(1, -1) + g(-1, 1) + 2 * g(0, 1) + g(1, 1);
      mag[y * w + x] = Math.hypot(gx, gy);
      let th = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (th < 0) th += 180;
      angle[y * w + x] = th;
    }
  }
  return { mag, angle };
}

function gaussianBlur3(gray, w, h, sigma) {
  const k = [];
  let sum = 0;
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) { const v = Math.exp(-(x * x + y * y) / (2 * sigma * sigma)); k.push(v); sum += v; }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++, n++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && xx < w && yy >= 0 && yy < h) acc += gray[yy * w + xx] * k[n];
        }
      }
      out[y * w + x] = acc / sum;
    }
  }
  return out;
}

// Difference of Gaussians → Sobel → non-max suppression, drawn with orientation characters.
function dogAscii(gray, w, h, threshold) {
  const b1 = gaussianBlur3(gray, w, h, 0.5), b2 = gaussianBlur3(gray, w, h, 1.0);
  const dog = b1.map((v, i) => v - b2[i]);
  const { mag, angle } = sobel(dog, w, h);
  let ascii = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, th = angle[i], m = mag[i];
      let keep = false;
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        let n1, n2;
        if (th < 22.5 || th >= 157.5) { n1 = mag[i - 1]; n2 = mag[i + 1]; }
        else if (th < 67.5) { n1 = mag[i - w + 1]; n2 = mag[i + w - 1]; }
        else if (th < 112.5) { n1 = mag[i - w]; n2 = mag[i + w]; }
        else { n1 = mag[i - w - 1]; n2 = mag[i + w + 1]; }
        keep = m >= n1 && m >= n2 && m > threshold;
      }
      if (!keep) { ascii += ' '; continue; }
      const a = (th + 90) % 180;
      ascii += a < 22.5 || a >= 157.5 ? '-' : a < 67.5 ? '/' : a < 112.5 ? '|' : '\\';
    }
    ascii += '\n';
  }
  return ascii;
}

// ── main ───────────────────────────────────────────────────────────────────

export function renderAsciiFrame(image, options = {}) {
  const {
    asciiWidth = 120, blockSize = 1, brightness = 0, contrast = 0, invert = false, ignoreWhite = true,
    charset = 'dense', manualCharset = '@#%*+=-:. ', dither = 'floyd', edgeMethod = 'none',
    edgeThreshold = 100, dogThreshold = 100, fontAspectRatio = 0.55,
  } = options;

  const w = Math.max(1, Math.round(asciiWidth));
  const h = Math.max(1, Math.round((image.height / image.width) * w * fontAspectRatio));
  const canvas = drawScaled(image, w, h, blockSize);
  const gray = grayscale(canvas.getContext('2d').getImageData(0, 0, w, h).data, { brightness, contrast, invert });

  if (edgeMethod === 'dog') return { ascii: dogAscii(gray, w, h, dogThreshold), canvas };

  const ramp = charset === 'manual' ? (manualCharset || '@#%*+=-:. ') : (CHARSETS[charset] || CHARSETS.dense);
  const levels = ramp.length;
  const white = ignoreWhite ? gray.map((v) => (v === 255 ? 1 : 0)) : null;
  const edges = edgeMethod === 'sobel' ? sobel(gray, w, h).mag : null;
  const work = gray.slice();
  // The sobel path maps tones directly, as the original did (edges would smear under diffusion).
  const mode = edges ? 'none' : dither;
  const kernel = KERNELS[mode];

  let ascii = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (white && white[i]) { ascii += ' '; continue; }
      if (edges && (edges[i] / 1442) * 255 > edgeThreshold) { ascii += '#'; continue; }

      let level;
      if (mode === 'noise') {
        level = Math.round((clamp(work[i] + (Math.random() - 0.5) * (255 / levels), 0, 255) / 255) * (levels - 1));
      } else if (mode === 'ordered') {
        const v = clamp(work[i] / 255 + (BAYER4[y % 4][x % 4] + 0.5) / 16 - 0.5, 0, 1);
        level = Math.min(levels - 1, Math.floor(v * levels));
      } else {
        level = Math.round((work[i] / 255) * (levels - 1));
        if (kernel) {
          const err = work[i] - (level / (levels - 1 || 1)) * 255;
          for (const [dx, dy, wt] of kernel) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && xx < w && yy < h) work[yy * w + xx] = clamp(work[yy * w + xx] + err * wt, 0, 255);
          }
        }
      }
      ascii += ramp.charAt(level);
    }
    ascii += '\n';
  }
  return { ascii, canvas };
}
