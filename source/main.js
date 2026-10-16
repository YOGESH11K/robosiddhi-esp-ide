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
// ---- Persistent firmware cache (CACHE_SCHEMA 2, see robosiddhi_build.js) ----
// cache.json lives next to the binaries in the per-board build dir and records
// every input that affects the firmware: code hash, board, core + CLI versions,
// build flags. A cached binary is flashed ONLY if all of them still match.
function cacheMetaPath(fqbn) { return path.join(buildDirPath(fqbn), 'cache.json'); }
function readCacheMeta(fqbn) {
    try { return JSON.parse(fs.readFileSync(cacheMetaPath(fqbn), 'utf8')); } catch (e) { return null; }
}
function writeCacheMeta(fqbn, meta) {
    try { fs.ensureDirSync(buildDirPath(fqbn)); fs.writeFileSync(cacheMetaPath(fqbn), JSON.stringify(meta, null, 1)); } catch (e) {}
}
function sha256File(file) {
    try {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    } catch (e) { return null; }
}
// Main application binary in a --build-path dir: the "<sketch>.ino.bin"
// (not merged/bootloader/partitions helpers). Used for the integrity hash.
function findSketchBin(fqbn) {
    try {
        const files = fs.readdirSync(buildDirPath(fqbn)).filter((f) => f.endsWith('.ino.bin'));
        const app = files.filter((f) => !/merged|bootloader|partitions/i.test(f));
        const pick = app[0] || files[0];
        return pick ? path.join(buildDirPath(fqbn), pick) : null;
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
    fs.ensureDirSync(buildDirPath(args.fqbn));
    if (args.force) { try { fs.emptyDirSync(buildDirPath(args.fqbn)); } catch (e) {} }
    const t0 = Date.now();
    const cmd = ['compile', '-j', '0'];
    if (args.verbose) cmd.push('-v');
    cmd.push('-b', args.fqbn, '--build-path', buildDirPath(args.fqbn), sketchDirPath());
    const r = await runCli(cmd);
    const compileMs = Date.now() - t0;
    if (r.ok) {
        // Record a validated cache entry: binary exists + integrity hash stored.
        // A failed build NEVER writes cache.json (stale-success impossible).
        const codeHash = sketchHash();
        const bin = findSketchBin(args.fqbn);
        const binSha = bin ? sha256File(bin) : null;
        try { fs.writeFileSync(hashFilePath(args.fqbn), codeHash || ''); } catch (e) {}
        if (codeHash && bin && binSha) {
            const [coreV, cliV] = await Promise.all([coreVersionFor(args.fqbn), cliVersionOnce()]);
            writeCacheMeta(args.fqbn, {
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
    uploadBusy.add(args.port);
    try {
        fs.ensureDirSync(buildDirPath(args.fqbn));
        // The Serial Monitor owns this COM port — flashing while it is open
        // always fails with "port busy", so close it first and say so.
        const monWasOpen = !!(monPort && monPort.isOpen);
        closeMonitorPort();
        const monNote = monWasOpen ? 'Serial monitor closed for flashing.\n' : '';
        const tAll = Date.now();
        // FAST PATH: reuse the cached binary ONLY if every build input matches
        // (code + board + core + toolchain + flags) and the binary verifies.
        // Anything else → full compile. Forced rebuild skips the lookup.
        const curHash = sketchHash();
        let c = null, cacheState = 'miss-no-entry', compileMs = 0;
        if (!args.force && curHash && RoboSiddhiBuild) {
            const [coreV, cliV] = await Promise.all([coreVersionFor(args.fqbn), cliVersionOnce()]);
            const bin = findSketchBin(args.fqbn);
            const verdict = RoboSiddhiBuild.validateCacheEntry(
                readCacheMeta(args.fqbn),
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
            cargs.push('-b', args.fqbn, '--build-path', buildDirPath(args.fqbn), sketchDirPath());
            c = await runCli(cargs);
            compileMs = Date.now() - t0;
            if (!c.ok) {
                c.phase = 'compile'; c.cache = 'miss-failed'; c.compileMs = compileMs;
                c.stderr = 'COMPILE FAILED - nothing was uploaded. Fix the error above.\n' + c.stderr;
                return c;
            }
            const codeHash = sketchHash();
            const bin = findSketchBin(args.fqbn);
            const binSha = bin ? sha256File(bin) : null;
            try { fs.writeFileSync(hashFilePath(args.fqbn), codeHash || ''); } catch (e) {}
            if (codeHash && bin && binSha) {
                const [coreV, cliV] = await Promise.all([coreVersionFor(args.fqbn), cliVersionOnce()]);
                writeCacheMeta(args.fqbn, {
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
        uargs.push('--input-dir', buildDirPath(args.fqbn), sketchDirPath());
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
