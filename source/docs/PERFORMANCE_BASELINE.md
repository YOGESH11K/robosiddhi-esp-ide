# Performance Baseline (measured 2026-10-16, this machine)

Sketch: minimal Blink-equivalent (`pinMode(2)` + blink loop), board `esp32:esp32:esp32`,
`arduino-cli 1.5.1`, core `esp32:esp32 3.3.12`, persistent `--build-path`.

| Run | Time | Notes |
|---|---|---|
| Cold compile (empty build dir) | **56.1 s** | full core + sketch build |
| Warm compile (same code, build dir reused) | **15.5 s** | `arduino-cli` incremental inside `--build-path` |
| Repeat upload, unchanged code | NOT RUN | no hardware attached; expects ~flash time only (compile skipped on cache hit) |
| First upload / changed code | NOT RUN | = warm-or-cold compile + flash |

Binaries produced (example): `base_measure.ino.bin` 257,824 bytes.

## What this means

- The cache fast-path removes the compile step on repeats (56s/15s → 0s compile).
- Flashing the binary still takes real time (esptool sync + write + verify at the
  negotiated baud). No fixed "2-second" promise is made; the diagnostics line in the
  IDE reports actual `compile / flash / total` per upload.
- Upload-baud override (`--upload-property upload.speed=`) added; 460800/921600 must
  still be validated on real hardware with fallback to default.
