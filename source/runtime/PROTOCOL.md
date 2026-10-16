# RoboSiddhi Runtime Protocol v1

Transport: USB serial **115200 8N1**. All frames are single `\n`-terminated ASCII lines.
Numbers are decimal unless noted. Text args use `_` for space (no spaces inside args).

## Framing

- Host → device: `RS <seq 0-255> <CMD> [args...] *<CRC16>` 
- Device → host: `OK <seq> [payload...] *<CRC16>` or `ERR <seq> <CODE> [message] *<CRC16>`
- CRC = CRC16-CCITT (poly `0x1021`, init `0xFFFF`) over everything after the
  `RS `/`OK `/`ERR ` prefix up to (excluding) ` *`. Uppercase 4-hex.
- Test vector: `crc16("123456789") = 0x29B1` (verifies IDE ↔ firmware match).
- Corrupt/unknown lines get **no reply** (host times out and reports clearly).

## Commands (v1)

| Command | Args | Reply payload |
|---|---|---|
| `HELLO` | — | `RS-RUNTIME <ver> PROTO 1 CHIP <model> REV <n> FLASH <bytes>` |
| `INFO` | — | uptime, program state |
| `PINMODE` | `pin OUT\|IN\|PULLUP` | — |
| `DWRITE` | `pin 0\|1` | — |
| `DREAD` | `pin` | `0\|1` |
| `AREAD` | `pin` | `0..4095` |
| `PWM` | `pin 0..255` | — |
| `BLINK` | `pin on_ms off_ms [count]` | — (`count` omitted = forever) |
| `NOBLINK` | `pin` | — |
| `SATTACH` / `SDETACH` | `pin` | — |
| `SANGLE` | `pin 0..180` | — |
| `UREAD` | `trig echo [timeout_us]` | cm, or `ERR TIMEOUT` |
| `DHTREAD` | `pin 11\|22` | `T <c> H <%>`, or `ERR SENSOR_FAIL` |
| `DSREAD` | `pin` | `T <c>`, or `ERR SENSOR_FAIL` |
| `BUZZ` | `pin 31..8000Hz 0..5000ms` | — |
| `OLED_INIT` | `addr_hex [w h]` | — |
| `OLED_PRINT` | `x y text_with_underscores` | — |
| `OLED_CLEAR` | — | — |
| `LCD_INIT` | `addr_hex cols rows` | — |
| `LCD_PRINT` / `LCD_CLEAR` | … | — |
| `PROG_CLEAR` | — | — |
| `PROG_ADD` | `startIdx op,a,b,c;...` | `LEN n` |
| `PROG_COMMIT` | `crc32hex` | `LEN n` or `ERR CRC_FAIL\|BAD_*` |
| `PROG_RUN` / `PROG_STOP` / `PROG_STATUS` | — | state |

Error codes: `BAD_ARGS BAD_OP TOO_BIG BAD_LEN BAD_OPCODE END_NOT_LAST NO_END
BAD_VAL BAD_JUMP BAD_LOOP NO_SLOT TIMEOUT SENSOR_FAIL DISP_FAIL NO_DISP
NO_PROG CRC_FAIL UNKNOWN_CMD`.

## Program transfer (validated, resumable-safe)

1. `PROG_CLEAR` — clears the staging slot (running program untouched).
2. `PROG_ADD idx "op,a,b,c;..."` — chunks of ≤10 ops (line stays < 240 chars).
3. `PROG_COMMIT <crc32>` — CRC32 over staged op bytes (7 bytes/op, little-endian);
   then opcode/range/jump validation. Failure keeps the **previous** staged program.
4. `PROG_RUN` — copies staged → active and starts. `PROG_STOP` halts anytime
   (also silences buzzer/blink).

## Interpreter ops (must match `RSProgram.h` + IDE `robosiddhi_runtime.js`)

`1 DWRITE pin val` · `2 PWM pin duty` · `3 SANGLE pin deg` · `4 BUZZ pin freq ms` ·
`5 WAIT ms` · `6 IFD pin val target` (jump if equal) · `7 IFA_LT pin thresh target`
(jump if less) · `8 JMP target` · `9 LOOP count target` (1..1000, counted) ·
`10 END`. Max 128 ops. Backward `JMP` restarts the step budget (WHILE/run-forever);
everything else is bounded (20 000 steps, then auto-stop, never a hang).

## Explicit v1 limits (not supported → use Arduino compile-and-flash)

Variables, DHT/DS18B20/ultrasonic-driven branches (poll them live from the IDE
instead), `UNTIL` loops, WiFi/MQTT, MPU6050, motor-driver profiles (drive L298N via
GPIO+PWM ops), analog `=` in branches.
