/**
 * @license
 * Copyright 2020 Sébastien CANET
 * SPDX-License-Identifier: GPL-3.0
 */

/**
 * @fileoverview Modules to control application life and create native browser window.
 * @author scanet@libreduc.cc (Sébastien CANET)
 */
 
const {
    app,
    BrowserWindow,
    electron,
    ipcMain,
    globalShortcut,
    dialog,
    Tray,
    webContents
} = require('electron');
const path = require('path');
const { execFile } = require('child_process');
// Explicit taskbar identity: without this, Windows groups the app under a
// generic Electron AppUserModelID and shows the Electron logo on taskbar pins.
try { app.setAppUserModelId('com.robosiddhi.app'); } catch (e) {}
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
let RoboSiddhiBuild = null;
try { RoboSiddhiBuild = require('./www/blocklyduino/js/robosiddhi_build.js'); } catch (e) { RoboSiddhiBuild = null; }

// ---- RoboSiddhi secure backend (all renderer Node/exec/serial goes through here) ----
// Writable + executable locations differ between dev and packaged app:
// - dev: everything next to this file
// - packaged: compiler/ ships via extraFiles next to the exe (outside app.asar,
//   always executable); sketch/tmp go to userData (install dir may be read-only).
// NOTE: resolved lazily (inside handlers) so app.getPath is only called after ready.
const DEV_MODE = !app.isPackaged;
function cliExePath() {
    if (DEV_MODE) return path.join(__dirname, 'compiler', 'arduino-cli.exe');
    // Packaged: compiler/ ships via extraFiles next to the exe (outside app.asar),
    // so it runs directly. (extraFiles are excluded from the asar, hence no asarUnpack.)
    return path.join(path.dirname(app.getPath('exe')), 'compiler', 'arduino-cli.exe');
}
function sketchDirPath() {
    if (DEV_MODE) return path.join(__dirname, 'compiler', 'tmp');
    return path.join(app.getPath('userData'), 'sketch');
}
function sketchFilePath() {
    // Arduino REQUIRES <sketchdir>/<sketchdir>.ino name match, else
    // "Can't open sketch: main file missing" (misdiagnosed as missing core before).
    if (DEV_MODE) return path.join(sketchDirPath(), 'tmp.ino'); // dir tmp/
    return path.join(sketchDirPath(), 'sketch.ino'); // dir sketch/
}
function repoTmpPath() {
    if (DEV_MODE) return path.join(__dirname, 'tmp');
    return path.join(app.getPath('userData'), 'tmp');
}
// Persistent per-board build dir: arduino-cli reuses object files here,
// so repeat compile drops 40s -> ~11s. OS temp would rebuild from scratch.
function buildDirPath(fqbn) {
    const safe = String(fqbn || 'unknown').replace(/[^A-Za-z0-9]+/g, '_');
    if (DEV_MODE) return path.join(__dirname, 'compiler', 'build', safe);
    return path.join(app.getPath('userData'), 'build', safe);
}
function sketchHash() {
    try {
        const crypto = require('crypto');
        const code = fs.readFileSync(sketchFilePath());
        return crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
    } catch (e) { return null; }
}
function hashFilePath(fqbn) { return path.join(buildDirPath(fqbn), 'sketch.hash'); }
function buildHasBin(fqbn) {
    try {
        const dir = buildDirPath(fqbn);
        if (!fs.existsSync(dir)) return false;
        return fs.readdirSync(dir).some(f => f.endsWith('.bin'));
    } catch (e) { return false; }
}
const PORT_RE = /^(COM\d+|\/dev\/tty[A-Za-z0-9._-]+)$/;
const CORE_RE = /^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/;
const LIB_RE = /^[A-Za-z0-9 _+.\-@]+$/;
const BAUDS = [300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 31250, 38400, 57600, 115200, 74880, 230400, 460800, 921600];

function runCli(args, timeoutMs) {
    return new Promise((resolve) => {
        const exe = cliExePath();
        execFile(exe, args, { cwd: path.dirname(exe), timeout: timeoutMs || 300000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error && !stdout && !stderr) stderr = String((error && error.message) || error);
            resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}
function validFqbn(fqbn) {
    return typeof fqbn === 'string' && fqbn !== 'none' && /^(esp32:esp32:[A-Za-z0-9_.-]+|esp8266:esp8266:[A-Za-z0-9_.-]+)$/.test(fqbn);
}

// Single active serial-monitor connection (owned by the monitor window)
let monPort = null, monParser = null, monWcId = null;
function closeMonitorPort() {
    try { if (monParser) monParser.removeAllListeners(); } catch (e) {}
    try { if (monPort && monPort.isOpen) monPort.close(() => {}); } catch (e) {}
    monPort = null; monParser = null; monWcId = null;
}

let BlocklyWindow = null;
let SerialWindow = null;
let FactoryWindow = null;
let devtools = null;
let tray = null;
//for settings file or argument from Arrowhead
const fs = require('fs-extra');
var fileSettings = "./STudio4Education.json";
var papyrusSettings = "./PapyrusST4Econfig.json";
var Settings = '';

function createBlocklyWindow() {
    let BlocklyWindow = new BrowserWindow({
        width: 1510,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        // icon: __dirname + '/www/blocklyduino/media/icon.ico'
        icon: __dirname + '/www/blocklyduino/media/icon.ico'
    });
    // var url = '/www/index.html';
    var url = '/www/index.html';
    // if (process.platform === 'win32' && process.argv.length >= 2) {    
        // url = url + process.argv[1];
    // }
    // if (!fs.existsSync(fileSettings)) {
        // console.log("File not found");
        // fs.writeFileSync(fileSettings, '', (err) => {
            // if (err) console.log("An error ocurred creating the file " + err.message);
                // else console.log("The file has been succesfully saved");
            // })
    // } else {
        // Settings = fs.readFileSync(fileSettings, 'utf8', (err, Settings) => {
            // if (err) {
                // console.log("An error occured reading the file :" + err.message);
                // Settings = "";
                // return
            // }
            // console.log("The file Settings is : " + Settings);
        // })
    // }
    url = `file://${__dirname}` + url;
    if (!fs.existsSync(papyrusSettings)) {
        console.log("File not found");
        BlocklyWindow.loadURL(url);
    } else {
        Settings = fs.readFileSync(papyrusSettings, 'utf8', (err, Settings) => {
            if (err) {
                console.log("An error occured reading the file :" + err.message);
                Settings = "";
                return;
            }
            console.log("The file Settings is : " + Settings);
        })
        var idsCategories = JSON.parse(Settings);
        var toolboxidsList = "";
        for (let i = 0; i < idsCategories.components.length; i++)
            toolboxidsList += idsCategories.components[i].id + ',';
        toolboxidsList = toolboxidsList.slice(0, -1);
        if (idsCategories.arguments) {
            url += '?' + idsCategories.arguments;
            if (toolboxidsList) url += '&toolboxids=' + toolboxidsList;
        }
        else if (toolboxidsList) url += '?toolboxids=' + toolboxidsList;
        BlocklyWindow.loadURL(url);
    }
	
        // BlocklyWindow.loadURL(`file://${__dirname}` + url + '?' + idsCategories.arguments + '&toolboxids=' + idsCategories.components[0].id + ',' + idsCategories.components[1].id);
        // fs.writeFileSync(fileSettings, `file://${__dirname}` + url + '?' + idsCategories.arguments + '&toolboxids=' + idsCategories.components[0].id + ',' + idsCategories.components[1].id);
    BlocklyWindow.setMenu(null);
    BlocklyWindow.on('closed', function () {
        BlocklyWindow = null;
    });
    // devtools = new BrowserWindow();
    // BlocklyWindow.webContents.setDevToolsWebContents(devtools.webContents);
    // BlocklyWindow.webContents.openDevTools({
        // mode: 'detach'
    // });
};

function createSerialWindow(argLangChoice) {
    SerialWindow = new BrowserWindow({
        width: 640,
        height: 530,
        'parent': BlocklyWindow,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        resizable: false,
        // icon: __dirname + '/src/icon.ico'
        icon: __dirname + '/www/blocklyduino/media/icon.ico'
    });
    // var url = '/nodejs/serialMonitor.html';
    var url = '/nodejs/serialMonitor.html';
    if (argLangChoice !== "" || argLangChoice !== "undefined")
        url = url + '?lang=' + argLangChoice;
    SerialWindow.loadURL(`file://${__dirname}` + url);
    SerialWindow.setMenu(null);
    SerialWindow.on('closed', function () {
        try { closeMonitorPort(); } catch (e) {}
        SerialWindow = null;
    });
    // devtools = new BrowserWindow();
    // SerialWindow.webContents.setDevToolsWebContents(devtools.webContents);
    // SerialWindow.webContents.openDevTools({
        // mode: 'detach'
    // });
};

function createHackCableWindow(argLangChoice) {
    HackCableWindow = new BrowserWindow({
        width: 1066,
        height: 640,
        'parent': BlocklyWindow,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        resizable: true,
        icon: __dirname + '/www/blocklyduino/media/icon.ico'
    });
    var url = '/www/tools/hackcable/index.html';
    if (argLangChoice !== "" || argLangChoice !== "undefined")
        url = url + '?lang=' + argLangChoice;
    HackCableWindow.loadURL(`file://${__dirname}` + url);
    HackCableWindow.setMenu(null);
    HackCableWindow.on('closed', function () {
        HackCableWindow = null;
    });
};

function createFactoryWindow(argLangChoice) {
    FactoryWindow = new BrowserWindow({
        width: 1066,
        height: 640,
        'parent': BlocklyWindow,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        resizable: true,
        icon: __dirname + '/www/blocklyduino/media/icon.ico'
    });
    var url = '/www/tools/blockFactory/blockFactory.html';
    if (argLangChoice !== "" || argLangChoice !== "undefined")
        url = url + '?lang=' + argLangChoice;
    FactoryWindow.loadURL(`file://${__dirname}` + url);
    FactoryWindow.setMenu(null);
    FactoryWindow.on('closed', function () {
        FactoryWindow = null;
    });
};

function createBlocklyHtmlWindow(argLangChoice) {
    BlocklyHtmlWindow = new BrowserWindow({
        width: 1066,
        height: 640,
        'parent': BlocklyWindow,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        resizable: true,
        icon: __dirname + '/www/blocklyduino/media/icon.ico'
    });
    var url = '/www/tools/html/html_factory.html';
    if (argLangChoice !== "" || argLangChoice !== "undefined")
        url = url + '?lang=' + argLangChoice;
    BlocklyHtmlWindow.loadURL(`file://${__dirname}` + url);
    BlocklyHtmlWindow.setMenu(null);
    BlocklyHtmlWindow.on('closed', function () {
        BlocklyHtmlWindow = null;
    });
};

function openDevTools(BlocklyWindow = BrowserWindow.getFocusedWindow()) {
    if (BlocklyWindow) {
        BlocklyWindow.webContents.toggleDevTools();
    }
};

function refresh(BlocklyWindow = BrowserWindow.getFocusedWindow()) {
    BlocklyWindow.webContents.reloadIgnoringCache();
};
//need to be deleted at next serialport upgrade > 9.0.0
//app.allowRendererProcessReuse = false; (removed in Electron 20+, no longer supported)

app.on('ready', () => {
    createBlocklyWindow();
    globalShortcut.register('F8', openDevTools);
    globalShortcut.register('F5', refresh);
    tray = new Tray(path.join(__dirname, 'www', 'blocklyduino', 'media', 'logo_only.png'));
    tray.setToolTip('RoboSiddhi ESP IDE');
});

app.on('activate', function () {
    if (BlocklyWindow === null)
        createBlocklyWindow();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin')
        app.quit();
});

// Echo renderer console to the terminal for diagnostics (launch verification, user support)
app.on('browser-window-created', (_e, win) => {
    try {
        win.webContents.on('console-message', (_ev, _level, message) => {
            console.log('[renderer]', message);
        });
    } catch (e) {}
});

// ---- Validated IPC: the ONLY privileged surface exposed to renderers (see preload.js) ----
ipcMain.handle('rs-ports', async () => {
    const ports = await SerialPort.list();
    return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer || '', vendorId: p.vendorId || '', productId: p.productId || '' }));
});

ipcMain.handle('rs-write-sketch', async (_e, code) => {
    if (typeof code !== 'string' || code.length > 500000) throw new Error('Sketch rejected (not text or too large).');
    fs.ensureDirSync(sketchDirPath());
    // Drop stale tmp.ino left by older builds: Arduino compiles every .ino in the
    // sketch dir, so a leftover would cause "redefinition" compile errors.
    try { fs.removeSync(path.join(sketchDirPath(), 'tmp.ino')); } catch (e) {}
    fs.writeFileSync(sketchFilePath(), code);
    return { ok: true };
});

ipcMain.handle('rs-compile', async (_e, args) => {
    args = args || {};
    if (!validFqbn(args.fqbn)) throw new Error('Select an ESP board first.');
    fs.ensureDirSync(buildDirPath(args.fqbn));
    const cmd = ['compile', '-j', '0'];
    if (args.verbose) cmd.push('-v');
    cmd.push('-b', args.fqbn, '--build-path', buildDirPath(args.fqbn), sketchDirPath());
    const r = await runCli(cmd);
    if (r.ok) { try { fs.writeFileSync(hashFilePath(args.fqbn), sketchHash() || ''); } catch (e) {} }
    return r;
});

ipcMain.handle('rs-upload', async (_e, args) => {
    args = args || {};
    if (!validFqbn(args.fqbn)) throw new Error('Select an ESP board first.');
    if (typeof args.port !== 'string' || !PORT_RE.test(args.port)) throw new Error('Select a valid serial port first.');
    fs.ensureDirSync(buildDirPath(args.fqbn));
    // FAST PATH: same code + same board + binary exists -> skip 40s recompile,
    // upload cached .bin directly (~upload time only). Hash guard keeps the
    // old stale-flash bug fixed: any code change forces a fresh compile first.
    const curHash = sketchHash();
    let lastHash = null;
    try { lastHash = fs.readFileSync(hashFilePath(args.fqbn), 'utf8'); } catch (e) {}
    let c = null;
    if (curHash && lastHash === curHash && buildHasBin(args.fqbn)) {
        c = { ok: true, stdout: 'SKIPPED recompile (code unchanged) - flashing cached build.\n', stderr: '' };
    } else {
        const cargs = ['compile', '-j', '0'];
        if (args.verbose) cargs.push('-v');
        cargs.push('-b', args.fqbn, '--build-path', buildDirPath(args.fqbn), sketchDirPath());
        c = await runCli(cargs);
        if (!c.ok) return { ok: false, stdout: c.stdout, stderr: 'COMPILE FAILED - nothing was uploaded. Fix the error above.\n' + c.stderr, phase: 'compile' };
        try { fs.writeFileSync(hashFilePath(args.fqbn), curHash || ''); } catch (e) {}
    }
    const uargs = ['upload', '-p', args.port];
    if (args.verbose) uargs.push('-v');
    uargs.push('-b', args.fqbn, '--input-dir', buildDirPath(args.fqbn), sketchDirPath());
    const u = await runCli(uargs);
    return { ok: u.ok, stdout: c.stdout + '\n' + u.stdout, stderr: u.stderr, phase: 'upload' };
});

ipcMain.handle('rs-cli', async (_e, req) => {
    req = req || {};
    if (req.op === 'update-index') return runCli(['core', 'update-index'], 180000);
    if (req.op === 'board-list') return runCli(['board', 'list'], 60000);
    if (req.op === 'clean-cache') { fs.emptyDirSync(repoTmpPath()); fs.ensureDirSync(sketchDirPath()); return { ok: true, stdout: 'cache cleaned', stderr: '' }; }
    if (req.op === 'core-install' && typeof req.arg === 'string' && CORE_RE.test(req.arg.trim())) {
        return runCli(['core', 'install', req.arg.trim()], 600000);
    }
    if (req.op === 'lib-search' && typeof req.arg === 'string' && LIB_RE.test(req.arg.trim())) {
        return runCli(['lib', 'search', req.arg.trim()], 120000);
    }
    if (req.op === 'lib-install' && typeof req.arg === 'string' && LIB_RE.test(req.arg.trim())) {
        return runCli(['lib', 'install', req.arg.trim()], 600000);
    }
    throw new Error('CLI request rejected (unknown op or unsafe argument).');
});

ipcMain.on('rs-open-tool', (event, req) => {
    req = req || {};
    const lang = typeof req.lang === 'string' ? req.lang : 'en';
    if (req.tool === 'serial') createSerialWindow(lang);
    else if (req.tool === 'hackcable') createHackCableWindow(lang);
    else if (req.tool === 'factory') createFactoryWindow(lang);
    else if (req.tool === 'html') createBlocklyHtmlWindow(lang);
});

ipcMain.handle('rs-mon-open', async (event, req) => {
    req = req || {};
    if (typeof req.port !== 'string' || !PORT_RE.test(req.port)) throw new Error('Select a valid serial port first.');
    const baud = parseInt(req.baud, 10);
    if (!BAUDS.includes(baud)) throw new Error('Unsupported baud rate.');
    closeMonitorPort();
    monWcId = event.sender.id;
    monPort = new SerialPort({ path: req.port, baudRate: baud, autoOpen: false });
    monParser = monPort.pipe(new ReadlineParser({ delimiter: '\n' }));
    monParser.on('data', (line) => {
        try {
            const wc = webContents.fromId(monWcId);
            if (wc && !wc.isDestroyed()) wc.send('rs-mon-data', String(line));
        } catch (e) {}
    });
    monPort.on('error', (err) => {
        try {
            const wc = webContents.fromId(monWcId);
            if (wc && !wc.isDestroyed()) wc.send('rs-mon-event', 'port error: ' + (err && err.message));
        } catch (e) {}
    });
    await new Promise((resolve, reject) => { monPort.open((err) => { if (err) reject(err); else resolve(); }); });
    return { ok: true };
});

ipcMain.handle('rs-mon-close', async () => { closeMonitorPort(); return { ok: true }; });

ipcMain.on('rs-mon-write', (_e, data) => {
    try { if (monPort && monPort.isOpen) monPort.write(String(data)); } catch (e) {}
});

ipcMain.handle('rs-save-text', async (event, req) => {
    req = req || {};
    const text = typeof req.text === 'string' ? req.text : '';
    if (text.length > 5000000) throw new Error('Content too large to save.');
    let win = null;
    try { win = BrowserWindow.fromWebContents(event.sender); } catch (e) {}
    const res = await dialog.showSaveDialog(win || null, {
        title: 'Save', defaultPath: req.defaultName || 'robosiddhi.csv',
        filters: [{ name: 'data', extensions: ['csv', 'txt', 'log'] }]
    });
    if (res.canceled || !res.filePath) return { saved: false };
    fs.writeFileSync(res.filePath, text);
    return { saved: true, path: res.filePath };
});
module.exports.openDevTools = openDevTools;
module.exports.refresh = refresh;
