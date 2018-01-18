var status_bar_tile = null;
var file_headers_cache = new Map();

var rainbow_scopes = [
    {scope_name: 'text.csv', delim: ',', policy: 'quoted'},
    {scope_name: 'text.tsv', delim: '\t', policy: 'simple'}
];


function prepare_colors() {
    // colors were taken from here: https://sashat.me/2017/01/11/list-of-20-simple-distinct-colors/
    var color_entries = []
    color_entries.push(['rainbow1', '#E6194B'])
    color_entries.push(['rainbow2', '#3CB44B'])
    color_entries.push(['rainbow3', '#FFE119'])
    color_entries.push(['rainbow4', '#0082C8'])
    color_entries.push(['rainbow5', '#FABEBE'])
    color_entries.push(['rainbow6', '#46F0F0'])
    color_entries.push(['rainbow7', '#F032E6'])
    color_entries.push(['rainbow8', '#008080'])
    color_entries.push(['rainbow9', '#F58231'])
    color_entries.push(['rainbow10', '#FFFFFF'])

    var css_code = '';
    for (var i = 0; i < color_entries.length; i++) {
        css_code += '.syntax--' + color_entries[i][0] + ' { color: ' + color_entries[i][1] + '; }';
    }

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


function generate_display_text(editor, position, rainbow_scope) {
    var line_num = position.row;
    var column = position.column;
    var line_text = editor.lineTextForBufferRow(line_num);
    var split_result = smart_split(line_text, rainbow_scope.delim, rainbow_scope.policy, true);
    if (split_result[1]) {
        return '';
    }
    var line_fields = split_result[0];
    var field_num = get_field_by_line_position(line_fields, column + 1);
    if (field_num === null)
        return '';
    return '' + (field_num + 1);
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


function guess_document_header(editor) {
    var sampled_lines = sample_lines(editor)
    if (sampled_lines.length <= 10)
        return null;
    var header_line = sampled_lines[0];
    sampled_lines.splice(0, 1);
    //FIXME finish the function
}


function show_statusbar_tile(editor, rainbow_scope) {
    if (editor.hasMultipleCursors())
        return;
    if (!status_bar_tile)
        return;
    // FIXME force cache recalculation for this file
    var ui_column_display = status_bar_tile.getItem();
    if (ui_column_display) {
        var position = editor.getCursorBufferPosition();
        //var line_num = position.row;
        //var column = position.column;
        //ui_column_display.textContent = line_num + ', ' + column;
        ui_column_display.textContent = generate_display_text(editor, position, rainbow_scope);
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
    // "editor" is essentially a file view
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
            //var line_num = position.row;
            //var column = position.column;
            //var line_text = editor.lineTextForBufferRow(line_num);
            //var split_result = smart_split(line_text, rainbow_scope.delim, rainbow_scope.policy);
            //if (split_result[1]) {
            //    hide_statusbar_tile();
            //    return;
            //}
            //var line_fields = split_result[0];
            //ui_column_display.textContent = line_num + ', ' + column;
            ui_column_display.textContent = generate_display_text(editor, position, rainbow_scope);
        }
        console.log('cursor moved in ' + file_path + ' to ' + position.row + ', ' + position.column);
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
    ui_column_display.setAttribute('style', 'color:#E6194B');
    status_bar_tile = status_bar.addLeftTile({item: ui_column_display, priority: 10});
}


rainbow_config = {'autodetection': {type: 'boolean', default: true, title: "Table files autodetection", description: 'Enable content-based autodetection for csv and tsv files that do not have "*.csv" or "*.tsv" extensions'}};


exports.config = rainbow_config;
exports.activate = activate;
exports.deactivate = deactivate;
exports.consumeStatusBar = consumeStatusBar;
