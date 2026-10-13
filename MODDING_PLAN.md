# DS1 PTDE FFX viewer plan and environment

- Input: `E:\Games\Dark Souls Prepare to Die Edition\DATA`.
- Scope: read local effects and resources; no game installation edits, process hooks, save/config changes, or online interaction.
- Route: BND3 → FXR1 graph + TPF/DDS + FLVER2 → local ASP.NET server → Three.js WebGL preview.
- Reader: SoulsFormatsNEXT commit `ee1dd61958f60bdc51ce3da548e9a90a8ab39905`, compiled for .NET 8 rather than its upstream .NET 9 target.
- Code fingerprint: `DARKSOULS.exe`, 17,630,720 bytes; SHA256 `B6958F3F0DB5FDB7CE6F56BFF14353D8D81DA8BAE3456795A39DBE217C1897CF`.
- Installation contains unpacked folders and mod/DSfix DLLs. Tested data is the supplied installation; it is not certified as pristine stock data. An exact executable build/version was not established from this fingerprint.
- Knowledge-base search: bundled universal-modder index has related DSR/ER work but no applicable PTDE FFX viewer note.
- Lab data and downloaded research files were kept under the chat's private `work` directory. The output package contains application source, public dependencies, aggregate audits, documentation and local preview screenshots.
- Unresolved: native evaluator semantics, game shader equivalence, event-linked termination, dynamic attachments/trails, sound banks and in-game visual validation. See FFX_FORMAT.md and README.md.
