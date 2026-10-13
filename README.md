# DS1 Effect Studio

A local FFX explorer, draft editor and 3D preview program for **Dark Souls: Prepare to Die Edition**. It reads your installed game's BND3 effect archives directly, resolves TPF textures and FLVER meshes, and reconstructs supported visual layers in a browser viewport. Editing and export leave the game installation unchanged.

## Start

1. Keep this entire folder together, or extract the entire ZIP.
2. Double-click **Start Studio.cmd**. The Windows desktop app opens the editor in its own window. Use Start Browser Studio.cmd if you prefer a browser.
3. Choose an archive and effect. CommonEffects opens with bonfire effect **90000**.

Default game folder: `E:\Games\Dark Souls Prepare to Die Edition\DATA`

No separate Python, Node.js, .NET installation, unpacker, internet connection, or running game is needed for the packaged application. The desktop app requires Microsoft Evergreen WebView2 (already installed on this computer). The browser version requires WebGL and S3TC compressed-texture support. Current desktop Chrome and Edge are appropriate.

If the game moves, launch with:

```powershell
.\LaunchStudio.ps1 -GameData 'D:\My Games\Dark Souls\DATA'
```

The application listens at `http://127.0.0.1:5187`. Double-click **Stop Studio.cmd** to stop it. An already running instance is reused by the launcher; stop it before changing the game path.

See **WINDOWS_APP.md** for multiple selection, rotation in degrees, size controls and direct model assignment.

## Editing and saving

Start with the TAE-style **event timeline**: drag a layer bar to move it and its right edge to change particle duration. Selecting a layer shows simple timing fields in **Edit**. See **EDITOR_GUIDE.md** for imports, native looping, shared timing groups and export details.

For more control, expand Detailed parameters & curves in **Edit**, then choose an action-data block. The list includes render, emitter and movement data, with original addresses to distinguish repeated blocks.

- Change numeric fields, texture/model IDs, color tint, constant/ranged curve values, or existing scalar keyframes. Commit a numeric value by leaving the field. The preview rebuilds at its current time.
- Curve sections show a graph and editable time/value rows. Add or remove keyframes; times must strictly increase. Curve types remain unchanged; sound insertion adds native action-75 calls.
- Undo/Redo tracks edits. Drafts remain available while switching effects and browsing resources in the same page session. Save a draft before refreshing or closing the page. Reset restores the source graph. Draft save/load uses JSON; open the matching original effect before loading a draft.
- **Export FFX** downloads a separate edited `.ffx`. The backend checks the original checksum, applies supported numeric/timing edits, scalar curves and sound insertions, writes the file, rereads it, and checks graph equivalence before download.
- **Assets** imports/replaces native FLVER models and TPF/DDS textures. **Export edited archive** repacks the current effect and session imports into a separate validated archive. No game file is overwritten.
- Existing preview limitations still apply: changing a decoded field does not guarantee its native runtime behavior is implemented by the preview.

Editor checks covered duration/color changes, an added curve keyframe, successful FFX reread with the intended values, rejection of invalid checksums/protected paths/nonintegral integer values/unsorted curves, and an unchanged original effect. UI checks covered numeric editing, Undo/Redo, keyframe addition and validated download, with no observed browser errors.

For sharing and online hosting, see **GITHUB_HOSTING.md**. The current build uses a local backend and is not directly compatible with GitHub Pages.

## Preview controls

- Drag: orbit. Right drag: pan. Wheel: zoom. **Frame view** fits the current visible geometry.
- **Play/Pause**, timeline, playback speed, loop, restart, and preview duration control time. Space also toggles playback.
- **Layers** enables individual render layers and reveals their decoded curves, emitter data, and scheduling parameters.
- **Assets** previews original models with material textures, or full texture atlases, independently of playback. **Return to effect** resumes the effect view.
- **Data** displays the original-offset object graph, including unknown fields and state transitions. Export saves the decoded JSON to your browser's download folder.
- Exposure, background, random seed, wireframe, and grid affect only the preview. **Save image** saves the viewport as PNG.
- **Faces: game** honors the FLVER face-set culling flag. Front faces, Back faces, and Both sides override it for mesh inspection. Billboards keep their two-sided rendering.

## Mesh rendering correction

The updated build reverses exported triangle winding for WebGL and carries the original face-set culling flag into the viewer. Solid mesh materials now write depth and render as opaque when fully visible. Alpha materials, fading mesh instances and additive effects retain transparent blending. Model blend 0 follows the base surface material in the preview. This fixes the grid/background showing through ordinary solid models; exact game shader matching remains outside the current preview.

Regression checks passed on screenshot resources s00904 and s13220: all 48 rock triangles agree with the supplied normals after conversion; 1,473 creature triangles agree and 15 disagree (local normal/face differences remain in the source mesh). Checks also covered front/back/both/game modes, fade transitions, additive blending, alpha materials, and unchanged billboard behavior. Browser automation was unavailable during this update, so these are geometry/material-policy checks rather than a new visual comparison.

## What this build implements

Direct BND3/DCX reading; FXR1/FFX 32-bit decoding; nested constructors; initial-state action traversal; indexed constructor references; trim-list handling; FLVER2 geometry, triangle strips, normals and UVs; material diffuse textures; TPF/DDS DXT1 and DXT5; billboard and mesh layers; atlas animation; scale/color/rotation curves; several blend modes; cone/sphere/box/circle/square emitter approximations; seeded random values; and basic gravity.

Render actions: **27, 40, 59, 61, 70, 71, 108**. Action 40 uses a planar trail preview. Actions 61 and 108 use the original FLVER meshes. Action 70 samples all three textures with reconstructed modulation.

## Accuracy and limitations

**This is a reconstructed preview, not the game's complete effect runtime.** Binary decoding and visual equivalence are different checks.

- Playback starts from the constructor's initial state. It does not evaluate the game's full state-transition conditions or TAE events.
- Nested spawning, randomized ranges, movement/following, particle kill modes, and attachment to moving characters are approximations.
- Unknown actions remain decoded in Data and are reported in the status bar. Child effects inside unknown actions can be previewed using inherited timing.
- Refraction/distortion (43), radial blur (107), lighting (66), and some other procedural actions are not rendered.
- Exact multi-texture shader arithmetic, MTD lighting, depth ordering, game bloom, soft particles, dynamic trail history, and skinned mesh animation are not reproduced.
- **Sounds** indexes FEV sound events and previews their FSB samples. Native sound-ID calls can be edited or inserted. Preview uses the first mapped sample at group start; full FMOD mixing, variation and event parameters are not implemented. See **AUDIO.md**.
- Up to 160 visible instances per layer and 32 instances per spawn batch are shown to bound rendering cost. The preview loops over a user-selected duration, not a native termination condition.
- Empty files, template effects requiring caller parameters, unsupported initial-state behaviors, and effects whose visible work happens in later states may show no layers. Their resource and data inspection remains available.
- The reader was validated against this PTDE installation. DSR and later-game FXR formats are outside this application's tested scope.

The program does not edit the game files or attach to the game process.

## Verification on this installation

See **VALIDATION.json** and **VIEWER_VALIDATION.json**. Counts are archive entries, including resources duplicated between archives.

| Check | Result |
|---|---:|
| Effect archives loaded | 29 |
| FFX entries decoded | 4,024 |
| Decode → write → decode graph comparisons | 4,024 passed |
| Byte-identical rewrites | 138; other rewrites use a different layout |
| Texture entries read | 580: 365 DXT1, 215 DXT5 |
| Model entries read | 324 |
| Effect graphs traversed by preview compiler | 4,024, no exceptions |
| Entries with supported preview layers | 2,343 |
| Compiled render layer occurrences | 9,056 |
| Model render layer occurrences | 2,028 |
| FSB banks / samples | 279 / 7,580 |
| FEV events indexed | 21,293; no parse errors |

Additional checks covered curve interpolation, repeating curves, empty-value defaults, deterministic scheduling, DDS headers, and geometry index bounds in a model from each of the 28 archives containing models. Bonfire, fireball, model effect 13471, and resource previews were inspected in the browser. No comparison against captured in-game frames has been performed.

## Source and rebuild

The complete source is included. **Program.cs** handles archive access, decoding and the local server. **wwwroot/engine.js** handles effect traversal and scheduling. **wwwroot/studio.js** handles 3D rendering and UI.

Install the .NET 8 SDK to rebuild, then run **Build.ps1**. Source-only users should run **SetupAudio.ps1** first to obtain the pinned official audio decoder. The first rebuild restores packages from NuGet. The shipped application is self-contained.

Command-line inspection:

```powershell
.\app\DS1EffectStudio.exe --dump --id 90000 > bonfire.json
.\app\DS1EffectStudio.exe --audit > validation.json
.\app\DS1EffectStudio.exe --game 'E:\Games\Dark Souls Prepare to Die Edition\DATA' --port 5188
```

`--dump` accepts `--archive` to choose another archive. The application writes no extracted game assets to its source folder. JSON exports and screenshots are local user exports.

## Credits and licensing

- [SoulsFormatsNEXT](https://github.com/soulsmods/SoulsFormatsNEXT), pinned to commit **ee1dd61958f60bdc51ce3da548e9a90a8ab39905**. The vendored project's target was changed from .NET 9 to .NET 8; format source was unchanged. Authors and original license are retained in `vendor/SoulsFormatsNEXT`. FXR1 research includes work by Meowmaritus and Thegreatgramcracker.
- [Three.js](https://github.com/mrdoob/three.js), **0.170.0**, MIT. Vendored modules and its license are in `wwwroot/vendor`.
- [JeNoVaViRuS's DS1 FFX research](https://www.soulsmodding.com/doku.php?id=tutorial:ffx-files-for-sfx-explained) and linked public action/effect sheets informed semantic mappings.
- [DarkSoulsFfxTool](https://github.com/loosepolygon/DarkSoulsFfxTool) was reviewed as an independent format reference; its source is not included in this application.

New application code is provided under **GPL-3.0-or-later**, consistent with the bundled SoulsFormatsNEXT license. Third-party licenses remain applicable to their respective components. This package includes no game binaries, effect archives, extracted meshes, or textures. Preview images show resources from the user's local installation.


- [vgmstream](https://github.com/vgmstream/vgmstream), r2117, provides FSB audio decoding; its license and notices are included.
- Microsoft WebView2 SDK 1.0.4258.31 hosts the Windows interface; its SDK license is included under desktop.

Built with assistance from OpenAI Codex (GPT-6).

Edits retain camera position, zoom, playback time and layer visibility. The existing scene remains visible until replacement resources are ready. Frame view remains available for manual framing.
