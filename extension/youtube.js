// Botón «Descargar» de Lumen en YouTube, junto a «Me gusta» y «Compartir».
// En Shorts (o si YouTube cambia su diseño y no encontramos la barra) queda flotando.
(() => {
  const { open, send, ICON, t } = globalThis.LumenMenu;
  const BTN_ID = 'lumen-dl-button';
  const POP_ID = 'lumen-dl-menu';

  function videoUrl() {
    const u = new URL(location.href);
    const v = u.pathname === '/watch' && u.searchParams.get('v');
    if (v) return `https://www.youtube.com/watch?v=${v}`; // sin la lista ni el minuto
    const s = u.pathname.match(/^\/shorts\/([\w-]{6,})/);
    return s ? `https://www.youtube.com/shorts/${s[1]}` : null;
  }
  const isDark = () => document.documentElement.hasAttribute('dark');

  // ---------- el botón ----------
  function makeButton() {
    const host = document.createElement('div');
    host.id = BTN_ID;
    const root = host.attachShadow({ mode: 'open' });
    // Mismas medidas que los botones de YouTube (40 px de alto, ícono de 24 px a 6 px
    // del texto); el alto, los colores y la letra se copian además de sus botones
    // vecinos (ver matchYouTube), así sigue encajando si YouTube cambia su diseño.
    root.innerHTML = `<style>
      :host { display: inline-flex; flex: none; --h: 40px; }
      :host(.floating) { position: fixed; right: 20px; bottom: 20px; z-index: 2200; }
      button { display: inline-flex; align-items: center; height: var(--h); padding: 0 16px; border: 0; border-radius: calc(var(--h) / 2);
        cursor: pointer; font-family: var(--lumen-font, Roboto, Arial, sans-serif); font-size: 14px; font-weight: 500; line-height: var(--h);
        color: var(--lumen-fg, #0f0f0f); background: var(--lumen-bg, rgba(0,0,0,.05)); white-space: nowrap; transition: background-color .1s; }
      button:hover { background: rgba(0,0,0,.1); }
      button:active { background: rgba(0,0,0,.15); }
      :host(.dark) button { color: var(--lumen-fg, #f1f1f1); background: var(--lumen-bg, rgba(255,255,255,.1)); }
      :host(.dark) button:hover { background: rgba(255,255,255,.2); }
      :host(.dark) button:active { background: rgba(255,255,255,.25); }
      :host(.floating) button { --h: 44px; padding: 0 18px 0 14px; background: #6d5efc; color: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.3); }
      svg { width: 24px; height: 24px; margin-right: 6px; margin-left: -2px; flex: none; }
    </style><button type="button" title="Lumen" aria-label="${t('Descargar')} (Lumen)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5v10.5M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/></svg><span>${t('Descargar')}</span></button>`;
    const btn = root.querySelector('button');
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(host); });
    // Al pasar el ratón, Lumen empieza a analizar: cuando hagas clic ya suele estar listo
    btn.addEventListener('mouseenter', () => {
      const url = videoUrl();
      if (url && host.dataset.prefetched !== url) { host.dataset.prefetched = url; send({ cmd: 'prefetch', url }); }
    }, { passive: true });
    return host;
  }

  function mount() {
    const url = videoUrl();
    let host = document.getElementById(BTN_ID);
    if (!url) { host?.remove(); closeMenu(); return; }
    const shorts = url.includes('/shorts/');
    const bar = shorts ? null : document.querySelector('ytd-watch-metadata #top-level-buttons-computed')
      || document.querySelector('#top-level-buttons-computed');
    if (!host) host = makeButton();
    warm(url, shorts);
    host.classList.toggle('dark', isDark()); // YouTube marca el tema oscuro con <html dark>
    if (bar) {
      if (host.parentElement !== bar) { host.classList.remove('floating'); bar.prepend(host); }
      matchYouTube(host, bar);
    } else if (!host.isConnected || !host.classList.contains('floating')) {
      // Mientras YouTube arma la página, esperamos un poco antes de dejarlo flotando
      if (!shorts && Date.now() - lastNav < 4000) return;
      host.classList.add('floating');
      host.style.marginRight = '0px';
      document.body.append(host);
    }
  }

  /** Si Lumen ya está abierto, empieza a analizar el video en cuanto te quedas en
   *  él (nunca abre Lumen): al pulsar «Descargar» el menú suele estar listo.
   *  Espera un momento para no analizar los videos que solo pasas de largo. */
  let warmed = '';
  let warmTimer;
  function warm(url, shorts) {
    if (warmed === url) return;
    warmed = url;
    clearTimeout(warmTimer);
    warmTimer = setTimeout(() => { if (videoUrl() === url) send({ cmd: 'warm', url }); }, shorts ? 3000 : 1000);
  }

  /** Copia alto, colores y letra del botón de YouTube de al lado, y deja la
   *  misma separación que hay entre sus botones. */
  function matchYouTube(host, bar) {
    const ref = [...bar.querySelectorAll('button')].find((b) => !host.contains(b) && b.offsetHeight);
    if (!ref) return;
    const cs = getComputedStyle(ref);
    const set = (k, v) => { if (v && host.style.getPropertyValue(k) !== v) host.style.setProperty(k, v); };
    set('--h', `${Math.round(ref.getBoundingClientRect().height)}px`);
    set('--lumen-bg', cs.backgroundColor);
    set('--lumen-fg', cs.color);
    set('--lumen-font', cs.fontFamily);
    // Los botones de YouTube ya se separan con margen a la izquierda: no sumamos otro
    const next = host.nextElementSibling;
    const gap = next ? parseFloat(getComputedStyle(next).marginLeft) || 0 : 0;
    // En línea: las reglas de YouTube para esa barra le ganan al estilo del :host
    const margin = gap >= 4 ? '0px' : '8px';
    if (host.style.marginRight !== margin) host.style.marginRight = margin;
  }

  // ---------- el menú ----------
  function closeMenu() { document.getElementById(POP_ID)?.remove(); }

  function toggleMenu(anchor) {
    if (document.getElementById(POP_ID)) return closeMenu();
    const pop = document.createElement('div');
    pop.id = POP_ID;
    const root = pop.attachShadow({ mode: 'open' });
    document.body.append(pop);
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = Math.min(320, innerWidth - 24);
      const left = Math.max(12, Math.min(r.left, innerWidth - w - 12));
      const below = innerHeight - r.bottom > 360 || r.top < 360;
      Object.assign(pop.style, {
        position: 'absolute', zIndex: 2300, left: left + scrollX + 'px',
        top: (below ? r.bottom + 8 : r.top - 8) + scrollY + 'px', transform: below ? '' : 'translateY(-100%)',
      });
    };
    place();
    let timer;
    open(root, videoUrl(), {
      dark: isDark(),
      onDone: (ok) => { clearTimeout(timer); timer = setTimeout(closeMenu, ok ? 3500 : 0); },
    }).then(place);
  }

  document.addEventListener('click', (e) => {
    const pop = document.getElementById(POP_ID);
    if (pop && !e.composedPath().includes(pop)) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  // YouTube cambia de video sin recargar la página
  let lastNav = Date.now();
  let lastUrl = location.href;
  document.addEventListener('yt-navigate-finish', () => { lastNav = Date.now(); closeMenu(); mount(); });
  let queued = false;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; lastNav = Date.now(); closeMenu(); }
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; mount(); }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true });
  mount();
})();
