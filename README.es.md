# Lumen

[English](README.md) · **Español**

**Descarga videos y música de más de 1.000 sitios con una interfaz cuidada.**
Lumen es una aplicación de escritorio para Windows construida sobre
[yt-dlp](https://github.com/yt-dlp/yt-dlp): pegas un enlace, eliges la calidad
y listo, sin tocar la línea de comandos.

![Lumen con un video analizado: el fondo toma los colores del video](docs/es-2-video.png)

## Descargar

Ve a [**Releases**](../../releases/latest) y descarga uno de estos:

- **`Lumen-Setup.exe`** (recomendado): instala Lumen para tu usuario, con acceso
  en el menú Inicio y desinstalador. No pide permisos de administrador.
- **`Lumen.zip`** (portable): descomprímelo donde quieras y abre `Lumen\Lumen.exe`.

No hace falta instalar nada más: ffmpeg y deno ya vienen incluidos, y Lumen
mantiene yt-dlp actualizado por su cuenta.

> **Primera vez:** Windows puede mostrar «Windows protegió su PC», porque el
> programa no está firmado digitalmente. Pulsa **Más información → Ejecutar de
> todas formas**. Puedes comprobar que el archivo es el original con su huella
> SHA-256, que aparece en la página de cada versión.

**Requisitos:** Windows 10 u 11 de 64 bits con WebView2 (viene con Windows 11 y
con los Windows 10 actualizados).

## Qué hace

- **Video en MP4, MKV o WebM** (MKV guarda el mejor códec, como AV1), o **solo
  audio** en MP3, M4A, OPUS, FLAC o WAV, con el **tamaño estimado** de cada
  calidad (de 144p a 4K) antes de descargar. La calidad del MP3 se puede elegir.
- **Las descargas empiezan al instante**: Lumen aprovecha el análisis que ya hizo
  en lugar de volver a consultar el sitio.
- **Subtítulos en el idioma que elijas**, entre los que tiene el video.
- **Descargas programadas**: eliges una hora (de madrugada, por ejemplo) y la
  descarga espera en la lista, aunque cierres Lumen.
- **Busca sin salir de la app**: escribe palabras en lugar de un enlace y elige
  un resultado.
- **Dividir por capítulos**: un archivo por capítulo, en su propia carpeta.
- **Solo un fragmento**: eliges inicio y fin con un deslizador que muestra el
  fotograma de cada momento, y puedes ver el fragmento antes de descargarlo.
- **Listas de reproducción**: marcas qué videos quieres.
- **Varios enlaces a la vez**: pega un texto con varios y se ponen en cola.
- **Cola flexible**: pausa, reanuda (sigue donde se quedó) y reordena descargas.
- **Extensión para Chrome, Edge, Brave y Firefox**: un botón «Descargar» debajo
  de los videos de YouTube muestra las calidades con su tamaño y le pasa la
  descarga a Lumen con tus preferencias, sin salir del navegador. En cualquier
  otro sitio, el botón de la barra hace lo mismo. Se instala desde **Ajustes →
  Extensión del navegador**: en Firefox basta con pulsar «Agregar»; en Chrome,
  Edge y Brave Lumen te guía en tres pasos (esos navegadores no dejan que un
  programa les instale extensiones de fuera de su tienda). También hay un
  marcador que manda a Lumen la página que estás viendo.
- **Sigue en la bandeja del sistema** si cierras la ventana con descargas en curso.
- **Siempre al día**: yt-dlp se actualiza solo en segundo plano, y la versión
  instalada de Lumen se actualiza con un clic (la descarga se comprueba con la
  huella SHA-256 que publica GitHub).
- **Modo ambiente**: el fondo, negro, se ilumina con los colores del video.
- **Detecta enlaces copiados** y los analiza de antemano, así que suelen estar
  listos al instante.
- **En español, inglés, portugués o francés**, según el idioma de Windows (se cambia en Ajustes).
- Portada y metadatos incrustados, subtítulos, historial con buscador, avisos de
  Windows al terminar, tema claro y oscuro, límite de velocidad y más.

![Elegir un fragmento con vista previa del fotograma y del video](docs/es-3-fragmento.png)

## Preguntas frecuentes

**YouTube dice «Confirma que no eres un bot» o un video tiene restricción de edad.**
Abre **Ajustes → Usar sesión del navegador** y elige el navegador en el que
tienes tu sesión iniciada. Con Chrome, Edge o Brave, ciérralo antes de
descargar; Firefox funciona abierto.

**Un sitio que antes funcionaba dejó de hacerlo.**
Los sitios cambian a menudo y yt-dlp se actualiza para seguirles el ritmo. Lumen
descarga las versiones nuevas de yt-dlp por su cuenta (**Ajustes → Buscar
actualización** lo fuerza); la nueva se usa la próxima vez que abras Lumen.

**¿Dónde guarda los ajustes y el historial?**
En `%APPDATA%\Lumen`. Borrar esa carpeta deja Lumen como recién instalado.

## Compilar desde el código

Necesitas Python 3.12 o posterior en Windows.

```bash
python -m pip install -U "yt-dlp[curl-cffi]" yt-dlp-ejs mutagen pywebview pystray pillow pyinstaller
```

Para probarlo sin compilar: `python app.py` (o doble clic en `Abrir Lumen.bat`).

Para generar `Lumen.exe`, coloca primero en `vendor/` las herramientas que se
incluyen (no están en el repositorio por su tamaño):

- `vendor/ffmpeg/`: el contenido de la carpeta `bin` de
  `ffmpeg-master-latest-win64-gpl-shared.zip`, de
  [yt-dlp/FFmpeg-Builds](https://github.com/yt-dlp/FFmpeg-Builds/releases), sin `ffplay.exe`.
- `vendor/deno/deno.exe`: de `deno-x86_64-pc-windows-msvc.zip`, de
  [denoland/deno](https://github.com/denoland/deno/releases).

Después:

```bash
python tools/collect_licenses.py
python tools/build.py
```

El resultado queda en `dist/Lumen/`, comprimido en `dist/Lumen.zip` y, si tienes
[Inno Setup 6](https://jrsoftware.org/isinfo.php), como instalador en
`dist/Lumen-Setup.exe`.

Para firmar `Lumen.exe`, el instalador y el desinstalador, define antes de
compilar `LUMEN_SIGN_THUMBPRINT` (un certificado de firma de código en tu
almacén de usuario) o `LUMEN_SIGN_PFX` y `LUMEN_SIGN_PASSWORD`; mira
[`tools/sign.ps1`](tools/sign.ps1).

La extensión está en [`extension/`](extension). `tools/build.py` prepara
también la versión para Firefox (`python tools/build_extension.py`): Firefox
solo instala extensiones firmadas por Mozilla, así que con las claves de API de
addons.mozilla.org en `WEB_EXT_API_KEY` y `WEB_EXT_API_SECRET` la firma sola
(como «no listada»); sin ellas, deja `dist/lumen-firefox.zip` para firmarlo a
mano y guardar el resultado como `dist/lumen-firefox.xpi`.

Las traducciones están en [`web/i18n.js`](web/i18n.js): el texto en español es
la clave y cada idioma tiene su diccionario. `python tools/check_i18n.py` dice
qué textos faltan.

## Licencia

El código de Lumen se publica bajo la [licencia MIT](LICENSE).

`Lumen.exe` incluye programas de terceros con sus propias licencias, entre ellos
**FFmpeg (GPLv3)**, **mutagen (GPLv2+)**, deno (MIT) y yt-dlp (Unlicense), por lo que
`Lumen.exe` en conjunto se distribuye bajo las condiciones de la GNU GPL. La lista completa, con los
enlaces al código fuente, está en [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
y los textos de las licencias en [licenses/](licenses).

## Aviso

Lumen es una herramienta para descargar contenido al que tienes derecho a
acceder. Eres responsable de respetar los derechos de autor y las condiciones de
uso de cada sitio. Lumen no está afiliado a YouTube ni a ningún otro sitio.

Las capturas muestran *Spring*, de Blender Studio, publicado bajo
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
