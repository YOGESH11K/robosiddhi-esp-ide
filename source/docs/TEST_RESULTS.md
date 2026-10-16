# RoboSiddhi ESP IDE — Test Results

Date: 2026-10-14. Machine: Windows x64. Toolchain: arduino-cli 1.5.1.

## Automated tests (no hardware)
`npm test` → **27 passed, 0 failed** (`tests/run_tests.js`).
Covers: 6 board profiles load, GPIO restrictions (flash-reserved, input-only, strapping,
ADC/PWM limits, ESP8266 A0/GPIO16 rules), unknown-board rejection, per-board pin lists,
workspace double-drive warnings, registry supported→blocks, toolbox count, ESP-only
boards.json (AVR assert), generator includes, safe command quoting/validation,
diagnostics, project schema, examples XML, secure main.js prefs, bridge-only renderers.

## Real firmware compiles (arduino-cli, no hardware)
| Sketch | Board (FQBN) | Result |
|---|---|---|
| LED blink GPIO13 | esp32:esp32:esp32 | OK, 271472 B (20%) |
| DHT22 temp alarm GPIO4+LED13 | esp32:esp32:esp32 | OK, 273812 B (20%) |
| LED blink GPIO2 | esp8266:esp8266:nodemcuv2 | OK, 236052 B flash (22%) |
| Peripherals (OLED SSD1306 + LCD1602-I2C + MPU6050 + L298N) | esp32:esp32:esp32 | OK, 323179 B (24%) |
| Same peripherals sketch | esp8266:esp8266:nodemcuv2 | OK, 257756 B flash (24%) |
| Comm (WiFi + HTTP GET + MQTT PubSubClient) | esp32:esp32:esp32 | OK, 929536 B (70%) |
| Same comm sketch | esp8266:esp8266:nodemcuv2 | OK, 257500 B flash (24%) |

Note: LiquidCrystal I2C lib prints an AVR-architecture warning but links and builds fine on both chips.

## Desktop launch (secured build)
`npm start` after IPC migration: 5 electron processes, no `[renderer]` errors.
Only logs: benign `File not found` (missing optional PapyrusST4Econfig.json) and the
dev-only Electron CSP warning (disappears in packaged build).

## Installer
`npm run compile` (electron-builder --win --x64, targets portable+zip) — **builds clean**.
Artifacts: `dist/Robosiddhi 0.8.0.exe` (133MB portable), `dist/Robosiddhi-0.8.0-win.zip`
(190MB), `dist/win-unpacked/`. Packaged app launch verified (5 processes, window up).
Packaging fixes applied: `arduino-cli.exe` + compiler tools in `asarUnpack` (binaries
cannot run inside app.asar), sketch/tmp under `%APPDATA%/RoboSiddhi` (asar is
read-only), absolute Tray icon path.
Cores and libraries are NOT bundled — target machines run `node scripts/setup_esp.js`
/ `core install esp32:esp32 esp8266:esp8266` once (internet), then fully offline.

## Pending physical-hardware acceptance (needs ESP32 + USB)
1. Select ESP32 Dev Module → real COM port → board pinout loads.
2. `www/examples/esp_blink.xml` → Verify → Upload → physical LED blinks.
3. `www/examples/esp_temp_alarm.xml` (DHT11/22 on GPIO4) → readings in serial monitor.
Upload over USB cannot be validated without hardware; everything up to the flashing
step is compile-verified above.
