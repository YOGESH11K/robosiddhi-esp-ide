/**
 * @license
 * Copyright 2020 Sébastien CANET + RoboSiddhi contributors
 * SPDX-License-Identifier: GPL-3.0
 */

/**
 * @fileoverview Arduino CLI control for RoboSiddhi ESP IDE (secure renderer).
 * No Node access here — all commands run in the main process via window.RoboSiddhi.
 */

function CliShow(html, color) {
    var el = document.getElementById('content_serial');
    if (!el) return;
    el.style.color = color || '#00FF00';
    el.innerHTML = html;
}
function CliEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}
function CliRun(op, arg, startMsg) {
    CliShow(startMsg, '#00FF00');
    window.RoboSiddhi.cli(op, arg).then(function (res) {
        if (res.ok) CliShow(CliEsc(res.stdout || 'done'), '#00FF00');
        else CliShow(CliEsc(res.stderr || 'failed'), '#FF0000');
    }).catch(function (err) {
        CliShow(CliEsc((err && err.message) || err), '#FF0000');
    });
}

window.addEventListener('load', function load() {
    document.getElementById('coreUpdateButton').onclick = function () {
        CliRun('update-index', null, MSG['coreUpdateButton_msg']);
    };
    document.getElementById('cleanCLIcacheButton').onclick = function () {
        CliRun('clean-cache', null, MSG['cleanCLIcacheButton_msg']);
    };
    document.getElementById('listBoardsButton').onclick = function () {
        CliRun('board-list', null, MSG['listBoardsButton_msg']);
    };
    document.getElementById('installBoardsButton').onclick = function () {
        CliRun('core-install', document.getElementById('installBoardsInput').value, MSG['installBoardsButton_msg']);
    };
    document.getElementById('searchlLibButton').onclick = function () {
        CliRun('lib-search', document.getElementById('searchlLibInput').value, MSG['searchlLibButton_msg']);
    };
    document.getElementById('installLibButton').onclick = function () {
        CliRun('lib-install', document.getElementById('installLibInput').value, MSG['installLibButton_msg']);
    };
});
