// main.js
console.log('ASCII app main module loaded');
import { renderAsciiFrame } from './AsciiRender.js';
import { readAllParams, makeInterpolator } from './UIControls.js';
import { AnimationEngine } from './animationEngine.js';
import { exportAsGif, exportAsWebM, exportAsMp4 } from './exporter.js';

// DOM
const uploadEl = document.getElementById('upload');
const dropZone = document.getElementById('dropZone');
const fileStatus = document.getElementById('fileStatus');
const generateBtn = document.getElementById('generateBtn');
const playBtn = document.getElementById('playBtn');
const exportGifBtn = document.getElementById('exportGifBtn');
const exportWebmBtn = document.getElementById('exportWebmBtn');
const exportMp4Btn = document.getElementById('exportMp4Btn');
const previewCanvas = document.getElementById('previewCanvas');
const asciiOutputStart = document.getElementById('asciiOutputStart');
const asciiOutputEnd = document.getElementById('asciiOutputEnd');
const progressEl = document.getElementById('renderProgress');

// Display settings
const modeTerminal = document.getElementById('modeTerminal');
const modePrint = document.getElementById('modePrint');
const bgColorInput = document.getElementById('bgColor');
const fgColorInput = document.getElementById('fgColor');

// Sliders for live updates
const sliders = [
  { id: 'scale', valId: 'scale_val' },
  { id: 'detail', valId: 'detail_val' },
  { id: 'charSize', valId: 'charSize_val' },
  { id: 'start_brightness', valId: 'start_brightness_val' },
  { id: 'end_brightness', valId: 'end_brightness_val' },
  { id: 'start_contrast', valId: 'start_contrast_val' },
  { id: 'end_contrast', valId: 'end_contrast_val' }
];

// Font family selector
const fontFamilySelect = document.getElementById('fontFamily');
const charSizeSlider = document.getElementById('charSize');

// View containers
const dualPreview = document.getElementById('dualPreview');
const animationPreview = document.getElementById('animationPreview');
const asciiOutputAnim = document.getElementById('asciiOutputAnim');

let currentImage = null;
let engine = null;
let isAnimationView = false;

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

// Update slider fill effect and value display
function updateSliderFill(slider, valueEl) {
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const val = parseFloat(slider.value);
  const percent = ((val - min) / (max - min)) * 100;

  // Create gradient for fill effect - use burnt orange in print mode
  const isPrintMode = document.body.classList.contains('print-mode');
  const accentColor = isPrintMode ? '#cc5500' : getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const bgColor = isPrintMode ? '#d4c4a8' : getComputedStyle(document.documentElement).getPropertyValue('--bg-dark').trim();
  slider.style.background = `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${percent}%, ${bgColor} ${percent}%, ${bgColor} 100%)`;

  // Update value display
  if (valueEl) {
    valueEl.textContent = Math.round(val);
  }
}

// Initialize all sliders
function initSliders() {
  sliders.forEach(({ id, valId }) => {
    const slider = document.getElementById(id);
    const valueEl = document.getElementById(valId);
    if (slider) {
      updateSliderFill(slider, valueEl);
      slider.addEventListener('input', () => {
        updateSliderFill(slider, valueEl);
        // Immediate smooth preview update
        if (currentImage) {
          switchToDualView();
          renderBothPreviews(currentImage);
        }
      });
    }
  });
}

// Switch to dual preview view (start/end side by side)
function switchToDualView() {
  if (isAnimationView) {
    isAnimationView = false;
    dualPreview.classList.remove('hidden');
    animationPreview.classList.add('hidden');
    if (engine && engine.isPlaying) {
      engine.pause();
      playBtn.textContent = 'Play';
    }
  }
}

// Switch to animation view (single panel)
function switchToAnimationView() {
  if (!isAnimationView) {
    isAnimationView = true;
    dualPreview.classList.add('hidden');
    animationPreview.classList.remove('hidden');
    // Apply current colors to animation preview
    updateDisplayColors();
  }
}

// Update display colors
function updateDisplayColors() {
  const bgColor = bgColorInput.value;
  const fgColor = fgColorInput.value;

  document.documentElement.style.setProperty('--ascii-bg', bgColor);
  document.documentElement.style.setProperty('--ascii-fg', fgColor);

  if (asciiOutputStart) {
    asciiOutputStart.style.backgroundColor = bgColor;
    asciiOutputStart.style.color = fgColor;
  }
  if (asciiOutputEnd) {
    asciiOutputEnd.style.backgroundColor = bgColor;
    asciiOutputEnd.style.color = fgColor;
  }
  if (asciiOutputAnim) {
    asciiOutputAnim.style.backgroundColor = bgColor;
    asciiOutputAnim.style.color = fgColor;
  }
}

// Update character size and font family for ASCII output
function updateCharSizeAndFont() {
  const charSize = parseInt(charSizeSlider?.value || 3, 10);
  const fontFamily = fontFamilySelect?.value || "'Courier New', monospace";

  // Calculate font size and line height based on charSize slider
  // Range: 1-100 maps to 1px-20px font size (scaled for monospace aspect ratio)
  const fontSize = Math.max(1, charSize * 0.2);
  const lineHeight = fontSize; // Keep line-height equal to font-size for proper scaling

  const asciiElements = [asciiOutputStart, asciiOutputEnd, asciiOutputAnim];
  asciiElements.forEach(el => {
    if (el) {
      el.style.fontFamily = fontFamily;
      el.style.fontSize = `${fontSize}px`;
      el.style.lineHeight = `${lineHeight}px`;
    }
  });
}

// Refresh all slider fills (for mode switching)
function refreshAllSliderFills() {
  sliders.forEach(({ id, valId }) => {
    const slider = document.getElementById(id);
    const valueEl = document.getElementById(valId);
    if (slider) {
      updateSliderFill(slider, valueEl);
    }
  });
}

// Mode toggle handlers
function setTerminalMode() {
  modeTerminal.classList.add('active');
  modePrint.classList.remove('active');
  document.body.classList.remove('print-mode');
  bgColorInput.value = '#0a0a0a';
  fgColorInput.value = '#00ff00';
  updateDisplayColors();
  refreshAllSliderFills();
}

function setPrintMode() {
  modePrint.classList.add('active');
  modeTerminal.classList.remove('active');
  document.body.classList.add('print-mode');
  bgColorInput.value = '#f5f0e6';
  fgColorInput.value = '#1a1a1a';
  updateDisplayColors();
  refreshAllSliderFills();
}

// Drag & drop
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.classList.remove('drag'); });
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault(); dropZone.classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) {
    console.log('Drop received file:', file.name, file.type, file.size);
    if (fileStatus) fileStatus.textContent = `Loaded: ${file.name}`;
    try {
      currentImage = await loadImageFile(file);
      await renderBothPreviews(currentImage);
    } catch (err) {
      console.error('Failed loading dropped file:', err);
      if (fileStatus) fileStatus.textContent = `Failed to load: ${file.name}`;
    }
  }
});

uploadEl.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  console.log('File selected via input:', file.name, file.type, file.size);
  if (fileStatus) fileStatus.textContent = `Loaded: ${file.name}`;
  try {
    currentImage = await loadImageFile(file);
    await renderBothPreviews(currentImage);
  } catch (err) {
    console.error('Failed loading selected file:', err);
    if (fileStatus) fileStatus.textContent = `Failed to load: ${file.name}`;
  }
});

// Render both start and end frame previews
async function renderBothPreviews(img) {
  const params = readAllParams();

  // Common params
  const commonParams = {
    image: img,
    asciiWidth: params.asciiWidth,
    blockSize: params.blockSize,
    blur: 0,
    dithering: true,
    ditherAlgorithm: 'floyd',
    invert: false,
    ignoreWhite: true,
    charset: params.charset,
    manualCharset: params.manualCharset,
    edgeMethod: params.edge,
    edgeThreshold: 100,
    dogThreshold: 100
  };

  // Start frame
  const startParams = {
    ...commonParams,
    brightness: params.brightness.start,
    contrast: params.contrast.start
  };

  // End frame
  const endParams = {
    ...commonParams,
    brightness: params.brightness.end,
    contrast: params.contrast.end
  };

  // Render both frames
  const [startResult, endResult] = await Promise.all([
    renderAsciiFrame(startParams),
    renderAsciiFrame(endParams)
  ]);

  if (asciiOutputStart) asciiOutputStart.textContent = startResult.ascii;
  if (asciiOutputEnd) asciiOutputEnd.textContent = endResult.ascii;
}

// Generate frames and prepare engine
generateBtn.addEventListener('click', async () => {
  if (!currentImage) {
    alert('Please upload an image first.');
    return;
  }
  const params = readAllParams();
  const numFrames = params.frames;
  const interp = makeInterpolator(params);

  // Switch to animation view
  switchToAnimationView();

  engine = new AnimationEngine(renderAsciiFrame, {
    previewCanvas,
    asciiOutput: asciiOutputAnim,
    onProgress: (p) => { progressEl.value = p; },
    onFrameGenerated: (i) => {
      // Show first frame immediately in animation view
      if (i === 0 && asciiOutputAnim && engine.frames[0]) {
        asciiOutputAnim.textContent = engine.frames[0].ascii;
      }
    },
    onComplete: () => {
      progressEl.value = 100;
      // Show first frame when done
      if (asciiOutputAnim && engine.frames[0]) {
        asciiOutputAnim.textContent = engine.frames[0].ascii;
      }
    }
  });

  progressEl.value = 0;
  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating...';

  try {
    await engine.generateFrames(currentImage, numFrames, (i, total) => interp(i, total));
    progressEl.value = 100;
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate';
  }
});

// Play / Pause
playBtn.addEventListener('click', () => {
  if (!engine || !engine.frames || engine.frames.length === 0) {
    alert('Generate frames first.');
    return;
  }

  // Ensure we're in animation view when playing
  switchToAnimationView();

  if (engine.isPlaying) {
    engine.pause();
    playBtn.textContent = 'Play';
  } else {
    // Update the engine's asciiOutput reference to animation panel
    engine.asciiOutput = asciiOutputAnim;
    engine.play(parseInt(document.getElementById('fps').value, 10) || 12);
    playBtn.textContent = 'Pause';
  }
});

// Export GIF
exportGifBtn.addEventListener('click', async () => {
  if (!engine || !engine.frames || engine.frames.length === 0) {
    alert('Generate frames first.');
    return;
  }
  const params = readAllParams();
  try {
    exportGifBtn.disabled = true;
    exportGifBtn.textContent = 'Encoding...';
    const res = await exportAsGif(engine.frames, {
      fps: parseInt(document.getElementById('fps').value, 10) || 12,
      fontSize: 10,
      textColor: params.fgColor,
      bgColor: params.bgColor,
      onProgress: (p) => { progressEl.value = Math.round(p * 100); }
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
  if (!engine || !engine.frames || engine.frames.length === 0) {
    alert('Generate frames first.');
    return;
  }
  const params = readAllParams();
  try {
    exportWebmBtn.disabled = true;
    exportWebmBtn.textContent = 'Recording...';
    const { url } = await exportAsWebM(engine.frames, {
      fps: parseInt(document.getElementById('fps').value, 10) || 12,
      fontSize: 10,
      textColor: params.fgColor,
      bgColor: params.bgColor,
      onProgress: (p) => { progressEl.value = Math.round(p * 100); }
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ascii_animation.webm';
    a.click();
  } catch (err) {
    console.error(err);
    alert('WebM export failed: ' + err.message);
  } finally {
    exportWebmBtn.disabled = false;
    exportWebmBtn.textContent = 'Export WebM';
  }
});

// Export MP4 via MediaRecorder
exportMp4Btn.addEventListener('click', async () => {
  if (!engine || !engine.frames || engine.frames.length === 0) {
    alert('Generate frames first.');
    return;
  }
  const params = readAllParams();
  try {
    exportMp4Btn.disabled = true;
    exportMp4Btn.textContent = 'Recording...';
    const { url, extension } = await exportAsMp4(engine.frames, {
      fps: parseInt(document.getElementById('fps').value, 10) || 12,
      fontSize: 10,
      textColor: params.fgColor,
      bgColor: params.bgColor,
      onProgress: (p) => { progressEl.value = Math.round(p * 100); }
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = `ascii_animation.${extension}`;
    a.click();
  } catch (err) {
    console.error(err);
    alert('MP4 export failed: ' + err.message);
  } finally {
    exportMp4Btn.disabled = false;
    exportMp4Btn.textContent = 'Export MP4';
  }
});

// Listen for setting changes to update previews
function setupLivePreviewListeners() {
  const settingIds = ['scale', 'detail', 'charSize', 'edge', 'charset', 'manualCharset'];
  settingIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        if (currentImage) {
          switchToDualView();
          renderBothPreviews(currentImage);
        }
      });
      // Also listen for input on manualCharset for real-time updates
      if (id === 'manualCharset') {
        el.addEventListener('input', () => {
          if (currentImage) {
            switchToDualView();
            renderBothPreviews(currentImage);
          }
        });
      }
    }
  });

  // Show/hide manual charset input based on charset selection
  const charsetSelect = document.getElementById('charset');
  const manualCharsetRow = document.getElementById('manualCharsetRow');
  if (charsetSelect && manualCharsetRow) {
    const updateManualVisibility = () => {
      if (charsetSelect.value === 'manual') {
        manualCharsetRow.classList.remove('hidden');
      } else {
        manualCharsetRow.classList.add('hidden');
      }
    };
    charsetSelect.addEventListener('change', updateManualVisibility);
    updateManualVisibility(); // Set initial state
  }

  // Character size slider listener
  if (charSizeSlider) {
    charSizeSlider.addEventListener('input', updateCharSizeAndFont);
  }

  // Font family selector listener
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('change', updateCharSizeAndFont);
  }
}

// Color input listeners
bgColorInput.addEventListener('input', updateDisplayColors);
fgColorInput.addEventListener('input', updateDisplayColors);

// Mode toggle listeners
modeTerminal.addEventListener('click', setTerminalMode);
modePrint.addEventListener('click', setPrintMode);

// Boot: initialize and load default image
window.addEventListener('load', async () => {
  initSliders();
  setupLivePreviewListeners();
  updateDisplayColors();
  updateCharSizeAndFont();

  try {
    const defaultUrl = "https://i.ibb.co/chHSSFQk/horse.png";
    const img = new Image();
    img.crossOrigin = "Anonymous";
    await new Promise((res) => { img.onload = res; img.src = defaultUrl; });
    currentImage = img;
    await renderBothPreviews(currentImage);
  } catch (err) {
    console.warn('Default image load failed:', err);
  }
});
