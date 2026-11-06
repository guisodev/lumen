# Avisos de terceros

Lumen.exe incluye los siguientes programas y librerías de terceros. Cada uno
conserva su propia licencia; los textos completos están en la carpeta
`licenses/` que acompaña al programa.

## Programas incluidos

### FFmpeg (ffmpeg.exe, ffprobe.exe y sus .dll)

- Versión: `N-128340-gf80a436ffd-20261102`
- Licencia: **GNU GPL versión 3** (compilado con `--enable-gpl --enable-version3`).
  Texto completo: `licenses/ffmpeg/COPYING.GPLv3.txt`.
- Compilación usada: `ffmpeg-master-latest-win64-gpl-shared.zip` de
  <https://github.com/yt-dlp/FFmpeg-Builds> (versión del 2 de noviembre de 2026).
- **Código fuente correspondiente:**
  - FFmpeg en el commit `f80a436ffd`: <https://github.com/FFmpeg/FFmpeg/commit/f80a436ffd>
  - Scripts y versiones de las librerías con las que se compiló:
    <https://github.com/yt-dlp/FFmpeg-Builds>

  Si no puedes obtenerlo por esos enlaces, abre un *issue* en el repositorio de
  Lumen y te facilitaremos una copia del código fuente de esta versión exacta.

FFmpeg se ejecuta como programa aparte; Lumen no lo modifica ni se enlaza con él.

### deno (deno.exe)

- Versión: 2.9.8 — <https://github.com/denoland/deno>
- Licencia: MIT. Texto: `licenses/deno/LICENSE.md`.

## Librerías de Python dentro de Lumen.exe

| Componente | Versión | Licencia |
|---|---|---|
| Python | 3.14.4 | PSF (incluye OpenSSL, libffi y SQLite) |
| yt-dlp | 2026.10.26 | Unlicense |
| yt-dlp-ejs | 0.8.0 | Unlicense, MIT e ISC |
| pywebview | 6.2.1 | BSD-3-Clause |
| pythonnet | 3.2.1 | MIT |
| clr_loader | 0.3.1 | MIT |
| cffi | 2.1.1 | MIT-0 |
| pycparser | 3.12 | BSD-3-Clause |
| bottle | 0.13.4 | MIT |
| proxy_tools | 0.1.0 | MIT (<https://github.com/jtushman/proxy_tools>) |
| certifi | 2026.10.23 | MPL-2.0 (<https://github.com/certifi/python-certifi>) |
| curl_cffi | 0.17.0 | MIT (<https://github.com/lexiforest/curl_cffi>); incluye libcurl-impersonate (licencia de curl) y BoringSSL (licencia OpenSSL/ISC) |
| mutagen | 1.48.1 | **GPL-2.0-or-later** (<https://github.com/quodlibet/mutagen>) |
| packaging | 26.1 | Apache-2.0 o BSD-2-Clause |
| setuptools | 84.2.1 | MIT |
| typing_extensions | 4.15.0 | PSF-2.0 |
| PyInstaller (arrancador) | 6.22.3 | GPLv2 con excepción para el arrancador, que permite distribuir el programa empaquetado con cualquier licencia |

Los textos de estas licencias están en `licenses/python/`.

### Sobre la GPL de mutagen

mutagen (GPL versión 2 o posterior) se ejecuta dentro del mismo proceso que
Lumen, así que **Lumen.exe, como programa combinado, se distribuye bajo las
condiciones de la GNU GPL**. El código propio de Lumen sigue publicándose bajo la
licencia MIT, compatible con la GPL, y todo el código fuente correspondiente está
disponible: el de Lumen en su repositorio y el de cada componente en los enlaces
de esta página.

## Microsoft Visual C++ Runtime

`VCRUNTIME140.dll`, `ucrtbase.dll` y las `api-ms-win-*.dll` son librerías
redistribuibles de Microsoft que acompañan a Python.
