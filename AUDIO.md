# Native sound calls and audio preview

The editor reads the installed game's `sound` directory. No game sound files are bundled with the application.

Open **Sounds** to browse FSB banks, search sample names or event IDs, and listen. Select a visual timeline layer, enter a sound ID, and choose **Insert sound call**. The sound joins that layer's effect-call timing group. Existing sound calls have editable ID fields. Newly inserted calls can be removed with ×. Undo/Redo and draft save include sound edits. **Sound with preview** plays matching events as their group start is crossed, including when preview playback restarts.

## File behavior

Observed DS1 action 75 consists of a container with `SoundIDNode68`, a float volume of 1, and an integer playback flag of 1. New calls use that observed layout. The exporter inserts real action-75 nodes into the chosen effect group, writes FFX, rereads it and checks graph equivalence. Existing sound-ID nodes can also be patched. The sound's waveform is not embedded in the FFX.

`SoundLibrary.cs` indexes FSB4 sample headers and parses PTDE FEV1 version 61. The FEV parser resolves each event's sound-definition indices into wave-bank names and sample indices; it does not guess IDs from FSB sample filenames. For example, `s000013470` maps to subsong 29 of `fdlc_c3471.fsb`. FMOD event prefixes distinguish categories; new action-75 calls use the observed `s` category.

On this installation: 279 FSB banks, 7,580 samples, 21,293 FEV events, 34,923 event-to-wave references, and no parser errors. 41 references point to `frpg_c2010.fsb` or `frpg_c2020.fsb`, which are absent from the installed sound folder. Those events cannot be previewed from this installation.

Audio decoding uses the unmodified official Windows x64 **vgmstream r2117** package. The backend runs it without a console window, selects the requested subsong, disables its native looping, reads the resulting WAV and deletes the temporary file. Bank lookup is restricted to the indexed game banks. The browser caches at most 24 decoded samples.

## Preview limits

An FMOD event may combine several layers, random variants, envelopes, spatial attenuation, loop flags and game parameters. The preview auditions its first mapped wave at the group start, using the decoded volume; it does not implement the complete FMOD event runtime or repeatedly trigger it per visual particle. The inserted native sound call retains game-side behavior. Changing a sound ID requires an existing compatible game event; inserting an arbitrary number does not create a new sound bank or FMOD event. FSB rewriting and importing replacement audio are outside this build.

## Decoder source and notices

- [Official r2117 release](https://github.com/vgmstream/vgmstream/releases/tag/r2117)
- [vgmstream source at r2117](https://github.com/vgmstream/vgmstream/tree/r2117)
- [FSB layout reference](https://github.com/vgmstream/vgmstream/blob/r2117/src/meta/fsb.c)
- [FEV layout reference](https://github.com/vgmstream/vgmstream/blob/r2117/src/meta/fsb_fev.h)
- [Decoder usage](https://github.com/vgmstream/vgmstream/blob/r2117/doc/USAGE.md)

Preserve `audio/COPYING` and the upstream README/USAGE files when distributing the decoder. This package includes the complete unmodified official dependency set. Source-only users can run **SetupAudio.ps1** to obtain the same official package before building.
