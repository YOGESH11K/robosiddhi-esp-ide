/**
 * @license
 * Copyright 2020 Sébastien CANET
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * @fileoverview Generating Arduino code for basics board command blocks.
 * @author scanet@libreduc.cc (Sébastien CANET)
 */

'use strict';

goog.provide('Blockly.Arduino.board_serial');

goog.require('Blockly.Arduino');

Blockly.Arduino['board_serial_init'] = function (block) {
    var dropdown_speed = block.getFieldValue('SPEED');
    Blockly.Arduino.setups_['serial_begin'] = 'Serial.begin(' + dropdown_speed + ');';
    return "";
};

Blockly.Arduino['board_serial_printfor'] = function (block) {
    var content = Blockly.Arduino.valueToCode(block, 'CONTENT', Blockly.Arduino.ORDER_NONE) || '0';
    var type = block.getFieldValue('TYPE') || 'DEC';
    var code = 'Serial.println(' + content + ', ' + type + ');\n';
    return code;
};

Blockly.Arduino['board_serial_print'] = function (block) {
    var content = Blockly.Arduino.valueToCode(block, 'CONTENT', Blockly.Arduino.ORDER_ATOMIC) || '0';
    var code = 'Serial.println(' + content + ');\n';
    return code;
};

Blockly.Arduino['board_serial_available'] = function () {
    var code = 'Serial.available()';
    return [code, Blockly.Arduino.ORDER_ATOMIC];
};

Blockly.Arduino['board_serial_read'] = function () {
    var code = 'Serial.read()';
    return [code, Blockly.Arduino.ORDER_ATOMIC];
};

Blockly.Arduino['board_serial_readStringUntil'] = function (block) {
    var content = Blockly.Arduino.valueToCode(block, 'CONTENT', Blockly.Arduino.ORDER_NONE) || '""';
    content = content.replace('"', '\'');
    content = content.replace('"', '\'');
    var code = 'Serial.readStringUntil(' + content + ')';
    return [code, Blockly.Arduino.ORDER_ATOMIC];
};

Blockly.Arduino['board_serial_flush'] = function () {
    var code = 'Serial.flush();\n';
    return code;
};
