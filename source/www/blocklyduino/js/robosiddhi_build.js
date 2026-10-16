/**
 * RoboSiddhi build helpers — pure logic, testable in Node + browser.
 * No child_process here: callers pass exec.
 * UMD.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RoboSiddhiBuild = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PROJECT_SCHEMA = 1;
  var CACHE_SCHEMA = 2;

  // Hex digest: Node crypto when available (tests + main process),
  // FNV-1a fallback in plain browsers (documented, non-crypto).
  function shaHex(s) {
    try {
      if (typeof require === 'function') {
        return require('crypto').createHash('sha256').update(String(s), 'utf8').digest('hex');
      }
    } catch (e) {}
    var h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0xdeadbeef;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 + c, 31);
      h3 = Math.imul(h3 ^ (c + i), 2654435761);
    }
    function h(x) { return ('0000000' + (x >>> 0).toString(16)).slice(-8); }
    return h(h1) + h(h2) + h(h3) + h(h1 ^ h3);
  }

  function codeHash(code) { return shaHex(code).slice(0, 16); }

  // Deterministic cache key over EVERYTHING that affects the binary.
  // fields: {codeHash, fqbn, coreVersion, cliVersion, flags, libVersions}
  function cacheKey(f) {
    f = f || {};
    var libs = f.libVersions && typeof f.libVersions === 'object' ? f.libVersions : {};
    var names = Object.keys(libs).sort();
    var canon = 'v2|' + (f.codeHash || '') + '|' + (f.fqbn || '') + '|' +
      (f.coreVersion || '') + '|' + (f.cliVersion || '') + '|' +
      (f.flags || '') + '|' + names.map(function (n) { return n + '@' + libs[n]; }).join(',');
    return shaHex(canon).slice(0, 32);
  }

  // entry: cache.json object. binSha256: hex of the .bin on disk (or null).
  // returns {ok:true} or {ok:false, reason:'...'} — reason codes are stable for UI/tests.
  function validateCacheEntry(entry, want, binSha256) {
    if (!entry || typeof entry !== 'object') return { ok: false, reason: 'no-entry' };
    if (entry.schema !== CACHE_SCHEMA) return { ok: false, reason: 'schema-mismatch' };
    if (entry.fqbn !== want.fqbn) return { ok: false, reason: 'board-changed' };
    if (entry.codeHash !== want.codeHash) return { ok: false, reason: 'code-changed' };
    if ((entry.coreVersion || '') !== (want.coreVersion || '')) return { ok: false, reason: 'core-changed' };
    if ((entry.cliVersion || '') !== (want.cliVersion || '')) return { ok: false, reason: 'toolchain-changed' };
    if ((entry.flags || '') !== (want.flags || '')) return { ok: false, reason: 'flags-changed' };
    if (entry.status !== 'ok') return { ok: false, reason: 'build-not-ok' };
    if (!entry.binName) return { ok: false, reason: 'no-binary' };
    if (!binSha256) return { ok: false, reason: 'binary-missing' };
    if (entry.binSha256 !== binSha256) return { ok: false, reason: 'binary-corrupt' };
    return { ok: true, reason: 'hit' };
  }

  function quoteArg(s) {
    s = String(s);
    if (/^[A-Za-z0-9_:\/\\.\-]+$/.test(s)) return s;
    return '"' + s.replace(/"/g, '\\"') + '"';
  }

  // Build arduino-cli commands. Never include workspace text — only validated enums/paths.
  // opts (optional): {verbose:bool, buildPath:string, jobs:number, buildProperties:[{k,v}]}
  function compileCommand(fqbn, sketchDir, verbose) {
    if (!fqbn || fqbn === 'none') throw new Error('Select a board first.');
    if (!sketchDir) throw new Error('Missing sketch dir.');
    var o = (verbose && typeof verbose === 'object') ? verbose : { verbose: !!verbose };
    var parts = ['arduino-cli.exe', 'compile', '-j', String(o.jobs === undefined ? 0 : o.jobs)];
    if (o.verbose) parts.push('-v');
    parts.push('-b', quoteArg(fqbn));
    (o.buildProperties || []).forEach(function (p) { parts.push('--build-property', quoteArg(p.k + '=' + p.v)); });
    if (o.buildPath) parts.push('--build-path', quoteArg(o.buildPath));
    parts.push(quoteArg(sketchDir));
    return parts.join(' ');
  }
  // opts (optional): {verbose:bool, inputDir:string, uploadSpeed:number|string, verify:bool,
  //                   uploadProperties:[{k,v}]}
  function uploadCommand(fqbn, port, sketchDir, verbose) {
    if (!fqbn || fqbn === 'none') throw new Error('Select a board first.');
    if (!port || port === 'none') throw new Error('Select a serial port first.');
    if (!/^(COM\d+|\/dev\/tty[A-Za-z0-9._-]+)$/.test(port)) throw new Error('Suspicious port "' + port + '" rejected.');
    var o = (verbose && typeof verbose === 'object') ? verbose : { verbose: !!verbose };
    var parts = ['arduino-cli.exe', 'upload'];
    if (o.verbose) parts.push('-v');
    parts.push('-p', quoteArg(port), '-b', quoteArg(fqbn));
    if (o.inputDir) parts.push('--input-dir', quoteArg(o.inputDir));
    if (o.uploadSpeed) {
      var sp = String(o.uploadSpeed);
      if (!/^\d+$/.test(sp)) throw new Error('Bad upload speed "' + sp + '".');
      parts.push('--upload-property', quoteArg('upload.speed=' + sp));
    }
    (o.uploadProperties || []).forEach(function (p) { parts.push('--upload-property', quoteArg(p.k + '=' + p.v)); });
    if (o.verify) parts.push('--verify');
    parts.push(quoteArg(sketchDir));
    return parts.join(' ');
  }

  function coreForFqbn(fqbn) {
    if (!fqbn) return null;
    if (fqbn.indexOf('esp32:esp32') === 0) return 'esp32:esp32';
    if (fqbn.indexOf('esp8266:esp8266') === 0) return 'esp8266:esp8266';
    return null; // ESP-only IDE: no AVR/STM32 targets
  }

  function diagnoseCompilerError(stderr, fqbn) {
    stderr = stderr || '';
    var core = coreForFqbn(fqbn);
    if (/can't open sketch|main file missing/i.test(stderr)) {
      return 'App sketch setup error (internal file layout). Restart the app and retry. ' +
        'If it repeats, copy this full text to the developer:\n' + stderr;
    }    if (/no such file or directory.*\.h|fatal error:.*\.h/i.test(stderr)) {
      return 'Missing Arduino library (.h not found). Install via CLI panel: arduino-cli.exe lib install "<name>". ' +
        'DHT needs "DHT sensor library" + "Adafruit Unified Sensor". Details:\n' + stderr;
    }
    if (/no such file|can't open|not installed|missing FQBN|unknown board|no board/i.test(stderr) && core) {
      return 'Board core missing. Install it first: arduino-cli.exe core install ' + core +
        ' (needs internet once), then retry. Open Settings → CLI panel.';
    }
    if (/couldn't find board|port.*busy|access is denied|permission denied|port not found|no such file.*COM/i.test(stderr)) {
      return 'Serial port busy or missing. Close Serial Monitor, unplug/replug USB, check driver (CP210x/CH340), pick the right COM, retry. Details:\n' + stderr;
    }
    if (/esptool|failed to connect|timed out waiting|invalid head of packet/i.test(stderr)) {
      return 'Upload handshake failed. Hold BOOT on some ESP32 boards while uploading, use short USB data cable (not charge-only), pick correct COM. Details:\n' + stderr;
    }
    return stderr;
  }

  function newProjectSkeleton(name, boardId) {
    return {
      schema: PROJECT_SCHEMA, app: 'RoboSiddhi ESP IDE', name: name || 'untitled',
      boardId: boardId || 'esp32_devkit_v1', created: new Date().toISOString(), modified: new Date().toISOString(),
      workspaceXml: '', code: '', notes: ''
    };
  }
  function validateProject(p) {
    if (!p || typeof p !== 'object') return { ok: false, error: 'Not a project object.' };
    if (p.schema !== PROJECT_SCHEMA) return { ok: false, error: 'Unsupported schema ' + p.schema + ' (expected ' + PROJECT_SCHEMA + ').' };
    if (!p.boardId) return { ok: false, error: 'Missing boardId.' };
    if (typeof p.workspaceXml !== 'string') return { ok: false, error: 'Missing workspaceXml.' };
    return { ok: true };
  }

  return {
    SCHEMA: PROJECT_SCHEMA, CACHE_SCHEMA: CACHE_SCHEMA, quoteArg: quoteArg,
    shaHex: shaHex, codeHash: codeHash, cacheKey: cacheKey,
    validateCacheEntry: validateCacheEntry,
    compileCommand: compileCommand, uploadCommand: uploadCommand,
    coreForFqbn: coreForFqbn, diagnoseCompilerError: diagnoseCompilerError,
    newProjectSkeleton: newProjectSkeleton, validateProject: validateProject
  };
}));
