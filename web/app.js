'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ACTIVE = ['queued', 'starting', 'downloading', 'processing', 'paused', 'scheduled']; // aún no terminadas
const RUNNING = ['starting', 'downloading', 'processing']; // descargando de verdad ahora mismo
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

const state = {
  cfg: null, settings: {},
  info: null,          // resultado de /api/info (video o lista)
  bulk: null,          // array de enlaces cuando se pegan varios
  selected: new Set(), // índices marcados de una lista
  analyzing: false, lastAnalyzed: '', clipKey: null, clipUrls: [],
  search: '', prevStatus: new Map(),
  introDelay: 0, // ms extra para el historial durante la entrada inicial
};

const ICONS = {
  pause: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  resume: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  now: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5v14l8-7zM13 5v14l8-7z"/></svg>',
  up: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  folder: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  stop: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  retry: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  trash: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  play: '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  sun: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  auto: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
};

/* ---------- utilidades ---------- */

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(t(data.error || 'Error desconocido'));
    err.raw = data.raw;
    throw err;
  }
  return data;
}

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = window.t ? window.t(msg) : msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), err ? 6500 : 2800);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const extractUrls = (text) => [...new Set(String(text || '').match(URL_RE) || [])];

/* ---------- animaciones ---------- */

const EASE_OUT = 'cubic-bezier(.2, .8, .2, 1)';
const EASE_SPRING = 'cubic-bezier(.3, 1.5, .5, 1)';
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function bump(el, scale = 1.06) {
  if (!el || reduceMotion()) return;
  el.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }],
    { duration: 320, easing: EASE_SPRING });
}

function shake(el) {
  if (!el || reduceMotion()) return;
  el.animate([0, -9, 8, -6, 4, -2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 450, easing: 'ease-out' });
}

function animateIn(el, delay = 0, dy = 10) {
  if (!el || reduceMotion() || el.classList.contains('hidden')) return;
  el.animate([{ opacity: 0, transform: `translateY(${dy}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 420, delay, easing: EASE_OUT, fill: 'backwards' });
}

// Encoge una fila hasta desaparecer (para borrar del historial o de la lista).
function collapse(el, gap = 10) {
  if (!el || reduceMotion()) return Promise.resolve();
  const h = el.offsetHeight;
  return el.animate([
    { height: h + 'px', opacity: 1, transform: 'none', marginBottom: '0px' },
    { height: h + 'px', opacity: 0, transform: 'translateX(40px) scale(.98)', marginBottom: '0px', offset: 0.45 },
    { height: '0px', opacity: 0, transform: 'translateX(40px) scale(.98)', paddingTop: '0px', paddingBottom: '0px', marginBottom: -gap + 'px' },
  ], { duration: 420, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' }).finished;
}

// Onda al pulsar botones
document.addEventListener('pointerdown', (e) => {
  const host = e.target.closest('.btn, .seg button, .icon-btn');
  if (!host || host.disabled || reduceMotion()) return;
  const r = host.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 2.2;
  const s = document.createElement('span');
  s.className = 'ripple';
  s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  host.appendChild(s);
  s.addEventListener('animationend', () => s.remove());
});

// Píldora que se desliza bajo la opción elegida de cada selector
function moveSeg(seg, instant = false) {
  const ind = $('.seg-ind', seg), on = $('button.on', seg);
  if (!ind) return;
  if (!on || !seg.offsetParent) { ind.style.opacity = 0; return; }
  if (instant) ind.style.transition = 'none';
  ind.style.opacity = 1;
  ind.style.width = on.offsetWidth + 'px';
  ind.style.transform = `translateX(${on.offsetLeft}px)`;
  if (instant) { void ind.offsetWidth; ind.style.transition = ''; }
}
function initSegs(root = document) {
  $$('.seg', root).forEach((seg) => {
    if (!$('.seg-ind', seg)) {
      seg.classList.add('has-ind');
      seg.insertAdjacentHTML('afterbegin', '<span class="seg-ind"></span>');
    }
    moveSeg(seg, true);
  });
}

// Una copia de la miniatura "vuela" hasta la lista de descargas
function flyToList() {
  if (reduceMotion()) return;
  const img = $('#thumb');
  const from = (img.style.visibility !== 'hidden' && img.src && $('#panel').dataset.kind !== 'bulk' ? img : $('#media')).getBoundingClientRect();
  const target = ($('#jobs').firstElementChild || $('#empty')).getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'flyer';
  if (img.src && img.style.visibility !== 'hidden' && $('#panel').dataset.kind !== 'bulk') ghost.style.backgroundImage = `url("${img.src}")`;
  Object.assign(ghost.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
  document.body.appendChild(ghost);
  const toX = target.left + 12 - from.left;
  const toY = Math.min(target.top + 12, innerHeight - 40) - from.top;
  const scale = 112 / from.width;
  ghost.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1, borderRadius: '14px' },
    { transform: `translate(${toX * 0.35}px, ${toY * 0.2 - 60}px) scale(${(1 + scale) / 2})`, opacity: 1, offset: 0.4 },
    { transform: `translate(${toX}px, ${toY}px) scale(${scale})`, opacity: 0.2, borderRadius: '40px' },
  ], { duration: 750, easing: 'cubic-bezier(.5, 0, .3, 1)' }).finished.then(() => ghost.remove());
}

// Cambio de tema con un círculo que se expande desde el botón
function themeTransition(apply, x = innerWidth - 60, y = 40) {
  if (!document.startViewTransition || reduceMotion()) return apply();
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(apply).ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 600, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' });
  });
}

function fmtTime(s) {
  if (s == null || !isFinite(s)) return '';
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
}
function parseTime(str) {
  const parts = String(str).trim().split(':').map(Number);
  if (!parts.length || parts.length > 3 || parts.some((n) => !isFinite(n) || n < 0)) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
function fmtBytes(b) {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(b < 10 && i > 1 ? 1 : 0) + ' ' + u[i];
}
const fmtViews = (n) => (n == null ? '' : t('{n} vistas', { n: new Intl.NumberFormat(LOCALE(), { notation: 'compact' }).format(n) }));
const resLabel = (r) => (r === 'best' ? t('Máxima') : r >= 4320 ? '8K' : r >= 2160 ? '4K' : r >= 1440 ? '2K' : r + 'p');
function fmtWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000), now = new Date();
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return t('ahora');
  if (mins < 60) return t('hace {n} min', { n: mins });
  const time = d.toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return t('hoy {t}', { t: time });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t('ayer {t}', { t: time });
  return d.toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' });
}

/* ---------- configuración y tema ---------- */

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  $('#themeBtn').innerHTML = theme === 'light' ? ICONS.sun : theme === 'dark' ? ICONS.moon : ICONS.auto;
  $('#themeBtn').title = t('Tema: {v}', { v: t({ light: 'claro', dark: 'oscuro' }[theme] || 'según el sistema') });
  setSeg('#sTheme', theme || 'system');
  syncTitlebar();
  paintAmbient(); // los tonos del modo ambiente dependen del tema
}

// En la ventana de escritorio, la barra de título nativa sigue al tema de la app.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function syncTitlebar() {
  if (!state.cfg) return; // aún no sabemos el tema; loadConfig volverá a llamar
  const theme = document.documentElement.dataset.theme;
  const dark = theme ? theme === 'dark' : darkQuery.matches;
  window.pywebview?.api?.set_titlebar?.(dark)?.catch?.(() => {});
}
window.addEventListener('pywebviewready', syncTitlebar);
darkQuery.addEventListener('change', syncTitlebar);

async function saveSetting(patch) {
  Object.assign(state.settings, patch);
  try { await api('/api/settings', patch); } catch (e) { toast(e.message, true); }
}

async function loadConfig() {
  const cfg = await api('/api/config');
  state.cfg = cfg;
  const s = (state.settings = cfg.settings);
  setLang(cfg.lang);
  translateDom();
  applyTheme(s.theme); // también ajusta la barra de título si pywebview ya está listo
  $('#ffdot').classList.toggle('bad', !cfg.ffmpeg);
  $('#fftext').textContent = t(cfg.ffmpeg ? 'ffmpeg listo' : 'Falta ffmpeg');
  $('#ffpill').title = t(cfg.ffmpeg ? 'ffmpeg une video y audio y convierte a MP3' : 'Sin ffmpeg no se pueden unir video y audio ni convertir a MP3');
  $('#folder').textContent = s.folder;
  $('#meta').checked = !!s.meta;
  $('#subs').checked = !!s.subs;
  $('#schedTime').value = s.schedule_time || '02:00';
  setMode(s.mode || 'video');

  setSeg('#sParallel', String(s.parallel));
  $('#sRate').value = s.ratelimit || 0;
  $('#sTemplate').value = s.template;
  $('#sCustom').value = s.custom_template || '';
  $('#sCookies').value = s.cookies || '';
  $('#sNotify').checked = !!s.notify;
  $('#sSound').checked = !!s.sound;
  $('#sClipboard').checked = !!s.clipboard;
  $('#sAmbient').checked = s.ambient !== false;
  $('#sLang').value = s.lang || 'auto';
  $('#sVersion').textContent = `Lumen ${cfg.app_version} · yt-dlp ${cfg.version}`;
  $('#sMp3').value = String(s.mp3_quality || '0');
  $('#sTray').checked = s.tray !== false;
  $('#sAutoUpdate').checked = s.auto_update !== false;
  $('#bmCode').textContent = BOOKMARKLET;
  $('#bmNote').classList.toggle('hidden', !!cfg.frozen);
  templateHint();
  initSegs();
}

/* ---------- análisis de enlaces ---------- */

function handleText(text) {
  const urls = extractUrls(text);
  if (!urls.length) return false;
  if (urls.length > 1) {
    showBulk(urls);
  } else {
    $('#url').value = urls[0];
    analyze();
  }
  hideClipBanner();
  return true;
}

async function analyze() {
  const text = $('#url').value.trim();
  if (!text) return $('#url').focus();
  const urls = extractUrls(text);
  if (urls.length > 1) return showBulk(urls);
  const url = urls[0] || text;
  if (state.analyzing) return;
  state.analyzing = true;
  const btn = $('#analyze');
  btn.disabled = true;
  btn.innerHTML = '<i class="spin"></i>' + t('Analizando');
  $('#urlCard').classList.add('loading');
  showSkeleton(true);
  // Vistazo rápido (miniatura y título) mientras llega el análisis completo
  api('/api/peek', { url }).then((p) => {
    if (!state.analyzing || $('#skeleton').classList.contains('hidden')) return;
    if (p.thumbnail) {
      const img = $('#skThumb');
      img.onload = () => img.classList.add('on');
      img.src = p.thumbnail;
      ambientFromThumb(p.thumbnail);
    }
    if (p.title) {
      $('#skTitle').textContent = p.title;
      $('#skSub').textContent = p.uploader || '';
      $$('#skTitle, #skSub').forEach((el) => el.classList.remove('hidden'));
      $$('#skeleton .sk-t').forEach((el) => el.classList.add('hidden'));
    }
  }).catch(() => {});
  try {
    const info = await api('/api/info', { url });
    state.lastAnalyzed = url;
    showSkeleton(false);
    if (info.type === 'search') showSearch(info);
    else if (info.type === 'playlist') showPlaylist(info); else showVideo(info);
  } catch (e) {
    showSkeleton(false);
    shake($('#urlCard'));
    toast(e.message, true);
  } finally {
    state.analyzing = false;
    $('#urlCard').classList.remove('loading');
    btn.disabled = false;
    btn.textContent = t('Analizar');
  }
}

// Mientras se analiza, una tarjeta "fantasma" ocupa el lugar del panel.
function showSkeleton(on) {
  const hasPanel = !!(state.info || state.bulk);
  if (on) { // tarjeta limpia para el nuevo vistazo
    $('#skThumb').classList.remove('on');
    $('#skThumb').removeAttribute('src');
    $$('#skTitle, #skSub').forEach((el) => el.classList.add('hidden'));
    $$('#skeleton .sk-t').forEach((el) => el.classList.remove('hidden'));
  }
  $('#skeleton').classList.toggle('hidden', !on);
  $('#panel').classList.toggle('hidden', on || !hasPanel);
  $('#hero').classList.toggle('hidden', on || hasPanel);
  $('#welcome').classList.toggle('hidden', on || hasPanel);
}

function openPanel(kind) {
  stopPreview();
  scrub.loadedSec = null;
  $('#scrubImg').classList.remove('on');
  const panel = $('#panel');
  panel.dataset.kind = kind;
  panel.classList.remove('hidden');
  $('#welcome').classList.add('hidden');
  $('#hero').classList.add('hidden');
  // repetimos la animación de entrada
  panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = '';
}

// Entrada escalonada del contenido del panel, una vez relleno.
function revealPanel() {
  initSegs($('#panel'));
  if (reduceMotion()) return;
  $('#thumb').animate([{ transform: 'scale(1.08)', filter: 'blur(6px)' }, { transform: 'none', filter: 'none' }],
    { duration: 700, easing: EASE_OUT });
  [...$('#panel .meta').children, $('#entriesBox')].forEach((el, i) => animateIn(el, 60 + i * 35));
  $$('#quality .chip, #afmt .chip').forEach((c, i) => animateIn(c, 180 + i * 25, 6));
}

async function closePanel() {
  const panel = $('#panel');
  state.info = null; state.bulk = null;
  if (!panel.classList.contains('hidden') && !reduceMotion()) {
    await panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(.985)' }],
      { duration: 220, easing: 'ease-in' }).finished;
  }
  panel.classList.add('hidden');
  stopPreview();
  amb.thumb = null;
  resetAmbient();
  $('#welcome').classList.remove('hidden');
  $('#hero').classList.remove('hidden');
}

function setHeader({ title, sub, thumbnail, duration, badge }) {
  $('#thumb').src = thumbnail || '';
  $('#thumb').style.visibility = thumbnail ? '' : 'hidden';
  $('#title').textContent = title || t('Sin título');
  $('#title').title = title || '';
  $('#sub').textContent = sub.filter(Boolean).join(' · ');
  $('#dur').textContent = fmtTime(duration);
  $('#dur').classList.toggle('hidden', !duration);
  $('#plbadge').textContent = badge || '';
  $('#plbadge').classList.toggle('hidden', !badge);
}

function showVideo(info) {
  state.info = info; state.bulk = null;
  openPanel('video');
  const site = /^Youtube/.test(info.extractor || '') ? null : info.extractor;
  setHeader({ title: info.title, thumbnail: info.thumbnail, duration: info.duration,
    sub: [info.uploader, site, info.is_live ? t('En directo') : fmtViews(info.views)] });
  ambientFromThumb(info.thumbnail);
  renderVideoFormats();
  renderQualities(qualitiesFor(info));
  renderAudioFormats(info);
  renderSubLangs(info.subtitles);
  $('#entriesBox').classList.add('hidden');
  const canClip = !!info.duration && !info.is_live;
  $('#clipWrap').classList.toggle('hidden', !canClip);
  $('#clipOn').checked = false;
  $('#chapWrap').classList.toggle('hidden', !info.chapters);
  $('#chapOn').checked = false;
  $('#chapText').textContent = t('Dividir en {n} capítulos', { n: info.chapters });
  $('#clipBody').classList.add('hidden');
  if (canClip) {
    setupClip(info.duration);
    ensureStream(info.key); // así "Ver el fragmento" y los fotogramas responden al instante
  }
  updateDownloadLabel();
  revealPanel();
}

function showPlaylist(info) {
  state.info = info; state.bulk = null;
  state.selected = new Set(info.entries.map((e) => e.index));
  openPanel('playlist');
  setHeader({ title: t(info.title), thumbnail: info.thumbnail, duration: info.duration,
    sub: [info.uploader, t('{n} videos', { n: info.count })], badge: t('Lista · {n}', { n: info.count }) });
  ambientFromThumb(info.thumbnail);
  renderVideoFormats();
  renderQualities([]);
  renderAudioFormats(null);
  renderSubLangs(null);
  $('#clipWrap').classList.add('hidden');
  $('#clipBody').classList.add('hidden');
  $('#entries').innerHTML = info.entries.map((e) => `
    <label class="entry" data-i="${e.index}">
      <input type="checkbox" checked>
      <span class="n">${e.index}</span>
      ${e.thumbnail ? `<img loading="lazy" src="${esc(e.thumbnail)}" alt="">` : '<span class="ph"></span>'}
      <span class="t" title="${esc(e.title)}">${esc(e.title)}</span>
      <span class="d">${fmtTime(e.duration)}</span>
    </label>`).join('');
  $('#entriesBox').classList.remove('hidden');
  $$('#selAll, #selNone').forEach((b) => b.classList.remove('hidden'));
  updateSelection();
  revealPanel();
  $$('#entries .entry').slice(0, 12).forEach((el, i) => animateIn(el, 220 + i * 30, 8));
}

function showBulk(urls) {
  state.info = null; state.bulk = urls;
  $('#url').value = '';
  openPanel('bulk');
  amb.thumb = null;
  resetAmbient();
  setHeader({ title: t('{n} enlaces', { n: urls.length }), thumbnail: null, sub: [t('Se descargarán con las mismas opciones')] });
  renderVideoFormats();
  renderQualities([]);
  renderAudioFormats(null);
  renderSubLangs(null);
  $('#clipWrap').classList.add('hidden');
  $('#clipBody').classList.add('hidden');
  renderBulkList();
  $('#entriesBox').classList.remove('hidden');
  $$('#selAll, #selNone').forEach((b) => b.classList.add('hidden'));
  revealPanel();
  $$('#entries .entry').slice(0, 12).forEach((el, i) => animateIn(el, 220 + i * 30, 8));
}

function renderBulkList() {
  const urls = state.bulk;
  $('#entries').innerHTML = urls.map((u, i) => `
    <div class="entry"><span class="n">${i + 1}</span><span class="t" title="${esc(u)}">${esc(u)}</span>
      <button class="icon-btn" data-rm="${i}" title="${t('Quitar')}">${ICONS.stop}</button></div>`).join('');
  $('#selCount').textContent = t('{n} enlaces', { n: urls.length });
  setHeader({ title: t('{n} enlaces', { n: urls.length }), thumbnail: null, sub: [t('Se descargarán con las mismas opciones')] });
  updateDownloadLabel();
}

function updateSelection() {
  $$('#entries .entry').forEach((el) => {
    const on = state.selected.has(+el.dataset.i);
    el.classList.toggle('off', !on);
    $('input', el).checked = on;
  });
  $('#selCount').textContent = t('{a} de {b} seleccionados', { a: state.selected.size, b: state.info.count });
  updateDownloadLabel();
}

function updateDownloadLabel() {
  let text = t('Descargar'), n = 1;
  if (state.bulk) { n = state.bulk.length; text = t('Descargar {n} enlaces', { n }); }
  else if (state.info?.type === 'playlist') { n = state.selected.size; text = t(n === 1 ? 'Descargar {n} video' : 'Descargar {n} videos', { n }); }
  else if ($('#clipOn').checked) text = t('Descargar fragmento');
  $('#dlText').textContent = text;
  $('#download').disabled = n === 0;
}

/* ---------- opciones ---------- */

function setSeg(sel, v) {
  $$(sel + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  moveSeg($(sel));
}
function selectChip(sel, v) { $$(sel + ' .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === String(v))); }
const chipValue = (sel) => $(sel + ' .chip.on')?.dataset.v;
const currentMode = () => $('#mode button.on').dataset.v;

function setMode(m) {
  setSeg('#mode', m);
  $('#qualityRow').classList.toggle('hidden', m !== 'video');
  $('#vfmtRow').classList.toggle('hidden', m !== 'video');
  $('#afmtRow').classList.toggle('hidden', m !== 'audio');
  $('#subsWrap').classList.toggle('off', m !== 'video');
}

function renderQualities(qualities) {
  const generic = [2160, 1440, 1080, 720, 480, 360].map((res) => ({ res }));
  const list = qualities.length ? qualities : generic;
  // no repetimos etiquetas (p. ej. dos alturas que acaban siendo "4K")
  const name = (q) => resLabel(q.res === 'best' ? 'best' : q.label ?? q.res);
  const unique = list.filter((q, i) => i === 0 || name(q) !== name(list[i - 1]));
  const opts = [{ ...unique[0], res: 'best' }, ...unique].slice(0, 9);
  $('#quality').innerHTML = opts.map((q) => {
    const tags = [q.fps >= 50 ? `<i>${Math.round(q.fps)}</i>` : '', q.hdr ? '<i class="hdr">HDR</i>' : ''].join('');
    const detail = [q.codec, q.fps ? Math.round(q.fps) + ' fps' : '', q.hdr ? 'HDR' : ''].filter(Boolean).join(' · ');
    return `<button class="chip" data-v="${q.res}" title="${esc(detail)}">
      <b>${name(q)}</b>${q.size ? `<small>~${fmtBytes(q.size)}</small>` : ''}
      ${tags && q.res !== 'best' ? `<span class="tags">${tags}</span>` : ''}</button>`;
  }).join('');
  const saved = String(state.settings.quality || 'best');
  selectChip('#quality', opts.some((q) => String(q.res) === saved) ? saved : 'best');
}

// MP4 se abre en cualquier sitio; MKV guarda la mejor calidad (AV1/VP9); WebM es VP9 + Opus
const VIDEO_FORMATS = [['mp4', 'Compatible'], ['mkv', 'Máxima calidad'], ['webm', 'VP9']];

function renderVideoFormats() {
  $('#vfmt').innerHTML = VIDEO_FORMATS.map(([f, note]) =>
    `<button class="chip" data-v="${f}"><b>${f.toUpperCase()}</b><small>${t(note)}</small></button>`).join('');
  selectChip('#vfmt', state.settings.video_format || 'mp4');
}

// Cada formato elige códecs distintos, así que el tamaño de cada calidad cambia
const qualitiesFor = (info) => info?.qualities_by?.[chipValue('#vfmt') || 'mp4'] || info?.qualities || [];

// "es-3pK74FgVxOs" (YouTube añade el id de la pista) → "es"; "pt-BR" y "zh-Hans" se quedan
function langTag(code) {
  const [lang, next] = code.split('-');
  return next && /^([A-Za-z]{2}|\d{3}|[A-Z][a-z]{3})$/.test(next) ? `${lang}-${next}` : lang;
}

function langName(code) {
  const tag = langTag(code);
  try { return new Intl.DisplayNames([LOCALE()], { type: 'language' }).of(tag) || tag; } catch { return tag; }
}

function renderSubLangs(subs) {
  const sel = $('#subLang');
  state.subLangs = subs;
  if (!subs) { // listas y varios enlaces: no sabemos qué idiomas tiene cada video
    sel.classList.add('hidden');
    $('#subsWrap').classList.remove('none');
    return;
  }
  $('#subsWrap').classList.toggle('none', !subs.length); // el video no tiene subtítulos
  if (!subs.length) return;
  const labels = subs.map((s) => {
    const name = langName(s.code);
    return name.charAt(0).toUpperCase() + name.slice(1) + (s.auto ? ' · ' + t('automáticos') : '');
  });
  // en orden alfabético del idioma de la app; dos pistas del mismo idioma se numeran
  const order = subs.map((_, i) => i).sort((a, b) => labels[a].localeCompare(labels[b], LOCALE()));
  const seen = {};
  sel.innerHTML = order.map((i) => {
    seen[labels[i]] = (seen[labels[i]] || 0) + 1;
    const label = labels[i] + (seen[labels[i]] > 1 ? ` (${seen[labels[i]]})` : '');
    return `<option value="${i}">${esc(label)}</option>`;
  }).join('');
  // el idioma de la app; si no está, el original del video; si no, el primero
  const pick = (pred) => subs.findIndex(pred);
  let i = pick((s) => !s.auto && langTag(s.code).split('-')[0] === LOCALE());
  if (i < 0) i = pick((s) => langTag(s.code).split('-')[0] === LOCALE());
  if (i < 0) i = pick((s) => s.code.endsWith('-orig'));
  sel.value = String(Math.max(0, i));
  sel.classList.toggle('hidden', !$('#subs').checked);
}

function renderAudioFormats(info) {
  const dur = info?.duration;
  const src = info?.audio?.size;
  const mp3kbps = { 0: 245, 320: 320, 256: 256, 192: 192, 128: 128 }[state.settings.mp3_quality || '0'] || 245;
  const est = { mp3: dur && dur * mp3kbps * 1000 / 8, m4a: src, opus: src,
    flac: dur && dur * 900000 / 8, wav: dur && dur * 1411200 / 8 }; // FLAC y WAV: aproximado, sin pérdida
  $('#afmt').innerHTML = ['mp3', 'm4a', 'opus', 'flac', 'wav'].map((f) =>
    `<button class="chip" data-v="${f}"><b>${f.toUpperCase()}</b>${est[f] ? `<small>~${fmtBytes(est[f])}</small>` : ''}</button>`).join('');
  selectChip('#afmt', state.settings.audio_format || 'mp3');
}

/* ---------- fragmento ---------- */

function setupClip(duration) {
  const max = Math.floor(duration);
  for (const id of ['#rStart', '#rEnd']) $(id).max = max;
  setClip(0, max);
}
function getClip() { return [+$('#rStart').value, +$('#rEnd').value]; }
function setClip(a, b) {
  const max = +$('#rEnd').max;
  a = Math.max(0, Math.min(a, max - 1));
  b = Math.max(a + 1, Math.min(b, max));
  $('#rStart').value = a; $('#rEnd').value = b;
  $('#tStart').value = fmtTime(a); $('#tEnd').value = fmtTime(b);
  $$('#tStart, #tEnd').forEach((el) => el.classList.remove('bad'));
  $('#rangeFill').style.left = (a / max) * 100 + '%';
  $('#rangeFill').style.width = ((b - a) / max) * 100 + '%';
  $('#clipLen').textContent = t('Duración {d}', { d: fmtTime(b - a) });
  markPreviewStale();
}

$('#rStart').addEventListener('input', () => { const [a, b] = getClip(); setClip(Math.min(a, b - 1), b); showScrub(getClip()[0], true); });
$('#rEnd').addEventListener('input', () => { const [a, b] = getClip(); setClip(a, Math.max(b, a + 1)); showScrub(getClip()[1], true); });
for (const id of ['#tStart', '#tEnd']) {
  $(id).addEventListener('change', () => {
    const v = parseTime($(id).value);
    if (!isFinite(v)) return $(id).classList.add('bad');
    const [a, b] = getClip();
    id === '#tStart' ? setClip(v, b) : setClip(a, v);
  });
}
$('#clipOn').addEventListener('change', async () => {
  $('#clipBody').classList.toggle('hidden', !$('#clipOn').checked);
  $('#chapWrap').classList.toggle('off', $('#clipOn').checked); // un fragmento no se divide en capítulos
  updateDownloadLabel();
  if (!$('#clipOn').checked) return stopPreview();
  // precargamos el video oculto para que el primer fotograma también sea instantáneo
  const key = state.info?.key;
  if (key && (await ensureStream(key)) !== 'none') frameFromStream(key, 0).catch(() => {});
});

/* ---------- fotograma bajo el cursor ---------- */
// Con storyboard (YouTube) mostramos al instante la miniatura aproximada; al
// detenerse el cursor pedimos al servidor el fotograma real con ffmpeg.

const scrub = { t: 0, dragging: false, hovering: false, timer: null, ctrl: null, loadedSec: null, objectUrl: null };
const THUMB_R = 9; // radio del tirador del deslizador, para alinear con su centro

function timeAtX(clientX) {
  const r = $('#range').getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (clientX - r.left - THUMB_R) / (r.width - THUMB_R * 2)));
  return pct * +$('#rEnd').max;
}

function paintStoryboard(t) {
  const sb = state.info?.storyboard;
  const frame = $('#scrubFrame');
  if (!sb) { frame.style.backgroundImage = ''; return; }
  const per = sb.rows * sb.cols;
  const idx = Math.floor(t / sb.interval);
  const frag = Math.min(Math.floor(idx / per), sb.urls.length - 1);
  const within = Math.min(idx - frag * per, per - 1);
  const col = within % sb.cols, row = Math.floor(within / sb.cols);
  frame.style.backgroundImage = `url("${sb.urls[frag]}")`;
  frame.style.backgroundSize = `${sb.cols * 100}% ${sb.rows * 100}%`;
  frame.style.backgroundPosition = `${sb.cols > 1 ? (col / (sb.cols - 1)) * 100 : 0}% ${sb.rows > 1 ? (row / (sb.rows - 1)) * 100 : 0}%`;
}

function showScrub(t, dragging = false) {
  if (!state.info?.key) return;
  const max = +$('#rEnd').max;
  scrub.t = t = Math.min(Math.max(0, t), max);
  if (dragging) scrub.dragging = true;
  const el = $('#scrub');
  const w = $('#range').clientWidth;
  const x = THUMB_R + (t / max) * (w - THUMB_R * 2);
  const half = $('#scrubFrame').offsetWidth / 2 || 88;
  el.style.left = Math.min(Math.max(x, half - 16), w - half + 16) + 'px';
  el.classList.add('show');
  $('#scrubTime').textContent = fmtTime(t);
  paintStoryboard(t);
  const sec = Math.floor(t);
  // el fotograma real anterior solo se queda si no hay storyboard que lo sustituya
  $('#scrubImg').classList.toggle('on', scrub.loadedSec === sec || (!state.info.storyboard && scrub.loadedSec != null));
  $('#scrubImg').classList.toggle('stale', scrub.loadedSec !== sec);
  requestRealFrame(sec);
}

function hideScrub() {
  if (scrub.dragging || scrub.hovering) return;
  $('#scrub').classList.remove('show');
  clearTimeout(scrub.timer);
}

function onceEvent(el, ev, ms) {
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { el.removeEventListener(ev, done); reject(new Error('timeout')); }, ms);
    el.addEventListener(ev, done, { once: true });
  });
}

// Fotograma real sin ffmpeg: un <video> oculto salta al segundo y lo copiamos a un canvas.
let scrubVid = null;
async function frameFromStream(key, sec) {
  if (!scrubVid || scrubVid._key !== key) {
    scrubVid?.removeAttribute('src');
    scrubVid = Object.assign(document.createElement('video'), { muted: true, preload: 'auto', _key: key, _token: 0 });
    scrubVid.src = `/stream/${key}/v`;
  }
  const vid = scrubVid;
  const token = ++vid._token;
  if (vid.readyState < 1) await onceEvent(vid, 'loadedmetadata', 8000);
  const seeked = onceEvent(vid, 'seeked', 8000);
  vid.currentTime = Math.min(sec + 0.05, (vid.duration || sec + 1) - 0.1);
  await seeked;
  if (token !== vid._token) return null; // llegó otra petición más nueva
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = Math.round((320 * (vid.videoHeight || 180)) / (vid.videoWidth || 320));
  c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

function requestRealFrame(sec) {
  clearTimeout(scrub.timer);
  if (scrub.loadedSec === sec) return;
  const key = state.info.key;
  const direct = pv.key === key && pv.mode && pv.mode !== 'none';
  scrub.timer = setTimeout(async () => {
    scrub.ctrl?.abort();
    const ctrl = (scrub.ctrl = new AbortController());
    $('#scrubFrame').classList.add('loading');
    try {
      let src = null;
      if (direct) {
        try {
          src = await frameFromStream(key, sec);
          if (src === null) return;
        } catch { src = null; }
      }
      if (!src) {
        const res = await fetch(`/api/frame?key=${key}&t=${sec}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        if (scrub.objectUrl) URL.revokeObjectURL(scrub.objectUrl);
        src = scrub.objectUrl = URL.createObjectURL(await res.blob());
      }
      if (Math.floor(scrub.t) !== sec) return;
      $('#scrubImg').src = src;
      scrub.loadedSec = sec;
      $('#scrubImg').classList.add('on');
      $('#scrubImg').classList.remove('stale');
    } catch { /* cancelado o sin fotograma: se queda el storyboard */ }
    finally { if (scrub.ctrl === ctrl) $('#scrubFrame').classList.remove('loading'); }
  }, direct ? 80 : state.info?.storyboard ? 320 : 180);
}

$('#range').addEventListener('pointermove', (e) => {
  scrub.hovering = true;
  if (!scrub.dragging) showScrub(timeAtX(e.clientX));
});
$('#range').addEventListener('pointerleave', () => { scrub.hovering = false; hideScrub(); });
document.addEventListener('pointerup', () => {
  if (!scrub.dragging) return;
  scrub.dragging = false;
  hideScrub();
});

/* ---------- vista previa del fragmento ---------- */

// Modo directo: el <video> reproduce el original (vía /stream) desde el inicio
// del fragmento y vuelve a él al llegar al final; mover los tiradores lo
// actualiza al momento. Si video y audio van separados (YouTube), un <audio>
// va sincronizado. Si el sitio no lo permite, se genera un clip ligero.

const PV_ICONS = {
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  vol: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
  muted: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor"/><path d="m16 9 6 6M22 9l-6 6"/></svg>',
};
const NOTE_IDLE = () => t('Pasa el cursor por la barra para ver cada momento');
const pv = { key: null, mode: null, live: false, generated: null, audio: null, raf: 0, lastStart: null, seekTimer: null, muted: false };
const pvVideo = $('#clipVideo');

async function ensureStream(key) {
  if (pv.key === key && pv.mode) return pv.mode;
  pv.key = key; pv.mode = null;
  try { pv.mode = (await api('/api/stream-info', { key })).mode; } catch { pv.mode = 'none'; }
  return pv.mode;
}

// Límites del fragmento en el tiempo del <video>
function pvBounds() {
  if (pv.generated) return [0, pvVideo.duration || pv.generated.end - pv.generated.start];
  return getClip();
}

function seekPreview(t) {
  pvVideo.currentTime = t;
  if (pv.audio) pv.audio.currentTime = t;
}

function tickPreview() {
  if (!pv.live && !pv.generated) return;
  const [a, b] = pvBounds();
  const t = pvVideo.currentTime;
  if (pv.live && !pvVideo.seeking && (t >= b || t < a - 0.75)) seekPreview(a);
  if (pv.audio && !pvVideo.paused && !pvVideo.seeking && Math.abs(pv.audio.currentTime - t) > 0.3) pv.audio.currentTime = t;
  $('#pvFill').style.width = Math.min(100, Math.max(0, ((t - a) / (b - a)) * 100)) + '%';
  $('#pvTime').textContent = `${fmtTime(Math.max(0, Math.min(t, b) - a))} / ${fmtTime(b - a)}`;
  sampleAmbient();
  pv.raf = requestAnimationFrame(tickPreview);
}

function updateBadge() {
  const [a, b] = pv.generated ? [pv.generated.start, pv.generated.end] : getClip();
  $('#clipBadge').textContent = `✂ ${fmtTime(a)}–${fmtTime(b)}`;
}

function setWaiting(on) { $('#pvWait').classList.toggle('hidden', !on); }
function updatePlayBtn() {
  $('#pvPlay').innerHTML = pvVideo.paused ? PV_ICONS.play : PV_ICONS.pause;
  $('#pvPlay').title = t(pvVideo.paused ? 'Reproducir' : 'Pausa');
}
function applyMute() {
  if (pv.audio) pv.audio.muted = pv.muted; else pvVideo.muted = pv.muted;
  $('#pvMute').innerHTML = pv.muted ? PV_ICONS.muted : PV_ICONS.vol;
  $('#pvMute').title = t(pv.muted ? 'Activar sonido' : 'Silenciar');
}
function playPreview() {
  pvVideo.play().catch(() => {});
  if (pv.audio) pv.audio.play().catch(() => {});
}

function showPreviewUI() {
  pvVideo.classList.remove('hidden');
  $('#media').classList.add('playing');
  $$('#clipVideoClose, #clipBadge, #pvControls').forEach((el) => el.classList.remove('hidden'));
  updateBadge(); updatePlayBtn(); applyMute();
  cancelAnimationFrame(pv.raf);
  pv.raf = requestAnimationFrame(tickPreview);
  if (!reduceMotion()) pvVideo.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: EASE_OUT });
}

function startLive(key, mode) {
  stopPreview();
  const [a] = getClip();
  pv.live = true; pv.lastStart = a;
  pvVideo.loop = false;
  pvVideo.src = `/stream/${key}/v#t=${a}`;
  if (mode === 'split') {
    pvVideo.muted = true; // el sonido va por el <audio>
    pv.audio = new Audio(`/stream/${key}/a#t=${a}`);
    pv.audio.preload = 'auto';
    pv.audio.addEventListener('error', () => toast('No se pudo cargar el audio de la vista previa', true), { once: true });
  }
  $('#clipNote').textContent = t('Reproduciendo · mueve los tiradores y se actualiza al momento');
  $('#clipPreview span').textContent = t('Desde el inicio');
  showPreviewUI();
  setWaiting(true);
  playPreview();
}

// Plan B para sitios sin descarga directa: clip ligero preparado en el servidor.
async function generatedPreview(key) {
  const [a, b] = getClip();
  $('#media').classList.add('loading-preview');
  $('#mediaLoading').classList.remove('hidden');
  try {
    const r = await api('/api/clip-preview', { key, start: a, end: b });
    if (state.info?.key !== key) return;
    stopPreview();
    pv.generated = { start: r.start, end: r.end, for: `${a}-${b}` };
    pvVideo.loop = true;
    pvVideo.muted = false;
    pvVideo.src = r.url;
    $('#clipNote').textContent = t(r.trimmed ? 'Este sitio no permite verlo en directo: se muestran los primeros 30 s' : 'Esto es lo que vas a descargar');
    showPreviewUI();
    playPreview();
  } catch (e) {
    shake($('#clipPreview'));
    toast(e.message, true);
  } finally {
    $('#media').classList.remove('loading-preview');
    $('#mediaLoading').classList.add('hidden');
  }
}

async function previewClip() {
  const key = state.info?.key;
  if (!key) return;
  if (pv.live) return seekPreview(getClip()[0]), playPreview();
  const btn = $('#clipPreview');
  btn.disabled = true;
  try {
    const mode = await ensureStream(key);
    if (state.info?.key !== key) return;
    if (mode === 'none') await generatedPreview(key);
    else startLive(key, mode);
  } finally {
    btn.disabled = false;
  }
}

// Llamado desde setClip: en directo, la vista previa sigue a los tiradores.
function markPreviewStale() {
  if (pv.live) {
    updateBadge();
    const [a] = getClip();
    if (a !== pv.lastStart) {
      pv.lastStart = a;
      clearTimeout(pv.seekTimer);
      pv.seekTimer = setTimeout(() => seekPreview(getClip()[0]), 120);
    }
  } else if (pv.generated) {
    const stale = pv.generated.for !== `${getClip()[0]}-${getClip()[1]}`;
    $('#clipPreview span').textContent = t(stale ? 'Actualizar vista previa' : 'Ver el fragmento');
    if (stale) $('#clipNote').textContent = t('Cambiaste el fragmento');
  }
}

function stopPreview() {
  cancelAnimationFrame(pv.raf);
  clearTimeout(pv.seekTimer);
  pvVideo.pause();
  pvVideo.removeAttribute('src');
  pvVideo.load();
  if (pv.audio) { pv.audio.pause(); pv.audio.removeAttribute('src'); pv.audio.load(); pv.audio = null; }
  pv.live = false; pv.generated = null;
  pvVideo.classList.add('hidden');
  $('#media').classList.remove('playing');
  $$('#clipVideoClose, #clipBadge, #pvControls, #pvWait').forEach((el) => el.classList.add('hidden'));
  $('#clipPreview span').textContent = t('Ver el fragmento');
  $('#clipNote').textContent = NOTE_IDLE();
  if (amb.thumb?.complete) applyAmbient(amb.thumb); // vuelven los colores de la miniatura
}

pvVideo.addEventListener('waiting', () => { setWaiting(true); pv.audio?.pause(); });
pvVideo.addEventListener('playing', () => {
  setWaiting(false);
  if (pv.audio) { pv.audio.currentTime = pvVideo.currentTime; pv.audio.play().catch(() => {}); }
});
pvVideo.addEventListener('pause', () => { pv.audio?.pause(); updatePlayBtn(); });
pvVideo.addEventListener('play', updatePlayBtn);
pvVideo.addEventListener('seeking', () => { if (pv.audio) pv.audio.currentTime = pvVideo.currentTime; });
pvVideo.addEventListener('error', () => {
  if (!pv.live || !pvVideo.getAttribute('src')) return;
  const key = pv.key;
  stopPreview();
  pv.mode = 'none'; // no volver a intentarlo en directo con este video
  generatedPreview(key);
});
pvVideo.addEventListener('click', () => (pvVideo.paused ? playPreview() : pvVideo.pause()));
$('#pvPlay').addEventListener('click', () => (pvVideo.paused ? playPreview() : pvVideo.pause()));
$('#pvMute').addEventListener('click', () => { pv.muted = !pv.muted; applyMute(); });
$('#pvBar').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const [a, b] = pvBounds();
  seekPreview(a + ((e.clientX - r.left) / r.width) * (b - a));
});
$('#clipPreview').addEventListener('click', previewClip);
$('#clipVideoClose').addEventListener('click', stopPreview);

/* ---------- modo ambiente ---------- */
// Como el modo ambiente de YouTube: un resplandor difuminado del fotograma
// rodea al video y las luces del fondo se tiñen con sus colores. Las
// transiciones suaves vienen del CSS (@property --aura-*).

const amb = { thumb: null, last: 0, colors: null };
const ambSample = Object.assign(document.createElement('canvas'), { width: 24, height: 14 });
const ambCtx = ambSample.getContext('2d', { willReadFrequently: true });
const glowCtx = $('#ambGlow').getContext('2d');

function regionAvg(data, x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * 24 + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return [r / n, g / n, b / n];
}

// Color de luz agradable a partir de un promedio: más saturado y con brillo acotado.
function vivid([r, g, b], alpha) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  const light = document.documentElement.dataset.theme === 'light' || (!document.documentElement.dataset.theme && !darkQuery.matches);
  const sat = Math.min(100, (s * 1.35 + 0.1) * 100);
  const lum = light ? Math.min(72, Math.max(52, l * 100 + 10)) : Math.min(58, Math.max(34, l * 100));
  return `hsla(${Math.round((h + 360) % 360)}, ${sat.toFixed(0)}%, ${lum.toFixed(0)}%, ${light ? alpha * 0.7 : alpha})`;
}

function paintAmbient() {
  if (!amb.colors) return;
  const [left, right, center] = amb.colors;
  const root = document.documentElement.style;
  root.setProperty('--aura-1', vivid(left, 0.75));
  root.setProperty('--aura-2', vivid(right, 0.65));
  root.setProperty('--aura-3', vivid(center, 0.35));
}

function applyAmbient(source) {
  if (!state.settings.ambient) return;
  let data;
  try {
    ambCtx.drawImage(source, 0, 0, 24, 14);
    data = ambCtx.getImageData(0, 0, 24, 14).data;
  } catch { return; } // imagen aún no lista o sin permiso para leerla
  const avg = regionAvg(data, 0, 0, 24, 14);
  if (avg[0] + avg[1] + avg[2] < 30) return; // fotograma negro: mantenemos los colores anteriores
  amb.colors = [regionAvg(data, 0, 7, 9, 14), regionAvg(data, 15, 0, 24, 7), regionAvg(data, 6, 3, 18, 11)];
  paintAmbient();
  glowCtx.drawImage(source, 0, 0, 64, 36);
  $('#ambGlow').classList.add('on');
}

function ambientFromThumb(url) {
  amb.thumb = null;
  if (!url || !state.settings.ambient) return;
  const img = new Image();
  img.onload = () => {
    if (amb.thumb !== img) return; // llegó otra miniatura después
    if (!pv.live && !pv.generated) applyAmbient(img);
  };
  amb.thumb = img;
  img.src = '/api/img?u=' + encodeURIComponent(url);
}

function resetAmbient() {
  amb.colors = null;
  ['--aura-1', '--aura-2', '--aura-3'].forEach((p) => document.documentElement.style.removeProperty(p));
  $('#ambGlow').classList.remove('on');
}

// Durante la vista previa, unas 6 veces por segundo (el CSS suaviza el cambio).
function sampleAmbient() {
  const now = performance.now();
  if (now - amb.last < 160 || pvVideo.readyState < 2 || pvVideo.paused) return;
  amb.last = now;
  applyAmbient(pvVideo);
}

$('#sAmbient').addEventListener('change', (e) => {
  saveSetting({ ambient: e.target.checked });
  if (!e.target.checked) resetAmbient();
  else if (amb.thumb?.complete) applyAmbient(amb.thumb);
});

/* ---------- descargar ---------- */

function currentOptions() {
  return {
    mode: currentMode(), quality: chipValue('#quality') || 'best', audio_format: chipValue('#afmt') || 'mp3',
    meta: $('#meta').checked, subs: $('#subs').checked, folder: $('#folder').textContent,
    chapters: !$('#chapWrap').classList.contains('hidden') && $('#chapOn').checked && !$('#clipOn').checked,
    video_format: chipValue('#vfmt') || 'mp4', ...subChoice(),
  };
}

function subChoice() {
  const s = state.subLangs?.[+$('#subLang').value];
  return s && $('#subs').checked ? { sub_lang: s.code, sub_auto: s.auto } : { sub_lang: '', sub_auto: false };
}

// Próxima vez que el reloj marque esa hora: hoy si aún no ha pasado, si no mañana
function nextAt(hhmm) {
  const [h, m] = (hhmm || '').split(':').map(Number);
  if (!isFinite(h) || !isFinite(m)) return null;
  const d = new Date(); d.setHours(h, m, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d;
}

function fmtAt(ts) {
  const d = new Date(ts * 1000), now = new Date();
  const time = d.toLocaleTimeString(LOCALE(), { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return t('hoy {t}', { t: time });
  const tm = new Date(now); tm.setDate(now.getDate() + 1);
  if (d.toDateString() === tm.toDateString()) return t('mañana {t}', { t: time });
  return d.toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' }) + ' ' + time;
}

async function download(startAt = null) {
  const opts = currentOptions();
  Object.assign(state.settings, opts);
  if (startAt) opts.start_at = startAt;
  const btn = $('#download');
  btn.disabled = true;
  try {
    if (state.bulk) {
      for (const url of state.bulk) await api('/api/download', { ...opts, url, type: 'video' });
      toast(t('{n} descargas añadidas', { n: state.bulk.length }));
      celebrate();
      wait(900).then(closePanel);
    } else if (state.info?.type === 'playlist') {
      const all = state.selected.size === state.info.count;
      await api('/api/download', {
        ...opts, url: state.info.url, type: 'playlist', title: state.info.title, thumbnail: state.info.thumbnail,
        count: state.selected.size, items: all ? [] : [...state.selected].sort((a, b) => a - b),
      });
      toast('Lista añadida a la cola');
      celebrate();
    } else if (state.info) {
      const section = $('#clipOn').checked ? getClip() : null;
      await api('/api/download', {
        ...opts, url: state.info.url, type: 'video', title: state.info.title, thumbnail: state.info.thumbnail, section,
        key: state.info.key, // así empieza desde este análisis, sin volver a consultar el sitio
      });
      if (!startAt) toast(section ? 'Fragmento añadido a la cola' : 'Descarga añadida');
      celebrate();
    }
    if (startAt) toast(t('Programada para {t}', { t: fmtAt(startAt) }));
    $('#url').value = '';
    unlockAudio();
    poll();
  } catch (e) {
    shake(btn);
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    updateDownloadLabel();
  }
}

// El botón muestra "✓ Añadido" y la miniatura vuela a la lista.
function celebrate() {
  const btn = $('#download');
  flyToList();
  btn.classList.remove('sent'); void btn.offsetWidth;
  btn.classList.add('sent');
  clearTimeout(celebrate.timer);
  celebrate.timer = setTimeout(() => btn.classList.remove('sent'), 1500);
}

/* ---------- eventos del panel ---------- */

$('#mode').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.classList.contains('on')) return;
  setMode(b.dataset.v);
  animateIn(b.dataset.v === 'video' ? $('#qualityRow') : $('#afmtRow'), 0, 6);
  $$(b.dataset.v === 'video' ? '#quality .chip' : '#afmt .chip').forEach((c, i) => animateIn(c, 30 + i * 25, 6));
});
for (const id of ['#quality', '#afmt', '#vfmt']) {
  $(id).addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c || c.classList.contains('on')) return;
    selectChip(id, c.dataset.v);
    bump(c, 1.08);
    if (id === '#vfmt' && state.info?.type === 'video') { // los tamaños dependen del formato
      const res = chipValue('#quality');
      renderQualities(qualitiesFor(state.info));
      if ($(`#quality .chip[data-v="${res}"]`)) selectChip('#quality', res);
    }
  });
}
$('#subs').addEventListener('change', () => $('#subLang').classList.toggle('hidden', !$('#subs').checked || !state.subLangs?.length));
$('#panelClose').addEventListener('click', closePanel);
$('#download').addEventListener('click', () => download());

// Programar: la descarga espera en la lista hasta la hora elegida
function updateSchedWhen() {
  const d = nextAt($('#schedTime').value);
  $('#schedWhen').textContent = d ? fmtAt(d / 1000) : '';
  $('#schedGo').disabled = !d;
}
$('#scheduleBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const pop = $('#schedulePop');
  pop.classList.toggle('hidden');
  if (!pop.classList.contains('hidden')) { updateSchedWhen(); animateIn(pop, 0, 6); $('#schedTime').focus(); }
});
$('#schedTime').addEventListener('input', updateSchedWhen);
$('#schedGo').addEventListener('click', async () => {
  const d = nextAt($('#schedTime').value);
  if (!d) return;
  $('#schedulePop').classList.add('hidden');
  saveSetting({ schedule_time: $('#schedTime').value });
  await download(Math.floor(d / 1000));
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#schedulePop, #scheduleBtn')) $('#schedulePop').classList.add('hidden');
});
$('#entries').addEventListener('click', async (e) => {
  const rm = e.target.closest('[data-rm]');
  if (rm && state.bulk) {
    await collapse(rm.closest('.entry'), 0);
    state.bulk.splice(+rm.dataset.rm, 1);
    return state.bulk.length ? renderBulkList() : closePanel();
  }
});
$('#entries').addEventListener('change', (e) => {
  const row = e.target.closest('.entry[data-i]');
  if (!row) return;
  const i = +row.dataset.i;
  e.target.checked ? state.selected.add(i) : state.selected.delete(i);
  updateSelection();
});
$('#selAll').addEventListener('click', () => { state.selected = new Set(state.info.entries.map((e) => e.index)); updateSelection(); });
$('#selNone').addEventListener('click', () => { state.selected.clear(); updateSelection(); });

$('#pick').addEventListener('click', async () => {
  const btn = $('#pick');
  btn.disabled = true; btn.textContent = t('Eligiendo…');
  try {
    const { folder } = await api('/api/pick-folder', { folder: $('#folder').textContent });
    if (folder) {
      $('#folder').textContent = folder; state.settings.folder = folder;
      if (!reduceMotion()) {
        $('.panel .folder').animate([{ borderColor: 'var(--accent-2)', boxShadow: '0 0 0 4px rgba(91, 141, 255, .18)' }, {}],
          { duration: 900, easing: 'ease-out' });
      }
    }
  } catch (e) { toast(e.message, true); }
  btn.disabled = false; btn.textContent = t('Cambiar');
});

/* ---------- pegar, arrastrar y portapapeles ---------- */

$('#analyze').addEventListener('click', analyze);
$('#url').addEventListener('keydown', (e) => { if (e.key === 'Enter') analyze(); });
$('#url').addEventListener('paste', (e) => {
  const text = e.clipboardData?.getData('text') || '';
  const urls = extractUrls(text);
  if (urls.length > 1) { e.preventDefault(); showBulk(urls); return; }
  if (urls.length === 1 && urls[0] !== state.lastAnalyzed) {
    e.preventDefault();
    $('#url').value = urls[0];
    analyze();
  }
});
$('#paste').addEventListener('click', async () => {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { /* sin permiso: probamos el servidor */ }
  if (!text) {
    try { text = (await api('/api/clipboard')).urls.join('\n'); } catch { /* nada */ }
  }
  if (!handleText(text)) { shake($('#paste')); toast('No hay ningún enlace en el portapapeles'); }
});

// Ctrl+V en cualquier parte de la ventana
document.addEventListener('paste', (e) => {
  if (e.target.closest('input, textarea, select, dialog')) return;
  if (handleText(e.clipboardData?.getData('text'))) e.preventDefault();
});

// arrastrar un enlace desde el navegador
let dragDepth = 0;
const hasLink = (e) => [...(e.dataTransfer?.types || [])].some((t) => t === 'text/uri-list' || t === 'text/plain');
document.addEventListener('dragenter', (e) => { if (!hasLink(e)) return; dragDepth++; document.body.classList.add('dragging'); });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (!handleText(text)) toast('Eso no parece un enlace', true);
});

async function checkClipboard() {
  if (!state.settings.clipboard || !document.body.classList.contains('ready')) return; // no durante la entrada
  try {
    const { urls } = await api('/api/clipboard');
    const key = urls.join('\n');
    if (!urls.length || key === state.clipKey) return;
    state.clipKey = key;
    if (urls.length === 1 && (urls[0] === state.lastAnalyzed || urls[0] === $('#url').value.trim())) return;
    state.clipUrls = urls;
    $('#clipText').textContent = urls.length > 1 ? t('Copiaste {n} enlaces', { n: urls.length }) : t('Enlace copiado: {u}', { u: urls[0] });
    $('#clipBanner').classList.remove('hidden');
    // lo analizamos ya en segundo plano: al pulsar "Usar" estará listo
    if (urls.length === 1) api('/api/prefetch', { url: urls[0] }).catch(() => {});
  } catch { /* sin portapapeles */ }
}
function hideClipBanner() { $('#clipBanner').classList.add('hidden'); }
$('#clipUse').addEventListener('click', () => handleText(state.clipUrls.join('\n')));
$('#clipClose').addEventListener('click', hideClipBanner);

const reportFocus = (focused) => api('/api/focus', { focused }).catch(() => {});
window.addEventListener('focus', () => { reportFocus(true); checkClipboard(); });
window.addEventListener('blur', () => reportFocus(false));

/* ---------- historial ---------- */

const nodes = new Map();
let pollTimer;

function statusText(j) {
  switch (j.status) {
    case 'queued': return t('En cola');
    case 'starting': return t('Iniciando…');
    case 'downloading': return `${t(j.stage)} · ${Math.floor(j.progress)}%`;
    case 'processing': return t(j.stage) + '…';
    case 'done': return t('Listo') + (j.finished ? ' · ' + fmtWhen(j.finished) : '');
    case 'cancelled': return t('Cancelado');
    case 'paused': return t('En pausa') + (j.progress ? ` · ${Math.floor(j.progress)}%` : '');
    case 'scheduled': return t('Programada para {t}', { t: fmtAt(j.start_at) });
    case 'error': return t(j.error || 'La descarga falló');
  }
  return j.status;
}
function numsText(j) {
  if (j.status === 'downloading') {
    const parts = [];
    if (j.total) parts.push(`${fmtBytes(j.downloaded)} / ${fmtBytes(j.total)}`);
    if (j.speed) parts.push(fmtBytes(j.speed) + '/s');
    if (j.eta != null) parts.push(t('quedan {t}', { t: fmtTime(j.eta) }));
    return parts.join(' · ');
  }
  if (j.status === 'done' && j.total) return fmtBytes(j.total);
  return '';
}
function subText(j) {
  const bits = [];
  if (j.kind === 'playlist') bits.push(t('Lista · {n} videos', { n: j.count }) + (j.item && ACTIVE.includes(j.status) ? ' · ' + t('video {i}', { i: j.item }) + (j.item_title ? ': ' + esc(j.item_title) : '') : ''));
  else if (j.item && ACTIVE.includes(j.status)) bits.push(t('Video {i}', { i: j.item }));
  if (j.section) bits.push(`<span class="cut">✂ ${fmtTime(j.section[0])}–${fmtTime(j.section[1])}</span>`);
  return bits.join(' · ');
}

function jobActions(j, pos) {
  const btn = (a, icon, title, off = false) => `<button class="icon-btn" data-a="${a}" title="${t(title)}"${off ? ' disabled' : ''}>${ICONS[icon]}</button>`;
  const cancel = btn('cancel', 'stop', 'Cancelar');
  if (j.status === 'queued') return btn('up', 'up', 'Subir en la cola', pos.first) + btn('down', 'down', 'Bajar en la cola', pos.last) + btn('pause', 'pause', 'Pausar') + cancel;
  if (j.status === 'paused') return btn('resume', 'resume', 'Reanudar') + cancel;
  if (j.status === 'scheduled') return btn('now', 'now', 'Empezar ahora') + cancel;
  if (j.status === 'starting' || j.status === 'downloading') return btn('pause', 'pause', 'Pausar') + cancel;
  if (ACTIVE.includes(j.status)) return cancel;
  return (j.status !== 'done' ? `<button class="icon-btn" data-a="retry" title="${t('Reintentar')}">${ICONS.retry}</button>` : '')
    + `<button class="icon-btn" data-a="reveal" title="${t('Mostrar en la carpeta')}">${ICONS.folder}</button>`
    + `<button class="icon-btn" data-a="remove" title="${t('Quitar del historial')}">${ICONS.trash}</button>`;
}

async function jobAction(j, a) {
  try {
    if (a === 'cancel') await api('/api/cancel', { id: j.id });
    if (a === 'pause') await api('/api/pause', { id: j.id });
    if (a === 'resume') await api('/api/resume', { id: j.id });
    if (a === 'now') await api('/api/now', { id: j.id });
    if (a === 'up' || a === 'down') await api('/api/move', { id: j.id, dir: a });
    if (a === 'reveal') await api('/api/reveal', { id: j.id });
    if (a === 'remove') {
      const el = nodes.get(j.id);
      await Promise.all([collapse(el), api('/api/remove', { id: j.id })]);
      el?.remove();
      nodes.delete(j.id);
    }
    if (a === 'open') await api('/api/open', { id: j.id });
    if (a === 'retry') {
      $('#url').value = j.url;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      analyze();
    }
  } catch (e) { toast(e.message, true); }
  poll();
}

let firstRender = true;

function renderJobs(all) {
  const q = state.search.trim().toLowerCase();
  const list = q ? all.filter((j) => (j.title || '').toLowerCase().includes(q)) : all;
  const seen = new Set();
  const box = $('#jobs');
  // FLIP: si entra una tarjeta nueva, las demás se desplazan con suavidad en vez de saltar
  const adding = list.some((j) => !nodes.has(j.id));
  const before = adding && !firstRender && !reduceMotion()
    ? new Map([...nodes].map(([id, el]) => [id, el.getBoundingClientRect().top])) : null;
  list.forEach((j, idx) => {
    seen.add(j.id);
    let el = nodes.get(j.id);
    if (!el) {
      el = document.createElement('div');
      el._new = true;
      el.innerHTML = `
        <div class="thumb">${j.thumbnail ? `<img loading="lazy" src="${esc(j.thumbnail)}" alt="">` : ''}
          <span class="kind">${j.mode === 'audio' ? 'Audio' : j.kind === 'playlist' ? 'Lista' : 'Video'}</span>
          <span class="play">${ICONS.play}</span>
          <span class="donemark"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></div>
        <div class="jbody"><div class="jtitle"></div><div class="jsub"></div><div class="bar"><i></i></div>
          <div class="jmeta"><span class="st"></span><span class="nums"></span></div></div>
        <div class="jact"></div>`;
      el.addEventListener('click', (e) => {
        const job = el._job;
        const b = e.target.closest('[data-a]');
        if (b) return jobAction(job, b.dataset.a);
        if (e.target.closest('.thumb') && el.classList.contains('playable')) jobAction(job, 'open');
      });
      nodes.set(j.id, el);
    }
    el._job = j;
    if (box.children[idx] !== el) box.insertBefore(el, box.children[idx] || null);

    const prev = el._status;
    el._status = j.status;
    if (prev && ACTIVE.includes(prev) && j.status === 'done') { el._flash = 'just-done'; el._flashUntil = Date.now() + 1400; }
    if (prev && ACTIVE.includes(prev) && j.status === 'error') shake(el);
    const flash = el._flash && Date.now() < el._flashUntil ? ' ' + el._flash : '';
    const playable = j.status === 'done' && j.exists;
    el.className = `card job ${j.status}${playable ? ' playable' : ''}${flash}`;

    if (el._new) {
      el._new = false;
      if (firstRender) animateIn(el, state.introDelay + Math.min(idx, 10) * 55, 14);
      else if (!reduceMotion()) {
        el.animate([
          { opacity: 0, transform: 'translateY(-14px) scale(.97)', boxShadow: '0 0 0 0 rgba(122, 162, 255, 0)' },
          { opacity: 1, transform: 'none', boxShadow: '0 0 0 3px rgba(122, 162, 255, .45), 0 0 40px rgba(255, 138, 61, .25)', offset: 0.45 },
          { boxShadow: '0 0 0 0 rgba(122, 162, 255, 0)' },
        ], { duration: 1000, easing: EASE_OUT });
      }
    }
    $('.thumb', el).title = playable ? t(j.kind === 'playlist' ? 'Abrir carpeta' : 'Reproducir') : '';
    if (j.thumbnail && !$('.thumb img', el)) $('.thumb', el).insertAdjacentHTML('afterbegin', `<img src="${esc(j.thumbnail)}" alt="">`);
    const titleEl = $('.jtitle', el);
    const jt = t(j.title);
    if (titleEl.textContent !== jt) { titleEl.textContent = jt; titleEl.title = jt; }
    const sub = subText(j);
    if ($('.jsub', el).innerHTML !== sub) $('.jsub', el).innerHTML = sub;
    $('.jsub', el).classList.toggle('hidden', !sub);
    $('.bar i', el).style.width = j.progress + '%';
    const st = statusText(j);
    $('.st', el).textContent = st;
    $('.st', el).title = j.raw_error || st;
    $('.nums', el).textContent = numsText(j);
    const act = $('.jact', el);
    const queue = list.filter((q) => q.status === 'queued');
    const pos = { first: queue[0] === j, last: queue[queue.length - 1] === j };
    const key = `${j.status}:${pos.first}:${pos.last}`;
    if (act.dataset.k !== key) { act.dataset.k = key; act.innerHTML = jobActions(j, pos); }
  });
  for (const [id, el] of nodes) if (!seen.has(id)) { el.remove(); nodes.delete(id); }
  if (before) {
    for (const [id, top] of before) {
      const el = nodes.get(id);
      const dy = el?.isConnected ? top - el.getBoundingClientRect().top : 0;
      if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: EASE_OUT });
    }
  }
  firstRender = false;

  const active = all.filter((j) => ACTIVE.includes(j.status) && j.status !== 'scheduled').length;
  $('#empty').classList.toggle('hidden', all.length > 0);
  $('#noResults').classList.toggle('hidden', !(all.length && !list.length));
  $('#clear').classList.toggle('hidden', all.every((j) => ACTIVE.includes(j.status)));
  $('#searchWrap').classList.toggle('hidden', all.length < 4 && !q);
  const count = active ? t('{n} en curso', { n: active }) : all.length ? String(all.length) : '';
  if ($('#count').textContent !== count) { $('#count').textContent = count; bump($('#count'), 1.25); }
  $('#aura').classList.toggle('busy', active > 0);
  $('header h1').classList.toggle('busy', active > 0); // el nombre brilla mientras descarga
  const busy = all.find((j) => j.status === 'downloading');
  document.title = active ? `${busy ? Math.floor(busy.progress) + '% · ' : ''}Lumen` : 'Lumen';
  return active;
}

function notifyTransitions(list) {
  for (const j of list) {
    const prev = state.prevStatus.get(j.id);
    if (prev && ACTIVE.includes(prev) && (j.status === 'done' || j.status === 'error')) chime(j.status === 'done');
    state.prevStatus.set(j.id, j.status);
  }
}

async function poll() {
  clearTimeout(pollTimer);
  try {
    const list = await api('/api/jobs');
    handleEvents(await api('/api/events'));
    notifyTransitions(list);
    const active = renderJobs(list);
    const updating = state.update && $('#updateGet').disabled; // descargando la actualización
    pollTimer = setTimeout(poll, active || updating ? 600 : 3000);
  } catch {
    pollTimer = setTimeout(poll, 3000);
  }
}

// Avisos del servidor: enlaces abiertos desde el navegador (lumen://) y actualizaciones
function handleEvents(ev) {
  for (const url of ev.urls || []) {
    toast(t('Enlace recibido del navegador'));
    $('#url').value = url;
    analyze();
  }
  const u = ev.updates || {};
  if (u.lumen && state.dismissedUpdate !== u.lumen.version && $('#updateBanner').classList.contains('hidden')) {
    state.update = u.lumen;
    $('#updateText').textContent = t('Lumen {v} está disponible', { v: u.lumen.version });
    // instalado: se actualiza desde aquí; portable: abre la página de la versión
    $('#updateGet').textContent = t(u.lumen.installable ? 'Actualizar' : 'Descargar');
    $('#updateBanner').classList.remove('hidden');
  }
  const inst = u.install;
  if (inst && state.update) {
    if (inst.error) {
      if (state.installError !== inst.error) { state.installError = inst.error; toast(t(inst.error), true); }
      $('#updateText').textContent = t('Lumen {v} está disponible', { v: state.update.version });
      $('#updateGet').disabled = false;
    } else {
      state.installError = null;
      $('#updateGet').disabled = true;
      $('#updateText').textContent = inst.done ? t('Instalando Lumen {v}…', { v: state.update.version })
        : t('Descargando Lumen {v}… {p}', { v: state.update.version, p: inst.progress != null ? Math.floor(inst.progress) + '%' : '' });
    }
  }
  if (u.ytdlp_ready && state.ytdlpNotified !== u.ytdlp_ready) {
    state.ytdlpNotified = u.ytdlp_ready;
    toast(t('yt-dlp {v} descargado: se usará la próxima vez que abras Lumen', { v: u.ytdlp_ready }));
  }
}
$('#updateGet').addEventListener('click', async () => {
  if (!state.update?.installable) return api('/api/open-release', {}).catch(() => {});
  try {
    state.installError = null;
    $('#updateGet').disabled = true;
    await api('/api/install-update', {});
    poll();
  } catch (e) {
    $('#updateGet').disabled = false;
    toast(e.message, true);
  }
});
$('#updateClose').addEventListener('click', () => {
  state.dismissedUpdate = state.update?.version;
  $('#updateBanner').classList.add('hidden');
});

/* ---------- búsqueda ---------- */

function showSearch(info) {
  state.info = info; state.bulk = null;
  openPanel('search');
  setHeader({ title: t('Resultados para «{q}»', { q: info.query }), thumbnail: info.thumbnail,
    sub: [t('Elige un video para ver sus opciones')] });
  ambientFromThumb(info.thumbnail);
  $('#entries').innerHTML = info.entries.map((e) => `
    <button type="button" class="entry result" data-url="${esc(e.url)}">
      ${e.thumbnail ? `<img loading="lazy" src="${esc(e.thumbnail)}" alt="">` : '<span class="ph"></span>'}
      <span class="t" title="${esc(e.title)}">${esc(e.title)}</span>
      <span class="d">${[esc(e.uploader || ''), fmtTime(e.duration)].filter(Boolean).join(' · ')}</span>
    </button>`).join('');
  $('#selCount').textContent = t('{n} resultados', { n: info.count });
  $$('#selAll, #selNone').forEach((b) => b.classList.add('hidden'));
  $('#entriesBox').classList.remove('hidden');
  revealPanel();
  $$('#entries .entry').forEach((el, i) => animateIn(el, 120 + i * 30, 8));
}
$('#entries').addEventListener('click', (e) => {
  const r = e.target.closest('.entry.result');
  if (!r) return;
  $('#url').value = r.dataset.url;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  analyze();
});

/* ---------- descargar desde el navegador ---------- */

const BOOKMARKLET = "javascript:location.href='lumen://open?url='+encodeURIComponent(location.href)";
$('#bmCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(BOOKMARKLET);
    toast(t('Copiado. Ahora crea un marcador y pégalo como dirección.'));
  } catch {
    getSelection().selectAllChildren($('#bmCode'));
    toast(t('Selecciónalo y cópialo con Ctrl+C'));
  }
});

$('#search').addEventListener('input', (e) => { state.search = e.target.value; poll(); });
$('#clear').addEventListener('click', async () => {
  if (!confirm(t('¿Borrar todo el historial? Los archivos descargados no se borran.'))) return;
  const done = [...nodes.values()].filter((el) => !ACTIVE.includes(el._job.status) && el.isConnected);
  await Promise.all([
    api('/api/clear', {}),
    ...done.slice(0, 12).map((el, i) => wait(i * 45).then(() => collapse(el))),
  ]);
  done.forEach((el) => { el.remove(); nodes.delete(el._job.id); });
  poll();
});

/* ---------- sonido ---------- */

let actx;
function unlockAudio() {
  try { actx ??= new AudioContext(); actx.resume(); } catch { /* sin audio */ }
}
function chime(ok) {
  if (!state.settings.sound || !actx) return;
  const notes = ok ? [784, 1175] : [392, 294];
  notes.forEach((freq, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    const t = actx.currentTime + i * 0.12;
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(actx.destination);
    o.start(t); o.stop(t + 0.55);
  });
}
document.addEventListener('pointerdown', unlockAudio, { once: true });

/* ---------- ajustes ---------- */

const TEMPLATE_EXAMPLES = () => ({
  title_id: `${t('Mi video')} [dQw4w9WgXcQ].mp4`, title: `${t('Mi video')}.mp4`,
  channel_title: `${t('Canal')} - ${t('Mi video')}.mp4`, date_title: `2026-11-03 ${t('Mi video')}.mp4`,
});
function templateHint() {
  const v = $('#sTemplate').value;
  $('#sCustom').classList.toggle('hidden', v !== 'custom');
  $('#sTemplateHint').innerHTML = v === 'custom'
    ? t('Usa campos de yt-dlp como {a}, {b}, {c}. Con {d} creas subcarpetas.', { a: '<code>%(title)s</code>', b: '<code>%(uploader)s</code>', c: '<code>%(upload_date)s</code>', d: '<code>/</code>' })
    : t('Ejemplo: {x}', { x: esc(TEMPLATE_EXAMPLES()[v]) });
}

function openSettings() {
  const d = $('#settings');
  d.showModal();
  initSegs(d);
  if (!reduceMotion()) $$('.field', d).forEach((f, i) => animateIn(f, 40 + i * 30, 8));
}
async function closeSettings() {
  const d = $('#settings');
  if (!d.open || d.classList.contains('closing')) return;
  if (!reduceMotion()) {
    d.classList.add('closing');
    await wait(190);
    d.classList.remove('closing');
  }
  d.close();
}

// Cambia el tema con un círculo desde (x, y) y gira el icono nuevo.
function switchTheme(theme, x, y) {
  if ((state.settings.theme || 'system') === theme) return;
  themeTransition(() => {
    applyTheme(theme);
    if (!reduceMotion()) {
      $('#themeBtn svg').animate([{ transform: 'rotate(-120deg) scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 500, easing: EASE_SPRING });
    }
  }, x, y);
  saveSetting({ theme });
}
const centerOf = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

$('#settingsBtn').addEventListener('click', openSettings);
$('#settingsClose').addEventListener('click', closeSettings);
$('#settings').addEventListener('click', (e) => { if (e.target === $('#settings')) closeSettings(); });
$('#settings').addEventListener('cancel', (e) => { e.preventDefault(); closeSettings(); });
$('#themeBtn').addEventListener('click', (e) => {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(state.settings.theme || 'system') + 1) % 3];
  switchTheme(next, ...centerOf(e.currentTarget));
});
$('#sTheme').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  switchTheme(b.dataset.v, ...centerOf(b));
});
$('#sParallel').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  setSeg('#sParallel', b.dataset.v); saveSetting({ parallel: +b.dataset.v });
});
$('#sLang').addEventListener('change', async (e) => {
  await saveSetting({ lang: e.target.value });
  location.reload(); // los textos fijos se traducen al cargar
});
$('#sRate').addEventListener('change', (e) => saveSetting({ ratelimit: Math.max(0, +e.target.value || 0) }));
$('#sMp3').addEventListener('change', (e) => {
  saveSetting({ mp3_quality: e.target.value });
  if (state.info?.type === 'video') renderAudioFormats(state.info); // el tamaño estimado cambia
});
$('#sTray').addEventListener('change', (e) => saveSetting({ tray: e.target.checked }));
$('#sAutoUpdate').addEventListener('change', (e) => saveSetting({ auto_update: e.target.checked }));
$('#sTemplate').addEventListener('change', (e) => { templateHint(); saveSetting({ template: e.target.value }); });
$('#sCustom').addEventListener('change', (e) => saveSetting({ custom_template: e.target.value }));
$('#sCookies').addEventListener('change', (e) => saveSetting({ cookies: e.target.value }));
$('#sNotify').addEventListener('change', (e) => saveSetting({ notify: e.target.checked }));
$('#sSound').addEventListener('change', (e) => { saveSetting({ sound: e.target.checked }); if (e.target.checked) { unlockAudio(); chime(true); } });
$('#sClipboard').addEventListener('change', (e) => { saveSetting({ clipboard: e.target.checked }); if (!e.target.checked) hideClipBanner(); });
$('#meta').addEventListener('change', (e) => saveSetting({ meta: e.target.checked }));
$('#subs').addEventListener('change', (e) => saveSetting({ subs: e.target.checked }));

$('#update').addEventListener('click', async () => {
  const b = $('#update');
  b.disabled = true; b.textContent = t('Actualizando…');
  try {
    const r = await api('/api/update', {});
    if (!r.ok) toast(r.error || 'No se pudo actualizar yt-dlp', true);
    else if (r.restart) toast(t('Actualizado a {v}. Cierra y vuelve a abrir el programa para usarlo.', { v: r.version }));
    else toast('yt-dlp ya está en la última versión');
    if (r.lumen) handleEvents({ updates: { lumen: r.lumen } });
  } catch (e) { toast(e.message, true); }
  b.disabled = false; b.textContent = t('Buscar actualización');
});

/* ---------- inicio ---------- */

// El título entra palabra por palabra.
function splitHeroWords() {
  const h2 = $('.hero h2');
  h2.innerHTML = h2.textContent.trim().split(/\s+/)
    .map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' ');
}

// En la ventana de escritorio, pide mostrarla (nace oculta para no parpadear).
let booted = false;
function signalReady() {
  if (!booted) return;
  const theme = document.documentElement.dataset.theme;
  window.pywebview?.api?.ready?.(theme ? theme === 'dark' : darkQuery.matches)?.catch?.(() => {});
}
window.addEventListener('pywebviewready', signalReady);

// Arranque: todo se prepara sin verse (ajustes, historial y fuentes) y
// después entra en una sola secuencia, sin saltos ni textos que cambian.
async function boot() {
  const [, list] = await Promise.all([
    loadConfig().catch((e) => toast(e.message, true)),
    api('/api/jobs').catch(() => []),
    document.fonts?.ready,
  ]);
  splitHeroWords(); // después de traducir: parte el título ya en su idioma
  notifyTransitions(list);
  // La ventana de escritorio nace oculta y, mientras lo está, el navegador
  // congela animaciones y temporizadores: primero pedimos mostrarla (todavía
  // solo se ve el fondo) y la entrada empieza cuando ya es visible.
  booted = true;
  signalReady();
  if (document.visibilityState === 'hidden') await onceEvent(document, 'visibilitychange', 6000).catch(() => {});
  // requestAnimationFrame solo avanza cuando de verdad se pintan fotogramas:
  // así la entrada no empieza mientras la ventana recién mostrada aún no pinta.
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  await frame(); await frame(); await frame();
  await wait(80);
  state.introDelay = reduceMotion() ? 0 : 1150;
  const active = renderJobs(list);
  state.introDelay = 0;
  document.body.classList.replace('booting', 'intro');
  setTimeout(() => {
    document.body.classList.replace('intro', 'ready');
    reportFocus(document.hasFocus());
    checkClipboard(); // el aviso del portapapeles llega cuando ya terminó la entrada
  }, reduceMotion() ? 0 : 2000);
  pollTimer = setTimeout(poll, active ? 600 : 3000);
}

boot();
