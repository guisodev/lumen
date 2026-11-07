// Botón de la barra del navegador: el mismo menú, para la pestaña que estás viendo.
const api = globalThis.browser ?? globalThis.chrome;

api.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  let url = tab?.url || '';
  // En YouTube, sin la lista ni el minuto, igual que el botón de la página
  try {
    const u = new URL(url);
    if (/(^|\.)youtube\.com$/.test(u.hostname) && u.pathname === '/watch' && u.searchParams.get('v')) {
      url = `https://www.youtube.com/watch?v=${u.searchParams.get('v')}`;
    }
  } catch { /* página interna del navegador */ }
  const root = document.getElementById('root').attachShadow({ mode: 'open' });
  LumenMenu.open(root, url, {
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    flat: true,
    onDone: (ok) => setTimeout(() => window.close(), ok ? 3000 : 0),
  });
});
