/**
 * RoboSiddhi Board Manager — dynamic board/pin validation.
 * Depends on esp_board_profiles.js (window.RoboSiddhiBoards or require).
 * UMD: browser + Node.
 */
(function (root, factory) {
  var Boards = null;
  try {
    if (typeof require === 'function' && typeof module !== 'undefined') {
      try { Boards = require('./esp_board_profiles.js'); } catch (e) { try { Boards = root.RoboSiddhiBoards || null; } catch (e2) { Boards = null; } }
    } else { try { Boards = root.RoboSiddhiBoards || null; } catch (e) { Boards = null; } }
  } catch (e) { Boards = null; }
  var api = factory(Boards, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RoboSiddhiBoardManager = api;
}(typeof self !== 'undefined' ? self : this, function (Boards, root) {
  'use strict';

  function B() {
    if (Boards) return Boards;
    try { if (root && root.RoboSiddhiBoards) return root.RoboSiddhiBoards; } catch (e) {}
    try { if (typeof RoboSiddhiBoards !== 'undefined' && RoboSiddhiBoards) return RoboSiddhiBoards; } catch (e) {}
    return null;
  }

  function profiles() { return B(); }

  function getBoard(id) {
    var b = B(); if (!b) return null;
    return b.getProfile(id);
  }

  /**
   * Validate a GPIO for a use-case.
   * @param {string} boardId
   * @param {string|number} gpio — 'A0' allowed on ESP8266
   * @param {string} mode — 'digital_out' | 'digital_in' | 'analog_in' | 'pwm'
   * @returns {{ok:boolean, level:'ok'|'warn'|'error', messages:string[]}}
   */
  function validatePin(boardId, gpio, mode) {
    mode = mode || 'digital_out';
    var res = { ok: true, level: 'ok', messages: [] };
    function fail(msg) { res.ok = false; res.level = 'error'; res.messages.push(msg); }
    function warn(msg) { if (res.level !== 'error') res.level = 'warn'; res.messages.push(msg); }

    var b = getBoard(boardId);
    if (!b) { fail('Unknown board "' + boardId + '". Select a matching profile instead of guessing pins.'); return res; }

    if (gpio === 'A0' || gpio === 'a0') {
      if (b.id === 'esp8266_nodemcu') return res; // only analog pin
      fail('A0 exists only on ESP8266 NodeMCU. This ' + b.name + ' uses numbered ADC GPIOs.');
      return res;
    }
    var n = parseInt(gpio, 10);
    if (isNaN(n)) { fail('Invalid pin "' + gpio + '". Use a GPIO number from the board pinout.'); return res; }

    if (b.unavailable && b.unavailable.indexOf(n) !== -1) {
      fail('GPIO' + n + ' is unavailable: ' + (b.unavailableReason || 'reserved.'));
      return res;
    }
    var entry = B().pinEntry(boardId, n);
    if (!entry) { fail('GPIO' + n + ' is not broken out on ' + b.name + '. Pick from the pinout list.'); return res; }

    if (mode === 'analog_in' && !entry.adc) {
      // ESP32: ADC-capable list; ESP8266 digitals have no ADC
      if (b.id === 'esp8266_nodemcu') fail('GPIO' + n + ' has no ADC on ESP8266 — use A0 for analog.');
      else fail('GPIO' + n + ' has no ADC on ' + b.name + '.');
      return res;
    }
    if (mode === 'pwm' && !entry.pwm) { fail('GPIO' + n + ' does not support PWM output on ' + b.name + '.'); return res; }
    if ((mode === 'digital_out' || mode === 'pwm') && entry.inputOnly) {
      fail('GPIO' + n + ' is input-only on ' + b.name + '. Choose an output-capable pin.');
      return res;
    }
    if (entry.strapping) warn('GPIO' + n + ' is a boot-strapping pin (' + (entry.note || 'strapping') + '). Wiring must allow correct boot level.');
    if (entry.usb) warn('GPIO' + n + ' is used by USB/UART (' + (entry.note || '') + '). Disconnect peripherals when flashing.');
    if (/UART0|TX|RX|flashing/i.test(entry.note || '')) warn('GPIO' + n + ': ' + entry.note);
    if (b.id === 'esp32_devkit_v1' && entry.adc && (mode === 'analog_in')) {
      // ADC2 vs WiFi warning for classic ESP32
      var adc2 = [0, 2, 4, 12, 13, 14, 15, 25, 26, 27];
      if (adc2.indexOf(n) !== -1) warn('GPIO' + n + ' is ADC2 — analogRead conflicts with Wi-Fi on classic ESP32. Prefer ADC1 (32,33,34,35,36,39) when using Wi-Fi.');
    }
    if (b.id === 'esp8266_nodemcu' && n === 16 && mode !== 'digital_out' && mode !== 'digital_in') {
      fail('GPIO16 supports digital I/O only (no PWM/interrupt/I2C/ADC).');
      return res;
    }
    return res;
  }

  function compatiblePins(boardId, mode) {
    var b = getBoard(boardId); if (!b || !b.pins) return [];
    return b.pins.filter(function (p) {
      var r = validatePin(boardId, p.gpio, mode);
      return r.level !== 'error';
    }).map(function (p) { return p.gpio; });
  }

  function onboardLed(boardId) {
    var b = getBoard(boardId); if (!b) return null;
    return b.onboardLed || null;
  }

  function boardSummary(boardId) {
    var b = getBoard(boardId); if (!b) return null;
    return {
      id: b.id, name: b.name, chip: b.chip, family: b.family, framework: b.framework,
      fqbn: b.fqbn, corePackage: b.corePackage, voltage: b.voltage,
      onboardLed: b.onboardLed, defaultBaud: b.defaultBaud,
      adc: b.adcResolution ? (b.adcResolution + '-bit') : '', gpioCount: b.pins ? b.pins.length : 0
    };
  }

  // Validate whole workspace pin usage: [{gpio, mode, block}] -> errors/warnings
  function validateWorkspace(boardId, usages) {
    var errors = [], warnings = [];
    var seenOut = {};
    (usages || []).forEach(function (u) {
      var r = validatePin(boardId, u.gpio, u.mode);
      if (r.level === 'error') errors.push('GPIO' + u.gpio + ' (' + (u.block || u.mode) + '): ' + r.messages.join(' '));
      else if (r.level === 'warn') warnings.push('GPIO' + u.gpio + ' (' + (u.block || u.mode) + '): ' + r.messages.join(' '));
      if (u.mode === 'digital_out' || u.mode === 'pwm') {
        if (seenOut[u.gpio]) warnings.push('GPIO' + u.gpio + ' drives two outputs (' + seenOut[u.gpio] + ' + ' + (u.block || u.mode) + '). Check wiring.');
        else seenOut[u.gpio] = (u.block || u.mode);
      }
    });
    return { errors: errors, warnings: warnings, ok: errors.length === 0 };
  }

  return {
    getBoard: getBoard, listProfiles: function () { var b = B(); return b ? b.listProfiles() : []; },
    validatePin: validatePin, compatiblePins: compatiblePins,
    onboardLed: onboardLed, boardSummary: boardSummary, validateWorkspace: validateWorkspace
  };
}));
