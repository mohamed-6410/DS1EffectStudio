# Layer editor

Timeline names now include group and layer numbers, such as G1 / L1. Actions in the same native effect-call container share a group number, including emitters, movement and sound calls. The Layers list, sound panel and detailed action selector show the same numbers. These are per-effect editor labels, not game/TAE IDs.

Select a layer by its name in the event timeline. The Edit panel shows start time and particle duration. Drag a bar to change its start; drag the right edge to change duration. Keyboard arrows move a focused bar by 1/30 second; Shift+arrow changes its duration by 1/30 second. The Scale field controls the seconds shown across the timeline. Click empty track space to seek. Detailed parameters and curve editing remain available in the collapsed section.

The bar represents **one particle's lifetime**, not the total duration of a spawning effect. A group can emit several particles or emit continuously. Layers sharing a native timing node move together. Indexed or unsupported timing fields are read-only; actions that inherit a lifetime cannot be resized through the bar. Editing does not flatten the FFX graph into independent TAE events.

## Insert or replace a model or texture

1. Select a compatible timeline layer.
2. Open **Assets** and set its Resource ID. Use an existing ID to replace that resource, or an unused ID to insert a resource.
3. Choose **Insert / replace file** and select a PTDE `.flver`, a single-texture PC `.tpf`, or a 2D DXT1/DXT5 `.dds`.
4. Choose the desired ModelID or TextureID slot and **Assign to selected layer**. Selecting an existing resource in the asset browser also makes it available for assignment.
5. Choose **Export edited archive**. This downloads a separately validated `.ffxbnd` containing the current effect draft and all imported assets in that archive. The installed game archive remains unchanged.

DDS imports are wrapped into PC TPF files. Texture names are normalized to `sNNNNN` according to the selected ID. Model files keep their material texture references; import those referenced textures too when the game does not already have them. Model import requires the installed PTDE FLVER version. Maximum import size: 24 MB.

Imports belong to the local server session and disappear when it stops. Export the archive before stopping it. Draft JSON saves effect edits and sound insertions, but not imported asset bytes. Archive export includes **the currently selected effect**, not drafts of other effects; export each effect's FFX separately if editing several effects. No game archive is overwritten automatically.

## Make a VFX loop indefinitely

**Preview loop** only restarts the viewer at the selected preview duration. It does not change the exported effect.

For native continuous emission, select a layer and choose **Make spawning infinite**, then export its FFX or edited archive. For supported functions 2023/2024, the preset sets the spawn-count limit to -1 and removes finite lifetime/spawn-window limits in its known timing chain. For functions 2032/2034 it sets the random count range and known spawn/forced-lifetime ranges to -1. Known parent 2101/2102 lifetime fields are also changed to -1.

The preset affects the selected group's ancestors and can therefore affect sibling layers. Unknown parent functions, state transitions, event-linked modes and game/TAE termination can still stop the effect. A single static particle is different from an emitter that continually replaces short-lived particles. Use Undo to restore the prior limits. Validate the result in an offline game test before treating the native runtime match as proven.

For sound IDs and bank playback, see **AUDIO.md**.
