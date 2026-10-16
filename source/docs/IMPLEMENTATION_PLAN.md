# Implementation Plan — Persistent Cache + Fast Upload (ordered)

## Step 1 — Cache keyed on ALL build inputs (done)
`www/blocklyduino/js/robosiddhi_build.js` (pure, unit-tested):
- `CACHE_SCHEMA = 2`, `cacheKey({codeHash, fqbn, coreVersion, cliVersion, flags, libVersions})`.
- `validateCacheEntry(entry, current, binSha256)` → `{ok, reason}` — rejects schema
  mismatch, fqbn change, code change, core/CLI change, missing/corrupt binary.
- `compileCommand` / `uploadCommand` extended with `{buildPath, inputDir, uploadSpeed}`.

## Step 2 — Backend cache manager (done, `main.js`)
- `cache.json` per board dir: schema, fqbn, codeHash, coreVersion, cliVersion,
  bin name + sha256, builtAt, flags. Versions resolved via CLI once per session.
- `rs-upload`: cache HIT only when entry validates AND binary hash verifies;
  else compile → validate → cache → upload. Never marks failed builds valid.
- Upload mutex per port (duplicate uploads rejected with clear error).
- Serial Monitor port auto-closed before flashing (reported in output).
- Optional `uploadSpeed` (validated against BAUDS) via `--upload-property upload.speed=`.
- `rs-cache-clear` (wipes build dirs + tmp, reports bytes), `rs-cache-status` (lists entries).
- Per-phase timings (`compileMs`, `uploadMs`) + `cache:'hit'|'miss-…'` in results.

## Step 3 — Renderer: diagnostics + actions (done)
- `IDE_functions.js`: timing/cache line rendered after verify/upload
  (`cache HIT/MISS + compile/upload ms`); monitor-closed notice shown.
- `preload.js` + `CLI_functions.js`: `cacheStatus()`, `cacheClear()` wired to the
  existing CLI panel buttons (Cache status shows entries; Clear cache wipes builds).
- New tests in `tests/run_tests.js` for key/validation/commands.

## Step 4 — Measure (partially runnable here)
- Cold vs warm compile timing on this machine: `docs/PERFORMANCE_BASELINE.md`.
- Upload/flash timings: NOT RUN (no hardware attached) — must be measured on ESP32.

## Step 5 — Ship
- `npm test` green → `npm run compile` → copy fresh exe to `robosiddhi esp/` →
  push both repos.

## Explicitly NOT implemented (by design)
- Runtime interpreter mode, Stop/Run-existing-program buttons, partial flashing,
  skipping bootloader/partition steps, fixed "2-second" promises.
