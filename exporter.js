// exporter.js
// Exports two helper functions: exportAsGif(frames, options) and exportAsWebM(frames, options).
// frames: array of { ascii, canvas } where canvas is the small offscreen canvas returned by renderer.
// options: { fps, onProgress }

// Create a blob URL for the gif.worker.js to avoid CORS issues
function createWorkerBlobURL() {
  // Minimal gif.js worker code (from gif.js library)
  const workerCode = `
    var NeuQuant = function() {
      var netsize = 256;
      var prime1 = 499;
      var prime2 = 491;
      var prime3 = 487;
      var prime4 = 503;
      var minpicturebytes = 3 * prime4;
      var maxnetpos = netsize - 1;
      var netbiasshift = 4;
      var ncycles = 100;
      var intbiasshift = 16;
      var intbias = 1 << intbiasshift;
      var gammashift = 10;
      var gamma = 1 << gammashift;
      var betashift = 10;
      var beta = intbias >> betashift;
      var betagamma = intbias << (gammashift - betashift);
      var initrad = netsize >> 3;
      var radiusbiasshift = 6;
      var radiusbias = 1 << radiusbiasshift;
      var initradius = initrad * radiusbias;
      var radiusdec = 30;
      var alphabiasshift = 10;
      var initalpha = 1 << alphabiasshift;
      var alphadec;
      var radbiasshift = 8;
      var radbias = 1 << radbiasshift;
      var alpharadbshift = alphabiasshift + radbiasshift;
      var alpharadbias = 1 << alpharadbshift;
      var thepicture;
      var lengthcount;
      var samplefac;
      var network;
      var netindex;
      var bias;
      var freq;
      var radpower;
      function NeuQuant(thepic, len, sample) {
        var i, v;
        thepicture = thepic;
        lengthcount = len;
        samplefac = sample;
        network = [];
        netindex = new Int32Array(256);
        bias = new Int32Array(netsize);
        freq = new Int32Array(netsize);
        radpower = new Int32Array(netsize >> 3);
        for (i = 0; i < netsize; i++) {
          v = (i << (netbiasshift + 8)) / netsize;
          network[i] = new Float64Array([v, v, v, 0]);
          freq[i] = intbias / netsize;
          bias[i] = 0;
        }
      }
      function colorMap() {
        var map = [];
        var index = new Int32Array(netsize);
        for (var i = 0; i < netsize; i++) index[network[i][3]] = i;
        var k = 0;
        for (var l = 0; l < netsize; l++) {
          var j = index[l];
          map[k++] = network[j][0];
          map[k++] = network[j][1];
          map[k++] = network[j][2];
        }
        return map;
      }
      function inxbuild() {
        var i, j, p, q, smallpos, smallval, previouscol = 0, startpos = 0;
        for (i = 0; i < netsize; i++) {
          p = network[i];
          smallpos = i;
          smallval = p[1];
          for (j = i + 1; j < netsize; j++) {
            q = network[j];
            if (q[1] < smallval) { smallpos = j; smallval = q[1]; }
          }
          q = network[smallpos];
          if (i != smallpos) {
            j = q[0]; q[0] = p[0]; p[0] = j;
            j = q[1]; q[1] = p[1]; p[1] = j;
            j = q[2]; q[2] = p[2]; p[2] = j;
            j = q[3]; q[3] = p[3]; p[3] = j;
          }
          if (smallval != previouscol) {
            netindex[previouscol] = (startpos + i) >> 1;
            for (j = previouscol + 1; j < smallval; j++) netindex[j] = i;
            previouscol = smallval;
            startpos = i;
          }
        }
        netindex[previouscol] = (startpos + maxnetpos) >> 1;
        for (j = previouscol + 1; j < 256; j++) netindex[j] = maxnetpos;
      }
      function learn() {
        var i;
        var lengthcount = thepicture.length;
        var alphadec = 30 + ((samplefac - 1) / 3);
        var samplepixels = lengthcount / (3 * samplefac);
        var delta = ~~(samplepixels / ncycles);
        var alpha = initalpha;
        var radius = initradius;
        var rad = radius >> radiusbiasshift;
        if (rad <= 1) rad = 0;
        for (i = 0; i < rad; i++) radpower[i] = alpha * (((rad * rad - i * i) * radbias) / (rad * rad));
        var step;
        if (lengthcount < minpicturebytes) { samplefac = 1; step = 3; }
        else if ((lengthcount % prime1) !== 0) step = 3 * prime1;
        else if ((lengthcount % prime2) !== 0) step = 3 * prime2;
        else if ((lengthcount % prime3) !== 0) step = 3 * prime3;
        else step = 3 * prime4;
        var pix = 0;
        i = 0;
        while (i < samplepixels) {
          var b = (thepicture[pix] & 0xff) << netbiasshift;
          var g = (thepicture[pix + 1] & 0xff) << netbiasshift;
          var r = (thepicture[pix + 2] & 0xff) << netbiasshift;
          var j = contest(b, g, r);
          altersingle(alpha, j, b, g, r);
          if (rad !== 0) alterneigh(rad, j, b, g, r);
          pix += step;
          if (pix >= lengthcount) pix -= lengthcount;
          i++;
          if (delta === 0) delta = 1;
          if (i % delta === 0) {
            alpha -= alpha / alphadec;
            radius -= radius / radiusdec;
            rad = radius >> radiusbiasshift;
            if (rad <= 1) rad = 0;
            for (j = 0; j < rad; j++) radpower[j] = alpha * (((rad * rad - j * j) * radbias) / (rad * rad));
          }
        }
      }
      function map(b, g, r) {
        var i, j, dist, a, bestd, p, best;
        bestd = 1000;
        best = -1;
        i = netindex[g];
        j = i - 1;
        while ((i < netsize) || (j >= 0)) {
          if (i < netsize) {
            p = network[i];
            dist = p[1] - g;
            if (dist >= bestd) i = netsize;
            else {
              i++;
              if (dist < 0) dist = -dist;
              a = p[0] - b; if (a < 0) a = -a; dist += a;
              if (dist < bestd) { a = p[2] - r; if (a < 0) a = -a; dist += a; if (dist < bestd) { bestd = dist; best = p[3]; } }
            }
          }
          if (j >= 0) {
            p = network[j];
            dist = g - p[1];
            if (dist >= bestd) j = -1;
            else {
              j--;
              if (dist < 0) dist = -dist;
              a = p[0] - b; if (a < 0) a = -a; dist += a;
              if (dist < bestd) { a = p[2] - r; if (a < 0) a = -a; dist += a; if (dist < bestd) { bestd = dist; best = p[3]; } }
            }
          }
        }
        return best;
      }
      function contest(b, g, r) {
        var bestd = ~(1 << 31);
        var bestbiasd = bestd;
        var bestpos = -1;
        var bestbiaspos = bestpos;
        for (var i = 0; i < netsize; i++) {
          var n = network[i];
          var dist = Math.abs(n[0] - b) + Math.abs(n[1] - g) + Math.abs(n[2] - r);
          if (dist < bestd) { bestd = dist; bestpos = i; }
          var biasdist = dist - ((bias[i]) >> (intbiasshift - netbiasshift));
          if (biasdist < bestbiasd) { bestbiasd = biasdist; bestbiaspos = i; }
          var betafreq = (freq[i] >> betashift);
          freq[i] -= betafreq;
          bias[i] += (betafreq << gammashift);
        }
        freq[bestpos] += beta;
        bias[bestpos] -= betagamma;
        return bestbiaspos;
      }
      function altersingle(alpha, i, b, g, r) {
        network[i][0] -= (alpha * (network[i][0] - b)) / initalpha;
        network[i][1] -= (alpha * (network[i][1] - g)) / initalpha;
        network[i][2] -= (alpha * (network[i][2] - r)) / initalpha;
      }
      function alterneigh(rad, i, b, g, r) {
        var lo = Math.abs(i - rad);
        var hi = Math.min(i + rad, netsize);
        var j = i + 1;
        var k = i - 1;
        var m = 1;
        while ((j < hi) || (k > lo)) {
          var a = radpower[m++];
          if (j < hi) {
            var p = network[j++];
            p[0] -= (a * (p[0] - b)) / alpharadbias;
            p[1] -= (a * (p[1] - g)) / alpharadbias;
            p[2] -= (a * (p[2] - r)) / alpharadbias;
          }
          if (k > lo) {
            var p = network[k--];
            p[0] -= (a * (p[0] - b)) / alpharadbias;
            p[1] -= (a * (p[1] - g)) / alpharadbias;
            p[2] -= (a * (p[2] - r)) / alpharadbias;
          }
        }
      }
      function process() {
        learn();
        unbiasnet();
        inxbuild();
        return colorMap();
      }
      function unbiasnet() {
        for (var i = 0; i < netsize; i++) {
          network[i][0] >>= netbiasshift;
          network[i][1] >>= netbiasshift;
          network[i][2] >>= netbiasshift;
          network[i][3] = i;
        }
      }
      this.buildColorMap = function() { return process(); };
      this.getColorMap = function() { return colorMap(); };
      this.lookupRGB = function(b, g, r) { return map(b, g, r); };
      NeuQuant.apply(this, arguments);
      return this;
    };

    var LZWEncoder = function() {
      var exports = {};
      var EOF = -1;
      var imgW, imgH, pixAry, initCodeSize;
      var remaining, curPixel;
      var BITS = 12, HSIZE = 5003;
      var n_bits, maxbits = BITS, maxcode, maxmaxcode = 1 << BITS;
      var htab = [], codetab = [];
      var hsize = HSIZE, free_ent = 0;
      var clear_flg = false;
      var g_init_bits, ClearCode, EOFCode;
      var cur_accum = 0, cur_bits = 0;
      var masks = [0x0000, 0x0001, 0x0003, 0x0007, 0x000F, 0x001F, 0x003F, 0x007F, 0x00FF, 0x01FF, 0x03FF, 0x07FF, 0x0FFF, 0x1FFF, 0x3FFF, 0x7FFF, 0xFFFF];
      var a_count, accum = [];
      function char_out(c, outs) { accum[a_count++] = c; if (a_count >= 254) flush_char(outs); }
      function cl_block(outs) { cl_hash(hsize); free_ent = ClearCode + 2; clear_flg = true; output(ClearCode, outs); }
      function cl_hash(hsize) { for (var i = 0; i < hsize; ++i) htab[i] = -1; }
      function compress(init_bits, outs) {
        var fcode, c, i, ent, disp, hsize_reg, hshift;
        g_init_bits = init_bits;
        clear_flg = false;
        n_bits = g_init_bits;
        maxcode = MAXCODE(n_bits);
        ClearCode = 1 << (init_bits - 1);
        EOFCode = ClearCode + 1;
        free_ent = ClearCode + 2;
        a_count = 0;
        ent = nextPixel();
        hshift = 0;
        for (fcode = hsize; fcode < 65536; fcode *= 2) ++hshift;
        hshift = 8 - hshift;
        hsize_reg = hsize;
        cl_hash(hsize_reg);
        output(ClearCode, outs);
        outer_loop: while ((c = nextPixel()) != EOF) {
          fcode = (c << maxbits) + ent;
          i = (c << hshift) ^ ent;
          if (htab[i] === fcode) { ent = codetab[i]; continue; }
          else if (htab[i] >= 0) {
            disp = hsize_reg - i;
            if (i === 0) disp = 1;
            do { if ((i -= disp) < 0) i += hsize_reg; if (htab[i] === fcode) { ent = codetab[i]; continue outer_loop; } } while (htab[i] >= 0);
          }
          output(ent, outs);
          ent = c;
          if (free_ent < maxmaxcode) { codetab[i] = free_ent++; htab[i] = fcode; } else cl_block(outs);
        }
        output(ent, outs);
        output(EOFCode, outs);
      }
      function encode(os) { os.writeByte(initCodeSize); remaining = imgW * imgH; curPixel = 0; compress(initCodeSize + 1, os); os.writeByte(0); }
      function flush_char(outs) { if (a_count > 0) { outs.writeByte(a_count); outs.writeBytes(accum, 0, a_count); a_count = 0; } }
      function MAXCODE(n_bits) { return (1 << n_bits) - 1; }
      function nextPixel() { if (remaining === 0) return EOF; --remaining; var pix = pixAry[curPixel++]; return pix & 0xff; }
      function output(code, outs) {
        cur_accum &= masks[cur_bits];
        if (cur_bits > 0) cur_accum |= (code << cur_bits);
        else cur_accum = code;
        cur_bits += n_bits;
        while (cur_bits >= 8) { char_out((cur_accum & 0xff), outs); cur_accum >>= 8; cur_bits -= 8; }
        if (free_ent > maxcode || clear_flg) {
          if (clear_flg) { maxcode = MAXCODE(n_bits = g_init_bits); clear_flg = false; }
          else { ++n_bits; if (n_bits == maxbits) maxcode = maxmaxcode; else maxcode = MAXCODE(n_bits); }
        }
        if (code == EOFCode) { while (cur_bits > 0) { char_out((cur_accum & 0xff), outs); cur_accum >>= 8; cur_bits -= 8; } flush_char(outs); }
      }
      this.encode = encode;
      this.setPixels = function(p) { pixAry = p; };
      this.setDelay = function(d) { imgW = d; };
      this.setWidth = function(w) { imgW = w; };
      this.setHeight = function(h) { imgH = h; };
      this.setInitCodeSize = function(s) { initCodeSize = s; };
    };

    var GIFEncoder = function() {
      var width, height;
      var transparent = null;
      var transIndex;
      var repeat = -1;
      var delay = 0;
      var started = false;
      var out = [];
      var image, pixels, indexedPixels;
      var colorDepth, colorTab;
      var usedEntry = [];
      var palSize = 7;
      var dispose = -1;
      var firstFrame = true;
      var sample = 10;
      this.setDelay = function(ms) { delay = Math.round(ms / 10); };
      this.setFrameRate = function(fps) { delay = Math.round(100 / fps); };
      this.setDispose = function(code) { if (code >= 0) dispose = code; };
      this.setRepeat = function(iter) { if (iter >= 0) repeat = iter; };
      this.setTransparent = function(c) { transparent = c; };
      this.addFrame = function(im) { if ((im === null) || !started) return false; image = im; getImagePixels(); analyzePixels(); if (firstFrame) { writeLSD(); writePalette(); if (repeat >= 0) { writeNetscapeExt(); } } writeGraphicCtrlExt(); writeImageDesc(); if (!firstFrame) writePalette(); writePixels(); firstFrame = false; return true; };
      this.finish = function() { if (!started) return false; started = false; out.push(0x3b); return true; };
      this.setQuality = function(q) { if (q < 1) q = 1; sample = q; };
      this.start = function() { out = []; writeString("GIF89a"); started = true; return true; };
      this.getOutput = function() { return new Uint8Array(out); };
      function analyzePixels() {
        var len = pixels.length, nPix = len / 3;
        indexedPixels = new Uint8Array(nPix);
        var nq = new NeuQuant(pixels, len, sample);
        colorTab = nq.buildColorMap();
        var k = 0;
        for (var j = 0; j < nPix; j++) { var index = nq.lookupRGB(pixels[k++] & 0xff, pixels[k++] & 0xff, pixels[k++] & 0xff); usedEntry[index] = true; indexedPixels[j] = index; }
        pixels = null;
        colorDepth = 8;
        palSize = 7;
        if (transparent !== null) { transIndex = findClosest(transparent); }
      }
      function findClosest(c) {
        if (colorTab === null) return -1;
        var r = (c & 0xFF0000) >> 16, g = (c & 0x00FF00) >> 8, b = (c & 0x0000FF);
        var minpos = 0, dmin = 256 * 256 * 256;
        var len = colorTab.length;
        for (var i = 0; i < len;) { var dr = r - (colorTab[i++] & 0xff), dg = g - (colorTab[i++] & 0xff), db = b - (colorTab[i++] & 0xff), d = dr * dr + dg * dg + db * db; if (d < dmin) { dmin = d; minpos = i / 3 | 0; } }
        return minpos;
      }
      function getImagePixels() { var w = width, h = height; pixels = new Uint8Array(w * h * 3); var data = image; var srcPos = 0, count = 0; for (var i = 0; i < h; i++) { for (var j = 0; j < w; j++) { pixels[count++] = data[srcPos++]; pixels[count++] = data[srcPos++]; pixels[count++] = data[srcPos++]; srcPos++; } } }
      function writeLSD() { writeShort(width); writeShort(height); out.push(0x80 | 0x70 | 0x00 | palSize); out.push(0); out.push(0); }
      function writeNetscapeExt() { out.push(0x21); out.push(0xff); out.push(11); writeString("NETSCAPE2.0"); out.push(3); out.push(1); writeShort(repeat); out.push(0); }
      function writePalette() { for (var i = 0; i < colorTab.length; i++) out.push(colorTab[i]); var n = (3 * 256) - colorTab.length; for (var j = 0; j < n; j++) out.push(0); }
      function writeShort(pValue) { out.push(pValue & 0xFF); out.push((pValue >> 8) & 0xFF); }
      function writeString(s) { for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); }
      function writeGraphicCtrlExt() { out.push(0x21); out.push(0xf9); out.push(4); var transp, disp; if (transparent === null) { transp = 0; disp = 0; } else { transp = 1; disp = 2; } if (dispose >= 0) disp = dispose & 7; disp <<= 2; out.push(0 | disp | 0 | transp); writeShort(delay); out.push(transIndex); out.push(0); }
      function writeImageDesc() { out.push(0x2c); writeShort(0); writeShort(0); writeShort(width); writeShort(height); if (firstFrame) out.push(0); else out.push(0x80 | palSize); }
      function writePixels() { var enc = new LZWEncoder(); enc.setWidth(width); enc.setHeight(height); enc.setPixels(indexedPixels); enc.setInitCodeSize(Math.max(2, colorDepth)); enc.encode({ writeByte: function(b) { out.push(b); }, writeBytes: function(arr, off, len) { for (var i = 0; i < len; i++) out.push(arr[off + i]); } }); }
      this.setSize = function(w, h) { width = w; height = h; };
    };

    self.onmessage = function(ev) {
      var data = ev.data;
      if (data.type === 'start') {
        var encoder = new GIFEncoder();
        encoder.setRepeat(0);
        encoder.setDelay(data.delay);
        encoder.setQuality(data.quality || 10);
        encoder.setSize(data.width, data.height);
        encoder.start();
        for (var i = 0; i < data.frames.length; i++) {
          encoder.addFrame(data.frames[i]);
          self.postMessage({ type: 'progress', progress: (i + 1) / data.frames.length });
        }
        encoder.finish();
        var output = encoder.getOutput();
        self.postMessage({ type: 'finished', data: output.buffer }, [output.buffer]);
      }
    };
  `;
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

// Render ASCII text to a canvas for export
function renderAsciiToCanvas(ascii, options = {}) {
  const {
    fontSize = 10,
    fontFamily = 'Courier New, monospace',
    textColor = options.textColor || '#00ff00',
    bgColor = options.bgColor || '#0a0a0a',
    padding = 20
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
  const { fps = 12, onProgress = () => {}, fontSize = 6, textColor, bgColor } = options;
  return new Promise((resolve, reject) => {
    // First, render all ASCII frames to canvases
    const renderedFrames = frames.map(f => renderAsciiToCanvas(f.ascii, { fontSize, textColor, bgColor }));

    if (renderedFrames.length === 0 || !renderedFrames[0]) {
      reject(new Error('No frames to export'));
      return;
    }

    const width = renderedFrames[0].width;
    const height = renderedFrames[0].height;
    const delay = Math.round(1000 / fps);

    // Extract RGBA data from each canvas
    const frameData = renderedFrames.map(canvas => {
      const ctx = canvas.getContext('2d');
      return ctx.getImageData(0, 0, width, height).data;
    });

    // Create worker from blob URL
    const workerURL = createWorkerBlobURL();
    const worker = new Worker(workerURL);

    worker.onmessage = function(ev) {
      if (ev.data.type === 'progress') {
        onProgress(ev.data.progress);
      } else if (ev.data.type === 'finished') {
        const blob = new Blob([ev.data.data], { type: 'image/gif' });
        const url = URL.createObjectURL(blob);
        worker.terminate();
        URL.revokeObjectURL(workerURL);
        resolve({ blob, url });
      }
    };

    worker.onerror = function(err) {
      worker.terminate();
      URL.revokeObjectURL(workerURL);
      reject(new Error('GIF encoding failed: ' + err.message));
    };

    // Send frames to worker
    worker.postMessage({
      type: 'start',
      frames: frameData,
      width: width,
      height: height,
      delay: delay,
      quality: 10
    });
  });
}

export function exportAsMp4(frames, options = {}) {
  const { fps = 12, onProgress = () => {}, fontSize = 6, textColor, bgColor } = options;
  return new Promise((resolve, reject) => {
    // First, render all ASCII frames to canvases
    const renderedFrames = frames.map(f => renderAsciiToCanvas(f.ascii, { fontSize, textColor, bgColor }));

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

    // Try MP4 first (Safari), then WebM with H264, then VP9/VP8
    const mimeTypes = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];

    let selectedMime = null;
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    if (!selectedMime) {
      reject(new Error('No supported video codec found for MP4/H264 encoding'));
      return;
    }

    try {
      recorder = new MediaRecorder(stream, { mimeType: selectedMime });
    } catch (err) {
      reject(new Error('MediaRecorder not available: ' + err.message));
      return;
    }

    recorder.ondataavailable = (ev) => {
      if (ev.data?.size) recordedChunks.push(ev.data);
    };

    recorder.onstop = () => {
      // Determine file extension based on actual mime type used
      const isActualMp4 = selectedMime.startsWith('video/mp4');
      const blobType = isActualMp4 ? 'video/mp4' : 'video/webm';
      const blob = new Blob(recordedChunks, { type: blobType });
      const url = URL.createObjectURL(blob);
      resolve({ blob, url, extension: isActualMp4 ? 'mp4' : 'webm' });
    };

    recorder.start();

    // Draw frames sequentially with timing
    const delay = 1000 / fps;
    let idx = 0;
    const drawNext = () => {
      if (idx >= renderedFrames.length) {
        setTimeout(() => recorder.stop(), 100);
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
