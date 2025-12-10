// animationEngine.js
// Produces frame sequences by interpolating parameters and calling renderFunc.
// renderFunc should accept options and return { ascii, canvas } or a Promise resolving to it.

export class AnimationEngine {
  constructor(renderFunc, opts = {}) {
    this.renderFunc = renderFunc;
    this.frames = []; // each frame: { ascii, canvas }
    this.isPlaying = false;
    this.playbackTimer = null;
    this.currentPlayIdx = 0;
    this.onProgress = opts.onProgress || function() {};
    this.onFrameGenerated = opts.onFrameGenerated || function() {};
    this.onComplete = opts.onComplete || function() {};
    this.previewCanvas = opts.previewCanvas || null; // HTMLCanvasElement for drawing image preview
    this.asciiOutput = opts.asciiOutput || null; // <pre> to show ascii text
  }

  // Linear interpolation helper for numeric options (we use uiControls.makeInterpolator outside)
  async generateFrames(image, totalFrames, makeFrameOptions) {
    this.frames = [];
    for (let i=0;i<totalFrames;i++) {
      const params = makeFrameOptions(i, totalFrames);
      // Compose renderer options
      const options = {
        image,
        asciiWidth: params.asciiWidth,
        blockSize: params.blockSize,
        brightness: params.brightness,
        contrast: params.contrast,
        blur: 0,
        dithering: true,
        ditherAlgorithm: 'floyd',
        invert: false,
        ignoreWhite: true,
        charset: params.charset,
        manualCharset: params.manualCharset,
        edgeMethod: params.edgeMethod,
        edgeThreshold: 100,
        dogThreshold: 100
      };

      // renderFunc may be async
      const result = await this.renderFunc(options);
      // Store ascii and a snapshot (canvas element)
      this.frames.push(result);
      const progress = Math.round(((i+1)/totalFrames)*100);
      this.onProgress(progress, i, totalFrames);
      this.onFrameGenerated(i, result);
      // allow micro-yield for UI responsiveness
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    this.onComplete(this.frames);
    return this.frames;
  }

  // Draw a frame to previewCanvas (image preview) and asciiOutput (text)
  drawFrameToPreview(idx) {
    if (!this.frames[idx]) return;
    const { ascii, canvas } = this.frames[idx];
    if (this.asciiOutput) this.asciiOutput.textContent = ascii;
    if (this.previewCanvas && canvas) {
      // draw the scaled canvas into previewCanvas (fit)
      const ctx = this.previewCanvas.getContext('2d');
      const scaleW = this.previewCanvas.width;
      const scaleH = this.previewCanvas.height;
      // Clear
      ctx.fillStyle = "#000"; ctx.fillRect(0,0,scaleW,scaleH);
      // draw the small canvas scaled up
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, scaleW, scaleH);
    }
  }

  // Play generated frames at FPS (loop)
  play(fps = 12) {
    if (!this.frames || this.frames.length === 0) return;
    this.isPlaying = true;
    const interval = 1000 / fps;
    const tick = () => {
      if (!this.isPlaying) return;
      this.drawFrameToPreview(this.currentPlayIdx);
      this.currentPlayIdx = (this.currentPlayIdx + 1) % this.frames.length;
      this.playbackTimer = setTimeout(tick, interval);
    };
    tick();
  }

  pause() {
    this.isPlaying = false;
    if (this.playbackTimer) clearTimeout(this.playbackTimer);
    this.playbackTimer = null;
  }
}
