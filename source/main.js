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
let RSRuntime = null;
try { RSRuntime = require('./www/blocklyduino/js/robosiddhi_runtime.js'); } catch (e) { RSRuntime = null; }

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
function sketchDirPath(sketch) {
    if (sketch === 'runtime') {
        // Runtime sources ship OUTSIDE the asar (see package.json extraFiles),
        // next to the exe — the asar path is read-only and has no runtime/.
        if (DEV_MODE) return path.join(__dirname, 'runtime', 'RoboSiddhiRuntime');
        return path.join(path.dirname(app.getPath('exe')), 'runtime', 'RoboSiddhiRuntime');
    }
    if (DEV_MODE) return path.join(__dirname, 'compiler', 'tmp');
    return path.join(app.getPath('userData'), 'sketch');
}
function sketchFilePath(sketch) {
    // Arduino REQUIRES <sketchdir>/<sketchdir>.ino name match, else
    // "Can't open sketch: main file missing" (misdiagnosed as missing core before).
    if (sketch === 'runtime') return path.join(sketchDirPath('runtime'), 'RoboSiddhiRuntime.ino');
    if (DEV_MODE) return path.join(sketchDirPath(), 'tmp.ino'); // dir tmp/
    return path.join(sketchDirPath(), 'sketch.ino'); // dir sketch/
}
function repoTmpPath() {
    if (DEV_MODE) return path.join(__dirname, 'tmp');
    return path.join(app.getPath('userData'), 'tmp');
}
// Persistent per-board build dir: arduino-cli reuses object files here,
// so repeat compile drops 40s -> ~11s. OS temp would rebuild from scratch.
function buildDirPath(fqbn, sketch) {
    const safe = String(fqbn || 'unknown').replace(/[^A-Za-z0-9]+/g, '_') + (sketch === 'runtime' ? '_rt' : '');
    if (DEV_MODE) return path.join(__dirname, 'compiler', 'build', safe);
    return path.join(app.getPath('userData'), 'build', safe);
}
function sketchHash(file) {
    try {
        const crypto = require('crypto');
        const code = fs.readFileSync(file || sketchFilePath());
        return crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
    } catch (e) { return null; }
}
function hashFilePath(fqbn, sketch) { return path.join(buildDirPath(fqbn, sketch), 'sketch.hash'); }
// ---- Persistent firmware cache (CACHE_SCHEMA 2, see robosiddhi_build.js) ----
// cache.json lives next to the binaries in the per-board build dir and records
// every input that affects the firmware: code hash, board, core + CLI versions,
// build flags. A cached binary is flashed ONLY if all of them still match.
function cacheMetaPath(fqbn, sketch) { return path.join(buildDirPath(fqbn, sketch), 'cache.json'); }
function readCacheMeta(fqbn, sketch) {
    try { return JSON.parse(fs.readFileSync(cacheMetaPath(fqbn, sketch), 'utf8')); } catch (e) { return null; }
}
function writeCacheMeta(fqbn, sketch, meta) {
    try { fs.ensureDirSync(buildDirPath(fqbn, sketch)); fs.writeFileSync(cacheMetaPath(fqbn, sketch), JSON.stringify(meta, null, 1)); } catch (e) {}
}
function sha256File(file) {
    try {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    } catch (e) { return null; }
}
// Main application binary in a --build-path dir: the "<sketch>.ino.bin"
// (not merged/bootloader/partitions helpers). Used for the integrity hash.
function findSketchBin(fqbn, sketch, inoBase) {
    try {
        const dir = buildDirPath(fqbn, sketch);
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ino.bin'));
        const app = files.filter((f) => !/merged|bootloader|partitions/i.test(f));
        // Prefer the binary matching this sketch (user tmp/sketch vs runtime).
        const named = (app.length ? app : files).filter((f) => !inoBase || f.indexOf(inoBase) === 0);
        const pick = named[0] || app[0] || files[0];
        return pick ? path.join(dir, pick) : null;
    } catch (e) { return null; }
}
// 'runtime' sketch = 3 source files: hash them all for the cache key.
function codeHashFor(sketch) {
    if (sketch !== 'runtime') return sketchHash();
    try {
        const crypto = require('crypto');
        const h = crypto.createHash('sha256');
        ['RoboSiddhiRuntime.ino', 'RSProtocol.h', 'RSProgram.h'].forEach((f) => {
            h.update(fs.readFileSync(path.join(sketchDirPath('runtime'), f)));
        });
        return h.digest('hex').slice(0, 16);
    } catch (e) { return null; }
}
let _cliVersion = null;
function cliVersionOnce() {
    if (_cliVersion) return Promise.resolve(_cliVersion);
    return new Promise((resolve) => {
        execFile(cliExePath(), ['version', '--format', 'json'], { timeout: 30000 }, (_e, stdout) => {
            try { _cliVersion = JSON.parse(String(stdout || '')).Version || 'unknown'; }
            catch (e2) { _cliVersion = 'unknown'; }
            resolve(_cliVersion);
        });
    });
}
let _coreVersions = null;
function coreVersionsOnce() {
    if (_coreVersions) return Promise.resolve(_coreVersions);
    return new Promise((resolve) => {
        execFile(cliExePath(), ['core', 'list', '--format', 'json'], { timeout: 60000 }, (_e, stdout) => {
            _coreVersions = {};
            try {
                const j = JSON.parse(String(stdout || ''));
                (j.platforms || []).forEach((p) => { if (p && p.id) _coreVersions[p.id] = p.installed || 'unknown'; });
            } catch (e2) {}
            resolve(_coreVersions);
        });
    });
}
function coreVersionFor(fqbn) {
    const core = (RoboSiddhiBuild && RoboSiddhiBuild.coreForFqbn(fqbn)) || null;
    return coreVersionsOnce().then((m) => (core && m[core]) || 'unknown');
}
// One upload per serial port at a time — a second click while flashing is
// rejected with a clear message instead of corrupting the transfer.
const uploadBusy = new Set();
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
    const sk = (args.sketch === 'runtime') ? 'runtime' : undefined;
    const inoBase = (sk === 'runtime') ? 'RoboSiddhiRuntime' : (DEV_MODE ? 'tmp' : 'sketch');
    fs.ensureDirSync(buildDirPath(args.fqbn, sk));
    if (args.force) { try { fs.emptyDirSync(buildDirPath(args.fqbn, sk)); } catch (e) {} }
    const t0 = Date.now();
    const cmd = ['compile', '-j', '0'];
    if (args.verbose) cmd.push('-v');
    cmd.push('-b', args.fqbn, '--build-path', buildDirPath(args.fqbn, sk), sketchDirPath(sk));
    const r = await runCli(cmd);
    const compileMs = Date.now() - t0;
    if (r.ok) {
        // Record a validated cache entry: binary exists + integrity hash stored.
        // A failed build NEVER writes cache.json (stale-success impossible).
        const codeHash = codeHashFor(sk);
        const bin = findSketchBin(args.fqbn, sk, inoBase);
        const binSha = bin ? sha256File(bin) : null;
        try { fs.writeFileSync(hashFilePath(args.fqbn, sk), codeHash || ''); } catch (e) {}
        if (codeHash && bin && binSha) {
            const [coreV, cliV] = await Promise.all([coreVersionFor(args.fqbn), cliVersionOnce()]);
            writeCacheMeta(args.fqbn, sk, {
                schema: 2, fqbn: args.fqbn, codeHash: codeHash,
                coreVersion: coreV, cliVersion: cliV, flags: '',
                binName: path.basename(bin), binSha256: binSha,
                builtAt: new Date().toISOString(), status: 'ok'
            });
        }
    }
    r.compileMs = compileMs; r.cache = r.ok ? 'miss-compiled' : 'miss-failed';
    return r;
});

ipcMain.handle('rs-upload', async (_e, args) => {
    args = args || {};
    if (!validFqbn(args.fqbn)) throw new Error('Select an ESP board first.');
    if (typeof args.port !== 'string' || !PORT_RE.test(args.port)) throw new Error('Select a valid serial port first.');
    if (uploadBusy.has(args.port)) throw new Error(args.port + ' is already flashing — wait for it to finish.');
    let speed = null;
    if (args.uploadSpeed !== undefined && args.uploadSpeed !== null && args.uploadSpeed !== '' && args.uploadSpeed !== 'default') {
        speed = parseInt(args.uploadSpeed, 10);
        if (!BAUDS.includes(speed)) throw new Error('Unsupported upload speed.');
    }
    const flags = 'baud:' + (speed || 'default');
    const sk = (args.sketch === 'runtime') ? 'runtime' : undefined;
    const inoBase = (sk === 'runtime') ? 'RoboSiddhiRuntime' : (DEV_MODE ? 'tmp' : 'sketch');
    uploadBusy.add(args.port);
    try {
        fs.ensureDirSync(buildDirPath(args.fqbn, sk));
        // The Serial Monitor owns this COM port — flashing while it is open
        // always fails with "port busy", so close it first and say so.
        const monWasOpen = !!(monPort && monPort.isOpen);
        closeMonitorPort();
        const monNote = monWasOpen ? 'Serial monitor closed for flashing.\n' : '';
        const tAll = Date.now();
        // FAST PATH: reuse the cached binary ONLY if every build input matches
        // (code + board + core + toolchain + flags) and the binary verifies.
        // Anything else → full compile. Forced rebuild skips the lookup.
        const curHash = codeHashFor(sk);
        let c = null, cacheState = 'miss-no-entry', compileMs = 0;
        if (!args.force && curHash && RoboSiddhiBuild) {
            const [coreV, cliV] = await Promise.all([coreVersionFor(args.fqbn), cliVersionOnce()]);
            const bin = findSketchBin(args.fqbn, sk, inoBase);
            const verdict = RoboSiddhiBuild.validateCacheEntry(
                readCacheMeta(args.fqbn, sk),
                { fqbn: args.fqbn, codeHash: curHash, coreVersion: coreV, cliVersion: cliV, flags: flags },
                bin ? sha256File(bin) : null);
            cacheState = verdict.ok ? 'hit' : 'miss-' + verdict.reason;
            if (verdict.ok) {
                c = { ok: true, stdout: 'SKIPPED recompile (code unchanged) - flashing cached build.\n', stderr: '' };
            }
        } else if (args.force) { cacheState = 'miss-forced'; }
        if (!c) {
            const t0 = Date.now();
            const cargs = ['compile', '-j', '0'];
            if (args.verbose) cargs.push('-v');
            cargs.push('-b', args.fqbn, '--build-path', buildDirPath(args.fqbn, sk), sketchDirPath(sk));
            c = await runCli(cargs);
            compileMs = Date.now() - t0;
            if (!c.ok) {
                c.phase = 'compile'; c.cache = 'miss-failed'; c.compileMs = compileMs;
                c.stderr = 'COMPILE FAILED - nothing was uploaded. Fix the error above.\n' + c.stderr;
                return c;
            }
            const codeHash = codeHashFor(sk);
            const bin = findSketchBin(args.fqbn, sk, inoBase);
            const binSha = bin ? sha256File(bin) : null;
            try { fs.writeFileSync(hashFilePath(args.fqbn, sk), codeHash || ''); } catch (e) {}
            if (codeHash && bin && binSha) {
                const [coreV, cliV] = await Promise.all([coreVersionFor(args.fqbn), cliVersionOnce()]);
                writeCacheMeta(args.fqbn, sk, {
                    schema: 2, fqbn: args.fqbn, codeHash: codeHash,
                    coreVersion: coreV, cliVersion: cliV, flags: flags,
                    binName: path.basename(bin), binSha256: binSha,
                    builtAt: new Date().toISOString(), status: 'ok'
                });
            }
            cacheState = (cacheState === 'miss-forced') ? 'miss-forced' : 'miss-compiled';
        }
        const t1 = Date.now();
        const uargs = ['upload', '-p', args.port];
        if (args.verbose) uargs.push('-v');
        uargs.push('-b', args.fqbn);
        if (speed) uargs.push('--upload-property', 'upload.speed=' + speed);
        uargs.push('--input-dir', buildDirPath(args.fqbn, sk), sketchDirPath(sk));
        const u = await runCli(uargs);
        const uploadMs = Date.now() - t1;
        return {
            ok: u.ok, stdout: monNote + c.stdout + '\n' + u.stdout, stderr: u.stderr,
            phase: 'upload', cache: cacheState, compileMs: compileMs,
            uploadMs: uploadMs, totalMs: Date.now() - tAll
        };
    } finally {
        uploadBusy.delete(args.port);
    }
});

// ---- RoboSiddhi Runtime channel: talk to flashed runtime firmware ----
// One runtime session per port at a time; never fights an upload or monitor.
const rtBusy = new Set();
function rtWithPort(port, fn, cmdTimeoutMs) {
    return new Promise((resolve, reject) => {
        let buf = '';
        const pending = {};
        let seq = 0;
        const perCmd = cmdTimeoutMs || 5000;
        const sp = new SerialPort({ path: port, baudRate: 115200, autoOpen: false });
        const done = (err, val) => { try { sp.close(() => {}); } catch (e) {} rtBusy.delete(port); err ? reject(err) : resolve(val); };
        const timerFail = setTimeout(() => done(new Error('runtime timeout on ' + port + ' (firmware flashed? baud 115200?)')), Math.max(10000, perCmd * 6));
        sp.on('data', (chunk) => {
            buf += chunk.toString('latin1');
            let idx;
            while ((idx = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, idx + 1);
                buf = buf.slice(idx + 1);
                if (!RSRuntime) continue;
                const r = RSRuntime.parseReply(line);
                if (!r.ok || r.seq === undefined) continue; // banner/garbage ignored
                const p = pending[r.seq];
                if (!p) continue;
                delete pending[r.seq];
                clearTimeout(p.timer);
                if (r.status === 'OK') p.resolve(r.payload);
                else p.reject(new Error('runtime: ' + r.payload));
            }
        });
        sp.on('error', (e) => done(new Error('serial error: ' + (e && e.message))));
        sp.open((err) => {
            if (err) { clearTimeout(timerFail); rtBusy.delete(port); reject(new Error('cannot open ' + port + ': ' + err.message)); return; }
            const send = (cmd, args, ms) => new Promise((res, rej) => {
                seq = (seq + 1) & 0xFF;
                pending[seq] = {
                    resolve: res, reject: rej,
                    timer: setTimeout(() => { delete pending[seq]; rej(new Error('runtime timeout: ' + cmd)); }, ms || perCmd)
                };
                try { sp.write(RSRuntime.buildFrame(seq, cmd, args || [])); }
                catch (e) { delete pending[seq]; rej(e); }
            });
            // Short drain: the open-port reboot is absorbed by the USB/serial
            // buffers, so HELLO can go out immediately (~250ms, not 600ms+).
            setTimeout(() => {
                Promise.resolve()
                    .then(() => fn(send))
                    .then((v) => { clearTimeout(timerFail); done(null, v); })
                    .catch((e) => { clearTimeout(timerFail); done(e); });
            }, 250);
        });
    });
}

ipcMain.handle('rs-runtime', async (_e, req) => {
    req = req || {};
    if (!RSRuntime) throw new Error('Runtime protocol module missing.');
    const op = req.op;
    if (['detect', 'cmd', 'program', 'stop'].indexOf(op) === -1) throw new Error('Unknown runtime op.');
    if (typeof req.port !== 'string' || !PORT_RE.test(req.port)) throw new Error('Select a valid serial port first.');
    if (uploadBusy.has(req.port) || rtBusy.has(req.port)) throw new Error(req.port + ' is busy — wait for the current operation.');
    const monWasOpen = !!(monPort && monPort.isOpen);
    closeMonitorPort();
    let perCmd = 5000;
    if (req.timeoutMs !== undefined && req.timeoutMs !== null) {
        perCmd = parseInt(req.timeoutMs, 10);
        if (!isFinite(perCmd) || perCmd < 300 || perCmd > 10000) throw new Error('Bad runtime timeout.');
    }
    rtBusy.add(req.port);
    const t0 = Date.now();
    try {
        if (op === 'detect') {
            const info = await rtWithPort(req.port, (send) => send('HELLO', []), perCmd);
            if (info.indexOf('RS-RUNTIME') !== 0) throw new Error('No RoboSiddhi runtime on ' + req.port + ' (flash it first). Got: ' + info);
            return { ok: true, info: info, ms: Date.now() - t0, monitorClosed: monWasOpen };
        }
        if (op === 'cmd') {
            if (!/^[A-Z_]+$/.test(req.cmd || '')) throw new Error('Bad runtime command.');
            const args = Array.isArray(req.args) ? req.args.filter((a) => /^[A-Za-z0-9_.+\-@]+$/.test(a)) : [];
            const out = await rtWithPort(req.port, (send) => send(req.cmd, args), perCmd);
            return { ok: true, out: out, ms: Date.now() - t0, monitorClosed: monWasOpen };
        }
        if (op === 'stop') {
            const out = await rtWithPort(req.port, (send) => send('PROG_STOP', []), perCmd);
            return { ok: true, out: out, ms: Date.now() - t0, monitorClosed: monWasOpen };
        }
        // op === 'program': validated op list + pins from the block compiler.
        const ops = req.ops, pins = req.pins || [];
        if (!Array.isArray(ops) || !ops.length || ops.length > 128) throw new Error('Bad program (1..128 ops).');
        for (const o of ops) {
            if (!o || typeof o.op !== 'number' || o.op < 1 || o.op > 12) throw new Error('Bad program opcode.');
            for (const k of ['a', 'b', 'c']) if (typeof o[k] !== 'number' || !isFinite(o[k])) throw new Error('Bad program args.');
        }
        const log = await rtWithPort(req.port, async (send) => {
            const steps = [];
            steps.push('CLEAR:' + (await send('PROG_CLEAR', [])));
            for (const p of pins) { steps.push('PINMODE:' + (await send('PINMODE', [String(p), 'OUT']))); }
            for (let i = 0; i < ops.length; i += 10) {
                const s = ops.slice(i, i + 10).map((o) => [o.op, o.a, o.b, o.c].join(',')).join(';');
                steps.push('ADD:' + (await send('PROG_ADD', [String(i), s])));
            }
            const crc = RSRuntime.crc32Hex(RSRuntime.programCrc32(ops.map((o) => ({ op: o.op | 0, a: o.a | 0, b: o.b | 0, c: o.c | 0 }))));
            steps.push('COMMIT:' + (await send('PROG_COMMIT', [crc])));
            steps.push('RUN:' + (await send('PROG_RUN', [])));
            return steps;
        }, perCmd);
        return { ok: true, ops: ops.length, log: log, ms: Date.now() - t0, monitorClosed: monWasOpen };
    } finally {
        rtBusy.delete(req.port);
    }
});

ipcMain.handle('rs-cli', async (_e, req) => {
    req = req || {};
    if (req.op === 'update-index') return runCli(['core', 'update-index'], 180000);
    if (req.op === 'board-list') return runCli(['board', 'list'], 60000);
    if (req.op === 'clean-cache') { fs.emptyDirSync(repoTmpPath()); fs.ensureDirSync(sketchDirPath()); return { ok: true, stdout: 'cache cleaned', stderr: '' }; }
    if (req.op === 'clean-build') {
        // Wipe the whole persistent build root (forces a true cold rebuild next time).
        let freed = 0, n = 0;
        try {
            const root = DEV_MODE ? path.join(__dirname, 'compiler', 'build') : path.join(app.getPath('userData'), 'build');
            if (fs.existsSync(root)) {
                fs.readdirSync(root).forEach((d) => {
                    const p = path.join(root, d);
                    try {
                        fs.readdirSync(p).forEach((f) => { try { freed += fs.statSync(path.join(p, f)).size; } catch (e) {} });
                        n++;
                    } catch (e) {}
                });
                fs.emptyDirSync(root);
            }
        } catch (e) {}
        fs.emptyDirSync(repoTmpPath()); fs.ensureDirSync(sketchDirPath());
        return { ok: true, stdout: 'Build cache cleared (' + n + ' board dirs, ~' + Math.round(freed / 1024) + ' KB binaries dropped). Next upload will fully recompile.', stderr: '' };
    }
    if (req.op === 'cache-status') {
        const lines = [];
        try {
            const root = DEV_MODE ? path.join(__dirname, 'compiler', 'build') : path.join(app.getPath('userData'), 'build');
            if (fs.existsSync(root)) {
                fs.readdirSync(root).forEach((d) => {
                    const mp = path.join(root, d, 'cache.json');
                    if (!fs.existsSync(mp)) return;
                    try {
                        const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
                        const bp = path.join(root, d, m.binName || '');
                        const mb = fs.existsSync(bp) ? Math.round(fs.statSync(bp).size / 1024) + ' KB' : 'binary gone';
                        lines.push(d + ' | code ' + String(m.codeHash || '?').slice(0, 8) + ' | core ' + (m.coreVersion || '?') + ' | ' + mb + ' | ' + (m.builtAt || '?'));
                    } catch (e) {}
                });
            }
        } catch (e) {}
        return { ok: true, stdout: lines.length ? lines.join('\n') : 'Build cache is empty — no compiled firmware stored yet.', stderr: '' };
    }
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
