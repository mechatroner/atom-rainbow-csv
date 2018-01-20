# rainbow_csv

#### Main features

* Highlight columns in *.csv and *.tsv files in different rainbow colors.
* Provide info about the current column in status bar.

![screenshot](https://i.imgur.com/zzhST3A.png)


#### Usage
rainbow_csv has content-based csv/tsv autodetection mechanism enabled by default. This means that package will analyze plain text files even if they do not have "*.csv" or "*.tsv" extension. You can disable content-based autodetection mechanism at the package settings page.

If autodetection mechanism was disabled or failed, you can manually enable highlighting using Atom's menu:
```
[Edit] -> [Select Grammar] -> [CSV|TSV]
```


#### References

* This Atom package is an adaptation of Vim's rainbow_csv [plugin](https://github.com/mechatroner/rainbow_csv)
