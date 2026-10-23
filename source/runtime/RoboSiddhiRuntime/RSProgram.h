// RoboSiddhi Runtime — bounded block-program interpreter (header-only).
// A program is a list of validated ops. Two RAM slots: ACTIVE runs, NEXT is
// staged; NEXT becomes ACTIVE only after a full CRC-verified commit.
// Executor is non-blocking: each loop() call runs a small step budget, WAIT
// uses timers, STOP is honoured between ops, loops are iteration-bounded.
#pragma once
#include <Arduino.h>

#define RS_PROG_MAX_OPS 128
#define RS_PROG_MAX_STEPS 20000   // hard execution budget per RUN
#define RS_LOOP_MAX_ITER 1000     // per-loop bound

namespace RSProg {

enum Op : uint8_t {
  OP_DWRITE = 1,   // a=pin b=value
  OP_PWM = 2,      // a=pin b=duty(0-255)
  OP_SANGLE = 3,   // a=pin b=angle(0-180)  (auto-attach handled by driver layer)
  OP_BUZZ = 4,     // a=pin b=freq c=ms
  OP_WAIT = 5,     // a=ms (0-60000)
  OP_IFD = 6,      // a=pin b=value c=jump target (if digitalRead==value)
  OP_IFA_LT = 7,   // a=pin b=thresh c=jump target (if analogRead<thresh)
  OP_JMP = 8,      // a=jump target
  OP_LOOP = 9,     // a=count(1-1000) b=jump-back target (counted loop)
  OP_END = 10,
  OP_UREAD = 11,   // a=trigPin b=echoPin  (stores last ultrasonic distance in cm, or 10000 on timeout)
  OP_IFU_LT = 12   // a=thresh b=0 c=jump target (if lastUltrasonic>=0 && <thresh)
};

struct OpLine { uint8_t op; int16_t a; int16_t b; int16_t c; };

struct Program {
  OpLine ops[RS_PROG_MAX_OPS];
  uint8_t len = 0;
  uint32_t crc = 0;      // CRC32 over op bytes, checked at commit
  bool valid = false;
};

// Validate raw op list. Returns nullptr on success or a short error code.
// Two endings allowed: ...END (stops by itself) or a trailing backward JMP
// (runs until host STOP — used for setup+loop programs).
static const char *validate(const OpLine *ops, uint8_t len) {
  if (len == 0 || len > RS_PROG_MAX_OPS) return "BAD_LEN";
  for (uint8_t i = 0; i < len; i++) {
    uint8_t o = ops[i].op;
    if (o < OP_DWRITE || o > OP_IFU_LT) return "BAD_OPCODE";
    if (o == OP_END && i != len - 1) return "END_NOT_LAST";
  }
  uint8_t last = ops[len - 1].op;
  bool forever = (last == OP_JMP && ops[len - 1].a >= 0 && ops[len - 1].a < len - 1);
  if (last != OP_END && !forever) return "NO_END";
  for (uint8_t i = 0; i < len; i++) {
    int16_t a = ops[i].a, b = ops[i].b, c = ops[i].c;
    switch (ops[i].op) {
      case OP_DWRITE: if (b != 0 && b != 1) return "BAD_VAL"; break;
      case OP_PWM: if (b < 0 || b > 255) return "BAD_VAL"; break;
      case OP_SANGLE: if (b < 0 || b > 180) return "BAD_VAL"; break;
      case OP_BUZZ: if (b < 31 || b > 8000 || c < 0 || c > 5000) return "BAD_VAL"; break;
      case OP_WAIT: if (a < 0 || a > 60000) return "BAD_VAL"; break;
      case OP_IFD: if ((b != 0 && b != 1) || c < 0 || c >= len) return "BAD_JUMP"; break;
      case OP_IFA_LT: if (c < 0 || c >= len) return "BAD_JUMP"; break;
      case OP_IFU_LT: if (c < 0 || c >= len) return "BAD_JUMP"; break;
      case OP_JMP: if (a < 0 || a >= len) return "BAD_JUMP"; break;
      case OP_LOOP: if (a < 1 || a > RS_LOOP_MAX_ITER || b < 0 || b >= len || b >= i) return "BAD_LOOP"; break;
      default: break;
    }
    if (a < -1) return "BAD_VAL";
  }
  return nullptr;
}

struct Executor {
  Program active;                 // running program (copied at RUN)
  bool running = false;
  uint8_t pc = 0;
  uint32_t steps = 0;
  uint32_t waitUntil = 0;
  int16_t loopLeft[RS_PROG_MAX_OPS] = {0};
  int16_t lastU = 10000;
  const char *stopReason = nullptr;

  void load(const Program &p) {
    active = p;
    pc = 0; steps = 0; waitUntil = 0; running = true; stopReason = nullptr;
    lastU = 10000;
    memset(loopLeft, 0, sizeof(loopLeft));
  }
  void stop(const char *why) { running = false; stopReason = why; }

  // Driver callbacks (set by .ino): return sensor ints, perform outputs.
  int (*readD)(int pin) = nullptr;
  int (*readA)(int pin) = nullptr;
  int (*readU)(int trig, int echo) = nullptr;
  void (*writeD)(int pin, int v) = nullptr;
  void (*writePWM)(int pin, int duty) = nullptr;
  void (*servoAngle)(int pin, int deg) = nullptr;
  void (*buzz)(int pin, int freq, int ms) = nullptr;

  // Run a few steps; call from loop(). Returns true while still running.
  bool pump() {
    if (!running) return false;
    for (uint8_t budget = 0; budget < 8 && running; budget++) {
      if (millis() < waitUntil) return true;
      if (pc >= active.len) { stop("END"); return false; }
      if (++steps > RS_PROG_MAX_STEPS) { stop("STEP_BUDGET"); return false; }
      OpLine o = active.ops[pc];
      switch (o.op) {
        case OP_DWRITE: if (writeD) writeD(o.a, o.b); pc++; break;
        case OP_PWM: if (writePWM) writePWM(o.a, o.b); pc++; break;
        case OP_SANGLE: if (servoAngle) servoAngle(o.a, o.b); pc++; break;
        case OP_BUZZ: if (buzz) buzz(o.a, o.b, o.c); pc++; break;
        case OP_WAIT: waitUntil = millis() + (uint32_t)o.a; pc++; break;
        case OP_IFD: pc = (readD && readD(o.a) == o.b) ? (uint8_t)o.c : pc + 1; break;
        case OP_IFA_LT: pc = (readA && readA(o.a) < o.b) ? (uint8_t)o.c : pc + 1; break;
        case OP_JMP:
          if (o.a < pc) steps = 0;  // backward jump = deliberate loop (WHILE / run-forever):
          pc = (uint8_t)o.a;        // step budget restarts; host STOP stays responsive
          break;
        case OP_LOOP: {
          if (loopLeft[pc] == 0) loopLeft[pc] = o.a;
          if (--loopLeft[pc] > 0) pc = (uint8_t)o.b;
          else { loopLeft[pc] = 0; pc++; }
          break;
        }
        case OP_UREAD: if (readU) lastU = (int16_t)readU(o.a, o.b); if (lastU < 0) lastU = 10000; pc++; break;
        case OP_IFU_LT: pc = (lastU >= 0 && lastU < o.a) ? (uint8_t)o.c : pc + 1; break;
        case OP_END: stop("END"); return false;
        default: stop("BAD_OPCODE"); return false;
      }
    }
    return running;
  }
};

} // namespace RSProg
