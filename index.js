var status_bar_tile = null;
var file_headers_cache = new Map();

var rainbow_scopes = [
    {scope_name: 'text.csv', delim: ',', policy: 'quoted'},
    {scope_name: 'text.tsv', delim: '\t', policy: 'simple'}
];


// colors were taken from here: https://sashat.me/2017/01/11/list-of-20-simple-distinct-colors/
var color_entries = [
    ['rainbow1', '#E6194B'],
    ['rainbow2', '#3CB44B'],
    ['rainbow3', '#FFE119'],
    ['rainbow4', '#0082C8'],
    ['rainbow5', '#FABEBE'],
    ['rainbow6', '#46F0F0'],
    ['rainbow7', '#F032E6'],
    ['rainbow8', '#008080'],
    ['rainbow9', '#F58231'],
    ['rainbow10', '#FFFFFF']
];

function prepare_colors() {
    var css_code = '';
    for (var i = 0; i < color_entries.length; i++) {
        css_code += '.syntax--' + color_entries[i][0] + ' { color: ' + color_entries[i][1] + '; }';
    }
    css_code += '.syntax--rainbowerror { color: #FFFFFF; background-color: #FF0000; }';

    var patch_style_node = document.createElement('style');
    patch_style_node.type = 'text/css';
    patch_style_node.innerHTML = css_code;
    document.getElementsByTagName('head')[0].appendChild(patch_style_node);
}


function split_quoted_str(src, dlm, preserve_quotes=false) {
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


function display_position_info(editor, position, rainbow_scope, ui_column_display) {
    var line_num = position.row;
    var column = position.column;
    var line_text = editor.lineTextForBufferRow(line_num);
    var split_result = smart_split(line_text, rainbow_scope.delim, rainbow_scope.policy, true);
    if (split_result[1]) {
        return; 
    }
    var line_fields = split_result[0];
    var field_num = get_field_by_line_position(line_fields, column + 1);
    if (field_num === null)
        return;
    ui_text = 'col# ' + (field_num + 1);
    guessed_header = get_document_header_cached(editor, rainbow_scope);
    if (guessed_header && line_fields.length == guessed_header.length) {
        var column_name = guessed_header[field_num];
        ui_text = ui_text + ', ' + column_name;
    }

    ui_column_display.setAttribute('style', 'color:' + color_entries[field_num % color_entries.length][1]);
    ui_column_display.textContent = ui_text;
}


function get_rainbow_scope(grammar) {
    if (!grammar)
        return null;
    for (var i = 0; i < rainbow_scopes.length; i++) {
        if (rainbow_scopes[i].scope_name == grammar.scopeName)
            return rainbow_scopes[i];
    }
    return null;
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
        var split_result = smart_split(sampled_lines[i], delim, policy);
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


function autodetect_delim(editor) {
    var sampled_lines = sample_lines(editor);
    for (var i = 0; i < rainbow_scopes.length; i++) {
        if (is_delimited_table(sampled_lines, rainbow_scopes[i].delim, rainbow_scopes[i].policy))
            return rainbow_scopes[i].scope_name;
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


function guess_if_header(potential_header, sampled_records) {
    // single line - not header
    if (sampled_records.length < 1)
        return false;

    // different number of columns - not header
    var num_fields = potential_header.length;
    for (var i = 0; i < sampled_records.length; i++) {
        if (sampled_records[i].length != num_fields)
            return false;
    }

    // all sampled lines has a number in a column and potential header doesn't - header
    for (var c = 0; c < num_fields; c++) {
        var number_re = /^-?[0-9]+(?:[.,][0-9]+)?$/;
        if (potential_header[c].match(number_re))
            continue;
        var all_numbers = true;
        for (var i = 0; i < sampled_records.length; i++) {
            if (!sampled_records[i][c].match(number_re)) {
                all_numbers = false;
                break;
            }
        }
        if (all_numbers)
            return true;
    }

    // at least N columns 2 times longer than MAX or 2 times smaller than MIN - header
    var required_extremes_count = num_fields <= 3 ? 1 : Math.ceil(num_fields * 0.333);
    var found_extremes = 0;
    for (var c = 0; c < num_fields; c++) {
        minl = sampled_records[0][c].length;
        maxl = sampled_records[0][c].length;
        for (var i = 1; i < sampled_records.length; i++) {
            minl = Math.min(minl, sampled_records[i][c].length);
            maxl = Math.max(maxl, sampled_records[i][c].length);
        }
        if (potential_header[c].length > maxl * 2) {
            found_extremes += 1;
        }
        if (potential_header[c].length * 2 < minl) {
            found_extremes += 1;
        }
    }
    if (found_extremes >= required_extremes_count)
        return true;

    return false;
}


function guess_document_header(editor, rainbow_scope) {
    var sampled_lines = sample_lines(editor)
    if (sampled_lines.length <= 10)
        return null;
    var first_line = sampled_lines[0];
    sampled_lines.splice(0, 1);
    var split_result = smart_split(first_line, rainbow_scope.delim, rainbow_scope.policy);
    if (split_result[1])
        return null;
    var potential_header = split_result[0];
    var sampled_records = [];
    for (var i = 0; i < sampled_lines.length; i++) {
        split_result = smart_split(sampled_lines[i], rainbow_scope.delim, rainbow_scope.policy);
        if (split_result[1])
            return null;
        sampled_records.push(split_result[0]);
    }
    if (guess_if_header(potential_header, sampled_records))
        return potential_header;
    return null;
}


function get_document_header_cached(editor, rainbow_scope, invalidate=false) {
    var file_path = editor.getPath();
    if (file_headers_cache.has(file_path) && !invalidate) {
        return file_headers_cache.get(file_path);
    }
    var guessed_header = guess_document_header(editor, rainbow_scope);
    file_headers_cache.set(file_path, guessed_header);
    return guessed_header;
}


function show_statusbar_tile(editor, rainbow_scope) {
    if (editor.hasMultipleCursors())
        return;
    if (!status_bar_tile)
        return;
    get_document_header_cached(editor, rainbow_scope, true);
    var ui_column_display = status_bar_tile.getItem();
    if (ui_column_display) {
        var position = editor.getCursorBufferPosition();
        display_position_info(editor, position, rainbow_scope, ui_column_display);
    }
}


function process_editor_switch(editor) {
    if (!editor) {
        hide_statusbar_tile();
        return;
    }
    var rainbow_scope = get_rainbow_scope(editor.getGrammar());
    if (rainbow_scope) {
        show_statusbar_tile(editor, rainbow_scope);
    } else {
        hide_statusbar_tile();
    }
}


function handle_new_editor(editor) {
    var file_path = editor.getPath();
    var autodetection_enabled = atom.config.get('rainbow-csv.autodetection');
    var grammar = editor.getGrammar();
    if (!grammar)
        return; // should never happen
    var plain_text_grammars = ['text.plain', 'text.plain.null-grammar'];
    if (plain_text_grammars.indexOf(grammar.scopeName) != -1 && autodetection_enabled) {
        var detected_scope_name = autodetect_delim(editor);
        if (detected_scope_name === null)
            return;
        grammar = atom.grammars.grammarForScopeName(detected_scope_name);
        if (!grammar)
            return;
        editor.setGrammar(grammar);
    }
    var rainbow_scope = get_rainbow_scope(grammar);
    if (!rainbow_scope)
        return;

    show_statusbar_tile(editor, rainbow_scope);

    cursor_callback = function(event) {
        if (editor.hasMultipleCursors())
            return;
        if (!status_bar_tile)
            return;
        var ui_column_display = status_bar_tile.getItem();
        if (ui_column_display) {
            var position = event.newBufferPosition;
            display_position_info(editor, position, rainbow_scope, ui_column_display);
        }
    }

    var disposable_subscription = editor.onDidChangeCursorPosition(cursor_callback);
}


function activate(state) {
    prepare_colors();
    var disposable_subscription = atom.workspace.observeTextEditors(handle_new_editor);
    var disposable_subscription_2 = atom.workspace.onDidChangeActiveTextEditor(process_editor_switch);
}


function deactivate() {
    if (status_bar_tile)
        status_bar_tile.destroy();
    status_bar_tile = null;
}


function consumeStatusBar(status_bar) {
    var ui_column_display = document.createElement('div');
    ui_column_display.textContent = '';
    ui_column_display.setAttribute('class', 'inline-block');
    status_bar_tile = status_bar.addLeftTile({item: ui_column_display, priority: 10});
}


rainbow_config = {'autodetection': {type: 'boolean', default: true, title: "Table files autodetection", description: 'Enable content-based autodetection for csv and tsv files that do not have "*.csv" or "*.tsv" extensions'}};


exports.config = rainbow_config;
exports.activate = activate;
exports.deactivate = deactivate;
exports.consumeStatusBar = consumeStatusBar;
