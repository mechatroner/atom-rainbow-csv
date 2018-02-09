# rainbow_csv

### Main features

* Highlight columns in *.csv and *.tsv and other table files in different rainbow colors.
* Provide info about the current column in status bar.

![screenshot](https://i.imgur.com/zzhST3A.png)


### Usage
rainbow_csv has content-based csv/tsv autodetection mechanism enabled by default. This means that package will analyze plain text files even if they do not have "*.csv" or "*.tsv" extension. You can disable content-based autodetection mechanism at the package settings page.

Rainbow highlighting can also be manually enabled from Atom context menu:
1. Select a character that you want to use as a delimiter with mouse. Delimiter can be any ASCII symbol, e.g. semicolon
2. Right mouse click: context menu -> Rainbow CSV -> Set as separator ...

You can also disable rainbow highlighting and go back to the original file highlighting using the same context menu.
This feature can be used to temporary rainbow-highlight even non-table files.

#### Difference between "Standard" and "Simple" dialects
When manually enabling rainbow highlighting from the context menu, you have to choose between "Standard" and "Simple" dialect.
* __Standard dialect__ will treat quoted separator as a single field. E.g. line `sell,"15,128",23%` will be treated as 3 columns, because the second comma is quoted. This dialect is used by Excel.
* __Simple dialect__ doesn't care about double quotes: the number of highlighted fields is always N + 1 where N is the number of separators.


### References

* This Atom package is an adaptation of Vim's rainbow_csv [plugin](https://github.com/mechatroner/rainbow_csv)
