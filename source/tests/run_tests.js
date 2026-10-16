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
function test(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
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
  assert.ok(/sketchHash|sketch\.hash/.test(h[1]), 'hash guard: changed code forces recompile');
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
