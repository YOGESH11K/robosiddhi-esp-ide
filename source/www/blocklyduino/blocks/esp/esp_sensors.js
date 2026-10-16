/**
 * RoboSiddhi ESP blocks — sensors/actuators with pin validation.
 * Requires: profile (boards.json) + RoboSiddhiBoardManager (optional, warns if absent).
 */
'use strict';
goog.provide('Blockly.Constants.robosiddhi_esp');
goog.require('Blockly.Blocks');

function RoboSiddhiPinOptions(mode) {
  try {
    if (typeof profile !== 'undefined' && profile.default) {
      if (mode === 'analog_in') return profile.default.dropdownAnalog || [['A0', 'A0']];
      if (mode === 'pwm') return profile.default.dropdownPWM || profile.default.dropdownDigital;
      return profile.default.dropdownDigital || [['2', '2']];
    }
  } catch (e) {}
  return [['2', '2'], ['4', '4'], ['5', '5'], ['13', '13']];
}

function RoboSiddhiValidate(pin, mode, blockType) {
  try {
    if (typeof RoboSiddhiBoardManager !== 'undefined' && typeof profile !== 'undefined' && profile.default && profile.default._id) {
      var r = RoboSiddhiBoardManager.validatePin(profile.default._id, pin, mode);
      return r;
    }
  } catch (e) {}
  return { ok: true, level: 'ok', messages: [] };
}

Blockly.Blocks['robosiddhi_led_set'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('LED pin')
      .appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('digital_out'); }), 'PIN')
      .appendField(new Blockly.FieldDropdown([['ON', 'HIGH'], ['OFF', 'LOW']]), 'STAT');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Set external LED on/off. Validates pin for current ESP board. Use 220Ω resistor.');
    this.setOnChange(function () {
      if (!this.workspace || this.workspace.isDragging || this.isInFlyout) return;
      var r = RoboSiddhiValidate(this.getFieldValue('PIN'), 'digital_out', 'robosiddhi_led_set');
      this.setWarningText(r.level === 'ok' ? null : r.messages.join('\n'));
    });
  }
};

Blockly.Blocks['robosiddhi_rgb_set'] = {
  init: function () {
    this.appendDummyInput().appendField('RGB LED');
    this.appendDummyInput()
      .appendField('R').appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('pwm'); }), 'PIN_R')
      .appendField('G').appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('pwm'); }), 'PIN_G')
      .appendField('B').appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('pwm'); }), 'PIN_B');
    this.appendValueInput('R_VAL').setCheck('Number').appendField('R value 0-255');
    this.appendValueInput('G_VAL').setCheck('Number').appendField('G value 0-255');
    this.appendValueInput('B_VAL').setCheck('Number').appendField('B value 0-255');
    this.setInputsInline(false);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Common-cathode RGB LED. Each channel needs 220Ω + PWM-capable pin.');
  }
};

Blockly.Blocks['robosiddhi_buzzer'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Buzzer pin')
      .appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('digital_out'); }), 'PIN')
      .appendField(new Blockly.FieldDropdown([['ON', 'HIGH'], ['OFF', 'LOW']]), 'STAT');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Active buzzer: HIGH sounds. Passive buzzer: use tone block for frequency.');
  }
};

Blockly.Blocks['robosiddhi_dht_read'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('DHT')
      .appendField(new Blockly.FieldDropdown([['DHT11', 'DHT11'], ['DHT22', 'DHT22']]), 'MODEL')
      .appendField('pin')
      .appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('digital_out'); }), 'PIN')
      .appendField(new Blockly.FieldDropdown([['temperature °C', 'TEMP'], ['humidity %', 'HUM']]), 'WHAT');
    this.setOutput(true, 'Number');
    this.setStyle('arduino_blocks');
    this.setTooltip('Read DHT11/DHT22. Requires DHT sensor library + Adafruit Unified Sensor. Sample ≥1s (DHT11) / ≥2s (DHT22). Needs 10k pull-up on DATA.');
    this.setOnChange(function () {
      if (!this.workspace || this.isInFlyout) return;
      var r = RoboSiddhiValidate(this.getFieldValue('PIN'), 'digital_out', 'robosiddhi_dht_read');
      this.setWarningText(r.level === 'ok' ? null : r.messages.join('\n'));
    });
  }
};

Blockly.Blocks['robosiddhi_hcsr04'] = {
  init: function () {
    this.appendDummyInput().appendField('Ultrasonic HC-SR04 distance cm');
    this.appendDummyInput()
      .appendField('TRIG').appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('digital_out'); }), 'PIN_TRIG')
      .appendField('ECHO').appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('digital_in'); }), 'PIN_ECHO');
    this.setOutput(true, 'Number');
    this.setStyle('arduino_blocks');
    this.setTooltip('TRIG=output, ECHO=input. Works on ESP32 + ESP8266 (TRIG 14, ECHO 13). Wiring: VCC 5V + ECHO through 1k/2k divider to 3.3V — OR simpler: VCC to 3V3 (short range <1m), ECHO direct (3.3V-safe). Range 2-400cm.');
  }
};

Blockly.Blocks['robosiddhi_pir_read'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('PIR motion pin')
      .appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('digital_in'); }), 'PIN');
    this.setOutput(true, 'Boolean');
    this.setStyle('arduino_blocks');
    this.setTooltip('HC-SR501 OUT -> GPIO. Warm-up ~60s after power-on.');
  }
};

Blockly.Blocks['robosiddhi_ldr_read'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Light (LDR) analog pin')
      .appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('analog_in'); }), 'PIN');
    this.setOutput(true, 'Number');
    this.setStyle('arduino_blocks');
    this.setTooltip('LDR divider to ADC pin. ESP8266: A0. ESP32: ADC-capable GPIO (prefer ADC1 with Wi-Fi).');
  }
};

Blockly.Blocks['robosiddhi_soil_read'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('Soil moisture analog pin')
      .appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('analog_in'); }), 'PIN');
    this.setOutput(true, 'Number');
    this.setStyle('arduino_blocks');
    this.setTooltip('Analog soil sensor AO -> ADC. Prefer capacitive v1.2+. Calibrate wet/dry values in code.');
  }
};

Blockly.Blocks['robosiddhi_esp_serial_print'] = {
  init: function () {
    this.appendValueInput('TEXT').appendField('Serial print');
    this.appendDummyInput().appendField(new Blockly.FieldDropdown([['new line', 'LN'], ['no new line', 'NO_LN']]), 'MODE');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Serial.println/print. Call Serial.begin in setup (use Serial blocks). Baud must match monitor.');
  }
};

Blockly.Blocks['robosiddhi_led_blink'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('LED blink pin')
      .appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('digital_out'); }), 'PIN');
    this.appendValueInput('ON_MS').setCheck('Number').appendField('ON ms');
    this.appendValueInput('OFF_MS').setCheck('Number').appendField('OFF ms');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Blink LED once: ON, wait, OFF, wait. Put in loop to keep blinking. Use 220Ω resistor.');
    this.setOnChange(function () {
      if (!this.workspace || this.isInFlyout) return;
      var r = RoboSiddhiValidate(this.getFieldValue('PIN'), 'digital_out', 'robosiddhi_led_blink');
      this.setWarningText(r.level === 'ok' ? null : r.messages.join('\n'));
    });
  }
};

Blockly.Blocks['robosiddhi_led_fade'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('LED glow (fade) pin')
      .appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('pwm'); }), 'PIN');
    this.appendValueInput('DURATION').setCheck('Number').appendField('full glow time ms');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Smooth glow up and down on a PWM pin (e.g. GPIO 2, 13, 25). Needs PWM-capable GPIO.');
    this.setOnChange(function () {
      if (!this.workspace || this.isInFlyout) return;
      var r = RoboSiddhiValidate(this.getFieldValue('PIN'), 'pwm', 'robosiddhi_led_fade');
      this.setWarningText(r.level === 'ok' ? null : r.messages.join('\n'));
    });
  }
};

Blockly.Blocks['robosiddhi_obstacle_guard'] = {
  init: function () {
    this.appendDummyInput().appendField('Obstacle guard (HC-SR04 + LED)');
    this.appendDummyInput()
      .appendField('TRIG').appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('digital_out'); }), 'PIN_TRIG')
      .appendField('ECHO').appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('digital_in'); }), 'PIN_ECHO')
      .appendField('LED').appendField(new Blockly.FieldDropdown(function () { return RoboSiddhiPinOptions('digital_out'); }), 'PIN_LED');
    this.appendDummyInput()
      .appendField('if closer than').appendField(new Blockly.FieldNumber(10, 2, 400, 1), 'DIST_CM').appendField('cm, LED')
      .appendField(new Blockly.FieldDropdown([['OFF', 'LOW'], ['ON', 'HIGH']]), 'CLOSE_STAT')
      .appendField('(else opposite)');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('One block does it all: measures distance, LED OFF/ON below threshold, opposite above. ECHO is 5V — wire through 1k/2k divider to GPIO!');
  }
};
