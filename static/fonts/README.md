# Bundled newsletter fonts

These fonts are distributed under the SIL Open Font License. Copies of the
licenses are included beside them. They are sourced from Google's fonts
repository and loaded by both the editor and report.

- `GreatVibes-Regular.ttf`: masthead script.
- `Gelasio.ttf` and `Gelasio-Italic.ttf`: variable serif faces, supplied for the
  Georgia and Times New Roman choices in the newsletter's shared stylesheet.
- `Arimo.ttf` and `Arimo-Italic.ttf`: variable sans-serif faces, supplied for the
  Arial choice in the shared stylesheet.

Using these same files on both sides avoids depending on different fonts
installed on Windows, macOS and the Linux print server. Other chosen families
still require matching fonts on both machines.

The optional `NotoEmoji-Regular.ttf` is installed by the existing emoji-font
setup for the WeasyPrint legacy engine. Chromium uses the platform's colour
emoji fonts instead. Its colours may vary by platform.

Font declarations for body type are in `static/src/css/newsletter_layout.css`;
the masthead declaration is in `static/src/scss/elks_masthead_font.scss` and the
QWeb report. Keep the editor and print declarations in agreement when adding
fonts.
