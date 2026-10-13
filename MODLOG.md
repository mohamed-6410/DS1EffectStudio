# Research and implementation journal

## 2026-10-13

Inspected the supplied installation read-only. Found 29 BND3 effect archives and a previously unpacked CommonEffects directory. The executable is native Windows code; this task used data readers rather than process instrumentation.

Reviewed SoulsFormatsNEXT FXR1, TPF and FLVER2 implementations and independent DarkSoulsFfxTool research. Pinned the library commit and preserved its source/license. Changed only its project framework target to build with the installed .NET 8 SDK.

Verified PTDE's 0x20-byte FXR1 header and the bonfire pointer/node table sizes. Confirmed 24-byte containers, 16-byte states, tags 37/38/133/134, typed action-data fields, resource-curve tables, and indexed constructor arguments.

The parser audit decoded 4,024 FFX entries, 580 texture entries and 324 models without errors. All FFX decoded root graphs were equal after in-memory write/read. 138 binary rewrites were byte-identical; physical layout is not preserved for the others.

Implemented the local server and offline 3D viewer with archive/effect/resource browsing, models with diffuse textures, compressed DDS upload, billboards, atlas/curve evaluation, approximate scheduling/emitters, layer toggles, raw graph export and PNG capture.

Corrected a 2101 delay lookup: its scalar parameters exclude action placeholders, so delay is scalar index 2, not 3. Corrected zero/absent billboard duration to use the wrapper lifetime. Added embedded constructor variant 134 and constructor-local index resolution. Traversed child effects in unknown action containers while reporting inherited timing as approximate.

The final preview compiler audit traversed 4,024 effect graphs without exceptions, found layers in 2,343 entries, and produced 9,056 render-layer occurrences including 2,028 model layers. Reviewed bonfire, fireball and character effect 13471 in the browser, with no observed browser errors. Checked one geometry/index set and one DDS header per applicable archive; additional resource previews were inspected through the UI.

Published a self-contained Windows x64 build. Launch and stop scripts only manage this local viewer. No game assets or decompiled executable output were included in the source package.

Runtime limitations remain explicit: initial-state traversal, reconstructed spawning/randomness/motion/transforms, planar trails, approximate three-texture shading, unsupported distortion/radial blur/lighting, absent skinned animation and audio. There was no in-game frame oracle. The full native effect runtime has not been reverse engineered.

No field note or source was uploaded or published externally. This local journal and format report preserve the findings for later work.

## Mesh culling/depth update

The user reported see-through models in effect 109 and resource s00904. The initial viewer used double-sided, transparent, non-depth-writing particle materials for every mesh. The s00904 export also had 48/48 triangles wound opposite their supplied normals in the WebGL basis.

Reversed exported triangle winding, exported the original selected face set's CullBackfaces flag, added game/front/back/both face controls, and separated opaque model depth behavior from particle/alpha/additive materials. Preserved fades and alpha materials, with blend 0 interpreted as the model base material in this preview.

Rebuilt and restarted the packaged application. Syntax and material-policy checks passed; s00904 now has 48/48 triangles aligned to normals. s13220 has 1,473 aligned and 15 opposed triangles, consistent with some local source normal differences. Browser automation timed out, preventing a fresh screenshot verification. The user can refresh the existing viewer to inspect the updated rendering.

## Live draft editor

Added the Edit panel with numeric and scalar curve/keyframe controls, color tint, action-data selection, Undo/Redo, Reset, draft import/export and validated FFX download. Preview changes retain the playback time and leave source game files unchanged. Curve sections retain their expanded state after an edit.

The backend applies typed numeric patches to a freshly read source graph, checks its original checksum, supports resizing scalar keyframe lists, and validates the write by decoding again and comparing graph signatures. Protected graph/metadata paths and invalid numeric/keyframe data are rejected.

An exported bonfire test contained duration 1.25, red channel 0.2 and the newly added Scale2X keyframe (time 2, value 0.5), confirmed by an independent FXR1 read. Invalid-source/path/integer/time cases were rejected; the original API graph and checksum were unchanged. Browser verification recovered and confirmed a live numeric edit, Undo/Redo, curve keyframe addition, and validated export with no observed console errors.

Prepared a source-only GitHub package and documented free Pages hosting. No publishing was requested or performed. The fully browser-local format backend needed for a working Pages editor remains unimplemented.
Session draft caching also passed the UI check: adding a bonfire keyframe, switching to fireball, and returning preserved the bonfire edit. Resource inspection returns to the edited preview without reloading the original.


## Native assets, event timeline, looping and audio

Added session-local FLVER/TPF/DDS resource insertion and replacement, per-layer resource assignment, and validated full BND3 archive export. New textures/models use category-specific binder ID ranges 100000/200000, and exported binder entries are sorted by ID. DDS imports wrap DXT1/DXT5 in a PC TPF. Source game files are never written. An independent SoulsFormats reader verified the exported imported resources and FFX edits.

Added a TAE-style row timeline. Bars edit native start-delay TickNodes and particle Duration; shared timing stays shared. Pointer move/resize and keyboard arrows use the same native edits. Unsupported/inherited timing remains read-only. An infinite-spawn preset changes known 2023/2024/2032/2034 counts/windows and 2101/2102 parent lifetimes, while retaining game/TAE termination caveats.

Observed action 75 in c3471 effect 13470 with SoundIDNode68, FloatNode(1) and IntNode(1). Native insertion uses that structure and passed write/read graph comparison. Existing sound IDs are editable. Browser checks confirmed timing edits, bar movement/resizing by keyboard, texture import/assignment, native-loop edits, sound insertion, audio audition, validated FFX download and undo, without observed browser errors.

The installed sound folder contains 279 FSB4 banks (7580 samples). A v61 FEV parser indexed 21293 events and 34923 wave references without parse errors. 41 references point to two absent original banks (frpg_c2010 and frpg_c2020). Event s000013470 mapped to fdlc_c3471.fsb sample 29, matching vgmstream metadata. The backend decoded it to a 99116-byte WAV. Preview auditions first mapped waves; full FMOD event execution is outside this implementation.

Bundled unmodified official vgmstream r2117 win64 with COPYING and documentation; official zip SHA256 6C4A8A3813864FEFED081BBD337DBC0AD93BF88E0B92F5DB98D7AB258B22DC6C. No game sounds/assets are packaged in the source bundle. Exhaustive preview compilation still passed all 4024 FFX entries (9056 layers), with zero exceptions.


## Group labels
Added shared effect-call group numbers to timeline names, layer names, sound events and the detailed action selector (including emitter/movement action data). Group labels remain stable after numeric edits and sound insertion and do not change the FFX graph. Verified matching labels across panels in the browser with no observed console errors.


## Windows desktop, multiple selection and transforms
Added a self-contained WinForms/WebView2 Windows host. It reuses the local backend or starts an owned loopback backend. Native startup diagnostics confirmed WebView2 155.0.4283.45, successful navigation and a ready 14-layer bonfire preview. Added checkbox/Ctrl/Shift/range selection, batch timing with shared-node deduplication, rotation in degrees, uniform size and direct model assignment to compatible mesh layers. Empty rotation axes become whitelisted native constant FXFields; scalar keyframes are offset to preserve animation shape. Browser exports independently verified two 45-degree billboard rotations and ModelID 904 with a 90-degree mesh Z rotation. No game file was written.
