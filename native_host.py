"""Puente entre la extensión del navegador y Lumen (native messaging).

El navegador lanza Lumen.exe con el id de la extensión como argumento y le
habla por stdin/stdout: cada mensaje es un JSON precedido de su longitud
(4 bytes). Este proceso no abre ventana: busca el Lumen que está abierto (o lo
abre en la bandeja), le reenvía la petición por su servidor local y responde.

Se importa antes que yt-dlp para que el puente arranque en milisegundos.
"""
import ctypes
import json
import os
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import platform_utils as plat

HOST_NAME = "com.guisodev.lumen"
CHROME_EXTENSION_ID = "nagpgnnalidioedgdfppeicicoakgdkg"  # fijo gracias a la "key" del manifest.json de la extensión
FIREFOX_EXTENSION_ID = "lumen@guisodev.github.io"

DATA = plat.data_dir()
INSTANCE_FILE = DATA / "instance.json"
EXTENSION_FILE = DATA / "extension.json"  # en qué navegadores está instalada la extensión
OPTION_KEYS = ("mode", "quality", "audio_format", "meta", "subs", "folder", "chapters",
               "video_format", "sub_lang", "sub_auto")


def is_invocation(argv):
    """Chrome/Edge pasan «chrome-extension://<id>/»; Firefox, la ruta del manifiesto y el id."""
    return any(a.startswith("chrome-extension://") or (a.endswith(".json") and HOST_NAME in os.path.basename(a)) or a == FIREFOX_EXTENSION_ID
               for a in argv[1:])


# ---------- registro (lo hace Lumen al arrancar, sin permisos de administrador) ----------

def register():
    """Deja el manifiesto del puente en %APPDATA%\\Lumen\\native y lo anota en el
    registro de Chrome, Edge, Brave y Firefox. Apunta al Lumen.exe actual, así
    que también sirve para la versión portable. En macOS y Linux, el manifiesto
    va directamente en la carpeta que lee cada navegador."""
    if not getattr(sys, "frozen", False):
        return
    base = {"name": HOST_NAME, "description": "Lumen", "path": sys.executable, "type": "stdio"}
    if not plat.IS_WIN:
        chromium_dirs, firefox_dirs = plat.native_host_dirs()
        for folder, extra in [(d, {"allowed_origins": [f"chrome-extension://{CHROME_EXTENSION_ID}/"]}) for d in chromium_dirs] + \
                             [(d, {"allowed_extensions": [FIREFOX_EXTENSION_ID]}) for d in firefox_dirs]:
            if folder.parent.is_dir() or folder.parent.name == ".mozilla":  # solo navegadores instalados
                try:
                    folder.mkdir(parents=True, exist_ok=True)
                    _write(folder / f"{HOST_NAME}.json", base | extra)
                except OSError:
                    pass
        return
    import winreg
    folder = DATA / "native"
    folder.mkdir(parents=True, exist_ok=True)
    chromium = folder / f"{HOST_NAME}.json"
    firefox = folder / f"{HOST_NAME}.firefox.json"
    _write(chromium, base | {"allowed_origins": [f"chrome-extension://{CHROME_EXTENSION_ID}/"]})
    _write(firefox, base | {"allowed_extensions": [FIREFOX_EXTENSION_ID]})
    keys = {
        rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}": chromium,
        rf"Software\Microsoft\Edge\NativeMessagingHosts\{HOST_NAME}": chromium,
        rf"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{HOST_NAME}": chromium,
        rf"Software\Mozilla\NativeMessagingHosts\{HOST_NAME}": firefox,
    }
    for key, manifest in keys.items():
        try:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key) as k:
                winreg.SetValueEx(k, "", 0, winreg.REG_SZ, str(manifest))
        except OSError:
            pass


def _write(path, data):
    text = json.dumps(data, indent=2, ensure_ascii=False)
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8")


# ---------- protocolo con el navegador ----------

def _stdio():
    """stdin/stdout binarios. Lumen.exe es una app sin consola: ahí Python no
    crea sys.stdin/sys.stdout, pero el navegador sí le pasa las tuberías."""
    if sys.stdin is not None and sys.stdout is not None:
        return sys.stdin.buffer, sys.stdout.buffer
    import msvcrt
    k32 = ctypes.windll.kernel32
    k32.GetStdHandle.restype = ctypes.c_void_p
    fin = msvcrt.open_osfhandle(k32.GetStdHandle(-10), os.O_RDONLY | os.O_BINARY)
    fout = msvcrt.open_osfhandle(k32.GetStdHandle(-11), os.O_WRONLY | os.O_BINARY)
    return os.fdopen(fin, "rb", 0), os.fdopen(fout, "wb", 0)


def _read(stream):
    head = stream.read(4)
    if len(head) < 4:
        return None
    size = struct.unpack("<I", head)[0]
    return json.loads(stream.read(size).decode("utf-8"))


def _send(stream, msg):
    body = json.dumps(msg, ensure_ascii=False).encode("utf-8")
    stream.write(struct.pack("<I", len(body)) + body)
    stream.flush()


# ---------- hablar con Lumen ----------

def _port():
    try:
        return json.loads(INSTANCE_FILE.read_text())["port"]
    except Exception:
        return None


def _call(port, path, data=None, timeout=120):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}",
                                 data=None if data is None else json.dumps(data).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:  # Lumen explica el error en el cuerpo
        try:
            body = json.loads(e.read())
        except Exception:
            body = {}
        raise RuntimeError(body.get("error") or f"Lumen respondió {e.code}") from None


def _alive(port):
    if not port:
        return False
    try:
        _call(port, "/api/config", timeout=2)
        return True
    except Exception:
        return False


def ensure_lumen(launch=True):
    """El puerto del Lumen abierto. Si no hay ninguno, lo abre en la bandeja y espera."""
    port = _port()
    if _alive(port):
        return port
    if not launch:
        return None
    if getattr(sys, "frozen", False):
        cmd = [sys.executable, "--tray"]
    else:
        cmd = [sys.executable, str(Path(__file__).with_name("app.py")), "--tray"]
    kwargs = dict(stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
    if not plat.IS_WIN:
        subprocess.Popen(cmd, start_new_session=True, **kwargs)  # fuera del grupo del navegador
    else:
        flags = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        try:
            # Firefox y Chrome cierran los procesos hijos del puente al terminar: Lumen
            # tiene que salir de ese grupo para seguir abierto.
            subprocess.Popen(cmd, creationflags=flags | 0x01000000, **kwargs)  # CREATE_BREAKAWAY_FROM_JOB
        except OSError:
            subprocess.Popen(cmd, creationflags=flags, **kwargs)
    deadline = time.time() + 40
    while time.time() < deadline:
        time.sleep(0.3)
        port = _port()
        if _alive(port):
            return port
    raise RuntimeError("Lumen no respondió. Ábrelo una vez a mano y vuelve a intentarlo.")


def handle(msg):
    cmd = msg.get("cmd")
    if cmd == "ping":
        port = ensure_lumen(launch=False)
        return {"ok": True, "running": bool(port)}
    if cmd == "hello":  # la extensión arrancó: Lumen lo muestra en Ajustes («Instalada en Edge»)
        try:
            seen = json.loads(EXTENSION_FILE.read_text(encoding="utf-8"))
        except Exception:
            seen = {}
        name = str(msg.get("browser") or "Navegador")[:40]
        seen[name] = {"version": str(msg.get("version") or "")[:20], "at": time.time()}
        DATA.mkdir(parents=True, exist_ok=True)
        EXTENSION_FILE.write_text(json.dumps(seen, ensure_ascii=False), encoding="utf-8")
        return {"ok": True}
    if cmd == "warm":  # se abrió un video: si Lumen ya está abierto, que lo vaya analizando (nunca lo abre)
        port = ensure_lumen(launch=False)
        if port:
            _call(port, "/api/prefetch", {"url": msg["url"]}, timeout=10)
        return {"ok": True, "running": bool(port)}
    if cmd == "prefetch":  # al pasar el ratón por el botón: el análisis empieza antes del clic
        port = ensure_lumen()
        _call(port, "/api/prefetch", {"url": msg["url"]}, timeout=10)
        return {"ok": True}
    if cmd == "info":
        port = ensure_lumen()
        info = _call(port, "/api/info", {"url": msg["url"]})
        config = _call(port, "/api/config", timeout=10)
        keep = ("type", "url", "key", "title", "uploader", "duration", "thumbnail", "qualities", "audio",
                "qualities_by", "is_live", "count")
        return {"ok": True, "info": {k: info.get(k) for k in keep},
                "settings": {k: config["settings"].get(k) for k in ("mode", "quality", "audio_format", "video_format",
                                                                     "mp3_quality")},
                "lang": config.get("lang")}
    if cmd == "download":
        port = ensure_lumen()
        settings = _call(port, "/api/config", timeout=10)["settings"]
        # Lo que no se elige en el menú sale de las preferencias guardadas en Lumen
        options = {k: settings.get(k) for k in OPTION_KEYS} | {"chapters": False, "sub_lang": "", "sub_auto": False}
        options |= {k: v for k, v in (msg.get("options") or {}).items() if k in OPTION_KEYS}
        info = msg.get("info") or {}
        job = _call(port, "/api/download", {
            "url": msg["url"], "key": info.get("key"), "title": info.get("title"), "thumbnail": info.get("thumbnail"),
            "type": info.get("type") or "video", "count": info.get("count"), "options": options,
        })
        return {"ok": True, "id": job.get("id"), "title": job.get("title")}
    if cmd == "open":  # «Más opciones»: abre Lumen con el enlace, para recortar, subtítulos, etc.
        port = ensure_lumen()
        _call(port, "/api/incoming", {"url": msg.get("url")}, timeout=10)
        return {"ok": True}
    raise RuntimeError("Orden desconocida")


def run():
    stdin, stdout = _stdio()
    while True:
        msg = _read(stdin)
        if msg is None:
            return
        try:
            reply = handle(msg)
        except Exception as e:
            reply = {"ok": False, "error": str(e) or e.__class__.__name__}
        _send(stdout, reply)
