// export.js
// ASCII frames → GIF (worker-encoded) or video (MediaRecorder: MP4 where the browser can,
// otherwise WebM). Convert WebM to MP4 with:
//   ffmpeg -i animation.webm -c:v libx264 -preset slow -crf 18 output.mp4

const VIDEO_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

// Draw ASCII text onto a canvas. All frames share one size so encoders get stable dimensions.
function textCanvas(ascii, { fontSize, fontFamily, color, background, padding = 20 }) {
  const lines = ascii.split('\n').filter((l) => l.length);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = `${fontSize}px ${fontFamily}`;
  const cw = ctx.measureText('M').width;
  canvas.width = Math.ceil(Math.max(1, ...lines.map((l) => l.length)) * cw) + padding * 2;
  canvas.height = Math.max(1, lines.length) * fontSize + padding * 2;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, padding, padding + i * fontSize));
  return canvas;
}

function renderAll(frames, style) {
  if (!frames.length) throw new Error('generate frames first');
  return frames.map((f) => textCanvas(f.ascii, style));
}

export function exportGif(frames, { fps = 12, onProgress = () => {}, ...style }) {
  const canvases = renderAll(frames, style);
  const { width, height } = canvases[0];
  const data = canvases.map((c) => c.getContext('2d').getImageData(0, 0, width, height).data);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./gif-worker.js', import.meta.url));
    worker.onmessage = (ev) => {
      if (ev.data.type === 'progress') onProgress(ev.data.progress);
      else if (ev.data.type === 'finished') {
        worker.terminate();
        resolve({ blob: new Blob([ev.data.data], { type: 'image/gif' }), extension: 'gif' });
      }
    };
    worker.onerror = (err) => { worker.terminate(); reject(new Error(`GIF encoding failed: ${err.message}`)); };
    worker.postMessage({ type: 'start', frames: data, width, height, delay: Math.round(1000 / fps), quality: 10 });
  });
}

export function exportVideo(frames, { fps = 12, onProgress = () => {}, ...style }) {
  const canvases = renderAll(frames, style);
  const mime = VIDEO_TYPES.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  if (!mime) return Promise.reject(new Error('this browser can’t record video'));
  const canvas = document.createElement('canvas');
  canvas.width = canvases[0].width;
  canvas.height = canvases[0].height;
  const ctx = canvas.getContext('2d');
  const recorder = new MediaRecorder(canvas.captureStream(fps), { mimeType: mime });
  const chunks = [];
  return new Promise((resolve) => {
    recorder.ondataavailable = (ev) => { if (ev.data?.size) chunks.push(ev.data); };
    recorder.onstop = () => {
      const isMp4 = mime.startsWith('video/mp4');
      resolve({ blob: new Blob(chunks, { type: isMp4 ? 'video/mp4' : 'video/webm' }), extension: isMp4 ? 'mp4' : 'webm' });
    };
    recorder.start();
    let i = 0;
    const next = () => {
      if (i >= canvases.length) { setTimeout(() => recorder.stop(), 100); return; }
      ctx.drawImage(canvases[i], 0, 0);
      onProgress(i / canvases.length);
      i++;
      setTimeout(next, 1000 / fps);
    };
    next();
  });
}
