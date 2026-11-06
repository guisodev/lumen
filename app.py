"""Lumen: interfaz de escritorio para yt-dlp.

Ejecuta `python app.py` y se abre en su propia ventana (pywebview). Si
pywebview no está instalado, o con `--browser`, se abre en el navegador.
Todo corre en tu PC (127.0.0.1).
"""
import atexit
import ctypes
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import webbrowser
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from urllib.parse import parse_qs, urlparse

# En el .exe sin consola, sys.stdout/stderr son None y cualquier escritura
# (de yt-dlp, por ejemplo) rompería: los mandamos a la nada.
for _stream in ("stdout", "stderr"):
    if getattr(sys, _stream) is None:
        setattr(sys, _stream, open(os.devnull, "w", encoding="utf-8"))

try:
    import yt_dlp
    from yt_dlp.utils import DownloadCancelled, download_range_func
except ImportError:
    msg = "Falta yt-dlp. Instálalo con:\n\n    python -m pip install -U yt-dlp"
    if os.name == "nt":
        ctypes.windll.user32.MessageBoxW(None, msg, "Lumen", 0x10)
    else:
        print(msg)
    sys.exit(1)

# Con PyInstaller los archivos van dentro de _MEIPASS; los datos del usuario
# se guardan en %APPDATA% para que funcione aunque la carpeta sea de solo lectura.
ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
WEB = ROOT / "web"
APP_NAME = "Lumen"
DATA = Path(os.environ.get("APPDATA") or Path.home()) / "Lumen"
_OLD_DATA = DATA.with_name("yt-dlp-studio")  # nombre anterior de la app
if _OLD_DATA.is_dir() and not DATA.exists():
    try:
        _OLD_DATA.rename(DATA)  # conserva ajustes e historial
    except OSError:
        pass
DATA.mkdir(parents=True, exist_ok=True)
SETTINGS_FILE = DATA / "settings.json"
HISTORY_FILE = DATA / "history.json"
HOST = "127.0.0.1"
NO_WINDOW = 0x08000000 if os.name == "nt" else 0
HISTORY_LIMIT = 300

# ffmpeg y deno incluidos: dentro del .exe están junto al programa; al
# ejecutar app.py, en vendor/ (los deja ahí tools/build.py).
for _base in (ROOT, ROOT / "vendor"):
    if (_base / "ffmpeg" / "ffmpeg.exe").is_file():
        os.environ["PATH"] = str(_base / "ffmpeg") + os.pathsep + os.environ.get("PATH", "")
        break
DENO = next((p for p in (ROOT / "deno" / "deno.exe", ROOT / "vendor" / "deno" / "deno.exe") if p.is_file()), None)

ANSI = re.compile(r"\x1b\[[0-9;]*m")
URL_RE = re.compile(r"https?://[^\s<>\"']+")
ACTIVE = ("queued", "starting", "downloading", "processing")

# Claves de PostProcessor.pp_key() (sin el prefijo "FFmpeg").
PP_LABELS = {
    "Merger": "Uniendo video y audio",
    "ExtractAudio": "Convirtiendo audio",
    "Metadata": "Añadiendo metadatos",
    "EmbedThumbnail": "Incrustando portada",
    "ThumbnailsConvertor": "Preparando portada",
    "EmbedSubtitle": "Incrustando subtítulos",
    "VideoRemuxer": "Reempaquetando",
    "FixupM3u8": "Reparando video",
    "FixupM4a": "Reparando audio",
    "SplitChapters": "Cortando fragmento",
    "MoveFiles": "Finalizando",
}

TEMPLATES = {
    "title_id": "%(title)s [%(id)s]",
    "title": "%(title)s",
    "channel_title": "%(uploader,channel|Desconocido)s - %(title)s",
    "date_title": "%(upload_date>%Y-%m-%d|)s %(title)s",
}

# Mensajes de yt-dlp → explicación en castellano. El orden importa.
FRIENDLY_ERRORS = [
    (r"confirm your age|age-restricted|inappropriate for some users",
     "Este video tiene restricción de edad. Activa «Usar sesión del navegador» en Ajustes."),
    (r"not a bot", "YouTube pide comprobar que no eres un bot. Activa «Usar sesión del navegador» en Ajustes o actualiza yt-dlp."),
    (r"logged.?in|login required|requires? (an )?(account|authentication)|log in to",
     "Este sitio pide iniciar sesión. Activa «Usar sesión del navegador» en Ajustes."),
    (r"cookie database|DPAPI|decrypt|could not (copy|find) .*cookie",
     "No se pudieron leer las cookies del navegador. Ciérralo por completo o prueba con Firefox."),
    (r"Private video", "Este video es privado."),
    (r"members-only|Join this channel", "Este video es solo para miembros del canal."),
    (r"not available in your country|geo.?restrict", "Este video no está disponible en tu país."),
    (r"live event will begin|Premieres in", "El directo o estreno todavía no ha empezado."),
    (r"Unsupported URL", "Este sitio o enlace no es compatible."),
    (r"is not a valid URL", "Eso no parece un enlace válido."),
    (r"Requested format is not available", "La calidad elegida no está disponible. Prueba con «Máxima»."),
    (r"Invalid argument", "La ruta es demasiado larga o tiene caracteres no válidos. Prueba con una carpeta más corta."),
    (r"ffmpeg|ffprobe", "Falta ffmpeg o falló al procesar el archivo."),
    (r"HTTP Error 429|Too Many Requests", "El sitio te bloqueó por demasiadas peticiones. Espera unos minutos."),
    (r"HTTP Error 403", "El sitio denegó la descarga. Actualiza yt-dlp e inténtalo de nuevo."),
    (r"unavailable|has been removed|does not exist|HTTP Error 404",
     "No está disponible: puede que no exista, sea privado o lo hayan eliminado."),
    (r"No space left|Errno 28", "No queda espacio en el disco."),
    (r"Permission denied|Errno 13", "No hay permiso para escribir en esa carpeta."),
    (r"getaddrinfo|Unable to download webpage|timed out|Connection", "No hay conexión o el sitio no responde."),
]


def clean(msg):
    return ANSI.sub("", str(msg)).replace("ERROR: ", "", 1).strip()


def friendly(msg):
    for pattern, text in FRIENDLY_ERRORS:
        if re.search(pattern, msg, re.I):
            return text
    return msg


class AppError(Exception):
    def __init__(self, raw):
        self.raw = clean(raw)
        super().__init__(friendly(self.raw))


# ---------- ajustes ----------

DEFAULTS = {
    "folder": str(Path.home() / "Downloads"), "mode": "video", "quality": "best",
    "audio_format": "mp3", "meta": True, "subs": False,
    "parallel": 3, "ratelimit": 0, "template": "title_id", "custom_template": "",
    "cookies": "", "notify": True, "sound": True, "clipboard": True, "theme": "system", "ambient": True,
    "lang": "auto",
}
settings_lock = threading.Lock()


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def write_json(path, data):
    tmp = path.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, path)
    except OSError:
        pass


settings = DEFAULTS | {k: v for k, v in read_json(SETTINGS_FILE, {}).items() if k in DEFAULTS}


def save_settings(data):
    with settings_lock:
        settings.update({k: v for k, v in data.items() if k in DEFAULTS})
        write_json(SETTINGS_FILE, settings)


# ---------- idioma ----------
# La app está escrita en español; web/i18n.js tiene las traducciones al inglés
# con el texto en español como clave. El servidor las lee de ahí para lo poco
# que muestra él mismo (las notificaciones de Windows).

def ui_lang():
    """'es' o 'en': el elegido en Ajustes o, en automático, el idioma de Windows."""
    if settings.get("lang") in ("es", "en"):
        return settings["lang"]
    try:
        primary = ctypes.windll.kernel32.GetUserDefaultUILanguage() & 0x3FF
        return "es" if primary == 0x0A else "en"  # 0x0A = LANG_SPANISH
    except Exception:
        import locale
        return "es" if (locale.getlocale()[0] or "").lower().startswith("es") else "en"


_EN = None


def tr(es):
    global _EN
    if ui_lang() != "en":
        return es
    if _EN is None:
        try:
            text = (WEB / "i18n.js").read_text(encoding="utf-8")
            _EN = dict(re.findall(r"^\s*'(.+?)': '(.*)',\s*$", text, re.M))
        except OSError:
            _EN = {}
    return _EN.get(es, es)


def base_opts():
    opts = {"quiet": True, "no_warnings": True, "noplaylist": True}
    if DENO:  # YouTube pide resolver retos en JavaScript; deno lo hace bien y rápido
        opts["js_runtimes"] = {"deno": {"path": str(DENO)}}
    if settings.get("cookies"):
        opts["cookiesfrombrowser"] = (settings["cookies"],)
    return opts


# ---------- información del enlace ----------

def pick_thumb(entry, max_width=None):
    thumbs = [t for t in entry.get("thumbnails") or [] if t.get("url")]
    if max_width:
        small = [t for t in thumbs if (t.get("width") or 0) and t["width"] <= max_width]
        if small:
            return max(small, key=lambda t: t["width"])["url"]
    return entry.get("thumbnail") or (thumbs[-1]["url"] if thumbs else None)


def codec_name(vcodec):
    v = (vcodec or "").lower()
    for prefix, name in (("avc", "H.264"), ("h264", "H.264"), ("vp09", "VP9"), ("vp9", "VP9"),
                         ("av01", "AV1"), ("hev", "H.265"), ("hvc", "H.265")):
        if v.startswith(prefix):
            return name
    return v.split(".")[0].upper() or None


def fmt_size(f, duration):
    size = f.get("filesize") or f.get("filesize_approx")
    if not size and f.get("tbr") and duration:
        size = f["tbr"] * 1000 / 8 * duration
    return size or 0


def short_side(f):
    return min(x for x in (f.get("height"), f.get("width")) if x)


TIERS = (144, 240, 360, 480, 720, 1080, 1440, 2160, 4320)


def nominal_res(f):
    """Nombre estándar de la calidad (como lo llama YouTube): un 1920×804 de
    cine o un 1080×1920 vertical son "1080p", no "804p" ni "1920p"."""
    long_side = max(x for x in (f.get("height"), f.get("width")) if x)
    target = long_side * 9 / 16
    return max((t for t in TIERS if t <= target * 1.1), default=TIERS[0])


def video_format(quality):
    return {"format": "bv*+ba/b",
            "format_sort": ["res" if quality == "best" else f"res:{quality}", "fps", "vcodec:h264", "acodec:aac"]}


def quality_options(info):
    """Tamaño e insignias reales de cada calidad. Ordena los formatos una sola
    vez con el mismo criterio que la descarga (video_format) y toma el primero
    de cada resolución: equivale a preguntar a yt-dlp por cada calidad, pero en
    milisegundos en lugar de más de un segundo."""
    dur = info.get("duration") or 0
    raw = {"formats": json.loads(json.dumps(yt_dlp.YoutubeDL.sanitize_info(info).get("formats") or []))}
    with yt_dlp.YoutubeDL(base_opts() | {"format_sort": video_format("best")["format_sort"][1:]}) as ydl:
        ydl.sort_formats(raw)
    ranked = raw["formats"][::-1]  # sort_formats deja el mejor al final
    has_video = lambda f: f.get("height") and f.get("vcodec") not in (None, "none")
    best_audio = next((f for f in ranked if f.get("vcodec") == "none" and f.get("acodec") not in (None, "none")), None)
    audio_size = fmt_size(best_audio, dur) if best_audio else 0

    out, seen = [], set()
    for video in (f for f in ranked if has_video(f)):
        res = short_side(video)
        if res in seen:
            continue
        seen.add(res)
        muxed = video.get("acodec") not in (None, "none")
        out.append({"res": res, "label": nominal_res(video),
                    "size": (fmt_size(video, dur) + (0 if muxed else audio_size)) or None,
                    "fps": video.get("fps"), "codec": codec_name(video.get("vcodec")),
                    "hdr": (video.get("dynamic_range") or "SDR") != "SDR"})
    out.sort(key=lambda q: q["res"], reverse=True)
    audio = {"size": audio_size or None, "abr": best_audio.get("abr") if best_audio else None}
    return out, audio


INFO_TTL = 600  # s que se reutiliza un análisis (los enlaces de YouTube caducan en horas)
info_cache = {}   # url -> (momento, resultado)
info_pending = {}  # url -> Event: análisis en curso, para no repetirlo si llega otra petición
info_lock = threading.Lock()


def get_info(url):
    """Análisis con caché: si el enlace ya se analizó (o se está analizando de
    antemano porque lo copiaste), la respuesta es inmediata."""
    with info_lock:
        hit = info_cache.get(url)
        if hit and time.time() - hit[0] < INFO_TTL:
            return revive(hit)
        pending = info_pending.get(url)
        if not pending:
            info_pending[url] = threading.Event()
    if pending:
        pending.wait(60)
        with info_lock:
            hit = info_cache.get(url)
        if hit:
            return revive(hit)
        return get_info(url)  # el análisis anticipado falló: lo intentamos nosotros
    try:
        result = _get_info(url)
        if result.get("thumbnail"):
            allowed_images.add(result["thumbnail"])
        with info_lock:
            info_cache[url] = (time.time(), result, analyzed.get(result.get("key")))
            for old in [u for u, hit in info_cache.items() if time.time() - hit[0] > INFO_TTL]:
                info_cache.pop(old, None)
        return result
    finally:
        with info_lock:
            info_pending.pop(url, None).set()


def revive(hit):
    """Un análisis de la caché vuelve a ser el más reciente para las vistas previas."""
    _, result, entry = hit
    key = result.get("key")
    if key and entry:
        analyzed[key] = entry
        analyzed.move_to_end(key)
        while len(analyzed) > 8:
            analyzed.popitem(last=False)
    return result


YT_ID = re.compile(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\.be/)([\w-]{11})")


def peek(url):
    """Vistazo inmediato mientras llega el análisis completo: en YouTube la
    miniatura se deduce del identificador y el título viene de oEmbed (~0,3 s)."""
    m = YT_ID.search(url)
    if not m:
        return {}
    thumb = f"https://i.ytimg.com/vi/{m.group(1)}/hqdefault.jpg"
    allowed_images.add(thumb)
    out = {"thumbnail": thumb}
    try:
        q = urllib.parse.urlencode({"url": f"https://www.youtube.com/watch?v={m.group(1)}", "format": "json"})
        with urllib.request.urlopen(f"https://www.youtube.com/oembed?{q}", timeout=4) as r:
            data = json.loads(r.read())
        out.update(title=data.get("title"), uploader=data.get("author_name"))
    except Exception:
        pass  # sin título: el vistazo se queda solo con la miniatura
    return out


def prefetch_info(url):
    """Empieza a analizar en segundo plano (por ejemplo, al detectar un enlace copiado)."""
    def run():
        try:
            get_info(url)
        except Exception:
            pass  # si falla, el análisis normal mostrará el error
    threading.Thread(target=run, daemon=True).start()


# Miniaturas que /api/img puede servir (solo las de videos analizados), para que
# la página lea sus colores: el navegador no deja leer píxeles de otros sitios.
allowed_images = set()
image_cache = OrderedDict()


def fetch_image(url):
    if url not in allowed_images:
        raise ValueError("Imagen no permitida")
    if url not in image_cache:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            image_cache[url] = (r.read(), r.headers.get("Content-Type") or "image/jpeg")
        while len(image_cache) > 30:
            image_cache.popitem(last=False)
    return image_cache[url]


# Un único yt-dlp para analizar: reutiliza conexiones y el código del
# reproductor de YouTube ya descargado, y el segundo análisis tarda ~1,4 s
# en vez de ~2,2 s. yt-dlp no es seguro entre hilos, de ahí el candado.
_analyzer = {"ydl": None, "cookies": None}
analyzer_lock = threading.Lock()


def info_opts():
    return base_opts() | {"skip_download": True, "extract_flat": "in_playlist"}


def analyzer():
    if _analyzer["ydl"] is None or _analyzer["cookies"] != settings.get("cookies"):
        # Las listas HLS de YouTube son copias de los mismos formatos: saltarlas
        # ahorra peticiones (~0,6 s). Los directos sí las necesitan, por eso si
        # falla repetimos con la consulta completa. La descarga siempre es completa.
        fast = info_opts() | {"extractor_args": {"youtube": {"skip": ["hls"]}}}
        _analyzer.update(ydl=yt_dlp.YoutubeDL(fast), cookies=settings.get("cookies"))
    return _analyzer["ydl"]


def warm_up():
    """Al abrir la app, deja cargado el extractor de YouTube en segundo plano."""
    try:
        with analyzer_lock:
            analyzer().get_info_extractor("Youtube")
    except Exception:
        pass


def _get_info(url):
    try:
        try:
            if analyzer_lock.acquire(blocking=False):
                try:
                    info = analyzer().extract_info(url, download=False)
                finally:
                    analyzer_lock.release()
            else:
                # el compartido está ocupado (p. ej. analizando de antemano otro
                # enlace copiado): no esperamos turno, usamos uno aparte
                with yt_dlp.YoutubeDL(info_opts() | {"extractor_args": {"youtube": {"skip": ["hls"]}}}) as ydl:
                    info = ydl.extract_info(url, download=False)
        except yt_dlp.utils.DownloadError:
            with yt_dlp.YoutubeDL(info_opts()) as ydl:
                info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as e:
        raise AppError(e) from None

    if info.get("_type") == "playlist" or "entries" in info:
        entries = []
        for i, e in enumerate(info.get("entries") or [], 1):
            if e:
                entries.append({"index": i, "id": e.get("id"), "title": e.get("title") or e.get("url"),
                                "duration": e.get("duration"), "thumbnail": pick_thumb(e, 400)})
        return {
            "type": "playlist", "url": url,
            "title": info.get("title") or "Lista de reproducción",
            "uploader": info.get("uploader") or info.get("channel"),
            "count": len(entries), "entries": entries,
            "thumbnail": pick_thumb(info) or next((e["thumbnail"] for e in entries if e["thumbnail"]), None),
            "duration": sum(e["duration"] or 0 for e in entries) or None,
            "qualities": [], "extractor": info.get("extractor_key"),
        }

    qualities, audio = quality_options(info)
    return {
        "type": "video", "url": url, "key": remember(info), "storyboard": storyboard(info),
        "title": info.get("title"),
        "uploader": info.get("uploader") or info.get("channel"),
        "duration": info.get("duration"), "views": info.get("view_count"),
        "thumbnail": pick_thumb(info), "qualities": qualities, "audio": audio,
        "is_live": bool(info.get("is_live")), "extractor": info.get("extractor_key"),
    }


# ---------- vistas previas del fragmento ----------
# Guardamos la info de los últimos videos analizados para sacar fotogramas
# y clips sin volver a consultar el sitio.

analyzed = OrderedDict()  # key -> {"raw": info, "source": (url, headers) | None}
PREVIEW_DIR = Path(tempfile.mkdtemp(prefix="lumen-preview-"))  # propia de esta copia del programa
atexit.register(shutil.rmtree, PREVIEW_DIR, True)
frame_cache = OrderedDict()  # (key, segundo) -> jpeg
ffmpeg_slots = threading.Semaphore(2)


def remember(info):
    key = uuid.uuid4().hex[:12]
    raw = yt_dlp.YoutubeDL.sanitize_info(info)
    for k in ("requested_formats", "requested_downloads", "format_id"):
        raw.pop(k, None)
    analyzed[key] = {"raw": raw, "source": None}
    while len(analyzed) > 8:
        analyzed.popitem(last=False)
    return key


def storyboard(info):
    """Tiras de miniaturas de YouTube (formatos sbN): permiten ver un fotograma
    aproximado al instante mientras se arrastra el deslizador."""
    boards = [f for f in info.get("formats") or []
              if str(f.get("format_id", "")).startswith("sb") and f.get("fragments") and f.get("rows") and f.get("fps")]
    if not boards:
        return None
    sb = max(boards, key=lambda f: f.get("width") or 0)
    return {"width": sb["width"], "height": sb["height"], "rows": sb["rows"], "cols": sb["columns"],
            "interval": 1 / sb["fps"], "urls": [fr["url"] for fr in sb["fragments"]]}


def analyzed_info(key):
    entry = analyzed.get(key)
    if not entry:
        raise ValueError("Vuelve a analizar el enlace para ver la vista previa.")
    return entry


def choose_formats(raw, params):
    with yt_dlp.YoutubeDL(base_opts() | params | {"simulate": True}) as ydl:
        r = ydl.process_ie_result(json.loads(json.dumps(raw)), download=False)
    return r.get("requested_formats") or [r]


LIGHT_SORT = {"format_sort": ["res:360", "vcodec:h264", "acodec:aac", "ext:mp4:m4a"]}


def stream_source(key):
    """Versión ligera (≤480p, descarga directa) que el reproductor de la app
    puede pedir por rangos a través de /stream/<key>/v|a. Devuelve
    {"v": (url, cabeceras)} si video y audio van juntos, {"v", "a"} si van
    separados (YouTube), o None si el sitio solo da listas HLS/DASH."""
    entry = analyzed_info(key)
    if "stream" not in entry:
        picked = None
        for formats in (["b[height<=480][protocol^=http]"],
                        ["bv*[height<=480][protocol^=http]", "ba[protocol^=http]"]):
            try:
                picked = [choose_formats(entry["raw"], {"format": f} | LIGHT_SORT)[0] for f in formats]
                break
            except Exception:
                continue
        entry["stream"] = ({part: (f["url"], f.get("http_headers") or {}) for part, f in zip("va", picked)}
                           if picked else None)
    return entry["stream"]


def frame_source(key):
    """URL directa de una versión ligera del video (con sus cabeceras) para ffmpeg."""
    entry = analyzed_info(key)
    stream = stream_source(key)
    if stream:
        return stream["v"]
    if not entry["source"]:
        parts = choose_formats(entry["raw"], {"format": "bv*[height<=480]/b[height<=480]/wv*/w",
                                              "format_sort": ["res:360", "proto"]})
        video = next((f for f in parts if f.get("vcodec") != "none"), parts[0])
        entry["source"] = (video["url"], video.get("http_headers") or {})
    return entry["source"]


def grab_frame(key, t):
    """Fotograma real en el segundo t, como JPEG de 320 px de ancho."""
    cache_key = (key, int(t))
    if cache_key in frame_cache:
        frame_cache.move_to_end(cache_key)
        return frame_cache[cache_key]
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise ValueError("Falta ffmpeg para sacar fotogramas.")
    url, headers = frame_source(key)
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-ss", f"{max(0.0, t):.2f}"]
    if headers:
        cmd += ["-headers", "".join(f"{k}: {v}\r\n" for k, v in headers.items())]
    cmd += ["-i", url, "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "5", "-f", "mjpeg", "pipe:1"]
    with ffmpeg_slots:
        out = subprocess.run(cmd, capture_output=True, timeout=25, creationflags=NO_WINDOW)
    if not out.stdout:
        raise ValueError("No se pudo sacar el fotograma.")
    frame_cache[cache_key] = out.stdout
    while len(frame_cache) > 300:
        frame_cache.popitem(last=False)
    return out.stdout


PREVIEW_MAX = 30  # segundos del clip de respaldo: ffmpeg lo baja casi a velocidad de reproducción


def clip_preview(key, start, end):
    """Descarga una versión ligera (≤360p) solo del fragmento para reproducirla."""
    entry = analyzed_info(key)
    start, end = float(start), float(end)
    trimmed = end - start > PREVIEW_MAX
    end = min(end, start + PREVIEW_MAX)
    stem = f"{key}-{int(start * 10)}-{int(end * 10)}"
    existing = next(PREVIEW_DIR.glob(stem + ".*"), None)
    if not existing:
        opts = base_opts() | {
            "format": "bv*+ba/b", "format_sort": ["res:360", "vcodec:h264", "acodec:aac"],
            "merge_output_format": "mp4", "outtmpl": str(PREVIEW_DIR / (stem + ".%(ext)s")),
            # sin force_keyframes_at_cuts: cortar en el fotograma clave más cercano
            # evita recodificar y basta para una vista previa
            "download_ranges": download_range_func(None, [(start, end)]),
            "overwrites": True, "noprogress": True,
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.process_ie_result(json.loads(json.dumps(entry["raw"])), download=True)
        except yt_dlp.utils.DownloadError as e:
            raise AppError(e) from None
        existing = next((p for p in PREVIEW_DIR.glob(stem + ".*") if p.suffix in (".mp4", ".webm", ".mkv")), None)
        if not existing:
            raise ValueError("No se pudo preparar la vista previa.")
    return {"url": f"/preview/{existing.name}", "trimmed": trimmed, "start": start, "end": end}


# ---------- descargas ----------

jobs = {}
jobs_lock = threading.Lock()
ui = {"focused": True, "last_seen": time.time()}


class Slots:
    """Semáforo cuyo límite se puede cambiar en Ajustes mientras hay descargas."""

    def __init__(self):
        self.cv = threading.Condition()
        self.active = 0

    def acquire(self, job):
        with self.cv:
            while self.active >= max(1, int(settings["parallel"])) and not job["cancel"]:
                self.cv.wait(1)
            self.active += 1

    def release(self):
        with self.cv:
            self.active -= 1
            self.cv.notify_all()


slots = Slots()


class JobLogger:
    def __init__(self, job):
        self.job = job

    def debug(self, msg):
        pass

    info = warning = debug

    def error(self, msg):
        self.job["raw_error"] = clean(msg)


def clock(seconds):
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    return f"{h}h{m:02d}m{s:02d}s" if h else f"{m}m{s:02d}s"


def build_opts(job):
    o = job["options"]
    folder = o.get("folder") or settings["folder"]
    name = TEMPLATES.get(settings["template"]) or TEMPLATES["title_id"]
    if settings["template"] == "custom" and settings["custom_template"].strip():
        name = settings["custom_template"].strip().removesuffix(".%(ext)s")
    if job.get("section"):
        start, end = job["section"]
        name += f" ({clock(start)}-{clock(end)})"
    if job["kind"] == "playlist":
        name = os.path.join("%(playlist_title)s", "%(playlist_index)03d - " + name)

    # Cada descarga trabaja en su propia carpeta temporal y solo el resultado
    # final se mueve a la carpeta del usuario: así un archivo intermedio con el
    # mismo nombre (p. ej. un .mp3 de origen al convertir a .m4a) nunca puede
    # pisar ni borrar algo que el usuario ya tenía.
    job["_tmp"] = tempfile.mkdtemp(prefix="lumen-job-")
    job["_home"] = folder
    opts = base_opts() | {
        "paths": {"home": folder, "temp": job["_tmp"]},
        "outtmpl": name + ".%(ext)s",
        "windowsfilenames": True,
        # ffmpeg falla con rutas de más de 260 caracteres en Windows: recortamos
        # el nombre dejando margen para sufijos temporales (.f137.mp4.part, .temp…)
        "trim_file_name": max(30, 230 - max(len(folder), len(job["_tmp"]))),
        "concurrent_fragment_downloads": 4,
        "ignoreerrors": "only_download" if job["kind"] == "playlist" else False,
        "progress_hooks": [lambda d: progress_hook(job, d)],
        "postprocessor_hooks": [lambda d: pp_hook(job, d)],
        "logger": JobLogger(job),
    }
    if job.get("items"):
        opts["playlist_items"] = ",".join(map(str, job["items"]))
    if float(settings.get("ratelimit") or 0) > 0:
        opts["ratelimit"] = int(float(settings["ratelimit"]) * 1024 * 1024)
    if job.get("section"):
        opts["download_ranges"] = download_range_func(None, [tuple(job["section"])])
        opts["force_keyframes_at_cuts"] = True

    pps = []
    embed_thumb = bool(o.get("meta"))
    if o.get("mode") == "audio":
        fmt = o.get("audio_format") or "mp3"
        # Si el sitio ya ofrece el audio en ese formato lo bajamos tal cual:
        # recodificar a AAC con ffmpeg es lento y pierde calidad.
        native = {"m4a": "ba[ext=m4a]/", "opus": "ba[acodec=opus]/"}.get(fmt, "")
        opts["format"] = native + "bestaudio/best"
        if re.search(r"(^|\.)tiktok\.com/", urlparse(job["url"]).netloc + "/"):
            # El formato "audio" de TikTok es la pista musical asociada, no lo
            # que suena en el video (voces incluidas): sacamos el audio del video.
            opts["format"] = "best"
        pps.append({"key": "FFmpegExtractAudio", "preferredcodec": fmt, "preferredquality": "0"})
        if fmt in ("m4a", "opus") and not yt_dlp.dependencies.mutagen:
            # sin mutagen la portada se incrusta con ffmpeg, que falla en .m4a/.opus
            embed_thumb = False
    else:
        q = str(o.get("quality") or "best")
        opts |= video_format(q)
        opts["merge_output_format"] = "mp4"
        # Algunos sitios entregan un solo archivo en .avi/.flv/.webm, donde no
        # se puede incrustar la portada: se reempaqueta (sin recodificar) a MKV.
        pps.append({"key": "FFmpegVideoRemuxer", "preferedformat": "mp4>mp4/m4v>m4v/mov>mov/mkv"})
        if o.get("subs"):
            opts.update(writesubtitles=True, subtitleslangs=["es.*", "en.*"])
            pps.append({"key": "FFmpegEmbedSubtitle", "already_have_subtitle": False})
    if o.get("meta"):
        pps.append({"key": "FFmpegMetadata", "add_metadata": True})
    if embed_thumb:
        opts["writethumbnail"] = True
        pps.append({"key": "EmbedThumbnail", "already_have_thumbnail": False})
    opts["postprocessors"] = pps
    return opts


def item_number(job, info):
    vid = info.get("id") or info.get("webpage_url") or "?"
    ids = job.setdefault("_ids", [])
    if vid not in ids:
        ids.append(vid)
        if job["kind"] == "playlist":
            job["item_title"] = info.get("title")
    return ids.index(vid) + 1


def set_overall(job, item_no, item_fraction):
    count = max(job.get("count") or 1, item_no)
    # Nunca hacia atrás: yt-dlp a veces corrige su estimación de tamaño.
    job["progress"] = max(job["progress"], min(((item_no - 1) + item_fraction) / count * 100, 100))
    if count > 1:
        job["item"] = f"{item_no}/{count}"


def progress_hook(job, d):
    if job["cancel"]:
        raise DownloadCancelled("Cancelado")
    info = d.get("info_dict") or {}
    item_no = item_number(job, info)
    if job["kind"] != "playlist":
        if info.get("title"):
            job["title"] = info["title"]
        if not job.get("thumbnail"):
            job["thumbnail"] = pick_thumb(info, 480)

    if d["status"] != "downloading":
        return
    # Un video "1080p" son dos descargas (imagen + audio): las juntamos en
    # una sola barra ponderada por el tamaño de cada parte. El hook no trae
    # requested_formats, así que usamos el plan que guardó PlanPP.
    plan = job.get("_plan", {}).get(info.get("id")) or [[info.get("format_id"), 0]]
    ids = [fid for fid, _ in plan]
    idx = ids.index(info.get("format_id")) if info.get("format_id") in ids else 0
    total = d.get("total_bytes") or d.get("total_bytes_estimate")
    done = d.get("downloaded_bytes") or 0
    if total:
        plan[idx][1] = total  # el tamaño real sustituye a la estimación
    sizes = [size for _, size in plan]
    if total:
        frac = done / total
    elif d.get("fragment_count"):
        frac = (d.get("fragment_index") or 0) / d["fragment_count"]
    else:
        frac = 0
    weights = sizes if all(sizes) else [1] * len(plan)
    part_frac = (sum(weights[:idx]) + weights[idx] * min(frac, 1)) / sum(weights)
    set_overall(job, item_no, part_frac * 0.97)  # el 3% final es el procesado

    is_audio = info.get("vcodec") == "none"
    job.update(status="downloading", speed=d.get("speed"), eta=d.get("eta"),
               downloaded=sum(sizes[:idx]) + done, total=sum(sizes) or total,
               stage="Descargando audio" if is_audio and len(plan) > 1 else "Descargando")


class PlanPP(yt_dlp.postprocessor.PostProcessor):
    """Se ejecuta justo antes de descargar cada video, cuando aún se sabe qué
    formatos (partes) se van a bajar y cuánto pesa cada uno."""

    def __init__(self, job):
        super().__init__()
        self.job = job

    def run(self, info):
        dur = info.get("duration") or 0
        parts = info.get("requested_formats") or [info]
        self.job.setdefault("_plan", {})[info.get("id")] = [[f.get("format_id"), fmt_size(f, dur)] for f in parts]
        return [], info


def pp_hook(job, d):
    info = d.get("info_dict") or {}
    if d["status"] == "started":
        job.update(status="processing", speed=None, eta=None,
                   stage=PP_LABELS.get(d.get("postprocessor"), "Procesando"))
        set_overall(job, item_number(job, info), 0.98)
    elif d["status"] == "finished" and info.get("filepath"):
        path = info["filepath"]
        tmp, home = job.get("_tmp"), job.get("_home")
        if tmp and home and os.path.normcase(path).startswith(os.path.normcase(tmp)):
            # el procesado ocurre en la carpeta temporal; al final se mueve aquí
            path = os.path.join(home, os.path.relpath(path, tmp))
        job["filepath"] = os.path.dirname(path) if job["kind"] == "playlist" else path


def run_job(job):
    slots.acquire(job)
    try:
        if job["cancel"]:
            job["status"] = "cancelled"
            return
        job.update(status="starting", stage="Iniciando")
        try:
            with yt_dlp.YoutubeDL(build_opts(job)) as ydl:
                ydl.add_post_processor(PlanPP(job), when="before_dl")
                code = ydl.download([job["url"]])
            if job["cancel"]:
                job["status"] = "cancelled"
            elif code and job["kind"] != "playlist":
                job["status"] = "error"
            else:
                job.update(status="done", progress=100, stage="Listo")
        except DownloadCancelled:
            job["status"] = "cancelled"
        except Exception as e:  # DownloadError y similares
            job["status"] = "cancelled" if job["cancel"] else "error"
            job.setdefault("raw_error", clean(e))
        if job["status"] == "error":
            raw = job.get("raw_error") or "La descarga falló"
            job.update(error=friendly(raw), raw_error=raw)
    finally:
        slots.release()
        if job.get("_tmp"):
            shutil.rmtree(job.pop("_tmp"), ignore_errors=True)
        job.update(speed=None, eta=None, finished=time.time())
        save_history()
        if job["status"] in ("done", "error") and settings["notify"] and not ui["focused"]:
            ok = job["status"] == "done"
            title = tr(job["title"])
            notify(tr("Descarga terminada") if ok else tr("La descarga falló"),
                   title if ok else f'{title}\n{tr(job.get("error", ""))}')


def start_job(data):
    options = {k: data.get(k) for k in ("mode", "quality", "audio_format", "meta", "subs", "folder")}
    save_settings(options)
    section = data.get("section")
    if section:
        section = [float(section[0]), float(section[1])]
        if not 0 <= section[0] < section[1]:
            raise ValueError("El fragmento elegido no es válido.")
    items = [int(i) for i in data.get("items") or []]
    kind = data.get("type") if data.get("type") in ("video", "playlist") else "video"
    job = {
        "id": uuid.uuid4().hex[:10], "url": data["url"].strip(), "title": data.get("title") or data["url"].strip(),
        "thumbnail": data.get("thumbnail"), "kind": kind, "items": items, "section": section,
        "count": len(items) or data.get("count") or 1, "options": options,
        "status": "queued", "stage": "En cola", "progress": 0, "speed": None, "eta": None,
        "total": None, "downloaded": 0, "cancel": False, "created": time.time(),
        "folder": options.get("folder") or settings["folder"],
    }
    with jobs_lock:
        jobs[job["id"]] = job
    threading.Thread(target=run_job, args=(job,), daemon=True).start()
    return job


PUBLIC = ("id", "url", "title", "thumbnail", "kind", "count", "section", "status", "stage", "progress",
          "speed", "eta", "total", "downloaded", "created", "finished", "folder", "filepath",
          "item", "item_title", "error", "raw_error")


def public(job):
    out = {k: job.get(k) for k in PUBLIC}
    out["mode"] = job["options"].get("mode")
    out["exists"] = bool(job.get("filepath") and os.path.exists(job["filepath"]))
    return out


def save_history():
    with jobs_lock:
        done = sorted((j for j in jobs.values() if j["status"] not in ACTIVE),
                      key=lambda j: j["created"], reverse=True)[:HISTORY_LIMIT]
        write_json(HISTORY_FILE, [{k: j.get(k) for k in PUBLIC} | {"options": j["options"]} for j in done])


def load_history():
    for j in read_json(HISTORY_FILE, []):
        if isinstance(j, dict) and j.get("id"):
            j.update(cancel=False, speed=None, eta=None)
            j.setdefault("options", {})
            jobs[j["id"]] = j


# ---------- integración con Windows ----------

WINDOW = None  # ventana de pywebview, si la hay


def pick_folder(initial):
    if WINDOW is not None:
        import webview
        dialog = getattr(getattr(webview, "FileDialog", None), "FOLDER", None) or webview.FOLDER_DIALOG
        result = WINDOW.create_file_dialog(dialog, directory=initial)
        return result[0] if result else ""
    code = ("import sys, tkinter as tk; from tkinter import filedialog;"
            "r = tk.Tk(); r.withdraw(); r.attributes('-topmost', True);"
            "print(filedialog.askdirectory(initialdir=sys.argv[1], title='Elegir carpeta de descargas') or '')")
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    out = subprocess.run([sys.executable, "-c", code, initial], capture_output=True, env=env)
    return out.stdout.decode("utf-8").strip()


def reveal(path):
    if path and os.path.isfile(path):
        subprocess.Popen(f'explorer /select,"{os.path.normpath(path)}"')
    elif path and os.path.isdir(path):
        os.startfile(path)


def read_clipboard():
    if os.name != "nt":
        return ""
    u32, k32 = ctypes.windll.user32, ctypes.windll.kernel32
    u32.GetClipboardData.restype = ctypes.c_void_p
    k32.GlobalLock.restype = ctypes.c_void_p
    k32.GlobalLock.argtypes = k32.GlobalUnlock.argtypes = [ctypes.c_void_p]
    if not u32.OpenClipboard(None):
        return ""
    try:
        handle = u32.GetClipboardData(13)  # CF_UNICODETEXT
        if not handle:
            return ""
        ptr = k32.GlobalLock(handle)
        try:
            return ctypes.wstring_at(ptr) if ptr else ""
        finally:
            k32.GlobalUnlock(handle)
    finally:
        u32.CloseClipboard()


TOAST_PS = r"""
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime]
$x = New-Object Windows.Data.Xml.Dom.XmlDocument
$x.LoadXml("<toast><visual><binding template='ToastGeneric'><text/><text/></binding></visual><audio silent='true'/></toast>")
$t = $x.GetElementsByTagName('text')
[void]$t.Item(0).AppendChild($x.CreateTextNode($env:TOAST_TITLE))
[void]$t.Item(1).AppendChild($x.CreateTextNode($env:TOAST_BODY))
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))
"""


def notify(title, body):
    if os.name != "nt":
        return
    env = dict(os.environ, TOAST_TITLE=title, TOAST_BODY=body[:200])
    subprocess.Popen(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", TOAST_PS],
                     env=env, creationflags=NO_WINDOW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# Colores de la barra de título nativa (COLORREF = 0x00BBGGRR) para cada tema:
# el tono que se ve arriba de la página (--bg más el grano de .aura) y --muted.
TITLEBAR = {
    True: {"caption": 0x050505, "text": 0x968D8A, "border": 0x050505},   # oscuro: negro + grano
    False: {"caption": 0xEFEFF0, "text": 0x5E5755, "border": 0xEFEFF0},  # claro: #f0efef
}


def windows_dark_mode():
    """True si Windows usa el modo oscuro para las aplicaciones."""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                            r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize") as key:
            return winreg.QueryValueEx(key, "AppsUseLightTheme")[0] == 0
    except OSError:
        return True


_hwnd = None


def window_handle():
    """HWND de nuestra ventana: la de este proceso con el título de la app
    (buscar solo por título podría dar con otra copia abierta)."""
    global _hwnd
    if _hwnd:
        return _hwnd
    import ctypes.wintypes as wt
    u32, pid, found = ctypes.windll.user32, os.getpid(), []

    def visit(hwnd, _):
        owner = wt.DWORD()
        u32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        title = ctypes.create_unicode_buffer(64)
        u32.GetWindowTextW(hwnd, title, 64)
        if owner.value == pid and title.value == APP_NAME:
            found.append(hwnd)
        return True

    u32.EnumWindows(ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)(visit), 0)
    _hwnd = found[0] if found else None
    return _hwnd


def style_titlebar(dark=True):
    """Pinta la barra de título de Windows 11 con el fondo de la app, para
    que se vea integrada sin perder arrastrar, redimensionar ni Snap."""
    hwnd = window_handle() if os.name == "nt" else None
    if not hwnd:
        return
    dwm = ctypes.windll.dwmapi

    def set_attr(attr, value):
        v = ctypes.c_int(value)
        dwm.DwmSetWindowAttribute(ctypes.c_void_p(hwnd), attr, ctypes.byref(v), ctypes.sizeof(v))

    colors = TITLEBAR[bool(dark)]
    set_attr(20, int(bool(dark)))       # DWMWA_USE_IMMERSIVE_DARK_MODE: botones ─ □ ✕ claros u oscuros
    set_attr(35, colors["caption"])     # DWMWA_CAPTION_COLOR (Windows 11)
    set_attr(36, colors["text"])        # DWMWA_TEXT_COLOR
    set_attr(34, colors["border"])      # DWMWA_BORDER_COLOR


def set_window_icon():
    ico = WEB / "icon.ico"
    hwnd = window_handle() if os.name == "nt" else None
    if not hwnd or not ico.is_file():
        return
    u32 = ctypes.windll.user32
    u32.LoadImageW.restype = ctypes.c_void_p
    u32.SendMessageW.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
    for which, size in ((0, 16), (1, 32)):  # ICON_SMALL, ICON_BIG
        hicon = u32.LoadImageW(None, str(ico), 1, size, size, 0x10)  # IMAGE_ICON, LR_LOADFROMFILE
        if hicon:
            u32.SendMessageW(ctypes.c_void_p(hwnd), 0x80, ctypes.c_void_p(which), ctypes.c_void_p(hicon))  # WM_SETICON


_window_shown = threading.Event()


def show_window(dark=None):
    """La ventana nace oculta y se muestra cuando la página ya está pintada,
    con la barra de título y el icono correctos: así no hay parpadeos."""
    if _window_shown.is_set() or WINDOW is None:
        return
    _window_shown.set()
    if dark is None:
        theme = settings.get("theme")
        dark = theme == "dark" or (theme != "light" and windows_dark_mode())
    set_window_icon()  # para la barra de tareas y Alt+Tab
    clean_titlebar()
    style_titlebar(dark)
    WINDOW.show()


def clean_titlebar():
    """Deja la barra de título limpia, sin icono ni texto, pero la ventana sigue
    llamándose Lumen y con su icono en la barra de tareas y en Alt+Tab
    (WTNCA_NODRAWCAPTION | WTNCA_NODRAWICON)."""
    hwnd = window_handle() if os.name == "nt" else None
    if not hwnd:
        return

    class WtaOptions(ctypes.Structure):
        _fields_ = [("flags", ctypes.c_uint32), ("mask", ctypes.c_uint32)]

    hide = 0x1 | 0x2  # sin texto | sin icono
    opts = WtaOptions(hide, hide)
    ctypes.windll.uxtheme.SetWindowThemeAttribute(ctypes.c_void_p(hwnd), 1,  # WTA_NONCLIENT
                                                  ctypes.byref(opts), ctypes.sizeof(opts))


class WindowApi:
    """Funciones que la página puede llamar con window.pywebview.api.*"""

    def set_titlebar(self, dark):
        style_titlebar(bool(dark))

    def ready(self, dark):
        show_window(bool(dark))


def ytdlp_version():
    return yt_dlp.version.__version__


def update_ytdlp():
    if getattr(sys, "frozen", False):
        return {"ok": False, "error": "En la versión .exe, descarga la última versión del programa para actualizar yt-dlp."}
    out = subprocess.run([sys.executable, "-m", "pip", "install", "-U", "yt-dlp"],
                         capture_output=True, text=True, creationflags=NO_WINDOW)
    ver = subprocess.run([sys.executable, "-c", "import yt_dlp; print(yt_dlp.version.__version__)"],
                         capture_output=True, text=True, creationflags=NO_WINDOW).stdout.strip()
    return {"ok": out.returncode == 0, "version": ver, "restart": ver != ytdlp_version()}


# ---------- servidor HTTP ----------

STATIC_TYPES = {".html": "text/html", ".css": "text/css", ".js": "text/javascript",
                ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send_body(self, body, ctype, code=200):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, data, code=200):
        self.send_body(json.dumps(data, ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8", code)

    def send_file(self, file, ctype):
        """Envía un archivo respetando Range, para poder saltar dentro del video."""
        size = file.stat().st_size
        start, end = 0, size - 1
        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range") or "")
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else end
            else:
                start = max(0, size - int(m.group(2)))
            end = min(end, size - 1)
        partial = bool(m) and (start, end) != (0, size - 1)
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        with open(file, "rb") as fh:
            fh.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = fh.read(min(65536, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (ConnectionError, OSError):  # el reproductor cortó la petición
                    return
                remaining -= len(chunk)

    def proxy_stream(self, key, part):
        """Retransmite el video al reproductor respetando Range, con las cabeceras
        que exige el sitio. Así se puede empezar a ver en cualquier segundo al instante."""
        try:
            url, headers = (stream_source(key) or {})[part]
        except Exception:
            return self.send_json({"error": "Sin vista previa directa"}, 404)
        req = urllib.request.Request(url, headers={**headers, "Range": self.headers.get("Range") or "bytes=0-"})
        try:
            upstream = urllib.request.urlopen(req, timeout=20)
        except urllib.error.HTTPError as e:
            return self.send_json({"error": f"El sitio respondió {e.code}"}, e.code)
        except Exception as e:
            return self.send_json({"error": clean(e)}, 502)
        with upstream:
            self.send_response(upstream.status)
            for h in ("Content-Type", "Content-Length", "Content-Range"):
                if upstream.headers.get(h):
                    self.send_header(h, upstream.headers[h])
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            try:
                while chunk := upstream.read(65536):
                    self.wfile.write(chunk)
            except (ConnectionError, OSError):  # el reproductor saltó a otro punto
                return

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/frame":
            q = parse_qs(urlparse(self.path).query)
            try:
                jpeg = grab_frame(q["key"][0], float(q["t"][0]))
            except Exception as e:
                return self.send_json({"error": clean(e)}, 400)
            return self.send_body(jpeg, "image/jpeg")
        if path == "/api/img":
            try:
                body, ctype = fetch_image(parse_qs(urlparse(self.path).query)["u"][0])
            except Exception as e:
                return self.send_json({"error": clean(e)}, 404)
            return self.send_body(body, ctype)
        m = re.fullmatch(r"/stream/(\w+)/([va])", path)
        if m:
            return self.proxy_stream(*m.groups())
        if path.startswith("/preview/"):
            file = (PREVIEW_DIR / Path(path).name)
            if file.is_file():
                return self.send_file(file, {".webm": "video/webm"}.get(file.suffix, "video/mp4"))
            return self.send_json({"error": "No encontrado"}, 404)
        if path == "/api/config":
            return self.send_json({"settings": settings, "version": ytdlp_version(),
                                   "ffmpeg": bool(shutil.which("ffmpeg")), "window": WINDOW is not None,
                                   "frozen": getattr(sys, "frozen", False), "lang": ui_lang()})
        if path == "/api/jobs":
            ui["last_seen"] = time.time()
            with jobs_lock:
                items = sorted(jobs.values(), key=lambda j: j["created"], reverse=True)
            return self.send_json([public(j) for j in items])
        if path == "/api/clipboard":
            text = read_clipboard() if settings["clipboard"] else ""
            return self.send_json({"urls": list(dict.fromkeys(URL_RE.findall(text)))[:50]})

        file = (WEB / ("index.html" if path == "/" else path.lstrip("/"))).resolve()
        if file.is_file() and WEB.resolve() in file.parents:
            ctype = STATIC_TYPES.get(file.suffix, "application/octet-stream")
            body = file.read_bytes()
            if file.name == "index.html":
                # idioma y tema ya en el primer fotograma, sin esperar al JavaScript
                theme = f' data-theme="{settings["theme"]}"' if settings.get("theme") in ("light", "dark") else ""
                body = body.replace(b'<html lang="es">', f'<html lang="{ui_lang()}"{theme}>'.encode(), 1)
            return self.send_body(body, ctype + ("; charset=utf-8" if ctype.startswith("text") else ""))
        self.send_json({"error": "No encontrado"}, 404)

    def do_POST(self):
        # Solo aceptamos peticiones de la propia página (evita que otra web
        # abierta en el navegador dispare descargas en tu PC).
        port = self.server.server_port
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://{HOST}:{port}", f"http://localhost:{port}"):
            return self.send_json({"error": "Origen no permitido"}, 403)
        try:
            length = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(length) or b"{}")
            self.send_json(self.route(data))
        except AppError as e:
            self.send_json({"error": str(e), "raw": e.raw}, 400)
        except Exception as e:
            raw = clean(e)
            self.send_json({"error": friendly(raw), "raw": raw}, 400)

    def route(self, data):
        p = self.path
        if p == "/api/info":
            return get_info(data["url"].strip())
        if p == "/api/prefetch":
            prefetch_info(data["url"].strip())
            return {"ok": True}
        if p == "/api/peek":
            return peek(data["url"].strip())
        if p == "/api/download":
            return public(start_job(data))
        if p == "/api/stream-info":
            stream = stream_source(data["key"])
            return {"mode": "none" if not stream else "split" if "a" in stream else "muxed"}
        if p == "/api/clip-preview":
            return clip_preview(data["key"], data["start"], data["end"])
        if p == "/api/cancel":
            if data.get("id") in jobs:
                jobs[data["id"]]["cancel"] = True
            return {"ok": True}
        if p == "/api/remove":
            with jobs_lock:
                job = jobs.get(data.get("id"))
                if job and job["status"] not in ACTIVE:
                    jobs.pop(job["id"])
            save_history()
            return {"ok": True}
        if p == "/api/clear":
            with jobs_lock:
                for jid in [j["id"] for j in jobs.values() if j["status"] not in ACTIVE]:
                    jobs.pop(jid)
            save_history()
            return {"ok": True}
        if p in ("/api/reveal", "/api/open"):
            job = jobs.get(data.get("id")) or {}
            path = job.get("filepath")
            if p == "/api/open":
                if not path or not os.path.exists(path):
                    raise ValueError("El archivo ya no existe; puede que lo hayas movido o borrado.")
                os.startfile(path)
            else:
                reveal(path if path and os.path.exists(path) else job.get("folder") or data.get("folder"))
            return {"ok": True}
        if p == "/api/pick-folder":
            folder = pick_folder(data.get("folder") or settings["folder"])
            if folder:
                save_settings({"folder": os.path.normpath(folder)})
            return {"folder": os.path.normpath(folder) if folder else None}
        if p == "/api/settings":
            save_settings(data)
            return {"settings": settings}
        if p == "/api/focus":
            ui["focused"] = bool(data.get("focused"))
            return {"ok": True}
        if p == "/api/update":
            return update_ytdlp()
        raise ValueError("No encontrado")


class Server(ThreadingHTTPServer):
    # En Windows SO_REUSEADDR deja que dos copias abiertas compartan puerto y
    # se pisen las peticiones; sin él, la segunda copia pasa al siguiente puerto.
    allow_reuse_address = False
    daemon_threads = True


def idle_watchdog():
    """En modo navegador no hay ventana que cerrar: salimos cuando nadie mira
    la página desde hace un rato y no queda nada descargando."""
    while True:
        time.sleep(15)
        busy = any(j["status"] in ACTIVE for j in list(jobs.values()))
        if not busy and time.time() - ui["last_seen"] > 180:
            shutil.rmtree(PREVIEW_DIR, ignore_errors=True)  # os._exit se salta atexit
            os._exit(0)


def main():
    load_history()
    threading.Thread(target=warm_up, daemon=True).start()
    first = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8765
    for port in range(first, first + 20):
        try:
            server = Server((HOST, port), Handler)
            break
        except OSError:
            continue
    else:
        sys.exit(f"No hay puertos libres entre {first} y {first + 19}.")
    url = f"http://{HOST}:{port}"
    threading.Thread(target=server.serve_forever, daemon=True).start()

    if "--browser" not in sys.argv and "--no-browser" not in sys.argv:
        try:
            import webview
        except ImportError:
            webview = None
        if webview:
            global WINDOW
            if os.name == "nt":
                # identidad propia en la barra de tareas (si no, Windows la agrupa con Python)
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("lumen.downloader")
            theme = settings.get("theme")
            dark = theme == "dark" or (theme != "light" and windows_dark_mode())
            WINDOW = webview.create_window(APP_NAME, url, width=1120, height=880, js_api=WindowApi(), hidden=True,
                                           min_size=(440, 620), background_color="#000000" if dark else "#f2f1ef")
            # por si la página no llega a avisar (error de carga), la mostramos igual
            WINDOW.events.loaded += lambda: threading.Timer(4, show_window).start()
            webview.start()
            return

    print(f"{APP_NAME} funcionando en {url}")
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
        threading.Thread(target=idle_watchdog, daemon=True).start()
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
