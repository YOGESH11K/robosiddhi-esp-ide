/**
 * First-run toolchain check (Node).
 * Usage: node scripts/setup_esp.js [--install]
 * Checks arduino-cli, installed cores, required libs. Never auto-installs unless --install.
 */
'use strict';
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const COMPILER_DIR = path.join(__dirname, '..', 'compiler');
const CLI = path.join(COMPILER_DIR, 'arduino-cli.exe');
const INSTALL = process.argv.includes('--install');

function run(cmd, opts) {
  try { return execSync(cmd, Object.assign({ encoding: 'utf8', timeout: 60000 }, opts)).toString(); }
  catch (e) { return (e.stdout || '') + '\n' + (e.stderr || e.message); }
}
function main() {
  console.log('RoboSiddhi ESP toolchain check');
  console.log('CLI: ' + CLI);
  if (!fs.existsSync(CLI)) { console.error('MISSING ' + CLI); process.exit(1); }
  console.log(run('"' + CLI + '" version', { cwd: COMPILER_DIR }).trim());
  // NOTE: arduino-cli ignores compiler/arduino-cli.yaml unless --config-file is passed;
  // the ACTIVE config is %LOCALAPPDATA%/Arduino15/arduino-cli.yaml (global).
  // Ensure ESP8266 URL is present there so `core install esp8266:esp8266` works.
  console.log('--- active config board URLs ---');
  console.log(run('"' + CLI + '" config dump', { cwd: COMPILER_DIR }).split('\n').filter(l => /additional|esp8266|esp32/i.test(l)).join('\n'));
  try { run('"' + CLI + '" config add board_manager.additional_urls https://arduino.esp8266.com/stable/package_esp8266com_index.json', { cwd: COMPILER_DIR }); }
  catch (e) {}
  console.log('--- cores ---');
  console.log(run('"' + CLI + '" core list', { cwd: COMPILER_DIR }));
  const needed = ['esp32:esp32', 'esp8266:esp8266'];
  if (INSTALL) {
    needed.forEach(c => { console.log('install ' + c); console.log(run('"' + CLI + '" core install ' + c, { cwd: COMPILER_DIR })); });
    ['DHT sensor library', 'Adafruit Unified Sensor', 'OneWire', 'DallasTemperature'].forEach(l => {
      console.log('lib install ' + l); console.log(run('"' + CLI + '" lib install "' + l + '"', { cwd: COMPILER_DIR }));
    });
  } else {
    console.log('Required cores: ' + needed.join(', '));
    console.log('Required libs: DHT sensor library, Adafruit Unified Sensor, OneWire, DallasTemperature');
    console.log('Re-run with --install (needs internet) to install missing packages.');
  }
}
main();
