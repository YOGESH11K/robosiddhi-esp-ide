/**
 * RoboSiddhi ESP comm blocks — Wi-Fi connect, HTTP GET, MQTT publish.
 * Works on ESP32 + ESP8266 via conditional includes.
 */
'use strict';
goog.provide('Blockly.Constants.robosiddhi_comm');
goog.require('Blockly.Blocks');

Blockly.Blocks['robosiddhi_wifi_connect'] = {
  init: function () {
    this.appendValueInput('SSID').appendField('Wi-Fi connect SSID');
    this.appendValueInput('PASS').appendField('password');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Connect to Wi-Fi (blocks ~10s on failure). Note: on classic ESP32, ADC2 pins cannot do analogRead while Wi-Fi is on — use ADC1 pins (32,33,34,35,36,39).');
  }
};

Blockly.Blocks['robosiddhi_http_get'] = {
  init: function () {
    this.appendValueInput('URL').appendField('HTTP GET url');
    this.setOutput(true, 'String');
    this.setStyle('arduino_blocks');
    this.setTooltip('GET http:// url, returns response body as String ("" on error). Needs Wi-Fi connected. Needs no extra lib (built into cores).');
  }
};

Blockly.Blocks['robosiddhi_mqtt_publish'] = {
  init: function () {
    this.appendValueInput('SERVER').appendField('MQTT publish to server');
    this.appendDummyInput()
      .appendField('port')
      .appendField(new Blockly.FieldNumber(1883, 1, 65535, 1), 'PORT');
    this.appendValueInput('TOPIC').appendField('topic');
    this.appendValueInput('MSG').appendField('message');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Publish one MQTT message (connects anonymously if needed). Needs Wi-Fi connected + PubSubClient lib.');
  }
};

Blockly.Blocks['robosiddhi_mpu6050_read'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('MPU6050')
      .appendField(new Blockly.FieldDropdown([
        ['accel X (m/s²)', 'AX'], ['accel Y (m/s²)', 'AY'], ['accel Z (m/s²)', 'AZ'],
        ['gyro X (rad/s)', 'GX'], ['gyro Y (rad/s)', 'GY'], ['gyro Z (rad/s)', 'GZ'],
        ['temperature °C', 'TEMP']
      ]), 'WHAT');
    this.setOutput(true, 'Number');
    this.setStyle('arduino_blocks');
    this.setTooltip('Read MPU6050 accel/gyro/temp over I2C. Wiring: VCC->3V3, GND->GND, SDA/SCL. Needs Adafruit MPU6050 lib. Auto-inits in setup.');
  }
};

Blockly.Blocks['robosiddhi_motor_l298n'] = {
  init: function () {
    this.appendDummyInput().appendField('DC motor L298N');
    this.appendDummyInput()
      .appendField('ENA(PWM)')
      .appendField(new Blockly.FieldDropdown(function () {
        try { if (typeof profile !== 'undefined' && profile.default) return profile.default.dropdownPWM; } catch (e) {}
        return [['25', '25']];
      }), 'ENA')
      .appendField('IN1')
      .appendField(new Blockly.FieldDropdown(function () {
        try { if (typeof profile !== 'undefined' && profile.default) return profile.default.dropdownDigital; } catch (e) {}
        return [['26', '26']];
      }), 'IN1')
      .appendField('IN2')
      .appendField(new Blockly.FieldDropdown(function () {
        try { if (typeof profile !== 'undefined' && profile.default) return profile.default.dropdownDigital; } catch (e) {}
        return [['27', '27']];
      }), 'IN2');
    this.appendValueInput('SPEED').setCheck('Number').appendField('speed -255..255');
    this.setInputsInline(false);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Drive one DC motor via L298N: ENA=PWM speed pin, IN1/IN2=direction. Negative speed reverses. Motor supply separate with common GND.');
  }
};
