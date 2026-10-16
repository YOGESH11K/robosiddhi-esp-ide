# Hardware Setup + Troubleshooting

## First-run (needs internet once)
1. Install USB driver: CP210x (Silabs) or CH340/CH341 (WCH). Check Device Manager → Ports.
2. `node scripts/setup_esp.js` to check toolchain. `arduino-cli 1.5.1` bundled in `compiler/`.
3. Install cores if missing: `./compiler/arduino-cli.exe core install esp32:esp32 esp8266:esp8266`
   - NOTE: arduino-cli uses the ACTIVE global config (`%LOCALAPPDATA%/Arduino15/arduino-cli.yaml`), not `compiler/arduino-cli.yaml` (bundled copy is stale). `setup_esp.js` adds the ESP8266 board URL to the active config automatically. If `esp8266:esp8266` says "Platform not found", run `core update-index` first.
4. Install libs: `./compiler/arduino-cli.exe lib install "DHT sensor library" "Adafruit Unified Sensor" OneWire DallasTemperature`
5. Launch: `npm start`. Pick board (chip icon) → pick COM (USB icon) → open `www/examples/esp_blink.xml` → Verify → Upload.

## Wiring safety
- ESP logic is 3.3V. Never feed 5V signals directly (HC-SR04 ECHO needs 1k/2k divider).
- Common GND always. Servo/motors/relays need separate supply, common GND.
- Relay mains: qualified person only. Classrooms use low-voltage loads.
- LED always with 220Ω.

## Upload failures
- No COM: driver missing, charge-only cable, hub. Use short data cable, direct port.
- Port busy: close Serial Monitor / Putty / any other serial program holding the COM port.
- `failed to connect / timed out`: hold BOOT during upload on bare modules; DevKits auto-reset.
- Wrong board: FQBN must match chip (S3 firmware on C3 fails). Re-select board.
- Missing `.h`: install library via CLI panel (error box now suggests exact command).
- Missing core: `core install <pkg>` (error box suggests it).

## Serial monitor
- Baud must match `Serial.begin()` (115200 in examples).
- `serialMonitor.js` now uses serialport v10 `{path, baudRate}` API.
- Timestamps/search/export in monitor window; build log stays in bottom console.

## Offline
After cores+libs installed: coding, codegen, compile, upload, monitor all work offline.
Internet needed only for core/lib downloads and updates.
