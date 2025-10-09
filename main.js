// main.js
import { renderAsciiFrame } from './asciiRenderer.js';
import { readAllParams, makeInterpolator } from './uiControls.js';
import { AnimationEngine } from './animationEngine.js';
import { exportAsGif, exportAsWebM } from './exporter.js';

// DOM
const uploadEl = document.getElementById('upload');
const dropZone = document.getElementById('dropZone');
const generateBtn = document.getElementById('generateBtn');
const playBtn = document.getElementById('playBtn');
const exportGifBtn = document.getElementById('exportGifBtn');
const exportWebmBtn = document.getElementById('exportWebmBtn');
const previewCanvas = document.getElementById('previewCanvas');
const asciiOutput = document.getElementById('asciiOutput');
const progressEl = document.getElementById('renderProgress');

let currentImage = null;
let engine = null;

// Small helper to create ImageBitmap from file for better performance
async function loadImageFile(file) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.crossOrigin = "Anonymous";
  await new Promise((resolve) => { img.onload = resolve; img.src = dataUrl; });
  return img;
}

// Drag & drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('drag'); });
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault(); dropZone.classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) {
    currentImage = await loadImageFile(file);
    // auto-generate a quick preview single frame
    await singleRenderPreview(currentImage);
  }
});

uploadEl.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  currentImage = await loadImageFile(file);
  await singleRenderPreview(currentImage);
});

// Single-frame preview using current UI values (start state)
async function singleRenderPreview(img) {
  const params = readAllParams();
  // pick start values for immediate preview
  const startParams = {
    image: img,
    asciiWidth: parseInt(params.asciiWidth.start, 10) || 120,
    brightness: parseFloat(params.brightness.start) || 0,
    contrast: parseFloat(params.contrast.start) || 0,
    blur: 0,
    dithering: true,
    ditherAlgorithm: 'floyd',
    invert: false,
    ignoreWhite: true,
    charset: params.charset.start,
    manualChar: '0',
    edgeMethod: params.edge.start,
    edgeThreshold: 100,
    dogThreshold: 100,
    zoomPercent: params.zoom.start
  };
  const { ascii, canvas } = await renderAsciiFrame(startParams);
  asciiOutput.textContent = ascii;
  fitCanvasPreview(canvas);
}

// Fit small canvas to previewCanvas
function fitCanvasPreview(smallCanvas) {
  if (!smallCanvas) return;
  previewCanvas.width = Math.max(320, smallCanvas.width * 4);
  previewCanvas.height = Math.max(240, smallCanvas.height * 4);
  const ctx = previewCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000"; ctx.fillRect(0,0,previewCanvas.width, previewCanvas.height);
  ctx.drawImage(smallCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
}

// Generate frames and prepare engine
generateBtn.addEventListener('click', async () => {
  if (!currentImage) {
    alert('Please upload an image first.');
    return;
  }
  // read params
  const params = readAllParams();
  const frames = params.frames;
  // build interpolator
  const interp = makeInterpolator(params);

  // create engine if needed
  engine = new AnimationEngine(renderAsciiFrame, {
    previewCanvas,
    asciiOutput,
    onProgress: (p) => { progressEl.value = p; },
    onFrameGenerated: (i, frame) => {
      // draw the first frame to preview for immediate feedback
      if (i === 0) engine.drawFrameToPreview(0);
    },
    onComplete: (frames) => {
      progressEl.value = 100;
      alert('Frame generation complete. Use Play to preview or Export to save.');
    }
  });

  // generate frames
  progressEl.value = 0;
  await engine.generateFrames(currentImage, frames, (i, total) => interp(i, total));
  progressEl.value = 100;
});

// Play / Pause
playBtn.addEventListener('click', () => {
  if (!engine || !engine.frames || engine.frames.length === 0) { alert('Generate frames first.'); return; }
  if (engine.isPlaying) { engine.pause(); playBtn.textContent = 'Play'; }
  else { engine.play(parseInt(document.getElementById('fps').value, 10) || 12); playBtn.textContent = 'Pause'; }
});

// Export GIF
exportGifBtn.addEventListener('click', async () => {
  if (!engine || !engine.frames || engine.frames.length === 0) { alert('Generate frames first.'); return; }
  try {
    exportGifBtn.disabled = true;
    exportGifBtn.textContent = 'Encoding...';
    const res = await exportAsGif(engine.frames, {
      fps: parseInt(document.getElementById('fps').value, 10) || 12,
      onProgress: (p) => { progressEl.value = Math.round(p*100); }
    });
    const a = document.createElement('a');
    a.href = res.url;
    a.download = 'ascii_animation.gif';
    a.click();
  } catch (err) {
    console.error(err);
    alert('GIF export failed: ' + err.message);
  } finally {
    exportGifBtn.disabled = false;
    exportGifBtn.textContent = 'Export GIF';
  }
});

// Export WebM via MediaRecorder
exportWebmBtn.addEventListener('click', async () => {
  if (!engine || !engine.frames || engine.frames.length === 0) { alert('Generate frames first.'); return; }
  try {
    exportWebmBtn.disabled = true;
    exportWebmBtn.textContent = 'Recording...';
    const { blob, url } = await exportAsWebM(engine.frames, {
      fps: parseInt(document.getElementById('fps').value, 10) || 12,
      onProgress: (p) => { progressEl.value = Math.round(p*100); }
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ascii_animation.webm';
    a.click();
    alert('WebM exported. Convert to MP4 with ffmpeg if needed (see README).');
  } catch (err) {
    console.error(err);
    alert('WebM export failed: ' + err.message);
  } finally {
    exportWebmBtn.disabled = false;
    exportWebmBtn.textContent = 'Export WebM';
  }
});

// Boot: optionally load a default image (same as your original approach)
window.addEventListener('load', async () => {
  try {
    const defaultUrl = "https://i.ibb.co/chHSSFQk/horse.png";
    const img = new Image();
    img.crossOrigin = "Anonymous";
    await new Promise((res) => { img.onload = res; img.src = defaultUrl; });
    currentImage = img;
    await singleRenderPreview(currentImage);
  } catch (err) {
    console.warn('Default image load failed:', err);
  }
});
