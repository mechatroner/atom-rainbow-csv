const path = require('path');
const os = require('os');
const fs = require('fs');


var status_bar_tile = null;

var rainbow_colors = [];

const autodetection_dialects = [
    {delim: ',', policy: 'quoted'},
    {delim: ';', policy: 'quoted'},
    {delim: '\t', policy: 'simple'}
];


function remove_element(id) {
    let elem = document.getElementById(id);
    if (elem) {
        elem.parentNode.removeChild(elem);
    }
}


function prepare_colors() {
    var css_code = '';
    rainbow_colors = [];
    for (let i = 0; i < 10; i++) {
        let color_name = 'rainbow' + (i + 1);
        let color_value = atom.config.get('rainbow-csv.' + color_name);
        css_code += `.syntax--${color_name} { color: ${color_value}; }`;
        rainbow_colors.push(color_value);
    }
    css_code += '.syntax--rainbowerror { color: #FFFFFF; background-color: #FF0000; }';

    const style_node_id = 'rainbow_colors_hack_css';

    remove_element(style_node_id);
    var patch_style_node = document.createElement('style');
    patch_style_node.id = style_node_id;
    patch_style_node.type = 'text/css';
    patch_style_node.innerHTML = css_code;
    document.getElementsByTagName('head')[0].appendChild(patch_style_node);
}


function split_quoted_str(src, dlm, preserve_quotes=false) {
    // FIXME use function from rainbow_utils
    if (src.indexOf('"') == -1)
        return [src.split(dlm), false];
    var result = [];
    var cidx = 0;
    while (cidx < src.length) {
        if (src.charAt(cidx) === '"') {
            var uidx = cidx + 1;
            while (true) {
                uidx = src.indexOf('"', uidx);
                if (uidx == -1) {
                    result.push(src.substring(cidx));
                    return [result, true];
                } else if (uidx + 1 == src.length || src.charAt(uidx + 1) == dlm) {
                    if (preserve_quotes) {
                        result.push(src.substring(cidx, uidx + 1));
                    } else {
                        result.push(src.substring(cidx + 1, uidx).replace(/""/g, '"'));
                    }
                    cidx = uidx + 2;
                    break;
                } else if (src.charAt(uidx + 1) == '"') {
                    uidx += 2; 
                    continue;
                } else {
                    result.push(src.substring(cidx));
                    return [result, true];
                }
            }
        } else {
            var uidx = src.indexOf(dlm, cidx);
            if (uidx == -1)
                uidx = src.length;
            var field = src.substring(cidx, uidx);
            if (field.indexOf('"') != -1) {
                result.push(src.substring(cidx));
                return [result, true];
            }
            result.push(field);
            cidx = uidx + 1;
        }
    }
    if (src.charAt(src.length - 1) == dlm)
        result.push('');
    return [result, false];
}


function smart_split(src, dlm, policy, preserve_quotes=false) {
    if (policy === 'simple')
        return [src.split(dlm), false];
    return split_quoted_str(src, dlm, preserve_quotes);
}


function get_field_by_line_position(fields, query_pos) {
    if (!fields.length)
        return null;
    var col_num = 0;
    var cpos = fields[col_num].length + 1;
    while (query_pos > cpos && col_num + 1 < fields.length) {
        col_num += 1;
        cpos = cpos + fields[col_num].length + 1;
    }
    return col_num;
}


function get_document_header(editor, delim, policy) {
    if (editor.getLineCount() < 1)
        return [];
    let first_line = editor.lineTextForBufferRow(0);
    var split_result = smart_split(first_line, delim, policy);
    return split_result[0];
}


function display_position_info(editor, position, delim, policy, ui_column_display) {
    var line_num = position.row;
    var column = position.column;
    var line_text = editor.lineTextForBufferRow(line_num);
    var split_result = smart_split(line_text, delim, policy, true);
    if (split_result[1]) {
        return; 
    }
    var line_fields = split_result[0];
    var col_num = get_field_by_line_position(line_fields, column + 1);
    if (col_num === null)
        return;
    var ui_text = 'Col #' + (col_num + 1);
    var header = get_document_header(editor, delim, policy);
    if (col_num < header.length) {
        const max_label_len = 50;
        var column_label = header[col_num].substr(0, max_label_len);
        if (column_label != header[col_num])
            column_label = column_label + '...';
        ui_text += ': "' + column_label + '"';
    }
    if (line_fields.length != header.length) {
        ui_text += "; WARN: inconsistent with Header line";
    }
    ui_column_display.setAttribute('style', 'color:' + rainbow_colors[col_num % rainbow_colors.length]);
    ui_column_display.textContent = ui_text;
}


function get_rainbow_scope(grammar) {
    if (!grammar || !grammar.scopeName)
        return null;
    var rainbow_scope_regex = /^text\.rbcs([mt])([0-9]+)$/;
    var matched = grammar.scopeName.match(rainbow_scope_regex);
    if (!matched)
        return null;
    var policy = (matched[1] == 'm' ? 'simple' : 'quoted');
    var delim = String.fromCharCode(matched[2]);
    return {'scope_name': grammar.scopeName, 'delim': delim, 'policy': policy};
}


function is_delimited_table(sampled_lines, delim, policy) {
    if (sampled_lines.length < 2)
        return false;
    var split_result = smart_split(sampled_lines[0], delim, policy);
    if (split_result[1])
        return false;
    var num_fields = split_result[0].length;
    if (num_fields < 2)
        return false;
    for (var i = 1; i < sampled_lines.length; i++) {
        split_result = smart_split(sampled_lines[i], delim, policy);
        if (split_result[1])
            return false;
        if (split_result[0].length != num_fields)
            return false;
    }
    return true;
}


function sample_lines(editor) {
    var sampled_lines = [];
    var num_lines = editor.getLineCount();
    var head_count = 10;
    if (num_lines <= head_count * 2) {
        for (var i = 0; i < num_lines; i++) {
            sampled_lines.push(editor.lineTextForBufferRow(i));
        }
    } else {
        for (var i = 0; i < head_count; i++) {
            sampled_lines.push(editor.lineTextForBufferRow(i));
        }
        for (var i = num_lines - head_count; i < num_lines; i++) {
            sampled_lines.push(editor.lineTextForBufferRow(i));
        }
    }
    while (sampled_lines.length) {
        var last = sampled_lines[sampled_lines.length - 1];
        if (last != "")
            break;
        sampled_lines.pop();
    }
    return sampled_lines;
}


function autodetect_dialect(editor) {
    var sampled_lines = sample_lines(editor);
    for (var i = 0; i < autodetection_dialects.length; i++) {
        if (is_delimited_table(sampled_lines, autodetection_dialects[i].delim, autodetection_dialects[i].policy))
            return autodetection_dialects[i];
    }
    return null;
}


function hide_statusbar_tile() {
    if (!status_bar_tile)
        return;
    var ui_column_display = status_bar_tile.getItem();
    if (ui_column_display) {
        ui_column_display.textContent = '';
    }
}


function show_statusbar_tile(editor, delim, policy) {
    if (editor.hasMultipleCursors())
        return;
    if (!status_bar_tile)
        return;
    var ui_column_display = status_bar_tile.getItem();
    if (ui_column_display) {
        var position = editor.getCursorBufferPosition();
        display_position_info(editor, position, delim, policy, ui_column_display);
    }
}


function process_editor_switch(editor) {
    if (!editor) {
        hide_statusbar_tile();
        return;
    }
    var rainbow_scope = get_rainbow_scope(editor.getGrammar());
    if (rainbow_scope) {
        show_statusbar_tile(editor, rainbow_scope.delim, rainbow_scope.policy);
    } else {
        hide_statusbar_tile();
    }
}


function unescape_index_record(record) {
    if (record.length >= 2 && record[1] == 'TAB')
        record[1] = '\t';
    return record;
}


function try_get_file_record(file_path) {
    var home_dir = os.homedir();
    var index_path = path.join(home_dir, '.rbql_table_index');
    var records = try_read_index(index_path);
    for (var i = 0; i < records.length; i++) {
        if (records[i].length && records[i][0] == file_path) {
            return unescape_index_record(records[i]);
        }
    }
    return null;
}


function do_set_rainbow_grammar(editor, delim, policy) {
    var grammar = find_suitable_grammar(delim, policy);
    if (!grammar) {
        atom.notifications.addError('Rainbow grammar was not found');
        return;
    }
    var old_grammar = editor.getGrammar();
    if (old_grammar && old_grammar.scopeName != 'text.plain.null-grammar') {
        // We don't want to save null-grammar, because it doesn't cancel rainbow grammar
        editor['rcsv__package_old_grammar'] = old_grammar;
    }
    editor.setGrammar(grammar);
    var file_path = editor.getPath();
    if (file_path) {
        update_table_record(file_path, delim, policy);
    }
    enable_statusbar(editor, delim, policy);
}


function is_plain_text_grammar(grammar) {
    var plain_text_grammars = ['text.plain', 'text.plain.null-grammar'];
    return (grammar && plain_text_grammars.indexOf(grammar.scopeName) != -1);
}


function handle_new_editor(editor) {
    var file_path = editor.getPath();
    var file_record = try_get_file_record(file_path);
    if (file_record && file_record.length >= 3) {
        var delim = file_record[1];
        var policy = file_record[2];
        if (delim != 'disabled') {
            // We need this timeout hack here because of a race condition: 
            // sometimes this callback gets executed before Atom sets a default grammar for the editor
            setTimeout(function() { do_set_rainbow_grammar(editor, delim, policy); }, 2000);
        }
        return;
    }
    var grammar = editor.getGrammar();
    if (!grammar) {
        console.log('Unknown error: unable to get current grammar');
        return;
    }
    var autodetection_enabled = atom.config.get('rainbow-csv.autodetection');
    if (is_plain_text_grammar(grammar) && autodetection_enabled) {
        var detected_dialect = autodetect_dialect(editor);
        if (detected_dialect) {
            do_set_rainbow_grammar(editor, detected_dialect.delim, detected_dialect.policy);
        }
    }
    if (file_path) {
        if (file_path.toLowerCase().endsWith('.csv')) {
            do_set_rainbow_grammar(editor, ',', 'quoted');
        }
        if (file_path.toLowerCase().endsWith('.tsv')) {
            do_set_rainbow_grammar(editor, '\t', 'simple');
        }
    }
}


function enable_statusbar(editor, delim, policy) {
    let cursor_callback = function(event) {
        if (editor.hasMultipleCursors())
            return;
        if (!status_bar_tile)
            return;
        var ui_column_display = status_bar_tile.getItem();
        if (ui_column_display) {
            var position = event.newBufferPosition;
            display_position_info(editor, position, delim, policy, ui_column_display);
        }
    }

    var disposable_subscription = editor.onDidChangeCursorPosition(cursor_callback);
    editor['rcsv__package_ds'] = disposable_subscription;
}


function do_disable_rainbow(editor) {
    // TODO add grammar change subscriber to handle situation when user disables rainbow grammar by another mechanism
    if (editor.hasOwnProperty('rcsv__package_old_grammar')) {
        editor.setGrammar(editor['rcsv__package_old_grammar']);
        delete editor['rcsv__package_old_grammar'];
    } else {
        editor.setGrammar(atom.grammars.grammarForScopeName('text.plain'));
    }
    if (editor.hasOwnProperty('rcsv__package_ds')) {
        editor['rcsv__package_ds'].dispose();
        delete editor['rcsv__package_ds'];
    }
    hide_statusbar_tile();
    var file_path = editor.getPath();
    if (file_path) {
        update_table_record(file_path, 'disabled', '');
    }
}


function handle_color_customization(_config_event) {
    prepare_colors();
}


function activate(_state) {
    prepare_colors();
    atom.config.onDidChange('rainbow-csv', handle_color_customization);
    atom.workspace.observeTextEditors(handle_new_editor);
    atom.workspace.onDidChangeActiveTextEditor(process_editor_switch);
    atom.commands.add('atom-text-editor', 'rainbow-csv:disable', disable_rainbow);
    atom.commands.add('atom-text-editor', 'rainbow-csv:enable-standard', enable_rainbow_quoted);
    atom.commands.add('atom-text-editor', 'rainbow-csv:enable-simple', enable_rainbow_simple);
    atom.commands.add('atom-text-editor', 'rainbow-csv:rbql', start_rbql);
    var submenu_entries = [];
    submenu_entries.push({label: 'Disable', command: 'rainbow-csv:disable'});
    submenu_entries.push({label: 'Set as separator: Standard dialect', command: 'rainbow-csv:enable-standard'});
    submenu_entries.push({label: 'Set as separator: Simple dialect', command: 'rainbow-csv:enable-simple'});
    submenu_entries.push({label: 'Run SQL-like RBQL query', command: 'rainbow-csv:rbql'});
    var context_items = {'atom-text-editor': [{label: 'Rainbow CSV', submenu: submenu_entries}]};
    atom.contextMenu.add(context_items);
}


function deactivate() {
    if (status_bar_tile)
        status_bar_tile.destroy();
    status_bar_tile = null;
}


function consumeStatusBar(status_bar) {
    // FIXME maybe I can create a button Element with onClick property()
    var ui_column_display = document.createElement('div');
    ui_column_display.textContent = '';
    ui_column_display.setAttribute('class', 'inline-block');
    status_bar_tile = status_bar.addLeftTile({item: ui_column_display, priority: 10});
}


function get_grammar_name(rainbow_delim, policy) {
    var delim_map = new Map();
    delim_map.set('<', 'less-than');
    delim_map.set('>', 'greater-than');
    delim_map.set(':', 'colon');
    delim_map.set('"', 'double-quote');
    delim_map.set('/', 'slash');
    delim_map.set('\\', 'backslash');
    delim_map.set('|', 'pipe');
    delim_map.set('?', 'question-mark');
    delim_map.set('*', 'asterisk');
    delim_map.set('\t', 'tab');
    delim_map.set(' ', 'space');
    var delim_name_part = '[' + rainbow_delim + ']';
    if (delim_map.has(rainbow_delim)) {
        delim_name_part = delim_map.get(rainbow_delim);
    }
    var policy_name_part = (policy === 'simple' ? 'Simple' : 'Standard');
    return 'Rainbow ' + delim_name_part + ' ' + policy_name_part + '.cson';
}


function find_suitable_grammar(rainbow_delim, policy) {
    var rainbow_package_path = atom.packages.resolvePackagePath('rainbow-csv');
    var grammar_name = get_grammar_name(rainbow_delim, policy);
    var grammar_path = path.join(rainbow_package_path, 'custom_grammars', grammar_name);
    var grammar = atom.grammars.readGrammarSync(grammar_path);
    return grammar;
}


function update_records(records, record_key, new_record) {
    for (var i = 0; i < records.length; i++) {
        if (records[i].length && records[i][0] == record_key) {
            records[i] = new_record;
            return;
        }
    }
    records.push(new_record);
}


function write_index(records, index_path) {
    var lines = [];
    for (var i = 0; i < records.length; i++) {
        var record = records[i].slice(0);
        if (record.length >= 2 && record[1] == '\t')
            record[1] = 'TAB';
        lines.push(record.join('\t'));
    }
    fs.writeFileSync(index_path, lines.join('\n'));
}


function try_read_index(index_path) {
    var content = null;
    try {
        content = fs.readFileSync(index_path, 'utf-8');
    } catch (e) {
        console.log('An error has occured while reading index ' + index_path + '; Error: ' + e);
        return [];
    }
    var lines = content.split('\n');
    var records = [];
    for (var i = 0; i < lines.length; i++) {
        if (!lines[i])
            continue;
        var record = lines[i].split('\t');
        records.push(unescape_index_record(record));
    }
    return records;
}


function update_table_record(file_path, delim, policy) {
    if (!file_path)
        return;
    var home_dir = os.homedir();
    var index_path = path.join(home_dir, '.rbql_table_index');
    var records = try_read_index(index_path);
    var new_record = [file_path, delim, policy, ''];
    var record_key = file_path;
    update_records(records, record_key, new_record);
    if (records.length > 100) {
        records.splice(0, 1);
    }
    write_index(records, index_path);
}


function enable_for_selected_delim(policy) {
    var editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
        console.log('delim selection failure: editor not found');
        return;
    }
    var rainbow_delim = editor.getSelectedText();
    if (rainbow_delim.length != 1) {
        atom.notifications.addError('Please select exactly one character to use as rainbow delimiter');
        return;
    }
    var standard_delims = '\t|,;';
    var simple_delims = '\t !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
    if (simple_delims.indexOf(rainbow_delim) == -1) {
        atom.notifications.addError('Selected separator is not supported');
        return;
    }
    if (policy == 'quoted' && standard_delims.indexOf(rainbow_delim) == -1) {
        // By limiting number of standard dialect delims we are helping users to make the right dialect choice
        atom.notifications.addError('"Standard" dialect should not be used with unconventional separators. Try "Simple" dialect instead');
        return;
    }
    do_set_rainbow_grammar(editor, rainbow_delim, policy);
}


function enable_rainbow_quoted() {
    enable_for_selected_delim('quoted');
}


function enable_rainbow_simple() {
    enable_for_selected_delim('simple');
}


function disable_rainbow() {
    var editor = atom.workspace.getActiveTextEditor();
    if (get_rainbow_scope(editor.getGrammar())) {
        do_disable_rainbow(editor);
    }
}

function start_rbql() {
    // FIXME write impl
    // What to use: addBottomPanel vs addFooterPanel vs addModelPanel vs addHeaderPanel
    var editor = atom.workspace.getActiveTextEditor();
    let delim = '';
    let policy = 'monocolumn';
    var rainbow_scope = get_rainbow_scope(editor.getGrammar());
    if (rainbow_scope) {
        delim = rainbow_scope.delim;
        policy = rainbow_scope.policy;
    }
    let sampled_lines = sample_lines(editor);
    if (!sampled_lines || !sampled_lines.length)
        return;
    let aligning_line = sampled_lines.length > 1 ? sampled_lines[1] : sampled_lines[0];
    let fields = smart_split(aligning_line, delim, policy, true)[0];

    let rbql_panel_node = document.createElement('div');
    let column_names_node = document.createElement('div');

    for (let i = 0; i < fields.length; i++) {
        let color_name = 'rainbow' + (i + 1);
        let span_node = document.createElement('span');
        span_node.setAttribute('class', 'syntax--' + color_name);
        span_node.textContent = 'a' + (i + 1) + ' ';
        column_names_node.appendChild(span_node);
    }
    // FIXME test with very long lines that don't fit the screen.
    rbql_panel_node.appendChild(column_names_node);
    rbql_panel_node.setAttribute('style', 'font-size: var(--editor-font-size); font-family: var(--editor-font-family); line-height: var(--editor-line-height)');
    //rbql_panel_node.textContent = 'Hello RBQL!';
    atom.workspace.addBottomPanel({'item': rbql_panel_node});
}


let rainbow_config = {
    'autodetection': {type: 'boolean', default: true, title: "Table files autodetection", description: 'Enable content-based autodetection for csv and tsv files that do not have "*.csv" or "*.tsv" extensions'},
    'rainbow1': {type: 'color', default: '#E6194B', title: "Rainbow Color 1"},
    'rainbow2': {type: 'color', default: '#3CB44B', title: "Rainbow Color 2"},
    'rainbow3': {type: 'color', default: '#FFE119', title: "Rainbow Color 3"},
    'rainbow4': {type: 'color', default: '#0082C8', title: "Rainbow Color 4"},
    'rainbow5': {type: 'color', default: '#FABEBE', title: "Rainbow Color 5"},
    'rainbow6': {type: 'color', default: '#46F0F0', title: "Rainbow Color 6"},
    'rainbow7': {type: 'color', default: '#F032E6', title: "Rainbow Color 7"},
    'rainbow8': {type: 'color', default: '#008080', title: "Rainbow Color 8"},
    'rainbow9': {type: 'color', default: '#F58231', title: "Rainbow Color 9"},
    'rainbow10': {type: 'color', default: '#FFFFFF', title: "Rainbow Color 10"}
};


exports.config = rainbow_config;
exports.activate = activate;
exports.deactivate = deactivate;
exports.consumeStatusBar = consumeStatusBar;
