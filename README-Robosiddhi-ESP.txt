RoboSiddhi ESP IDE - portable (no install needed)
================================================
RUN: double-click "Robosiddhi esp ide.exe"

FIRST TIME ONLY (needs internet once):
1. Install USB driver for your board (CP210x or CH340/CH341).
2. In the app: board = ESP32 Dev Module (or your ESP board), port = COM port.
3. If compile asks for a missing core: settings (gear icon) -> CLI panel ->
   type "esp32:esp32" (or "esp8266:esp8266") in install-board box -> download icon.
4. If a library is missing (.h error): same panel -> install-lib box.

USE: Load XML (menu -> Load) or drag blocks -> Upload -> green success ->
unplug/replug USB (or press RST) -> program runs.

Folder contents: exe + compiler/ (arduino-cli + board files). Nothing else needed.
Cores and libraries live in Windows AppData after first install, then fully offline.
