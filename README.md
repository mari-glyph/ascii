# ascii

A modular, browser-based ASCII-art renderer refactored into an interactive **animation tool**.

refactored ver. of Monospace by Mikhail Besoalov https://codepen.io/Mikhail-Bespalov/pen/JoPqYrz 

Features:
- Upload images (file input or drag-and-drop).
- Set **start** and **end** parameter values for brightness, contrast, zoom, charset, and edge detection.
- Interpolates between start/end values to generate smooth ASCII animation frames.
- Preview in-browser on a `<canvas>` and export as **GIF** (client-side) or **WebM** (MediaRecorder -> convertible to MP4 with ffmpeg).

## Quick start (dev)
1. `npm install` (optional)
2. `npm run start` (uses `live-server` if you installed devDependency)
3. Open `src/index.html` in your browser.

## How to use
1. Upload an image.
2. Use the UI to set **Start** and **End** parameters (see "Animation" panel).
3. Choose number of frames and FPS.
4. Click **Generate Preview** to render and preview frames.
5. Export as **GIF** or **WebM**:
   - GIF: client-side encoder via `gif.js`.
   - WebM: recorded from canvas using `MediaRecorder`. Convert to MP4 with `ffmpeg`:
     ```bash
     ffmpeg -i animation.webm -c:v libx264 -preset slow -crf 18 output.mp4
     ```

## Performance tips
- Use fewer frames and a smaller `asciiWidth` for faster encoding.
- Offload heavy rendering to a Web Worker + `OffscreenCanvas` (skeleton included).
- Consider `createImageBitmap()` and resizing input once, saving intermediate bitmaps.
- Use `requestAnimationFrame` for preview playback and `MediaRecorder` to record.

## Files
- `src/index.html` – main UI and script includes
- `src/styles.css` – UI styling
- `src/js/asciiRenderer.js` – refactored renderer (keeps your logic)
- `src/js/uiControls.js` – UI bindings & parameter read/write
- `src/js/animationEngine.js` – interpolation & frame generation
- `src/js/exporter.js` – gif/webm export logic
- `src/js/main.js` – bootstrap and wiring
- `src/js/worker.js` – optional OffscreenCanvas worker skeleton