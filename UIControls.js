// uiControls.js
// Exports utility functions to read UI parameter pairs (start/end) and produce
// interpolation-compatible param objects.

export function readParamPair(prefix) {
  // expects controls like start_brightness and end_brightness
  const startEl = document.getElementById(`start_${prefix}`);
  const endEl = document.getElementById(`end_${prefix}`);
  return {
    start: parseFloat(startEl?.value ?? 0),
    end: parseFloat(endEl?.value ?? 0)
  };
}

export function readSingleParam(id) {
  const el = document.getElementById(id);
  return el?.value ?? '';
}

// Read whole parameter set from UI
export function readAllParams() {
  // Single values (same for start/end)
  const baseAsciiWidth = parseInt(readSingleParam('scale'), 10) || 120;
  // Detail controls pixel block size (1 = no blocking, higher = larger blocks)
  const blockSize = parseInt(readSingleParam('detail'), 10) || 1;

  // Char size controls how many pixels each ASCII character represents
  // Higher value = fewer characters = each char maps to larger image area
  // Range 1-100: 1 = many chars (fine detail), 100 = few chars (coarse)
  const charSize = parseInt(readSingleParam('charSize'), 10) || 3;
  // Calculate effective ASCII width: higher charSize = fewer columns
  // charSize 1 = full baseAsciiWidth, charSize 100 = baseAsciiWidth / 10
  const charSizeScale = 1 + (charSize - 1) * 0.1; // 1 to 10.9
  const asciiWidth = Math.max(10, Math.round(baseAsciiWidth / charSizeScale));

  const edge = readSingleParam('edge') || 'none';
  const charset = readSingleParam('charset') || 'dense';
  const manualCharset = readSingleParam('manualCharset') || '@#%*+=-:. ';

  // Animated values (start/end pairs)
  const brightness = readParamPair('brightness');
  const contrast = readParamPair('contrast');

  const frames = parseInt(document.getElementById('numFrames').value, 10) || 30;
  const fps = parseInt(document.getElementById('fps').value, 10) || 12;

  // Color settings
  const bgColor = readSingleParam('bgColor') || '#0a0a0a';
  const fgColor = readSingleParam('fgColor') || '#00ff00';

  // Font settings
  const fontFamily = readSingleParam('fontFamily') || "'Courier New', monospace";

  return {
    asciiWidth,
    baseAsciiWidth,
    charSize,
    blockSize,
    brightness,
    contrast,
    edge,
    charset,
    manualCharset,
    frames,
    fps,
    bgColor,
    fgColor,
    fontFamily
  };
}

// Given param set, produce a function that returns interpolated value for frame t in [0,1].
export function makeInterpolator(paramSet) {
  return function interp(frameIdx, totalFrames) {
    const t = totalFrames <= 1 ? 0 : frameIdx / (totalFrames - 1);
    function lerp(a, b) { return a + (b - a) * t; }

    // Numeric animated values
    const brightnessVal = lerp(paramSet.brightness.start, paramSet.brightness.end);
    const contrastVal = lerp(paramSet.contrast.start, paramSet.contrast.end);

    return {
      asciiWidth: paramSet.asciiWidth,
      blockSize: paramSet.blockSize,
      brightness: brightnessVal,
      contrast: contrastVal,
      charset: paramSet.charset,
      manualCharset: paramSet.manualCharset,
      edgeMethod: paramSet.edge
    };
  };
}
