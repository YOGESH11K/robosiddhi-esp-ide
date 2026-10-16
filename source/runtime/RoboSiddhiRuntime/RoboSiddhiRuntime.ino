// RoboSiddhi Universal Robotics Runtime v1.0.0 for ESP32 (Arduino core 3.x).
// Flash ONCE. Afterwards the IDE sends compact commands / validated programs
// over USB serial (115200) — no recompile, no reflash per Blockly change.
//
// Protocol: runtime/PROTOCOL.md  |  Interpreter ops: RSProgram.h
#include <Arduino.h>
#include <ESP32Servo.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_SSD1306.h>
#include <LiquidCrystal_I2C.h>
#include "RSProtocol.h"
#include "RSProgram.h"

using namespace RSProto;

// ---------- driver pools (bounded, fixed) ----------
#define RS_MAX_SERVOS 8
static Servo rsServos[RS_MAX_SERVOS];
static int rsServoPin[RS_MAX_SERVOS];

struct BlinkSlot { bool on = false; int pin = -1; uint32_t onMs = 0, offMs = 0; long left = 0; bool high = false; uint32_t next = 0; };
static BlinkSlot rsBlink;

struct DHTSlot { bool used = false; int pin = -1; uint8_t type = 11; DHT *d = nullptr; };
static DHTSlot rsDHT[3];

struct DSSlot { bool used = false; int pin = -1; OneWire *ow = nullptr; DallasTemperature *dt = nullptr; };
static DSSlot rsDS[2];

static Adafruit_SSD1306 rsOLED(128, 64, &Wire, -1);
static bool rsOLEDOn = false;
static int rsBuzzPin = -1;
static LiquidCrystal_I2C rsLCD(0x27, 16, 2);
static bool rsLCDOn = false;

// ---------- interpreter program slots ----------
static RSProg::Program rsStaged;    // being uploaded
static RSProg::Executor rsExec;

// ---------- helpers ----------
static uint32_t rsCrc32(const uint8_t *data, size_t len) {
  uint32_t c = 0xFFFFFFFF;
  for (size_t i = 0; i < len; i++) {
    c ^= data[i];
    for (uint8_t k = 0; k < 8; k++) c = (c & 1) ? (c >> 1) ^ 0xEDB88320 : (c >> 1);
  }
  return c ^ 0xFFFFFFFF;
}

static bool rsPinOk(int p) { return p >= 0 && p <= 39; }

static int rsServoIdx(int pin) {
  for (int i = 0; i < RS_MAX_SERVOS; i++) if (rsServoPin[i] == pin) return i;
  return -1;
}
static void rsServoEnsure(int pin) {
  if (rsServoIdx(pin) >= 0) return;
  for (int i = 0; i < RS_MAX_SERVOS; i++) if (rsServoPin[i] < 0) {
    rsServos[i].setPeriodHertz(50);
    rsServos[i].attach(pin, 500, 2400);
    rsServoPin[i] = pin;
    return;
  }
}

// driver callbacks for the interpreter
static int cbReadD(int p) { return digitalRead(p); }
static int cbReadA(int p) { return analogRead(p); }
static void cbWriteD(int p, int v) { digitalWrite(p, v ? HIGH : LOW); }
static void cbWritePWM(int p, int d) { analogWrite(p, d); }
static void cbServo(int p, int a) { rsServoEnsure(p); int i = rsServoIdx(p); if (i >= 0) rsServos[i].write(a); }
static void cbBuzz(int p, int f, int ms) { rsBuzzPin = p; tone(p, f, ms); }

// ---------- command dispatch (returns after replying) ----------
static void rsHandle(const Frame &f) {
  char out[160];
  long p0 = f.argc > 0 ? atol(f.argv[0]) : 0;
  long p1 = f.argc > 1 ? atol(f.argv[1]) : 0;
  long p2 = f.argc > 2 ? atol(f.argv[2]) : 0;

  if (!strcmp(f.cmd, "HELLO")) {
    snprintf(out, sizeof(out), "RS-RUNTIME %s PROTO %d CHIP %s REV %d FLASH %u",
             RS_RUNTIME_VERSION, RS_PROTO_VERSION,
             ESP.getChipModel(), ESP.getChipRevision(), (unsigned)ESP.getFlashChipSize());
    replyOk(f.seq, out); return;
  }
  if (!strcmp(f.cmd, "INFO")) {
    snprintf(out, sizeof(out), "UP %lu PROG %s PC %u STEPS %lu STOP %s",
             (unsigned long)(millis() / 1000),
             rsExec.running ? "RUNNING" : "STOPPED", rsExec.pc,
             (unsigned long)rsExec.steps, rsExec.stopReason ? rsExec.stopReason : "-");
    replyOk(f.seq, out); return;
  }
  if (!strcmp(f.cmd, "PINMODE")) {
    if (f.argc != 2 || !rsPinOk(p0)) { replyErr(f.seq, "BAD_ARGS"); return; }
    int m = (!strcmp(f.argv[1], "OUT")) ? OUTPUT : (!strcmp(f.argv[1], "IN")) ? INPUT : (!strcmp(f.argv[1], "PULLUP")) ? INPUT_PULLUP : -1;
    if (m < 0) { replyErr(f.seq, "BAD_ARGS"); return; }
    pinMode(p0, m); replyOk(f.seq); return;
  }
  if (!strcmp(f.cmd, "DWRITE")) {
    if (f.argc != 2 || !rsPinOk(p0) || (p1 != 0 && p1 != 1)) { replyErr(f.seq, "BAD_ARGS"); return; }
    digitalWrite(p0, p1 ? HIGH : LOW); replyOk(f.seq); return;
  }
  if (!strcmp(f.cmd, "DREAD")) {
    if (f.argc != 1 || !rsPinOk(p0)) { replyErr(f.seq, "BAD_ARGS"); return; }
    snprintf(out, sizeof(out), "%d", digitalRead(p0)); replyOk(f.seq, out); return;
  }
  if (!strcmp(f.cmd, "AREAD")) {
    if (f.argc != 1 || !rsPinOk(p0)) { replyErr(f.seq, "BAD_ARGS"); return; }
    snprintf(out, sizeof(out), "%d", analogRead(p0)); replyOk(f.seq, out); return;
  }
  if (!strcmp(f.cmd, "PWM")) {
    if (f.argc < 2 || !rsPinOk(p0) || p1 < 0 || p1 > 255) { replyErr(f.seq, "BAD_ARGS"); return; }
    analogWrite(p0, p1); replyOk(f.seq); return;
  }
  if (!strcmp(f.cmd, "BLINK")) {
    if (f.argc < 3 || !rsPinOk(p0) || p1 < 0 || p2 < 0) { replyErr(f.seq, "BAD_ARGS"); return; }
    rsBlink = BlinkSlot(); rsBlink.on = true; rsBlink.pin = p0;
    rsBlink.onMs = p1; rsBlink.offMs = p2;
    rsBlink.left = (f.argc > 3) ? atol(f.argv[3]) * 2 : -1;
    rsBlink.next = millis(); replyOk(f.seq); return;
  }
  if (!strcmp(f.cmd, "NOBLINK")) { rsBlink.on = false; digitalWrite(p0, LOW); replyOk(f.seq); return; }
  if (!strcmp(f.cmd, "SATTACH")) {
    if (f.argc < 1 || !rsPinOk(p0)) { replyErr(f.seq, "BAD_ARGS"); return; }
    rsServoEnsure(p0);
    if (rsServoIdx(p0) < 0) { replyErr(f.seq, "NO_SLOT"); return; }
    replyOk(f.seq); return;
  }
  if (!strcmp(f.cmd, "SANGLE")) {
    if (f.argc != 2 || !rsPinOk(p0) || p1 < 0 || p1 > 180) { replyErr(f.seq, "BAD_ARGS"); return; }
    cbServo(p0, p1); replyOk(f.seq); return;
  }
  if (!strcmp(f.cmd, "SDETACH")) {
    int i = rsServoIdx(p0);
    if (i >= 0) { rsServos[i].detach(); rsServoPin[i] = -1; }
    replyOk(f.seq); return;
  }
  if (!strcmp(f.cmd, "UREAD")) {
    if (f.argc < 2 || !rsPinOk(p0) || !rsPinOk(p1)) { replyErr(f.seq, "BAD_ARGS"); return; }
    long tmo = (f.argc > 2) ? p2 : 30000;
    if (tmo < 1000 || tmo > 100000) { replyErr(f.seq, "BAD_ARGS"); return; }
    digitalWrite(p0, LOW); delayMicroseconds(2);
    digitalWrite(p0, HIGH); delayMicroseconds(10); digitalWrite(p0, LOW);
    unsigned long us = pulseIn(p1, HIGH, (unsigned long)tmo);
    if (us == 0) { replyErr(f.seq, "TIMEOUT"); return; }
    snprintf(out, sizeof(out), "%d", (int)(us / 58)); replyOk(f.seq, out); return;
  }
  if (!strcmp(f.cmd, "DHTREAD")) {
    if (f.argc != 2 || !rsPinOk(p0) || (p1 != 11 && p1 != 22)) { replyErr(f.seq, "BAD_ARGS"); return; }
    DHTSlot *s = nullptr;
    for (int i = 0; i < 3; i++) if (rsDHT[i].used && rsDHT[i].pin == p0) s = &rsDHT[i];
    if (!s) for (int i = 0; i < 3 && !s; i++) if (!rsDHT[i].used) {
      s = &rsDHT[i]; s->used = true; s->pin = p0; s->type = p1; s->d = new DHT(p0, p1 == 11 ? DHT11 : DHT22); s->d->begin();
    }
    if (!s) { replyErr(f.seq, "NO_SLOT"); return; }
    float t = s->d->readTemperature(), h = s->d->readHumidity();
    if (isnan(t) || isnan(h)) { replyErr(f.seq, "SENSOR_FAIL"); return; }
    snprintf(out, sizeof(out), "T %.1f H %.1f", t, h); replyOk(f.seq, out); return;
  }
  if (!strcmp(f.cmd, "DSREAD")) {
    if (f.argc != 1 || !rsPinOk(p0)) { replyErr(f.seq, "BAD_ARGS"); return; }
    DSSlot *s = nullptr;
    for (int i = 0; i < 2; i++) if (rsDS[i].used && rsDS[i].pin == p0) s = &rsDS[i];
    if (!s) for (int i = 0; i < 2 && !s; i++) if (!rsDS[i].used) {
      s = &rsDS[i]; s->used = true; s->pin = p0; s->ow = new OneWire(p0); s->dt = new DallasTemperature(s->ow); s->dt->begin();
    }
    if (!s) { replyErr(f.seq, "NO_SLOT"); return; }
    s->dt->requestTemperatures();
    float t = s->dt->getTempCByIndex(0);
    if (t == DEVICE_DISCONNECTED_C) { replyErr(f.seq, "SENSOR_FAIL"); return; }
    snprintf(out, sizeof(out), "T %.2f", t); replyOk(f.seq, out); return;
  }
  if (!strcmp(f.cmd, "BUZZ")) {
    if (f.argc != 3 || !rsPinOk(p0) || p1 < 31 || p1 > 8000 || p2 < 0 || p2 > 5000) { replyErr(f.seq, "BAD_ARGS"); return; }
    rsBuzzPin = p0; tone(p0, p1, p2); replyOk(f.seq); return;
  }
  // string-arg commands: OLED/LCD (display text may contain no spaces; use _ for space)
  {
    if (!strcmp(f.cmd, "OLED_INIT")) {
      if (f.argc < 1) { replyErr(f.seq, "BAD_ARGS"); return; }
      long addr = strtol(f.argv[0], nullptr, 0);
      if (rsOLEDOn) { rsOLED.clearDisplay(); }
      rsOLEDOn = rsOLED.begin(SSD1306_SWITCHCAPVCC, (uint8_t)addr);
      if (!rsOLEDOn) { replyErr(f.seq, "DISP_FAIL"); return; }
      rsOLED.clearDisplay(); rsOLED.display(); replyOk(f.seq); return;
    }
    if (!strcmp(f.cmd, "OLED_PRINT") || !strcmp(f.cmd, "LCD_PRINT")) {
      bool oled = !strcmp(f.cmd, "OLED_PRINT");
      if (f.argc < 3) { replyErr(f.seq, "BAD_ARGS"); return; }
      char txt[64]; strncpy(txt, f.argv[2], sizeof(txt) - 1); txt[sizeof(txt) - 1] = 0;
      for (char *c = txt; *c; c++) if (*c == '_') *c = ' ';
      if (oled) {
        if (!rsOLEDOn) { replyErr(f.seq, "NO_DISP"); return; }
        rsOLED.setTextSize(1); rsOLED.setTextColor(SSD1306_WHITE);
        rsOLED.setCursor(atol(f.argv[0]), atol(f.argv[1])); rsOLED.print(txt); rsOLED.display();
      } else {
        if (!rsLCDOn) { replyErr(f.seq, "NO_DISP"); return; }
        rsLCD.setCursor(atol(f.argv[0]), atol(f.argv[1])); rsLCD.print(txt);
      }
      replyOk(f.seq); return;
    }
    if (!strcmp(f.cmd, "OLED_CLEAR")) { if (rsOLEDOn) { rsOLED.clearDisplay(); rsOLED.display(); } replyOk(f.seq); return; }
    if (!strcmp(f.cmd, "LCD_INIT")) {
      if (f.argc < 3) { replyErr(f.seq, "BAD_ARGS"); return; }
      rsLCD = LiquidCrystal_I2C((uint8_t)strtol(f.argv[0], nullptr, 0), atol(f.argv[1]), atol(f.argv[2]));
      rsLCD.init(); rsLCD.backlight(); rsLCDOn = true; replyOk(f.seq); return;
    }
    if (!strcmp(f.cmd, "LCD_CLEAR")) { if (rsLCDOn) rsLCD.clear(); replyOk(f.seq); return; }
    if (!strcmp(f.cmd, "PROG_CLEAR")) { rsStaged = RSProg::Program(); replyOk(f.seq); return; }
    if (!strcmp(f.cmd, "PROG_ADD")) {
      // PROG_ADD <startIdx> <op,a,b,c;op,a,b,c...>  (no spaces inside)
      if (f.argc != 2) { replyErr(f.seq, "BAD_ARGS"); return; }
      int idx = atoi(f.argv[0]);
      if (idx < 0 || idx >= RS_PROG_MAX_OPS) { replyErr(f.seq, "BAD_ARGS"); return; }
      char chunk[RS_MAX_ARGLEN];
      strncpy(chunk, f.argv[1], sizeof(chunk) - 1); chunk[sizeof(chunk) - 1] = 0;
      char *save = nullptr;
      for (char *tok = strtok_r(chunk, ";", &save); tok; tok = strtok_r(nullptr, ";", &save)) {
        int o, a, b, c;
        if (sscanf(tok, "%d,%d,%d,%d", &o, &a, &b, &c) != 4) { replyErr(f.seq, "BAD_OP"); return; }
        if (idx >= RS_PROG_MAX_OPS) { replyErr(f.seq, "TOO_BIG"); return; }
        rsStaged.ops[idx].op = (uint8_t)o; rsStaged.ops[idx].a = a; rsStaged.ops[idx].b = b; rsStaged.ops[idx].c = c;
        idx++;
      }
      rsStaged.len = idx > rsStaged.len ? idx : rsStaged.len;
      rsStaged.valid = false;
      snprintf(out, sizeof(out), "LEN %u", rsStaged.len); replyOk(f.seq, out); return;
    }
    if (!strcmp(f.cmd, "PROG_COMMIT")) {
      if (f.argc != 1) { replyErr(f.seq, "BAD_ARGS"); return; }
      uint32_t want = strtoul(f.argv[0], nullptr, 16);
      uint8_t raw[RS_PROG_MAX_OPS * 7];
      for (int i = 0; i < rsStaged.len; i++) {
        raw[i * 7] = rsStaged.ops[i].op;
        raw[i * 7 + 1] = rsStaged.ops[i].a & 0xFF; raw[i * 7 + 2] = (rsStaged.ops[i].a >> 8) & 0xFF;
        raw[i * 7 + 3] = rsStaged.ops[i].b & 0xFF; raw[i * 7 + 4] = (rsStaged.ops[i].b >> 8) & 0xFF;
        raw[i * 7 + 5] = rsStaged.ops[i].c & 0xFF; raw[i * 7 + 6] = (rsStaged.ops[i].c >> 8) & 0xFF;
      }
      if (rsCrc32(raw, rsStaged.len * 7) != want) { replyErr(f.seq, "CRC_FAIL"); return; }
      const char *bad = RSProg::validate(rsStaged.ops, rsStaged.len);
      if (bad) { replyErr(f.seq, bad); return; }
      rsStaged.valid = true; rsStaged.crc = want;
      snprintf(out, sizeof(out), "LEN %u", rsStaged.len); replyOk(f.seq, out); return;
    }
    if (!strcmp(f.cmd, "PROG_RUN")) {
      if (!rsStaged.valid) { replyErr(f.seq, "NO_PROG"); return; }
      rsExec.load(rsStaged); replyOk(f.seq, "RUNNING"); return;
    }
    if (!strcmp(f.cmd, "PROG_STOP")) {
      rsExec.stop("HOST_STOP");
      if (rsBuzzPin >= 0) { noTone(rsBuzzPin); rsBuzzPin = -1; }
      rsBlink.on = false;
      replyOk(f.seq, "STOPPED"); return;
    }
    if (!strcmp(f.cmd, "PROG_STATUS")) {
      snprintf(out, sizeof(out), "%s PC %u STEPS %lu STOP %s",
               rsExec.running ? "RUNNING" : "STOPPED", rsExec.pc,
               (unsigned long)rsExec.steps, rsExec.stopReason ? rsExec.stopReason : "-");
      replyOk(f.seq, out); return;
    }
    replyErr(f.seq, "UNKNOWN_CMD");
    return;
  }
}

void setup() {
  Serial.begin(115200);
  for (int i = 0; i < RS_MAX_SERVOS; i++) rsServoPin[i] = -1;
  rsExec.readD = cbReadD; rsExec.readA = cbReadA;
  rsExec.writeD = cbWriteD; rsExec.writePWM = cbWritePWM;
  rsExec.servoAngle = cbServo; rsExec.buzz = cbBuzz;
  delay(300);
  Serial.println("# RoboSiddhi Runtime 1.0.0 ready");
}

static char rsLine[RS_MAX_LINE + 1];
static size_t rsLen = 0;

void loop() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n') {
      rsLine[rsLen] = 0; rsLen = 0;
      if (strlen(rsLine) > 0 && rsLine[strlen(rsLine) - 1] == '\r') rsLine[strlen(rsLine) - 1] = 0;
      RSProto::Frame f;
      char buf[sizeof(rsLine)]; strcpy(buf, rsLine);
      if (RSProto::parseLine(buf, f)) rsHandle(f);
      // corrupt/unknown lines: silent (host times out and reports)
    } else if (rsLen < sizeof(rsLine) - 1) {
      rsLine[rsLen++] = c;
    } else {
      rsLen = 0;  // overlong line: drop (bounded memory)
    }
  }
  // blink scheduler
  if (rsBlink.on && (long)(millis() - rsBlink.next) >= 0) {
    rsBlink.high = !rsBlink.high;
    digitalWrite(rsBlink.pin, rsBlink.high ? HIGH : LOW);
    rsBlink.next = millis() + (rsBlink.high ? rsBlink.onMs : rsBlink.offMs);
    if (rsBlink.left > 0 && --rsBlink.left == 0) { rsBlink.on = false; digitalWrite(rsBlink.pin, LOW); }
  }
  rsExec.pump();
}
