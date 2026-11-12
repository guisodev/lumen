# Firma del programa con SignPath Foundation

SignPath Foundation firma gratis programas de código abierto con un certificado
de firma de código. Con Lumen firmado, Windows deja de mostrar «Windows protegió
su PC» poco a poco, a medida que el programa gana descargas (la reputación de
SmartScreen va con el certificado).

## Cómo funciona

1. **Solicitud** (la hace el dueño del proyecto): formulario en
   https://signpath.org/apply con los datos de abajo. Revisan el proyecto a mano;
   suele tardar de días a algunas semanas.
2. Si la aprueban, crean un proyecto en signpath.io y dan una **organización**,
   un **token de API** y los nombres de la **política de firma**.
3. Esos datos se guardan como *secrets* del repositorio en GitHub
   (Settings → Secrets and variables → Actions): `SIGNPATH_API_TOKEN` y
   `SIGNPATH_ORGANIZATION_ID`.
4. El flujo de GitHub Actions (`.github/workflows/build.yml`) compila Lumen, sube
   el `Lumen.exe` y el instalador sin firmar a SignPath y recibe los firmados.
   SignPath solo firma lo que compila GitHub Actions desde el código público, nunca
   archivos subidos a mano: así garantiza que lo firmado sale de ese código.

## Lo que piden (revisar en su página antes de enviar)

- Licencia de código abierto aprobada por la OSI: Lumen es **MIT** (el ejecutable
  completo, por FFmpeg, se distribuye bajo **GPLv3**).
- Proyecto activo, con versiones publicadas: Lumen 1.0 → 1.5 en GitHub.
- Compilación en un servicio de CI (GitHub Actions): `.github/workflows/build.yml`.
- Una **política de firma de código** publicada en el repositorio, con quién puede
  aprobar cada firma y una declaración de privacidad (abajo hay un borrador para
  el README).
- No firman software malicioso ni «potencialmente no deseado». Un descargador de
  videos es legal, pero conviene explicar que Lumen solo usa yt-dlp, no tiene
  publicidad ni recopila datos.

## Datos para el formulario (borrador)

- **Nombre del proyecto:** Lumen
- **Repositorio:** https://github.com/guisodev/lumen
- **Licencia:** MIT (el ejecutable distribuido incluye FFmpeg bajo GPLv3)
- **Descripción (en inglés, como la piden):**
  > Lumen is an open-source Windows desktop app built on yt-dlp. It lets people
  > download video and audio they have the right to access, with a graphical
  > interface instead of the command line: quality selection with size
  > estimates, clips, playlists, a download queue and a browser extension that
  > talks to the local app. It has no ads, no telemetry and no bundled offers;
  > everything runs locally. Builds are produced by GitHub Actions from the
  > public repository.
- **Qué se firma:** `Lumen.exe` (y las bibliotecas de PyInstaller), el instalador
  `Lumen-Setup.exe` y su desinstalador.
- **Mantenedor:** GuisoDev (único autor y aprobador de las firmas).

## Borrador de política de firma para el README

> ### Code signing policy
>
> Free code signing provided by [SignPath.io](https://about.signpath.io/),
> certificate by [SignPath Foundation](https://signpath.org/).
>
> - Committers and reviewers: [GuisoDev](https://github.com/guisodev)
> - Approvers: [GuisoDev](https://github.com/guisodev)
>
> Every signed release is built by GitHub Actions from this repository.
>
> **Privacy:** Lumen doesn’t send any information to other networked systems
> unless the user asks for it: it only contacts the sites you download from, and
> GitHub to check for updates of Lumen and yt-dlp.
