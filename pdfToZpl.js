/**
 * In-browser PDF → ZPL {@code ^GFA} ASCII hex graphic for QZ raw printing (all pages by default).
 *
 * Raster: one pdf.js pass — {@code page.getViewport({ scale })} then {@code page.render} into the output canvas.
 * Base scale: {@code renderScale} if set, otherwise {@code printerDpi / 72} (default dpi 203). Optional
 * {@code fitMaxWidthDots} / {@code fitMaxHeightDots} (e.g. paper inches × DPI) with {@code labelFitPolicy}:
 * {@code shrink-if-needed} uses {@code min(base, sCap)}, {@code always-fit-box} uses {@code sCap} for uniform fit.
 * Scale is clamped 0.25–12 then reduced if {@code MAX_RASTER_PIXELS} would be exceeded.
 * UI preview PNG uses the same LUMA+threshold 1-bit as the packed {@code ^GFA} graphic.
 *
 * {@code imageSmoothing}: only when {@code true} (default off = sharper).
 *
 * Mono: QZ-style LUMA vs fixed {@code threshold}; optional {@code invert}. Pad width to 8, MSB-first hex.
 */
(function (global) {
  "use strict";

  /** Cap total RGBA pixels so mobile / huge pages do not OOM. */
  var MAX_RASTER_PIXELS = 24 * 1024 * 1024;

  /**
   * Default pdf.js worker (legacy UMD bundle). Must match the pdfjs-dist version
   * loaded in index.html / pdf-canvas-debug.html. Override with {@code window.__PDFJS_WORKER_URL__}.
   */
  var PDFJS_LEGACY_CDN_WORKER =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js";

  /**
   * @param {number} vp1w viewport width at scale 1
   * @param {number} vp1h viewport height at scale 1
   * @param {{
   *   renderScale?: number,
   *   printerDpi?: number,
   *   fitMaxWidthDots?: number,
   *   fitMaxHeightDots?: number,
   *   labelFitPolicy?: 'shrink-if-needed'|'always-fit-box'
   * }} [options]
   * @returns {{
   *   scale: number,
   *   rasterDpiUsed: number|null,
   *   memoryCapApplied?: boolean,
   *   labelBoxApplied?: boolean
   * }}
   */
  function resolveRenderScale(vp1w, vp1h, options) {
    var opt = options || {};
    var userSet =
      opt.renderScale != null &&
      Number.isFinite(Number(opt.renderScale)) &&
      Number(opt.renderScale) > 0;
    var rasterDpiUsed = null;
    var s;
    if (userSet) {
      s = Number(opt.renderScale);
    } else {
      var dpi =
        opt.printerDpi != null && Number.isFinite(Number(opt.printerDpi)) && Number(opt.printerDpi) > 0
          ? Number(opt.printerDpi)
          : 203;
      if (dpi < 72) {
        dpi = 72;
      }
      if (dpi > 600) {
        dpi = 600;
      }
      rasterDpiUsed = dpi;
      s = dpi / 72;
    }
    if (s < 0.25) {
      s = 0.25;
    }
    if (s > 12) {
      s = 12;
    }
    var labelBoxApplied = false;
    var fw = opt.fitMaxWidthDots;
    var fh = opt.fitMaxHeightDots;
    if (
      vp1w > 0 &&
      vp1h > 0 &&
      fw != null &&
      fh != null &&
      Number.isFinite(Number(fw)) &&
      Number.isFinite(Number(fh)) &&
      Number(fw) > 0 &&
      Number(fh) > 0
    ) {
      var sCap = Math.min(Number(fw) / vp1w, Number(fh) / vp1h);
      if (Number.isFinite(sCap) && sCap > 0) {
        sCap = Math.min(Math.max(sCap, 0.25), 12);
        var policy = opt.labelFitPolicy === "always-fit-box" ? "always-fit-box" : "shrink-if-needed";
        var sBeforeFit = s;
        if (policy === "always-fit-box") {
          s = sCap;
          labelBoxApplied = true;
        } else {
          s = Math.min(s, sCap);
          labelBoxApplied = s < sBeforeFit - 1e-9;
        }
      }
    }
    var w = Math.ceil(vp1w * s);
    var h = Math.ceil(vp1h * s);
    var memoryCapApplied = false;
    while (w * h > MAX_RASTER_PIXELS && s > 0.2501) {
      s = Math.max(0.25, s * 0.9);
      memoryCapApplied = true;
      w = Math.ceil(vp1w * s);
      h = Math.ceil(vp1h * s);
    }
    var out = { scale: s, rasterDpiUsed: rasterDpiUsed };
    if (memoryCapApplied) {
      out.memoryCapApplied = true;
    }
    if (labelBoxApplied) {
      out.labelBoxApplied = true;
    }
    return out;
  }

  function ensureWorker() {
    if (!global.pdfjsLib) {
      throw new Error(
        "pdf.js not loaded (include pdf.min.js from CDN before pdfToZpl.js; see index.html)."
      );
    }
    if (!global.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      global.pdfjsLib.GlobalWorkerOptions.workerSrc =
        global.__PDFJS_WORKER_URL__ || PDFJS_LEGACY_CDN_WORKER;
    }
  }

  /** QZ MonoImageConverter LUMA integer luma (Java int division). */
  function lumaQZ(r, g, b) {
    return ((r * 299 + g * 587 + b * 114) / 1000) | 0;
  }

  /** @returns {boolean} ink dot (black) after fixed luma threshold + optional invert */
  function pixelIsBlackLuma(r, g, b, a, threshold, invert) {
    var black = false;
    if (a < threshold) {
      black = false;
    } else {
      black = lumaQZ(r, g, b) < threshold;
    }
    return invert ? !black : black;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} threshold 0–255
   * @param {boolean} invert
   * @returns {{ packed: Uint8Array, width: number, paddedWidth: number, height: number, rowBytes: number }}
   */
  /**
   * RGBA canvas → new canvas showing the same 1-bit decision as {@link canvasToPackedMsbRowMajor} (for UI preview).
   * @param {HTMLCanvasElement} source
   * @param {number} threshold
   * @param {boolean} invert
   * @returns {HTMLCanvasElement}
   */
  function monoPreviewCanvasFromRgbaCanvas(source, threshold, invert) {
    var w = source.width;
    var h = source.height;
    var sctx = source.getContext("2d", { willReadFrequently: true });
    var img = sctx.getImageData(0, 0, w, h);
    var d = img.data;
    var out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    var octx = out.getContext("2d");
    var outImg = octx.createImageData(w, h);
    var od = outImg.data;
    var i;
    for (i = 0; i < d.length; i += 4) {
      var black = pixelIsBlackLuma(d[i], d[i + 1], d[i + 2], d[i + 3], threshold, invert);
      var v = black ? 0 : 255;
      od[i] = v;
      od[i + 1] = v;
      od[i + 2] = v;
      od[i + 3] = 255;
    }
    octx.putImageData(outImg, 0, 0);
    return out;
  }

  function canvasToPackedMsbRowMajor(canvas, threshold, invert) {
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var w = canvas.width;
    var h = canvas.height;
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    var padW = Math.ceil(w / 8) * 8;
    var rowBytes = padW / 8;
    var out = new Uint8Array(rowBytes * h);

    for (var y = 0; y < h; y++) {
      var rowOff = y * rowBytes;
      var srcBase = y * w * 4;
      for (var bx = 0; bx < padW; bx += 8) {
        var b = 0;
        for (var bit = 0; bit < 8; bit++) {
          var x = bx + bit;
          var black = false;
          if (x < w) {
            var i = srcBase + x * 4;
            var r = d[i];
            var g = d[i + 1];
            var bl = d[i + 2];
            var a = d[i + 3];
            black = pixelIsBlackLuma(r, g, bl, a, threshold, invert);
          }
          if (black) {
            b |= 1 << (7 - bit);
          }
        }
        out[rowOff + bx / 8] = b;
      }
    }
    return { packed: out, width: w, paddedWidth: padW, height: h, rowBytes: rowBytes };
  }

  function asciiToBytes(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) {
      out[i] = s.charCodeAt(i) & 255;
    }
    return out;
  }

  function concatUint8(parts) {
    var t = 0;
    var i;
    for (i = 0; i < parts.length; i++) {
      t += parts[i].length;
    }
    var out = new Uint8Array(t);
    var off = 0;
    for (i = 0; i < parts.length; i++) {
      out.set(parts[i], off);
      off += parts[i].length;
    }
    return out;
  }

  /** Packed row-major bytes → uppercase ASCII hex (two chars per byte). */
  function packedToHexAscii(packed) {
    var hex = "0123456789ABCDEF";
    var out = new Uint8Array(packed.length * 2);
    for (var i = 0; i < packed.length; i++) {
      var b = packed[i];
      out[i * 2] = hex.charCodeAt(b >> 4);
      out[i * 2 + 1] = hex.charCodeAt(b & 15);
    }
    return out;
  }

  /**
   * Zebra {@code ^GFA,b,c,d,<hex>} — same b,c,d convention as {@code ^GFB}; data is ASCII hex (uncompressed).
   * {@code ^PW} / {@code ^LL} match the padded raster so firmware does not clip to a smaller stored label width.
   *
   * @param {number} widthDots print width in dots (= padded row width, typically {@code rowBytes * 8})
   * @param {number} heightDots label length in dots (= row count / graphic height)
   */
  function buildGfaZplJobBytes(totalBytes, rowBytes, packed, widthDots, heightDots) {
    var wDots = Math.max(1, Math.round(widthDots != null ? widthDots : rowBytes * 8));
    var hDots = Math.max(1, Math.round(heightDots != null ? heightDots : totalBytes / rowBytes));
    var prefix =
      "^XA\n^PW" +
      wDots +
      "\n^LL" +
      hDots +
      "\n^FO0,0^GFA," +
      totalBytes +
      "," +
      totalBytes +
      "," +
      rowBytes +
      ",";
    return concatUint8([
      asciiToBytes(prefix),
      packedToHexAscii(packed),
      asciiToBytes("^FS\n^XZ\n"),
    ]);
  }

  /** Human-readable preview for textarea (hex body omitted). */
  function buildGfaZplPreviewText(totalBytes, rowBytes, bitW, bitH, widthDots, heightDots) {
    var wDots = Math.max(1, Math.round(widthDots != null ? widthDots : rowBytes * 8));
    var hDots = Math.max(1, Math.round(heightDots != null ? heightDots : totalBytes / rowBytes));
    return (
      "^XA\n^PW" +
      wDots +
      "\n^LL" +
      hDots +
      "\n^FO0,0^GFA," +
      totalBytes +
      "," +
      totalBytes +
      "," +
      rowBytes +
      ",<" +
      totalBytes * 2 +
      " hex chars, " +
      bitW +
      "×" +
      bitH +
      " px>\n^FS\n^XZ\n"
    );
  }

  /** @param {Uint8Array} u8 */
  function loadPdfDocument(u8) {
    ensureWorker();
    return global.pdfjsLib.getDocument({ data: u8, verbosity: 0 }).promise;
  }

  /**
   * @param {*} pdf pdf.js document
   * @param {number} pageNumber 1-based
   * @param {{
   *   renderScale?: number,
   *   printerDpi?: number,
   *   fitMaxWidthDots?: number,
   *   fitMaxHeightDots?: number,
   *   labelFitPolicy?: 'shrink-if-needed'|'always-fit-box',
   *   imageSmoothing?: boolean,
   * }} [options]
   */
  function renderOnePageFromPdf(pdf, pageNumber, options) {
    options = options || {};
    return pdf.getPage(pageNumber).then(function (page) {
      var vp1 = page.getViewport({ scale: 1 });
      var numPages = pdf.numPages;
      var resolved = resolveRenderScale(vp1.width, vp1.height, options);
      var scale = resolved.scale;
      var vp = page.getViewport({ scale: scale });
      var w = Math.ceil(vp.width);
      var h = Math.ceil(vp.height);
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = options.imageSmoothing === true;
      var renderTask = page.render({
        canvasContext: ctx,
        viewport: vp,
      });
      return renderTask.promise.then(function () {
        var row = {
          canvas: canvas,
          numPages: numPages,
          pageNumber: pageNumber,
          renderScaleUsed: scale,
          rasterDpiUsed: resolved.rasterDpiUsed,
          pdfWidthIn: vp1.width / 72,
          pdfHeightIn: vp1.height / 72,
          pdfWidthPt: vp1.width,
          pdfHeightPt: vp1.height,
        };
        if (resolved.memoryCapApplied) {
          row.rasterMemoryCapApplied = true;
        }
        if (resolved.labelBoxApplied) {
          row.labelBoxApplied = true;
        }
        return row;
      });
    });
  }

  /**
   * @param {ArrayBuffer|Uint8Array} pdfBytes
   * @param {{
   *   pageNumber?: number,
   *   renderScale?: number,
   *   printerDpi?: number,
   *   fitMaxWidthDots?: number,
   *   fitMaxHeightDots?: number,
   *   labelFitPolicy?: 'shrink-if-needed'|'always-fit-box',
   *   imageSmoothing?: boolean
   * }} [options]
   */
  function renderPageToCanvas(pdfBytes, options) {
    options = options || {};
    var u8 = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
    var pageNumber =
      options.pageNumber != null ? Number(options.pageNumber) : 1;
    if (!Number.isFinite(pageNumber) || pageNumber < 1) {
      pageNumber = 1;
    }
    return loadPdfDocument(u8).then(function (pdf) {
      return renderOnePageFromPdf(pdf, pageNumber, options);
    });
  }

  /**
   * @param {ArrayBuffer|Uint8Array} pdfBytes
   * @param {{
   *   threshold?: number,
   *   invert?: boolean,
   *   pageNumber?: number,
   *   allPages?: boolean,
   *   renderScale?: number,
   *   printerDpi?: number,
   *   fitMaxWidthDots?: number,
   *   fitMaxHeightDots?: number,
   *   labelFitPolicy?: 'shrink-if-needed'|'always-fit-box',
   *   includeRenderPreview?: boolean,
   *   imageSmoothing?: boolean
   * }} [options] {@code allPages}: {@code false} with {@code pageNumber} → single page only (default: all pages).
   * Set {@code includeRenderPreview: false} to skip PNG preview encoding.
   * @returns {Promise<{
   *   pages: Array<{
   *     pageNumber: number,
   *     zplJobBytes: Uint8Array,
   *     zplPreviewText: string,
   *     widthPx: number,
   *     paddedWidthDots: number,
   *     heightPx: number,
   *     rowBytes: number,
   *     totalBytes: number,
   *     renderScaleUsed: number,
   *     rasterDpiUsed?: number|null,
   *     rasterMemoryCapApplied?: boolean,
   *     labelBoxApplied?: boolean,
   *     pdfWidthIn: number,
   *     pdfHeightIn: number,
   *     pdfWidthPt: number,
   *     pdfHeightPt: number,
   *     renderedWidthIn: number,
   *     renderedHeightIn: number,
   *     renderedWidthDots: number,
   *     renderedHeightDots: number,
   *     previewPngBlob: Blob|null,
   *     previewCanvasWidthPx: number,
   *     previewCanvasHeightPx: number
   *   }>,
   *   zplJobBytes: Uint8Array,
   *   zplPreviewText: string,
   *   widthPx: number,
   *   paddedWidthDots: number,
   *   heightPx: number,
   *   rowBytes: number,
   *   totalBytes: number,
   *   numPages: number,
   *   renderScaleUsed: number,
   *   rasterDpiUsed?: number|null,
   *   rasterMemoryCapApplied?: boolean,
   *   labelBoxApplied?: boolean,
   *   fitMaxWidthDots?: number,
   *   fitMaxHeightDots?: number,
   *   labelFitPolicy?: string,
   *   pdfWidthIn?: number,
   *   pdfHeightIn?: number,
   *   pdfWidthPt?: number,
   *   pdfHeightPt?: number,
   *   renderedWidthIn?: number,
   *   renderedHeightIn?: number,
   *   renderedWidthDots?: number,
   *   renderedHeightDots?: number,
   *   previewPngBlob: Blob|null,
   *   previewPngBlobs: (Blob|null)[]|null,
   *   previewCanvasWidthPx: number,
   *   previewCanvasHeightPx: number,
   *   convertWallMs: number
   * }>}
   */
  function convertPdfToZpl(pdfBytes, options) {
    options = options || {};
    var t0 =
      typeof global.performance !== "undefined" && global.performance.now
        ? global.performance.now()
        : Date.now();
    var includeRenderPreview = options.includeRenderPreview !== false;
    var threshold =
      options.threshold != null ? Number(options.threshold) : 127;
    if (!Number.isFinite(threshold)) {
      threshold = 127;
    }
    threshold = Math.max(0, Math.min(255, threshold));
    var invert = !!options.invert;
    var allPages = options.allPages !== false;
    var u8 = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);

    return loadPdfDocument(u8).then(function (pdf) {
      var numPages = pdf.numPages;
      var indices = [];
      var k;
      if (allPages) {
        for (k = 1; k <= numPages; k++) {
          indices.push(k);
        }
      } else {
        var pn = options.pageNumber != null ? Number(options.pageNumber) : 1;
        if (!Number.isFinite(pn) || pn < 1) {
          pn = 1;
        }
        if (pn > numPages) {
          pn = numPages;
        }
        indices.push(pn);
      }

      function renderIndex(idx, pagesSoFar) {
        if (idx >= indices.length) {
          return Promise.resolve(pagesSoFar);
        }
        var pnum = indices[idx];
        return renderOnePageFromPdf(pdf, pnum, options).then(function (res) {
          var canvas = res.canvas;
          var cw = canvas.width;
          var ch = canvas.height;
          var bitInfo = canvasToPackedMsbRowMajor(canvas, threshold, invert);
          var totalBytes = bitInfo.packed.length;
          var zplJobBytes = buildGfaZplJobBytes(
            totalBytes,
            bitInfo.rowBytes,
            bitInfo.packed,
            bitInfo.paddedWidth,
            bitInfo.height
          );
          var zplPreviewText = buildGfaZplPreviewText(
            totalBytes,
            bitInfo.rowBytes,
            bitInfo.width,
            bitInfo.height,
            bitInfo.paddedWidth,
            bitInfo.height
          );

          function pushAndContinue(previewBlob) {
            var rs = res.renderScaleUsed != null ? res.renderScaleUsed : 1;
            var dpiLine =
              res.rasterDpiUsed != null &&
              Number.isFinite(res.rasterDpiUsed) &&
              res.rasterDpiUsed > 0
                ? res.rasterDpiUsed
                : rs * 72;
            var renderedWidthIn = bitInfo.width / dpiLine;
            var renderedHeightIn = bitInfo.height / dpiLine;
            pagesSoFar.push({
              pageNumber: pnum,
              zplJobBytes: zplJobBytes,
              zplPreviewText: zplPreviewText,
              widthPx: bitInfo.width,
              paddedWidthDots: bitInfo.paddedWidth,
              heightPx: bitInfo.height,
              rowBytes: bitInfo.rowBytes,
              totalBytes: totalBytes,
              renderScaleUsed: rs,
              rasterDpiUsed: res.rasterDpiUsed,
              rasterMemoryCapApplied: !!res.rasterMemoryCapApplied,
              labelBoxApplied: !!res.labelBoxApplied,
              pdfWidthIn: res.pdfWidthIn,
              pdfHeightIn: res.pdfHeightIn,
              pdfWidthPt: res.pdfWidthPt,
              pdfHeightPt: res.pdfHeightPt,
              renderedWidthIn: renderedWidthIn,
              renderedHeightIn: renderedHeightIn,
              renderedWidthDots: bitInfo.width,
              renderedHeightDots: bitInfo.height,
              previewPngBlob: previewBlob,
              previewCanvasWidthPx: cw,
              previewCanvasHeightPx: ch,
            });
            canvas.width = 0;
            canvas.height = 0;
            return renderIndex(idx + 1, pagesSoFar);
          }

          if (!includeRenderPreview || !cw || !ch) {
            return pushAndContinue(null);
          }
          var monoPrev = monoPreviewCanvasFromRgbaCanvas(canvas, threshold, invert);
          return new Promise(function (resolve) {
            monoPrev.toBlob(function (blob) {
              monoPrev.width = 0;
              monoPrev.height = 0;
              resolve(pushAndContinue(blob || null));
            }, "image/png");
          });
        });
      }

      return renderIndex(0, []).then(function (rows) {
        var t1 =
          typeof global.performance !== "undefined" && global.performance.now
            ? global.performance.now()
            : Date.now();
        var convertWallMs = Math.round((t1 - t0) * 100) / 100;
        var jobParts = [];
        var previewParts = [];
        var blobs = [];
        var totalByteSum = 0;
        var i;
        for (i = 0; i < rows.length; i++) {
          jobParts.push(rows[i].zplJobBytes);
          previewParts.push(
            "--- page " + rows[i].pageNumber + " / " + numPages + " ---\n" + rows[i].zplPreviewText
          );
          blobs.push(rows[i].previewPngBlob);
          totalByteSum += rows[i].totalBytes;
        }
        var combinedJob = concatUint8(jobParts);
        var combinedPreview = previewParts.join("\n\n");
        var first = rows[0];
        var out = {
          pages: rows,
          zplJobBytes: combinedJob,
          zplPreviewText: combinedPreview,
          widthPx: first ? first.widthPx : 0,
          paddedWidthDots: first ? first.paddedWidthDots : 0,
          heightPx: first ? first.heightPx : 0,
          rowBytes: first ? first.rowBytes : 0,
          totalBytes: totalByteSum,
          numPages: numPages,
          renderScaleUsed: first ? first.renderScaleUsed : 1,
          previewPngBlob: first && first.previewPngBlob ? first.previewPngBlob : null,
          previewPngBlobs: includeRenderPreview ? blobs : null,
          previewCanvasWidthPx: first ? first.previewCanvasWidthPx : 0,
          previewCanvasHeightPx: first ? first.previewCanvasHeightPx : 0,
          convertWallMs: convertWallMs,
        };
        if (first && first.rasterDpiUsed != null) {
          out.rasterDpiUsed = first.rasterDpiUsed;
        }
        if (rows.some(function (r) { return r.rasterMemoryCapApplied; })) {
          out.rasterMemoryCapApplied = true;
        }
        if (rows.some(function (r) { return r.labelBoxApplied; })) {
          out.labelBoxApplied = true;
        }
        if (
          options.fitMaxWidthDots != null &&
          options.fitMaxHeightDots != null &&
          Number(options.fitMaxWidthDots) > 0 &&
          Number(options.fitMaxHeightDots) > 0
        ) {
          out.fitMaxWidthDots = Number(options.fitMaxWidthDots);
          out.fitMaxHeightDots = Number(options.fitMaxHeightDots);
        }
        if (options.labelFitPolicy != null) {
          out.labelFitPolicy = options.labelFitPolicy;
        }
        if (first) {
          out.pdfWidthIn = first.pdfWidthIn;
          out.pdfHeightIn = first.pdfHeightIn;
          out.pdfWidthPt = first.pdfWidthPt;
          out.pdfHeightPt = first.pdfHeightPt;
          out.renderedWidthIn = first.renderedWidthIn;
          out.renderedHeightIn = first.renderedHeightIn;
          out.renderedWidthDots = first.renderedWidthDots;
          out.renderedHeightDots = first.renderedHeightDots;
        }
        return out;
      });
    });
  }

  global.PdfToZpl = {
    convertPdfToZpl: convertPdfToZpl,
  };
})(typeof window !== "undefined" ? window : this);
