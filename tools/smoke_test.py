"""Prueba rápida del Lumen compilado (la usa GitHub Actions en cada sistema).

Uso:  python tools/smoke_test.py

1. Abre el programa sin ventana en un puerto de prueba, con una carpeta de datos
   temporal, y comprueba que responde y que encontró su ffmpeg y su deno.
2. Le habla como lo haría la extensión del navegador (native messaging).
"""
import json
import os
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
if os.name == "nt":
    BIN = DIST / "Lumen" / "Lumen.exe"
elif sys.platform == "darwin":
    BIN = DIST / "Lumen.app" / "Contents" / "MacOS" / "Lumen"
else:
    BIN = DIST / "Lumen" / "Lumen"
PORT = 8799


def env_with_temp_home(tmp):
    env = dict(os.environ)
    env["APPDATA"] = tmp          # Windows
    env["HOME"] = tmp             # macOS
    env["XDG_CONFIG_HOME"] = tmp  # Linux
    return env


def main():
    assert BIN.is_file(), f"No está {BIN}"
    tmp = tempfile.mkdtemp(prefix="lumen-smoke-")
    env = env_with_temp_home(tmp)
    proc = subprocess.Popen([str(BIN), "--no-browser", "--port", str(PORT)], env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        config = None
        for _ in range(120):
            if proc.poll() is not None:
                sys.exit("Lumen se cerró al arrancar:\n" + proc.stdout.read().decode(errors="replace")[-3000:])
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/config", timeout=2) as r:
                    config = json.loads(r.read())
                break
            except OSError:
                time.sleep(0.5)
        assert config, "Lumen no respondió en 60 s"
        print("versión:", config["app_version"], "| yt-dlp:", config["version"], "| ffmpeg:", config["ffmpeg"])
        assert config["ffmpeg"], "Lumen no encontró su ffmpeg"
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=5) as r:
            assert b"Lumen" in r.read(), "La página no carga"
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()

    # El puente de la extensión: un mensaje y su respuesta, como Chrome
    bridge = subprocess.Popen([str(BIN), "chrome-extension://nagpgnnalidioedgdfppeicicoakgdkg/"], env=env,
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    body = json.dumps({"cmd": "ping"}).encode()
    out, err = bridge.communicate(struct.pack("<I", len(body)) + body, timeout=60)
    assert len(out) >= 4, "El puente no respondió: " + err.decode(errors="replace")[-2000:]
    reply = json.loads(out[4:4 + struct.unpack("<I", out[:4])[0]])
    print("puente:", reply)
    assert reply.get("ok"), reply
    print("Prueba superada")


if __name__ == "__main__":
    main()
