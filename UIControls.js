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
  const asciiWidth = parseInt(readSingleParam('asciiWidth'), 10) || 200;
  const edge = readSingleParam('edge') || 'none';
  const charset = readSingleParam('charset') || 'detailed';

  // Animated values (start/end pairs)
  const brightness = readParamPair('brightness');
  const contrast = readParamPair('contrast');

  const frames = parseInt(document.getElementById('numFrames').value, 10) || 30;
  const fps = parseInt(document.getElementById('fps').value, 10) || 12;

  // Color settings
  const bgColor = readSingleParam('bgColor') || '#0a0a0a';
  const fgColor = readSingleParam('fgColor') || '#00ff00';

  return {
    asciiWidth,
    brightness,
    contrast,
    edge,
    charset,
    frames,
    fps,
    bgColor,
    fgColor
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
      brightness: brightnessVal,
      contrast: contrastVal,
      charset: paramSet.charset,
      edgeMethod: paramSet.edge
    };
  };
}
