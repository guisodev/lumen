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
    root.innerHTML = `<style>
      :host { display: inline-flex; margin-right: 8px; flex: none; }
      :host(.floating) { position: fixed; right: 20px; bottom: 20px; z-index: 2200; margin: 0; }
      button { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 16px 0 12px; border: 0; border-radius: 18px; cursor: pointer;
        font: 500 14px/36px Roboto, Arial, sans-serif; color: #0f0f0f; background: rgba(0,0,0,.05); white-space: nowrap; }
      button:hover { background: rgba(0,0,0,.1); }
      :host(.dark) button { color: #f1f1f1; background: rgba(255,255,255,.1); }
      :host(.dark) button:hover { background: rgba(255,255,255,.2); }
      :host(.floating) button { height: 44px; padding: 0 18px 0 14px; background: #6d5efc; color: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.3); }
      svg { width: 22px; height: 22px; }
    </style><button type="button" title="Lumen">${ICON.down}<span>${t('Descargar')}</span></button>`;
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
    host.classList.toggle('dark', isDark()); // YouTube marca el tema oscuro con <html dark>
    if (bar) {
      if (host.parentElement !== bar) { host.classList.remove('floating'); bar.prepend(host); }
    } else if (!host.isConnected || !host.classList.contains('floating')) {
      // Mientras YouTube arma la página, esperamos un poco antes de dejarlo flotando
      if (!shorts && Date.now() - lastNav < 4000) return;
      host.classList.add('floating');
      document.body.append(host);
    }
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
