# Lumen

**English** · [Español](README.es.md)

**Download video and music from over 1,000 sites with a polished desktop app.**
Lumen is a Windows app built on [yt-dlp](https://github.com/yt-dlp/yt-dlp):
paste a link, pick a quality and you’re done — no command line needed.

![Lumen with a video analyzed: the background takes on the video’s colors](docs/en-2-video.png)

## Download

Go to [**Releases**](../../releases/latest) and download either:

- **`Lumen-Setup.exe`** (recommended): installs Lumen for your user, with a
  Start menu entry and an uninstaller. No administrator rights needed.
- **`Lumen.zip`** (portable): unzip it anywhere and open `Lumen\Lumen.exe`.

Nothing else to install: ffmpeg and deno are bundled, and Lumen keeps yt-dlp
up to date by itself.

> **First run:** Windows may show “Windows protected your PC” because the app
> isn’t digitally signed. Click **More info → Run anyway**. You can check that
> the file is the original with its SHA-256 hash, listed on each release page.

**Requirements:** 64-bit Windows 10 or 11 with WebView2 (included in Windows 11
and in up-to-date Windows 10).

## Features

- **Video as MP4, MKV or WebM** (MKV keeps the best codec, such as AV1), or
  **audio only** as MP3, M4A, OPUS, FLAC or WAV, with the **estimated size** of
  each quality (144p to 4K) before you download. MP3 bitrate is configurable.
- **Downloads start instantly**: Lumen reuses the analysis it already did
  instead of asking the site again.
- **Subtitles in the language you choose**, from those the video has.
- **Scheduled downloads**: pick a time (for example, overnight) and the download
  waits in the list, even if you close Lumen.
- **Search without leaving the app**: type words instead of a link and pick a
  result.
- **Split by chapters**: one file per chapter, in its own folder.
- **Download just a clip**: pick the start and end with a slider that shows the
  frame at each moment, and watch the clip before downloading it.
- **Playlists**: choose which videos you want.
- **Several links at once**: paste a block of text with links and they’re queued.
- **Flexible queue**: pause, resume (it continues where it left off) and reorder
  downloads.
- **Extension for Chrome, Edge and Brave**: a “Download” button under YouTube
  videos shows each quality with its size and hands the download to Lumen with
  your preferences, without leaving the browser. On any other site, the toolbar
  button does the same. Install it from **Settings → Show folder** (it ships with
  Lumen). There’s also a bookmark that sends the page you’re watching to Lumen.
- **Keeps working in the system tray** if you close the window while downloading.
- **Always up to date**: yt-dlp updates itself in the background, and the
  installed version of Lumen updates itself with one click (the download is
  checked against the SHA-256 published on GitHub).
- **Ambient mode**: the black background lights up with the video’s colors.
- **Copied links are detected** and analyzed ahead of time, so they’re usually
  ready instantly.
- **English, Spanish, Portuguese or French**, following your Windows language (changeable in Settings).
- Embedded cover art and metadata, subtitles, searchable history, Windows
  notifications, light and dark themes, speed limit and more.

![Choosing a clip with frame previews and a video preview](docs/en-3-clip.png)

## FAQ

**YouTube says “Sign in to confirm you’re not a bot”, or a video is age-restricted.**
Open **Settings → Use browser session** and pick the browser where you’re signed
in. With Chrome, Edge or Brave, close the browser before downloading; Firefox
works while open.

**A site that used to work has stopped working.**
Sites change often and yt-dlp is updated to keep up. Lumen downloads new yt-dlp
versions by itself (**Settings → Check for updates** forces it); the new version
is used the next time you open Lumen.

**Where are settings and history stored?**
In `%APPDATA%\Lumen`. Deleting that folder resets Lumen.

## Building from source

You need Python 3.12 or later on Windows.

```bash
python -m pip install -U "yt-dlp[curl-cffi]" yt-dlp-ejs mutagen pywebview pystray pillow pyinstaller
```

To try it without building: `python app.py` (or double-click `Abrir Lumen.bat`).

To build `Lumen.exe`, first place the bundled tools in `vendor/` (they aren’t in
the repository because of their size):

- `vendor/ffmpeg/`: the contents of the `bin` folder of
  `ffmpeg-master-latest-win64-gpl-shared.zip` from
  [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds/releases), without `ffplay.exe`.
- `vendor/deno/deno.exe`: from `deno-x86_64-pc-windows-msvc.zip` from
  [denoland/deno](https://github.com/denoland/deno/releases).

Then:

```bash
python tools/collect_licenses.py
python tools/build.py
```

The result is in `dist/Lumen/`, zipped as `dist/Lumen.zip`, and, if
[Inno Setup 6](https://jrsoftware.org/isinfo.php) is installed, as the installer
`dist/Lumen-Setup.exe`.

To sign `Lumen.exe`, the installer and the uninstaller, set
`LUMEN_SIGN_THUMBPRINT` (a code signing certificate in your user store) or
`LUMEN_SIGN_PFX` and `LUMEN_SIGN_PASSWORD` before building; see
[`tools/sign.ps1`](tools/sign.ps1).

Translations live in [`web/i18n.js`](web/i18n.js): the Spanish text is the key
and each language has its own dictionary. `python tools/check_i18n.py` lists
missing texts.

## License

Lumen’s source code is released under the [MIT license](LICENSE).

`Lumen.exe` bundles third-party software under its own licenses, including
**FFmpeg (GPLv3)**, **mutagen (GPLv2+)**, deno (MIT) and yt-dlp (Unlicense), so the distributed
`Lumen.exe` as a whole is subject to the GNU GPL. The full list, with links
to the source code, is in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and
the license texts are in [licenses/](licenses).

## Disclaimer

Lumen is a tool for downloading content you have the right to access. You are
responsible for respecting copyright and each site’s terms of use. Lumen is not
affiliated with YouTube or any other site.

Screenshots show *Spring* by Blender Studio, released under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
