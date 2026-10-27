# JUST SITTING

A sitting space shared by a machine and a person. Andy Point · Pointlab, 2026. Built with Claude.

## Files

- **just-sitting.html**: the whole piece in one file, with no dependencies. Open it in any browser. It works offline; without a connection, the type falls back from Archivo to Helvetica.
- **JustSitting.jsx**: the same piece as a React component (React 17 or later, nothing else).
- **just-sitting-reader.pdf**: the reader, 48 pages, linked in the about panel above the sources.
- **record_sitting.py**: records a real language model's sitting on your computer.
- **gallery/**: the gallery version, `just-sitting-gallery.html` and `sitting_bridge.py`, with a copy of the reader.

## Homepage

Upload `just-sitting.html` and `just-sitting-reader.pdf` side by side. The about panel links the reader by that name. To place it inside another page:

```html
<iframe src="just-sitting.html" style="width:100%;height:100vh;border:0"
        allow="fullscreen; screen-wake-lock"></iframe>
```

## React

```jsx
import JustSitting from "./JustSitting";

<div style={{ height: "100vh" }}>
  <JustSitting cycle={11} ink="white" />
</div>
```

The component fills its parent, so the parent needs a height. Props are read once, when the component mounts:

- `cycle`: 5, 11 or 33
- `ink`: "white" or "red"
- `stream`: "simulated" or "recorded"
- `recording`: URL of a recording file
- `slow`: start with the sound eleven times slower
- `stretch`: 1 to 11, how many times slower the sound runs
- `law`: "TRUE", "TUNED", "SACRED" or "SCHUMANN"
- `remember`: keep a visitor's settings
- `reader`: URL of the reader PDF (default `"just-sitting-reader.pdf"`, relative to the page); `false` hides the link

## On your computer

Open `just-sitting.html`, click anywhere to sit (the first touch starts the sound), and press **F** for fullscreen. The screen stays awake while you sit.

To give it its own window and Dock icon, put the file on your homepage first, then open that address:

- Safari: **File → Add to Dock**
- Chrome: **⋮ → Cast, save and share → Install page as app**

## Stream and recording

- **Simulated.** A statistical stand-in for a language model runs live, with the loop closed.
- **Recorded.** The built-in *Session 01* is a 33-minute sitting of the simulated model: three ensō of 11 minutes. Its stream and its sand replay exactly, every time.

To sit with a real model, record one:

```
pip install torch transformers
python record_sitting.py --minutes 33
```

The model writes freely from an empty start, with nothing to complete. Only the surprise of each token is saved; no words are kept. The first run downloads a small model (Qwen2.5-0.5B, about 1 GB).

To play the recording:

- On your computer, drop the `.json` file onto the plate, or use **Settings → Load recording**.
- On your homepage, upload it next to `just-sitting.html` as `sitting.json`. It then becomes the recorded stream for every visitor.

The recorder was written without access to a model, so it hasn't been run yet.

## Keys

| Key | Action |
|---|---|
| I | about |
| P | settings |
| F | fullscreen |
| M | sound |
| S | sound 11× slower, or back to real time |
| L | law |
| [ ] | loop gain |
| Esc | close panels |

## Gallery

One computer runs the work. Its own screen is the control room. The projector shows only the circle, on true black.

1. Install once: `pip install torch transformers`.
2. In the `gallery` folder, run `python sitting_bridge.py`. The first run downloads the model, about 1 GB. The control screen then opens in your browser; use Chrome.
3. Click **Open projection**. Drag the new window onto the projector and double-click it for fullscreen.
4. Click **Begin sitting**. The bell rings, and the sound plays from this computer.
5. Change settings on the computer's screen. The wall follows live.

**Live stream.** The model writes freely, with nothing to complete. Only the surprise of each token reaches the page; the words stay in the bridge. The plate's unrest sets the model's temperature: T = 1 + 0.6 × gain × (unrest − 0.3), kept between 0.5 and 1.8. Loop gain 0 leaves the model alone. Nothing is learned, and the bridge listens only on this computer.

**Without the model**
- `python sitting_bridge.py --stand-in` tests the room with the statistical stand-in.
- Opening `just-sitting-gallery.html` directly runs the simulated or recorded stream. The projection works the same way.

**Before opening the room**
- Set display sleep and the screen saver to never.
- Turn on Do Not Disturb, so no notification reaches the wall.
- If Chrome blocks the projection window, allow pop-ups for the page.

**Outside the room.** The homepage version carries the information and the links. A QR code at the entrance points to it.

The bridge was tested end to end with the stand-in. The model path itself still needs a first run on your Mac.

