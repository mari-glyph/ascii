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

export function readSelectPair(name) {
  const s = document.getElementById(`start_${name}`);
  const e = document.getElementById(`end_${name}`);
  return { start: s?.value, end: e?.value };
}

// Read whole parameter set from UI
export function readAllParams() {
  const asciiWidth = readParamPair('asciiWidth');
  const brightness = readParamPair('brightness');
  const contrast = readParamPair('contrast');
  const zoom = readParamPair('zoom');
  const edge = readSelectPair('edge');
  const charset = readSelectPair('charset');

  const frames = parseInt(document.getElementById('numFrames').value, 10) || 30;
  const fps = parseInt(document.getElementById('fps').value, 10) || 12;

  return {
    asciiWidth,
    brightness,
    contrast,
    zoom,
    edge,
    charset,
    frames,
    fps
  };
}

// Given param pair that might be non-numeric (like charset), produce a
// function that returns interpolated value for frame t in [0,1].
// For discrete params like charset/edge, we will snap at 0.5 threshold.
export function makeInterpolator(paramSet) {
  // paramSet has shapes: e.g. brightness: {start, end}, charset: {start, end}
  return function interp(frameIdx, totalFrames) {
    const t = totalFrames <= 1 ? 0 : frameIdx / (totalFrames - 1);
    function lerp(a, b) { return a + (b - a) * t; }
    // Numeric
    const asciiWidthVal = Math.round(lerp(paramSet.asciiWidth.start, paramSet.asciiWidth.end));
    const brightnessVal = lerp(paramSet.brightness.start, paramSet.brightness.end);
    const contrastVal = lerp(paramSet.contrast.start, paramSet.contrast.end);
    const zoomVal = lerp(paramSet.zoom.start, paramSet.zoom.end);

    // Discrete: choose start or end based on t threshold. You can change strategy here.
    const charsetVal = t < 0.5 ? paramSet.charset.start : paramSet.charset.end;
    const edgeVal = t < 0.5 ? paramSet.edge.start : paramSet.edge.end;

    return {
      asciiWidth: asciiWidthVal,
      brightness: brightnessVal,
      contrast: contrastVal,
      zoomPercent: zoomVal,
      charset: charsetVal,
      edgeMethod: edgeVal
    };
  };
}
