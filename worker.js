// worker.js
// Offscreen worker to render frames without blocking UI.
// To use: instantiate new Worker('worker.js'), postMessage({ cmd: 'render', imageBitmap, params })
// Then worker does render and posts frames back as ImageBitmap or transferable objects.
// This is a skeleton; using it requires more wiring in main.js and using createImageBitmap().

self.onmessage = async (ev) => {
  const { cmd, imageBitmap, options, frameIndex } = ev.data;
  if (cmd === 'render') {
    // Create OffscreenCanvas
    const canvas = new OffscreenCanvas(options.asciiWidth, options.asciiHeight);
    const ctx = canvas.getContext('2d');
    // ... draw and run ascii rendering (porting asciiRenderer code here)
    // After rendering, transfer result
    // const bitmap = await canvas.transferToImageBitmap();
    // self.postMessage({ cmd: 'frame', bitmap, ascii: computedAscii, frameIndex }, [bitmap]);
  }
};
