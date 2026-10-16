/**
 * RoboSiddhi wiring assistant — text guidance from registry + board profile.
 * UMD browser/Node.
 */
(function (root, factory) {
  var Boards = null, Registry = null;
  try {
    if (typeof require === 'function' && typeof module !== 'undefined') {
      try { Boards = require('./esp_board_profiles.js'); } catch (e) { try { Boards = root.RoboSiddhiBoards || null; } catch (e2) {} }
      try { Registry = require('../components_registry.json'); } catch (e) { Registry = null; }
    } else { try { Boards = root.RoboSiddhiBoards || null; } catch (e) {} }
  } catch (e) {}
  var api = factory(Boards, Registry, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RoboSiddhiWiring = api;
}(typeof self !== 'undefined' ? self : this, function (Boards, Registry, root) {
  'use strict';
  function component(id) {
    if (!Registry) return null;
    var list = Registry.components || Registry;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function wiringFor(boardId, componentId, pins) {
    var c = null;
    try {
      if (Registry) { var list = Registry.components || []; for (var i = 0; i < list.length; i++) if (list[i].id === componentId) c = list[i]; }
    } catch (e) {}
    var b = null;
    try {
      var BB = Boards;
      try { if (!BB && root && root.RoboSiddhiBoards) BB = root.RoboSiddhiBoards; } catch (e) {}
      b = BB ? BB.getProfile(boardId) : null;
    } catch (e) {}
    var lines = [];
    lines.push('Board: ' + (b ? b.name + ' (' + b.chip + ')' : boardId));
    lines.push('Component: ' + (c ? c.name : componentId));
    if (c && c.voltage) lines.push('Power: ' + c.voltage);
    if (c && c.wiring) lines.push('Wiring: ' + c.wiring);
    if (pins) lines.push('Pins: ' + JSON.stringify(pins));
    if (b && b.voltage) lines.push('Logic: ' + b.voltage);
    lines.push('Check: common GND, correct voltage, no GPIO6-11 (flash) on ESP32/ESP8266.');
    return lines.join('\n');
  }
  return { component: component, wiringFor: wiringFor };
}));
