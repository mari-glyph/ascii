# tisane workshop

A browser workshop for making tisane hash marks and the assets built from them. Everything
starts from the **shard**: the three-point shape the tisane mark is made of (a straight base
A→B and two curves meeting at the apex C). Two shards rotated 180° around a shared centre make
the mark.

No build step. ES modules served from any static server:

```bash
python3 -m http.server 5317
```

Then open http://localhost:5317. (Opening `index.html` straight from disk won't work, because
browsers block module imports over `file://`.)

## Rooms

Keys `1` to `5` switch rooms. Everything you make autosaves in the browser, and the library rail
on the left holds what you choose to keep.

| | room | what it does |
|---|---|---|
| 01 | **pen** | Edit one shard. It has exactly three anchors. Drag an anchor and its handles ride along (hold **Alt** to move the anchor alone). Drag a handle to bend an edge (hold **Shift** to keep the opposite handle smooth). Double-click an edge to switch between line and curve. Drag the body to move it. Arrow keys nudge (**Shift** ×10), **⌘Z** / **⇧⌘Z** undo and redo. The faint twin shows the shard paired the way the mark pairs it. You can import any path with three anchors (e.g. half of `favicon.svg`). |
| 02 | **form** | Build a hexagon or more complex shape: a parallelogram with shards seated on its edges. Each shard's base endpoints are matched to an edge's vertices and its curves follow by the affine map those three point pairs define. The dashed **skeleton** is the straight-line polygon through the matched points, and the **apex lines** join the apexes. Drag a vertex and the opposite one follows, so the parallelogram stays defined by three points. Drag an apex to lean or deepen its shard. Click an edge to cycle off → out → in. The default form *is* the tisane mark. |
| 03 | **edge** | Drop in any SVG (or paste one, draw freehand, or use the current shard or form) and trace every outline with shrunken copies of a motif. Each copy's base sits on a chord of the outline with its apex pointing out. Rhythms: even, flip, or **pairs** (each copy plus its 180° twin, like the mark). |
| 04 | **fill** | Gradient fills built from shards: a lattice (grid / brick / tri / rings) of motifs whose size, colour and rotation follow a linear, radial or conic field. Colour stops interpolate in OKLab. Drag on the canvas to aim the gradient. Fills can be clipped to any shape. Saved fills keep a snapshot of their motif and clip. |
| 05 | **ascii** | The original ASCII animation tool. Its source can be any room's output or an uploaded image. Brightness and contrast animate from a start to an end state. Exports GIF or video (MP4 where supported, otherwise WebM; convert with `ffmpeg -i in.webm -c:v libx264 -crf 18 out.mp4`). |

Every room exports SVG (edge and fill also export PNG). The library exports and imports as JSON.

## Code

```
index.html, styles.css     shell + tisane palette (from tisane's globals.css)
src/main.js                tabs, library rail, cross-room sources
src/store.js               shared state, events, autosave, library, motif lookup
src/ui.js                  inspector control builders
src/core/
  geometry.js              points, affine matrices (affineFrom3 is the key piece)
  shard.js                 the three-point shard, the raw tisane shard, mapOntoEdge
  compose.js               parallelogram + shards → form, skeleton, apex lines
  pathdata.js              SVG path parser (pulls a shard out of imported paths)
  motif.js                 anything stampable: { d, frame: [A, B, C], box }
  edge.js / fill.js        pure layout for the edge and fill rooms
  color.js                 OKLab gradient stops
  svg.js                   DOM helpers: sanitised import, outline sampling, export
src/rooms/                 one module per room: mount(root) → { show }
src/ascii/                 renderer, frame generator, exporters, GIF worker
```

Why it holds together: an affine map is fixed by three point pairs and maps cubic béziers to
cubic béziers exactly. So "match the shard's A, B, C to these three points" carries its curves
anywhere: onto a parallelogram edge, a chord of an outline, or a lattice cell.

ASCII renderer adapted from "Monospace" by Mikhail Bespalov
(https://codepen.io/Mikhail-Bespalov/pen/JoPqYrz).
