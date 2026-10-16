/**
 * @license
 * Copyright 2020 Sébastien CANET
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * @fileoverview Intercept data to modify toolbox for user
 * @author scanet@libreduc.cc (Sébastien CANET)
 */

var jsonToolbox = {
	"kind": "categoryToolbox",
	"contents": []
};
jsonToolbox["contents"][0] = toolbox_standard["contents"][0];
jsonToolbox["contents"][1] = toolbox_standard["contents"][1];
jsonToolbox["contents"][2] = toolbox_standard["contents"][2];
// SERVO at VARIABLES slot - servo only, no variable category (user requirement).
// toolbox_servo is loaded via <script> in index.html before this file.
try {
	if (typeof toolbox_servo !== 'undefined' && toolbox_servo && toolbox_servo.contents && toolbox_servo.contents[0]) {
		var _servoCat = toolbox_servo.contents[0];
		_servoCat.level = "1";
		_servoCat.toolboxitemid = _servoCat.toolboxitemid || "SERVO";
		jsonToolbox["contents"][3] = _servoCat;
	} else {
		// inline fallback: same servo blocks, never fall back to VARIABLES
		jsonToolbox["contents"][3] = {"kind":"category","name":"%{BKY_CAT_SERVO}","toolboxitemid":"SERVO","level":"1","levels":"1,2,3","categorystyle":"servo_category","cssConfig":{"icon":"customIcon fas fa-robot"},"contents":[{"kind":"block","blockxml":"<block type='servo_move'><field name='PIN'>4</field><value name='DEGREE'><shadow type='math_number'><field name='NUM'>90</field></shadow></value></block>"},{"kind":"block","type":"servo_read_degrees"}]};
	}
} catch (e) { jsonToolbox["contents"][3] = {"kind":"category","name":"%{BKY_CAT_SERVO}","toolboxitemid":"SERVO","level":"1","levels":"1,2,3","categorystyle":"servo_category","contents":[{"kind":"block","type":"servo_move"},{"kind":"block","type":"servo_read_degrees"}]}; console.log('Servo toolbox fallback:', e); }
jsonToolbox["contents"][4] = toolbox_arduino["contents"][0];
// ESP Components category (added by RoboSiddhi ESP IDE). Guard if toolbox_esp missing.
try {
	if (typeof toolbox_esp !== 'undefined' && toolbox_esp) {
		// normalize to category entry
		if (toolbox_esp.kind === 'category') {
			toolbox_esp.level = toolbox_esp.level || '1';
			jsonToolbox["contents"][5] = toolbox_esp;
		} else if (toolbox_esp.contents) {
			jsonToolbox["contents"][5] = toolbox_esp.contents[0] || toolbox_esp;
		}
	}
} catch (e) { console.log('ESP toolbox not loaded:', e); }

/**
 * Build the toolbox using toolbox definition in json files
 */
Code.buildToolbox = function() {
	// set the toolbox from url 
	var toolboxIds = Code.getStringParamFromUrl('toolboxids', '');
	var boardSelected = Code.getStringParamFromUrl('board', '');
	// migrate old cache/URL: VARIABLES -> SERVO (servo only, no variable category)
	if (toolboxIds) toolboxIds = toolboxIds.replace(/VARIABLES/g, 'SERVO');
	try { var _cached = window.localStorage.toolboxids || ''; if (_cached.indexOf('VARIABLES') !== -1) window.localStorage.toolboxids = _cached.replace(/VARIABLES/g, 'SERVO'); } catch (e) {}
	// set the default toolbox if none
	if (toolboxIds === undefined || toolboxIds === "") {
		if (boardSelected) {
			toolboxIds = 'LOGIC,LOOPS,MATH,TEXT,LIST,COLOUR,SERVO,FUNCTIONS,BOARD';
			window.localStorage.defaultToolbox = 1;
		}
		else {
			toolboxIds = 'LOGIC,LOOPS,MATH,TEXT,LIST,COLOUR,SERVO,FUNCTIONS';
			window.localStorage.defaultToolbox = 0;
		}
	} else {
		toolboxIds += ',LOGIC,LOOPS,MATH,TEXT,LIST,COLOUR,SERVO,FUNCTIONS,BOARD';
			window.localStorage.defaultToolbox = 2;
	}
	//save config in local browser storage for rendering in menu categories list
	window.localStorage.toolboxids = toolboxIds;
	// needed to delacre an empty var first, instead it keeps contents
	var jsonToolboxToKeep = {};
	jsonToolboxToKeep = {
		"kind": "categoryToolbox",
		"contents": []
	};
	var k = 0;
	toolboxIds = toolboxIds.split(",");
	for (let i = 0; i < jsonToolbox.contents.length; i++ ) {
		if (window.localStorage.defaultToolbox != 0) {
			for (var j = 0; j < toolboxIds.length; j++) {
				if (jsonToolbox.contents[i].toolboxitemid == toolboxIds[j]) {
					jsonToolboxToKeep.contents[k] = jsonToolbox.contents[i];
					k++;
				}
			}
		}
		// if launched by default, with no argument in URL, add all entries from XML in categories list
		else if (jsonToolbox.contents[i].level == "1") {
				jsonToolboxToKeep.contents[k] = jsonToolbox.contents[i];
				k++;
		}
	}
	return jsonToolboxToKeep;
}

/** add categories from list in jsonToolbox
 * in both boardMenu, hidden, but used for compilation,
 * and boardDescriptionSelector in boards modal
 */
Code.buildControlPanelForToolbox = function() {
	// clear modal
    $('#categories_content')[0].innerHTML = "<br>";
	var ligne = "", id_liste = "";
	for (let i = 0; i < jsonToolbox.contents.length; i++ ) {
		if (jsonToolbox.contents[i].level == "1") {
			var rankInDisplayedToolbox = Blockly.getMainWorkspace().getToolbox().getToolboxItems().findIndex(x => x['id_'] == jsonToolbox.contents[i].toolboxitemid);
			if (rankInDisplayedToolbox >= 0) {
				ligne = '<input type="checkbox" checked="checked" onchange="toggleCategory(' + rankInDisplayedToolbox + ')" name="checkbox_' + rankInDisplayedToolbox + '" id="checkbox_' + rankInDisplayedToolbox + '"/> '
						+ '<span id="checkboxSpan_' + rankInDisplayedToolbox + '">' + Blockly.getMainWorkspace().getToolbox().getToolboxItems()[rankInDisplayedToolbox]['name_'] + '</span><br/>';
				id_liste += jsonToolbox.contents[i].toolboxitemid + ',';
				$('#categories_content')[0].innerHTML += ligne;
			}
			else if (window.localStorage.defaultToolbox == 0) {
				ligne = '<input type="checkbox" onchange="toggleCategory(' + rankInDisplayedToolbox + ')" name="checkbox_' + rankInDisplayedToolbox + '" id="checkbox_' + rankInDisplayedToolbox + '"/> '
						+ '<span id="checkboxSpan_' + rankInDisplayedToolbox + '">' + Blockly.getMainWorkspace().getToolbox().getToolboxItems()[rankInDisplayedToolbox]['name_'] + '<br/>';
				$('#categories_content')[0].innerHTML += ligne;
			}
		}
	}
	// default is hiding everything else than basis categories
	if (window.localStorage.defaultToolbox == 0)
		for (var j = 11; j < i; j++) 
			if (document.getElementById('checkbox_' + j) != null) document.getElementById('checkbox_' + j).click();
	window.localStorage.toolboxids = id_liste.slice(0, -1);
}