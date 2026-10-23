/**
 * @license
 * Copyright 2020 Sébastien CANET + RoboSiddhi contributors
 * SPDX-License-Identifier: GPL-3.0
 */

/**
 * @fileoverview IDE handlers for RoboSiddhi ESP IDE (secure renderer).
 * No Node access here — everything privileged goes through window.RoboSiddhi (preload).
 */

function RoboSiddhiSerialEl() { return document.getElementById('content_serial'); }
function RoboSiddhiShow(html, color) {
    var el = RoboSiddhiSerialEl();
    if (!el) return;
    el.style.color = color || '#FFFFFF';
    el.innerHTML = html;
}
function RoboSiddhiEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
function RoboSiddhiDiagnose(stderr, fqbn) {
    try {
        if (typeof RoboSiddhiBuild !== 'undefined' && RoboSiddhiBuild) return RoboSiddhiBuild.diagnoseCompilerError(stderr, fqbn);
    } catch (e) {}
    return stderr;
}
function RoboSiddhiPortOption(path, label) {
    var option = document.createElement('option');
    option.value = path;
    option.text = label || path;
    return option;
}
function RoboSiddhiFillPortMenu(menu, ports, keepCurrent) {
    menu.options.length = 0;
    var noneOpt = document.createElement('option');
    noneOpt.value = 'none';
    noneOpt.text = '...';
    menu.appendChild(noneOpt);
    ports.forEach(function (port) {
        menu.appendChild(RoboSiddhiPortOption(port.path, port.path + (port.manufacturer ? ' (' + port.manufacturer + ')' : '')));
    });
    if (keepCurrent) {
        var stillThere = ports.some(function (p) { return p.path === keepCurrent; });
        if (stillThere) menu.value = keepCurrent;
    }
}

// ---- AUTO DETECT + AUTO SELECT COM PORT (ESP USB-UART) ----
var _lastPortsKey = '__init__';
function _portsKey(ports) {
    return ports.map(function (p) { return p.path; }).sort().join(',');
}
function _pickEspPort(ports) {
    if (!ports || !ports.length) return null;
    var espVids = ['10c4', '1a86', '303a', '0403', '2341', '10c5', '067b', '2e8a'];
    for (var i = 0; i < ports.length; i++) {
        var vid = (ports[i].vendorId || '').toString().toLowerCase();
        if (vid && espVids.indexOf(vid) !== -1) return ports[i];
    }
    for (var j = 0; j < ports.length; j++) {
        var hay = ((ports[j].manufacturer || '') + ' ' + (ports[j].path || '')).toLowerCase();
        if (/cp210|ch340|ch341|ftdi|esp32|esp8266|silicon|wch|prolific|usb-serial|usb serial/.test(hay)) return ports[j];
    }
    return ports[0];
}
function autoRefreshSerialPorts() {
    if (!window.RoboSiddhi) return;
    window.RoboSiddhi.ports().then(function (ports) {
        var menu = document.getElementById('serialMenu');
        if (!menu) return;
        var key = _portsKey(ports);
        if (key === _lastPortsKey) return;
        _lastPortsKey = key;
        var current = menu.value;
        var stillExists = current && current !== 'none' && ports.some(function (p) { return p.path === current; });
        RoboSiddhiFillPortMenu(menu, ports, stillExists ? current : null);
        try {
            var body = document.getElementById('portListModalBody');
            if (body) {
                if (!ports.length) body.innerHTML = 'No port available - connect ESP board';
                else body.innerHTML = ports.map(function (p) {
                    return RoboSiddhiEsc(p.path + '  ' + (p.manufacturer || '') + '  ' + (p.vendorId || ''));
                }).join('<br>');
            }
        } catch (e) {}
        if (!ports.length) {
            menu.value = 'none';
            try { Code.setPort(); } catch (e) {}
            return;
        }
        if (stillExists) { menu.value = current; return; }
        var pick = _pickEspPort(ports);
        if (pick) {
            menu.value = pick.path;
            try { Code.setPort(); } catch (e) {}
            RoboSiddhiShow('Auto-selected port: ' + RoboSiddhiEsc(pick.path) + ' - ESP ready', '#00FF00');
        }
    }).catch(function (e) { console.log('auto port scan failed:', e); });
}

window.addEventListener('load', function () {
    if (!window.RoboSiddhi) {
        console.log('RoboSiddhi bridge missing — reinstall the app.');
        return;
    }
    // COM port modal table
    document.getElementById('serialButton').addEventListener('mouseover', function () {
        window.RoboSiddhi.ports().then(function (ports) {
            var body = document.getElementById('portListModalBody');
            if (!ports.length) body.innerHTML = 'No port available';
            else body.innerHTML = ports.map(function (p) {
                return RoboSiddhiEsc(p.path + '  ' + (p.manufacturer || '') + '  ' + (p.vendorId || ''));
            }).join('<br>');
        });
    });
    // COM port dropdown
    document.getElementById('serialMenu').addEventListener('mouseover', function () {
        window.RoboSiddhi.ports().then(function (ports) {
            var menu = document.getElementById('serialMenu');
            RoboSiddhiFillPortMenu(menu, ports, menu.value !== 'none' ? menu.value : null);
        });
    });
    setTimeout(autoRefreshSerialPorts, 800);
    setInterval(autoRefreshSerialPorts, 2000);
});

function RoboSiddhiWorkspaceCode() {
    var data = Blockly.Arduino.workspaceToCode(Code.workspace);
    try { editor.setValue(data, 1); } catch (e) {}
    return data;
}
function RoboSiddhiCheckCode(data) {
    if (data.indexOf('void setup') === -1 || data.indexOf('void loop') === -1) {
        RoboSiddhiShow('Blocks incomplete: add the setup+loop block from Logic, put code inside, then Verify.', '#FF0000');
        return false;
    }
    return true;
}
function RoboSiddhiCheckBoard() {
    var boardSelected = document.getElementById('boardMenu').value;
    if (!boardSelected || boardSelected === 'none' || boardSelected === '...') {
        RoboSiddhiShow(MSG['IDE_select_board'], '#FF0000');
        return null;
    }
    return boardSelected;
}
function RoboSiddhiVerbose() {
    try { return document.getElementById('detailedCompilation').checked === true; } catch (e) { return false; }
}
function RoboSiddhiForce() {
    try { return document.getElementById('forceRebuild').checked === true; } catch (e) { return false; }
}
function RoboSiddhiSpeed() {
    try {
        var v = document.getElementById('uploadSpeedMenu').value;
        if (!v || v === 'default') return undefined;
        return parseInt(v, 10);
    } catch (e) { return undefined; }
}
function RoboSiddhiSecs(ms) {
    if (ms === undefined || ms === null) return '?';
    return (ms / 1000).toFixed(1) + 's';
}
function RoboSiddhiPerfLine(res, kind) {
    var parts = [];
    if (res.cache) parts.push('cache ' + String(res.cache).toUpperCase());
    if (kind === 'upload') {
        parts.push('compile ' + RoboSiddhiSecs(res.compileMs));
        parts.push('flash ' + RoboSiddhiSecs(res.uploadMs));
        parts.push('total ' + RoboSiddhiSecs(res.totalMs));
    } else {
        parts.push('compile ' + RoboSiddhiSecs(res.compileMs));
    }
    return '<br>⏱ ' + parts.join(' | ');
}

window.addEventListener('load', function load() {
    document.getElementById('verifyButton').onclick = function () {
        var data = RoboSiddhiWorkspaceCode();
        if (!RoboSiddhiCheckCode(data)) return;
        if (!RoboSiddhiCheckBoard()) return;
        var fqbn = profile.default['upload_arg'];
        RoboSiddhiShow(MSG['IDE_upload1'] + RoboSiddhiEsc(profile.default['description']) + '<br>' + MSG['IDE_verif_progress'], '#FFFFFF');
        window.RoboSiddhi.writeSketch(data).then(function () {
            return window.RoboSiddhi.compile({ fqbn: fqbn, verbose: RoboSiddhiVerbose(), force: RoboSiddhiForce() });
        }).then(function (res) {
            if (res.ok) RoboSiddhiShow(RoboSiddhiEsc(res.stdout) + '<br>' + MSG['IDE_verif_ok'] + RoboSiddhiPerfLine(res, 'verify'), '#00FF00');
            else RoboSiddhiShow(RoboSiddhiEsc(RoboSiddhiDiagnose(res.stderr, fqbn)) + RoboSiddhiPerfLine(res, 'verify'), '#FF0000');
        }).catch(function (err) {
            RoboSiddhiShow(RoboSiddhiEsc((err && err.message) || err), '#FF0000');
        });
    };
    // ---- Smart Upload: runtime-instant when the board has it, else Arduino ----
    function RuntimeMarkKey(port) { return 'rs-runtime-ok:' + port; }
    function RuntimeMarked(port) {
        try { return window.localStorage.getItem(RuntimeMarkKey(port)) === '1'; } catch (e) { return false; }
    }
    function RuntimeMark(port, ok) {
        try {
            if (ok) window.localStorage.setItem(RuntimeMarkKey(port), '1');
            else window.localStorage.removeItem(RuntimeMarkKey(port));
        } catch (e) {}
    }
    function ArduinoUploadFlow(data, fqbn, comPortSelected) {
        // Classic compile-and-flash. Overwrites any runtime firmware on the board.
        return window.RoboSiddhi.writeSketch(data).then(function () {
            return window.RoboSiddhi.upload({ fqbn: fqbn, port: comPortSelected, verbose: RoboSiddhiVerbose(), force: RoboSiddhiForce(), uploadSpeed: RoboSiddhiSpeed() });
        }).then(function (res) {
            if (res.ok) {
                RuntimeMark(comPortSelected, false);
                RoboSiddhiShow(RoboSiddhiEsc(res.stdout) + '<br>' + MSG['IDE_upload_ok'] + '<br><b>ABB RST DABAO (ek baar) YA USB cable nikalo-lagao — tabhi naya program chalega.</b>' + RoboSiddhiPerfLine(res, 'upload'), '#00FF00');
            } else RoboSiddhiShow(RoboSiddhiEsc(RoboSiddhiDiagnose(res.stderr, fqbn)) + RoboSiddhiPerfLine(res, 'upload'), '#FF0000');
        });
    }
    function RuntimeTransferFlow(prog, comPortSelected) {
        var t0 = Date.now();
        return window.RoboSiddhi.runtime({ op: 'program', port: comPortSelected, ops: prog.ops, pins: prog.pins, timeoutMs: 3000 }).then(function (res) {
            var secs = ((Date.now() - t0) / 1000).toFixed(1);
            RuntimeMark(comPortSelected, true);
            RoboSiddhiShow('⚡ <b>INSTANT upload — Runtime (' + res.ops + ' ops, transfer ' + secs + 's, no reflash).</b><br>' + RoboSiddhiEsc((res.log || []).join(' | ')), '#00FF00');
        });
    }
    document.getElementById('uploadButton').onclick = function () {
        var data = RoboSiddhiWorkspaceCode();
        if (!RoboSiddhiCheckCode(data)) return;
        if (!RoboSiddhiCheckBoard()) return;
        var comPortSelected = document.getElementById('serialMenu').value;
        if (!comPortSelected || comPortSelected === 'none') {
            RoboSiddhiShow(MSG['IDE_select_port'], '#FF0000');
            return;
        }
        var fqbn = profile.default['upload_arg'];
        var prog = RoboSiddhiRuntimeCompile();
        var canRuntime = !!(prog && prog.ok !== false);
        var marked = false;
        try { marked = (window.localStorage.getItem('rs-runtime-ok:' + comPortSelected) === '1'); } catch (e) {}
        if (canRuntime && marked) {
            // Steady state: board known to run the runtime — straight to transfer (~1s).
            RoboSiddhiShow('⚡ Runtime check: canRuntime=' + canRuntime + ', marked=' + marked + '<br>' +
            '? Runtime board pe bhej rahe hain (' + prog.ops.length + ' ops)...', '#FFFFFF');
            RuntimeTransferFlow(prog, comPortSelected).catch(function (err) {
                RuntimeMark(comPortSelected, false);
                RoboSiddhiShow(RoboSiddhiEsc((err && err.message) || err) + '<br><br>Runtime jawab nahi de raha — Arduino mode se flash kar raha hoon...', '#FF9900');
                ArduinoUploadFlow(data, fqbn, comPortSelected).catch(function (e2) {
                    RoboSiddhiShow(RoboSiddhiEsc((e2 && e2.message) || e2), '#FF0000');
                });
            });
            return;
        }
        if (canRuntime) {
            // Unknown board state: quick 1.5s probe, then instant or Arduino.
            RoboSiddhiShow('Board check ho raha hai (runtime?)...', '#FFFFFF');
            window.RoboSiddhi.runtime({ op: 'detect', port: comPortSelected, timeoutMs: 5000 }).then(function () {
                RuntimeTransferFlow(prog, comPortSelected).catch(function (err) {
                    RoboSiddhiShow(RoboSiddhiEsc((err && err.message) || err), '#FF0000');
                });
            }).catch(function (err) {
                RoboSiddhiShow('Runtime firmware detect nahi hua: ' + RoboSiddhiEsc((err && err.message) || err) + '<br><br><b>Install Firmware (bolt) dobara dabao.</b> (Arduino mode se overwrite nahi kar raha - firmware bachega.)', '#FF0000');
            });
            return;
        }
        // Blocks need Arduino mode (compiler said so).
        var _errs = (prog && prog.errors) ? prog.errors.join('<br>') : '';
        if (_errs) RoboSiddhiShow('<b>Runtime mode me nahi chalega (slow upload hoga):</b><br>' + RoboSiddhiEsc(_errs) + '<br><br>Arduino mode se flash ho raha hai...', '#FF9900');
        RoboSiddhiShow(MSG['IDE_upload1'] + RoboSiddhiEsc(profile.default['description']) + MSG['IDE_upload2'] + RoboSiddhiEsc(comPortSelected) + '<br>' + MSG['IDE_upload3'] + '<br><b>Upload ho raha hai - RST MAT dabao, USB mat nikalo.</b>', '#FFFFFF');
        ArduinoUploadFlow(data, fqbn, comPortSelected).catch(function (err) {
            RoboSiddhiShow(RoboSiddhiEsc((err && err.message) || err), '#FF0000');
        });
    };
    document.getElementById('serialConnectButton').addEventListener('click', function () {
        var langChoice = document.getElementById('languageMenu').value;
        if (!RoboSiddhiCheckBoard()) return;
        var comPortSelected = document.getElementById('serialMenu').value;
        if (!comPortSelected || comPortSelected === 'none') {
            RoboSiddhiShow(MSG['IDE_select_port'], '#FF0000');
            return;
        }
        document.getElementById('content_hoverButton').style.color = '#FFFFFF';
        document.getElementById('content_hoverButton').innerHTML = MSG['IDE_connect'] + RoboSiddhiEsc(comPortSelected);
        localStorage.setItem('comPort', comPortSelected);
        localStorage.setItem('availableSpeed', JSON.stringify(profile.default['serialList']));
        window.RoboSiddhi.openTool('serial', langChoice);
    });
    document.getElementById('wiringButton').addEventListener('click', function () {
        window.RoboSiddhi.openTool('hackcable', document.getElementById('languageMenu').value);
    });
    document.getElementById('factoryButton').addEventListener('click', function () {
        window.RoboSiddhi.openTool('factory', document.getElementById('languageMenu').value);
    });
    document.getElementById('htmlButton').addEventListener('click', function () {
        window.RoboSiddhi.openTool('html', document.getElementById('languageMenu').value);
    });
    // ---- RoboSiddhi Runtime: flash once, then send programs without reflashing ----
    function RoboSiddhiRuntimePort() {
        var p = document.getElementById('serialMenu').value;
        if (!p || p === 'none') { RoboSiddhiShow(MSG['IDE_select_port'], '#FF0000'); return null; }
        return p;
    }
    document.getElementById('runtimeFlashButton').addEventListener('click', function () {
        if (!RoboSiddhiCheckBoard()) return;
        var port = RoboSiddhiRuntimePort();
        if (!port) return;
        var fqbn = profile.default['upload_arg'];
        RoboSiddhiShow('Runtime firmware flash ho raha hai: ' + RoboSiddhiEsc(profile.default['description']) + ' → ' + RoboSiddhiEsc(port) + '<br>Pehli baar compile me 1-2 min lag sakta hai. <b>RST MAT dabao, USB mat nikalo.</b>', '#FFFFFF');
        var t0 = Date.now();
        window.RoboSiddhi.compile({ fqbn: fqbn, sketch: 'runtime', verbose: RoboSiddhiVerbose() }).then(function (c) {
            if (!c.ok) { RoboSiddhiShow(RoboSiddhiEsc(RoboSiddhiDiagnose(c.stderr, fqbn)), '#FF0000'); throw 'stop'; }
            return window.RoboSiddhi.upload({ fqbn: fqbn, port: port, sketch: 'runtime', verbose: RoboSiddhiVerbose() });
        }).then(function (res) {
            var secs = ((Date.now() - t0) / 1000).toFixed(1);
            if (res.ok) {
                try { window.localStorage.setItem('rs-runtime-ok:' + port, '1'); } catch (e) {}
                RoboSiddhiShow(RoboSiddhiEsc(res.stdout) + '<br><b>Runtime flashed in ' + secs + 's.</b> Ab Upload dabate hi program ~1s me chalega (reflash nahi hoga).<br>ABB RST DABAO (ek baar).', '#00FF00');
            }
            else RoboSiddhiShow(RoboSiddhiEsc(RoboSiddhiDiagnose(res.stderr, fqbn)), '#FF0000');
        }).catch(function (err) {
            if (err !== 'stop') RoboSiddhiShow(RoboSiddhiEsc((err && err.message) || err), '#FF0000');
        });
    });
    function RoboSiddhiRuntimeCompile() {
        if (typeof RoboSiddhiRuntime === 'undefined' || !RoboSiddhiRuntime) {
            RoboSiddhiShow('Runtime module load nahi hua — app restart karo.', '#FF0000');
            return null;
        }
        var setupChain = null, loopChain = null, plain = [];
        try {
            var tops = Code.workspace.getTopBlocks(true);
            for (var i = 0; i < tops.length; i++) {
                if (tops[i].type === 'base_setup_loop') {
                    setupChain = tops[i].getInputTargetBlock('SETUP');
                    loopChain = tops[i].getInputTargetBlock('LOOP');
                } else if (tops[i].type === 'base_setup') {
                    setupChain = tops[i].getInputTargetBlock('SETUP');
                } else if (tops[i].type === 'base_loop') {
                    loopChain = tops[i].getInputTargetBlock('LOOP');
                } else plain.push(tops[i]);
            }
        } catch (e) {
            RoboSiddhiShow('Workspace read fail: ' + RoboSiddhiEsc(e.message), '#FF0000');
            return null;
        }
        var chains;
        if (loopChain) {
            var loopWrap = { type: '__LOOP__', getFieldValue: function () { return null; }, getInputTargetBlock: function (k) { return k === 'DO' ? loopChain : null; }, getNextBlock: function () { return null; } };
            chains = (setupChain ? [setupChain] : []).concat([loopWrap]).concat(plain);
        } else chains = plain;
        var r = RoboSiddhiRuntime.compileBlocks(chains);
        if (!r.ok) {
            RoboSiddhiShow('<b>Runtime mode me nahi chalega:</b><br>' + RoboSiddhiEsc(r.errors.join('<br>')) + '<br><br>Ye blocks Arduino mode (Verify/Upload) se flash karo.', '#FF0000');
            return null;
        }
        return r;
    }
    document.getElementById('runtimeSendButton').addEventListener('click', function () {
        var port = RoboSiddhiRuntimePort();
        if (!port) return;
        var prog = RoboSiddhiRuntimeCompile();
        if (!prog) return;
        RoboSiddhiShow('Runtime check + program bhej rahe hain (' + prog.ops.length + ' ops)...', '#FFFFFF');
        var t0 = Date.now();
        window.RoboSiddhi.runtime({ op: 'detect', port: port }).then(function (d) {
            RoboSiddhiShow(RoboSiddhiEsc(d.info) + '<br>Program transfer...', '#FFFFFF');
            return window.RoboSiddhi.runtime({ op: 'program', port: port, ops: prog.ops, pins: prog.pins });
        }).then(function (res) {
            var secs = ((Date.now() - t0) / 1000).toFixed(1);
            RoboSiddhiShow('<b>Program RUNNING on runtime (' + res.ops + ' ops, transfer ' + secs + 's).</b><br>' + RoboSiddhiEsc((res.log || []).join(' | ')), '#00FF00');
        }).catch(function (err) {
            try { window.localStorage.removeItem('rs-runtime-ok:' + port); } catch (e) {}
            RoboSiddhiShow(RoboSiddhiEsc((err && err.message) || err) + '<br><br>Runtime nahi mila? Pehle Flash (bolt) button se firmware flash karo.', '#FF0000');
        });
    });
    document.getElementById('runtimeStopButton').addEventListener('click', function () {
        var port = RoboSiddhiRuntimePort();
        if (!port) return;
        window.RoboSiddhi.runtime({ op: 'stop', port: port }).then(function (res) {
            RoboSiddhiShow('Runtime program STOPPED.<br>' + RoboSiddhiEsc(res.out || ''), '#00FF00');
        }).catch(function (err) {
            RoboSiddhiShow(RoboSiddhiEsc((err && err.message) || err), '#FF0000');
        });
    });
});
