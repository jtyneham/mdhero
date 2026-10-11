# Android verification

Executed locally on 2026-10-11. The delivered APK was built from this fork, not
from a demo server. It was installed and launched in a dedicated, headless
`MDHero_Port_API36` Android 16 / API 36 Google APIs x86_64 emulator.

## Automated results

| Check | Result |
| --- | --- |
| `npm run check` | 0 errors; 6 non-blocking existing component warnings |
| `npm test` | 26 files, 212 tests passed |
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

Additional completed provider operations:

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

## Delivered artifact

```
C:\Users\Haizara H5\Documents\GitHub\mdhero\artifacts\MDHero-Android-debug.apk
```

57,607,177 bytes (about 55 MiB). SHA-256:

```
d159a3ccc85a458272d3b1d6a7a2417e1bfb2ee623e66630b689a864e14b2871
```

This debug-signed universal APK includes embedded frontend assets and both
ARM64 phone and x86_64 emulator libraries. Packaging copies are stripped; Cargo
debug symbols remain in ignored local build directories.

## Validation limits and platform differences

- Runtime verification used x86_64 emulation. ARM64 compiled and is present in
  the signed APK, but no physical ARM64 phone was available for execution.
- Minimum Android API 26 compatibility is configured; only API 36 was exercised.
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
  local APK delivery does not depend on a successful CI run.

Build, signing and installation details are in ANDROID_BUILD.md. Design and
security boundaries are documented in ANDROID_PORT.md.
