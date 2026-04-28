/**
 * WebUSB raw send — same pattern as ekartprintv3 PrinterManager: bulk OUT, chunk by packetSize, transferOut + retries.
 * For ZPL/PRN bytes generated in-browser (no QZ Tray).
 */
(function (global) {
  "use strict";

  var TRANSFER_RETRY_ATTEMPTS = 3;
  var RETRY_DELAY_MS = 100;

  /** @type {{ device: USBDevice, endpoints: { in: *, out: * } } | null} */
  var managed = null;

  function isSupported() {
    return !!(global.navigator && global.navigator.usb);
  }

  /**
   * @param {USBDevice} device
   * @returns {{ in: null | { endpointNumber: number, packetSize: number, interfaceNumber: number }, out: null | { endpointNumber: number, packetSize: number, interfaceNumber: number } }}
   */
  function findBulkTransferEndpoints(device) {
    var endpoints = { in: null, out: null };
    var configs = device.configurations || [];
    for (var c = 0; c < configs.length; c++) {
      var config = configs[c];
      var ifaces = config.interfaces || [];
      for (var i = 0; i < ifaces.length; i++) {
        var iface = ifaces[i];
        var alts = iface.alternates || [];
        for (var a = 0; a < alts.length; a++) {
          var alt = alts[a];
          var eps = alt.endpoints || [];
          for (var e = 0; e < eps.length; e++) {
            var endpoint = eps[e];
            if (endpoint.type !== "bulk") {
              continue;
            }
            var bulk = {
              endpointNumber: endpoint.endpointNumber,
              packetSize: endpoint.packetSize,
              interfaceNumber: iface.interfaceNumber,
            };
            if (endpoint.direction === "in" && !endpoints.in) {
              endpoints.in = bulk;
            }
            if (endpoint.direction === "out" && !endpoints.out) {
              endpoints.out = bulk;
            }
          }
        }
      }
    }
    return endpoints;
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function getConnectedSummary() {
    if (!managed || !managed.device) {
      return null;
    }
    var d = managed.device;
    var out = managed.endpoints && managed.endpoints.out;
    return {
      vendorId: d.vendorId,
      productId: d.productId,
      productName: d.productName || "",
      packetSize: out ? out.packetSize : 0,
      interfaceNumber: out ? out.interfaceNumber : -1,
    };
  }

  function disconnect() {
    if (!managed) {
      return Promise.resolve();
    }
    var m = managed;
    managed = null;
    var device = m.device;
    var out = m.endpoints && m.endpoints.out;
    return Promise.resolve()
      .then(function () {
        if (out && device.opened) {
          return device.releaseInterface(out.interfaceNumber).catch(function () {});
        }
      })
      .then(function () {
        if (device.opened) {
          return device.close().catch(function () {});
        }
      });
  }

  /**
   * @param {USBDevice} device
   */
  function openAndClaim(device) {
    return disconnect().then(function () {
      return device.open();
    }).then(function () {
      if (device.configuration === null) {
        return device.selectConfiguration(1);
      }
    }).then(function () {
      var endpoints = findBulkTransferEndpoints(device);
      if (!endpoints.out) {
        return device.close().catch(function () {}).then(function () {
          throw new Error("Could not find a bulk OUT endpoint on this device.");
        });
      }
      return device.claimInterface(endpoints.out.interfaceNumber).then(function () {
        managed = { device: device, endpoints: endpoints };
        return getConnectedSummary();
      });
    });
  }

  /** User gesture: system picker (filters empty = any device, like testing a Zebra). */
  function connectPickDevice() {
    if (!isSupported()) {
      return Promise.reject(
        new Error("WebUSB not available. Use Chrome or Edge over https:// or http://localhost.")
      );
    }
    return navigator.usb.requestDevice({ filters: [] }).then(function (device) {
      return openAndClaim(device);
    });
  }

  /** Re-open first device the user already granted (no picker). */
  function connectFirstRemembered() {
    if (!isSupported()) {
      return Promise.reject(new Error("WebUSB not available."));
    }
    return navigator.usb.getDevices().then(function (list) {
      if (!list || !list.length) {
        throw new Error(
          "No remembered USB devices. Use “Connect USB (pick device)” once and allow access."
        );
      }
      return openAndClaim(list[0]);
    });
  }

  /**
   * @param {Uint8Array} u8
   */
  function sendRawBytes(u8) {
    if (!managed || !managed.endpoints || !managed.endpoints.out) {
      return Promise.reject(new Error("USB device not connected."));
    }
    var u = u8;
    if (!(u instanceof Uint8Array)) {
      if (u && u.buffer) {
        u = new Uint8Array(u.buffer, u.byteOffset, u.byteLength);
      } else {
        return Promise.reject(new Error("Expected Uint8Array (or ArrayBuffer view) for raw job."));
      }
    }
    var device = managed.device;
    var out = managed.endpoints.out;
    var packetSize = out.packetSize || 512;

    function transferChunk(offset) {
      if (offset >= u.byteLength) {
        return Promise.resolve();
      }
      var end = Math.min(offset + packetSize, u.byteLength);
      var chunk = u.subarray(offset, end);
      var attempt = 0;
      function tryOnce() {
        attempt++;
        return device.transferOut(out.endpointNumber, chunk).then(function () {
          return transferChunk(end);
        }).catch(function (err) {
          if (attempt >= TRANSFER_RETRY_ATTEMPTS) {
            throw err;
          }
          return delay(RETRY_DELAY_MS).then(tryOnce);
        });
      }
      return tryOnce();
    }

    return transferChunk(0);
  }

  /** Optional: same line normalization as ekart PrintJobManager for pasted ZPL text. */
  function sendZplText(str) {
    var normalized = String(str || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter(function (line) {
        return line.trim() !== "";
      })
      .join("\n")
      .trim();
    var enc = new TextEncoder();
    return sendRawBytes(enc.encode(normalized + "\n"));
  }

  global.UsbRawPrinter = {
    isSupported: isSupported,
    connectPickDevice: connectPickDevice,
    connectFirstRemembered: connectFirstRemembered,
    disconnect: disconnect,
    sendRawBytes: sendRawBytes,
    sendZplText: sendZplText,
    getConnectedSummary: getConnectedSummary,
  };
})(typeof window !== "undefined" ? window : globalThis);
