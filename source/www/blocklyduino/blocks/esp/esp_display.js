/**
 * RoboSiddhi ESP display blocks — OLED SSD1306 (I2C) + LCD1602 with I2C backpack.
 * I2C pins come from the board profile (SDA/SCL defaults in esp_board_profiles.js).
 */
'use strict';
goog.provide('Blockly.Constants.robosiddhi_display');
goog.require('Blockly.Blocks');

Blockly.Blocks['robosiddhi_oled_init'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('OLED SSD1306 init')
      .appendField(new Blockly.FieldDropdown([['0x3C', '0x3C'], ['0x3D', '0x3D']]), 'ADDR');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Init 128x64 I2C OLED. Wiring: VCC->3V3, GND->GND, SDA->board SDA, SCL->board SCL. Needs Adafruit SSD1306 + GFX libs.');
  }
};

Blockly.Blocks['robosiddhi_oled_print'] = {
  init: function () {
    this.appendValueInput('TEXT').appendField('OLED show text');
    this.appendDummyInput()
      .appendField('size')
      .appendField(new Blockly.FieldDropdown([['1', '1'], ['2', '2'], ['3', '3']]), 'SIZE');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Clears the OLED and shows one line of text. Call OLED init in setup first.');
  }
};

Blockly.Blocks['robosiddhi_oled_clear'] = {
  init: function () {
    this.appendDummyInput().appendField('OLED clear');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Clear the OLED display.');
  }
};

Blockly.Blocks['robosiddhi_lcd_init'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('LCD1602 I2C init')
      .appendField(new Blockly.FieldDropdown([['0x27', '0x27'], ['0x3F', '0x3F']]), 'ADDR');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Init 16x2 LCD with PCF8574 backpack. Wiring: VCC->5V, GND->GND, SDA/SCL. Needs LiquidCrystal_I2C lib.');
  }
};

Blockly.Blocks['robosiddhi_lcd_print'] = {
  init: function () {
    this.appendValueInput('TEXT').appendField('LCD show text row');
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([['0', '0'], ['1', '1']]), 'ROW');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Show text on LCD row 0 or 1. Call LCD init in setup first.');
  }
};

Blockly.Blocks['robosiddhi_lcd_clear'] = {
  init: function () {
    this.appendDummyInput().appendField('LCD clear');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('arduino_blocks');
    this.setTooltip('Clear the LCD display.');
  }
};
