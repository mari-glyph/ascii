// exporter.js
// Exports two helper functions: exportAsGif(frames, options) and exportAsWebM(frames, options).
// frames: array of { ascii, canvas } where canvas is the small offscreen canvas returned by renderer.
// options: { fps, onProgress }

export function exportAsGif(frames, options = {}) {
  const { fps = 12, onProgress = () => {} } = options;
  return new Promise((resolve, reject) => {
    if (typeof GIF === 'undefined') {
      reject(new Error('GIF library not loaded. Include gif.js (worker + gif.js).'));
      return;
    }
    const gif = new GIF({
      workers: 2,
      quality: 10,
      workerScript: 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
    });

    const delay = Math.round(1000 / fps);

    frames.forEach((f, idx) => {
      // Each frame provides a canvas - add it
      gif.addFrame(f.canvas, { delay, copy: true });
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
  const { fps = 12, onProgress = () => {} } = options;
  return new Promise((resolve, reject) => {
    // Create an offscreen canvas sized to the preview desired output.
    const w = frames[0].canvas.width;
    const h = frames[0].canvas.height;
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
      if (idx >= frames.length) {
        // stop recorder
        setTimeout(() => recorder.stop(), 100); // small delay to ensure last frame captured
        return;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(frames[idx].canvas, 0, 0, w, h);
      onProgress(idx / frames.length);
      idx++;
      setTimeout(drawNext, delay);
    };
    drawNext();
  });
}
