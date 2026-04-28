(function () {
  "use strict";

  /** Last in-browser ZPL job: raw bytes (^GFA hex graphic) for QZ / TCP print (all pages concatenated). */
  var lastBrowserZplJobBytes = null;

  /** WebUSB: we have successfully opened a printer once on this origin (localStorage). */
  var LS_USB_PAIRED = "qzTrayClientUsbPaired";
  /** WebUSB: "1" = run remembered connect on load; "0" = never auto-connect. */
  var LS_USB_AUTO = "qzTrayClientUsbAutoReconnect";

  /** PNG blob for page 1 preview download shortcut. */
  var lastBrowserZplPreviewBlob = null;

  /** All page preview blobs (same order as PDF); used for multi-page PNG download. */
  var lastBrowserZplPreviewBlobs = null;

  /** Demo certificate chain (same PEM as QZ Tray sample). Inline so file:// works without a server or fetch. */
  var DEMO_CERT = `-----BEGIN CERTIFICATE-----
MIIE9TCCAt2gAwIBAgIQNzkyMDI0MTIyMDE5MDI0NDANBgkqhkiG9w0BAQsFADCB
mDELMAkGA1UEBhMCVVMxCzAJBgNVBAgMAk5ZMRswGQYDVQQKDBJRWiBJbmR1c3Ry
aWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMsIExMQzEZMBcGA1UEAwwQ
cXppbmR1c3RyaWVzLmNvbTEnMCUGCSqGSIb3DQEJARYYc3VwcG9ydEBxemluZHVz
dHJpZXMuY29tMB4XDTI0MTIyMDE5MDI0NFoXDTI5MTIyMDE4NTMxOVowga4xFjAU
BgNVBAYMDVVuaXRlZCBTdGF0ZXMxCzAJBgNVBAgMAk5ZMRIwEAYDVQQHDAlDYW5h
c3RvdGExGzAZBgNVBAoMElFaIEluZHVzdHJpZXMsIExMQzEbMBkGA1UECwwSUVog
SW5kdXN0cmllcywgTExDMRswGQYDVQQDDBJRWiBJbmR1c3RyaWVzLCBMTEMxHDAa
BgkqhkiG9w0BCQEMDXN1cHBvcnRAcXouaW8wggEiMA0GCSqGSIb3DQEBAQUAA4IB
DwAwggEKAoIBAQC+j6ewVhtLHbY3uBNgqNB5DSz+QX9Pz5Dm46bI9vt/Q1Q6BL8I
dhaxT2PA1AY0fqQgkzlSrwqNCjWZcrNZRw/e54FGM8zf3azbHrQif6d7Wo1JK5oN
kI3jdB54YVwHIAt6i3BcLIvyOHsPnrKjlpROz72Kx1kK5g0gLDuH5RYVM9KFK+HR
fBc3JSfeg8nUkTqYJVzlT5AGRWPXeDWloqQqSyuB1t8DihNBReWyJHQ7a4yerLOI
J6N0jAlLDx9yt9UznAxnoO+7tKBfxCbNJerGfePMOwRKq0gx+r8M/FTrAoj+yc+T
SOYtuY/VZ79HCTP/vLgm1pGyrta1we24fVezAgMBAAGjIzAhMB8GA1UdIwQYMBaA
FJCmULeE1LnqX/IFhBN4ReipdVRcMA0GCSqGSIb3DQEBCwUAA4ICAQAMvfp931Zt
PgfqGXSrsM+GAVBxcRVm14MyldWfRr+MVaFZ6cH7c+fSs8hUt2qNPwHrnpK9eev5
MPUL27hjfiTPwv1ojLJ180aMO0ZAfPfnKeLO8uTzY7GiPQeGK7Qh39kX9XxEOidG
rMwfllZ6jJReS0ZGaX8LUXhh9RHGSYJhxgyUV7clB/dJch8Bbcd+DOxwc1POUHx1
wWExKkoWzHCCYNvqxLC9p1eO2Elz9J9ynDjXtCBl7lssnoSUKtahBCKgN5tYmZZK
NErKPQpbYk5yTEK1gybxhup8i2sGEJXZ9HRJLAl0UxB+eCu1ExWv7eGbcbIZJbeh
bwRf03fatsqzCQbGboLWtMQfcxHrEu+5MdZwOFx8i+c0c2WYad2MkkzGYHBVHPtY
o+PR61uIwJC2mNkPpX94CIFxSHyZumttyVKF4AhIPm9IMGTHaIr5M39zesQpVc7N
VIgxmMuePBrLyh6vKvuqD7W3S2HWA/8IUX703tdhoXhv5lNo1j0oywSrrUkCvUvJ
FjPS8+VUtVZNl7SVetQTexdcUwoADj6c1UwL9QWItskJ5Myesco3ZY0O+3QbgCuQ
SRqN5D0qdaLNMdEwh1YekUp4i1jm0jzPzia+WvJrW1k1ZafV6ep+YkMBkC1SFYFw
1Mdy+fYGyXlSn/Mvou//SSb0fUMIpXE9NA==
-----END CERTIFICATE-----
--START INTERMEDIATE CERT--
-----BEGIN CERTIFICATE-----
MIIFEjCCA/qgAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwgawxCzAJBgNVBAYTAlVT
MQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYDVQQKDBJRWiBJ
bmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMsIExMQzEZMBcG
A1UEAwwQcXppbmR1c3RyaWVzLmNvbTEnMCUGCSqGSIb3DQEJARYYc3VwcG9ydEBx
emluZHVzdHJpZXMuY29tMB4XDTE1MDMwMjAwNTAxOFoXDTM1MDMwMjAwNTAxOFow
gZgxCzAJBgNVBAYTAlVTMQswCQYDVQQIDAJOWTEbMBkGA1UECgwSUVogSW5kdXN0
cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMxGTAXBgNVBAMM
EHF6aW5kdXN0cmllcy5jb20xJzAlBgkqhkiG9w0BCQEWGHN1cHBvcnRAcXppbmR1
c3RyaWVzLmNvbTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBANTDgNLU
iohl/rQoZ2bTMHVEk1mA020LYhgfWjO0+GsLlbg5SvWVFWkv4ZgffuVRXLHrwz1H
YpMyo+Zh8ksJF9ssJWCwQGO5ciM6dmoryyB0VZHGY1blewdMuxieXP7Kr6XD3GRM
GAhEwTxjUzI3ksuRunX4IcnRXKYkg5pjs4nLEhXtIZWDLiXPUsyUAEq1U1qdL1AH
EtdK/L3zLATnhPB6ZiM+HzNG4aAPynSA38fpeeZ4R0tINMpFThwNgGUsxYKsP9kh
0gxGl8YHL6ZzC7BC8FXIB/0Wteng0+XLAVto56Pyxt7BdxtNVuVNNXgkCi9tMqVX
xOk3oIvODDt0UoQUZ/umUuoMuOLekYUpZVk4utCqXXlB4mVfS5/zWB6nVxFX8Io1
9FOiDLTwZVtBmzmeikzb6o1QLp9F2TAvlf8+DIGDOo0DpPQUtOUyLPCh5hBaDGFE
ZhE56qPCBiQIc4T2klWX/80C5NZnd/tJNxjyUyk7bjdDzhzT10CGRAsqxAnsjvMD
2KcMf3oXN4PNgyfpbfq2ipxJ1u777Gpbzyf0xoKwH9FYigmqfRH2N2pEdiYawKrX
6pyXzGM4cvQ5X1Yxf2x/+xdTLdVaLnZgwrdqwFYmDejGAldXlYDl3jbBHVM1v+uY
5ItGTjk+3vLrxmvGy5XFVG+8fF/xaVfo5TW5AgMBAAGjUDBOMB0GA1UdDgQWBBSQ
plC3hNS56l/yBYQTeEXoqXVUXDAfBgNVHSMEGDAWgBQDRcZNwPqOqQvagw9BpW0S
BkOpXjAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQAJIO8SiNr9jpLQ
eUsFUmbueoxyI5L+P5eV92ceVOJ2tAlBA13vzF1NWlpSlrMmQcVUE/K4D01qtr0k
gDs6LUHvj2XXLpyEogitbBgipkQpwCTJVfC9bWYBwEotC7Y8mVjjEV7uXAT71GKT
x8XlB9maf+BTZGgyoulA5pTYJ++7s/xX9gzSWCa+eXGcjguBtYYXaAjjAqFGRAvu
pz1yrDWcA6H94HeErJKUXBakS0Jm/V33JDuVXY+aZ8EQi2kV82aZbNdXll/R6iGw
2ur4rDErnHsiphBgZB71C5FD4cdfSONTsYxmPmyUb5T+KLUouxZ9B0Wh28ucc1Lp
rbO7BnjW
-----END CERTIFICATE-----`;

  var statusEl = document.getElementById("status");
  var logEl = document.getElementById("log");

  function log(msg) {
    logEl.textContent =
      typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
  }

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = cls || "";
  }

  qz.security.setCertificatePromise(function (resolve) {
    resolve(DEMO_CERT);
  });

  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setSignaturePromise(function (_toSign) {
    return function (resolve) {
      resolve();
    };
  });

  /**
   * Path or URL for QZ Tray flavor=file (pixel PDF, raw PRN, etc.).
   * Under file:// returns a filesystem path; under http(s) returns a path relative to the page origin.
   */
  function resolveBundledAssetPath(relPath) {
    var href = new URL(relPath, window.location.href).href;
    if (href.indexOf("file:") === 0) {
      try {
        var u = new URL(href);
        var p = decodeURIComponent(u.pathname.replace(/\+/g, "%2B"));
        if (/^\/[A-Za-z]:\//.test(p)) {
          p = p.slice(1);
        }
        return p;
      } catch (e) {
        return href;
      }
    }
    return relPath;
  }

  function isPdfSourceBundled() {
    if (!document.getElementById("bundledPdfSelect")) {
      return false;
    }
    var el = document.querySelector('input[name="pdfSourceMode"]:checked');
    if (!el) {
      return true;
    }
    return el.value === "bundled";
  }

  function getBundledPdfRelPath() {
    var sel = document.getElementById("bundledPdfSelect");
    return sel && sel.value ? String(sel.value) : "assets/sample.pdf";
  }

  /**
   * Read a path next to this page (e.g. assets/*.pdf) as ArrayBuffer.
   * file:// pages: fetch() often fails; XHR usually works for same-folder assets.
   */
  function readBundledAssetArrayBuffer(relPath) {
    var href = new URL(relPath, window.location.href).href;
    function viaXhr() {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", href, true);
        xhr.responseType = "arraybuffer";
        xhr.onload = function () {
          var st = xhr.status;
          if (st === 0 || (st >= 200 && st < 300)) {
            if (!xhr.response || xhr.response.byteLength === 0) {
              reject(new Error("Empty response for " + relPath));
              return;
            }
            resolve(xhr.response);
            return;
          }
          reject(
            new Error(
              "Could not load " +
                relPath +
                " (HTTP " +
                st +
                "). If you opened this page as file://, try python3 -m http.server in this folder."
            )
          );
        };
        xhr.onerror = function () {
          reject(
            new Error(
              "Could not load " +
                relPath +
                " (network error). Serve this folder over http://localhost (file:// + fetch often blocks PDF bytes)."
            )
          );
        };
        xhr.send();
      });
    }
    if (window.location.protocol === "file:") {
      return viaXhr();
    }
    return fetch(href, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) {
          throw new Error("Could not load " + relPath + " (" + r.status + ")");
        }
        return r.arrayBuffer();
      })
      .catch(function () {
        return viaXhr();
      });
  }

  /** Loads the currently chosen bundled or local PDF as ArrayBuffer (for in-browser PdfToZpl). */
  function getSelectedPdfArrayBuffer() {
    if (isPdfSourceBundled()) {
      var rel = getBundledPdfRelPath();
      return readBundledAssetArrayBuffer(rel);
    }
    var input = document.getElementById("pdfFile");
    var file = input && input.files && input.files[0];
    if (!file) {
      return Promise.reject(new Error("Choose a PDF file first."));
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("Could not read the file."));
      };
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function revokePdfPreviewBlobUrl() {
    var frame = document.getElementById("pdfPreviewFrame");
    if (!frame) {
      return;
    }
    try {
      if (frame.dataset.blobUrl) {
        URL.revokeObjectURL(frame.dataset.blobUrl);
        delete frame.dataset.blobUrl;
      }
    } catch (e) {}
  }

  function syncPdfSourceUi() {
    var bundled = isPdfSourceBundled();
    var bb = document.getElementById("bundledPdfBlock");
    var cb = document.getElementById("computerPdfBlock");
    var cap = document.getElementById("pdfPreviewCaption");
    var frame = document.getElementById("pdfPreviewFrame");
    if (!frame) {
      return;
    }
    if (bb) {
      bb.style.opacity = bundled ? "1" : "0.55";
    }
    if (cb) {
      cb.style.opacity = bundled ? "0.55" : "1";
    }
    revokePdfPreviewBlobUrl();
    if (bundled) {
      frame.src = new URL(getBundledPdfRelPath(), window.location.href).href;
      if (cap) {
        cap.textContent = "Preview (bundled " + getBundledPdfRelPath() + ")";
      }
    } else {
      frame.removeAttribute("src");
      var input = document.getElementById("pdfFile");
      var file = input && input.files && input.files[0];
      if (file) {
        var u = URL.createObjectURL(file);
        frame.dataset.blobUrl = u;
        frame.src = u;
        if (cap) {
          cap.textContent = "Preview (" + file.name + ")";
        }
      } else {
        if (cap) {
          cap.textContent = "Preview — choose a PDF file above";
        }
      }
    }
  }

  function initPdfSourceUi() {
    if (!document.getElementById("bundledPdfSelect")) {
      return;
    }
    var radios = document.querySelectorAll('input[name="pdfSourceMode"]');
    var i;
    for (i = 0; i < radios.length; i++) {
      radios[i].addEventListener("change", syncPdfSourceUi);
    }
    document.getElementById("bundledPdfSelect").addEventListener("change", syncPdfSourceUi);
    document.getElementById("pdfFile").addEventListener("change", syncPdfSourceUi);
    syncPdfSourceUi();
  }

  function getForceRawOption() {
    var el = document.getElementById("forceRaw");
    return !!(el && el.checked);
  }

  function refreshPrinterSelect() {
    if (!qz.websocket.isActive()) {
      setStatus("Connect first.", "error");
      return Promise.resolve();
    }
    var sel = document.getElementById("printerSelect");
    return qz.printers
      .find()
      .then(function (names) {
        log(names);
        sel.innerHTML = "";
        names.forEach(function (n) {
          var opt = document.createElement("option");
          opt.value = n;
          opt.textContent = n;
          sel.appendChild(opt);
        });
        return qz.printers.getDefault().catch(function () {
          return null;
        });
      })
      .then(function (def) {
        var names = [].slice.call(sel.options).map(function (o) {
          return o.value;
        });
        if (def && names.indexOf(def) !== -1) {
          sel.value = def;
        } else if (sel.options.length) {
          sel.selectedIndex = 0;
        }
      })
      .catch(function (err) {
        log(String(err && err.stack ? err.stack : err));
      });
  }

  function getSelectedPrinterName() {
    var sel = document.getElementById("printerSelect");
    return sel.value || null;
  }

  /** When several QZ printers exist, confirm the dropdown choice before each job (not used for TCP-only). */
  function confirmQzPrinterDestination(printerName) {
    var sel = document.getElementById("printerSelect");
    if (!sel || sel.options.length <= 1) {
      return true;
    }
    return window.confirm(
      "Send this print job to:\n\n" +
        printerName +
        "\n\nOK = print. Cancel = stop (change the printer in the list first if needed)."
    );
  }

  function refreshUsbDeviceSelectFromSessions() {
    var row = document.getElementById("usbDeviceSelectRow");
    var usbSel = document.getElementById("usbDeviceSelect");
    var U = window.UsbRawPrinter;
    if (!usbSel || !U || typeof U.getConnectedSummaries !== "function") {
      return;
    }
    var list = U.getConnectedSummaries();
    usbSel.innerHTML = "";
    if (!list.length) {
      if (row) {
        row.style.display = "none";
      }
      return;
    }
    var i;
    for (i = 0; i < list.length; i++) {
      (function (info) {
        var opt = document.createElement("option");
        opt.value = String(info.index);
        opt.textContent =
          "#" +
          String(info.index + 1) +
          ": " +
          (info.productName || "USB device") +
          " (vid " +
          info.vendorId +
          " / pid " +
          info.productId +
          ")";
        usbSel.appendChild(opt);
      })(list[i]);
    }
    if (row) {
      row.style.display = "block";
    }
    usbSel.selectedIndex = 0;
  }

  function getTcpCaptureHostPort() {
    var hostEl = document.getElementById("tcpCaptureHost");
    var portEl = document.getElementById("tcpCapturePort");
    var host = (hostEl && hostEl.value.trim()) || "127.0.0.1";
    var port = parseInt((portEl && portEl.value.trim()) || "9100", 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      return { error: "Invalid TCP port (use 1–65535)." };
    }
    return { host: host, port: port };
  }

  /**
   * @param {object} [socketOverride] If set, print to QZ host/port (raw TCP), e.g. virtual capture.
   */
  function sendPrintJob(payloads, jobName, configExtra, socketOverride) {
    if (!qz.websocket.isActive()) {
      setStatus("Connect first.", "error");
      return Promise.reject(new Error("Not connected"));
    }
    configExtra = configExtra || {};
    var opts = { jobName: jobName };
    if (configExtra.forceRaw) {
      opts.forceRaw = true;
    }

    var printerSpec;
    var destLabel;

    if (socketOverride && socketOverride.host) {
      printerSpec = { host: socketOverride.host, port: socketOverride.port };
      destLabel = printerSpec.host + ":" + String(printerSpec.port) + " (TCP)";
    } else {
      var useTcpEl = document.getElementById("useTcpCapture");
      if (useTcpEl && useTcpEl.checked) {
        var cap = getTcpCaptureHostPort();
        if (cap.error) {
          setStatus(cap.error, "error");
          return Promise.reject(new Error(cap.error));
        }
        printerSpec = { host: cap.host, port: cap.port };
        destLabel = printerSpec.host + ":" + String(printerSpec.port) + " (TCP)";
      } else {
        var printer = getSelectedPrinterName();
        if (!printer) {
          setStatus("Pick a printer (Refresh printers) or enable TCP capture.", "error");
          return Promise.reject(new Error("No printer selected"));
        }
        if (!confirmQzPrinterDestination(printer)) {
          setStatus("Print cancelled (printer not confirmed).", "error");
          return Promise.reject(new Error("Print cancelled."));
        }
        printerSpec = printer;
        destLabel = printer;
      }
    }

    var config = qz.configs.create(printerSpec, opts);
    return qz.print(config, payloads).then(function () {
      log("Print job sent to \"" + destLabel + "\".");
    });
  }

  function printPdfJob(pdfData) {
    return sendPrintJob([pdfData], "QZ Tray client PDF", {});
  }

  function printRawPrnJob(rawData) {
    return sendPrintJob([rawData], "QZ Tray client PRN (raw)", {
      forceRaw: getForceRawOption(),
    });
  }

  function printSamplePdf() {
    var data = resolveBundledAssetPath("assets/sample.pdf");
    var pdfData = {
      type: "pixel",
      format: "pdf",
      flavor: "file",
      data: data,
    };
    return printPdfJob(pdfData).catch(function (err) {
      setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
      log(String(err && err.stack ? err.stack : err));
    });
  }

  function printUserPdf() {
    if (isPdfSourceBundled()) {
      var rel = getBundledPdfRelPath();
      var path = resolveBundledAssetPath(rel);
      var pdfData = {
        type: "pixel",
        format: "pdf",
        flavor: "file",
        data: path,
      };
      return printPdfJob(pdfData).catch(function (err) {
        setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
    }
    var input = document.getElementById("pdfFile");
    var file = input.files && input.files[0];
    if (!file) {
      setStatus("Choose a PDF file first.", "error");
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      setStatus("Could not read the file.", "error");
    };
    reader.onload = function () {
      var result = reader.result;
      var b64 =
        typeof result === "string" && result.indexOf(",") !== -1
          ? result.split(",")[1]
          : result;
      var pdfData = {
        type: "pixel",
        format: "pdf",
        flavor: "base64",
        data: b64,
      };
      printPdfJob(pdfData).catch(function (err) {
        setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
    };
    reader.readAsDataURL(file);
  }

  function getRawPdfLanguage() {
    var sel = document.getElementById("rawPdfLanguage");
    return (sel && sel.value) || "ZPL";
  }

  /** Options passed to QZ raw PDF raster (threshold / invert / page geometry; quantization fixed to luma). */
  function getSharedPdfRasterOptions() {
    var wEl = document.getElementById("browserZplPageWidth");
    var hEl = document.getElementById("browserZplPageHeight");
    var tEl = document.getElementById("browserZplThreshold");
    var invEl = document.getElementById("browserZplInvert");
    var ssEl = document.getElementById("browserZplSuperSample");
    var ss = parseInt((ssEl && ssEl.value) || "2", 10);
    if (!Number.isFinite(ss) || ss < 1) {
      ss = 1;
    }
    if (ss > 3) {
      ss = 3;
    }
    var o = {
      threshold: parseInt((tEl && tEl.value) || "127", 10),
      invert: !!(invEl && invEl.checked),
      pageNumber: 1,
      superSample: ss,
    };
    if (!Number.isFinite(o.threshold)) {
      o.threshold = 127;
    }
    var wStr = wEl && wEl.value != null ? String(wEl.value).trim() : "";
    var hStr = hEl && hEl.value != null ? String(hEl.value).trim() : "";
    if (wStr !== "") {
      o.pageWidth = parseInt(wStr, 10);
    }
    if (hStr !== "") {
      o.pageHeight = parseInt(hStr, 10);
    }
    return o;
  }

  /** QZ raw PDF entry: PDF bytes converted to the given printer language inside QZ Tray. */
  function rawPdfDataObject(data, flavor, language) {
    var raster = getSharedPdfRasterOptions();
    var lang = language || getRawPdfLanguage();
    var opt = { language: lang };
    if (raster.pageWidth != null && Number.isFinite(raster.pageWidth)) {
      opt.pageWidth = raster.pageWidth;
    }
    if (raster.pageHeight != null && Number.isFinite(raster.pageHeight)) {
      opt.pageHeight = raster.pageHeight;
    }
    if (Number.isFinite(raster.threshold)) {
      opt.threshold = raster.threshold;
    }
    opt.quantization = "luma";
    /** QZ PDF→ZPL: pageRanges for raw PDF; in-browser PdfToZpl renders all pages when “All PDF pages” is checked. */
    if (lang === "ZPL") {
      opt.pageRanges = "1";
    }
    return {
      type: "raw",
      format: "pdf",
      flavor: flavor,
      data: data,
      options: opt,
    };
  }

  /**
   * Build print payload for raw PDF (matches QZ Tray sample.html printRawPDF).
   * EPL/ZPL include label wrapper commands from the demo; adjust for your media if needed.
   * @param {string} [languageOverride] e.g. "ZPL" for PDF→ZPL→TCP capture
   */
  function buildRawPdfPrintSequence(data, flavor, languageOverride) {
    var lang = languageOverride || getRawPdfLanguage();
    var pdfPart = rawPdfDataObject(data, flavor, lang);
    if (lang === "EPL") {
      return ["\nN\n", "q812\n", "Q1218,26\n", pdfPart, "\nP1,1\n"];
    }
    if (lang === "ZPL") {
      return ["^XA\n", pdfPart, "^XZ\n"];
    }
    if (lang === "ESCPOS") {
      return [pdfPart];
    }
    return [pdfPart];
  }

  function getSocketOverrideForCapture() {
    var cap = getTcpCaptureHostPort();
    if (cap.error) {
      return cap;
    }
    return { host: cap.host, port: cap.port };
  }

  /** Path A: QZ Tray converts PDF→ZPL, raw bytes to TCP capture. */
  function pathAQzTcpSample() {
    var cap = getSocketOverrideForCapture();
    if (cap.error) {
      setStatus(cap.error, "error");
      return Promise.reject(new Error(cap.error));
    }
    var path = resolveBundledAssetPath("assets/sample.pdf");
    var payloads = buildRawPdfPrintSequence(path, "file", "ZPL");
    return sendPrintJob(
      payloads,
      "capture-A-QZ-pdf2zpl-sample",
      {},
      { host: cap.host, port: cap.port }
    ).catch(function (err) {
      setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
      log(String(err && err.stack ? err.stack : err));
    });
  }

  function pathAQzTcpUser() {
    var cap = getSocketOverrideForCapture();
    if (cap.error) {
      setStatus(cap.error, "error");
      return;
    }
    if (isPdfSourceBundled()) {
      var path = resolveBundledAssetPath(getBundledPdfRelPath());
      var payloads = buildRawPdfPrintSequence(path, "file", "ZPL");
      sendPrintJob(payloads, "capture-A-QZ-pdf2zpl-user", {}, {
        host: cap.host,
        port: cap.port,
      }).catch(function (err) {
        setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
      return;
    }
    var input = document.getElementById("pdfFile");
    var file = input.files && input.files[0];
    if (!file) {
      setStatus("Choose a PDF file first.", "error");
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      setStatus("Could not read the file.", "error");
    };
    reader.onload = function () {
      var result = reader.result;
      var b64 =
        typeof result === "string" && result.indexOf(",") !== -1
          ? result.split(",")[1]
          : result;
      var payloads = buildRawPdfPrintSequence(b64, "base64", "ZPL");
      sendPrintJob(payloads, "capture-A-QZ-pdf2zpl-user", {}, {
        host: cap.host,
        port: cap.port,
      }).catch(function (err) {
        setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
    };
    reader.readAsDataURL(file);
  }

  /** Path B: browser PdfToZpl, then raw ZPL to TCP (one click). */
  function pathBUiTcpSample() {
    var opts;
    try {
      opts = getBrowserZplUiOptions();
    } catch (e) {
      setStatus(e && e.message ? e.message : String(e), "error");
      return Promise.reject(e);
    }
    if (!qz.websocket.isActive()) {
      setStatus("Connect first.", "error");
      return Promise.reject(new Error("Not connected"));
    }
    var cap = getSocketOverrideForCapture();
    if (cap.error) {
      setStatus(cap.error, "error");
      return Promise.reject(new Error(cap.error));
    }
    clearBrowserZplRenderPreview();
    setBrowserZplScaleReportFromResult(null);
    setStatus("Path B: rendering PDF in browser…");
    return fetchSamplePdfArrayBuffer()
      .then(function (buf) {
        return window.PdfToZpl.convertPdfToZpl(buf, opts);
      })
      .then(function (result) {
        lastBrowserZplJobBytes = result.zplJobBytes;
        setBrowserZplPreview(result.zplPreviewText);
        applyBrowserZplRenderPreview(result);
        setBrowserZplScaleReportFromResult(result);
        return sendPrintJob(
          [rawZplJobBase64Payload(result.zplJobBytes)],
          "capture-B-UI-pdf2zpl-sample",
          { forceRaw: getForceRawOption() },
          { host: cap.host, port: cap.port }
        );
      })
      .then(function () {
        log("Path B (sample): ZPL sent to TCP capture. Check captured_prints for .bin + .png.");
      })
      .catch(function (err) {
        lastBrowserZplJobBytes = null;
        clearBrowserZplRenderPreview();
        setBrowserZplScaleReportFromResult(null);
        setStatus("Path B failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
  }

  function pathBUiTcpUser() {
    var opts;
    try {
      opts = getBrowserZplUiOptions();
    } catch (e) {
      setStatus(e && e.message ? e.message : String(e), "error");
      return Promise.resolve();
    }
    if (!qz.websocket.isActive()) {
      setStatus("Connect first.", "error");
      return Promise.resolve();
    }
    var cap = getSocketOverrideForCapture();
    if (cap.error) {
      setStatus(cap.error, "error");
      return;
    }
    clearBrowserZplRenderPreview();
    setBrowserZplScaleReportFromResult(null);
    setStatus("Path B: rendering PDF in browser…");
    getSelectedPdfArrayBuffer()
      .then(function (buf) {
        return window.PdfToZpl.convertPdfToZpl(buf, opts);
      })
      .then(function (result) {
        lastBrowserZplJobBytes = result.zplJobBytes;
        setBrowserZplPreview(result.zplPreviewText);
        applyBrowserZplRenderPreview(result);
        setBrowserZplScaleReportFromResult(result);
        return sendPrintJob(
          [rawZplJobBase64Payload(result.zplJobBytes)],
          "capture-B-UI-pdf2zpl-user",
          { forceRaw: getForceRawOption() },
          { host: cap.host, port: cap.port }
        );
      })
      .then(function () {
        log("Path B (user PDF): ZPL sent to TCP capture.");
      })
      .catch(function (err) {
        lastBrowserZplJobBytes = null;
        clearBrowserZplRenderPreview();
        setBrowserZplScaleReportFromResult(null);
        setStatus("Path B failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
  }

  function printRawPdfSample() {
    var path = resolveBundledAssetPath("assets/sample.pdf");
    var payloads = buildRawPdfPrintSequence(path, "file");
    return sendPrintJob(payloads, "QZ Tray client PDF as raw", {}).catch(function (err) {
      setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
      log(String(err && err.stack ? err.stack : err));
    });
  }

  function printRawPdfUser() {
    if (isPdfSourceBundled()) {
      var path = resolveBundledAssetPath(getBundledPdfRelPath());
      var payloads = buildRawPdfPrintSequence(path, "file");
      return sendPrintJob(payloads, "QZ Tray client PDF as raw", {}).catch(function (err) {
        setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
    }
    var input = document.getElementById("pdfFile");
    var file = input.files && input.files[0];
    if (!file) {
      setStatus("Choose a PDF file first.", "error");
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      setStatus("Could not read the file.", "error");
    };
    reader.onload = function () {
      var result = reader.result;
      var b64 =
        typeof result === "string" && result.indexOf(",") !== -1
          ? result.split(",")[1]
          : result;
      var payloads = buildRawPdfPrintSequence(b64, "base64");
      sendPrintJob(payloads, "QZ Tray client PDF as raw", {}).catch(function (err) {
        setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
    };
    reader.readAsDataURL(file);
  }

  function printSamplePrn() {
    var path = resolveBundledAssetPath("assets/sample.prn");
    var rawData = {
      type: "raw",
      format: "command",
      flavor: "file",
      data: path,
    };
    return printRawPrnJob(rawData).catch(function (err) {
      setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
      log(String(err && err.stack ? err.stack : err));
    });
  }

  /** Options for in-browser PdfToZpl (see pdfToZpl.js): scale = renderScale, or else printerDpi÷72; optional paper×DPI fit box. */
  function getBrowserZplUiOptions() {
    var dpiEl = document.getElementById("browserZplRasterDpi");
    var dpiStr = dpiEl && dpiEl.value != null ? String(dpiEl.value).trim() : "";
    var printerDpi = 203;
    if (dpiStr !== "") {
      var d = parseFloat(dpiStr);
      if (!Number.isFinite(d) || d < 72 || d > 600) {
        throw new Error("Raster DPI must be empty (default 203) or a number between 72 and 600.");
      }
      printerDpi = d;
    }
    var r = getSharedPdfRasterOptions();
    var o = {
      threshold: r.threshold,
      invert: r.invert,
      pageNumber: r.pageNumber,
      printerDpi: printerDpi,
    };
    var wEl = document.getElementById("browserZplPaperWidthIn");
    var hEl = document.getElementById("browserZplPaperHeightIn");
    var wStr = wEl && wEl.value != null ? String(wEl.value).trim() : "";
    var hStr = hEl && hEl.value != null ? String(hEl.value).trim() : "";
    if ((wStr === "") !== (hStr === "")) {
      throw new Error("Paper width and height: enter both in inches, or leave both empty.");
    }
    if (wStr !== "" && hStr !== "") {
      var wIn = parseFloat(wStr);
      var hIn = parseFloat(hStr);
      if (!Number.isFinite(wIn) || wIn <= 0 || wIn > 24) {
        throw new Error("Paper width must be a number > 0 and ≤ 24 inches (or empty).");
      }
      if (!Number.isFinite(hIn) || hIn <= 0 || hIn > 24) {
        throw new Error("Paper height must be a number > 0 and ≤ 24 inches (or empty).");
      }
      o.fitMaxWidthDots = Math.max(8, Math.floor(wIn * printerDpi));
      o.fitMaxHeightDots = Math.max(8, Math.floor(hIn * printerDpi));
      var policyEl = document.getElementById("browserZplLabelFitPolicy");
      o.labelFitPolicy =
        policyEl && policyEl.value === "always-fit-box" ? "always-fit-box" : "shrink-if-needed";
    }
    var rsEl = document.getElementById("browserZplRenderScale");
    var rsStr = rsEl && rsEl.value != null ? String(rsEl.value).trim() : "";
    if (rsStr !== "") {
      var rs = parseFloat(rsStr);
      if (Number.isFinite(rs) && rs > 0) {
        o.renderScale = rs;
      }
    }
    var smoothEl = document.getElementById("browserZplImageSmoothing");
    if (smoothEl && smoothEl.checked) {
      o.imageSmoothing = true;
    }
    var allEl = document.getElementById("browserZplAllPages");
    if (allEl && !allEl.checked) {
      o.allPages = false;
    }
    return o;
  }

  function setBrowserZplPreview(zpl) {
    var ta = document.getElementById("browserZplPreview");
    if (!ta) {
      return;
    }
    var max = 12000;
    if (zpl.length <= max) {
      ta.value = zpl;
    } else {
      ta.value =
        zpl.slice(0, max) +
        "\n\n… truncated (" +
        String(zpl.length) +
        " chars total) …";
    }
  }

  function clearBrowserZplRenderPreview() {
    lastBrowserZplPreviewBlob = null;
    lastBrowserZplPreviewBlobs = null;
    var strip = document.getElementById("browserPdfRenderPreviewStrip");
    var wrap = document.getElementById("browserPdfRenderPreviewWrap");
    if (strip) {
      strip.innerHTML = "";
    }
    if (wrap) {
      wrap.style.display = "none";
    }
  }

  /** Fills {@code #browserZplScaleReport} with applied pdf.js scale(s) and DPI mapping; pass null to clear. */
  function setBrowserZplScaleReportFromResult(result) {
    var el = document.getElementById("browserZplScaleReport");
    if (!el) {
      return;
    }
    if (!result) {
      el.textContent = "";
      return;
    }
    var parts = [];
    var s1 =
      result.renderScaleUsed != null && Number.isFinite(result.renderScaleUsed)
        ? result.renderScaleUsed.toFixed(4)
        : "?";
    parts.push("pdf.js scale (page 1): " + s1);
    if (result.pages && result.pages.length > 1) {
      var firstS = result.pages[0] && result.pages[0].renderScaleUsed;
      var diff = result.pages.some(function (p) {
        return (
          p &&
          p.renderScaleUsed != null &&
          firstS != null &&
          Math.abs(p.renderScaleUsed - firstS) > 1e-6
        );
      });
      if (diff) {
        parts.push(
          "per page: " +
            result.pages
              .map(function (p) {
                var s =
                  p && p.renderScaleUsed != null && Number.isFinite(p.renderScaleUsed)
                    ? p.renderScaleUsed.toFixed(4)
                    : "?";
                return String(p.pageNumber) + "→" + s;
              })
              .join(", ")
        );
      } else {
        parts.push("all " + result.pages.length + " page(s) use same scale");
      }
    }
    if (result.rasterDpiUsed != null) {
      parts.push("DPI " + result.rasterDpiUsed);
    } else {
      parts.push("explicit pdf.js scale (no DPI→72 mapping)");
    }
    if (result.rasterMemoryCapApplied) {
      parts.push("scale reduced for raster size cap");
    }
    if (result.fitMaxWidthDots != null && result.fitMaxHeightDots != null) {
      parts.push(
        "label cap " + result.fitMaxWidthDots + "×" + result.fitMaxHeightDots + " dots"
      );
    }
    if (result.labelFitPolicy) {
      parts.push(
        result.labelFitPolicy === "always-fit-box" ? "always-fit-box" : "shrink-if-larger"
      );
    }
    if (result.labelBoxApplied) {
      parts.push("paper fit applied");
    }
    if (
      result.pdfWidthIn != null &&
      result.pdfHeightIn != null &&
      Number.isFinite(result.pdfWidthIn) &&
      Number.isFinite(result.pdfHeightIn)
    ) {
      var pdfLine =
        "PDF (p1): " +
        result.pdfWidthIn.toFixed(3) +
        "×" +
        result.pdfHeightIn.toFixed(3) +
        " in";
      if (
        result.pdfWidthPt != null &&
        result.pdfHeightPt != null &&
        Number.isFinite(result.pdfWidthPt) &&
        Number.isFinite(result.pdfHeightPt)
      ) {
        pdfLine +=
          ", " +
          result.pdfWidthPt.toFixed(2) +
          "×" +
          result.pdfHeightPt.toFixed(2) +
          " pt";
      }
      parts.push(pdfLine);
    }
    if (
      result.renderedWidthIn != null &&
      result.renderedHeightIn != null &&
      Number.isFinite(result.renderedWidthIn) &&
      Number.isFinite(result.renderedHeightIn)
    ) {
      var rasLine =
        "raster (p1): " +
        result.renderedWidthIn.toFixed(3) +
        "×" +
        result.renderedHeightIn.toFixed(3) +
        " in";
      if (
        result.renderedWidthDots != null &&
        result.renderedHeightDots != null &&
        Number.isFinite(result.renderedWidthDots) &&
        Number.isFinite(result.renderedHeightDots)
      ) {
        rasLine +=
          ", " +
          String(Math.round(result.renderedWidthDots)) +
          "×" +
          String(Math.round(result.renderedHeightDots)) +
          " dots";
      }
      if (
        result.paddedWidthDots != null &&
        result.widthPx != null &&
        result.paddedWidthDots > result.widthPx
      ) {
        rasLine += " (row padded to " + String(result.paddedWidthDots) + " dots wide)";
      }
      parts.push(rasLine);
    }
    if (result.pages && result.pages.length > 1) {
      var p0 = result.pages[0];
      var pdfMulti = result.pages.some(function (p) {
        return (
          p &&
          p0 &&
          (Math.abs(p.pdfWidthIn - p0.pdfWidthIn) > 1e-4 ||
            Math.abs(p.pdfHeightIn - p0.pdfHeightIn) > 1e-4)
        );
      });
      if (pdfMulti) {
        parts.push(
          "PDF in/page: " +
            result.pages
              .map(function (p) {
                var s =
                  String(p.pageNumber) +
                  "→" +
                  p.pdfWidthIn.toFixed(2) +
                  "×" +
                  p.pdfHeightIn.toFixed(2) +
                  " in";
                if (
                  p.pdfWidthPt != null &&
                  p.pdfHeightPt != null &&
                  Number.isFinite(p.pdfWidthPt) &&
                  Number.isFinite(p.pdfHeightPt)
                ) {
                  s +=
                    " (" +
                    p.pdfWidthPt.toFixed(1) +
                    "×" +
                    p.pdfHeightPt.toFixed(1) +
                    " pt)";
                }
                return s;
              })
              .join(", ")
        );
      }
      var rasMulti = result.pages.some(function (p) {
        return (
          p &&
          p0 &&
          (Math.abs(p.renderedWidthIn - p0.renderedWidthIn) > 1e-4 ||
            Math.abs(p.renderedHeightIn - p0.renderedHeightIn) > 1e-4)
        );
      });
      if (rasMulti) {
        parts.push(
          "raster in/page: " +
            result.pages
              .map(function (p) {
                var s =
                  String(p.pageNumber) +
                  "→" +
                  p.renderedWidthIn.toFixed(2) +
                  "×" +
                  p.renderedHeightIn.toFixed(2) +
                  " in";
                if (
                  p.renderedWidthDots != null &&
                  p.renderedHeightDots != null &&
                  Number.isFinite(p.renderedWidthDots) &&
                  Number.isFinite(p.renderedHeightDots)
                ) {
                  s +=
                    " (" +
                    String(Math.round(p.renderedWidthDots)) +
                    "×" +
                    String(Math.round(p.renderedHeightDots)) +
                    " dots)";
                }
                return s;
              })
              .join(", ")
        );
      }
    }
    el.textContent = parts.join(" · ");
  }

  /**
   * Shows the 1-bit threshold preview(s) in {@code #browserPdfRenderPreviewStrip} and keeps blobs for PNG download.
   */
  function applyBrowserZplRenderPreview(result) {
    var strip = document.getElementById("browserPdfRenderPreviewStrip");
    var wrap = document.getElementById("browserPdfRenderPreviewWrap");
    if (!strip || !wrap) {
      return;
    }
    strip.innerHTML = "";
    var blobs =
      result && result.previewPngBlobs && result.previewPngBlobs.length
        ? result.previewPngBlobs
        : result && result.previewPngBlob instanceof Blob
          ? [result.previewPngBlob]
          : null;
    if (!blobs || !blobs.length) {
      clearBrowserZplRenderPreview();
      return;
    }
    lastBrowserZplPreviewBlobs = blobs.filter(function (b) {
      return b instanceof Blob;
    });
    lastBrowserZplPreviewBlob = lastBrowserZplPreviewBlobs[0] || null;
    var n;
    for (n = 0; n < lastBrowserZplPreviewBlobs.length; n++) {
      (function (blob, pageIdx, pageMeta) {
        var url = URL.createObjectURL(blob);
        var fig = document.createElement("figure");
        fig.style.margin = "0";
        fig.style.maxWidth = "100%";
        var cap = document.createElement("figcaption");
        cap.style.fontSize = "0.8rem";
        cap.style.color = "#52525b";
        cap.style.marginTop = "0.25rem";
        cap.textContent =
          "Page " +
          String(pageIdx) +
          (result.numPages ? " / " + result.numPages : "") +
          " — loading…";
        var img = new Image();
        img.alt = "PDF page " + String(pageIdx);
        img.style.cssText =
          "max-width:min(100%,520px);height:auto;border:1px solid #d4d4d8;border-radius:4px;background:#fff;display:block";
        img.onload = function () {
          URL.revokeObjectURL(url);
          var scalePart = "";
          if (
            pageMeta &&
            pageMeta.renderScaleUsed != null &&
            Number.isFinite(pageMeta.renderScaleUsed)
          ) {
            scalePart = ", scale " + pageMeta.renderScaleUsed.toFixed(4);
          }
          var inchPart = "";
          if (
            pageMeta &&
            Number.isFinite(pageMeta.pdfWidthIn) &&
            Number.isFinite(pageMeta.pdfHeightIn)
          ) {
            inchPart =
              " · PDF " +
              pageMeta.pdfWidthIn.toFixed(3) +
              "×" +
              pageMeta.pdfHeightIn.toFixed(3) +
              " in";
            if (
              Number.isFinite(pageMeta.pdfWidthPt) &&
              Number.isFinite(pageMeta.pdfHeightPt)
            ) {
              inchPart +=
                " (" +
                pageMeta.pdfWidthPt.toFixed(2) +
                "×" +
                pageMeta.pdfHeightPt.toFixed(2) +
                " pt)";
            }
          }
          if (
            pageMeta &&
            Number.isFinite(pageMeta.renderedWidthIn) &&
            Number.isFinite(pageMeta.renderedHeightIn)
          ) {
            inchPart +=
              ", raster " +
              pageMeta.renderedWidthIn.toFixed(3) +
              "×" +
              pageMeta.renderedHeightIn.toFixed(3) +
              " in";
            if (
              pageMeta.renderedWidthDots != null &&
              pageMeta.renderedHeightDots != null &&
              Number.isFinite(pageMeta.renderedWidthDots) &&
              Number.isFinite(pageMeta.renderedHeightDots)
            ) {
              inchPart +=
                " (" +
                String(Math.round(pageMeta.renderedWidthDots)) +
                "×" +
                String(Math.round(pageMeta.renderedHeightDots)) +
                " dots)";
            }
            if (
              pageMeta.paddedWidthDots != null &&
              pageMeta.widthPx != null &&
              pageMeta.paddedWidthDots > pageMeta.widthPx
            ) {
              inchPart +=
                ", row pad " + String(pageMeta.paddedWidthDots) + " dots wide";
            }
          }
          cap.textContent =
            "Page " +
            String(pageIdx) +
            (result.numPages ? " / " + result.numPages : "") +
            " — " +
            String(img.naturalWidth) +
            "×" +
            String(img.naturalHeight) +
            " px (1-bit threshold preview" +
            scalePart +
            inchPart +
            ")";
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
        };
        img.src = url;
        fig.appendChild(img);
        fig.appendChild(cap);
        strip.appendChild(fig);
      })(
        lastBrowserZplPreviewBlobs[n],
        n + 1,
        result.pages && result.pages[n] ? result.pages[n] : null
      );
    }
    wrap.style.display = "block";
  }

  function downloadBrowserZplRenderPng() {
    if (!(lastBrowserZplPreviewBlob instanceof Blob)) {
      setStatus("No render preview yet — generate ZPL first.", "error");
      return;
    }
    var a = document.createElement("a");
    var stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = URL.createObjectURL(lastBrowserZplPreviewBlob);
    a.download = "pdf-threshold-preview-" + stamp + "-page1.png";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("PNG download started (page 1).", "connected");
  }

  function downloadBrowserZplAllRenderPng() {
    var list =
      lastBrowserZplPreviewBlobs && lastBrowserZplPreviewBlobs.length
        ? lastBrowserZplPreviewBlobs
        : lastBrowserZplPreviewBlob instanceof Blob
          ? [lastBrowserZplPreviewBlob]
          : [];
    if (!list.length) {
      setStatus("No render preview yet — generate ZPL first.", "error");
      return;
    }
    var stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    var i = 0;
    function next() {
      if (i >= list.length) {
        setStatus("PNG downloads started (" + String(list.length) + " file(s)).", "connected");
        return;
      }
      var a = document.createElement("a");
      a.href = URL.createObjectURL(list[i]);
      a.download = "pdf-threshold-preview-" + stamp + "-page" + String(i + 1) + ".png";
      a.click();
      URL.revokeObjectURL(a.href);
      i++;
      setTimeout(next, 250);
    }
    next();
  }

  function browserZplRasterSummary(result) {
    var base =
      "pdf.js scale " + (result.renderScaleUsed != null ? result.renderScaleUsed.toFixed(2) : "?");
    var pg =
      result.pages && result.pages.length
        ? ", " + result.pages.length + " label(s) from " + (result.numPages != null ? result.numPages : "?") + " PDF page(s)"
        : "";
    var mem = result.rasterMemoryCapApplied ? ", memory cap applied" : "";
    var fit =
      result.fitMaxWidthDots != null && result.fitMaxHeightDots != null
        ? ", label ≤ " +
          result.fitMaxWidthDots +
          "×" +
          result.fitMaxHeightDots +
          " dots" +
          (result.labelFitPolicy === "always-fit-box" ? " (always-fit-box)" : " (shrink-if-larger)")
        : "";
    var inch = "";
    if (
      result.pdfWidthIn != null &&
      result.pdfHeightIn != null &&
      result.renderedWidthIn != null &&
      result.renderedHeightIn != null &&
      Number.isFinite(result.pdfWidthIn) &&
      Number.isFinite(result.pdfHeightIn) &&
      Number.isFinite(result.renderedWidthIn) &&
      Number.isFinite(result.renderedHeightIn)
    ) {
      inch =
        ", PDF " +
        result.pdfWidthIn.toFixed(3) +
        "×" +
        result.pdfHeightIn.toFixed(3) +
        " in";
      if (
        result.pdfWidthPt != null &&
        result.pdfHeightPt != null &&
        Number.isFinite(result.pdfWidthPt) &&
        Number.isFinite(result.pdfHeightPt)
      ) {
        inch +=
          " (" +
          result.pdfWidthPt.toFixed(2) +
          "×" +
          result.pdfHeightPt.toFixed(2) +
          " pt)";
      }
      inch +=
        ", raster " +
        result.renderedWidthIn.toFixed(3) +
        "×" +
        result.renderedHeightIn.toFixed(3) +
        " in";
      if (
        result.renderedWidthDots != null &&
        result.renderedHeightDots != null &&
        Number.isFinite(result.renderedWidthDots) &&
        Number.isFinite(result.renderedHeightDots)
      ) {
        inch +=
          " (" +
          String(Math.round(result.renderedWidthDots)) +
          "×" +
          String(Math.round(result.renderedHeightDots)) +
          " dots)";
      }
      inch += " (p1)";
    }
    if (result.rasterDpiUsed != null) {
      return base + ", mapped from " + result.rasterDpiUsed + " dpi" + fit + inch + mem + pg;
    }
    return base + " (explicit scale)" + fit + inch + mem + pg;
  }

  function fetchSamplePdfArrayBuffer() {
    return readBundledAssetArrayBuffer("assets/sample.pdf");
  }

  function generateBrowserZplFromSample() {
    if (!window.PdfToZpl || typeof window.PdfToZpl.convertPdfToZpl !== "function") {
      setStatus("PdfToZpl is not loaded (include pdf.js then pdfToZpl.js before app.js).", "error");
      return Promise.resolve();
    }
    var opts;
    try {
      opts = getBrowserZplUiOptions();
    } catch (e) {
      setStatus(e && e.message ? e.message : String(e), "error");
      return Promise.resolve();
    }
    clearBrowserZplRenderPreview();
    setBrowserZplScaleReportFromResult(null);
    setStatus("Rendering PDF (browser)…");
    return fetchSamplePdfArrayBuffer()
      .then(function (buf) {
        return window.PdfToZpl.convertPdfToZpl(buf, opts);
      })
      .then(function (result) {
        lastBrowserZplJobBytes = result.zplJobBytes;
        setBrowserZplPreview(result.zplPreviewText);
        applyBrowserZplRenderPreview(result);
        setBrowserZplScaleReportFromResult(result);
        setStatus(
          "ZPL ready: " +
            result.totalBytes +
            " graphic bytes, " +
            result.widthPx +
            "×" +
            result.heightPx +
            " px (page 1), " +
            browserZplRasterSummary(result) +
            " (PDF " +
            result.numPages +
            " page(s), " +
            (result.pages && result.pages.length ? result.pages.length + " label(s); " : "") +
            (result.convertWallMs != null ? result.convertWallMs + " ms PDF→ZPL" : "") +
            ").",
          "connected"
        );
        log({
          browserPdfToZpl: {
            totalBytes: result.totalBytes,
            rowBytes: result.rowBytes,
            heightPx: result.heightPx,
            widthPx: result.widthPx,
            paddedWidthDots: result.paddedWidthDots,
            zplJobBytes: result.zplJobBytes.length,
            renderScaleUsed: result.renderScaleUsed,
            rasterDpiUsed: result.rasterDpiUsed,
            convertWallMs: result.convertWallMs,
            pdfPages: result.numPages,
            labelsRendered: result.pages ? result.pages.length : 0,
            rasterMemoryCapApplied: !!result.rasterMemoryCapApplied,
            pdfWidthIn: result.pdfWidthIn,
            pdfHeightIn: result.pdfHeightIn,
            pdfWidthPt: result.pdfWidthPt,
            pdfHeightPt: result.pdfHeightPt,
            renderedWidthIn: result.renderedWidthIn,
            renderedHeightIn: result.renderedHeightIn,
            renderedWidthDots: result.renderedWidthDots,
            renderedHeightDots: result.renderedHeightDots,
            fitMaxWidthDots: result.fitMaxWidthDots,
            fitMaxHeightDots: result.fitMaxHeightDots,
            labelFitPolicy: result.labelFitPolicy,
            labelBoxApplied: !!result.labelBoxApplied,
          },
        });
      })
      .catch(function (err) {
        lastBrowserZplJobBytes = null;
        setBrowserZplPreview("");
        clearBrowserZplRenderPreview();
        setBrowserZplScaleReportFromResult(null);
        setStatus(
          "Browser PDF→ZPL failed: " + (err && err.message ? err.message : err),
          "error"
        );
        log(String(err && err.stack ? err.stack : err));
      });
  }

  function generateBrowserZplFromUser() {
    if (!window.PdfToZpl || typeof window.PdfToZpl.convertPdfToZpl !== "function") {
      setStatus("PdfToZpl is not loaded (include pdf.js then pdfToZpl.js before app.js).", "error");
      return Promise.resolve();
    }
    var opts;
    try {
      opts = getBrowserZplUiOptions();
    } catch (e) {
      setStatus(e && e.message ? e.message : String(e), "error");
      return Promise.resolve();
    }
    if (!isPdfSourceBundled()) {
      var input = document.getElementById("pdfFile");
      var file = input && input.files && input.files[0];
      if (!file) {
        setStatus("Choose a PDF file first.", "error");
        return Promise.resolve();
      }
    }
    clearBrowserZplRenderPreview();
    setBrowserZplScaleReportFromResult(null);
    setStatus("Rendering PDF (browser)…");
    return getSelectedPdfArrayBuffer()
      .then(function (buf) {
        return window.PdfToZpl.convertPdfToZpl(buf, opts);
      })
      .then(function (result) {
        lastBrowserZplJobBytes = result.zplJobBytes;
        setBrowserZplPreview(result.zplPreviewText);
        applyBrowserZplRenderPreview(result);
        setBrowserZplScaleReportFromResult(result);
        setStatus(
          "ZPL ready: " +
            result.totalBytes +
            " graphic bytes, " +
            result.widthPx +
            "×" +
            result.heightPx +
            " px (page 1), " +
            browserZplRasterSummary(result) +
            " (PDF " +
            result.numPages +
            " page(s), " +
            (result.pages && result.pages.length ? result.pages.length + " label(s); " : "") +
            (result.convertWallMs != null ? result.convertWallMs + " ms PDF→ZPL" : "") +
            ").",
          "connected"
        );
        log({
          browserPdfToZpl: {
            totalBytes: result.totalBytes,
            rowBytes: result.rowBytes,
            heightPx: result.heightPx,
            widthPx: result.widthPx,
            paddedWidthDots: result.paddedWidthDots,
            zplJobBytes: result.zplJobBytes.length,
            renderScaleUsed: result.renderScaleUsed,
            rasterDpiUsed: result.rasterDpiUsed,
            convertWallMs: result.convertWallMs,
            pdfPages: result.numPages,
            labelsRendered: result.pages ? result.pages.length : 0,
            rasterMemoryCapApplied: !!result.rasterMemoryCapApplied,
            pdfWidthIn: result.pdfWidthIn,
            pdfHeightIn: result.pdfHeightIn,
            pdfWidthPt: result.pdfWidthPt,
            pdfHeightPt: result.pdfHeightPt,
            renderedWidthIn: result.renderedWidthIn,
            renderedHeightIn: result.renderedHeightIn,
            renderedWidthDots: result.renderedWidthDots,
            renderedHeightDots: result.renderedHeightDots,
            fitMaxWidthDots: result.fitMaxWidthDots,
            fitMaxHeightDots: result.fitMaxHeightDots,
            labelFitPolicy: result.labelFitPolicy,
            labelBoxApplied: !!result.labelBoxApplied,
          },
        });
      })
      .catch(function (err) {
        lastBrowserZplJobBytes = null;
        setBrowserZplPreview("");
        clearBrowserZplRenderPreview();
        setBrowserZplScaleReportFromResult(null);
        setStatus(
          "Browser PDF→ZPL failed: " + (err && err.message ? err.message : err),
          "error"
        );
        log(String(err && err.stack ? err.stack : err));
      });
  }

  function rawPlainPayload(zplString) {
    return {
      type: "raw",
      format: "command",
      flavor: "plain",
      data: zplString,
    };
  }

  /** Encode raw ZPL job bytes for QZ (ASCII ^GFA job; base64 for transport). */
  function uint8ArrayToBase64(u8) {
    var CHUNK = 0x8000;
    var s = "";
    for (var i = 0; i < u8.length; i += CHUNK) {
      var sub = u8.subarray(i, Math.min(i + CHUNK, u8.length));
      s += String.fromCharCode.apply(null, sub);
    }
    return btoa(s);
  }

  function rawZplJobBase64Payload(jobBytes) {
    return {
      type: "raw",
      format: "command",
      flavor: "base64",
      data: uint8ArrayToBase64(jobBytes),
    };
  }

  function printBrowserZplRaw() {
    if (!lastBrowserZplJobBytes || !lastBrowserZplJobBytes.length) {
      setStatus("Generate ZPL first (sample or selected PDF).", "error");
      return Promise.resolve();
    }
    if (!qz.websocket.isActive()) {
      setStatus("Connect first.", "error");
      return Promise.resolve();
    }
    return sendPrintJob(
      [rawZplJobBase64Payload(lastBrowserZplJobBytes)],
      "QZ Tray client browser PDF→ZPL (raw)",
      { forceRaw: getForceRawOption() }
    ).catch(function (err) {
      setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
      log(String(err && err.stack ? err.stack : err));
    });
  }

  function printBrowserZplTcp() {
    if (!lastBrowserZplJobBytes || !lastBrowserZplJobBytes.length) {
      setStatus("Generate ZPL first (sample or selected PDF).", "error");
      return Promise.resolve();
    }
    var cap = getSocketOverrideForCapture();
    if (cap.error) {
      setStatus(cap.error, "error");
      return Promise.reject(new Error(cap.error));
    }
    return sendPrintJob(
      [rawZplJobBase64Payload(lastBrowserZplJobBytes)],
      "capture-B-UI-pdf2zpl-manual",
      { forceRaw: getForceRawOption() },
      { host: cap.host, port: cap.port }
    ).catch(function (err) {
      setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
      log(String(err && err.stack ? err.stack : err));
    });
  }

  function markUsbGrantedForThisOrigin() {
    try {
      localStorage.setItem(LS_USB_PAIRED, "1");
      if (localStorage.getItem(LS_USB_AUTO) == null) {
        localStorage.setItem(LS_USB_AUTO, "1");
      }
    } catch (e) {}
  }

  function isUsbAutoReconnectEnabled() {
    try {
      if (localStorage.getItem(LS_USB_PAIRED) !== "1") {
        return false;
      }
      return localStorage.getItem(LS_USB_AUTO) !== "0";
    } catch (e) {
      return false;
    }
  }

  function syncUsbAutoReconnectCheckbox() {
    var el = document.getElementById("usbZplAutoReconnect");
    if (!el) {
      return;
    }
    try {
      el.checked = localStorage.getItem(LS_USB_AUTO) !== "0";
    } catch (e) {
      el.checked = true;
    }
  }

  function tryUsbAutoconnectOnPageLoad() {
    var U = window.UsbRawPrinter;
    if (!U || !U.isSupported() || !isUsbAutoReconnectEnabled()) {
      return;
    }
    U.connectFirstRemembered()
      .then(function (info) {
        refreshUsbDeviceSelectFromSessions();
        var n = U.getSessionCount && U.getSessionCount();
        var msg =
          n > 1
            ? "USB auto-connected " +
              String(n) +
              " remembered device(s). Pick “USB print target” before sending ZPL."
            : "USB connected automatically: " +
              (info && info.productName ? info.productName : "device") +
              " (vid " +
              (info && info.vendorId) +
              " / pid " +
              (info && info.productId) +
              ").";
        setStatus(msg, "connected");
        log({ usbAutoReconnectOnLoad: info, sessionCount: n });
      })
      .catch(function (err) {
        log({
          usbAutoReconnectOnLoadSkipped: String(err && err.message ? err.message : err),
        });
      });
  }

  function initUsbWebPreferences() {
    syncUsbAutoReconnectCheckbox();
    tryUsbAutoconnectOnPageLoad();
  }

  function usbZplConnectPick() {
    var U = window.UsbRawPrinter;
    if (!U || !U.isSupported()) {
      setStatus(
        "WebUSB not available (use Chrome/Edge on https:// or localhost, not file://).",
        "error"
      );
      return Promise.resolve();
    }
    setStatus("USB: choose a device in the browser prompt…");
    return U.connectPickDevice()
      .then(function (info) {
        markUsbGrantedForThisOrigin();
        syncUsbAutoReconnectCheckbox();
        refreshUsbDeviceSelectFromSessions();
        setStatus(
          "USB connected: " +
            (info.productName || "device") +
            " (vid " +
            info.vendorId +
            " / pid " +
            info.productId +
            "), bulk OUT packet " +
            info.packetSize +
            ", iface " +
            info.interfaceNumber +
            ". " +
            (U.getSessionCount && U.getSessionCount() > 1
              ? "Multiple devices open — choose USB print target before sending."
              : ""),
          "connected"
        );
        log({ usbConnected: info, sessionCount: U.getSessionCount && U.getSessionCount() });
      })
      .catch(function (err) {
        if (err && err.name === "NotFoundError") {
          setStatus("USB: no device selected (cancelled).", "error");
          return;
        }
        setStatus("USB connect failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
  }

  function usbZplConnectRemembered() {
    var U = window.UsbRawPrinter;
    if (!U || !U.isSupported()) {
      setStatus(
        "WebUSB not available (use Chrome/Edge on https:// or localhost, not file://).",
        "error"
      );
      return Promise.resolve();
    }
    setStatus("USB: opening all remembered devices…");
    var openAll =
      typeof U.connectAllRemembered === "function"
        ? U.connectAllRemembered()
        : U.connectFirstRemembered().then(function (info) {
            return info ? [info] : [];
          });
    return openAll
      .then(function (list) {
        markUsbGrantedForThisOrigin();
        syncUsbAutoReconnectCheckbox();
        refreshUsbDeviceSelectFromSessions();
        setStatus(
          "USB: opened " +
            String(list.length) +
            " remembered printer(s). Use “USB print target” before “Send generated ZPL → USB”.",
          "connected"
        );
        log({ usbConnectedRememberedAll: list });
      })
      .catch(function (err) {
        setStatus("USB reconnect failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
  }

  function usbZplDisconnect() {
    var U = window.UsbRawPrinter;
    if (!U) {
      return Promise.resolve();
    }
    return U.disconnect().then(function () {
      refreshUsbDeviceSelectFromSessions();
      setStatus("USB disconnected (all sessions).", "connected");
      log("USB disconnected.");
    });
  }

  /** Send current in-browser ZPL job bytes over WebUSB (ekart-style bulk OUT chunks). */
  function printBrowserZplUsb() {
    var U = window.UsbRawPrinter;
    if (!U || !U.isSupported()) {
      setStatus(
        "WebUSB not available (use Chrome/Edge on https:// or localhost, not file://).",
        "error"
      );
      return Promise.resolve();
    }
    if (!lastBrowserZplJobBytes || !lastBrowserZplJobBytes.length) {
      setStatus("Generate ZPL first (sample or selected PDF).", "error");
      return Promise.resolve();
    }
    if (!U.getConnectedSummary()) {
      setStatus("Connect USB first (pick device or open all remembered).", "error");
      return Promise.resolve();
    }
    var usbSel = document.getElementById("usbDeviceSelect");
    var sessionIdx = 0;
    if (usbSel && usbSel.options.length) {
      sessionIdx = parseInt(usbSel.value, 10);
      if (!Number.isFinite(sessionIdx)) {
        sessionIdx = 0;
      }
    }
    if (U.getSessionCount && U.getSessionCount() > 1 && (!usbSel || !usbSel.options.length)) {
      setStatus("Pick USB print target (refresh page or reconnect USB).", "error");
      return Promise.resolve();
    }
    setStatus("Sending ZPL job over USB…");
    return U.sendRawBytes(lastBrowserZplJobBytes, sessionIdx)
      .then(function () {
        setStatus(
          "USB: sent " + String(lastBrowserZplJobBytes.length) + " byte(s) (raw ZPL job).",
          "connected"
        );
        log({ usbPrintOk: { bytes: lastBrowserZplJobBytes.length } });
      })
      .catch(function (err) {
        setStatus("USB send failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
  }

  function printUserPrn() {
    var input = document.getElementById("prnFile");
    var file = input.files && input.files[0];
    if (!file) {
      setStatus("Choose a PRN or raw file first.", "error");
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      setStatus("Could not read the file.", "error");
    };
    reader.onload = function () {
      var result = reader.result;
      var b64 =
        typeof result === "string" && result.indexOf(",") !== -1
          ? result.split(",")[1]
          : result;
      var rawData = {
        type: "raw",
        format: "command",
        flavor: "base64",
        data: b64,
      };
      printRawPrnJob(rawData).catch(function (err) {
        setStatus("Print failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
    };
    reader.readAsDataURL(file);
  }

  function connect() {
    setStatus("Connecting…");
    return qz.websocket
      .connect()
      .then(function () {
        return qz.api.getVersion();
      })
      .then(function (version) {
        setStatus("Connected. QZ Tray version: " + version, "connected");
        log("Connected.\nVersion: " + version);
        return refreshPrinterSelect();
      })
      .catch(function (err) {
        setStatus("Connection failed: " + (err && err.message ? err.message : err), "error");
        log(String(err && err.stack ? err.stack : err));
      });
  }

  function disconnect() {
    qz.websocket.disconnect();
    setStatus("Disconnected.");
    log("(disconnected)");
  }

  initPdfSourceUi();

  document.getElementById("connect").addEventListener("click", connect);
  document.getElementById("disconnect").addEventListener("click", disconnect);
  document.getElementById("refreshPrinters").addEventListener("click", refreshPrinterSelect);
  document.getElementById("printSamplePdf").addEventListener("click", printSamplePdf);
  document.getElementById("printUserPdf").addEventListener("click", printUserPdf);
  document.getElementById("printRawPdfSample").addEventListener("click", printRawPdfSample);
  document.getElementById("printRawPdfUser").addEventListener("click", printRawPdfUser);
  document.getElementById("pathAQzTcpSample").addEventListener("click", pathAQzTcpSample);
  document.getElementById("pathAQzTcpUser").addEventListener("click", pathAQzTcpUser);
  document.getElementById("pathBUiTcpSample").addEventListener("click", pathBUiTcpSample);
  document.getElementById("pathBUiTcpUser").addEventListener("click", pathBUiTcpUser);
  document.getElementById("browserZplFromSample").addEventListener("click", generateBrowserZplFromSample);
  document.getElementById("browserZplFromUser").addEventListener("click", generateBrowserZplFromUser);
  var saveRenderBtn = document.getElementById("browserPdfSaveRenderPng");
  if (saveRenderBtn) {
    saveRenderBtn.addEventListener("click", downloadBrowserZplRenderPng);
  }
  var saveAllRenderBtn = document.getElementById("browserPdfSaveAllRenderPng");
  if (saveAllRenderBtn) {
    saveAllRenderBtn.addEventListener("click", downloadBrowserZplAllRenderPng);
  }
  document.getElementById("browserZplPrintRaw").addEventListener("click", printBrowserZplRaw);
  document.getElementById("browserZplPrintTcp").addEventListener("click", printBrowserZplTcp);
  var usbPick = document.getElementById("usbZplConnectPick");
  if (usbPick) {
    usbPick.addEventListener("click", usbZplConnectPick);
  }
  var usbRem = document.getElementById("usbZplConnectRemembered");
  if (usbRem) {
    usbRem.addEventListener("click", usbZplConnectRemembered);
  }
  var usbDisc = document.getElementById("usbZplDisconnect");
  if (usbDisc) {
    usbDisc.addEventListener("click", usbZplDisconnect);
  }
  var usbPrint = document.getElementById("browserZplPrintUsb");
  if (usbPrint) {
    usbPrint.addEventListener("click", printBrowserZplUsb);
  }
  var usbAutoReconnect = document.getElementById("usbZplAutoReconnect");
  if (usbAutoReconnect) {
    usbAutoReconnect.addEventListener("change", function () {
      try {
        localStorage.setItem(LS_USB_AUTO, usbAutoReconnect.checked ? "1" : "0");
      } catch (e) {}
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUsbWebPreferences);
  } else {
    initUsbWebPreferences();
  }
  document.getElementById("printSamplePrn").addEventListener("click", printSamplePrn);
  document.getElementById("printUserPrn").addEventListener("click", printUserPrn);
})();
