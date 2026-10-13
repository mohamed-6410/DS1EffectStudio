# Free GitHub hosting options

GitHub Pages is free for public repositories on GitHub Free, and serves static HTML, CSS and JavaScript. It cannot execute this application's ASP.NET/C# backend.

## Available now: publish the desktop tool

1. Create a public repository for the application source.
2. Upload the contents of the separate **DS1EffectStudio-GitHub-source.zip** package, preserving the licenses and vendored source.
3. Create a GitHub Release and attach **DS1EffectStudio.zip** as the downloadable Windows application.
4. Optionally enable Pages for a static project homepage explaining the tool and linking to the Releases page.

This shares the program, but users still run it locally against their own game installation. Uploading `wwwroot` alone will not produce a working online editor: it currently calls `/api/catalog`, `/api/effect`, `/api/model`, `/api/texture`, and `/api/export-ffx` on the local backend.

## Recommended full online version

Make the editor entirely browser-local:

- File/folder picker for the user's `sfx` archives.
- BND3/DCX, FFX, FLVER and TPF parsing in JavaScript or a browser-compatible WebAssembly library.
- Texture/model previews using the existing Three.js renderer.
- FFX edits validated and written inside the browser, then downloaded as files.
- Drafts saved locally with optional project export.

Host only application code, libraries, documentation and license notices on GitHub Pages. Each visitor supplies their own game files through a local file picker; those files need not leave their computer. Use paths relative to the repository URL so a project site works at `username.github.io/repository/`.

This conversion has **not** been implemented or deployed in the current build. The existing editor still uses the packaged local C# application. Porting the backend—or adapting its pure format readers to browser WebAssembly—is the remaining work for a fully online editor.

No repository or website was created by this task. The source package excludes game assets, preview screenshots, the Windows runtime, and build outputs. Keep the GPL and third-party license files with the source.

Sources checked 2026-10-13:

- [What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
