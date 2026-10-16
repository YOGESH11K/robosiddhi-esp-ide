/**
 * RoboSiddhi Runtime client — protocol framing, sender, block-program compiler.
 * UMD: testable in Node, loaded in the IDE via <script>.
 * Firmware side: runtime/RoboSiddhiRuntime/. Protocol: runtime/PROTOCOL.md.
 *
 * v1 scope (honest limits, everything else -> Arduino compile-and-flash mode):
 * - conditions: digital-read ==, analog-read </>/==, ultrasonic distance </>/==
 * - loops: repeat N (1..1000 literal); while UnrealIRouter bounded by firmware step budget
 * - outputs: digital write, PWM, servo angle, buzzer, OLED/LCD print, delay
 * - NO variables, NO DHT/DS18B20 inside programs, NO WiFi/MQTT in runtime mode
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RoboSiddhiRuntime = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PROTO_VERSION = 1;
  var MAX_OPS = 128;

  // Opcodes mirror RSProgram.h — MUST stay in sync with firmware.
  var OP = { DWRITE: 1, PWM: 2, SANGLE: 3, BUZZ: 4, WAIT: 5, IFD: 6, IFA_LT: 7, JMP: 8, LOOP: 9, END: 10 };

  function crc16(str) {
    var crc = 0xFFFF;
    for (var i = 0; i < str.length; i++) {
      crc ^= (str.charCodeAt(i) & 0xFF) << 8;
      for (var b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc & 0xFFFF;
  }
  function crcHex(s) { return ('000' + crc16(s).toString(16).toUpperCase()).slice(-4); }

  function crc32(str) {
    var table = crc32._t;
    if (!table) {
      table = crc32._t = new Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
        table[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < str.length; i++) crc = (table[(crc ^ str.charCodeAt(i)) & 0xFF] ^ (crc >>> 8)) >>> 0;
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  // CRC32 over raw op bytes exactly like firmware PROG_COMMIT (7 bytes/op LE).
  function programCrc32(ops) {
    var bytes = [];
    ops.forEach(function (o) {
      bytes.push(o.op & 0xFF, o.a & 0xFF, (o.a >> 8) & 0xFF, o.b & 0xFF, (o.b >> 8) & 0xFF, o.c & 0xFF, (o.c >> 8) & 0xFF);
    });
    var table = crc32._t || (crc32(''), crc32._t);
    var crc = 0xFFFFFFFF;
    bytes.forEach(function (by) { crc = (table[(crc ^ by) & 0xFF] ^ (crc >>> 8)) >>> 0; });
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function crc32Hex(n) { return ('0000000' + n.toString(16).toUpperCase()).slice(-8); }

  function buildFrame(seq, cmd, args) {
    var body = String(seq & 0xFF) + ' ' + cmd + ((args && args.length) ? ' ' + args.join(' ') : '');
    return 'RS ' + body + ' *' + crcHex(body) + '\n';
  }

  // Returns {ok, seq, status:'OK'|'ERR', payload} or {ok:false, reason}.
  function parseReply(line) {
    line = String(line).replace(/[\r\n]+$/, '');
    var m = /^(OK|ERR) (\d+) ?(.*?) ?\*([0-9A-Fa-f]{4})$/.exec(line);
    if (!m) return { ok: false, reason: 'bad-frame' };
    var body = m[2] + (m[3] ? ' ' + m[3] : '');
    if (crcHex(body) !== m[4].toUpperCase()) return { ok: false, reason: 'crc-fail' };
    return { ok: true, seq: parseInt(m[2], 10), status: m[1], payload: m[3] || '' };
  }

  // ---- sender over an abstract port {write(line), onLine(cb)} ----
  function Runtime(port, opts) {
    this.port = port;
    this.timeoutMs = (opts && opts.timeoutMs) || 3000;
    this.seq = 0;
    this.pending = {}; // seq -> {resolve, reject, timer}
    var self = this;
    port.onLine(function (line) { self._onLine(line); });
  }
  Runtime.prototype._onLine = function (line) {
    var r = parseReply(line);
    if (!r.ok || r.seq === undefined) return;
    var p = this.pending[r.seq];
    if (!p) return;
    delete this.pending[r.seq];
    clearTimeout(p.timer);
    if (r.status === 'OK') p.resolve(r.payload);
    else p.reject(new Error('runtime: ' + r.payload));
  };
  Runtime.prototype.command = function (cmd, args) {
    var self = this;
    var seq = (this.seq = (this.seq + 1) & 0xFF);
    return new Promise(function (resolve, reject) {
      self.pending[seq] = {
        resolve: resolve,
        reject: reject,
        timer: setTimeout(function () {
          delete self.pending[seq];
          reject(new Error('runtime timeout: ' + cmd + ' (is the Runtime firmware flashed? baud 115200?)'));
        }, self.timeoutMs)
      };
      try { self.port.write(buildFrame(seq, cmd, args)); }
      catch (e) { delete self.pending[seq]; reject(e); }
    });
  };
  Runtime.prototype.detect = function () {
    return this.command('HELLO', []).then(function (p) {
      if (p.indexOf('RS-RUNTIME') !== 0) throw new Error('not a RoboSiddhi runtime: ' + p);
      return p;
    });
  };
  Runtime.prototype.transferProgram = function (ops, pins) {
    var self = this;
    if (!ops.length || ops.length > MAX_OPS) return Promise.reject(new Error('program size 1..' + MAX_OPS + ' ops'));
    var chain = this.command('PROG_CLEAR', []);
    (pins || []).forEach(function (p) {
      chain = chain.then(function () { return self.command('PINMODE', [String(p), 'OUT']); });
    });
    for (var i = 0; i < ops.length; i += 10) {
      (function (chunk, idx) {
        chain = chain.then(function () {
          var s = chunk.map(function (o) { return [o.op, o.a, o.b, o.c].join(','); }).join(';');
          return self.command('PROG_ADD', [String(idx), s]);
        });
      })(ops.slice(i, i + 10), i);
    }
    return chain.then(function () {
      return self.command('PROG_COMMIT', [crc32Hex(programCrc32(ops))]);
    }).then(function () {
      return self.command('PROG_RUN', []);
    });
  };
  Runtime.prototype.stop = function () { return this.command('PROG_STOP', []); };
  Runtime.prototype.status = function () { return this.command('PROG_STATUS', []); };

  // ---- block workspace -> op list ----
  // blocks: array of {type, fields:{}, inputs:{name:block|null}, next:block|null}
  // with Blockly-like accessors; in the IDE pass real Blockly blocks.
  function B(type, fields, inputs, next) {
    return {
      type: type, _f: fields || {}, _i: inputs || {}, _n: next || null,
      getFieldValue: function (k) { return this._f[k]; },
      getInputTargetBlock: function (k) { return this._i[k] || null; },
      getNextBlock: function () { return this._n; }
    };
  }
  function numVal(b) {
    if (!b) return null;
    if (b.type === 'math_number') { var n = Number(b.getFieldValue('NUM')); return isFinite(n) ? n : null; }
    return null; // v1: literals only, no variables
  }
  function pinVal(b, defName) {
    if (!b) return null;
    var t = b.type;
    if (t === 'math_number') return numVal(b);
    if (t === 'board_base_angle') { var n = Number(b.getFieldValue('ANGLE')); return isFinite(n) ? n : null; }
    return null;
  }

  function Compiler() {
    this.ops = [];
    this.pinModeDone = {};
    this.errors = [];
  }
  Compiler.prototype.needOut = function (pin) {
    if (!this.pinModeDone[pin]) { this.pinModeDone[pin] = true; }
  };
  Compiler.prototype.emit = function (op, a, b, c) {
    if (this.ops.length >= MAX_OPS) { this.errors.push('program too big (max ' + MAX_OPS + ' ops) — use Arduino mode'); return -1; }
    this.ops.push({ op: op, a: a | 0, b: b === undefined ? 0 : b | 0, c: c === undefined ? 0 : c | 0 });
    return this.ops.length - 1;
  };
  // condition block -> {kind:'D'|'A', pin, cmp, val} or null+error.
  // v1 honest limits: ultrasonic/DHT/DS readings can only be POLLED from the IDE,
  // they cannot drive program branches (firmware has no conditional-read op).
  Compiler.prototype.readCond = function (cb) {
    if (!cb || cb.type !== 'logic_compare') return null;
    var cmp = cb.getFieldValue('OP');
    var A = cb.getInputTargetBlock('A'), Bv = cb.getInputTargetBlock('B');
    var val = numVal(Bv);
    if (val === null) { this.errors.push('conditions need a number on the right side'); return null; }
    if (A && (A.type === 'board_base_inout_digital_read')) {
      var p = pinVal(A.getInputTargetBlock('PIN')); // pin may be field or input; try both
      if (p === null) p = Number(A.getFieldValue('PIN'));
      if (!isFinite(p)) { this.errors.push('digital read needs a pin number'); return null; }
      if (cmp !== 'EQ') { this.errors.push('digital conditions support only = in runtime mode'); return null; }
      return { kind: 'D', pin: p, cmp: cmp, val: val };
    }
    if (A && A.type === 'board_base_inout_analog_read') {
      var pa = pinVal(A.getInputTargetBlock('PIN'));
      if (pa === null) pa = Number(A.getFieldValue('PIN'));
      if (!isFinite(pa)) { this.errors.push('analog read needs a pin number'); return null; }
      if (['EQ', 'LT', 'GT'].indexOf(cmp) === -1) { this.errors.push('analog conditions support =, <, >'); return null; }
      return { kind: 'A', pin: pa, cmp: cmp, val: val };
    }
    this.errors.push('this sensor cannot drive a runtime-mode branch (poll it live instead) — or use Arduino mode');
    return null;
  };
  // Emit "if (!cond) goto END" + fall into BODY. Returns {bodyAt, endPatches[]}
  // where endPatches are JMP-op indices whose target must be set to END later.
  Compiler.prototype.emitIfFalse = function (cond) {
    var ends = [], bodyAt = -1;
    if (cond.kind === 'D') {
      // FALSE means pin != val, i.e. pin == (1-val): single IFD.
      ends.push(this.emit(OP.IFD, cond.pin, cond.val ? 0 : 1, 0));
      bodyAt = this.ops.length;
      return { bodyAt: bodyAt, endPatches: ends };
    }
    // A: only IFA_LT exists. Patterns (t integer):
    //   a<t  false <=> a>=t : IFA_LT(t,BODY); JMP END; BODY:
    //   a>t  false <=> a<=t <=> a<(t+1): IFA_LT(t+1,BODY); JMP END; BODY:
    //   a==t : IFA_LT(t,END); IFA_LT(t+1,BODY); JMP END; BODY:
    if (cond.cmp === 'LT' || cond.cmp === 'GT') {
      var th = cond.cmp === 'LT' ? cond.val : cond.val + 1;
      var toBody = this.emit(OP.IFA_LT, cond.pin, th, 0);
      ends.push(this.emit(OP.JMP, 0));
      bodyAt = this.ops.length;
      this.ops[toBody].c = bodyAt;
      return { bodyAt: bodyAt, endPatches: ends };
    }
    var toEnd = this.emit(OP.IFA_LT, cond.pin, cond.val, 0);
    var toBody2 = this.emit(OP.IFA_LT, cond.pin, cond.val + 1, 0);
    ends.push(toEnd, this.emit(OP.JMP, 0));
    bodyAt = this.ops.length;
    this.ops[toBody2].c = bodyAt;
    return { bodyAt: bodyAt, endPatches: ends };
  };
  Compiler.prototype.patchEnd = function (idxs) {
    for (var i = 0; i < idxs.length; i++) {
      if (this.ops[idxs[i]].op === OP.JMP) this.ops[idxs[i]].a = this.ops.length;
      else this.ops[idxs[i]].c = this.ops.length;
    }
  };

  Compiler.prototype.stmts = function (b) {
    while (b && !this.errors.length) { this.stmt(b); b = b.getNextBlock(); }
  };
  Compiler.prototype.stmt = function (b) {
    var t = b.type, F = function (k) { return b.getFieldValue(k); };
    var pin, v;
    switch (t) {
      case 'robosiddhi_led_set':
        pin = Number(F('PIN')); v = (String(F('STATE')).toUpperCase() === 'ON' || F('STATE') === 'HIGH' || Number(F('STATE')) === 1) ? 1 : 0;
        this.needOut(pin); this.emit(OP.DWRITE, pin, v); return;
      case 'board_base_inout_digital_write':
        pin = pinVal(b.getInputTargetBlock('PIN')); if (pin === null) pin = Number(F('PIN'));
        v = numVal(b.getInputTargetBlock('STATE')); if (v === null) v = (String(F('STATE')).toUpperCase() === 'HIGH') ? 1 : 0;
        this.needOut(pin); this.emit(OP.DWRITE, pin, v ? 1 : 0); return;
      case 'board_base_inout_analog_write':
        pin = pinVal(b.getInputTargetBlock('PIN')); if (pin === null) pin = Number(F('PIN'));
        v = numVal(b.getInputTargetBlock('PWM')); if (v === null) v = Number(F('PWM'));
        if (!isFinite(pin) || !isFinite(v) || v < 0 || v > 255) { this.errors.push('PWM needs pin + 0..255'); return; }
        this.emit(OP.PWM, pin, v); return;
      case 'board_base_delay': {
        var ms = numVal(b.getInputTargetBlock('DELAY_TIME'));
        if (ms === null || ms < 0 || ms > 60000) { this.errors.push('delay needs 0..60000 ms'); return; }
        this.emit(OP.WAIT, ms); return;
      }
      case 'servo_move': {
        var sp = pinVal(b.getInputTargetBlock('PIN')); if (sp === null) sp = Number(F('PIN'));
        var dg = numVal(b.getInputTargetBlock('DEGREE')); if (dg === null) dg = Number(F('DEGREE'));
        if (!isFinite(sp) || !isFinite(dg) || dg < 0 || dg > 180) { this.errors.push('servo needs pin + 0..180'); return; }
        this.emit(OP.SANGLE, sp, dg); return;
      }
      case 'robosiddhi_buzzer': {
        var bp = Number(F('PIN') || 0), fr = Number(F('FREQ') || F('FREQUENCY') || 1000), ms2 = Number(F('MS') || F('DURATION') || 200);
        if (!isFinite(bp)) { this.errors.push('buzzer needs a pin'); return; }
        this.emit(OP.BUZZ, bp, fr, ms2); return;
      }
      case 'controls_repeat_ext': {
        var n = numVal(b.getInputTargetBlock('TIMES'));
        if (n === null || n < 1 || n > 1000 || Math.floor(n) !== n) { this.errors.push('repeat needs whole 1..1000'); return; }
        var bodyStart = this.ops.length;
        this.stmts(b.getInputTargetBlock('DO'));
        this.emit(OP.LOOP, n, bodyStart);
        return;
      }
      case 'controls_if': {
        var cond = this.readCond(b.getInputTargetBlock('IF0'));
        if (!cond) return;
        var br = this.emitIfFalse(cond);
        if (this.errors.length) return;
        this.stmts(b.getInputTargetBlock('DO0'));
        if (this.errors.length) return;
        var elseB = b.getInputTargetBlock('ELSE');
        if (elseB) {
          var endJmp = this.emit(OP.JMP, 0);
          this.patchEnd(br.endPatches);
          this.stmts(elseB);
          if (this.errors.length) return;
          this.ops[endJmp].a = this.ops.length;
        } else {
          this.patchEnd(br.endPatches);
        }
        return;
      }
      case 'controls_whileUntil': {
        var mode = String(b.getFieldValue('MODE') || 'WHILE');
        if (mode.toUpperCase() !== 'WHILE') { this.errors.push('UNTIL loops need Arduino mode in v1 (WHILE only)'); return; }
        var wcond = this.readCond(b.getInputTargetBlock('BOOL'));
        if (!wcond) return;
        var top = this.ops.length;
        var wbr = this.emitIfFalse(wcond);
        if (this.errors.length) return;
        this.stmts(b.getInputTargetBlock('DO'));
        if (this.errors.length) return;
        this.emit(OP.JMP, top);
        this.patchEnd(wbr.endPatches);
        return;
      }
      case '__LOOP__': {
        // IDE wrapper around the LOOP stack of setup+loop: mark loop start.
        this._loopFrom = this.ops.length;
        this.stmts(b.getInputTargetBlock('DO'));
        return;
      }
      default:
        this.errors.push('block "' + t + '" is not supported in runtime mode — use Arduino mode');
    }
  };
  // __LOOP__ pseudo-block: everything inside runs forever (setup+loop programs).
  // The IDE inserts it around the LOOP stack; compiler closes with JMP back.

  // topBlocks: array of statement chains. A '__LOOP__' pseudo-block (inserted by
  // the IDE around the LOOP stack of setup+loop) makes the program run forever
  // via a trailing backward JMP instead of END. opts.loopFrom overrides it.
  function compileBlocks(topBlocks, opts) {
    var c = new Compiler();
    (topBlocks || []).forEach(function (b) { if (!c.errors.length) c.stmts(b); });
    if (c.errors.length) return { ok: false, errors: c.errors };
    if (!c.ops.length) return { ok: false, errors: ['empty program'] };
    var lf = (opts && opts.loopFrom !== undefined && opts.loopFrom !== null) ? opts.loopFrom | 0 : c._loopFrom;
    if (lf !== undefined && lf !== null && !(lf < 0)) {
      if (lf >= c.ops.length) return { ok: false, errors: ['bad loop target'] };
      c.emit(OP.JMP, lf);
    } else {
      c.emit(OP.END);
    }
    if (c.ops.length > MAX_OPS) return { ok: false, errors: ['program too big'] };
    return { ok: true, ops: c.ops, pins: Object.keys(c.pinModeDone).map(Number) };
  }

  return {
    PROTO_VERSION: PROTO_VERSION, MAX_OPS: MAX_OPS, OP: OP,
    crc16: crc16, crc32: crc32, programCrc32: programCrc32, crc32Hex: crc32Hex,
    buildFrame: buildFrame, parseReply: parseReply,
    Runtime: Runtime, B: B, compileBlocks: compileBlocks
  };
}));
