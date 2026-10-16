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
        RoboSiddhiShow(MSG['IDE_upload1'] + RoboSiddhiEsc(profile.default['description']) + MSG['IDE_upload2'] + RoboSiddhiEsc(comPortSelected) + '<br>' + MSG['IDE_upload3'] + '<br><b>Upload ho raha hai — RST MAT dabao, USB mat nikalo.</b>', '#FFFFFF');
        window.RoboSiddhi.writeSketch(data).then(function () {
            return window.RoboSiddhi.upload({ fqbn: fqbn, port: comPortSelected, verbose: RoboSiddhiVerbose(), force: RoboSiddhiForce(), uploadSpeed: RoboSiddhiSpeed() });
        }).then(function (res) {
            if (res.ok) RoboSiddhiShow(RoboSiddhiEsc(res.stdout) + '<br>' + MSG['IDE_upload_ok'] + '<br><b>ABB RST DABAO (ek baar) YA USB cable nikalo-lagao — tabhi naya program chalega.</b>' + RoboSiddhiPerfLine(res, 'upload'), '#00FF00');
            else RoboSiddhiShow(RoboSiddhiEsc(RoboSiddhiDiagnose(res.stderr, fqbn)) + RoboSiddhiPerfLine(res, 'upload'), '#FF0000');
        }).catch(function (err) {
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
});
