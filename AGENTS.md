# AGENTS.md — hsc-sf-viz

Instructions for AI coding agents working in this repo.

## What this is

The window out of the hscompute.com desk, on its own: a WebGL plate for a projector (or a TouchDesigner Web Render TOP), with nothing of the
page on it — no HUD, no cursor, no room furniture unless asked for. It is the site's own scene code and the site's own `.glb`s, lifted out and
pointed at a bare canvas.

Live: <https://vanushvee.github.io/hsc-sf-viz/> — GitHub Pages, published from `main` at the repo root.

Origin: the `plate/` folder of the hscompute.com repo (`~/repos/trading_floor_event`, branch `dev/vaswaniv/room-proj`). **This repo is the
canonical copy now**; do not sync changes back and forth by hand.

## Stack (deliberately minimal — do not add dependencies)

- **No build step, no npm dependencies, no framework.** One static page: `index.html` plus ES modules. GitHub Pages serves it as it is.
- **three.js is vendored and pinned**: `vendor/three` is a snapshot of **0.170.0** (`vendor/three/SOURCE.json` lists the files and hashes).
  Addons are reached through the import map in `index.html` (`three`, `three/addons/`). Do not upgrade three casually: the skyline GLBs are
  meshopt + quantised, the site's shader snippets and the bake patch assume this version.
- **No software-GL fallback, by design.** A software renderer would be a slideshow; if WebGL is missing the page stays black and says so in
  the console.
- Everything is a function of `t`. There is no wall clock in the scene, so a still is reproducible (see *Determinism*).

## Files

```
index.html     the page: import map, the canvas, the fade-up veil
plate.js       params (all of them), renderer, camera + parallax dolly, the post chain, the lens flare, the loop, window.plate
sky.js         the dusk sky shader, the sun, the three skyline layers and their haze, the beacon clock
desk.js        the room (floor, wall, mullions, glass), the desk with its keyboard, in-tray, palm, lamp, Mac, the lights
glass.js       the window pane: Fresnel, the reflected interior, smudges and streaks
birds.js       the flock: Reynolds boids with topological neighbours, one instanced silhouette bird
models/        desk, mac, intray, lamp, plant, skyline-fg/-mg/-bg, bake-desk.webp — copied from the site repo, not authored here
vendor/three/  three.js 0.170.0 + the addons used
stills/        two rendered plates, for a poster or a fallback
```

## Scenes and the main parameters

`?scene=room` (default) · `?scene=desk` · `?scene=sky`. Everything is optional and documented in `README.md`; the ones that get used:

```
?parallax=0.2      metres the eye dollies across the glass per cycle (the motion)
?panTime=82        seconds per cycle
?back=0.3          metres the eye sits back from the site's seat
?dirty=0..100      how dirty the pane is        ?flare=0..100   the lens flare
?laser=0..100     the beam off the Pyramid, 0 = off (default)
?birds=130         the flock's size, 0 = none   ?bird=%23ece7dc the birds' colour
?haze=3.5          the skyline's per-layer haze density
?still=1&t=42      one deterministic frame      ?hud=1          fps and resolution
```

## Decisions already made — do not relitigate

Each of these was arrived at by breaking something. The code comments record the failure; keep them.

- **The pane is not `MeshPhysicalMaterial` with `transmission`.** That was tried: three re-renders the scene into a transmission target at
  reduced resolution, which softens the whole city behind the pane and ignores the roughness map, at the cost of a second scene pass per
  frame. For a window you look *out* of, the reflection is the part that reads and the view through it should stay sharp. `glass.js` is a
  reflection-first transparent pane instead.
- **The pane's dirt is sampled in world space and covers the glazing exactly once** (`ClampToEdgeWrapping`, no repeat). Mapped per pane it
  reset at the corner where the two panes meet; repeated, it stepped at every tile boundary and drew a hard line down the middle of the frame.
  There is no per-pane edge tint either — that put two bands on the corner.
- **No dust specks in the dirt map**: stretched over the whole glazing a single bright texel becomes a centimetre-wide dot that reads as a
  stray light. Fine low-amplitude mottle instead.
- **Flare ghosts are gaussian and faint**, a soft out-of-focus disc, never a `smoothstep` ring: a hard rim reads as a perfect drawn circle
  sitting in the sky.
- **Birds use topological neighbours** (each follows its 7 nearest, Ballerini et al. 2008), not a radius. A radius fragments a large flock into
  local clumps. Speeds and forces are deliberately gentle: faster, harder-turning tuning read as violent.
- **In parallax mode the skyline layers do not get the site's fake per-layer rotation** (`k` in `updateLayers`). The dolly moves the eye and
  the layers' real depth does the work; rotating them as well doubles the effect.
- **The camera dollies, it does not pan.** `?pan=` still turns the head if asked, but the motion is a lateral travel with a counter-turn at the
  midground's distance, so the near city slides against the far shore and the frame does not slide off its subject.

## Determinism

`window.plate.render(t)` draws the scene at an absolute second; nothing else reads a clock. The flock (seeded RNG, fixed 30 Hz steps) and the
beacon (hashed cycle index) are both functions of `t`, so `?still=1&t=42` is the same frame every time. Keep it that way: a test or a poster
depends on it.

## Commands

```sh
npx serve .                       # or: python3 -m http.server 8010
open http://localhost:8010/                     # the room, the flock, the city
open "http://localhost:8010/?scene=desk"        # the desk scene
open "http://localhost:8010/?still=1&t=42"      # one frame, deterministic
```

There is no test suite and no linter. The check is: it renders, and the frame matches what the change was for. Serve over HTTP — `file://`
blocks ES modules and the model fetches.

## Deployment

Pages is set to **Deploy from a branch: `main`, `/`**, with `.nojekyll` so Pages does not run the files through Jekyll. Push to `main`; the
build takes about a minute.

The `gh` token in this environment has only `gist, read:org, repo` scope, so it **cannot push a workflow file** — that is why deployment is
branch-based rather than an Actions workflow. The workflow to switch to, and the two commands, are written out in `README.md` (*Deploying*).

## Conventions

- **Version the modules**: every file starts with `// name vMAJOR.MINOR.PATCH (date): what it is`, bumped when the file changes. Same for
  `README.md` (an HTML comment).
- **Comment the why, with the failure that motivated it.** That is the house style here and in the site repo: a parameter is not "5", it is
  "5, because 3 made the flock knot". Decisions that cost a debugging session go in the header or next to the code, not only in the commit.
- **Keep the picture the site's.** Values come from the hscompute.com scene (line numbers are cited in the module headers); when in doubt,
  match the site rather than inventing a look.
- **Asset provenance.** The models and `vendor/three` are copied from the site repo (whose credits list the licences); do not re-export or
  re-author them here. If the site's models change, copy them again and note it.
- **Never leave a black rectangle.** The fade-up veil is lifted on a failed build (`data-failed`), and `?still=1` skips it entirely; keep
  both paths working.
