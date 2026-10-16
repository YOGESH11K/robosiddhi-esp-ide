/**
 * RoboSiddhi ESP Board Profiles — verified pin metadata
 * Extends boards.json with capability-aware metadata.
 * UMD: works in browser (window.RoboSiddhiBoards) and Node (module.exports).
 * Sources: Espressif datasheets + Arduino-ESP32 / ESP8266 core pin maps.
 * If a board is unknown, caller must ask user to pick closest profile — never invent mapping.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RoboSiddhiBoards = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // pin capability entry: { gpio, adc, pwm, inputOnly, strapping, reserved, note }
  function P(gpio, opts) {
    opts = opts || {};
    return Object.assign({ gpio: gpio, adc: false, pwm: true, inputOnly: false, strapping: false, reserved: false, usb: false, note: '' }, opts);
  }

  var PROFILES = {
    esp32_devkit_v1: {
      id: 'esp32_devkit_v1',
      name: 'ESP32 Dev Module',
      chip: 'ESP32-D0WD (Xtensa LX6 dual-core 240MHz)',
      family: 'ESP32',
      framework: 'Arduino C++ (arduino-esp32)',
      fqbn: 'esp32:esp32:esp32',
      corePackage: 'esp32:esp32',
      flashMHz: '80MHz', voltage: '3.3V logic / 5V USB in',
      onboardLed: { gpio: 2, activeHigh: true, note: 'Most DevKit V1 boards wire blue LED to GPIO2. Some variants use GPIO5 — verify silkscreen.' },
      usbUart: ['CP2102', 'CH340', 'CH341'],
      defaultBaud: 115200,
      adcResolution: 12, adcMax: 4095, pwmResolutionNote: 'LEDC 8-bit via analogWrite in Arduino core',
      i2c: { sda: 21, scl: 22 }, spi: { ss: 5, mosi: 23, miso: 19, sck: 18 }, uart0: { tx: 1, rx: 3 },
      pins: [
        P(0,  { adc: true, strapping: true, note: 'BOOT strapping + ADC2 (WiFi conflict). Avoid as output at boot.' }),
        P(1,  { note: 'UART0 TX — debug output. Avoid unless UART unused.' }),
        P(2,  { adc: true, strapping: true, note: 'Onboard LED on most DevKits. Strapping (must be LOW at boot on some). Safe with pull-down.' }),
        P(3,  { note: 'UART0 RX — flashing/debug. Avoid.' }),
        P(4,  { adc: true, note: 'Safe GPIO. ADC2 (WiFi conflict).' }),
        P(5,  { strapping: true, note: 'VSPI SS. Strapping (must be HIGH at boot). Safe after boot.' }),
        P(12, { adc: true, strapping: true, note: 'Strapping (must be LOW at boot, has pull-down). ADC2. Boot fails if pulled HIGH.' }),
        P(13, { adc: true, note: 'Safe GPIO. Good default LED pin.' }),
        P(14, { adc: true, note: 'Safe GPIO.' }),
        P(15, { adc: true, strapping: true, note: 'Strapping (HIGH at boot for normal boot). Has pull-up on most boards.' }),
        P(16, { note: 'Safe GPIO (often PSRAM-free).' }),
        P(17, { note: 'Safe GPIO.' }),
        P(18, { note: 'VSPI SCK.' }),
        P(19, { note: 'VSPI MISO.' }),
        P(21, { note: 'I2C SDA default.' }),
        P(22, { note: 'I2C SCL default.' }),
        P(23, { note: 'VSPI MOSI.' }),
        P(25, { adc: true, note: 'DAC1 + ADC2. Safe.' }),
        P(26, { adc: true, note: 'DAC2 + ADC2. Safe.' }),
        P(27, { adc: true, note: 'Safe GPIO + ADC2.' }),
        P(32, { adc: true, note: 'ADC1 (WiFi-safe). Good sensor pin.' }),
        P(33, { adc: true, note: 'ADC1 (WiFi-safe). Good sensor pin.' }),
        P(34, { adc: true, inputOnly: true, pwm: false, note: 'Input-only, no pull-up/down. ADC1. Good for LDR/analog.' }),
        P(35, { adc: true, inputOnly: true, pwm: false, note: 'Input-only. ADC1.' }),
        P(36, { adc: true, inputOnly: true, pwm: false, note: 'VP. Input-only. ADC1.' }),
        P(39, { adc: true, inputOnly: true, pwm: false, note: 'VN. Input-only. ADC1.' })
      ],
      unavailable: [6, 7, 8, 9, 10, 11],
      unavailableReason: 'GPIO6-11 reserved for internal SPI flash. Using them crashes firmware.'
    },
    nodemcu_32s: {
      id: 'nodemcu_32s', name: 'NodeMCU-32S', chip: 'ESP32-WROOM-32 (Xtensa LX6 dual-core 240MHz)',
      family: 'ESP32', framework: 'Arduino C++ (arduino-esp32)', fqbn: 'esp32:esp32:nodemcu-32s',
      corePackage: 'esp32:esp32', voltage: '3.3V logic / 5V USB in',
      onboardLed: { gpio: 2, activeHigh: true, note: 'Blue LED on GPIO2.' },
      usbUart: ['CP2102', 'CH340'], defaultBaud: 115200, adcResolution: 12, adcMax: 4095,
      i2c: { sda: 21, scl: 22 }, spi: { ss: 5, mosi: 23, miso: 19, sck: 18 }, uart0: { tx: 1, rx: 3 },
      pins: null, // alias of esp32_devkit_v1 — resolved at load
      unavailable: [6, 7, 8, 9, 10, 11], unavailableReason: 'SPI flash reserved.'
    },
    esp32s2_dev: {
      id: 'esp32s2_dev', name: 'ESP32-S2 Dev Module', chip: 'ESP32-S2 (Xtensa LX7 single-core 240MHz)',
      family: 'ESP32-S2', framework: 'Arduino C++ (arduino-esp32)', fqbn: 'esp32:esp32:esp32s2',
      corePackage: 'esp32:esp32', voltage: '3.3V logic, native USB',
      onboardLed: { gpio: 15, activeHigh: true, note: 'Varies by vendor (Saola uses GPIO15). Verify board silkscreen.' },
      usbUart: ['native USB', 'CP2102'], defaultBaud: 115200, adcResolution: 13, adcMax: 8191,
      i2c: { sda: 8, scl: 9 }, spi: { ss: 38, mosi: 37, miso: 35, sck: 36 }, uart0: { tx: 43, rx: 44 },
      pins: [
        P(0,  { strapping: true, note: 'BOOT strapping. Hold LOW for download mode.' }),
        P(1,  { adc: true }), P(2, { adc: true }), P(3, { adc: true }), P(4, { adc: true }),
        P(5,  { adc: true }), P(6, { adc: true }), P(7, { adc: true }), P(8, { adc: true }),
        P(9,  { adc: true }), P(10, { adc: true }), P(11, { adc: true }), P(12, { adc: true }),
        P(13, { adc: true }), P(14, { adc: true }), P(15, { adc: true }), P(16, { adc: true }),
        P(17, { adc: true }), P(18, { adc: true }), P(19, { adc: true }), P(20, { adc: true }),
        P(21, { note: 'Safe GPIO.' }),
        P(26, { note: 'SPI flash / PSRAM on many modules — avoid.' }),
        P(27, {}), P(28, {}), P(29, {}), P(30, {}), P(31, {}), P(32, {}),
        P(33, { note: 'Octal flash/SPIM.' }), P(34, {}), P(35, {}), P(37, {}), P(38, {}), P(39, {}), P(40, {}),
        P(41, {}), P(42, {}), P(43, { usb: true, note: 'USB D+ / UART TX.' }), P(44, { usb: true, note: 'USB D- / UART RX.' }),
        P(45, { strapping: true, note: 'Strapping (VDD_SPI voltage). Do not pull.' }),
        P(46, { strapping: true, inputOnly: true, pwm: false, note: 'Strapping + input-only.' })
      ],
      unavailable: [], unavailableReason: ''
    },
    esp32s3_dev: {
      id: 'esp32s3_dev', name: 'ESP32-S3 Dev Module', chip: 'ESP32-S3 (Xtensa LX7 dual-core 240MHz)',
      family: 'ESP32-S3', framework: 'Arduino C++ (arduino-esp32)', fqbn: 'esp32:esp32:esp32s3',
      corePackage: 'esp32:esp32', voltage: '3.3V logic, native USB OTG',
      onboardLed: { gpio: 48, activeHigh: true, note: 'Many DevKitC-1 boards use addressable RGB on GPIO48 (neopixel). Some use GPIO38.' },
      usbUart: ['native USB', 'CH343', 'CP2102'], defaultBaud: 115200, adcResolution: 12, adcMax: 4095,
      i2c: { sda: 8, scl: 9 }, spi: { ss: 10, mosi: 11, miso: 13, sck: 12 }, uart0: { tx: 43, rx: 44 },
      pins: [
        P(0,  { strapping: true, note: 'BOOT strapping.' }),
        P(1,  { adc: true }), P(2, { adc: true }), P(3, { adc: true, strapping: true }),
        P(4,  { adc: true }), P(5, { adc: true }), P(6, { adc: true }), P(7, { adc: true }),
        P(8,  { adc: true }), P(9, { adc: true }), P(10, { adc: true }), P(11, {}), P(12, {}),
        P(13, {}), P(14, { adc: true }), P(15, { adc: true }), P(16, { adc: true }), P(17, { adc: true }),
        P(18, { adc: true }), P(19, { usb: true, note: 'USB D-.' }), P(20, { usb: true, note: 'USB D+.' }),
        P(21, {}),
        P(26, { note: 'SPI flash/PSRAM — avoid.' }), P(27, {}), P(28, {}), P(29, {}), P(30, {}), P(31, {}), P(32, {}),
        P(33, {}), P(34, {}), P(35, {}), P(36, {}), P(37, {}), P(38, {}), P(39, {}), P(40, {}), P(41, {}), P(42, {}),
        P(43, { note: 'UART0 TX.' }), P(44, { note: 'UART0 RX.' }),
        P(45, { strapping: true, note: 'Strapping (VDD_SPI + JTAG).' }),
        P(46, { strapping: true, note: 'Strapping.' }),
        P(47, {}), P(48, { note: 'Onboard RGB LED on many boards.' })
      ],
      unavailable: [], unavailableReason: ''
    },
    esp32c3_dev: {
      id: 'esp32c3_dev', name: 'ESP32-C3 Dev Module', chip: 'ESP32-C3 (RISC-V single-core 160MHz)',
      family: 'ESP32-C3', framework: 'Arduino C++ (arduino-esp32)', fqbn: 'esp32:esp32:esp32c3',
      corePackage: 'esp32:esp32', voltage: '3.3V logic, USB-Serial-JTAG',
      onboardLed: { gpio: 8, activeHigh: true, note: 'Many C3 boards: RGB LED on GPIO8 or discrete LED on GPIO7. Verify variant.' },
      usbUart: ['USB-Serial-JTAG (built-in)'], defaultBaud: 115200, adcResolution: 12, adcMax: 4095,
      i2c: { sda: 4, scl: 5 }, spi: { ss: 7, mosi: 6, miso: 2, sck: 4 }, uart0: { tx: 21, rx: 20 },
      pins: [
        P(0,  { adc: true, note: 'ADC1_CH0.' }),
        P(1,  { adc: true, note: 'ADC1_CH1.' }),
        P(2,  { adc: true, strapping: true, note: 'ADC1_CH2 + strapping (boot mode).' }),
        P(3,  { adc: true, note: 'ADC1_CH3.' }),
        P(4,  { adc: true, note: 'ADC1_CH4. I2C SCL/SPI SCK default.' }),
        P(5,  { note: 'I2C SCL default.' }),
        P(6,  { note: 'SPI MOSI.' }),
        P(7,  { note: 'SPI SS. Often onboard LED.' }),
        P(8,  { strapping: true, note: 'Strapping + RGB LED on many boards.' }),
        P(9,  { strapping: true, note: 'Strapping (BOOT button).' }),
        P(10, { note: 'SPI SS alt.' }),
        P(18, { usb: true, note: 'USB D-.' }), P(19, { usb: true, note: 'USB D+.' }),
        P(20, { note: 'UART RX.' }), P(21, { note: 'UART TX.' })
      ],
      unavailable: [11, 12, 13, 14, 15, 16, 17],
      unavailableReason: 'GPIO11-17 reserved for internal SPI flash on ESP32-C3.'
    },
    esp8266_nodemcu: {
      id: 'esp8266_nodemcu', name: 'ESP8266 NodeMCU (ESP-12E)', chip: 'ESP8266EX (Tensilica L106 80/160MHz)',
      family: 'ESP8266', framework: 'Arduino C++ (ESP8266 core)', fqbn: 'esp8266:esp8266:nodemcuv2',
      corePackage: 'esp8266:esp8266', voltage: '3.3V logic / 5V USB in. A0 max 3.3V via divider (1.0V at chip).',
      onboardLed: { gpio: 2, activeHigh: false, note: 'NodeMCU blue LED on GPIO2/D4, ACTIVE-LOW. Amica D0 LED on GPIO16.' },
      usbUart: ['CP2102', 'CH340'], defaultBaud: 115200, adcResolution: 10, adcMax: 1023,
      i2c: { sda: 4, scl: 5 }, spi: { ss: 15, mosi: 13, miso: 12, sck: 14 }, uart0: { tx: 1, rx: 3 },
      dPinMap: { D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15, RX: 3, TX: 1, A0: 'A0' },
      pins: [
        P(0,  { strapping: true, note: 'D3 + BOOT strapping + FLASH button. Must be HIGH at boot. No pull-down.' }),
        P(1,  { note: 'TX0. Avoid (flashing/debug).' }),
        P(2,  { strapping: true, note: 'D4 + onboard LED (active LOW). Must be HIGH at boot.' }),
        P(3,  { note: 'RX0. Avoid (flashing/debug).' }),
        P(4,  { note: 'D2 + I2C SDA. Safe default.' }),
        P(5,  { note: 'D1 + I2C SCL. Safe default.' }),
        P(12, { note: 'D6 + SPI MISO. Safe after boot.' }),
        P(13, { note: 'D7 + SPI MOSI. Safe.' }),
        P(14, { note: 'D5 + SPI SCK. Safe.' }),
        P(15, { strapping: true, note: 'D8 + SPI SS + BOOT strapping. Must be LOW at boot (has pull-down).' }),
        P(16, { pwm: false, note: 'D0. No PWM/interrupt/I2C. HIGH at boot; used for deepSleep wake. Onboard LED on some.' })
      ],
      analogPins: ['A0'],
      analogNote: 'Single ADC A0, 10-bit (0-1023). 0-1V at chip, NodeMCU divider allows 0-3.3V.',
      unavailable: [6, 7, 8, 9, 10, 11],
      unavailableReason: 'GPIO6-11 reserved for internal flash. Not broken out on NodeMCU.'
    }
  };

  // NodeMCU-32S aliases ESP32 DevKit pin table
  PROFILES.nodemcu_32s.pins = PROFILES.esp32_devkit_v1.pins;
  PROFILES.nodemcu_32s.onboardLed = { gpio: 2, activeHigh: true, note: 'Blue LED on GPIO2.' };

  function getProfile(id) { return PROFILES[id] || null; }
  function listProfiles() {
    return Object.keys(PROFILES).map(function (k) {
      var p = PROFILES[k];
      return { id: p.id, name: p.name, chip: p.chip, family: p.family, fqbn: p.fqbn, corePackage: p.corePackage };
    });
  }
  function pinEntry(profileId, gpio) {
    var p = getProfile(profileId); if (!p || !p.pins) return null;
    gpio = parseInt(gpio, 10);
    for (var i = 0; i < p.pins.length; i++) if (p.pins[i].gpio === gpio) return p.pins[i];
    return null;
  }

  return { PROFILES: PROFILES, getProfile: getProfile, listProfiles: listProfiles, pinEntry: pinEntry };
}));
