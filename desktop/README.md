# Tartarus Optimized desktop overlay

Version 0.2.20-local.31, based on author revision 308b9479bcd0857a581a7e7b7917d0a8e0c5062e.

The Windows x64 installer and portable EXE include their own Electron, native
capture libraries, analyzer, Rust/WASM reader and Monte Carlo core, and English
OCR. Running the app needs neither the author's overlay, Node.js nor Rust.
Close the older overlay first. Settings and confirmations use the existing
%APPDATA%\Tartarus Overlay profile.

The bundled analyzer retains the http://localhost:8090 storage origin through
Electron session protocol interception. It opens no listening port and never
contacts an external server on that origin. An unrelated process already on
port 8090 is unaffected. --site-port=N changes only the virtual origin for
isolated development/tests.

## Calculation and corrections

Final-day continuation decisions retain pending gift combinations and waiting
event/office decisions. With one gift, all doors open and no remaining daily
actions, a usable Horn weakly dominates the other gifts for the Rainbow
objective and no longer depends on three lucky probes. Explicit gift ranks
remain respected. No extra simulation budget is added; the solver cache uses
the new rust31 namespace. Confirmation data and capture settings are preserved.

When background pixels keep moving, readiness requires three matching strong
semantic observations over at least 200ms instead of waiting for ambient motion
to freeze. The static pixel gate remains. Menu parsing is reused only when the
entire input region is byte-identical, including pixels above labels sampled
for card colours; the board, fit and warden are read fresh. Probe duration is
included in the 100ms cadence rather than followed by another 100ms delay.
Ordinary-board calibration survives a meal menu, but dimensions/fit/controls
and exact-bitmap handoff are still checked. The local log records only numeric
settling/probe reasons for each capture; screenshot recording remains off.

Worker handlers reject messages/errors from a terminated generation. A current
reader error terminates its worker, and leaving the mode clears reader/solver
failure flags so re-entry can restore accelerated processing. The full
calculation budgets are retained. The local.31 strategy uses a new cache
namespace. An actual packaged Electron stress check cancels imports, injects
an active failure and
delivers old errors after replacement, then requires WASM reading and a complete
solver pool with zero workers left after suspension.

Unknown day-one starting instrument offers now sample their own initial inmates
and day-one patrol, without replacing observed boards. Prey-link Consume costs
use actual survival probabilities, including Cage Fight and weighted beast rolls.
Adaptive gift sampling remains disabled after independent quality comparisons.
The sampler uses two integer-grid GPU draws; calibrated reads build only level
zero of the search pyramid. A probe timeout uses the normal bounded fallback,
then a fresh successful calibration permits recovery during the same run.

Each worker retains a Rust job containing the compact board, policy, bounded
chain cache and RNG. Full remaining-game playouts, engine actions, chain values,
instrument/gift choices and hidden-state prediction execute in Rust. The JSON
boundary is at job creation and incremental sample delivery, outside the
playout loop. Raw paired samples retain foreground/background stream behavior,
pause, promotion and patrol-family projection. Worker count still adapts to
logical processors (minus one, bounded to 1..16). Total calculation budgets
are unchanged. Loading/compatibility failure uses the JS reference implementation
with the complete budget. Renderer summaries and advice text remain in JS.

The analyzer correction board stays available on demand. A physical overlay
click on These are right survives progress updates. Noisy or missing icons,
including an incorrectly increased slot count, do not revoke a manual held-set
confirmation. A new observed offer, actual set edit or a new run invalidates it.
The confirmed set is also the one passed to simulation.

Capture, OCR, reader/solver workers and look-ahead stop outside the active board.
Forecast jobs resume exact partial streams and extend the two-action horizon
after each observed move. Cached advice requires an exact complete input key.
Strategy corrections use a new cache namespace, retaining saved settings and
instrument confirmations.

## Overlay-only distribution

Only analyzer/correction, capture, solver and reader dependencies are bundled.
The web simulator, canvas editor, guides, community board/report uploads and web
update polling are excluded. Direct capture uses no browser Follow discovery
channel or status polling interval. The author's binary auto-updater and its
package are removed. Read-only author-source update notices remain; they never
overwrite this fork. The debug button opens the local log. Optional local
recording/review remains available for troubleshooting and is off by default.
The first normal local.26 launch also disables the inherited record=true
default once; an explicit later opt-in survives restarts. Existing records are
neither scanned nor pruned while recording is disabled. Test/debug profiles
retain their requested recording settings.

## Build and run

Download an installer or Portable EXE from the fork's GitHub Releases page.
From a source checkout with Node.js 22.12+ and npm:

    .\Build-Standalone.cmd
    .\Start-Local-Overlay.cmd

The first command installs locked desktop build dependencies, stages only the
needed assets and offline OCR, generates x64 installer/portable executables,
and verifies their sources and hashes. The second prefers the built standalone
EXE. Build output is in desktop/dist. Executables are unsigned.

For UI source development, npm ci in desktop installs dependencies. Electron 44
uses an explicit node node_modules/electron/install.js for its development
runtime; packaging downloads its own Electron. Source launchers prefer that
project-owned runtime and retain a legacy installed-runtime fallback only for
old source workflows. Distributed EXEs never use it.

Precompiled js/solver-core.wasm and js/scan-kernels.wasm are versioned, so a normal
standalone build needs no Rust compiler. To modify the calculation core:

    rustup target add wasm32-unknown-unknown
    powershell -File tools/build-rust-solver.ps1

Add -Native to build the diagnostic CLI as well. Cargo.lock pins dependencies.
The solver build fingerprint records normalized Rust/data sources and the WASM
hash. Staging refuses stale binaries. Source fingerprints also prevent changes
made while packaging from silently entering an artifact with an old report.

## Verification

Use generated states and isolated profiles, never a real game:

    node tools/rust-solver-check.js --wasm
    node tools/rust-worker-check.js
    node tools/calculation-check.js
    node tools/desktop-settings-check.js
    node tools/solver-check.js
    node tools/bundled-site-check.js
    node tools/overlay-check.js --standalone "desktop/dist/builds/0.2.20-local.31/win-unpacked/Tartarus Optimized.exe"
    node tools/overlay-check.js --standalone "desktop/dist/builds/0.2.20-local.31/win-unpacked/Tartarus Optimized.exe" --instruments-only
    node tools/overlay-check.js --standalone "desktop/dist/builds/0.2.20-local.31/win-unpacked/Tartarus Optimized.exe" --forecast-only
    node tools/overlay-check.js --standalone "desktop/dist/builds/0.2.20-local.31/win-unpacked/Tartarus Optimized.exe" --rust-bench
    node tools/standalone-smoke.js

Differential checks compare full seeded trajectories, action legality, state and
RNG after each move, raw Monte Carlo samples and rankings. Additional checks
cover actual WASM worker cancellation/promotion, full calculation budgets,
confirmation/cached advice across reload and restart, and idle cleanup. The
portable smoke test launches the distributed EXE from an unrelated directory,
blocks external HTTP, makes original-install paths unavailable and leaves an
unrelated listener on the same origin port untouched. It sends no game input.

Timing reports in tools/results distinguish warm single-worker calculation
from screen capture/OCR, game animation, parallel scheduling and real-game
profit. Installer generation is tested; tests never install it into the user's
account or change that account's startup settings.
