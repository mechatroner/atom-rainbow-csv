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


function get_grammar(editor) {
    var grammar = editor.getGrammar();
    if (!grammar || grammar.name == 'Null Grammar')
        return null;
    return grammar.name;
}


function handle_new_editor(editor) {
    // "editor" is view on some file
    var file_path = editor.getPath();
    //console.log('Rainbow Opening ' + file_path);
    var autodetection_enabled = atom.config.get('rainbow-csv.autodetection');
    console.log("autodetection setting enabled: " + autodetection_enabled);
    var grammar = get_grammar(editor);
    if (grammar === null) {
        // TODO run autodetection and set csv/tsv using "setGrammar()" if successfull, otherwise - exit.
        return;
    }
}

function activate(state) {
    console.log('Activating "rainbow_csv"');
    prepare_colors();

    var disposable_subscription = atom.workspace.observeTextEditors(handle_new_editor);
}

rainbow_config = {'autodetection': {type: 'boolean', default: true, title: "Table files autodetection", description: 'Enable content-based autodetection for csv and tsv files that do not have "*.csv" or "*.tsv" extensions'}};

exports.activate = activate;
exports.config = rainbow_config;
