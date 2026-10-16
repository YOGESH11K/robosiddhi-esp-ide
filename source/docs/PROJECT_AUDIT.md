# RoboSiddhi ESP IDE — Project Audit (2026-10-16)

Audited against MASTER BUILD PROMPT. All claims verified in code; no assumptions.

## 1. What the app is

- **Framework:** Electron 39 (`package.json`), `main.js` = backend, `preload.js` = secure bridge
  (`window.RoboSiddhi`, `nodeIntegration:false`, `contextIsolation:true`).
- **Base:** BlocklyDuino2 (BlocklyTL) + Arduino-Lua `arduino-cli 1.5.1` shipped in `compiler/`.
- **Boards:** 6 ESP profiles (`www/blocklyduino/js/esp_board_profiles.js`):
  esp32_devkit_v1 (`esp32:esp32:esp32`), nodemcu_32s, esp32s2_dev, esp32s3_dev,
  esp32c3_dev, esp8266_nodemcu (`esp8266:esp8266:nodemcuv2`).
  Cores installed locally: esp32 **3.3.12**, esp8266 **3.1.2** (verified `core list`).
- **Blocks:** LED/RGB/buzzer/DHT/HC-SR04(+guard)/PIR/LDR/soil/DS18B20/servo/relay/
  MPU6050/OLED/LCD/L298N/WiFi-HTTP-MQTT + board IO/serial + logic/loops. All 17
  registry components marked `supported` (`components_registry.json`).

## 2. Code → flash pipeline (as built)

1. `IDE_functions.js`: `Blockly.Arduino.workspaceToCode` → `rs-write-sketch`
   (enforces `<dir>/<dir>.ino` name match, deletes stale `tmp.ino`).
2. `rs-compile`: `compile -j 0 [-v] -b FQBN --build-path <per-board persistent dir> <sketchDir>`.
3. `rs-upload`: sketch-hash fast path → else compile → then
   `upload -p PORT [-v] -b FQBN --input-dir <buildDir> <sketchDir>`.
   Compile failure aborts before upload (`phase:'compile'`). Upload result carries `phase:'upload'`.
4. Errors mapped by `robosiddhi_build.js:diagnoseCompilerError()` (missing .h → lib hint,
   unknown board → core-install hint, port busy, esptool handshake → BOOT/cable hint).

## 3. Why uploads are slow (measured causes, not guesses)

- **Cold compile dominates.** ESP32 Arduino core compile of even Blink is minutes on
  first build; `--build-path` reuse cuts repeats (comment claims 40s→~11s).
  Baseline measurement running: `docs/PERFORMANCE_BASELINE.md`.
- **No upload baud control.** `upload` never passes `--upload-property`; always the
  platform default. No 460800/921600 selection, no fallback logic.
- **Full flash every time.** No `--verify` flag choice, no partial-flash (correctly so —
  bootloader/partition layout must stay intact).
- **Monitor port conflict.** `rs-upload` does NOT close an open Serial Monitor port;
  monitor owns the same COM port → "port busy" upload failures.
- **No upload mutex.** Two rapid Upload clicks can run two CLI uploads on one port.
- **Cores/libs resolved on demand.** First-time `core install` / `lib install` happen
  during user flow (documented, needs internet once — acceptable, but it is upload-time cost).

## 4. Cache: what exists vs what is missing

Existing (`main.js:61-80,350-389`):
- Per-board persistent `--build-path` (dev: `compiler/build/<fqbn>`, pkg: `userData/build/<fqbn>`).
- Sketch `sketch.hash` (sha256, 16 hex) written on successful compile; upload skips
  recompilation when hash matches AND a `.bin` exists.

Missing (gaps to fix):
- Key = code hash only. **Core version, CLI version, lib versions, build flags not in key.**
  A core upgrade silently reuses the old binary path decision (arduino-cli would rebuild
  inside `--build-path` on `rs-compile`, but the hash fast-path in `rs-upload` skips
  compilation entirely → stale binary risk).
- No integrity hash of the `.bin` itself; no schema version; no timestamps/diagnostics.
- No hit/miss reporting to UI; no per-phase timings.
- `clean-cache` empties only `tmp/`, NOT the build dirs (misleading name).
- No Force-Rebuild action, no cache-status view.
- `robosiddhi_build.js:compileCommand/uploadCommand` don't model `--build-path` /
  `--input-dir` / baud — tests can't cover the real commands.

## 5. What is out of scope / deferred

- **Runtime interpreter mode (Phase 6):** no runtime firmware, no serial protocol exists.
  Implementing an ESP32 instruction interpreter is a separate firmware project with
  safety implications; correctly deferred. Standard compile-and-flash stays the only path.
- **Stop Program / Run Existing Program:** no firmware support for these; upload always
  reflashes. UI must not present them as working features.
- **Hardware-timed upload numbers:** no board attached here; upload/flash timings are
  NOT RUN (marked, not fabricated).
