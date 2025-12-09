// exporter.js
// Exports two helper functions: exportAsGif(frames, options) and exportAsWebM(frames, options).
// frames: array of { ascii, canvas } where canvas is the small offscreen canvas returned by renderer.
// options: { fps, onProgress }

// Render ASCII text to a canvas for export
function renderAsciiToCanvas(ascii, options = {}) {
  const {
    fontSize = 6,
    fontFamily = 'Courier New, monospace',
    textColor = '#00ff00',
    bgColor = '#0a0a0a',
    padding = 10
  } = options;

  const lines = ascii.split('\n').filter(line => line.length > 0);
  if (lines.length === 0) return null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Set font to measure text
  ctx.font = `${fontSize}px ${fontFamily}`;

  // Calculate dimensions based on character width/height
  const charWidth = ctx.measureText('M').width;
  const lineHeight = fontSize;
  const maxLineLength = Math.max(...lines.map(l => l.length));

  // Set canvas size
  canvas.width = Math.ceil(maxLineLength * charWidth) + padding * 2;
  canvas.height = lines.length * lineHeight + padding * 2;

  // Fill background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw text
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'top';

  lines.forEach((line, i) => {
    ctx.fillText(line, padding, padding + i * lineHeight);
  });

  return canvas;
}

export function exportAsGif(frames, options = {}) {
  const { fps = 12, onProgress = () => {}, fontSize = 6 } = options;
  return new Promise((resolve, reject) => {
    if (typeof GIF === 'undefined') {
      reject(new Error('GIF library not loaded. Include gif.js (worker + gif.js).'));
      return;
    }

    // First, render all ASCII frames to canvases
    const renderedFrames = frames.map(f => renderAsciiToCanvas(f.ascii, { fontSize }));

    if (renderedFrames.length === 0 || !renderedFrames[0]) {
      reject(new Error('No frames to export'));
      return;
    }

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: renderedFrames[0].width,
      height: renderedFrames[0].height,
      workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
    });

    const delay = Math.round(1000 / fps);

    renderedFrames.forEach((canvas, idx) => {
      if (canvas) {
        gif.addFrame(canvas, { delay, copy: true });
      }
    });

    gif.on('progress', function(p) {
      onProgress(p);
    });

    gif.on('finished', function(blob) {
      const url = URL.createObjectURL(blob);
      resolve({ blob, url });
    });

    gif.render();
  });
}

export function exportAsWebM(frames, options = {}) {
  const { fps = 12, onProgress = () => {}, fontSize = 6 } = options;
  return new Promise((resolve, reject) => {
    // First, render all ASCII frames to canvases
    const renderedFrames = frames.map(f => renderAsciiToCanvas(f.ascii, { fontSize }));

    if (renderedFrames.length === 0 || !renderedFrames[0]) {
      reject(new Error('No frames to export'));
      return;
    }

    const w = renderedFrames[0].width;
    const h = renderedFrames[0].height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const stream = canvas.captureStream(fps);
    let recordedChunks = [];
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    } catch (e) {
      try {
        recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      } catch (err) {
        reject(new Error('MediaRecorder not available or codec not supported.'));
        return;
      }
    }

    recorder.ondataavailable = (ev) => {
      if (ev.data?.size) recordedChunks.push(ev.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      resolve({ blob, url });
    };

    recorder.start();

    // Draw frames sequentially with timing
    const delay = 1000 / fps;
    let idx = 0;
    const drawNext = () => {
      if (idx >= renderedFrames.length) {
        // stop recorder
        setTimeout(() => recorder.stop(), 100); // small delay to ensure last frame captured
        return;
      }
      ctx.clearRect(0, 0, w, h);
      if (renderedFrames[idx]) {
        ctx.drawImage(renderedFrames[idx], 0, 0, w, h);
      }
      onProgress(idx / renderedFrames.length);
      idx++;
      setTimeout(drawNext, delay);
    };
    drawNext();
  });
}
