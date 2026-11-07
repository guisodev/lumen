// Menú de descarga de Lumen: lo usan el botón dentro de YouTube y el botón de la barra.
// Pide a Lumen las calidades del video (con su tamaño) y le manda la descarga elegida.
(() => {
  if (globalThis.LumenMenu) return;
  const api = globalThis.browser ?? globalThis.chrome;

  const STRINGS = {
    es: {},
    en: {
      'Analizando con Lumen…': 'Analyzing with Lumen…', 'Descargar': 'Download', 'Video': 'Video', 'Solo audio': 'Audio only',
      'Máxima': 'Best', 'Más opciones en Lumen…': 'More options in Lumen…', 'Descargando en Lumen': 'Downloading in Lumen',
      'Lumen te avisa cuando termine.': 'Lumen will let you know when it’s done.', 'Ver en Lumen': 'Show in Lumen',
      'No se encontró Lumen en esta PC': 'Lumen wasn’t found on this PC',
      'La extensión necesita Lumen instalado para descargar. Si ya lo tienes, ábrelo una vez para que se conecte.':
        'The extension needs Lumen installed to download. If you already have it, open it once so it can connect.',
      'Descargar Lumen': 'Get Lumen', 'Reintentar': 'Try again', 'Tus preferencias': 'Your preferences',
      'Lumen se cerró inesperadamente. Prueba de nuevo.': 'Lumen closed unexpectedly. Please try again.',
      'Este enlace no es un video: ábrelo en Lumen para elegir qué descargar.': 'This link isn’t a single video: open it in Lumen to choose what to download.',
      'Abrir en Lumen': 'Open in Lumen', 'Lista · {n} videos': 'Playlist · {n} videos', 'Abriendo Lumen…': 'Opening Lumen…',
      'Esta página no tiene nada para descargar.': 'There’s nothing to download on this page.',
    },
    pt: {
      'Analizando con Lumen…': 'Analisando com o Lumen…', 'Descargar': 'Baixar', 'Video': 'Vídeo', 'Solo audio': 'Só áudio',
      'Máxima': 'Máxima', 'Más opciones en Lumen…': 'Mais opções no Lumen…', 'Descargando en Lumen': 'Baixando no Lumen',
      'Lumen te avisa cuando termine.': 'O Lumen avisa quando terminar.', 'Ver en Lumen': 'Ver no Lumen',
      'No se encontró Lumen en esta PC': 'O Lumen não foi encontrado neste PC',
      'La extensión necesita Lumen instalado para descargar. Si ya lo tienes, ábrelo una vez para que se conecte.':
        'A extensão precisa do Lumen instalado para baixar. Se você já tem, abra-o uma vez para conectar.',
      'Descargar Lumen': 'Baixar o Lumen', 'Reintentar': 'Tentar de novo', 'Tus preferencias': 'Suas preferências',
      'Lumen se cerró inesperadamente. Prueba de nuevo.': 'O Lumen fechou inesperadamente. Tente de novo.',
      'Este enlace no es un video: ábrelo en Lumen para elegir qué descargar.': 'Este link não é um vídeo: abra no Lumen para escolher o que baixar.',
      'Abrir en Lumen': 'Abrir no Lumen', 'Lista · {n} videos': 'Playlist · {n} vídeos', 'Abriendo Lumen…': 'Abrindo o Lumen…',
      'Esta página no tiene nada para descargar.': 'Esta página não tem nada para baixar.',
    },
    fr: {
      'Analizando con Lumen…': 'Analyse avec Lumen…', 'Descargar': 'Télécharger', 'Video': 'Vidéo', 'Solo audio': 'Audio seul',
      'Máxima': 'Max', 'Más opciones en Lumen…': 'Plus d’options dans Lumen…', 'Descargando en Lumen': 'Téléchargement dans Lumen',
      'Lumen te avisa cuando termine.': 'Lumen vous préviendra à la fin.', 'Ver en Lumen': 'Voir dans Lumen',
      'No se encontró Lumen en esta PC': 'Lumen est introuvable sur ce PC',
      'La extensión necesita Lumen instalado para descargar. Si ya lo tienes, ábrelo una vez para que se conecte.':
        'L’extension a besoin de Lumen pour télécharger. Si vous l’avez déjà, ouvrez-le une fois pour qu’il se connecte.',
      'Descargar Lumen': 'Obtenir Lumen', 'Reintentar': 'Réessayer', 'Tus preferencias': 'Vos préférences',
      'Lumen se cerró inesperadamente. Prueba de nuevo.': 'Lumen s’est fermé de façon inattendue. Réessayez.',
      'Este enlace no es un video: ábrelo en Lumen para elegir qué descargar.': 'Ce lien n’est pas une vidéo : ouvrez-le dans Lumen pour choisir quoi télécharger.',
      'Abrir en Lumen': 'Ouvrir dans Lumen', 'Lista · {n} videos': 'Playlist · {n} vidéos', 'Abriendo Lumen…': 'Ouverture de Lumen…',
      'Esta página no tiene nada para descargar.': 'Rien à télécharger sur cette page.',
    },
  };
  const lang = (navigator.language || 'es').slice(0, 2);
  const t = (k, v = {}) => ((STRINGS[lang] || STRINGS.en)[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat(navigator.language || 'es', { maximumFractionDigits: 1 });
  const size = (b) => !b ? '' : b >= 1e9 ? nf.format(b / 1e9) + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
  const resLabel = (r) => (r === 'best' ? t('Máxima') : r >= 4320 ? '8K' : r >= 2160 ? '4K' : r >= 1440 ? '2K' : r + 'p');
  const MP3_KBPS = { 0: 245, 320: 320, 256: 256, 192: 192, 128: 128 };

  const ICON = {
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  };

  const CSS = `
  :host { all: initial; }
  .menu { --bg:#fff; --fg:#0f0f0f; --muted:#606060; --line:#e5e5e5; --hover:#f2f2f2; --accent:#6d5efc; --accent-fg:#fff; --ok:#1f8a4c;
    font: 14px/1.4 Roboto, "Segoe UI", system-ui, sans-serif; color: var(--fg); background: var(--bg);
    width: 320px; max-width: calc(100vw - 24px); border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,.22), 0 0 0 1px var(--line);
    overflow: hidden; }
  .menu.dark { --bg:#212121; --fg:#f1f1f1; --muted:#aaa; --line:#3a3a3a; --hover:#2f2f2f; --accent:#8b7fff; --accent-fg:#0b0820; --ok:#4cd38a; }
  .menu.flat { box-shadow: none; border-radius: 0; width: 100%; max-width: none; }
  .head { display: flex; gap: 10px; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--line); }
  .head img { width: 64px; height: 36px; object-fit: cover; border-radius: 6px; flex: none; background: var(--hover); }
  .head b { font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .head small { color: var(--muted); display: block; }
  .body { padding: 6px 0; max-height: 60vh; overflow-y: auto; }
  .primary { display: flex; align-items: center; gap: 10px; margin: 6px 12px 8px; width: calc(100% - 24px); padding: 10px 14px; border: 0; border-radius: 10px;
    background: var(--accent); color: var(--accent-fg); font: inherit; font-weight: 600; cursor: pointer; text-align: left; }
  .primary small { display: block; font-weight: 400; opacity: .85; }
  .primary svg, .row svg { width: 20px; height: 20px; flex: none; }
  .sec { padding: 8px 16px 4px; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; display: flex; gap: 6px; align-items: center; }
  .sec svg { width: 14px; height: 14px; }
  .row { display: flex; width: 100%; align-items: center; gap: 10px; padding: 8px 16px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; text-align: left; }
  .row:hover, .row:focus-visible { background: var(--hover); outline: none; }
  .row b { font-weight: 500; min-width: 56px; }
  .row .tag { font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: var(--hover); color: var(--muted); }
  .row .pref { color: var(--accent); font-size: 12px; }
  .row .size { margin-left: auto; color: var(--muted); white-space: nowrap; }
  .foot { border-top: 1px solid var(--line); padding: 4px 0; }
  .foot .row { color: var(--muted); }
  .state { padding: 22px 18px; text-align: center; }
  .state p { margin: 6px 0 0; color: var(--muted); }
  .state b { font-weight: 500; }
  .spin { width: 28px; height: 28px; margin: 0 auto 10px; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--accent); animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .done { width: 44px; height: 44px; margin: 0 auto 8px; border-radius: 50%; background: var(--ok); color: #fff; display: grid; place-items: center; }
  .done svg { width: 26px; height: 26px; }
  .btn { display: inline-block; margin-top: 12px; padding: 8px 14px; border-radius: 18px; border: 1px solid var(--line); background: none; color: inherit; font: inherit; font-weight: 500; cursor: pointer; text-decoration: none; }
  .btn.main { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  `;

  function send(msg) {
    return new Promise((resolve) => {
      try {
        api.runtime.sendMessage({ lumen: msg }, (r) => resolve(r || { ok: false, error: api.runtime.lastError?.message || 'sin respuesta' }));
      } catch (e) {
        resolve({ ok: false, error: String(e?.message || e) }); // la extensión se actualizó: hay que recargar la página
      }
    });
  }

  const cache = new Map(); // url → respuesta de Lumen (válida unos minutos)

  /** Dibuja el menú dentro de `root` (un ShadowRoot o un elemento) para `url`. */
  async function open(root, url, { dark = false, flat = false, onDone } = {}) {
    if (!root.querySelector('style[data-lumen]')) {
      const st = document.createElement('style');
      st.dataset.lumen = '1';
      st.textContent = CSS;
      root.append(st);
    }
    let menu = root.querySelector('.menu');
    if (!menu) { menu = document.createElement('div'); root.append(menu); }
    menu.className = 'menu' + (dark ? ' dark' : '') + (flat ? ' flat' : '');
    const state = (html) => { menu.innerHTML = `<div class="state">${html}</div>`; };

    if (!url || !/^https?:/.test(url)) return state(`<b>${t('Esta página no tiene nada para descargar.')}</b>`);
    state(`<div class="spin"></div><b>${t('Analizando con Lumen…')}</b>`);

    const hit = cache.get(url);
    const r = hit && Date.now() - hit.at < 5 * 60e3 ? hit.r : await send({ cmd: 'info', url });
    if (!r.ok) {
      cache.delete(url);
      if (r.error === 'nolumen') {
        return state(`<b>${t('No se encontró Lumen en esta PC')}</b><p>${t('La extensión necesita Lumen instalado para descargar. Si ya lo tienes, ábrelo una vez para que se conecte.')}</p>
          <a class="btn main" href="https://github.com/guisodev/lumen/releases/latest" target="_blank" rel="noopener">${t('Descargar Lumen')}</a>
          <button class="btn" data-retry>${t('Reintentar')}</button>`), bindRetry();
      }
      const msg = r.error === 'crashed' ? t('Lumen se cerró inesperadamente. Prueba de nuevo.') : esc(r.error);
      return state(`<b>${msg}</b><br><button class="btn" data-retry>${t('Reintentar')}</button>`), bindRetry();
    }
    cache.set(url, { at: Date.now(), r });
    draw(r);

    function bindRetry() {
      menu.querySelector('[data-retry]')?.addEventListener('click', () => open(root, url, { dark, flat, onDone }));
    }

    function draw({ info, settings }) {
      const head = `<div class="head">${info.thumbnail ? `<img src="${esc(info.thumbnail)}" alt="">` : ''}
        <div><b>${esc(info.title || url)}</b><small>${esc(info.uploader || '')}</small></div></div>`;
      const more = `<div class="foot"><button class="row" data-open>${t('Más opciones en Lumen…')}</button></div>`;
      if (info.type !== 'video') {
        const sub = info.type === 'playlist' ? `<p>${t('Lista · {n} videos', { n: info.count || '?' })}</p>` : '';
        menu.innerHTML = head + `<div class="state">${sub}<p>${t('Este enlace no es un video: ábrelo en Lumen para elegir qué descargar.')}</p>
          <button class="btn main" data-open>${t('Abrir en Lumen')}</button></div>`;
        return bind(info);
      }
      const container = settings.video_format || 'mp4';
      const list = info.qualities_by?.[container] || info.qualities || [];
      const seen = new Set();
      const quals = list.filter((q) => { const l = resLabel(q.label ?? q.res); if (seen.has(l)) return false; seen.add(l); return true; }).slice(0, 6);
      const prefQ = String(settings.quality || 'best');
      const prefMode = settings.mode === 'audio' ? 'audio' : 'video';
      const af = settings.audio_format || 'mp3';
      const dur = info.duration || 0;
      const audioSize = { mp3: dur * (MP3_KBPS[settings.mp3_quality || '0'] || 245) * 125, m4a: info.audio?.size, opus: info.audio?.size, flac: dur * 112500, wav: dur * 176400 };

      // El botón grande: lo que elegiste la última vez en Lumen
      const prefVideo = prefQ === 'best' ? quals[0] : quals.find((q) => String(q.res) === prefQ) || quals.find((q) => q.res <= +prefQ) || quals[0];
      const prefLabel = prefMode === 'audio'
        ? `${t('Solo audio')} · ${af.toUpperCase()}${audioSize[af] ? ' · ' + size(audioSize[af]) : ''}`
        : `${container.toUpperCase()} · ${prefQ === 'best' ? `${t('Máxima')}${prefVideo ? ' (' + resLabel(prefVideo.label ?? prefVideo.res) + ')' : ''}`
          : prefVideo ? resLabel(prefVideo.label ?? prefVideo.res) : resLabel(+prefQ)}${prefVideo?.size ? ' · ' + size(prefVideo.size) : ''}`;

      const videoRows = quals.map((q) => `<button class="row" data-mode="video" data-q="${q.res}">
          <b>${resLabel(q.label ?? q.res)}</b>${q.fps > 30 ? `<span class="tag">${Math.round(q.fps)} fps</span>` : ''}${q.hdr ? '<span class="tag">HDR</span>' : ''}
          ${prefMode === 'video' && String(q.res) === prefQ ? `<span class="pref">★</span>` : ''}
          <span class="size">${size(q.size)}</span></button>`).join('');
      const audioRows = [...new Set([af, 'mp3', 'm4a', 'opus'])].slice(0, 3).map((f) => `<button class="row" data-mode="audio" data-f="${f}">
          <b>${f.toUpperCase()}</b>${prefMode === 'audio' && f === af ? '<span class="pref">★</span>' : ''}<span class="size">${size(audioSize[f])}</span></button>`).join('');

      menu.innerHTML = head + `<div class="body">
          <button class="primary" data-pref>${ICON.down}<span>${t('Descargar')}<small>${t('Tus preferencias')}: ${esc(prefLabel)}</small></span></button>
          ${quals.length ? `<div class="sec">${ICON.video}${t('Video')} · ${container.toUpperCase()}</div>${videoRows}` : ''}
          <div class="sec">${ICON.audio}${t('Solo audio')}</div>${audioRows}
        </div>` + more;
      bind(info);
    }

    function bind(info) {
      menu.querySelector('[data-pref]')?.addEventListener('click', () => download(info, {}));
      menu.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => download(info,
        b.dataset.mode === 'video' ? { mode: 'video', quality: b.dataset.q } : { mode: 'audio', audio_format: b.dataset.f })));
      menu.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => {
        state(`<div class="spin"></div><b>${t('Abriendo Lumen…')}</b>`);
        await send({ cmd: 'open', url });
        onDone?.();
      }));
    }

    async function download(info, options) {
      state(`<div class="spin"></div><b>${t('Descargar')}…</b>`);
      const { key, title, thumbnail, type, count } = info;
      const r = await send({ cmd: 'download', url, info: { key, title, thumbnail, type, count }, options });
      if (!r.ok) {
        return state(`<b>${esc(r.error === 'nolumen' ? t('No se encontró Lumen en esta PC') : r.error)}</b><br><button class="btn" data-retry>${t('Reintentar')}</button>`), bindRetry();
      }
      state(`<div class="done">${ICON.check}</div><b>${t('Descargando en Lumen')}</b><p>${esc(info.title || '')}</p>
        <p>${t('Lumen te avisa cuando termine.')}</p><button class="btn" data-show>${t('Ver en Lumen')}</button>`);
      menu.querySelector('[data-show]').addEventListener('click', () => { send({ cmd: 'open' }); onDone?.(); });
      onDone?.(true);
    }
  }

  globalThis.LumenMenu = { open, send, ICON, t };
})();
