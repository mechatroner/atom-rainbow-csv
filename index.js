function activate(state) {
    console.log('Activating "rainbow_csv"');

    var new_style = document.createElement('style');
    new_style.type = 'text/css';
    new_style.innerHTML = '.syntax--rainbow3 { color: #00FF00; }';
    document.getElementsByTagName('head')[0].appendChild(new_style);
}

exports.activate = activate;
