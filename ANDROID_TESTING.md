# Android verification

Executed locally on 2026-10-11. The delivered APK was built from this fork, not
from a demo server. Initial validation used a dedicated, headless
`MDHero_Port_API36` Android 16 / API 36 Google APIs x86_64 emulator. The Open With
replacement APK was installed and verified in `MDHero_OpenWith_API37`, a separate
Android 17 / API 37 Google APIs x86_64 emulator.

## Automated results

| Check | Result |
| --- | --- |
| `npm run check` | 0 errors; 6 non-blocking existing component warnings |
| `npm test` | 26 files, 214 tests passed |
| Desktop `cargo check --lib` | Passed |
| `cargo test --lib --test menu_window` | 21 Rust tests passed; Windows menu integration assertions passed |
| Native `DocumentPolicyTest` | 6 JUnit tests passed, 0 failures/errors |
| ARM64 and x86_64 native compilation | Passed |
| Full `npm run android:build` | Passed, including Gradle universal debug packaging |
| `apksigner verify --verbose` | Valid APK Signature Scheme v2 debug signature |
| `aapt dump badging` | ID `com.mdhero.android.personal`, version 0.2.10, min API 26, target API 36, ARM64 + x86_64 |
| `adb install -r` and launch | Passed |

Frontend tests retain original security, Quick Look renderer parity, RTL,
highlighting, settings, slides, search, tab/editor and watcher coverage. New
Android tests verify opaque content URIs, expected-version writes, dirty preview
preservation on reload/reopen, caret restoration and inaccessible URI handling.
Native path tests reject absolute paths, tree escape, URI injection and mixed
separators while permitting valid in-tree sibling/parent links.

The Windows menu test initially could not load TaskDialogIndirect without a
Common Controls v6 manifest. Its test-specific manifest was added and the test
then passed. Windows Vite's Quick Look SSR shebang parsing was also fixed and its
existing bundle parity tests pass.

## Installed-app integration checks

`node scripts/android-smoke.mjs --prepare` passes 24 assertions against the actual
debug WebView/native plugin. It opens the fixture through Android's system picker
and covers:

- Offline Markdown, tables, highlighted code, KaTeX, Mermaid, multilingual text
  and inert untrusted HTML/javascript links.
- Portrait page bounds, Raw/Edit modes, dirty indication and Back-to-reader
  without discarding edits.
- Original content-URI saves, stale-baseline rejection and rejection of
  unselected content URIs.
- Search highlights, ToC opening/Back closure and original reading controls.
- Dark theme and an actual Android edge Back swipe closing overflow.
- Folder-tree grants, Markdown enumeration, local relative images/lightbox and
  linked Markdown opening another document.
- Native atomic draft backup, forced process stop/restart, restored editing mode,
  unsaved text, persistent appearance and recent documents.

`node scripts/android-layout-smoke.mjs` covers native portrait orientation under
device rotation changes, 320dp width, 130% system font scale, a real software
keyboard, editor sizing/focus, physical Escape, dirty-close native confirmation,
Back cancellation retaining edits, the share chooser, native Print / Save PDF,
and native Save As cancellation. The script restores the emulator's display,
font and rotation settings on completion.

The final installed APK passed all **38** scripted document/layout assertions
(24 document/rendering checks and 14 layout/native checks) on API 37, in addition
to the 20 external-provider/lifecycle assertions below. The original API 36
validation also passed the 38 document/layout assertions.

Additional completed provider operations:

- Android's real file manager and Open With chooser opened `external.txt` in
  MDHero. Its provider grant permitted an exact-byte original-file write.
- Explicit public HTTPS loading downloaded Markdown through the native bridge.
- Moving an open source file, then force-stopping/restarting, restored its draft
  as a dirty `new://recovered-…` document with Save As available.
- With emulator Wi-Fi/data disabled, local Markdown, KaTeX, Mermaid and the
  granted-folder image still rendered successfully.
- A 460,024-character new document was edited and atomically backed up in
  1,164 ms including the 800 ms test debounce wait; its 5,000-paragraph preview
  rendered successfully. This is a smoke performance check, not a benchmark.
- Save As created `guide-copy.md` in the selected folder with the unsaved draft,
  rebound the active content URI and cleared its dirty indicator.
- Android Save as PDF exported `mdhero-verification.pdf`: 209,792 bytes, valid
  `%PDF-1.4` header, six-page native preview. No physical printer job was sent.

Screenshots of the installed home/reader/editor, 320dp viewport, software keyboard
and native print preview were inspected. MDHero's original colors, typography,
Markdown styling and icons remain recognizable. Font/density changes are now
handled without recreating the Tauri activity, and native status icons follow the
reader theme.

## Reproduce emulator checks

Install the debug APK and boot an isolated API 36 x86_64 emulator. Set
`ANDROID_HOME`, optionally `ANDROID_SERIAL` (default `emulator-5554`), then run:

```sh
adb install -r artifacts/MDHero-Android-debug.apk
adb shell am start -n com.mdhero.android.personal/.MainActivity
node scripts/android-smoke.mjs --prepare
node scripts/android-layout-smoke.mjs
```

`--prepare` **clears only this app's data on the isolated emulator**, pushes test
documents under `Download/MDHeroTests` and navigates the real Android pickers.
The scripts refuse a non-emulator serial. They edit these test documents and use
debug WebView CDP plus adb input/uiautomator; no production automation API or
hidden test-only application functionality is included. Native picker labels
assume English and the standard Google DocumentsUI provider.

Logs, JSON results, screenshots and the test PDF are local ignored `artifacts/`
outputs. Android build JUnit XML is under the plugin's ignored `android/build/`.

## Open With and return-to-app regression (2026-10-11)

A Pixel 9a / Android 17 / Files by Google 1.12735 report exposed a provider
compatibility error. The exact `Couldn't read row 0, col 0 from CursorWindow`
message was reproduced with a separate provider that ignores DocumentsProvider
`COLUMN_FLAGS`. The native bridge now checks returned column names, treats
metadata as optional, and uses actual OS URI grants for write capability.
Reading/stat/writing still require real provider stream access. Opaque names
can be accepted with a supported text MIME type; no private copy is substituted.

The current Tauri activity defines but does not register its plugin process
lifecycle observer. The document plugin now observes the activity directly for
pause/resume. MainActivity retains the latest intent, and the plugin no longer
clears its action. Window focus restores the WebView's resumed state/layout and
invalidates its surface without reloading or discarding edits.

Real background process eviction also exposed a stale Reader preview after
restoring the final active dirty tab. Restoration now explicitly repaints the
active draft. Two frontend tests cover this and expired-grant recovery.

`tests/android-provider` builds a separately installed fixture APK, excluded
from MDHero. `scripts/android-open-with-smoke.mjs` exercises cold/warm Open With,
ACTION_SEND, absent/empty/unsupported metadata, real read-only grants and
same-URI writes, quick/full app switches, recovery after an unavailable source,
and background process eviction without force-stopping to recover. Its README
contains build/install instructions. The fixture reproduced the original error
on API 36; the fix also runs on a dedicated Android 17 / API 37 emulator.
The final APK passed all **20** provider/lifecycle assertions on API 37,
including recovery after a real background app-process kill. The earlier API 36
run passed the initial 14 checks; the expanded recovery cases were added during
API 37 testing. The new two frontend tests bring the suite to 214.

The physical Pixel and exact Files by Google build are not connected here. The
reported full black screen was not reproduced on the emulator; activity/resume
and dirty-preview recovery failures were reproduced and corrected. Device
confirmation remains necessary for any device/WebView-specific surface issue.

## Delivered artifact

```
C:\Users\Haizara H5\Documents\GitHub\mdhero\artifacts\MDHero-Android-debug.apk
```

57,607,177 bytes (about 55 MiB). SHA-256:

```
0b197e05f72d70d71250a2996f23d9cbad1f654f5e2ecd259acde93148930bcf
```

This debug-signed universal APK includes embedded frontend assets and both
ARM64 phone and x86_64 emulator libraries. Packaging copies are stripped; Cargo
debug symbols remain in ignored local build directories.
An identical copy is delivered as `artifacts/MDHero-Android-open-with-fix.apk`
to distinguish it from the original APK. Both hashes and signatures were
verified; installation over the prior build succeeded without clearing data.

## Validation limits and platform differences

- Runtime verification used x86_64 emulation. ARM64 compiled and is present in
  the signed APK, but no physical ARM64 phone was available for execution.
- Minimum Android API 26 compatibility is configured; API 36 and API 37 were exercised.
  Third-party/cloud document providers and OEM keyboards/printers need device
  testing beyond the stock provider and keyboard used here.
- Predictive Back dispatch is enabled through AndroidX; custom animated previews
  of each WebView overlay are not implemented.
- Android uses resume-time refresh and save-time conflict checks rather than
  desktop filesystem watching. Providers may revoke/expire grants; reselect the
  document or Save As from a recovered draft. Folder grants are needed for local
  relatives. Unpinning hides a folder; OS grants can be removed in Android's app
  settings.
- Backups are debounced, so an immediate process kill before a pending backup
  finishes can lose the last fraction of a second of typing. Backup quota/storage
  failures are shown; completed atomic backups survive the tested forced restart.
- URL imports require public HTTPS. External images/AI actions need connectivity;
  local documents, bundled fonts, equations and diagrams work offline.
- Release signing, store distribution, physical printing, macOS/Linux GUI
  execution and cloud/OEM provider interoperability were not tested. Desktop
  unit/compilation and the Windows menu checks passed.
- The GitHub Actions workflow is supplied as a second reproducible build path;
  local APK delivery does not depend on a successful CI run. The first run failed
  because setup-android's default requested the removed `tools` SDK package. The
  workflow now installs `platform-tools` explicitly. The corrected
  [CI run](https://github.com/jtyneham/mdhero/actions/runs/38154581877) passed
  frontend checks/tests, both native builds, JUnit tests and APK upload. The local
  delivery APK additionally includes the navigation-bar inset adjustment and
  Open With/lifecycle/draft-preview corrections documented above.

Build, signing and installation details are in ANDROID_BUILD.md. Design and
security boundaries are documented in ANDROID_PORT.md.
