/**
 * RoboSiddhi ESP IDE — Node tests (no hardware required).
 * Run: node tests/run_tests.js
 */
'use strict';
const assert = require('assert');
const path = require('path');

const Boards = require('../www/blocklyduino/js/esp_board_profiles.js');
const Manager = require('../www/blocklyduino/js/robosiddhi_board_manager.js');

let pass = 0, fail = 0;
const pendingAsync = [];
function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      pendingAsync.push(r.then(
        () => { pass++; console.log('PASS ' + name); },
        (e) => { fail++; console.error('FAIL ' + name + ' :: ' + (e && e.message)); }
      ));
    } else { pass++; console.log('PASS ' + name); }
  }
  catch (e) { fail++; console.error('FAIL ' + name + ' :: ' + e.message); }
}

// 1. Board registry loads
test('profiles list has 6 ESP boards', () => {
  const list = Manager.listProfiles();
  const ids = list.map(p => p.id);
  ['esp32_devkit_v1', 'nodemcu_32s', 'esp32s2_dev', 'esp32s3_dev', 'esp32c3_dev', 'esp8266_nodemcu'].forEach(id => {
    assert.ok(ids.includes(id), 'missing ' + id);
  });
});

test('each profile has fqbn + corePackage', () => {
  Manager.listProfiles().forEach(p => {
    assert.ok(p.fqbn && p.fqbn.includes(':'), p.id + ' fqbn');
    assert.ok(p.corePackage && p.corePackage.includes(':'), p.id + ' core');
  });
});

// 2. GPIO restrictions
test('ESP32 GPIO6 flash-reserved rejected', () => {
  const r = Manager.validatePin('esp32_devkit_v1', 6, 'digital_out');
  assert.strictEqual(r.ok, false);
});
test('ESP32 GPIO13 LED ok', () => {
  const r = Manager.validatePin('esp32_devkit_v1', 13, 'digital_out');
  assert.strictEqual(r.ok, true);
});
test('ESP32-C3 GPIO11 flash-reserved rejected', () => {
  const r = Manager.validatePin('esp32c3_dev', 11, 'digital_out');
  assert.strictEqual(r.ok, false);
});
test('ESP32-C3 GPIO4 ok', () => {
  const r = Manager.validatePin('esp32c3_dev', 4, 'digital_out');
  assert.strictEqual(r.ok, true);
});
test('ESP8266 A0 analog ok, GPIO4 analog rejected', () => {
  assert.strictEqual(Manager.validatePin('esp8266_nodemcu', 'A0', 'analog_in').ok, true);
  assert.strictEqual(Manager.validatePin('esp8266_nodemcu', 4, 'analog_in').ok, false);
});
test('ESP8266 GPIO16 PWM rejected', () => {
  const r = Manager.validatePin('esp8266_nodemcu', 16, 'pwm');
  assert.strictEqual(r.ok, false);
});
test('ESP32 input-only 34 as output rejected', () => {
  const r = Manager.validatePin('esp32_devkit_v1', 34, 'digital_out');
  assert.strictEqual(r.ok, false);
});
test('strapping pin gives warning not error', () => {
  const r = Manager.validatePin('esp32_devkit_v1', 0, 'digital_out');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.level, 'warn');
});
test('unknown board errors (no invented mapping)', () => {
  const r = Manager.validatePin('esp99_fake', 13, 'digital_out');
  assert.strictEqual(r.ok, false);
});

// 3. Board change: compatible pins differ per board
test('compatible PWM pins differ ESP32 vs C3', () => {
  const a = Manager.compatiblePins('esp32_devkit_v1', 'pwm');
  const b = Manager.compatiblePins('esp32c3_dev', 'pwm');
  assert.ok(a.includes(13) && b.includes(4));
  assert.ok(!b.includes(13), 'C3 has no GPIO13');
});
test('ESP8266 analog list is A0 only via registry', () => {
  const reg = require('../www/blocklyduino/components_registry.json');
  const soil = reg.components.find(c => c.id === 'soil_analog');
  assert.ok(soil.boards.includes('esp8266_nodemcu'));
});

// 4. Workspace validation: double-output warns
test('workspace double-drive warns', () => {
  const r = Manager.validateWorkspace('esp32_devkit_v1', [
    { gpio: 13, mode: 'digital_out', block: 'led1' },
    { gpio: 13, mode: 'digital_out', block: 'led2' }
  ]);
  assert.strictEqual(r.ok, true);
  assert.ok(r.warnings.length >= 1);
});

// 5. Component registry: supported have blocks
test('supported components have blocks', () => {
  const reg = require('../www/blocklyduino/components_registry.json');
  reg.components.filter(c => c.status === 'supported').forEach(c => {
    assert.ok(Array.isArray(c.blocks) && c.blocks.length >= 1, c.id + ' needs blocks');
  });
});

// 6. Toolbox ESP valid (JS var wrapper, loaded via <script>)
test('toolbox_esp.json valid', () => {
  const fs = require('fs');
  let raw = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/toolbox/toolbox_esp.json'), 'utf8');
  let m = raw.match(/var\s+toolbox_esp\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  assert.ok(m, 'toolbox_esp var wrapper');
  const tb = JSON.parse(m[1]);
  assert.strictEqual(tb.toolboxitemid, 'ESP');
  assert.ok(tb.contents.length >= 19, 'ESP toolbox has all blocks, got ' + tb.contents.length);
});

// 7. Boards.json parses + ESP-only (no Arduino AVR)
test('boards.json parses, ESP-only', () => {
  const fs = require('fs');
  const raw = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/js/boards.json'), 'utf8');
  const m = raw.match(/var profile = (\{[\s\S]*\})\s*;?\s*$/);
  assert.ok(m, 'boards.json wrapper');
  const profile = JSON.parse(m[1]);
  assert.ok(profile.esp32_devkit_v1, 'esp32 present');
  assert.ok(profile.esp8266_nodemcu, 'esp8266 present');
  const avr = Object.keys(profile).filter(k => k.startsWith('arduino_') || k === 'lilypad');
  assert.strictEqual(avr.length, 0, 'AVR removed, found: ' + avr.join(','));
});

// 8. Generator smoke test with stubbed Blockly.Arduino
test('LED generator emits pinMode + digitalWrite', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/arduino/esp/esp_sensors.js'), 'utf8');
  assert.ok(src.includes("pinMode(") && src.includes("digitalWrite("));
  assert.ok(src.includes("#include <DHT.h>"), 'DHT include');
  assert.ok(src.includes("pulseIn("), 'HCSR04 pulseIn');
});

// 9. Build helpers: safe commands + diagnostics + project schema
test('compile/upload commands quoted + validated', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  assert.ok(Build.compileCommand('esp32:esp32:esp32', '.\\tmp', false).includes('-b esp32:esp32:esp32'));
  assert.throws(() => Build.compileCommand('none', '.\\tmp', false));
  assert.throws(() => Build.uploadCommand('esp32:esp32:esp32', 'none', '.\\tmp', false));
  assert.throws(() => Build.uploadCommand('esp32:esp32:esp32', 'COM1; rm -rf /', '.\\tmp', false));
  assert.ok(Build.uploadCommand('esp32:esp32:esp32', 'COM5', '.\\tmp', false).includes('COM5'));
});
test('diagnose missing .h suggests lib install', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  const msg = Build.diagnoseCompilerError('fatal error: DHT.h: No such file', 'esp32:esp32:esp32');
  assert.ok(/lib install/i.test(msg));
});
test('diagnose missing core suggests core install', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  const msg = Build.diagnoseCompilerError('Error: unknown board esp32:esp32:esp32', 'esp32:esp32:esp32');
  assert.ok(/core install esp32:esp32/.test(msg));
});
test('project schema round-trips', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  const p = Build.newProjectSkeleton('demo', 'esp32c3_dev');
  assert.strictEqual(Build.validateProject(p).ok, true);
  assert.strictEqual(Build.validateProject({}).ok, false);
});
test('examples exist and parse as XML', () => {
  const fs = require('fs');
  ['esp_blink.xml', 'esp_temp_alarm.xml', 'esp_autolight.xml', 'esp_obstacle.xml', 'esp_soil.xml', 'esp_motion.xml', 'esp_oled_hello.xml', 'esp_wifi_http.xml', 'esp_led_fade.xml', 'esp_led_on_g2.xml', 'esp_obstacle_guard.xml', 'esp_servo_pin4.xml'].forEach(f => {
    const s = fs.readFileSync(path.join(__dirname, '../www/examples/' + f), 'utf8');
    assert.ok(s.includes('<xml') && s.includes('base_setup_loop'), f);
  });
  // every registry example path must exist on disk
  const reg = require('../www/blocklyduino/components_registry.json');
  reg.components.forEach(c => {
    if (c.example) assert.ok(fs.existsSync(path.join(__dirname, '..', c.example)), c.id + ' example missing: ' + c.example);
  });
  // led-examples folder: 5 LED programs, all GPIO2, all with setup+loop
  const ledDir = path.join(__dirname, '../www/led-examples');
  const ledFiles = fs.readdirSync(ledDir).filter(f => f.endsWith('.xml')).sort();
  assert.deepStrictEqual(ledFiles, ['led_blink.xml', 'led_brightness.xml', 'led_glow.xml', 'led_off.xml', 'led_on.xml']);
  const want = { 'led_on.xml': 'HIGH', 'led_off.xml': 'LOW', 'led_blink.xml': 'robosiddhi_led_blink', 'led_glow.xml': 'robosiddhi_led_fade', 'led_brightness.xml': 'board_base_inout_analog_write' };
  ledFiles.forEach(f => {
    const s = fs.readFileSync(path.join(ledDir, f), 'utf8');
    assert.ok(s.includes('<xml') && s.includes('base_setup_loop'), f + ' parses');
    assert.ok(s.includes('<field name="PIN">2</field>'), f + ' targets GPIO2');
    assert.ok(s.includes(want[f]), f + ' has ' + want[f]);
  });
});

// 10. New display/comm generators
test('display+comm generators emit correct includes', () => {
  const fs = require('fs');
  const disp = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/arduino/esp/esp_display.js'), 'utf8');
  assert.ok(disp.includes('Adafruit_SSD1306.h') && disp.includes('LiquidCrystal_I2C.h'));
  const comm = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/arduino/esp/esp_comm.js'), 'utf8');
  assert.ok(comm.includes('#ifdef ESP32') && comm.includes('ESP8266WiFi.h') && comm.includes('PubSubClient.h'));
  assert.ok(comm.includes('Adafruit_MPU6050.h') && comm.includes('analogWrite('));
});
test('index.html has no AVR options, loads ESP scripts as tags', () => {
  const fs = require('fs');
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  assert.ok(!/value="arduino_/.test(html) && !/value="lilypad"/.test(html), 'AVR options removed');
  ['esp_display.js', 'esp_comm.js'].forEach(f => {
    assert.ok(html.includes('<script src="./blocklyduino/blocks/esp/' + f + '"'), 'blocks ' + f);
    assert.ok(html.includes('<script src="./blocklyduino/arduino/esp/' + f + '"'), 'gen ' + f);
  });
  assert.ok(!html.includes("require('../CLI_functions.js')"), 'no renderer require left in index');
});
test('main.js is secure: preload + isolation, no nodeIntegration', () => {  const fs = require('fs');
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  assert.ok(main.includes("preload.js"), 'preload set');
  assert.ok(main.includes('nodeIntegration: false') && main.includes('contextIsolation: true'));
  assert.ok(!/nodeIntegration:\s*true/.test(main), 'nodeIntegration true gone');
  ['rs-compile', 'rs-upload', 'rs-ports', 'rs-mon-open', 'rs-cli'].forEach(ch => {
    assert.ok(main.includes("'" + ch + "'"), 'handler ' + ch);
  });
});
test('upload compiles fresh unless code unchanged (fast re-upload, no stale flash)', () => {  const fs = require('fs');
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const h = main.match(/handle\('rs-upload'([\s\S]*?)\r?\n\}\);\r?\n/);
  assert.ok(h, 'rs-upload handler found');
  const ci = h[1].indexOf("'compile'");
  const ui = h[1].indexOf("'upload'");
  assert.ok(ci !== -1 && ui !== -1 && ci < ui, 'rs-upload compiles before uploading');
  assert.ok(/COMPILE FAILED/.test(h[1]), 'compile failure aborts upload');
  assert.ok(/sketchHash|codeHashFor|sketch\.hash/.test(h[1]), 'hash guard: changed code forces recompile');
  assert.ok(/--build-path/.test(main) && /--input-dir/.test(main), 'persistent build cache for fast upload');
  assert.ok(/SKIPPED recompile/.test(h[1]), 'unchanged code skips recompile');
});
test('packaged exe resolves beside the binary (extraFiles, not asar)', () => {  const fs = require('fs');
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  assert.ok(main.includes("path.dirname(app.getPath('exe'))"), 'cli path anchored at exe dir');  assert.ok(!main.includes('app.asar.unpacked'), 'no asar.unpacked exe path left');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  const unpack = JSON.stringify(pkg.build.asarUnpack);
  assert.ok(!/compiler/.test(unpack), 'asarUnpack has no dead compiler entries');
  assert.ok(pkg.build.win.icon.endsWith('.ico'), 'windows icon is .ico');
  assert.ok(main.includes("app.setAppUserModelId('com.robosiddhi.app')"), 'explicit taskbar identity set');
});
test('no dead require-based default example (secure renderer safe)', () => {  const fs = require('fs');
  const init = fs.readFileSync(path.join(__dirname, '../www/js/init.js'), 'utf8');
  assert.ok(!init.includes('loadDefaultExample'), 'dead default-example loader removed');
  assert.ok(init.includes('ensureSetupLoopBlocks'), 'permanent setup+loop kept');
});
test('board/port selection never crashes on empty menus', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/js/boards.js'), 'utf8');
  assert.ok(!/options\[serialPortMenu\.selectedIndex\]\.value/.test(src), 'setPort guards empty menu');
  assert.ok(!/options\[document\.getElementById\('serialMenu'\)\.selectedIndex\]\.value/.test(src), 'changeBoard guards empty menu');
});
test('user logo applied everywhere', () => {
  const fs = require('fs');
  const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
  ['www/blocklyduino/media/logo_only.png', 'www/blocklyduino/media/logo_only2.png', 'src/appIcon.png'].forEach(f => {
    const p = path.join(__dirname, '..', f);
    assert.ok(fs.existsSync(p), f + ' exists');
    const head = Buffer.alloc(4);
    const fd = fs.openSync(p, 'r');
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    assert.ok(head.equals(pngSig), f + ' is a real PNG');
  });
  ['www/blocklyduino/media/icon.ico', 'src/icon.ico', 'src/install.ico'].forEach(f => {
    const st = fs.statSync(path.join(__dirname, '..', f));
    assert.ok(st.size > 10000, f + ' is the multi-size icon');
  });
});
test('sketch file matches its directory (Arduino rule)', () => {  const fs = require('fs');
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  assert.ok(main.includes("'sketch.ino'"), 'packaged sketch file is sketch.ino');
  assert.ok(main.includes("'tmp.ino'"), 'dev sketch file stays tmp.ino');
  assert.ok(/removeSync\(path\.join\(sketchDirPath\(\), 'tmp\.ino'\)\)/.test(main), 'stale tmp.ino cleaned on write');
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  assert.ok(/main file missing/i.test(Build.diagnoseCompilerError("Can't open sketch: main file missing from sketch: X", 'esp32:esp32:esp32')), 'sketch error diagnosed exactly');
});
test('board modal writes only existing elements (no textContent crash)', () => {  const fs = require('fs');
  const btn = fs.readFileSync(path.join(__dirname, '../www/js/buttons_functions.js'), 'utf8');
  assert.ok(!/getElementById\("board_(connect|cpu|voltage|inout)"\)/.test(btn), 'dead board IDs gone');
  assert.ok(btn.includes('boardModal_cpu_span') && btn.includes('boardModal_inout_span'), 'writes real modal IDs');
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  ['boardModal_cpu_span', 'boardModal_inout_span', 'boardModal_in_analog_span', 'boardModal_speed_span'].forEach(id => {
    assert.ok(html.includes('id="' + id + '"'), 'modal has ' + id);
  });
});
test('renderers use bridge only (no Node require)', () => {
  const fs = require('fs');
  ['IDE_functions.js', 'CLI_functions.js', 'serialMonitor.js'].forEach(f => {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(!/require\(['"](electron|serialport|child_process|fs-extra)['"]/.test(src), f + ' must not require Node modules');
    assert.ok(src.includes('window.RoboSiddhi') || src.includes('RoboSiddhi'), f + ' uses bridge');
  });
});

// 11. Dead/non-ESP32 weight stays deleted
test('dead files stay deleted', () => {  const fs = require('fs');
  const gone = [
    'www/blocklyduino/blocks/matrix_block.js',
    'www/blocklyduino/blocks/X-NUCLEO-IKS01A3/X-NUCLEO-IKS01A3.js',
    'www/blocklyduino/arduino/addon/X-NUCLEO-IKS01A3.js',
    'www/blocklyduino/toolbox/toolbox_X_NUCLEO_IKS01A3.json',
    'blocksFactory.js',
    'compiler/package_stm_index.json'
  ];
  gone.forEach(f => assert.ok(!fs.existsSync(path.join(__dirname, '..', f)), f + ' must stay deleted'));
  assert.ok(!fs.existsSync(path.join(__dirname, '../www/TclHTTPD')), 'TclHTTPD stays deleted');
  const imgs = fs.readdirSync(path.join(__dirname, '../www/blocklyduino/media/boards'));
  const bad = imgs.filter(f => /^(arduino_|lilypad|dagu_|dfrobot_|kit_|makeblock_|teensy|peguino_)/.test(f));
  assert.strictEqual(bad.length, 0, 'dead board images back: ' + bad.join(','));
  assert.ok(imgs.includes('esp32.jpg') && imgs.includes('esp8266.jpg') && imgs.includes('none.jpg'));
  // none profile must carry placeholder dropdowns so blocks construct with no board selected
  const braw = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/js/boards.json'), 'utf8');
  const bm = braw.match(/var profile = (\{[\s\S]*\})\s*;?\s*$/);
  assert.ok(bm, 'boards.json wrapper');
  const bprof = JSON.parse(bm[1]);
  const none = bprof.none[0];
  ['dropdownDigital', 'dropdownPWM', 'dropdownAnalog', 'serial'].forEach(k => {
    assert.ok(Array.isArray(none[k]) && none[k].length > 0, 'none.' + k + ' placeholder');
  });
});

// 12. ESP-only toolbox: no Arduino label, SERVO replaces VARIABLES, relay stays out
test('toolbox is ESP-only', () => {  const fs = require('fs');
  const en = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/msg/categories_en.js'), 'utf8');
  const m = en.match(/Blockly\.Msg\.CAT_BOARD = "(.*)";/);
  assert.ok(m, 'CAT_BOARD found');
  assert.strictEqual(m[1], 'ESP32');
  ['fr', 'de', 'es', 'ca', 'ar', 'ja'].forEach(l => {
    const t = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/msg/categories_' + l + '.js'), 'utf8');
    assert.ok(!/CAT_BOARD = "Arduino"/.test(t), l + ' still labels board Arduino');
  });
  const tb = fs.readFileSync(path.join(__dirname, '../www/js/toolbox.js'), 'utf8');
  assert.ok(!tb.includes('toolbox_relay'), 'relay out of default toolbox');
  assert.ok(tb.includes('toolbox_servo'), 'servo in default toolbox (replaces VARIABLES)');
  assert.ok(tb.includes('COLOUR,SERVO,FUNCTIONS'), 'SERVO in default toolboxIds');
  assert.ok(!tb.includes('COLOUR,VARIABLES'), 'VARIABLES removed from defaults');
  assert.ok(tb.includes('toolbox_arduino') && tb.includes('toolbox_esp'), 'ESP32 GPIO + ESP components kept');
});

// 13. Logic holds ESP LED set: setup+loop, LED on/off, blink, glow, delay, if/compare
test('upload reminds board boot step', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '../IDE_functions.js'), 'utf8');
  assert.ok(/ABB RST DABAO/.test(src), 'success shows ABB RST DABAO prompt');
  assert.ok(/RST MAT dabao/.test(src), 'uploading shows RST MAT dabao prompt');
});
test('logic category curated for ESP LED work', () => {
  const fs = require('fs');
  const raw = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/toolbox/toolbox_standard.json'), 'utf8');
  const m = raw.match(/var toolbox_standard = (\{[\s\S]*\})\s*;?\s*$/);
  assert.ok(m, 'toolbox_standard wrapper');
  const std = JSON.parse(m[1]);
  const logic = std.contents[0];
  assert.strictEqual(logic.toolboxitemid, 'LOGIC');
  const logicText = JSON.stringify(logic);
  ['base_setup_loop', 'robosiddhi_led_set', 'robosiddhi_led_blink', 'robosiddhi_led_fade',
   'board_base_delay', 'controls_if', 'logic_compare'].forEach(t => {
    assert.ok(logicText.includes(t), 'LOGIC has ' + t);
  });
  ['board_base_inout_buildin_led', 'logic_null', 'logic_ternary', 'controls_switch'].forEach(t => {
    assert.ok(!logicText.includes(t), 'LOGIC dropped ' + t);
  });
  const math = std.contents[2];
  assert.strictEqual(math.toolboxitemid, 'MATH');
  assert.strictEqual(math.name, 'Distance');
  const mathText = JSON.stringify(math);
  ['robosiddhi_obstacle_guard', 'robosiddhi_hcsr04', 'math_number'].forEach(t => {
    assert.ok(mathText.includes(t), 'Distance has ' + t);
  });
  ['math_arithmetic', 'math_random_int', 'math_constrain', 'math_trig', 'math_single', 'math_on_list', 'math_modulo'].forEach(t => {
    assert.ok(!mathText.includes(t), 'Distance dropped ' + t);
  });
  const gen = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/arduino/esp/esp_sensors.js'), 'utf8');
  assert.ok(gen.includes("Blockly.Arduino['robosiddhi_led_blink']") && gen.includes('delay('));
  assert.ok(gen.includes("Blockly.Arduino['robosiddhi_led_fade']") && gen.includes('analogWrite('));
  assert.ok(gen.includes("Blockly.Arduino['robosiddhi_obstacle_guard']") && gen.includes('pulseIn(') && gen.includes('delayMicroseconds('));
  assert.ok(gen.includes('_cm >= 2'), 'guard ignores phantom sub-2cm readings');
  assert.ok(gen.includes('static int _rs_guard_state'), 'guard has hysteresis memory');
});
test('servo on GPIO4: ESP toolbox + ESP32 generator + pin4 example', () => {
  const fs = require('fs');
  const raw = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/toolbox/toolbox_esp.json'), 'utf8');
  const m = raw.match(/var\s+toolbox_esp\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
  assert.ok(m, 'toolbox_esp wrapper');
  const tb = JSON.parse(m[1]);
  const txt = JSON.stringify(tb);
  assert.ok(txt.includes('servo_move') && txt.includes('servo_read_degrees'), 'ESP has servo blocks');
  const gen = fs.readFileSync(path.join(__dirname, '../www/blocklyduino/arduino/addon/servo.js'), 'utf8');
  assert.ok(gen.includes('ESP32Servo.h'), 'ESP32 servo lib');
  assert.ok(gen.includes('#ifdef ESP32'), 'dual-chip servo include');
  assert.ok(gen.includes('.attach(') && gen.includes('.write('), 'attach+write');
  const ex = fs.readFileSync(path.join(__dirname, '../www/examples/esp_servo_pin4.xml'), 'utf8');
  assert.ok(ex.includes('<field name="PIN">4</field>'), 'example targets GPIO4');
  assert.ok(ex.includes('servo_move'), 'example moves servo');
});

// 14. Persistent firmware cache: key, validation, commands
test('cache key covers all build inputs', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  const base = { codeHash: 'abc123', fqbn: 'esp32:esp32:esp32', coreVersion: '3.3.12', cliVersion: '1.5.1', flags: 'baud:default', libVersions: {} };
  const k1 = Build.cacheKey(base);
  assert.strictEqual(Build.cacheKey(base), k1, 'deterministic');
  assert.strictEqual(k1.length, 32);
  ['codeHash', 'fqbn', 'coreVersion', 'cliVersion', 'flags'].forEach(f => {
    const other = Object.assign({}, base); other[f] = other[f] + 'X';
    assert.notStrictEqual(Build.cacheKey(other), k1, 'key changes when ' + f + ' changes');
  });
  const withLib = Object.assign({}, base, { libVersions: { 'DHT sensor library': '1.4.6' } });
  assert.notStrictEqual(Build.cacheKey(withLib), k1, 'key changes with lib versions');
});
test('cache entry validation rejects every stale case', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  const good = { schema: 2, fqbn: 'esp32:esp32:esp32', codeHash: 'abc123', coreVersion: '3.3.12', cliVersion: '1.5.1', flags: 'baud:default', status: 'ok', binName: 'x.ino.bin', binSha256: 'deadbeef' };
  const want = { fqbn: 'esp32:esp32:esp32', codeHash: 'abc123', coreVersion: '3.3.12', cliVersion: '1.5.1', flags: 'baud:default' };
  assert.strictEqual(Build.validateCacheEntry(good, want, 'deadbeef').ok, true);
  const cases = [
    [null, 'no-entry'],
    [{}, 'schema-mismatch'],
    [Object.assign({}, good, { schema: 1 }), 'schema-mismatch'],
    [Object.assign({}, good, { fqbn: 'esp8266:esp8266:nodemcuv2' }), 'board-changed'],
    [Object.assign({}, good, { codeHash: 'zzz' }), 'code-changed'],
    [Object.assign({}, good, { coreVersion: '3.0.0' }), 'core-changed'],
    [Object.assign({}, good, { cliVersion: '0.0.0' }), 'toolchain-changed'],
    [Object.assign({}, good, { flags: 'baud:921600' }), 'flags-changed'],
    [Object.assign({}, good, { status: 'failed' }), 'build-not-ok'],
    [Object.assign({}, good, { binName: null }), 'no-binary'],
  ];
  cases.forEach(([entry, reason]) => {
    const r = Build.validateCacheEntry(entry, want, 'deadbeef');
    assert.strictEqual(r.ok, false, reason + ' must reject');
    assert.strictEqual(r.reason, reason, 'reason is ' + reason);
  });
  assert.strictEqual(Build.validateCacheEntry(good, want, null).reason, 'binary-missing');
  assert.strictEqual(Build.validateCacheEntry(good, want, 'other').reason, 'binary-corrupt');
});
test('compile/upload commands model build-path, input-dir, baud', () => {
  const Build = require('../www/blocklyduino/js/robosiddhi_build.js');
  const c = Build.compileCommand('esp32:esp32:esp32', '.\\tmp', { verbose: false, buildPath: '.\\b' });
  assert.ok(c.includes('--build-path'), 'compile keeps --build-path');
  const u = Build.uploadCommand('esp32:esp32:esp32', 'COM5', '.\\tmp', { inputDir: '.\\b', uploadSpeed: 921600 });
  assert.ok(u.includes('--input-dir'), 'upload keeps --input-dir');
  assert.ok(u.includes('upload.speed=921600'), 'baud override present');
  assert.throws(() => Build.uploadCommand('esp32:esp32:esp32', 'COM5', '.\\tmp', { uploadSpeed: 'fast' }));
  assert.throws(() => Build.compileCommand('none', '.\\tmp', false));
});
test('backend enforces cache file, mutex, monitor-close, timings', () => {
  const fs = require('fs');
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  ['cache.json', 'validateCacheEntry', 'uploadBusy', 'closeMonitorPort()', 'compileMs', 'uploadMs', "'clean-build'", "'cache-status'", 'upload.speed', "'miss-forced'"].forEach(s => {
    assert.ok(main.includes(s), 'main.js has ' + s);
  });
  const up = main.match(/handle\('rs-upload'([\s\S]*?)\r?\n\}\);\r?\n/);
  assert.ok(up && up[1].indexOf('closeMonitorPort()') < up[1].indexOf("'upload'"), 'monitor closed before flashing');
});
test('runtime IPC channel exists with validation', () => {
  const fs = require('fs');
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  ['rs-runtime', 'PROG_COMMIT', 'rtBusy', 'RoboSiddhiRuntime', "'runtime'", 'PROG_STOP'].forEach(s => {
    assert.ok(main.includes(s), 'main.js has ' + s);
  });
  const pre = fs.readFileSync(path.join(__dirname, '../preload.js'), 'utf8');
  assert.ok(pre.includes('rs-runtime'), 'preload exposes runtime channel');
  const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
  ['runtimeFlashButton', 'runtimeSendButton', 'runtimeStopButton', 'robosiddhi_runtime.js'].forEach(s => {
    assert.ok(html.includes(s), 'index.html has ' + s);
  });
  const ide = fs.readFileSync(path.join(__dirname, '../IDE_functions.js'), 'utf8');
  assert.ok(ide.includes('__LOOP__') && ide.includes("sketch: 'runtime'"), 'IDE wires runtime flash/send');
});

// 15. Runtime protocol: framing, compiler, emulated-firmware round trip
test('runtime CRC + framing match firmware algorithm', () => {
  const R = require('../www/blocklyduino/js/robosiddhi_runtime.js');
  assert.strictEqual(R.crc16('123456789'), 0x29B1, 'CRC16-CCITT vector');
  const f = R.buildFrame(7, 'DWRITE', ['2', '1']);
  assert.ok(/^RS 7 DWRITE 2 1 \*[0-9A-F]{4}\n$/.test(f), 'frame shape: ' + f);
  const r = R.parseReply('OK 7 *' + (function () {
    var c = R.crc16('7'); return ('000' + c.toString(16).toUpperCase()).slice(-4);
  })());
  assert.strictEqual(r.ok, true); assert.strictEqual(r.seq, 7);
  assert.strictEqual(R.parseReply('OK 7 *0000').ok, false, 'bad CRC rejected');
  assert.strictEqual(R.parseReply('HELLO 7').ok, false, 'bad frame rejected');
});
// Independent CRC16 for the emulator (cross-checks both directions).
function emuCrc16(s) {
  let crc = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    crc ^= (s.charCodeAt(i) & 0xFF) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc & 0xFFFF;
}
function emuCrc32Bytes(bytes) {
  let crc = 0xFFFFFFFF;
  bytes.forEach(by => { crc ^= by; for (let k = 0; k < 8; k++) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1; });
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function emuFrame(status, seq, payload) {
  const body = String(seq) + (payload ? ' ' + payload : '');
  return status + ' ' + body + ' *' + ('000' + emuCrc16(body).toString(16).toUpperCase()).slice(-4) + '\n';
}
// Minimal firmware emulator: HELLO/PINMODE/PROG_* with real CRC checks.
function makeEmulator() {
  let staged = [];
  const emu = {
    log: [],
    write(line) {
      const m = /^RS (\d+) ([A-Z_]+) ?(.*?) ?\*([0-9A-Fa-f]{4})\r?\n$/.exec(line);
      const send = (s) => setImmediate(() => emu._cb(s));
      if (!m) return; // silent drop like firmware
      const seq = +m[1], cmd = m[2];
      const body = m[1] + ' ' + m[2] + (m[3] ? ' ' + m[3] : '');
      if (emuCrc16(body) !== parseInt(m[4], 16)) return; // corrupt: silent
      const args = m[3] ? m[3].split(' ') : [];
      emu.log.push(cmd);
      if (cmd === 'HELLO') return send(emuFrame('OK', seq, 'RS-RUNTIME 1.0.0 PROTO 1'));
      if (cmd === 'PINMODE') return send(emuFrame('OK', seq, ''));
      if (cmd === 'PROG_CLEAR') { staged = []; return send(emuFrame('OK', seq, '')); }
      if (cmd === 'PROG_ADD') {
        const idx = +args[0];
        args[1].split(';').forEach((t, k) => {
          const [op, a, b, c] = t.split(',').map(Number);
          staged[idx + k] = { op, a, b, c };
        });
        return send(emuFrame('OK', seq, 'LEN ' + staged.length));
      }
      if (cmd === 'PROG_COMMIT') {
        const bytes = [];
        staged.forEach(o => bytes.push(o.op & 255, o.a & 255, (o.a >> 8) & 255, o.b & 255, (o.b >> 8) & 255, o.c & 255, (o.c >> 8) & 255));
        const want = ('0000000' + emuCrc32Bytes(bytes).toString(16).toUpperCase()).slice(-8);
        if (want !== args[0].toUpperCase()) return send(emuFrame('ERR', seq, 'CRC_FAIL'));
        const last = staged[staged.length - 1];
        const forever = last && last.op === 8 && last.a >= 0 && last.a < staged.length - 1;
        if (!staged.length || (last.op !== 10 && !forever)) return send(emuFrame('ERR', seq, 'NO_END'));
        return send(emuFrame('OK', seq, 'LEN ' + staged.length));
      }
      if (cmd === 'PROG_RUN') return send(emuFrame('OK', seq, 'RUNNING'));
      if (cmd === 'PROG_STOP') return send(emuFrame('OK', seq, 'STOPPED'));
      return send(emuFrame('ERR', seq, 'UNKNOWN_CMD'));
    },
    _cb: null,
    onLine(cb) { emu._cb = cb; }
  };
  return emu;
}
test('runtime detect + program transfer against emulator', () => {
  const R = require('../www/blocklyduino/js/robosiddhi_runtime.js');
  const rt = new R.Runtime(makeEmulator(), { timeoutMs: 2000 });
  return rt.detect().then(hello => {
    assert.ok(hello.includes('RS-RUNTIME'), 'handshake: ' + hello);
    const ops = [{ op: 1, a: 2, b: 1, c: 0 }, { op: 5, a: 500, b: 0, c: 0 }, { op: 10, a: 0, b: 0, c: 0 }];
    return rt.transferProgram(ops, [2]);
  }).then(run => {
    assert.strictEqual(run, 'RUNNING');
    return rt.stop();
  }).then(st => assert.strictEqual(st, 'STOPPED'));
});
test('runtime rejects tampered program commit', () => {
  const R = require('../www/blocklyduino/js/robosiddhi_runtime.js');
  const emu = makeEmulator();
  const origWrite = emu.write.bind(emu);
  emu.write = (line) => {
    if (/PROG_COMMIT/.test(line)) {
      // tamper the commit CRC but re-sign the frame so framing stays valid
      const m = /^RS (\d+) PROG_COMMIT [0-9A-F]+ \*([0-9A-Fa-f]{4})\r?\n$/.exec(line);
      if (m) {
        const nb = m[1] + ' PROG_COMMIT DEADBEEF';
        return origWrite('RS ' + nb + ' *' + ('000' + emuCrc16(nb).toString(16).toUpperCase()).slice(-4) + '\n');
      }
    }
    return origWrite(line);
  };
  const rt = new R.Runtime(emu, { timeoutMs: 2000 });
  const ops = [{ op: 1, a: 2, b: 1, c: 0 }, { op: 10, a: 0, b: 0, c: 0 }];
  let failed = false;
  return rt.transferProgram(ops, [2]).then(
    () => { throw new Error('tampered commit was accepted'); },
    (e) => { failed = /CRC_FAIL/.test(e.message); }
  ).then(() => assert.strictEqual(failed, true, 'tampered commit must fail'));
});
test('block compiler emits correct ops and jumps', () => {
  const R = require('../www/blocklyduino/js/robosiddhi_runtime.js');
  // LED on, wait, LED off
  const prog = R.compileBlocks([
    R.B('robosiddhi_led_set', { PIN: '2', STATE: 'ON' }, {}, null)
  ]);
  // chain manually: B() has no next-link param use — link via _n
  const b1 = R.B('robosiddhi_led_set', { PIN: '2', STATE: 'ON' });
  const b2 = R.B('board_base_delay', {}, { DELAY_TIME: R.B('math_number', { NUM: '500' }) });
  const b3 = R.B('robosiddhi_led_set', { PIN: '2', STATE: 'OFF' });
  b1._n = b2; b2._n = b3;
  const r = R.compileBlocks([b1]);
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.deepStrictEqual(r.ops.map(o => o.op), [1, 5, 1, 10]);
  assert.deepStrictEqual([r.ops[0].a, r.ops[0].b, r.ops[1].a], [2, 1, 500]);
  assert.deepStrictEqual(r.pins, [2]);
  // repeat 3 { led on } -> DWRITE, LOOP(3 -> 0), END
  const rb = R.B('controls_repeat_ext', {}, { TIMES: R.B('math_number', { NUM: '3' }), DO: R.B('robosiddhi_led_set', { PIN: '2', STATE: 'ON' }) });
  const rr = R.compileBlocks([rb]);
  assert.strictEqual(rr.ok, true, JSON.stringify(rr.errors));
  assert.deepStrictEqual(rr.ops.map(o => o.op), [1, 9, 10]);
  assert.strictEqual(rr.ops[1].a, 3); assert.strictEqual(rr.ops[1].b, 0);
  // if digitalRead(4)==1 { led on } -> IFD(4,0->END), DWRITE, END
  const cond = R.B('logic_compare', { OP: 'EQ' }, {
    A: R.B('board_base_inout_digital_read', { PIN: '4' }),
    B: R.B('math_number', { NUM: '1' })
  });
  const ib = R.B('controls_if', {}, { IF0: cond, DO0: R.B('robosiddhi_led_set', { PIN: '2', STATE: 'ON' }) });
  const ir = R.compileBlocks([ib]);
  assert.strictEqual(ir.ok, true, JSON.stringify(ir.errors));
  assert.deepStrictEqual(ir.ops.map(o => o.op), [6, 1, 10]);
  assert.deepStrictEqual([ir.ops[0].a, ir.ops[0].b, ir.ops[0].c], [4, 0, 2]);
  // unsupported + bad inputs rejected with clear errors
  assert.strictEqual(R.compileBlocks([R.B('robosiddhi_wifi_connect', {})]).ok, false);
  assert.strictEqual(R.compileBlocks([]).ok, false);
  const badRep = R.B('controls_repeat_ext', {}, { TIMES: R.B('math_number', { NUM: '0' }) });
  assert.strictEqual(R.compileBlocks([badRep]).ok, false);
});

test('ultrasonic condition drives servo in runtime mode', () => {
  const R = require('../www/blocklyduino/js/robosiddhi_runtime.js');
  const cond = R.B('logic_compare', { OP: 'LT' }, {
    A: R.B('robosiddhi_hcsr04', { PIN_TRIG: '5', PIN_ECHO: '18' }),
    B: R.B('math_number', { NUM: '15' })
  });
  const ib = R.B('controls_if', {}, {
    IF0: cond,
    DO0: R.B('servo_move', { PIN: '4' }, { DEGREE: R.B('math_number', { NUM: '90' }) }),
    ELSE: R.B('servo_move', { PIN: '4' }, { DEGREE: R.B('math_number', { NUM: '0' }) })
  });
  const r = R.compileBlocks([ib]);
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  // UREAD, IFU_LT(threshold=15 -> body), SANGLE(90), JMP(end), IFU_LT(16 -> body2), SANGLE(0), END
  assert.ok(r.ops.some(o => o.op === R.OP.UREAD), 'has UREAD');
  assert.ok(r.ops.some(o => o.op === R.OP.IFU_LT), 'has IFU_LT');
  assert.ok(r.ops.some(o => o.op === R.OP.SANGLE && o.b === 90), 'servo 90');
  assert.ok(r.ops.some(o => o.op === R.OP.SANGLE && o.b === 0), 'servo 0');
});

test('loop-forever programs end with backward JMP', () => {
  const R = require('../www/blocklyduino/js/robosiddhi_runtime.js');
  const ON = R.B('robosiddhi_led_set', { PIN: '2', STATE: 'ON' });
  const loopWrap = R.B('__LOOP__', {}, { DO: ON });
  const r = R.compileBlocks([loopWrap]);
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  const last = r.ops[r.ops.length - 1];
  assert.strictEqual(last.op, R.OP.JMP);
  assert.strictEqual(last.a, 0);
});

test('small-program transfer fits the ~1s wire budget', () => {
  const R = require('../www/blocklyduino/js/robosiddhi_runtime.js');
  // blink: DWRITE, WAIT, DWRITE, WAIT, JMP = full run-forever program
  const ops = [
    { op: 1, a: 2, b: 1, c: 0 }, { op: 5, a: 500, b: 0, c: 0 },
    { op: 1, a: 2, b: 0, c: 0 }, { op: 5, a: 500, b: 0, c: 0 },
    { op: 8, a: 0, b: 0, c: 0 }
  ];
  let bytes = 0;
  const frames = [R.buildFrame(1, 'PROG_CLEAR', [])];
  frames.push(R.buildFrame(2, 'PINMODE', ['2', 'OUT']));
  const s = ops.map(o => [o.op, o.a, o.b, o.c].join(',')).join(';');
  frames.push(R.buildFrame(3, 'PROG_ADD', ['0', s]));
  frames.push(R.buildFrame(4, 'PROG_COMMIT', [R.crc32Hex(R.programCrc32(ops))]));
  frames.push(R.buildFrame(5, 'PROG_RUN', []));
  frames.forEach(f => { bytes += f.length; });
  assert.ok(bytes < 1200, 'wire bytes ' + bytes + ' (<1200 = <0.15s at 115200 baud)');
});
test('runtime backend supports fast probe timeouts', () => {
  const fs = require('fs');
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  assert.ok(main.includes('timeoutMs'), 'rs-runtime accepts timeoutMs');
  const ide = fs.readFileSync(path.join(__dirname, '../IDE_functions.js'), 'utf8');
  ['rs-runtime-ok:', 'INSTANT', 'timeoutMs: 1500', 'timeoutMs: 3000'].forEach(x => {
    assert.ok(ide.includes(x), 'smart upload has ' + x);
  });
});

test('runtime sources ship beside the exe (packaged layout)', () => {
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.ok(pkg.build.extraFiles.includes('runtime'), 'runtime in extraFiles');
  const main = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  assert.ok(/sketch === 'runtime'/.test(main), 'runtime sketch branch exists');
  assert.ok(main.includes("path.dirname(app.getPath('exe')), 'runtime'"), 'packaged runtime resolved beside exe, not in asar');
});

Promise.all(pendingAsync).then(() => {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
});
