# RoboSiddhi ESP IDE — Supported Boards

Verified pin metadata lives in `www/blocklyduino/js/esp_board_profiles.js`.
Legacy dropdown lists live in `www/blocklyduino/js/boards.json` (now includes ESP8266).

| Board ID | Name | Chip | FQBN | Core | Onboard LED | Notes |
|---|---|---|---|---|---|---|
| esp32_devkit_v1 | ESP32 Dev Module | ESP32 Xtensa LX6 240MHz | esp32:esp32:esp32 | esp32:esp32 | GPIO2 HIGH | GPIO6-11 flash-reserved. 34-39 input-only. 0/2/5/12/15 strapping. ADC2 conflicts Wi-Fi. |
| nodemcu_32s | NodeMCU-32S | ESP32-WROOM-32 | esp32:esp32:nodemcu-32s | esp32:esp32 | GPIO2 HIGH | Same constraints as DevKit. |
| esp32s2_dev | ESP32-S2 Dev Module | LX7 240MHz native USB | esp32:esp32:esp32s2 | esp32:esp32 | GPIO15 (verify) | Strapping 0/45/46. ADC 13-bit (1-20). |
| esp32s3_dev | ESP32-S3 Dev Module | LX7 dual 240MHz USB-OTG | esp32:esp32:esp32s3 | esp32:esp32 | GPIO48 RGB (verify) | Strapping 0/3/45/46. |
| esp32c3_dev | ESP32-C3 Dev Module | RISC-V 160MHz | esp32:esp32:esp32c3 | esp32:esp32 | GPIO8 (verify) | GPIO11-17 flash-reserved. Strapping 2/8/9. ADC 0-4 only. |
| esp8266_nodemcu | ESP8266 NodeMCU ESP-12E | ESP8266EX 80MHz | esp8266:esp8266:nodemcuv2 | esp8266:esp8266 | GPIO2 active-LOW | GPIO6-11 flash. 0/2/15 strapping. A0 only ADC (10-bit). GPIO16 digital-only. |

Unknown board → ask user to pick closest profile. Never invent mapping.
