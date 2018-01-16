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


function smart_split(src, dlm, policy) {
    if (policy === 'simple')
        return [src.split(dlm), false];
    return split_quoted_str(src, dlm);
}


function get_grammar(editor) {
    var grammar = editor.getGrammar();
    // atom assigns "text.plain" if file has .txt extension, otherwise, if extension is unknown it is "text.plain.null-grammar"
    if (!grammar || grammar.scopeName == 'text.plain' || grammar.scopeName == 'text.plain.null-grammar')
        return null;
    return grammar.name;
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
    var candidates = [];
    candidates.push({scope_name: 'text.csv', delim: ',', policy: 'quoted'});
    candidates.push({scope_name: 'text.tsv', delim: '\t', policy: 'simple'});
    for (var i = 0; i < candidates.length; i++) {
        if (is_delimited_table(sampled_lines, candidates[i].delim, candidates[i].policy))
            return candidates[i].scope_name;
    }
    return null;
}


function handle_new_editor(editor) {
    // "editor" is essentially a file view
    var file_path = editor.getPath();
    var autodetection_enabled = atom.config.get('rainbow-csv.autodetection');
    var grammar = get_grammar(editor);
    if (grammar === null && autodetection_enabled) {
        var detected_scope_name = autodetect_delim(editor);
        if (detected_scope_name === null)
            return;
        grammar = atom.grammars.grammarForScopeName(detected_scope_name);
        if (!grammar)
            return;
        editor.setGrammar(grammar);
    }

    cursor_callback = function(event) {
        if (editor.hasMultipleCursors())
            return;
        var position = event.newBufferPosition;
        var line_num = position.row;
        var column = position.column;
        // FIXME show in "status-bar" instead, add column info
        console.log('cursor moved in ' + file_path + ' to ' + line_num + ', ' + column);
    }

    var disposable_subscription = editor.onDidChangeCursorPosition(cursor_callback);
}


function activate(state) {
    prepare_colors();

    var disposable_subscription = atom.workspace.observeTextEditors(handle_new_editor);
}

rainbow_config = {'autodetection': {type: 'boolean', default: true, title: "Table files autodetection", description: 'Enable content-based autodetection for csv and tsv files that do not have "*.csv" or "*.tsv" extensions'}};

exports.activate = activate;
exports.config = rainbow_config;
