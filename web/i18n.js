'use strict';

// Idiomas de Lumen. La app está escrita en español y el texto en español es
// la clave: t('Analizar') devuelve 'Analyze' en inglés. Si falta una
// traducción se ve el español, en lugar de romperse. Los mensajes que manda
// el servidor (etapas de descarga, errores) se traducen con este mismo diccionario.

let LANG = 'es';
const LOCALE = () => (LANG === 'en' ? 'en' : 'es');

const EN = {
  // cabecera, bienvenida y entrada de enlace
  'Ajustes': 'Settings',
  'Cambiar tema': 'Change theme',
  'Tema: {v}': 'Theme: {v}',
  'claro': 'light',
  'oscuro': 'dark',
  'según el sistema': 'system',
  'ffmpeg listo': 'ffmpeg ready',
  'Falta ffmpeg': 'ffmpeg missing',
  'ffmpeg une video y audio y convierte a MP3': 'ffmpeg merges video and audio and converts to MP3',
  'Sin ffmpeg no se pueden unir video y audio ni convertir a MP3': 'Without ffmpeg, video and audio can’t be merged or converted to MP3',
  'Descarga lo que quieras.': 'Download anything.',
  'Videos y música de más de 1.000 sitios, directo a tu PC. Funciona con yt-dlp.': 'Video and music from over 1,000 sites, straight to your PC. Powered by yt-dlp.',
  'Pega uno o varios enlaces…': 'Paste one or more links…',
  'Pegar': 'Paste',
  'Analizar': 'Analyze',
  'Analizando': 'Analyzing',
  'Analizando enlace': 'Analyzing link',
  'Pega un enlace, arrástralo a la ventana o pulsa': 'Paste a link, drag it into the window or press',
  'en cualquier parte. Puedes pegar varios a la vez.': 'anywhere. You can paste several at once.',
  'Usar': 'Use',
  'Ignorar': 'Dismiss',
  'Copiaste {n} enlaces': 'You copied {n} links',
  'Enlace copiado: {u}': 'Copied link: {u}',
  'No hay ningún enlace en el portapapeles': 'There’s no link in the clipboard',
  'Eso no parece un enlace': 'That doesn’t look like a link',
  'Suelta el enlace aquí': 'Drop the link here',

  // panel de análisis
  'Cerrar': 'Close',
  'Sin título': 'Untitled',
  'En directo': 'Live',
  '{n} vistas': '{n} views',
  '{n} videos': '{n} videos',
  'Lista · {n}': 'Playlist · {n}',
  '{n} enlaces': '{n} links',
  'Se descargarán con las mismas opciones': 'They’ll download with the same options',
  'Quitar': 'Remove',
  '{a} de {b} seleccionados': '{a} of {b} selected',
  'Todos': 'All',
  'Ninguno': 'None',
  'Video': 'Video',
  'Solo audio': 'Audio only',
  'Calidad': 'Quality',
  'Formato': 'Format',
  'Máxima': 'Best',
  'Portada y metadatos': 'Cover and metadata',
  'Subtítulos (es/en)': 'Subtitles (es/en)',
  'Solo un fragmento': 'Only a clip',
  'Cambiar': 'Change',
  'Eligiendo…': 'Choosing…',
  'Descargar': 'Download',
  'Descargar {n} enlaces': 'Download {n} links',
  'Descargar {n} video': 'Download {n} video',
  'Descargar {n} videos': 'Download {n} videos',
  'Descargar fragmento': 'Download clip',
  'Añadido a la cola': 'Added to queue',
  '{n} descargas añadidas': '{n} downloads added',
  'Lista añadida a la cola': 'Playlist added to queue',
  'Fragmento añadido a la cola': 'Clip added to queue',
  'Descarga añadida': 'Download added',

  // fragmento y vista previa
  'Inicio': 'Start',
  'Fin': 'End',
  'Duración {d}': 'Length {d}',
  'Ver el fragmento': 'Watch the clip',
  'Desde el inicio': 'From the start',
  'Actualizar vista previa': 'Update preview',
  'Cambiaste el fragmento': 'You changed the clip',
  'Pasa el cursor por la barra para ver cada momento': 'Hover over the bar to see each moment',
  'Reproduciendo · mueve los tiradores y se actualiza al momento': 'Playing · move the handles and it updates instantly',
  'Esto es lo que vas a descargar': 'This is what you’ll download',
  'Este sitio no permite verlo en directo: se muestran los primeros 30 s': 'This site doesn’t allow live preview: showing the first 30 s',
  'Preparando vista previa…': 'Preparing preview…',
  'Cerrar vista previa': 'Close preview',
  'No se pudo cargar el audio de la vista previa': 'Couldn’t load the preview audio',
  'Reproducir': 'Play',
  'Pausa': 'Pause',
  'Silenciar': 'Mute',
  'Activar sonido': 'Unmute',

  // historial
  'Descargas': 'Downloads',
  'Buscar en el historial': 'Search history',
  'Borrar historial': 'Clear history',
  'Todavía no hay descargas': 'No downloads yet',
  'Nada coincide con tu búsqueda': 'Nothing matches your search',
  '{n} en curso': '{n} in progress',
  '¿Borrar todo el historial? Los archivos descargados no se borran.': 'Clear the whole history? Downloaded files are not deleted.',
  'Cancelar': 'Cancel',
  'Reintentar': 'Retry',
  'Mostrar en la carpeta': 'Show in folder',
  'Quitar del historial': 'Remove from history',
  'Abrir carpeta': 'Open folder',
  'Cancelado': 'Cancelled',
  'Iniciando…': 'Starting…',
  'quedan {t}': '{t} left',
  'Lista · {n} videos': 'Playlist · {n} videos',
  'video {i}': 'video {i}',
  'Video {i}': 'Video {i}',
  'ahora': 'just now',
  'hace {n} min': '{n} min ago',
  'hoy {t}': 'today {t}',
  'ayer {t}': 'yesterday {t}',

  // etapas que manda el servidor
  'En cola': 'Queued',
  'Iniciando': 'Starting',
  'Descargando': 'Downloading',
  'Descargando audio': 'Downloading audio',
  'Procesando': 'Processing',
  'Listo': 'Done',
  'Uniendo video y audio': 'Merging video and audio',
  'Convirtiendo audio': 'Converting audio',
  'Añadiendo metadatos': 'Adding metadata',
  'Incrustando portada': 'Embedding cover',
  'Preparando portada': 'Preparing cover',
  'Incrustando subtítulos': 'Embedding subtitles',
  'Reempaquetando': 'Remuxing',
  'Reparando video': 'Repairing video',
  'Reparando audio': 'Repairing audio',
  'Cortando fragmento': 'Cutting clip',
  'Finalizando': 'Finishing',
  'Lista de reproducción': 'Playlist',

  // errores que manda el servidor
  'La descarga falló': 'The download failed',
  'Descarga terminada': 'Download finished',
  'Error desconocido': 'Unknown error',
  'Este video tiene restricción de edad. Activa «Usar sesión del navegador» en Ajustes.': 'This video is age-restricted. Turn on “Use browser session” in Settings.',
  'YouTube pide comprobar que no eres un bot. Activa «Usar sesión del navegador» en Ajustes o actualiza yt-dlp.': 'YouTube wants to confirm you’re not a bot. Turn on “Use browser session” in Settings or update yt-dlp.',
  'Este sitio pide iniciar sesión. Activa «Usar sesión del navegador» en Ajustes.': 'This site requires signing in. Turn on “Use browser session” in Settings.',
  'No se pudieron leer las cookies del navegador. Ciérralo por completo o prueba con Firefox.': 'Couldn’t read the browser’s cookies. Close it completely or try Firefox.',
  'Este video es privado.': 'This video is private.',
  'Este video es solo para miembros del canal.': 'This video is for channel members only.',
  'Este video no está disponible en tu país.': 'This video isn’t available in your country.',
  'El directo o estreno todavía no ha empezado.': 'The live stream or premiere hasn’t started yet.',
  'Este sitio o enlace no es compatible.': 'This site or link isn’t supported.',
  'Eso no parece un enlace válido.': 'That doesn’t look like a valid link.',
  'La calidad elegida no está disponible. Prueba con «Máxima».': 'The chosen quality isn’t available. Try “Best”.',
  'La ruta es demasiado larga o tiene caracteres no válidos. Prueba con una carpeta más corta.': 'The path is too long or has invalid characters. Try a shorter folder.',
  'Falta ffmpeg o falló al procesar el archivo.': 'ffmpeg is missing or failed to process the file.',
  'El sitio te bloqueó por demasiadas peticiones. Espera unos minutos.': 'The site blocked you for too many requests. Wait a few minutes.',
  'El sitio denegó la descarga. Actualiza yt-dlp e inténtalo de nuevo.': 'The site refused the download. Update yt-dlp and try again.',
  'No está disponible: puede que no exista, sea privado o lo hayan eliminado.': 'Not available: it may not exist, be private or have been removed.',
  'No queda espacio en el disco.': 'The disk is full.',
  'No hay permiso para escribir en esa carpeta.': 'No permission to write to that folder.',
  'No hay conexión o el sitio no responde.': 'No connection, or the site isn’t responding.',
  'El fragmento elegido no es válido.': 'The chosen clip isn’t valid.',
  'El archivo ya no existe; puede que lo hayas movido o borrado.': 'The file no longer exists; it may have been moved or deleted.',
  'Vuelve a analizar el enlace para ver la vista previa.': 'Analyze the link again to see the preview.',
  'No se pudo preparar la vista previa.': 'Couldn’t prepare the preview.',
  'En la versión .exe, descarga la última versión del programa para actualizar yt-dlp.': 'In the .exe version, download the latest release of Lumen to update yt-dlp.',

  // ajustes
  'Tema': 'Theme',
  'Sistema': 'System',
  'Claro': 'Light',
  'Oscuro': 'Dark',
  'Idioma': 'Language',
  'Automático (Windows)': 'Automatic (Windows)',
  'Descargas a la vez': 'Simultaneous downloads',
  'Límite de velocidad': 'Speed limit',
  'MB/s · 0 = sin límite': 'MB/s · 0 = no limit',
  'Nombre de los archivos': 'File names',
  'Título [id]': 'Title [id]',
  'Título': 'Title',
  'Canal - Título': 'Channel - Title',
  'Fecha Título': 'Date Title',
  'Personalizado…': 'Custom…',
  'Ejemplo: {x}': 'Example: {x}',
  'Mi video': 'My video',
  'Canal': 'Channel',
  'Usa campos de yt-dlp como {a}, {b}, {c}. Con {d} creas subcarpetas.': 'Use yt-dlp fields such as {a}, {b}, {c}. Use {d} to create subfolders.',
  'Usar sesión del navegador': 'Use browser session',
  'No usar': 'Don’t use',
  'Para videos privados, con restricción de edad o solo para miembros. Con Chrome, Edge o Brave, el navegador tiene que estar cerrado; Firefox funciona abierto.': 'For private, age-restricted or members-only videos. With Chrome, Edge or Brave the browser must be closed; Firefox works while open.',
  'Notificar cuando termine una descarga': 'Notify when a download finishes',
  'Sonido al terminar': 'Sound when finished',
  'Detectar enlaces copiados': 'Detect copied links',
  'Modo ambiente: el fondo toma los colores del video': 'Ambient mode: the background takes on the video’s colors',
  'Buscar actualización': 'Check for update',
  'Actualizando…': 'Updating…',
  'No se pudo actualizar yt-dlp': 'Couldn’t update yt-dlp',
  'Actualizado a {v}. Cierra y vuelve a abrir el programa para usarlo.': 'Updated to {v}. Close and reopen Lumen to use it.',
  'yt-dlp ya está en la última versión': 'yt-dlp is already up to date',
  'El idioma cambiará al volver a abrir la ventana': 'The language will change when the window reloads',
};

function setLang(lang) {
  LANG = lang === 'en' ? 'en' : 'es';
  document.documentElement.lang = LANG;
}

function t(es, vars) {
  let s = (LANG === 'en' && EN[es]) || es;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

// Traduce los textos fijos del HTML (nodos de texto y atributos visibles).
function translateDom(root = document.body) {
  if (LANG === 'es') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = node.nodeValue;
    const key = raw.trim();
    if (key && EN[key]) node.nodeValue = raw.replace(key, EN[key]);
  }
  for (const attr of ['title', 'placeholder', 'aria-label']) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => {
      const v = el.getAttribute(attr);
      if (EN[v]) el.setAttribute(attr, EN[v]);
    });
  }
  document.title = t(document.title);
}
