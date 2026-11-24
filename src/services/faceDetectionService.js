/**
 * THE BID — Authoritative Face Detection & Smart Auto-Framing Service
 * Uses picojs and cascade classifier for high-speed, local face detection.
 */

const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');

let pico = null;
let classifyRegion = null;

function initPico() {
  if (classifyRegion) return;
  try {
    // Ensure picojs loads cleanly
    try {
      pico = require('picojs');
    } catch (_picoErr) {
      try {
        pico = require('picojs/pico.js');
      } catch (_picoSubErr) {
        pico = null;
      }
    }
    const cascadePath = path.resolve(__dirname, '../ai/facefinder.bin');
    if (pico && fs.existsSync(cascadePath)) {
      const cascadeBytes = new Int8Array(fs.readFileSync(cascadePath));
      classifyRegion = pico.unpack_cascade(cascadeBytes);
      console.log('[FACE_DETECTION] Facefinder cascade successfully unpacked');
    } else {
      console.warn('[FACE_DETECTION] facefinder.bin not found or picojs unavailable at:', cascadePath);
    }
  } catch (err) {
    console.error('[FACE_DETECTION_INIT_ERROR]', err.message);
  }
}

/**
 * Converts RGBA buffer to grayscale array for pico
 */
function rgbaToGrayscale(rgba, nrows, ncols) {
  const gray = new Uint8Array(nrows * ncols);
  for (let r = 0; r < nrows; ++r) {
    for (let c = 0; c < ncols; ++c) {
      const idx = (r * ncols + c) * 4;
      // Standard luminance: 0.299 R + 0.587 G + 0.114 B
      gray[r * ncols + c] = (2 * rgba[idx] + 7 * rgba[idx + 1] + 1 * rgba[idx + 2]) / 10;
    }
  }
  return gray;
}

/**
 * Detects faces in a JPEG image buffer and calculates optimal auto-framing
 * @param {Buffer} imageBuffer - Raw JPEG buffer
 * @returns {Promise<{ detected: boolean, faces: Array, focusPoint: {x: number, y: number}, suggestedScale: number }>}
 */
async function detectFacesAndCalculateFraming(imageBuffer) {
  initPico();

  if (!classifyRegion || !imageBuffer) {
    return {
      detected: false,
      faces: [],
      focusPoint: { x: 0.5, y: 0.5 },
      suggestedScale: 1.0,
    };
  }

  try {
    // 1. Decode JPEG to RGBA
    const rawImage = jpeg.decode(imageBuffer, { useTArray: true, maxMemoryUsageInMB: 128 });
    const { width: origW, height: origH, data: rgba } = rawImage;

    if (!origW || !origH || !rgba) {
      return {
        detected: false,
        faces: [],
        focusPoint: { x: 0.5, y: 0.5 },
        suggestedScale: 1.0,
      };
    }

    // 2. Downscale for ultra-fast detection if image is large
    const maxDim = 360;
    const downscale = Math.max(1, Math.max(origW / maxDim, origH / maxDim));
    const targetW = Math.round(origW / downscale);
    const targetH = Math.round(origH / downscale);

    // Simple nearest-neighbor or linear subsample to target dimensions
    const downscaledRgba = new Uint8Array(targetW * targetH * 4);
    for (let y = 0; y < targetH; y++) {
      const srcY = Math.min(origH - 1, Math.round(y * downscale));
      for (let x = 0; x < targetW; x++) {
        const srcX = Math.min(origW - 1, Math.round(x * downscale));
        const srcIdx = (srcY * origW + srcX) * 4;
        const dstIdx = (y * targetW + x) * 4;
        downscaledRgba[dstIdx] = rgba[srcIdx];
        downscaledRgba[dstIdx + 1] = rgba[srcIdx + 1];
        downscaledRgba[dstIdx + 2] = rgba[srcIdx + 2];
        downscaledRgba[dstIdx + 3] = rgba[srcIdx + 3];
      }
    }

    // 3. Convert to Grayscale
    const gray = rgbaToGrayscale(downscaledRgba, targetH, targetW);

    // 4. Run Pico Cascade Classifier
    const imageObj = {
      pixels: gray,
      nrows: targetH,
      ncols: targetW,
      ldim: targetW,
    };

    const params = {
      shiftfactor: 0.1,
      minsize: 20,
      maxsize: Math.min(targetW, targetH),
      scalefactor: 1.1,
    };

    let rawDetections = pico.run_cascade(imageObj, classifyRegion, params);

    // 5. Cluster detections with non-maximum suppression
    rawDetections = pico.cluster_detections(rawDetections, 0.2);

    // 6. Filter by confidence score threshold (q > 5.0 indicates high-confidence face)
    const validDetections = rawDetections.filter((d) => d[3] > 4.5);

    if (validDetections.length === 0) {
      console.log('[FACE_DETECTION] No confident faces detected; using centered framing');
      return {
        detected: false,
        faces: [],
        focusPoint: { x: 0.5, y: 0.5 },
        suggestedScale: 1.0,
      };
    }

    // 7. Map detections back to normalized (0.0 - 1.0) coordinates
    // Each detection is [r (row/y), c (col/x), s (size/diameter), q (score)]
    const faces = validDetections.map((d) => {
      const centerY = (d[0] * downscale) / origH;
      const centerX = (d[1] * downscale) / origW;
      const sizeNorm = (d[2] * downscale) / Math.min(origW, origH);
      return {
        centerX: Math.max(0, Math.min(1, centerX)),
        centerY: Math.max(0, Math.min(1, centerY)),
        size: sizeNorm,
        score: d[3],
      };
    });

    console.log(`[FACE_DETECTION] Successfully detected ${faces.length} face(s)`);

    // 8. Calculate Framing
    if (faces.length === 1) {
      // Single person photo:
      // Focus on the face, including head and shoulders (center slightly lower than eyes)
      const face = faces[0];
      // Shift center 8% down to provide natural headroom and chest/shoulder framing
      const adjustedCenterY = Math.min(0.9, face.centerY + face.size * 0.15);

      // Desired face size in circular frame: approx 45% - 55% of circle
      const baseAspectScale = Math.max(240 / origW, 240 / origH);
      const facePixelSizeAtBase = face.size * Math.min(origW, origH) * baseAspectScale;
      let suggestedScale = 1.0;
      if (facePixelSizeAtBase > 0) {
        const targetFacePixels = 240 * 0.48; // 48% of 240px circle
        suggestedScale = Math.max(1.0, Math.min(2.2, targetFacePixels / facePixelSizeAtBase));
      }

      return {
        detected: true,
        faces,
        focusPoint: {
          x: face.centerX,
          y: adjustedCenterY,
        },
        suggestedScale: Math.round(suggestedScale * 100) / 100,
      };
    } else {
      // Multiple people photo:
      // Compute bounding box covering all detected faces so everyone fits
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      for (const f of faces) {
        const halfS = f.size / 2;
        minX = Math.min(minX, f.centerX - halfS);
        maxX = Math.max(maxX, f.centerX + halfS);
        minY = Math.min(minY, f.centerY - halfS);
        maxY = Math.max(maxY, f.centerY + halfS);
      }

      const groupCenterX = (minX + maxX) / 2;
      const groupCenterY = Math.min(0.9, (minY + maxY) / 2 + 0.05);

      return {
        detected: true,
        faces,
        focusPoint: {
          x: Math.max(0.1, Math.min(0.9, groupCenterX)),
          y: Math.max(0.1, Math.min(0.9, groupCenterY)),
        },
        suggestedScale: 1.05, // Slight zoom to frame group naturally
      };
    }
  } catch (err) {
    console.error('[FACE_DETECTION_ERROR]', err);
    return {
      detected: false,
      faces: [],
      focusPoint: { x: 0.5, y: 0.5 },
      suggestedScale: 1.0,
    };
  }
}

module.exports = {
  detectFacesAndCalculateFraming,
};
