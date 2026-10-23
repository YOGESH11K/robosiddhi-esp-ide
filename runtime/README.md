# RoboSiddhi Universal Robotics Runtime — flash once, send programs instantly

## 1. Flash the runtime (once per board)

1. Open the IDE, select board (ESP32 Dev Module etc.) + COM port.
2. Press **Flash** (bolt button). First build takes 1–2 min (Arduino core + libs),
   then it uploads like a normal sketch. Output shows cache + timings.
3. Press RST once. The board prints `# RoboSiddhi Runtime 1.0.0 ready` on serial @115200.

## 2. Send a Blockly program (no recompile, no reflash)

1. Build blocks as usual inside setup+loop (supported subset — anything else gives
   a clear "use Arduino mode" message naming the block).
2. Press **Send** (paper-plane). The IDE checks the runtime (`HELLO`), transfers
   ≤128 ops with CRC32 validation, and starts it. Transfer of small programs is
   ~1–2 s at 115200 baud (measured per-transfer, shown in the console).
3. **Stop** (square) halts anytime, including from infinite loops.

## 3. If the board has no runtime

`Send` fails with "No RoboSiddhi runtime … flash it first" — it never sends
runtime frames to an ordinary sketch. Normal Verify/Upload always still works.

## 4. Rebuild the firmware from source (this repo)

```
.\compiler\arduino-cli.exe compile -b esp32:esp32:esp32 --build-path compiler\build\runtime_check runtime\RoboSiddhiRuntime
```
Verified: ESP32 Arduino core 3.3.12, libs ESP32Servo 3.2.0 / DHT 1.4.6 /
OneWire 2.3.8 / DallasTemperature 4.0.6 / SSD1306 2.5.17 / LiquidCrystal_I2C 1.1.2.
Sketch uses ~361 KB (27%) on ESP32 Dev Module.

## 5. Hardware not available here — NOT RUN

Detection, live transfer, sensor reads and stop responsiveness are implemented and
unit-tested against a protocol emulator (47 Node tests green), but NOT verified on
physical ESP32 yet. Follow steps 1–3 on real hardware and report the console output.
