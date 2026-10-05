// color.js
// Gradient stops interpolate in OKLab, so mid-tones stay even instead of going muddy.

const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

export function parseHex(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const toHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLinear = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab([r, g, b]) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

// stops: [{ at: 0..1, color: '#rrggbb' }] in any order.
export function sampleStops(stops, t) {
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  if (!sorted.length) return '#2a2a2a';
  if (t <= sorted[0].at) return sorted[0].color;
  const last = sorted[sorted.length - 1];
  if (t >= last.at) return last.color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (t >= a.at && t <= b.at) {
      const k = b.at === a.at ? 0 : (t - a.at) / (b.at - a.at);
      const A = rgbToOklab(parseHex(a.color)), B = rgbToOklab(parseHex(b.color));
      return toHex(oklabToRgb(A.map((v, i2) => v + (B[i2] - v) * k)));
    }
  }
  return last.color;
}

export function cssGradient(stops) {
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  // Sample densely so the CSS preview matches the OKLab interpolation used in the render.
  const n = 16;
  const parts = [];
  for (let i = 0; i <= n; i++) parts.push(`${sampleStops(sorted, i / n)} ${(i / n) * 100}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}
