// RoboSiddhi Universal Robotics Runtime — wire protocol v1 (header-only).
// Transport: USB serial, 115200 8N1. ASCII frames, CRC16-CCITT protected.
//
// Host -> device:  RS <seq:0-255> <CMD> [args...] *<CRC4hex>\n
// Device -> host:  OK <seq> [payload...] *<CRC>\n
//                   ERR <seq> <CODE> [message...] *<CRC>\n
// CRC covers every byte after "RS "/"OK "/"ERR " up to (not incl.) " *".
// Unknown/corrupt frames are ignored (no response) so the host times out cleanly.
#pragma once
#include <Arduino.h>

#define RS_PROTO_VERSION 1
#define RS_RUNTIME_VERSION "1.0.0"
#define RS_MAX_LINE 240
#define RS_MAX_ARGS 8
#define RS_MAX_ARGLEN 200   // room for a 10-op PROG_ADD chunk

namespace RSProto {

// CRC16-CCITT (poly 0x1021, init 0xFFFF) — shared with IDE (JS mirror).
static uint16_t crc16(const uint8_t *data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= (uint16_t)data[i] << 8;
    for (uint8_t b = 0; b < 8; b++)
      crc = (crc & 0x8000) ? (uint16_t)((crc << 1) ^ 0x1021) : (uint16_t)(crc << 1);
  }
  return crc;
}

struct Frame {
  bool ok = false;
  uint8_t seq = 0;
  char cmd[16] = {0};
  char argv[RS_MAX_ARGS][RS_MAX_ARGLEN] = {{0}};
  uint8_t argc = 0;
};

// Parse one "RS seq CMD args *crc" line (without trailing newline).
// Returns true only if prefix, arg count and CRC all check out.
static bool parseLine(char *line, Frame &out) {
  out = Frame();
  if (strncmp(line, "RS ", 3) != 0) return false;
  char *star = strrchr(line, '*');
  if (!star || strlen(star) != 5) return false;
  uint16_t want = (uint16_t)strtoul(star + 1, nullptr, 16);
  *star = 0;
  if (crc16((const uint8_t *)(line + 3), strlen(line + 3)) != want) return false;
  char *save = nullptr;
  char *tok = strtok_r(line + 3, " ", &save);          // seq
  if (!tok) return false;
  out.seq = (uint8_t)atoi(tok);
  tok = strtok_r(nullptr, " ", &save);                 // cmd
  if (!tok || strlen(tok) >= sizeof(out.cmd)) return false;
  strcpy(out.cmd, tok);
  while (out.argc < RS_MAX_ARGS && (tok = strtok_r(nullptr, " ", &save))) {
    if (strlen(tok) >= sizeof(out.argv[0])) return false;
    strcpy(out.argv[out.argc++], tok);
  }
  if (tok) return false;                               // too many args
  out.ok = true;
  return true;
}

// Emit "OK seq [payload] *crc" (payload must already be space-joined, no '*').
static void replyOk(uint8_t seq, const char *payload = nullptr) {
  char body[RS_MAX_LINE];
  if (payload && *payload) snprintf(body, sizeof(body), "%u %s", seq, payload);
  else snprintf(body, sizeof(body), "%u", seq);
  uint16_t c = crc16((const uint8_t *)body, strlen(body));
  Serial.printf("OK %s *%04X\n", body, c);
}

static void replyErr(uint8_t seq, const char *code, const char *msg = nullptr) {
  char body[RS_MAX_LINE];
  if (msg && *msg) snprintf(body, sizeof(body), "%u %s %s", seq, code, msg);
  else snprintf(body, sizeof(body), "%u %s", seq, code);
  uint16_t c = crc16((const uint8_t *)body, strlen(body));
  Serial.printf("ERR %s *%04X\n", body, c);
}

} // namespace RSProto
