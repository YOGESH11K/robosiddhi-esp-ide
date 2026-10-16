/**
 * RoboSiddhi ESP Arduino C++ generators.
 * Each block declares includes/setups/definitions so finish() emits complete firmware.
 */
'use strict';
goog.provide('Blockly.Arduino.robosiddhi_esp');
goog.require('Blockly.Arduino');

Blockly.Arduino['robosiddhi_led_set'] = function (block) {
  var pin = block.getFieldValue('PIN') || '2';
  var stat = block.getFieldValue('STAT') || 'HIGH';
  Blockly.Arduino.setups_['setup_output_' + pin] = 'pinMode(' + pin + ', OUTPUT);';
  return 'digitalWrite(' + pin + ', ' + stat + ');\n';
};

Blockly.Arduino['robosiddhi_rgb_set'] = function (block) {
  var pr = block.getFieldValue('PIN_R') || '25';
  var pg = block.getFieldValue('PIN_G') || '26';
  var pb = block.getFieldValue('PIN_B') || '27';
  var rv = Blockly.Arduino.valueToCode(block, 'R_VAL', Blockly.Arduino.ORDER_ATOMIC) || '0';
  var gv = Blockly.Arduino.valueToCode(block, 'G_VAL', Blockly.Arduino.ORDER_ATOMIC) || '0';
  var bv = Blockly.Arduino.valueToCode(block, 'B_VAL', Blockly.Arduino.ORDER_ATOMIC) || '0';
  return 'analogWrite(' + pr + ', constrain(' + rv + ',0,255));\n' +
         'analogWrite(' + pg + ', constrain(' + gv + ',0,255));\n' +
         'analogWrite(' + pb + ', constrain(' + bv + ',0,255));\n';
};

Blockly.Arduino['robosiddhi_buzzer'] = function (block) {
  var pin = block.getFieldValue('PIN') || '13';
  var stat = block.getFieldValue('STAT') || 'HIGH';
  Blockly.Arduino.setups_['setup_output_' + pin] = 'pinMode(' + pin + ', OUTPUT);';
  return 'digitalWrite(' + pin + ', ' + stat + ');\n';
};

Blockly.Arduino['robosiddhi_dht_read'] = function (block) {
  var pin = block.getFieldValue('PIN') || '4';
  var model = block.getFieldValue('MODEL') || 'DHT11';
  var what = block.getFieldValue('WHAT') || 'TEMP';
  Blockly.Arduino.includes_['include_dht'] = '#include <DHT.h>';
  Blockly.Arduino.includes_['include_dht_u'] = '#include <Adafruit_Sensor.h>';
  Blockly.Arduino.definitions_['define_dht_' + pin] = 'DHT robosiddhi_dht_' + pin + '(' + pin + ', ' + model + ');';
  Blockly.Arduino.setups_['setup_dht_' + pin] = 'robosiddhi_dht_' + pin + '.begin();';
  var fn = (what === 'HUM') ? 'readHumidity()' : 'readTemperature()';
  var code = 'robosiddhi_dht_' + pin + '.' + fn;
  return [code, Blockly.Arduino.ORDER_ATOMIC];
};

Blockly.Arduino['robosiddhi_hcsr04'] = function (block) {
  // Universal safe default: TRIG 14 + ECHO 13 exist on ESP32 AND ESP8266,
  // non-strapping, non-UART, I2C left free. (GPIO18 does NOT exist on ESP8266.)
  var trig = block.getFieldValue('PIN_TRIG') || '14';
  var echo = block.getFieldValue('PIN_ECHO') || '13';
  var key = trig + '_' + echo;
  Blockly.Arduino.setups_['setup_hcsr04_' + key + '_trig'] = 'pinMode(' + trig + ', OUTPUT);';
  Blockly.Arduino.setups_['setup_hcsr04_' + key + '_echo'] = 'pinMode(' + echo + ', INPUT);';
  Blockly.Arduino.codeFunctions_['func_hcsr04_' + key] =
    'long robosiddhi_hcsr04_' + key + '() {\n' +
    '  digitalWrite(' + trig + ', LOW); delayMicroseconds(2);\n' +
    '  digitalWrite(' + trig + ', HIGH); delayMicroseconds(10);\n' +
    '  digitalWrite(' + trig + ', LOW);\n' +
    '  long dur = pulseIn(' + echo + ', HIGH, 30000);\n' +
    '  if (dur == 0) return -1;\n' +
    '  return (long)(dur * 0.034 / 2);\n' +
    '}';
  return ['robosiddhi_hcsr04_' + key + '()', Blockly.Arduino.ORDER_ATOMIC];
};

Blockly.Arduino['robosiddhi_pir_read'] = function (block) {
  var pin = block.getFieldValue('PIN') || '13';
  Blockly.Arduino.setups_['setup_input_' + pin] = 'pinMode(' + pin + ', INPUT);';
  return ['digitalRead(' + pin + ')', Blockly.Arduino.ORDER_ATOMIC];
};

Blockly.Arduino['robosiddhi_ldr_read'] = function (block) {
  var pin = block.getFieldValue('PIN');
  if (pin === undefined || pin === null) pin = '34';
  return ['analogRead(' + pin + ')', Blockly.Arduino.ORDER_ATOMIC];
};

Blockly.Arduino['robosiddhi_soil_read'] = function (block) {
  var pin = block.getFieldValue('PIN');
  if (pin === undefined || pin === null) pin = '32';
  return ['analogRead(' + pin + ')', Blockly.Arduino.ORDER_ATOMIC];
};

Blockly.Arduino['robosiddhi_esp_serial_print'] = function (block) {
  var txt = Blockly.Arduino.valueToCode(block, 'TEXT', Blockly.Arduino.ORDER_NONE) || '""';
  var mode = block.getFieldValue('MODE') || 'LN';
  if (mode === 'LN') return 'Serial.println(' + txt + ');\n';
  return 'Serial.print(' + txt + ');\n';
};

Blockly.Arduino['robosiddhi_led_blink'] = function (block) {
  var pin = block.getFieldValue('PIN') || '2';
  var onms = Blockly.Arduino.valueToCode(block, 'ON_MS', Blockly.Arduino.ORDER_ATOMIC) || '500';
  var offms = Blockly.Arduino.valueToCode(block, 'OFF_MS', Blockly.Arduino.ORDER_ATOMIC) || '500';
  Blockly.Arduino.setups_['setup_output_' + pin] = 'pinMode(' + pin + ', OUTPUT);';
  return 'digitalWrite(' + pin + ', HIGH);\n' +
    'delay(' + onms + ');\n' +
    'digitalWrite(' + pin + ', LOW);\n' +
    'delay(' + offms + ');\n';
};

Blockly.Arduino['robosiddhi_led_fade'] = function (block) {
  var pin = block.getFieldValue('PIN') || '2';
  var dur = Blockly.Arduino.valueToCode(block, 'DURATION', Blockly.Arduino.ORDER_ATOMIC) || '2000';
  return '{\n' +
    '  int _rs_step = max(1, (' + dur + ') / 510);\n' +
    '  for (int _rs_b = 0; _rs_b <= 255; _rs_b++) { analogWrite(' + pin + ', _rs_b); delay(_rs_step); }\n' +
    '  for (int _rs_b = 255; _rs_b >= 0; _rs_b--) { analogWrite(' + pin + ', _rs_b); delay(_rs_step); }\n' +
    '}\n';
};

Blockly.Arduino['robosiddhi_obstacle_guard'] = function (block) {
  var trig = block.getFieldValue('PIN_TRIG') || '14';
  var echo = block.getFieldValue('PIN_ECHO') || '13';
  var led = block.getFieldValue('PIN_LED') || '2';
  var th = parseInt(block.getFieldValue('DIST_CM'), 10);
  if (isNaN(th)) th = 10;
  var closeStat = block.getFieldValue('CLOSE_STAT') || 'LOW';
  var farStat = (closeStat === 'LOW') ? 'HIGH' : 'LOW';
  // Hysteresis dead-band stops threshold flicker: firmly close -> CLOSE,
  // firmly far (or invalid) -> FAR, in-between keeps the previous LED state.
  var low = (th > 4) ? th - 2 : th;
  var high = th + 2;
  Blockly.Arduino.setups_['setup_output_' + trig] = 'pinMode(' + trig + ', OUTPUT);';
  Blockly.Arduino.setups_['setup_input_' + echo] = 'pinMode(' + echo + ', INPUT);';
  Blockly.Arduino.setups_['setup_output_' + led] = 'pinMode(' + led + ', OUTPUT);';
  return '{\n' +
    '  static int _rs_guard_state = ' + farStat + ';\n' +
    '  digitalWrite(' + trig + ', LOW); delayMicroseconds(2);\n' +
    '  digitalWrite(' + trig + ', HIGH); delayMicroseconds(10);\n' +
    '  digitalWrite(' + trig + ', LOW);\n' +
    '  long _rd = pulseIn(' + echo + ', HIGH, 30000);\n' +
    '  long _cm = (_rd == 0) ? -1 : (long)(_rd * 0.034 / 2);\n' +
    '  if (_cm >= 2 && _cm < ' + low + ') { _rs_guard_state = ' + closeStat + '; }\n' +
    '  else if (_cm < 2 || _cm > ' + high + ') { _rs_guard_state = ' + farStat + '; }\n' +
    '  digitalWrite(' + led + ', _rs_guard_state);\n' +
    '  delay(100);\n' +
    '}\n';
};
