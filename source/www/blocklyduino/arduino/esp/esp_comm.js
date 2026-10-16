/**
 * RoboSiddhi ESP comm generators — Wi-Fi, HTTP GET, MQTT, MPU6050, L298N.
 * Wi-Fi/HTTP includes switch per chip so one sketch compiles on ESP32 + ESP8266.
 */
'use strict';
goog.provide('Blockly.Arduino.robosiddhi_comm');
goog.require('Blockly.Arduino');

var ROBO_WIFI_INCLUDES =
  '#ifdef ESP32\n#include <WiFi.h>\n#include <HTTPClient.h>\n' +
  '#elif defined(ESP8266)\n#include <ESP8266WiFi.h>\n#include <ESP8266HTTPClient.h>\n#endif';

Blockly.Arduino['robosiddhi_wifi_connect'] = function (block) {
  var ssid = Blockly.Arduino.valueToCode(block, 'SSID', Blockly.Arduino.ORDER_NONE) || '""';
  var pass = Blockly.Arduino.valueToCode(block, 'PASS', Blockly.Arduino.ORDER_NONE) || '""';
  Blockly.Arduino.includes_['include_robowifi'] = ROBO_WIFI_INCLUDES;
  Blockly.Arduino.codeFunctions_['func_robowifi'] =
    'void robosiddhi_wifi_connect(const char* ssid, const char* pass) {\n' +
    '  WiFi.mode(WIFI_STA);\n' +
    '  WiFi.begin(ssid, pass);\n' +
    '  unsigned long t0 = millis();\n' +
    '  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 10000) { delay(250); }\n' +
    '  if (WiFi.status() == WL_CONNECTED) { Serial.print(F("WiFi OK ")); Serial.println(WiFi.localIP()); }\n' +
    '  else { Serial.println(F("WiFi FAILED")); }\n' +
    '}';
  return 'robosiddhi_wifi_connect(' + ssid + ', ' + pass + ');\n';
};

Blockly.Arduino['robosiddhi_http_get'] = function (block) {
  var url = Blockly.Arduino.valueToCode(block, 'URL', Blockly.Arduino.ORDER_NONE) || '""';
  Blockly.Arduino.includes_['include_robowifi'] = ROBO_WIFI_INCLUDES;
  Blockly.Arduino.includes_['include_wificlient'] = '#include <WiFiClient.h>';
  Blockly.Arduino.codeFunctions_['func_robohttp'] =
    'String robosiddhi_http_get(const String& url) {\n' +
    '  if (WiFi.status() != WL_CONNECTED) return "";\n' +
    '  WiFiClient client;\n' +
    '  HTTPClient http;\n' +
    '  if (!http.begin(client, url)) return "";\n' +
    '  int code = http.GET();\n' +
    '  String body = (code > 0) ? http.getString() : "";\n' +
    '  http.end();\n' +
    '  return body;\n' +
    '}';
  return ['robosiddhi_http_get(' + url + ')', Blockly.Arduino.ORDER_ATOMIC];
};

Blockly.Arduino['robosiddhi_mqtt_publish'] = function (block) {
  var server = Blockly.Arduino.valueToCode(block, 'SERVER', Blockly.Arduino.ORDER_NONE) || '""';
  var port = block.getFieldValue('PORT') || '1883';
  var topic = Blockly.Arduino.valueToCode(block, 'TOPIC', Blockly.Arduino.ORDER_NONE) || '""';
  var msg = Blockly.Arduino.valueToCode(block, 'MSG', Blockly.Arduino.ORDER_NONE) || '""';
  Blockly.Arduino.includes_['include_robowifi'] = ROBO_WIFI_INCLUDES;
  Blockly.Arduino.includes_['include_pubsub'] = '#include <PubSubClient.h>';
  Blockly.Arduino.definitions_['define_robo_mqtt'] = 'WiFiClient robosiddhi_net;\nPubSubClient robosiddhi_mqtt(robosiddhi_net);';
  Blockly.Arduino.codeFunctions_['func_robomqtt'] =
    'void robosiddhi_mqtt_publish(const char* server, int port, const char* topic, const char* msg) {\n' +
    '  if (WiFi.status() != WL_CONNECTED) return;\n' +
    '  robosiddhi_mqtt.setServer(server, port);\n' +
    '  unsigned long t0 = millis();\n' +
    '  while (!robosiddhi_mqtt.connected() && millis() - t0 < 5000) { robosiddhi_mqtt.connect("robosiddhi"); delay(250); }\n' +
    '  if (robosiddhi_mqtt.connected()) { robosiddhi_mqtt.publish(topic, msg); }\n' +
    '}';
  return 'robosiddhi_mqtt_publish(' + server + ', ' + port + ', ' + topic + ', ' + msg + ');\n';
};

Blockly.Arduino['robosiddhi_mpu6050_read'] = function (block) {
  var what = block.getFieldValue('WHAT') || 'TEMP';
  Blockly.Arduino.includes_['include_wire'] = '#include <Wire.h>';
  Blockly.Arduino.includes_['include_mpu'] = '#include <Adafruit_MPU6050.h>';
  Blockly.Arduino.includes_['include_adasensor'] = '#include <Adafruit_Sensor.h>';
  Blockly.Arduino.definitions_['define_mpu'] = 'Adafruit_MPU6050 robosiddhi_mpu;';
  Blockly.Arduino.setups_['setup_mpu'] = 'if (!robosiddhi_mpu.begin()) { Serial.println(F("MPU6050 init failed")); }';
  Blockly.Arduino.codeFunctions_['func_robompu'] =
    'float robosiddhi_mpu_read(int what) {\n' +
    '  sensors_event_t a, g, temp;\n' +
    '  robosiddhi_mpu.getEvent(&a, &g, &temp);\n' +
    '  switch (what) {\n' +
    '    case 0: return a.acceleration.x;\n' +
    '    case 1: return a.acceleration.y;\n' +
    '    case 2: return a.acceleration.z;\n' +
    '    case 3: return g.gyro.x;\n' +
    '    case 4: return g.gyro.y;\n' +
    '    case 5: return g.gyro.z;\n' +
    '    default: return temp.temperature;\n' +
    '  }\n' +
    '}';
  var idx = { AX: 0, AY: 1, AZ: 2, GX: 3, GY: 4, GZ: 5, TEMP: 6 }[what];
  if (idx === undefined) idx = 6;
  return ['robosiddhi_mpu_read(' + idx + ')', Blockly.Arduino.ORDER_ATOMIC];
};

Blockly.Arduino['robosiddhi_motor_l298n'] = function (block) {
  var ena = block.getFieldValue('ENA') || '25';
  var in1 = block.getFieldValue('IN1') || '26';
  var in2 = block.getFieldValue('IN2') || '27';
  var spd = Blockly.Arduino.valueToCode(block, 'SPEED', Blockly.Arduino.ORDER_ATOMIC) || '0';
  var key = ena + '_' + in1 + '_' + in2;
  Blockly.Arduino.setups_['setup_motor_' + key] = 'pinMode(' + ena + ', OUTPUT);\n  pinMode(' + in1 + ', OUTPUT);\n  pinMode(' + in2 + ', OUTPUT);';
  Blockly.Arduino.codeFunctions_['func_robo_motor_' + key] =
    'void robosiddhi_motor_' + key + '(int speed) {\n' +
    '  speed = constrain(speed, -255, 255);\n' +
    '  digitalWrite(' + in1 + ', speed >= 0 ? HIGH : LOW);\n' +
    '  digitalWrite(' + in2 + ', speed >= 0 ? LOW : HIGH);\n' +
    '  analogWrite(' + ena + ', abs(speed));\n' +
    '}';
  return 'robosiddhi_motor_' + key + '(' + spd + ');\n';
};
