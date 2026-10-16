/**
 * @license
 * Copyright 2020 Sébastien CANET + RoboSiddhi contributors
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * @fileoverview Serial monitor window (secure renderer).
 * The serial port is owned by the main process; lines stream in via events.
 */

window.addEventListener('load', function load() {
    var serialConnected = false;
    var serialConnectSpeedMenu = document.getElementById('serialConnectSpeed_Menu');
    try {
        var speeds = JSON.parse(localStorage.getItem('availableSpeed')) || [115200];
        speeds.forEach(function (s) {
            var option = document.createElement('option');
            option.value = s;
            option.text = s;
            serialConnectSpeedMenu.appendChild(option);
        });
    } catch (e) {}
    var graph = false;
    document.getElementById('btn_serialSend').disabled = true;
    document.getElementById('btn_serialPeekClear').onclick = function () {
        document.getElementById('serialPeek').textContent = '';
        try { line0.data = []; } catch (e) {}
    };
    document.getElementById('btn_serialSend').onclick = function () {
        var input = document.getElementById('serialSendBox').value;
        if (serialConnected) {
            document.getElementById('serialPeek').innerHTML += input.replace(/</g, '&lt;') + '<br>';
            window.RoboSiddhi.monitor.write(input);
        }
    };
    function monLine(data) {
        if (!serialConnected) return;
        var peek = document.getElementById('serialPeek');
        var div = document.createElement('div');
        div.textContent = data;
        peek.appendChild(div);
        peek.scrollTop = peek.scrollHeight;
        var num = parseFloat(data);
        if (!isNaN(num)) {
            try {
                document.getElementById('serialSendBox').value = num;
                smoothieChart.start();
            } catch (e) {}
        }
    }
    window.RoboSiddhi.monitor.onData(monLine);
    window.RoboSiddhi.monitor.onEvent(function (msg) {
        var peek = document.getElementById('serialPeek');
        var div = document.createElement('div');
        div.textContent = msg;
        peek.appendChild(div);
    });
    document.getElementById('btn_serialConnect').onclick = function () {
        var baud = parseInt(document.getElementById('serialConnectSpeed_Menu').value, 10);
        var comPortToUse = localStorage.getItem('comPort');
        if (!serialConnected) {
            window.RoboSiddhi.monitor.open(comPortToUse, baud).then(function () {
                serialConnected = true;
                document.getElementById('btn_serialConnect').innerHTML = MSG['serial_btn_stop'];
                document.getElementById('btn_serialSend').disabled = false;
                try { smoothieChart.start(); } catch (e) {}
            }).catch(function (err) {
                var peek = document.getElementById('serialPeek');
                var div = document.createElement('div');
                div.textContent = 'open failed: ' + ((err && err.message) || err);
                peek.appendChild(div);
            });
        } else {
            window.RoboSiddhi.monitor.close();
            serialConnected = false;
            document.getElementById('btn_serialConnect').innerHTML = MSG['serial_btn_start'];
            document.getElementById('btn_serialSend').disabled = true;
            try { smoothieChart.stop(); } catch (e) {}
        }
    };
    document.getElementById('btn_serialPeekCSV').onclick = function () {
        var text = document.getElementById('serialPeek').innerText || '';
        window.RoboSiddhi.saveText(text, 'robosiddhi-log.csv');
    };
    document.getElementById('btn_serialChart').onclick = function () {
        if (!graph) {
            document.getElementById('serialPeek').style.width = '120px';
            document.getElementById('serialGraphWindow').style.display = 'block';
            graph = true;
        } else {
            document.getElementById('serialPeek').style.width = '610px';
            document.getElementById('serialGraphWindow').style.display = 'none';
            graph = false;
        }
    };
});
