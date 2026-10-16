/**
 * RoboSiddhi ESP display generators — SSD1306 OLED + LCD1602-I2C.
 */
'use strict';
goog.provide('Blockly.Arduino.robosiddhi_display');
goog.require('Blockly.Arduino');

Blockly.Arduino['robosiddhi_oled_init'] = function (block) {
  var addr = block.getFieldValue('ADDR') || '0x3C';
  Blockly.Arduino.includes_['include_wire'] = '#include <Wire.h>';
  Blockly.Arduino.includes_['include_gfx'] = '#include <Adafruit_GFX.h>';
  Blockly.Arduino.includes_['include_ssd1306'] = '#include <Adafruit_SSD1306.h>';
  Blockly.Arduino.definitions_['define_oled'] = 'Adafruit_SSD1306 robosiddhi_oled(128, 64, &Wire, -1);';
  Blockly.Arduino.setups_['setup_oled'] = 'if (!robosiddhi_oled.begin(SSD1306_SWITCHCAPVCC, ' + addr + ')) { Serial.println(F("OLED init failed")); } else { robosiddhi_oled.clearDisplay(); robosiddhi_oled.display(); }';
  return '';
};

Blockly.Arduino['robosiddhi_oled_print'] = function (block) {
  var txt = Blockly.Arduino.valueToCode(block, 'TEXT', Blockly.Arduino.ORDER_NONE) || '""';
  var size = block.getFieldValue('SIZE') || '1';
  return 'robosiddhi_oled.clearDisplay();\n' +
    'robosiddhi_oled.setTextSize(' + size + ');\n' +
    'robosiddhi_oled.setTextColor(SSD1306_WHITE);\n' +
    'robosiddhi_oled.setCursor(0, 0);\n' +
    'robosiddhi_oled.println(' + txt + ');\n' +
    'robosiddhi_oled.display();\n';
};

Blockly.Arduino['robosiddhi_oled_clear'] = function () {
  return 'robosiddhi_oled.clearDisplay();\nrobosiddhi_oled.display();\n';
};

Blockly.Arduino['robosiddhi_lcd_init'] = function (block) {
  var addr = block.getFieldValue('ADDR') || '0x27';
  Blockly.Arduino.includes_['include_wire'] = '#include <Wire.h>';
  Blockly.Arduino.includes_['include_lcd'] = '#include <LiquidCrystal_I2C.h>';
  Blockly.Arduino.definitions_['define_lcd'] = 'LiquidCrystal_I2C robosiddhi_lcd(' + addr + ', 16, 2);';
  Blockly.Arduino.setups_['setup_lcd'] = 'robosiddhi_lcd.init();\n  robosiddhi_lcd.backlight();';
  return '';
};

Blockly.Arduino['robosiddhi_lcd_print'] = function (block) {
  var txt = Blockly.Arduino.valueToCode(block, 'TEXT', Blockly.Arduino.ORDER_NONE) || '""';
  var row = block.getFieldValue('ROW') || '0';
  return 'robosiddhi_lcd.setCursor(0, ' + row + ');\n' +
    'robosiddhi_lcd.print(' + txt + ');\n';
};

Blockly.Arduino['robosiddhi_lcd_clear'] = function () {
  return 'robosiddhi_lcd.clear();\n';
};
