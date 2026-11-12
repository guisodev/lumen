"""Lo que cambia según el sistema: Windows, macOS o Linux.

Carpeta de datos, abrir archivos y carpetas, avisos, portapapeles, tema oscuro,
evitar la suspensión y elegir carpeta. Lo de Windows sigue en app.py (usa la API
de Windows directamente); aquí está la parte de macOS y Linux, y lo común.
Se importa antes que yt-dlp, así que solo usa la biblioteca estándar.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

IS_WIN = os.name == "nt"
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")
EXE = ".exe" if IS_WIN else ""


def data_dir():
    """Ajustes, historial y yt-dlp actualizado."""
    if IS_WIN:
        return Path(os.environ.get("APPDATA") or Path.home()) / "Lumen"
    if IS_MAC:
        return Path.home() / "Library" / "Application Support" / "Lumen"
    return Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "Lumen"


def _run(cmd, timeout=3):
    """Salida de un comando del sistema, o "" si no está o falla."""
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def _spawn(cmd):
    try:
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        pass


def open_path(path):
    """Abre un archivo o carpeta con su programa predeterminado."""
    if IS_WIN:
        os.startfile(path)
    else:
        _spawn(["open" if IS_MAC else "xdg-open", path])


def reveal(path):
    """Muestra el archivo marcado en su carpeta (Linux: abre la carpeta)."""
    if not path:
        return
    if IS_WIN:
        if os.path.isfile(path):
            subprocess.Popen(f'explorer /select,"{os.path.normpath(path)}"')
        elif os.path.isdir(path):
            os.startfile(path)
    elif IS_MAC:
        _spawn(["open", "-R", path] if os.path.exists(path) else ["open", os.path.dirname(path)])
    else:
        _spawn(["xdg-open", path if os.path.isdir(path) else os.path.dirname(path)])


def notify_unix(title, body):
    if IS_MAC:
        script = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run'
        _spawn(["osascript", "-e", script, title, body[:200]])
    elif shutil.which("notify-send"):
        _spawn(["notify-send", "--app-name=Lumen", title, body[:200]])


def clipboard_unix():
    if IS_MAC:
        return _run(["pbpaste"], 1)
    for cmd in (["wl-paste", "--no-newline"], ["xclip", "-o", "-selection", "clipboard"], ["xsel", "-ob"]):
        if shutil.which(cmd[0]):
            return _run(cmd, 1)
    return ""


def dark_mode_unix():
    if IS_MAC:
        return "dark" in _run(["defaults", "read", "-g", "AppleInterfaceStyle"]).lower()
    scheme = _run(["gsettings", "get", "org.gnome.desktop.interface", "color-scheme"])
    if scheme:
        return "dark" in scheme
    theme = _run(["gsettings", "get", "org.gnome.desktop.interface", "gtk-theme"]).lower()
    return "dark" in theme if theme else True  # sin dato: oscuro, como Lumen por defecto


def system_lang():
    """Idioma del sistema en macOS y Linux (dos letras), o ""."""
    if IS_MAC:
        out = _run(["defaults", "read", "-g", "AppleLanguages"])
        for token in out.replace("(", " ").replace(",", " ").split():
            token = token.strip('"')
            if len(token) >= 2 and token[:2].isalpha():
                return token[:2].lower()
    for var in ("LC_ALL", "LC_MESSAGES", "LANGUAGE", "LANG"):
        value = os.environ.get(var, "")
        if value[:2].isalpha():
            return value[:2].lower()
    return ""


class Inhibitor:
    """Evita que macOS o Linux se suspendan mientras hay descargas."""

    def __init__(self):
        self.proc = None

    def set(self, on):
        if on and not self.proc:
            if IS_MAC:
                cmd = ["caffeinate", "-i", "-w", str(os.getpid())]
            elif shutil.which("systemd-inhibit"):
                cmd = ["systemd-inhibit", "--what=sleep:idle", "--who=Lumen", "--why=Descargando", "sleep", "infinity"]
            else:
                return
            try:
                self.proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except OSError:
                self.proc = None
        elif not on and self.proc:
            self.proc.terminate()
            self.proc = None


def pick_folder_linux(initial, title):
    """Diálogo de carpeta en Linux cuando no hay ventana propia (zenity o kdialog)."""
    if shutil.which("zenity"):
        return _run(["zenity", "--file-selection", "--directory", f"--filename={initial}/", f"--title={title}"], 600).strip()
    if shutil.which("kdialog"):
        return _run(["kdialog", "--getexistingdirectory", initial, "--title", title], 600).strip()
    return None  # sin diálogo: app.py prueba con tkinter


# ---------- navegadores (para instalar la extensión) ----------

def find_browsers_unix():
    """{id: (nombre, orden para abrirlo, página de extensiones)} en macOS y Linux."""
    found = {}
    if IS_MAC:
        apps = {"chrome": ("Chrome", "Google Chrome.app", "chrome://extensions"),
                "edge": ("Edge", "Microsoft Edge.app", "edge://extensions"),
                "brave": ("Brave", "Brave Browser.app", "brave://extensions"),
                "firefox": ("Firefox", "Firefox.app", None)}
        for bid, (name, app, page) in apps.items():
            path = next((d / app for d in (Path("/Applications"), Path.home() / "Applications") if (d / app).exists()), None)
            if path:
                found[bid] = (name, ["open", "-a", str(path)], page)
        return found
    cmds = {"chrome": ("Chrome", ("google-chrome", "google-chrome-stable"), "chrome://extensions"),
            "chromium": ("Chromium", ("chromium", "chromium-browser"), "chrome://extensions"),
            "edge": ("Edge", ("microsoft-edge", "microsoft-edge-stable"), "edge://extensions"),
            "brave": ("Brave", ("brave-browser", "brave"), "brave://extensions"),
            "firefox": ("Firefox", ("firefox",), None)}
    for bid, (name, names, page) in cmds.items():
        exe = next((shutil.which(n) for n in names if shutil.which(n)), None)
        if exe:
            found[bid] = (name, [exe], page)
    return found


def native_host_dirs():
    """Carpetas donde cada navegador busca los puentes (macOS y Linux)."""
    home = Path.home()
    if IS_MAC:
        base = home / "Library" / "Application Support"
        chromium = [base / "Google" / "Chrome", base / "Chromium", base / "Microsoft Edge",
                    base / "BraveSoftware" / "Brave-Browser"]
        return [d / "NativeMessagingHosts" for d in chromium], [base / "Mozilla" / "NativeMessagingHosts"]
    conf = Path(os.environ.get("XDG_CONFIG_HOME") or home / ".config")
    chromium = [conf / "google-chrome", conf / "chromium", conf / "microsoft-edge", conf / "BraveSoftware" / "Brave-Browser"]
    return [d / "NativeMessagingHosts" for d in chromium], [home / ".mozilla" / "native-messaging-hosts"]


def register_url_scheme_linux(exe):
    """lumen:// en Linux, con un acceso en el menú de aplicaciones."""
    apps = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "applications"
    try:
        apps.mkdir(parents=True, exist_ok=True)
        desktop = apps / "lumen.desktop"
        text = ("[Desktop Entry]\nType=Application\nName=Lumen\nComment=Download video and music with yt-dlp\n"
                f'Exec="{exe}" %u\nIcon=video-x-generic\nTerminal=false\nCategories=AudioVideo;Network;\n'
                "MimeType=x-scheme-handler/lumen;\n")
        if not desktop.exists() or desktop.read_text(encoding="utf-8") != text:
            desktop.write_text(text, encoding="utf-8")
            _spawn(["xdg-mime", "default", "lumen.desktop", "x-scheme-handler/lumen"])
    except OSError:
        pass
