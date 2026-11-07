// Recibe los pedidos del botón de YouTube y del menú de la barra, y se los pasa
// a Lumen por native messaging (el navegador abre Lumen.exe como puente).
const HOST = 'com.guisodev.lumen';
const api = globalThis.browser ?? globalThis.chrome;

async function toLumen(msg) {
  try {
    return await api.runtime.sendNativeMessage(HOST, msg);
  } catch (e) {
    const text = String(e?.message || e);
    // Chrome/Edge: «Specified native messaging host not found»; Firefox: «No such native application»
    if (/not found|no such native|forbidden|not allowed/i.test(text)) return { ok: false, error: 'nolumen' };
    if (/exited|disconnected/i.test(text)) return { ok: false, error: 'crashed' };
    return { ok: false, error: text };
  }
}

api.runtime.onMessage.addListener((message, _sender, reply) => {
  if (!message?.lumen) return false;
  toLumen(message.lumen).then(reply);
  return true; // respuesta asíncrona
});

// Clic derecho en un enlace o en la página: «Abrir en Lumen»
api.runtime.onInstalled.addListener(() => {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({
      id: 'lumen-open',
      title: api.i18n.getMessage('contextOpen'),
      contexts: ['link', 'page', 'video', 'audio'],
    });
  });
});

api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'lumen-open') return;
  const url = info.linkUrl || (/^https?:/.test(info.srcUrl || '') ? info.srcUrl : '') || info.pageUrl || tab?.url;
  if (url) toLumen({ cmd: 'open', url });
});
