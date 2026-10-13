# DS1 PTDE FFX: binary format and rendering model

Research date: 2026-10-13. Evidence: the local installation, the pinned SoulsFormatsNEXT reader/writer, independent DarkSoulsFfxTool research, and the public DS1 effect/action reference sheets. This document separates verified binary structure from inferred or approximated runtime behavior.

## 1. Files and their relationship

`DATA/sfx/FRPG_SfxBnd_*.ffxbnd` are **BND3** binders in this installation. A `.dcx` wrapper is also supported by the reader. The binders contain:

| Entry | Role |
|---|---|
| `fNNNNNNN.ffx` | Effect definition, root ID, states, calls, typed parameters and curves |
| `sNNNNN.tpf` | Texture package containing one or more DDS textures |
| `sNNNNN.flver` | Effect geometry, materials, UVs and vertex/index buffers |

The CommonEffects archive provides shared resources. Map and character archives add scoped effects/resources. The viewer resolves resources from the selected archive first, then CommonEffects. It does not indiscriminately substitute assets from other maps with the same numeric ID.

The on-disk extension is **FFX**, while the magic is **FXR\0** and the library class is **FXR1**. This must not be confused with the later FXR3 format.

## 2. Verified PTDE header

PTDE files tested here use little-endian integers, float32 values, and 32-bit file-relative offsets. The header occupies 0x20 bytes.

| Offset | Width | Meaning |
|---|---:|---|
| 0x00 | 4 | ASCII `FXR\0` |
| 0x04 | 4 | Endianness/version marker; little-endian reader value 0x00010000 |
| 0x08 | 4 | Root/main-data offset |
| 0x0C | 4 | Metadata table offset |
| 0x10 | 4 | Pointer relocation table entry count |
| 0x14 | 4 | FX-node/function table entry count |
| 0x18 | 4 | Unknown header integer 1 |
| 0x1C | 4 | Unknown header integer 2 |

The metadata includes offsets of locations containing pointers, followed by offsets identifying FX nodes. These are file metadata, not native machine-code functions. The node graph's objects can be shared and cyclic, so a reader must cache each object by offset before following references.

Example verified from `f0090000.ffx` in CommonEffects:

```text
46 58 52 00 00 00 01 00 20 00 00 00 70 5A 00 00
C6 04 00 00 1A 02 00 00 01 00 00 00 00 00 00 00
```

This gives root offset **0x20**, metadata offset **0x5A70**, **1,222** relocation entries, **538** node entries, and file size **30,192** bytes. Here `0x5A70 + 1,222×4 + 538×4 = 30,192` exactly.

The same reader also recognizes wide-offset variants, including DSR's padding conventions. This application only claims validation for the supplied PTDE data.

## 3. Containers, states, and calls

A PTDE **FXContainer** is 24 bytes:

| Relative offset | Data |
|---|---|
| +0x00 | Pointer to FX-node pointer array |
| +0x04 | Node count |
| +0x08 | Repeated node count |
| +0x0C | Three flag bytes and a zero byte |
| +0x10 | Action-data pointer, or zero |
| +0x14 | Modifier pointer, or zero |

A **state** is 16 bytes: transition-array offset, action-array offset, transition count, action count. A **state action** is an action type plus an inline container, totaling 28 bytes in PTDE. Transitions carry target-state and evaluator-node references. Those evaluators include comparisons, timer values and internal status tests; they are not simply a list of animation keyframes.

Important typed nodes:

| Node tag | Decoded meaning |
|---:|---|
| 37 | Effect-call node: function/effect ID, parameter-container offset, unknown integer |
| 38 | Action-call node: action type, parameter-container offset, unknown integer |
| 133 | Effect constructor: root effect ID, inline containers, and state array |
| 134 | Constructor variant with a list of nodes; used in embedded/nested constructions |

The root ID identifies the effect file. IDs inside effect calls commonly refer to reusable **effect functions/templates**, such as 2023 or 2101. They are not texture IDs. Many template definitions are themselves present as FFX files in CommonEffects.

For example, function **2023** supplies particle spawning with an appearance action, emitter action, movement action, transforms, and optional child effects. Function **2101** is commonly a single-instance wrapper. Functions **2032/2034** include randomized spawn counts and timing. These semantic descriptions come from community experiments and the local decoded parameter structures, not a decompiled runtime oracle.

An indexed node refers to an argument rather than containing the value inline. For example, the bonfire initial state uses an indexed effect referring to its constructor's second container. Ignoring that indirection loses the entire visible effect. Likewise, ignoring tag 134 loses effects containing embedded constructors.

Modifier 0 trims the active parameter list. Its index is inclusive. Unused zero-valued calls can remain in the binary to fill the expected template signature; treating them all as emitters is incorrect.

## 4. Appearance and resource IDs

Action data starts with the action-data type and byte size, then a resource-curve table and its owning container reference. Remaining fields are specific to the action type. The resource table here supplies **curve data**, distinct from TPF/FLVER resources.

| Action | Data behavior | Viewer behavior |
|---:|---|---|
| 27 | Point-sprite appearance | Textured billboard approximation |
| 40 | Tracer/trail appearance | Planar textured preview |
| 43 | Distortion/refraction appearance | Decoded, not rendered |
| 59 | Particle billboard | Billboard; wrapper supplies lifetime |
| 61 | Model-based appearance | Original FLVER mesh |
| 66 | Appearance data with largely unnamed fields | Decoded, not rendered |
| 70 | Three-texture billboard | Reconstructed three-map modulation |
| 71 | Particle-cluster billboard | Animated texture atlas and curves |
| 107 | Radial-blur appearance | Decoded, not rendered |
| 108 | 3D particle/model | Original FLVER mesh, scales/colors/UVs |

Texture ID 16 resolves to `s00016.tpf`; model ID 509 resolves to `s00509.flver`. Mesh material texture paths are resolved separately through their basename. A model can therefore use several material texture references, independently of a particle's TextureID.

Action 71 contains duration, duration multiplier, lifetime variance, attachment and orientation modes, render depth, texture ID, blend mode, two scale stages, rotations, rotation speeds, atlas dimensions/frame selection, and two RGBA stages. The first scale/color stages are sampled at spawn; second stages modify the living instance over time. The viewer preserves this distinction.

Blend-mode research identifies additive (4), source-over (2), multiply (3), subtract (5), and screen (7). Modes 0 and 6 have game-specific behavior. The preview uses corresponding WebGL blend operations where possible; refraction and the game's material shader paths remain unresolved.

## 5. Curves and animation

FXField uses a tagged representation. Verified reader classes include:

| Type | Structure |
|---:|---|
| 0 | Constant/step float sequence |
| 4 | Float sequence |
| 5 | Float sequence with min/max range |
| 6/7 | Sequence with resource index, optionally ranged |
| 8/9 | Three-component sequence, optionally ranged |
| 12/16 | Repeating constant/float sequence |
| 17 | Another ranged float sequence variant |
| 24 | Constant float |
| 25 | Base/min/max scalar |
| 26/27 | Additional partially identified forms |
| 28 | Empty/default field |

For scalar sequence data, the packed representation stores the tick count, all float32 times, then all float32 values. Some general FXNode sequence forms use separate time/value array pointers instead. They must not be parsed with the same layout merely because both describe curves.

Atlas animation uses a per-row slice count, total frame count, initial-frame field, and frame-selection curve. The renderer selects a sub-rectangle of the original DDS, rather than manufacturing substitute sprites. Repeating selection curves wrap in time. Empty curve fields use context-dependent defaults: scale/color generally 1, translation/rotation/frame generally 0.

The preview interpolates scalar curves linearly or as steps, evaluates constant and ranged fields with a stable seed, and supports scalar resource-index modulation. Exact randomized semantics, three-component field evaluation, and some unnamed field forms still need a runtime oracle.

## 6. Emitters, motion, transforms, and sound

Emitter actions 28–32 encode cone, square, circle, sphere, and box behavior. Their typed fields include dimensions, degree/spread, speed, and distribution/direction modes. Movement actions 55, 84 and 105 encode gravity/falloff and turning/following behavior.

Action 35 has authoring values and a packed transform modifier. In local examples, the modifier carries mode flags, translation and a normalized rotation quaternion; a 90-degree authoring rotation produced a quaternion with approximately ±0.7071 components. Action 1 contains translation curves/ranges. The viewer uses packed translation/quaternion values for emission positions and applies translation curves; exact transform inheritance for every renderer is not proven.

The scheduler must distinguish an effect's spawning window, particle duration, maximum instance count, spawn interval, initial delay, and event-linked termination. Negative duration/count fields can represent indefinite or event-linked behavior. They should not simply be clamped into a generic one-second animation.

FFX may contain sound IDs and sound-related action calls. Those refer to the game's separate sound system; an FFX is not a wave/audio container. A visual preview cannot reproduce FMOD bank playback solely from the FFX and TPF files.

## 7. What the checks prove

All 4,024 local FFX entries were read, written in memory, read again, and compared using a canonical traversal of the decoded root graph. Offset labels and physical layout were normalized; scalar values, reference topology, states, transitions, action data, and reachable fields were compared. **All passed.** Only 138 rewrites were byte-identical, so this is not a claim that the writer preserves every original padding byte or metadata ordering.

All 580 texture entries and 324 model entries were read. Actual textures were DXT1 or DXT5. The preview compiler traversed all 4,024 graphs without exceptions and generated supported layers for 2,343 entries. These are structural and program checks, not proof of native visual equivalence.

The decisive remaining oracle would be fixed-seed/time in-game captures or traces for representative effects, including frame selection, particle positions, blend output, and state transitions. No game process tracing or captured-frame comparison was performed in this work. Exact native runtime/shader reverse engineering remains unfinished.

## Sources

- [Pinned FXR1 reader and writer](https://github.com/soulsmods/SoulsFormatsNEXT/tree/ee1dd61958f60bdc51ce3da548e9a90a8ab39905/SoulsFormats/Formats/FXR1)
- [Independent DS1 FFX converter research](https://github.com/loosepolygon/DarkSoulsFfxTool)
- [DS1 FFX explanation and reference-sheet links](https://www.soulsmodding.com/doku.php?id=tutorial:ffx-files-for-sfx-explained)
- [Effect function references](https://docs.google.com/spreadsheets/d/1HE0zOkFqF7z0xrq7mDzZz2AtVz8FdWh2c05Q3BUZT_Y/edit)
- [Main action references](https://docs.google.com/spreadsheets/d/1lt5l3NwPsL_HEHjd2WMCwvKejVABpuhWqOW9lyU-p44/edit)
- [Secondary action references](https://docs.google.com/spreadsheets/d/1OxvRUzu4eDoMzD6G26OtFnIyicYXyeJKE6BDi7hwj5Y/edit)


## Editor extension: native timing and audio

The timeline exposes original TickNode delay references and action-data Duration rather than replacing the graph with a synthetic event list. Export supports a restricted set of scalar timing-node/modifier fields. Shared references remain shared. Native indefinite-spawn presets and their event-linked limits are described in EDITOR_GUIDE.md.

Observed action 75 has no action-data block: its container contains SoundIDNode68, FloatNode volume, and an IntNode playback flag. Sound insertion appends a real ActionCallNode(75) to the chosen effect call, then verifies the graph after rewriting. AUDIO.md documents the FEV-to-FSB mapping and first-wave preview limits.
