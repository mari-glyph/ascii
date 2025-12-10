// asciiRenderer.js
// Exports: renderAsciiFrame(options) -> returns { text, canvasBitmap }
// The renderer keeps your original rendering logic but packaged as a function
// that accepts parameters (width, brightness, contrast, blur, charset, edgeMethod, etc.)

/*
Options shape:
{
  image: HTMLImageElement or ImageBitmap,
  asciiWidth: number,
  blockSize: number, // pixel block size for detail (1 = full detail, higher = more pixelated)
  brightness: number,
  contrast: number,
  blur: number, // px
  dithering: boolean,
  ditherAlgorithm: 'floyd'|'atkinson'|'noise'|'ordered',
  invert: boolean,
  ignoreWhite: boolean,
  charset: 'dense'|'standard'|...|'manual',
  manualCharset: string,
  edgeMethod: 'none'|'sobel'|'dog',
  edgeThreshold: number,
  dogThreshold: number,
  fontAspectRatio: number (optional)
}
*/

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Gaussian kernel generator and 2D convolution (kept from original)
function gaussianKernel2D(sigma, kernelSize) {
  const kernel = [];
  const half = Math.floor(kernelSize / 2);
  let sum = 0;
  for (let y = -half; y <= half; y++) {
    const row = [];
    for (let x = -half; x <= half; x++) {
      const value = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
      row.push(value);
      sum += value;
    }
    kernel.push(row);
  }
  for (let y = 0; y < kernelSize; y++) {
    for (let x = 0; x < kernelSize; x++) {
      kernel[y][x] /= sum;
    }
  }
  return kernel;
}

function convolve2D(img, kernel) {
  const height = img.length, width = img[0].length;
  const kernelSize = kernel.length, half = Math.floor(kernelSize / 2);
  const out = [];
  for (let y = 0; y < height; y++) {
    out[y] = [];
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const yy = y + ky - half;
          const xx = x + kx - half;
          const pixel = (yy >= 0 && yy < height && xx >= 0 && xx < width) ? img[yy][xx] : 0;
          sum += pixel * kernel[ky][kx];
        }
      }
      out[y][x] = sum;
    }
  }
  return out;
}

function differenceOfGaussians2D(gray, sigma1, sigma2, kernelSize) {
  const k1 = gaussianKernel2D(sigma1, kernelSize);
  const k2 = gaussianKernel2D(sigma2, kernelSize);
  const b1 = convolve2D(gray, k1);
  const b2 = convolve2D(gray, k2);
  const h = gray.length, w = gray[0].length;
  const dog = [];
  for (let y = 0; y < h; y++) {
    dog[y] = [];
    for (let x = 0; x < w; x++) {
      dog[y][x] = b1[y][x] - b2[y][x];
    }
  }
  return dog;
}

function applySobel2D(img, width, height) {
  const mag = [], angle = [];
  for (let y = 0; y < height; y++) {
    mag[y] = []; angle[y] = [];
    for (let x = 0; x < width; x++) { mag[y][x] = 0; angle[y][x] = 0; }
  }
  const kx = [[-1,0,1],[-2,0,2],[-1,0,1]];
  const ky = [[-1,-2,-1],[0,0,0],[1,2,1]];
  for (let y = 1; y < height-1; y++) {
    for (let x = 1; x < width-1; x++) {
      let Gx=0, Gy=0;
      for (let ky_i=-1; ky_i<=1; ky_i++) {
        for (let kx_i=-1; kx_i<=1; kx_i++) {
          const p = img[y+ky_i][x+kx_i];
          Gx += p * kx[ky_i+1][kx_i+1];
          Gy += p * ky[ky_i+1][kx_i+1];
        }
      }
      const g = Math.sqrt(Gx*Gx + Gy*Gy);
      mag[y][x] = g;
      let theta = Math.atan2(Gy, Gx) * (180/Math.PI);
      if (theta < 0) theta += 180;
      angle[y][x] = theta;
    }
  }
  return { mag, angle };
}

function nonMaxSuppression(mag, angle, width, height) {
  const suppressed = [];
  for (let y=0;y<height;y++){ suppressed[y]=[]; for(let x=0;x<width;x++) suppressed[y][x]=0; }
  for (let y=1;y<height-1;y++){
    for (let x=1;x<width-1;x++){
      const current = mag[y][x];
      let n1=0, n2=0;
      const theta = angle[y][x];
      if ((theta>=0 && theta<22.5) || (theta>=157.5 && theta<=180)) {
        n1 = mag[y][x-1]; n2 = mag[y][x+1];
      } else if (theta>=22.5 && theta<67.5) {
        n1 = mag[y-1][x+1]; n2 = mag[y+1][x-1];
      } else if (theta>=67.5 && theta<112.5) {
        n1 = mag[y-1][x]; n2 = mag[y+1][x];
      } else if (theta>=112.5 && theta<157.5) {
        n1 = mag[y-1][x-1]; n2 = mag[y+1][x+1];
      }
      suppressed[y][x] = (current >= n1 && current >= n2) ? current : 0;
    }
  }
  return suppressed;
}

// Helper to apply simple 3x3 sobel on a 1D grayscale array (kept from original)
function applyEdgeDetection1D(gray, width, height, threshold) {
  const edges = new Array(width*height).fill(255);
  for (let y=1;y<height-1;y++){
    for (let x=1;x<width-1;x++){
      const idx = y*width+x;
      const a = gray[(y-1)*width + (x-1)];
      const b = gray[(y-1)*width + x];
      const c = gray[(y-1)*width + (x+1)];
      const d = gray[y*width + (x-1)];
      const e = gray[y*width + x];
      const f = gray[y*width + (x+1)];
      const g = gray[(y+1)*width + (x-1)];
      const h = gray[(y+1)*width + x];
      const i = gray[(y+1)*width + (x+1)];
      const Gx = (-1*a) + (0*b) + (1*c) + (-2*d) + (0*e) + (2*f) + (-1*g) + (0*h) + (1*i);
      const Gy = (-1*a) + (-2*b) + (-1*c) + (0*d) + (0*e) + (0*f) + (1*g) + (2*h) + (1*i);
      const mag = Math.sqrt(Gx*Gx + Gy*Gy);
      const normalized = (mag / 1442) * 255;
      edges[idx] = normalized > threshold ? 0 : 255;
    }
  }
  return edges;
}

// Map charset key to string (kept your gradients)
function charsetToGradient(charset, manualCharset = '@#%*+=-:. ') {
  switch (charset) {
    case 'standard': return "@%#*+=-:. ";
    case 'blocks': return "█▓▒░ ";
    case 'binary': return "01";
    case 'manual': return manualCharset || '@#%*+=-:. ';
    case 'hex': return "0123456789ABCDEF";
    case 'dense':
    default:
      return "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^'. ";
  }
}

/**
 * renderAsciiFrame(options)
 * Returns a Promise resolving to { ascii: string, canvas: HTMLCanvasElement }
 *
 * This function draws the resized image to the provided internal canvas (off-screen),
 * reads back pixel data, applies brightness/contrast/blur/dither/edges, and builds the ascii string.
 *
 * NOTES:
 * - The function returns the ASCII string and a canvas element containing the scaled image
 *   (useful for capturing frames or previewing).
 * - For performance, avoid calling this at huge ascii widths for many frames — consider generating
 *   lower-res intermediate frames or using OffscreenCanvas/Worker for heavy loads.
 */
export async function renderAsciiFrame(options) {
  const {
    image,
    asciiWidth = 120,
    blockSize = 1,
    brightness = 0,
    contrast = 0,
    blur = 0,
    dithering = true,
    ditherAlgorithm = 'floyd',
    invert = false,
    ignoreWhite = true,
    charset = 'dense',
    manualCharset = '@#%*+=-:. ',
    edgeMethod = 'none',
    edgeThreshold = 100,
    dogThreshold = 100,
    fontAspectRatio = 0.55
  } = options;

  // Create offscreen canvas (regular canvas is fine in main thread)
  const canvas = document.createElement('canvas');
  // Compute ascii height by aspect ratio to keep characters roughly square-ish
  const asciiHeight = Math.round((image.height / image.width) * asciiWidth * fontAspectRatio);
  canvas.width = asciiWidth;
  canvas.height = asciiHeight;
  const ctx = canvas.getContext('2d');

  // Apply blur via canvas filter (browser support required)
  ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';

  // For blockSize > 1, first draw to a smaller canvas then scale up (pixelate effect)
  if (blockSize > 1) {
    // Create a temporary small canvas
    const smallWidth = Math.max(1, Math.ceil(asciiWidth / blockSize));
    const smallHeight = Math.max(1, Math.ceil(asciiHeight / blockSize));
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = smallWidth;
    tempCanvas.height = smallHeight;
    const tempCtx = tempCanvas.getContext('2d');

    // Draw image scaled down to small canvas
    tempCtx.drawImage(image, 0, 0, smallWidth, smallHeight);

    // Draw small canvas scaled up to main canvas with nearest-neighbor (pixelated)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, asciiWidth, asciiHeight);
  } else {
    // Draw the image scaled to ascii dims normally
    ctx.drawImage(image, 0, 0, asciiWidth, asciiHeight);
  }

  // Read pixel data
  const imageData = ctx.getImageData(0, 0, asciiWidth, asciiHeight);
  const data = imageData.data;

  // Precompute contrast factor
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  // Flatten grayscale buffers
  const gray = new Array(asciiWidth * asciiHeight);
  const grayOriginal = new Array(asciiWidth * asciiHeight);

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    let lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
    if (invert) lum = 255 - lum;
    const adjusted = clamp(contrastFactor * (lum - 128) + 128 + brightness, 0, 255);
    gray[j] = adjusted;
    grayOriginal[j] = adjusted;
  }

  const gradient = charsetToGradient(charset, manualCharset);
  const nLevels = gradient.length;

  // Edge path: DOG (contour) is a specialized path; sobel uses a simple map
  if (edgeMethod === 'dog') {
    // Build 2D gray array
    const gray2d = [];
    for (let y=0;y<asciiHeight;y++) {
      gray2d[y] = [];
      for (let x=0;x<asciiWidth;x++) {
        gray2d[y][x] = gray[y*asciiWidth + x];
      }
    }
    const sigma1 = 0.5, sigma2 = 1.0, kernelSize = 3;
    const dog = differenceOfGaussians2D(gray2d, sigma1, sigma2, kernelSize);
    const { mag, angle } = applySobel2D(dog, asciiWidth, asciiHeight);
    const suppressed = nonMaxSuppression(mag, angle, asciiWidth, asciiHeight);

    // Build ASCII using edge orientation characters
    let ascii = "";
    for (let y=0;y<asciiHeight;y++) {
      let line = "";
      for (let x=0;x<asciiWidth;x++) {
        if (suppressed[y][x] > dogThreshold) {
          let adjustedAngle = (angle[y][x] + 90) % 180;
          let edgeChar = (adjustedAngle < 22.5 || adjustedAngle >= 157.5) ? "-" :
                         (adjustedAngle < 67.5) ? "/" :
                         (adjustedAngle < 112.5) ? "|" : "\\";
          line += edgeChar;
        } else {
          line += " ";
        }
      }
      ascii += line + "\n";
    }
    return { ascii, canvas };
  }

  // Sobel path or regular/dithered mapping
  if (edgeMethod === 'sobel') {
    const sobelArr = applyEdgeDetection1D(gray, asciiWidth, asciiHeight, edgeThreshold);
    // Create simple mapping: edge -> character (using gradient extremes)
    let ascii = "";
    for (let y=0;y<asciiHeight;y++) {
      let line = "";
      for (let x=0;x<asciiWidth;x++) {
        const idx = y*asciiWidth + x;
        if (ignoreWhite && grayOriginal[idx] === 255) { line += " "; continue; }
        if (sobelArr[idx] === 0) {
          // Strong edge
          line += "#";
        } else {
          const computed = Math.round((gray[idx] / 255) * (nLevels - 1));
          line += gradient.charAt(computed);
        }
      }
      ascii += line + "\n";
    }
    return { ascii, canvas };
  }

  // Dithering options or plain mapping
  if (dithering) {
    // Copy gray to operate on
    const g = gray.slice();

    if (ditherAlgorithm === 'floyd') {
      let ascii = "";
      for (let y=0;y<asciiHeight;y++) {
        let line = "";
        for (let x=0;x<asciiWidth;x++) {
          const idx = y*asciiWidth + x;
          if (ignoreWhite && grayOriginal[idx] === 255) { line += " "; continue; }
          let level = Math.round((g[idx] / 255) * (nLevels - 1));
          line += gradient.charAt(level);
          const newPixel = (level / (nLevels - 1)) * 255;
          const error = g[idx] - newPixel;
          if (x + 1 < asciiWidth) g[idx + 1] = clamp(g[idx + 1] + error * (7/16), 0, 255);
          if (x - 1 >= 0 && y + 1 < asciiHeight) g[idx - 1 + asciiWidth] = clamp(g[idx - 1 + asciiWidth] + error * (3/16), 0, 255);
          if (y + 1 < asciiHeight) g[idx + asciiWidth] = clamp(g[idx + asciiWidth] + error * (5/16), 0, 255);
          if (x + 1 < asciiWidth && y + 1 < asciiHeight) g[idx + asciiWidth + 1] = clamp(g[idx + asciiWidth + 1] + error * (1/16), 0, 255);
        }
        ascii += line + "\n";
      }
      return { ascii, canvas };
    } else if (ditherAlgorithm === 'atkinson') {
      let ascii = "";
      for (let y=0;y<asciiHeight;y++) {
        let line = "";
        for (let x=0;x<asciiWidth;x++) {
          const idx = y*asciiWidth + x;
          if (ignoreWhite && grayOriginal[idx] === 255) { line += " "; continue; }
          let level = Math.round((g[idx] / 255) * (nLevels - 1));
          line += gradient.charAt(level);
          const newPixel = (level / (nLevels - 1)) * 255;
          const error = g[idx] - newPixel;
          const diffusion = error / 8;
          if (x + 1 < asciiWidth) g[idx + 1] = clamp(g[idx + 1] + diffusion, 0, 255);
          if (x + 2 < asciiWidth) g[idx + 2] = clamp(g[idx + 2] + diffusion, 0, 255);
          if (y + 1 < asciiHeight) {
            if (x - 1 >= 0) g[idx - 1 + asciiWidth] = clamp(g[idx - 1 + asciiWidth] + diffusion, 0, 255);
            g[idx + asciiWidth] = clamp(g[idx + asciiWidth] + diffusion, 0, 255);
            if (x + 1 < asciiWidth) g[idx + asciiWidth + 1] = clamp(g[idx + asciiWidth + 1] + diffusion, 0, 255);
          }
          if (y + 2 < asciiHeight) g[idx + 2*asciiWidth] = clamp(g[idx + 2*asciiWidth] + diffusion, 0, 255);
        }
        ascii += line + "\n";
      }
      return { ascii, canvas };
    } else if (ditherAlgorithm === 'noise') {
      let ascii = "";
      for (let y=0;y<asciiHeight;y++) {
        let line = "";
        for (let x=0;x<asciiWidth;x++) {
          const idx = y*asciiWidth + x;
          if (ignoreWhite && grayOriginal[idx] === 255) { line += " "; continue; }
          const noise = (Math.random() - 0.5) * (255 / nLevels);
          const noisy = clamp(g[idx] + noise, 0, 255);
          const lvl = Math.round((noisy / 255) * (nLevels - 1));
          line += gradient.charAt(lvl);
        }
        ascii += line + "\n";
      }
      return { ascii, canvas };
    } else if (ditherAlgorithm === 'ordered') {
      const bayer = [
        [0,8,2,10],
        [12,4,14,6],
        [3,11,1,9],
        [15,7,13,5]
      ];
      const n = 4;
      let ascii = "";
      for (let y=0;y<asciiHeight;y++) {
        let line = "";
        for (let x=0;x<asciiWidth;x++) {
          const idx = y*asciiWidth + x;
          if (ignoreWhite && grayOriginal[idx] === 255) { line += " "; continue; }
          const p = g[idx]/255;
          const t = (bayer[y % n][x % n] + 0.5) / (n*n);
          let v = p + t - 0.5;
          v = Math.min(Math.max(v, 0), 1);
          let level = Math.floor(v * nLevels);
          if (level >= nLevels) level = nLevels - 1;
          line += gradient.charAt(level);
        }
        ascii += line + "\n";
      }
      return { ascii, canvas };
    }
  }

  // No dithering: simple mapping
  let ascii = "";
  for (let y=0;y<asciiHeight;y++) {
    let line = "";
    for (let x=0;x<asciiWidth;x++) {
      const idx = y*asciiWidth + x;
      if (ignoreWhite && grayOriginal[idx] === 255) { line += " "; continue; }
      const computed = Math.round((gray[idx] / 255) * (nLevels - 1));
      line += gradient.charAt(computed);
    }
    ascii += line + "\n";
  }

  return { ascii, canvas };
}