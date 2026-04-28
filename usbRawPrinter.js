/**
 * WebUSB raw send — same pattern as ekartprintv3 PrinterManager: bulk OUT, chunk by packetSize, transferOut + retries.
 * Supports multiple remembered devices open at once; pick target by session index when sending.
 */
(function (global) {
  "use strict";

  var TRANSFER_RETRY_ATTEMPTS = 3;
  var RETRY_DELAY_MS = 100;

  /** @type {Array<{ device: USBDevice, endpoints: { in: *, out: * } }>} */
  var sessions = [];

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

  function findSessionIndexByDevice(device) {
    var i;
    for (i = 0; i < sessions.length; i++) {
      if (sessions[i].device === device) {
        return i;
      }
    }
    return -1;
  }

  function getSessionSummary(index) {
    var s = sessions[index];
    if (!s || !s.device) {
      return null;
    }
    var d = s.device;
    var out = s.endpoints && s.endpoints.out;
    return {
      index: index,
      vendorId: d.vendorId,
      productId: d.productId,
      productName: d.productName || "",
      packetSize: out ? out.packetSize : 0,
      interfaceNumber: out ? out.interfaceNumber : -1,
    };
  }

  /** @returns {Array<object>} summary for each open session (includes index). */
  function getConnectedSummaries() {
    var out = [];
    var i;
    for (i = 0; i < sessions.length; i++) {
      var sum = getSessionSummary(i);
      if (sum) {
        out.push(sum);
      }
    }
    return out;
  }

  /** First session summary, or null (backward compatible). */
  function getConnectedSummary() {
    if (!sessions.length) {
      return null;
    }
    return getSessionSummary(0);
  }

  function releaseSessionEntry(entry) {
    if (!entry || !entry.device) {
      return Promise.resolve();
    }
    var device = entry.device;
    var out = entry.endpoints && entry.endpoints.out;
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

  function disconnect() {
    var copy = sessions.slice();
    sessions = [];
    return copy.reduce(function (p, entry) {
      return p.then(function () {
        return releaseSessionEntry(entry);
      });
    }, Promise.resolve());
  }

  /**
   * Open + claim one device and append (or refresh) session list.
   * @returns {Promise<number>} session index
   */
  function addSession(device) {
    var existing = findSessionIndexByDevice(device);
    if (existing >= 0) {
      var d0 = sessions[existing].device;
      if (d0.opened) {
        return Promise.resolve(existing);
      }
      sessions.splice(existing, 1);
    }
    return device
      .open()
      .then(function () {
        if (device.configuration === null) {
          return device.selectConfiguration(1);
        }
      })
      .then(function () {
        var endpoints = findBulkTransferEndpoints(device);
        if (!endpoints.out) {
          return device.close().catch(function () {}).then(function () {
            throw new Error("Could not find a bulk OUT endpoint on this device.");
          });
        }
        return device.claimInterface(endpoints.out.interfaceNumber).then(function () {
          sessions.push({ device: device, endpoints: endpoints });
          return sessions.length - 1;
        });
      });
  }

  /** User gesture: system picker (filters empty = any device, like testing a Zebra). Adds without closing other sessions. */
  function connectPickDevice() {
    if (!isSupported()) {
      return Promise.reject(
        new Error("WebUSB not available. Use Chrome or Edge over https:// or http://localhost.")
      );
    }
    return navigator.usb.requestDevice({ filters: [] }).then(function (device) {
      return addSession(device).then(function (idx) {
        return getSessionSummary(idx);
      });
    });
  }

  /** Open every device the browser already remembers for this origin (no picker). */
  function connectAllRemembered() {
    if (!isSupported()) {
      return Promise.reject(new Error("WebUSB not available."));
    }
    return navigator.usb.getDevices().then(function (list) {
      if (!list || !list.length) {
        throw new Error(
          "No remembered USB devices. Use “Connect USB (pick device)” once and allow access."
        );
      }
      var chain = Promise.resolve();
      var opened = 0;
      var i;
      for (i = 0; i < list.length; i++) {
        (function (dev) {
          chain = chain.then(function () {
            return addSession(dev)
              .then(function () {
                opened++;
              })
              .catch(function (err) {
                global.console.warn("WebUSB skip device:", err && err.message ? err.message : err);
              });
          });
        })(list[i]);
      }
      return chain.then(function () {
        if (!sessions.length) {
          throw new Error("Could not open any remembered USB device (all failed or lack bulk OUT).");
        }
        return getConnectedSummaries();
      });
    });
  }

  /** @deprecated Prefer {@link connectAllRemembered}; kept for callers that expect one open pass. */
  function connectFirstRemembered() {
    return connectAllRemembered().then(function (list) {
      return list && list[0] ? list[0] : getConnectedSummary();
    });
  }

  /**
   * @param {Uint8Array} u8
   * @param {number} [sessionIndex] required when more than one session is open
   */
  function sendRawBytes(u8, sessionIndex) {
    var idx =
      sessionIndex != null && Number.isFinite(Number(sessionIndex))
        ? Number(sessionIndex)
        : 0;
    if (sessions.length > 1 && (sessionIndex == null || !Number.isFinite(Number(sessionIndex)))) {
      return Promise.reject(
        new Error("Multiple USB printers are connected — choose one in “USB print target” before sending.")
      );
    }
    if (idx < 0 || idx >= sessions.length) {
      return Promise.reject(new Error("Invalid USB session index."));
    }
    var managed = sessions[idx];
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

  /** @param {string} str @param {number} [sessionIndex] */
  function sendZplText(str, sessionIndex) {
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
    return sendRawBytes(enc.encode(normalized + "\n"), sessionIndex);
  }

  global.UsbRawPrinter = {
    isSupported: isSupported,
    connectPickDevice: connectPickDevice,
    connectFirstRemembered: connectFirstRemembered,
    connectAllRemembered: connectAllRemembered,
    disconnect: disconnect,
    sendRawBytes: sendRawBytes,
    sendZplText: sendZplText,
    getConnectedSummary: getConnectedSummary,
    getConnectedSummaries: getConnectedSummaries,
    getSessionCount: function () {
      return sessions.length;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
