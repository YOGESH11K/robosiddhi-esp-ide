# Sensor / Component Support Matrix

Registry: `www/blocklyduino/components_registry.json`. Blocks: `www/blocklyduino/blocks/esp/esp_sensors.js`. Generators: `www/blocklyduino/arduino/esp/esp_sensors.js`.

| Component | Status | Blocks | Library | Boards |
|---|---|---|---|---|
| Standard LED | supported | robosiddhi_led_set | — | all ESP |
| RGB LED | supported | robosiddhi_rgb_set | — | ESP32 family (PWM) |
| Buzzer | supported | robosiddhi_buzzer | — | all ESP |
| DHT11 | supported | robosiddhi_dht_read | DHT sensor lib + Adafruit Unified Sensor | all ESP |
| DHT22 | supported | robosiddhi_dht_read | same | all ESP |
| HC-SR04 | supported | robosiddhi_hcsr04 | — (pulseIn) | all ESP. ECHO 5V → divider to 3.3V |
| PIR HC-SR501 | supported | robosiddhi_pir_read | — | all ESP |
| LDR analog | supported | robosiddhi_ldr_read | — | all ESP (A0 on 8266) |
| Soil analog/capacitive | supported | robosiddhi_soil_read | — | all ESP (A0 on 8266) |
| DS18B20 | supported | ds18b20_* (legacy) | OneWire + DallasTemperature | all ESP |
| Servo SG90 | supported | servo_* (legacy) | ESP32Servo / Servo | all ESP, separate 5V |
| Relay module | supported | RELAY_* (legacy) | — | all ESP. Mains only by qualified person |
| MPU6050 | supported | robosiddhi_mpu6050_read | Adafruit MPU6050 + Unified Sensor | all ESP |
| OLED SSD1306 I2C | supported | robosiddhi_oled_init/print/clear | Adafruit SSD1306 + GFX | all ESP |
| LCD1602 I2C | supported | robosiddhi_lcd_init/print/clear | LiquidCrystal_I2C | all ESP |
| DC motor L298N | supported | robosiddhi_motor_l298n | — | ESP32 DevKit/NodeMCU-32S (pins generalized, works on all ESP) |
| Wi-Fi/HTTP/MQTT | supported | robosiddhi_wifi_connect/http_get/mqtt_publish | PubSubClient (MQTT) | all ESP |

No Planned entries remain in the registry.
