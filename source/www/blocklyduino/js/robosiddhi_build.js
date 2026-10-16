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

  function quoteArg(s) {
    s = String(s);
    if (/^[A-Za-z0-9_:\/\\.\-]+$/.test(s)) return s;
    return '"' + s.replace(/"/g, '\\"') + '"';
  }

  // Build arduino-cli commands. Never include workspace text — only validated enums/paths.
  function compileCommand(fqbn, sketchDir, verbose) {
    if (!fqbn || fqbn === 'none') throw new Error('Select a board first.');
    if (!sketchDir) throw new Error('Missing sketch dir.');
    return 'arduino-cli.exe compile ' + (verbose ? '-v ' : '') + '-b ' + quoteArg(fqbn) + ' ' + quoteArg(sketchDir);
  }
  function uploadCommand(fqbn, port, sketchDir, verbose) {
    if (!fqbn || fqbn === 'none') throw new Error('Select a board first.');
    if (!port || port === 'none') throw new Error('Select a serial port first.');
    if (!/^(COM\d+|\/dev\/tty[A-Za-z0-9._-]+)$/.test(port)) throw new Error('Suspicious port "' + port + '" rejected.');
    return 'arduino-cli.exe upload ' + (verbose ? '-v ' : '') + '-p ' + quoteArg(port) + ' -b ' + quoteArg(fqbn) + ' ' + quoteArg(sketchDir);
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
    SCHEMA: PROJECT_SCHEMA, quoteArg: quoteArg,
    compileCommand: compileCommand, uploadCommand: uploadCommand,
    coreForFqbn: coreForFqbn, diagnoseCompilerError: diagnoseCompilerError,
    newProjectSkeleton: newProjectSkeleton, validateProject: validateProject
  };
}));
