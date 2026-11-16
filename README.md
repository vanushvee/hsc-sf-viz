# hsc-sf-viz <!-- v1.1.0 (15 Nov 2026) -->

The site's scene with nothing of the page on it, for a projector (or a TouchDesigner Web Render TOP).

Live at **https://vanushvee.github.io/hsc-sf-viz/** — GitHub Pages, published from `main` at the repo root (`.nojekyll` is present so
Pages serves the files as they are). Push to `main` and Pages rebuilds; a build takes about a minute.

```bash
npx serve .            # or: python3 -m http.server 8010
open http://localhost:8010/                        # the room, aimed at the city, with the flock
open http://localhost:8010/?scene=desk             # the desk in the room
open http://localhost:8010/?scene=sky&haze=3.5     # the skyline alone, no room
```

Serve it over HTTP — the page fetches ES modules and `.glb` models, and `file://` blocks those. A plain `python3 -m http.server` is fine;
if a module request ever resets, reload (the page has no software fallback, by design).

It needs a GPU: there is no software-GL path here, by design (a software renderer would be a slideshow).

## The scenes

- **`?scene=room`** (the default): the corner with the floor-to-ceiling window and nothing on the floor — the skyline, the sun and the
  flock, aimed a little higher than the desk's seat, with the eye dollying slowly across the glass.
- **`?scene=desk`**: the room furnished — the desk with its keyboard, the in-tray, the palm on the desk right of the Mac, the Tizio lamp
  and its light, and the Macintosh with its screen dark (no film, no UI). Left out: the
  phone, the clock radio, the chair, the magazines, the card reader, the tablet, the papers and the certificate.
- **`?scene=sky`**: just the view out of the window — the dusk sky, the sun over the Marin hills, the bay, and the three skyline layers.
  This is what `stills/` was rendered from.

Both reuse the site's own code and values rather than approximating them: the sky shader, the skyline materials and haze, the room and the
layout, the lamp's rest pose, the bake on the desk top and the post chain (bloom → ACES → grade + anamorphic flare + vignette + grain) are
lifted from the desk scene in the hscompute.com repo, with the line numbers in the module headers.

## Parameters

| parameter | default | what it does |
|---|---|---|
| `scene` | `room` | `room`, `desk` or `sky`. |
| `back` | `0.30` | metres the eye sits back from the site's seat. `0` is the seat itself (nearly at the glass); `0.7` stands back in the room with two mullions in frame. |
| `parallax` | `0.20` | metres the eye dollies sideways per cycle, across the window. This is the motion: the eye travels instead of turning, so the near city slides against the far shore. `0` is a still frame. |
| `pan`, `panTime` | `0`, `82` | `panTime` is seconds per cycle; `pan` adds the old head-turn (degrees either side) on top of the dolly. |
| `birds` | `130` | how many birds in the flock over the city; `0` is none. |
| `glass` | `1` | how much window is on the pane; `0` is a clean opening. |
| `dirty` | `50` | **0–100**: how dirty the pane is. `0` is freshly cleaned, `50` is the pane as drawn, `100` is a window nobody has touched since the building opened. |
| `haze` | `3.5` | multiplies the skyline's per-layer haze density. `1` is the site's; higher pushes the far city further into the sky. |
| `fov`, `yaw`, `pitch` | scene's own | camera overrides in degrees (desk: 38 and -11; sky: 40 and -5.5). |
| `screen`, `screenlight` | `#050506`, `1.2` | the Mac's screen colour and the spill light it throws on the room (the site runs a lit screen at 3.0). |
| `flare` | `40` | **0–100**: the lens flare. `0` is off; `100` is veiling glare, halation, a six-blade starburst, the anamorphic streak with its dispersion, and the element ghost train. |
| `bar` | `0` | `0–0.5`: the flare's vertical bar element (off by default: it is a hard vertical line in the sky). |
| `bloom`, `exposure`, `vig`, `grain` | `0.32`, `0.72`, `0.28`, `0.035` | the site's post values. Keep the grain: it dithers the sky gradient and stops banding on a projector. |
| `dpr`, `w`, `h` | `min(dpr, 2)`, viewport | render density and a forced render size, for stills. |
| `fps` | `60` | frame cap; `0` is uncapped. |
| `t` | `0` | start time in seconds. |
| `still=1` | — | render one frame (`t`) and stop. |
| `hud=1` | — | a small frame-time and resolution readout. |
| `sun=0` | — | no sun, no flare. |

`window.plate` is there for a capture script: `ready` (a promise), `render(t)` (draw at a given second), `stats()`, `capture()` (a PNG data
URL), and `scene` / `camera` / `renderer` / `desk`.

## TouchDesigner — Web Render TOP

1. Add a **Web Render TOP**.
2. Resolution: 1920×1080 (or 3840×2160 if the machine can carry it; the page renders at whatever it is given).
3. URL: `https://vanushvee.github.io/hsc-sf-viz/?parallax=0.2` (start the server first, or point it at a deployed copy).
4. Let it cook every frame. The page animates on its own; no interaction is needed.
5. If the TOP comes up black, its embedded browser has no GPU — WebGL must be enabled for TouchDesigner's browser and the machine needs
   hardware acceleration.

For a recording, cook the Web Render TOP into a Movie File Out TOP. For a fixed frame, load `?still=1&t=<seconds>`.

## Stills

`stills/` holds two `scene=sky` plates (`?still=1&t=6&dpr=1`) for a fallback or a poster: `stills/skyline-16x9-3840x2160.png` and
`stills/skyline-21x9-2560x1080.png`.

## The flock

The birds are real boids: Reynolds' separation, alignment and cohesion, capped steering forces, a soft bounds box and a drifting roost,
stepped at a fixed 30 Hz from t = 0 with a seeded RNG — so `?t=42` is always the same flock. (`three-boids`, `bird-oid` and `@thi.ng/boids`
are the packaged versions of the same model; writing it here keeps the page on the vendored three.js alone.) `?birds=N` sets the count
(default 42, `0` is none).

The bird is a silhouette — a body and two wings, one instanced draw call, flapping in the vertex shader, and small (0.28 to 0.46 units
across) because at this distance the flock reads as a mass, not as individuals. A rigged raven was tried and looked like a moth at that size.
They fly 26 to 60 units out, so they sit *behind* the skyline, in the same haze as the towers.

Neighbours are **topological**: each bird follows its 7 nearest (Ballerini et al., 2008), not everything inside a radius. A radius fragments
a large flock into local clusters — which is exactly what 160 birds did — while the k nearest keeps it one animal at any count. Speeds and
steering forces are deliberately gentle (a gull's 5 to 9 m/s): a faster, harder-turning murmuration reads as violent rather than alive.

The Pyramid's red beacon flashes on a 10 to 15 second cycle, the gap drawn uniformly and never the same twice, with a 0.1 s rise into a hot
core and a ~1.1 s fall, and the sprite brightens 16x and widens 3x at the peak so the bloom flares it.

## The window

`?glass=` scales the pane (default 1, `0` is a clean opening). `glass.js` draws the glass as a thin reflective surface over the view:
the room reflected in it (a small equirectangular interior sampled through `reflect()`), Schlick Fresnel so it is almost invisible face-on
and strong at the frame's grazing edges, and smudges, cleaning streaks and dust. The dirt is sampled in world space and covers the whole
glazing exactly once (clamped, never repeated): mapped per pane it reset at the corner, and repeated it drew a hard line down the middle of
the frame.

`MeshPhysicalMaterial` with `transmission` is the physically complete option and was tried first: three renders the scene a second time into
a transmission target at reduced resolution, which softened the whole city through the pane and ignored the roughness map, at the cost of a
full extra pass. For a window you look *out* of, the reflection is the part that reads, and the view through it should stay sharp.

## Notes

- The page is `noindex`: it is a plate for a projector, not a page for search engines.
- Everything in the frame is procedural except the `.glb` models: the sky, the sun, the haze, the water, the beacons and the grade are
  shaders. Model credits are in the site's own list (`index.html`, `CREDIT_LINES`).

## Deploying

Pages is set to **Deploy from a branch: `main`, `/` (root)**, and `.nojekyll` keeps Pages from running the files through Jekyll.

If you would rather deploy with a workflow (so builds are logged and cancellable), the repo's `gh` token needs the `workflow` scope
(`gh auth refresh -h github.com -s workflow`) and then:

```yaml
# .github/workflows/pages.yml
name: Pages
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: . }
      - id: deployment
        uses: actions/deploy-pages@v4
```

…and switch Pages' source to GitHub Actions (`gh api -X PUT repos/vanushvee/hsc-sf-viz/pages -f build_type=workflow`).
