# Windows desktop app

Extract the entire package and double-click **Start Studio.cmd**, or open **desktop-app/DS1EffectStudio.Desktop.exe**. It opens the editor in its own Windows window, with the .NET runtime included. Keep `desktop-app`, `app` and the launcher together.

The app uses Microsoft's Evergreen WebView2 runtime, which is installed on this computer (155.0.4283.45). If another computer lacks it, the app reports that it is needed. Install it from [Microsoft's official WebView2 page](https://developer.microsoft.com/microsoft-edge/webview2/), then reopen the app.

The app reuses a running local Effect Studio server at port 5187, preserving that server's session resources. Otherwise it starts its own local backend on an available port. Closing the app stops only the backend it started. The folder picker appears when the default game DATA folder cannot be found. A different folder can also be supplied with `--game "D:\Dark Souls\DATA"`.

**Start Browser Studio.cmd** retains the browser version. Both versions use the same editor and export validation.

## Select and edit several layers

Use the timeline checkboxes or **Ctrl-click** layer names to add/remove selections. **Shift-click** selects a range. **Select all**, **Select group**, **Select model layers** and **Clear** provide shortcuts. Ctrl+A selects all timeline layers when you are not typing in an input.

- Drag a selected bar to move the selected layers together. Shared native timing nodes are changed once. Relative start offsets are retained.
- Drag a bar's right edge to change selected compatible particle lifetimes together.
- Arrow keys move selected bars by 1/30 second; Shift+arrow resizes them.
- **First start** shifts the selection relative to its primary layer. **Particle duration** sets the same lifetime on all compatible selected layers.
- **Rotation X/Y/Z** uses degrees. Entering a value sets the starting rotation of compatible selected layers. Constant and scalar keyframe fields are supported; keyframe curves are offset to preserve their animation shape. Empty axes become native constant fields. Random/ranged fields become a fixed value when edited here; use detailed parameters to keep random variation. Other field kinds remain available in the detailed editor.
- **Size** sets compatible initial scale fields uniformly. It does not change the secondary scale-animation curves.
- Each batch edit is one Undo operation. Individual detailed-parameter edits still affect the selected action-data block.

## Assign a model

1. Open an effect with a mesh layer, for example **CommonEffects → effect 109**.
2. Click **Select model layers** or select mesh rows individually.
3. In **Edit**, choose **Model to assign** and click **Assign model to selected mesh layers**.
4. Adjust rotation and size, then **Export FFX**. If you imported new model/texture files, use **Export edited archive** to include them.

To use your own native FLVER, import it in **Assets** with an unused resource ID first. The imported model becomes available in the model selector and is selected there automatically. Its referenced textures must also be present or imported. The generic Assets assignment button supports all selected compatible layers too.

Billboard-only effects have no FLVER model slot. Assigning a model requires an existing action-108 mesh layer; this build does not convert billboard actions into mesh actions or create a new mesh action from scratch.

See **EDITOR_GUIDE.md** for archive saving and infinite spawning, and **AUDIO.md** for sound calls.

Desktop host: Windows Forms + Microsoft.Web.WebView2 SDK 1.0.4258.31. Source and WebView2 SDK license are included under `desktop`. The native host reports successful WebView2 initialization, local navigation and a ready editor containing 14 bonfire render layers. Browser UI checks and independent FFX reads verified batch rotation, empty-axis creation, range selection and model assignment. Exact in-game VFX runtime behavior is still unverified.
