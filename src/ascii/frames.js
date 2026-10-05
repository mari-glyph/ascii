// frames.js
// Interpolate render settings between a start and end state and render each frame,
// yielding to the browser between frames so the UI stays responsive.

import { renderAsciiFrame } from './render.js';

const lerp = (a, b, t) => a + (b - a) * t;

// base: shared render options; start/end: { brightness, contrast } at t = 0 and t = 1.
export async function generateFrames(image, { base, start, end, count, onProgress = () => {}, signal }) {
  const frames = [];
  for (let i = 0; i < count; i++) {
    if (signal?.aborted) break;
    const t = count <= 1 ? 0 : i / (count - 1);
    frames.push(renderAsciiFrame(image, {
      ...base,
      brightness: lerp(start.brightness, end.brightness, t),
      contrast: lerp(start.contrast, end.contrast, t),
    }));
    onProgress((i + 1) / count, frames[i]);
    await new Promise((r) => setTimeout(r, 0));
  }
  return frames;
}

// Loop frames into a <pre> at a fixed fps.
export class Player {
  constructor(pre) {
    this.pre = pre;
    this.frames = [];
    this.timer = 0;
    this.idx = 0;
  }

  get playing() { return !!this.timer; }

  play(frames, fps) {
    this.stop();
    this.frames = frames;
    if (!frames.length) return;
    const tick = () => {
      this.pre.textContent = this.frames[this.idx].ascii;
      this.idx = (this.idx + 1) % this.frames.length;
      this.timer = setTimeout(tick, 1000 / fps);
    };
    tick();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = 0;
  }
}
