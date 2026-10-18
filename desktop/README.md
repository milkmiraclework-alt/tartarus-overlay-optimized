# Tartarus Overlay (desktop app, local only for now)

The optimized local build is `0.2.17-local.16`, based on the author's source
revision `f35a50a96976bdc3b577a4f7b5655cebda9ba1b7` (18 October 2026).
`lib/upstream-version.json` records the imported revision: the Git branch HEAD
can still be older while local changes are being developed. Source changes
are checked asynchronously at startup and every six hours; a notice links to
the author's diff without downloading or overwriting the local build.

The integration includes second meals at every rarity, the 10-Rainbow cap,
Opulence's gift chain, corrected Muzzle/Instigate/Usurpation rules, Extra
Portion, the Trap's Hunt, updated instrument-pair measurements and strategy,
objective progress, meal-screen rarities/padlocks, multilingual doors,
variable-size offers and start-card badges. The obsolete simulated contract
challenge was removed with its upstream engine/analyzer UI. Full-budget Monte
Carlo, exact cached summaries, partial forecast promotion, parallel readers,
confirmed local panel references and idle cleanup remain in the local build;
the author's 700 ms early-stop policy is not enabled. Native title lookup
replaces repeated Chromium window enumeration outside capture setup.

Auto Screenshot Mode as a Windows app, with the board analyzer's advice in a small
always-on-top card over the game, so one monitor is enough.

## How it's built

The local launcher uses `--fast`: one background analysis runtime and the
overlay, with a small settings window and board correction opened on demand.
The installed application's ordinary shortcut still uses the public website
and the original two-page mode. Both use the same rules and solver.

In fast mode, `lib/fast-runtime.js` connects capture directly to the reader
and structured advice API. `lib/log-watch.js` wakes the bounded log reader on
Windows file-change events, retaining a polling backup for log rotation.
Frames go to the reader as transferable ImageBitmaps; 4K resizing retains the
original pixel values. The reader shares its blur pass and visits pixels by
rows. Intermediate captures are coalesced, old calculations are cancelled,
and background board/results rendering is suspended. Unchanged automatic
boards reuse completed full-budget results from a bounded history; manual
Recheck still starts a fresh check. Each animation trigger arms its original
fallback deadline; a verified ready screen may release it early. A later
shorter trigger does not restart an earlier longer interval. Capture uses a
30 fps window stream only while the prison screen is active; optional
screenshot recording runs after reading/advice, outside the critical path.
Leaving the board, opening Riot, changing maps or closing the game stops the
stream and terminates solver, reader, readiness and OCR workers. Stored frame
references and in-memory patrol tables are released. Consent alone keeps only
log detection running. A 30-second activity timeout covers missed exit events;
the next board event or manual Picture request reconnects and warms workers.
Late capture connections and cancelled reads cannot restart work after exit.
On systems with at least four logical cores, the exhaustive board search
uses 2–4 persistent helper workers, copying only the small pyramid levels
for that stage. The same helpers then read doors/days, instruments and the
vault concurrently while the reader handles cells and the warden. Panel
jobs retain the original pixels. Candidate scores and tie ordering stay
identical; unavailable helpers fall back to the serial reader. Reading and
calculation workers are warmed during capture setup and reused across frames.
Text readers build their masks with a direct pixel loop and reuse the same
region's luminance within each four-radius contrast sweep. Every new read
prepares fresh pixels; contrast thresholds and glyph grouping are unchanged.
Fast mode retains the last calibrated layout, validates its reference match
on every frame, and reacquires it after movement, resizing, uncertain reads,
16 frames or 30 seconds. Unchanged panels are reused only after exact RGBA
region comparisons; inmates, warden and events are read fresh. A separate
readiness worker may end board animation waits early after detecting a
changed, stable screen with recognized action controls. It requires three
observations across 200 ms and keeps the original deadline as fallback.
Other screen types retain their original waits. Timing records expose both
early captures and layout/panel reuse for measuring real game sessions.
When only one move is legal, the existing zero-playout result is finalized
immediately without a worker round trip. Multi-option checks keep their
full rollout budget and random streams.
Inside simulations, legality checks avoid temporary diet arrays and stop
at the first match when only meal existence is needed. Gift trials reuse
the tier scale and recalculate only the Rainbow shipping value, avoiding
unrelated strategy-context construction for each trial.
The Monte Carlo loop prepares fixed strategy/tier/door data once per slice
and shares read-only rule/contract definitions between private trial states.
Changing game state remains isolated. Populated boards with branching chain
rules reuse bounded, exact chain values across trials (8,192 values, 256
partitions per job); tools, rule modes, Rainbow value and composition are
accounted for, and strategy changes invalidate affected tables. Simple chains
retain their local memo. Full sample counts, random streams and rankings
remain unchanged.
`js/solver-cache.js` retains up to 256 completed summaries (an estimated
8 MiB of keys/results), with exact canonical keys for the normalized board
and rollout target. The asset version namespaces the cache. IndexedDB loads
and writes it asynchronously; entries expire seven days after calculation.
Board, instrument-offer and treasure automation can reuse it, including
after restarting the app. Changed inputs and incomplete/reduced-budget
checks do not reuse a stored result. Cache hits are recorded with timings;
`TartarusAnalyzer.cacheInfo()` exposes counts for local diagnostics.
After advice is finalized, fast mode uses the idle solver workers to prepare
the next position. It samples 48 outcomes of the recommended action, prioritizes
up to four distinct visible outcomes, and can continue one more action ahead.
Each confirmed board starts at most eight candidate checks. The planner
restarts its two-action horizon after every confirmed move: an already cached
intermediate step is followed to its successor, so preparation does not wait
for both previously prepared moves to be played. Background jobs
use 8 ms slices separated by 24 ms idle gaps and pause for frame recognition.
They retain the ordinary complete rollout budget. Completed predictions enter
the same bounded cache; only an exact match of the newly read normalized model
and budget can use one. A matching unfinished job is promoted to normal-speed
calculation with its existing samples intact. Different observations cancel
the remaining speculative work. Manual Recheck bypasses predictions, and
disabling capture stops them. Instrument offers, event dialogs and delivery
windows keep the normal calculation path. `forecastHit`, `forecastResumed`
and forecast counters are included in timing records; `forecastInfo()` exposes
the same activity locally. These calculations never issue game input.
Next-day patrol forecasts share one six-direction sample table across the
random offered-door menus, with up to eight tables retained in memory. Every
other normalized input must match. Actual doors select the corresponding rows;
an unfinished table can drop the other rows and continue without losing rounds.
Forced end-of-day transitions and an optional Consume after Replace are
included. `familyHits`/`familyResumed` in timing records distinguish this reuse.
The original screen wait is still separate from the calculation; a fast cache
lookup alone does not measure the full time until advice appears.
The card distinguishes waiting for the game screen, reading its picture and
calculating advice. A manual recheck warning is shown for a stale board once
no automatic capture/read is pending; old advice stays hidden during updates.
Instrument confirmation saves the exact held set and observed panel size with
the board. Later ambiguous icons cannot undo that confirmation, including after
reload. A new offer, changed held set, extra slot or new run requires a fresh
check. Pending offers survive incomplete panel reads; an assumed advised item
is explicitly marked for confirmation. Recognition metadata is excluded from
Monte Carlo cache keys, while actual held instruments remain part of the key.
Supplemental Crown and Claws panel references come from confirmed local images;
their simulator names are available to both worker and fallback readers.

The public-site mode loads `follow.html` and `analyze.html`, so site fixes
reach that mode on reload. What the shell adds:

| Piece | What it does |
|---|---|
| `main.js` | Finds `UE_game.log` (Steam's libraries via the registry and `libraryfolders.vdf`, app 1974050; the launcher's default folder; or one the player chose). Finds the game window by its title (`Torchlight: Infinite`), and answers follow.html's window share with that window only, with no picker. Shows the overlay while the game is in front. Tray menu, hotkeys, site and app updates. |
| `preload.js` | `window.TartarusDesktop` for the two site pages. The shell checks which page asks: only follow.html can read the log. |
| `lib/follow-adapter.js` | Put into follow.html. Hands the log to `TartarusCapture.useHandle` and calls `TartarusCapture.connectWindow()` while the game runs, after the player has agreed on that page. The triggers, the agreement and the checks are the site's own code. |
| `lib/analyzer-adapter.js` | Put into analyze.html. Copies the results panel's text to the overlay, and presses the analyzer's buttons for the overlay's (Fix, Recheck, Report). |
| `lib/overlay.*` | The card over the game. |

Pictures and the log never leave the PC. Boards and reports are shared exactly
as on the website, by the website's code (a local `--site` never shares boards).

**The site contract:** the analyzer adapter reads analyze.html's results panel
by its ids and a few phrases (listed at the top of `lib/analyzer-adapter.js`).
If those change on the site, update the adapter too, or the overlay goes quiet.

## Run it

To use an installed Windows overlay with the optimized code in this checkout,
quit any running overlay from its tray menu and double-click
`Start-Local-Overlay.cmd` in the repository root. It starts the local server,
checks that it serves this checkout's solver, and launches the local app
with `--fast --site=http://localhost:8090/`. On first use it copies the installed
Electron runtime to `desktop/dist/local-runtime/` and creates a small bootstrap
that loads this checkout's `desktop/main.js`. Dependencies are resolved from
the installed app; its files are unchanged. The launcher runs in the background;
quitting the overlay stops the server that the launcher started. There is no need to
install Node, npm dependencies or rebuild the app: the installed Electron
supplies the runtime. Start with this file each time to use local changes;
the ordinary installed shortcut continues to load the public site.

The default install path is
`%LOCALAPPDATA%\Programs\tartarus-overlay\Tartarus Overlay.exe`.
For another location, set `TARTARUS_OVERLAY_EXE` to that executable's path.
`Start-Local-Overlay.cmd --check` verifies the local files without opening the
overlay. Use `--console` to keep a diagnostic console open. Background startup
logs are in `desktop/dist/local-launch.log` and `local-launch-error.log`.
After code changes, restart this launcher or reload the app's pages.

For development from source instead:

```
npm install            # once
npm start              # against the live site
npm run local          # fast mode; first run node tools/serve.js --port 8090
```

VS Code's terminal sets `ELECTRON_RUN_AS_NODE=1`; unset it first if Electron
says it can't find the module `electron`.

Hotkeys: Ctrl+Alt+O show/hide the overlay · Ctrl+Alt+A board analyzer ·
Ctrl+Alt+P take a picture now. The card's "–" folds it to a thin bar, and
the Riot's fight folds it by itself.

Run the game **borderless or windowed**: nothing can draw over exclusive
fullscreen, and a shared window there looks black.

## Updates

The optimized launcher serves this checkout locally. Updating the author's
public site does not change its solver or reader. Fast mode checks the
author's GitHub commit at startup and every six hours and offers a comparison
link. It never downloads or installs the author's executable over this build.
The imported rule revision is pinned in `lib/upstream-version.json`; changes
must be integrated and checked against the local optimizations.

The ordinary installed application is separate and retains its own updater.
This fork removes the `npm run release` command and the original author's
publication target. Publishing a source fork does not upload an installer.

## Build

`npm run dist` makes `dist/Tartarus-Overlay-Setup-<version>.exe` (per-user
install, no admin). This packages the Electron shell; the supported optimized
source workflow is `Start-Local-Overlay.cmd`, which also serves the checkout's
reader/solver assets. A standalone optimized installer needs those assets and
a fork-specific update feed before it can be distributed.

## Test

`node tools/overlay-check.js` (Node 22+ and an installed overlay) exercises the
real Electron app with an isolated profile, a fake game window and log. It
checks native log wakeups, real window capture, exact reader pixels at 1080p
and 4K, superseded frames, recording, full-budget advice delivery, compact
settings and on-demand board correction. It closes its app/server afterwards.
`node tools/capture-check.js` covers log-reader races, bounded reads, partial
lines, rotation, stop cleanup, overlapping animation deadlines and capture
connection/stop races. The Electron check repeats board entry/exit and verifies
that capture stays off, every owned worker terminates and frames are released.
`node tools/forecast-check.js` checks bounded outcome sampling and exact
worker samples across pause, promotion and cancellation, plus runtime idle,
menu, combat, map-change and game-close transitions. Add `--forecast` to
`overlay-check.js` for controlled observations through the real analyzer,
including completed reuse, partial promotion, changed-board fallback and
disabled-capture cleanup.
`node tools/instruments-check.js` covers confirmation lifetime, actual solver
instruments, incomplete offers and cache keys. `node tools/overlay-check.js
--instruments-only` checks the real confirmation button and subsequent frames
across reload. `node tools/panel-learn.js manifest.json [--check]` builds compact
references from explicitly labeled local images or tests separate held-out
frames; the raw screenshots remain outside the repository.

The scratch test (`desktop-test/run.mjs` in the session scratchpad) runs the
whole loop without the real game: a stand-in window titled "Tartarus Test Game"
off-screen showing a board screenshot, a fake log, `--game-title`, `--log`,
`--user-data` and `--remote-debugging-port`, driven over the DevTools protocol.
