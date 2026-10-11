# MDHero Android port

This personal-use fork retains MDHero 0.2.10's Svelte 5 application, markdown-it
renderer, highlight.js, KaTeX, strict Mermaid rendering, DOMPurify configuration,
reader settings, themes and MIT attribution.

## Architecture

Android uses Tauri v2 with the distinct identifier `com.mdhero.android.personal`.
Desktop menus, CLI, window persistence, updater and filesystem watcher are desktop
only. A small local Tauri plugin implements Android's Storage Access Framework,
native printing, sharing, clipboard and document intents. Content URIs are opaque
document identities, never treated as filesystem paths or imported private copies.

The portrait interface reuses the reader, editor, home screen and dialogs with a
compact mobile toolbar, document selector, single-pane modes and ToC drawer.
Desktop split view remains available on desktop. Android document access is
bounded by OS grants and explicit user-selected folder trees; no broad storage
permission is requested.

## Reused systems and feature parity

The Markdown pipeline, KaTeX fonts, highlighting, Mermaid, frontmatter, GFM tables
and tasks, RTL detection, reading progress, search, settings, renderer, lightweight
textarea editor, presentation engine, home screen and original icons are reused.
Android styling is scoped to `html.android` in `src/android.css`; the existing
desktop CSS remains the design reference. Android uses one content pane with
Reader / Raw / Edit modes, a compact toolbar, document selector, ToC drawer and
reading preference sheet. Wide tables, code and diagrams scroll within the page.
Images and sanitized Mermaid diagrams open the zoomable image viewer.

| Original feature | Android adaptation |
| --- | --- |
| Local files / Open With | Native document picker and VIEW/SEND/SEND_MULTIPLE content intents |
| Multiple tabs | Touch document selector; each tab retains draft, reading position and editor caret |
| New / Paste / public URL | Original new-document, paste and URL flows; imported text can be edited and saved with the creation picker |
| Edit / Save / Save As | Same editor; original URI write when permitted, destination picker otherwise |
| Split preview | Reader/Edit switching; desktop split view remains available |
| Search / ToC / preferences | Original search engine, heading tracking and settings in mobile surfaces |
| Recent files / pinned folders | Persisted content URIs and tree grants, with original filenames |
| Copy | Native plain and HTML clipboard, including code-block copy |
| Share / reveal in file manager | Android share sheet; sharing current text creates an explicit temporary snapshot |
| Print / PDF | Android PrintManager and Save as PDF, using existing print CSS |
| Zen / Marp presentation | Portrait reading and slide surfaces; no orientation request |
| AI lookup | Explicit overflow custom-prompt action, original provider settings and external browser |
| External links | Existing system browser opener |
| Physical keyboard | Existing shortcuts; Escape follows the Android Back hierarchy |
| Desktop menus / updater / CLI / watchers | Desktop-only compilation and initialization |
| Finder Quick Look / Claude plan directory | Desktop-only; Android uses document intents, pasted Markdown and pinned folders |

AI actions use explicitly selected text and user-entered prompts. Reading a local
document does not automatically send its contents to an AI provider. Android
skips the desktop updater and its version-check request entirely.

## Files, grants and security

The local plugin at `src-tauri/plugins/android-documents` exposes a small Rust
allowlisted action dispatcher and Kotlin implementation. Opening a file does not
copy it into app-private storage: the `content://` identity stays in its tab and
recent history, and writes use ContentResolver on that same URI.

- File selection uses ACTION_OPEN_DOCUMENT; new files use ACTION_CREATE_DOCUMENT.
  Persistent read/write grants are taken when the provider permits them. Some
  external Open With providers grant access only for the current session.
- Text extensions are `.md`, `.markdown`, `.mdown`, `.mkd`, `.mdx`, `.txt` and
  `.text`. Native reads require a registered, user-granted URI and strict UTF-8.
  Invalid encodings and unsupported extensions produce an error.
- A selected folder tree is required for relative links/assets. Provider document
  IDs stay opaque; the bridge builds an in-tree name index using DocumentsContract.
  Normalized `..` paths may stay within the selected tree but cannot escape it.
  Absolute paths, injected URI schemes and mixed separators are rejected.
- Assets are image types only, bounded to 16 MiB and embedded as image data URLs.
  Linked Markdown opens in-app; supported linked images/PDFs use Android sharing.
- Local document reads are bounded to 64 MiB. Folder traversal is bounded to 32
  levels and 10,000 entries; large trees ask the user to choose a smaller folder.
- Save compares the current provider text with the tab's baseline before opening
  an output stream. A mismatch requires explicit overwrite confirmation or leaves
  the draft intact. Read-only, moved, deleted or inaccessible documents retain
  drafts and offer Save As / renewed selection.
- Android refreshes documents when the app resumes. There is no portable reliable
  cross-provider background file watcher. The save-time comparison still protects
  against changes made while MDHero remained in the foreground.
- The app requests INTERNET for explicit URL loading, external images and external
  actions, and no broad storage/media permissions. URL imports use HTTPS, bounded
  responses and redirect validation; local network addresses are rejected.
- Shared snapshots live only under the scoped private `cache/shared/` FileProvider
  directory. App backup is disabled. Signing keys and build artifacts are ignored.

The shared CSP, markdown-it HTML setting, DOMPurify pin/configuration and strict
Mermaid SVG sanitization are retained. The original desktop filesystem and asset
validation is untouched and continues to be covered by its regression tests.
Native Android grants enforce access independently of the WebView registry.

## Navigation, lifecycle and drafts

MainActivity and the manifest enforce portrait orientation. Android's
OnBackPressedDispatcher receives button and edge-gesture navigation, including
modern Back dispatch. Back closes the active overlay, ToC or search; exits
presentation/zen/edit/raw; returns a document to Home; then backgrounds the task.
It does not close dirty tabs or terminate the task. The keyboard consumes Back
first when Android's input method is visible. Closing a dirty tab separately uses
a native unsaved-change confirmation. Its Keep Editing action is the default;
Back and outside dismissal always retain edits. Discard/Overwrite require an
explicit button tap, rather than interpreting dialog cancellation as approval.

The editor uses the visual viewport and adjustResize for the software keyboard.
The toolbar's measured height accommodates font/display scaling. Android system
font scale is applied to WebView text, and all original reading preferences are
still available. Font/density configuration changes are handled in-place, and
system-bar icon appearance follows the reader theme.
The native navigation-bar inset also keeps statistics, drawers and mobile sheets
above Android's gesture/button navigation area.

The Android session backs up baseline text, unsaved edits, mode, caret, editor
scroll, reading position and active document. Backups are debounced by 250 ms and
flushed on visibility/pause. WebView storage is supplemented by a native AtomicFile
backup in private app storage so completed writes survive abrupt process death.
Draft backups are limited to 16 MiB; quota/storage failures visibly ask the user
to save. Backup restoration remains active even if ordinary desktop tab restoration
is disabled, to protect unsaved work. No backup is sent over the network.

If a URI can no longer be read at startup, its backup becomes an explicitly
recovered unsaved document. The user is told to select the original again or use
Save As. Clearing app data or uninstalling removes private draft backups; saved
provider documents remain in their chosen location.

## Build and desktop compatibility

Android has its own application identifier and capability file. Rust uses
`cfg(desktop)` for desktop commands, menus and watchers and target dependencies
for desktop plugins. Shared rendering and desktop split view stay intact.

The committed Gradle project supplies portrait/intents/backup configuration. The
build script handles Windows accounts without symlink rights by copying compiled
JNI libraries, strips only packaged symbols and makes a fresh signed APK archive.
The Windows harness-free menu test now declares its required Common Controls v6
manifest. The Quick Look Node build script's unused shebang was removed because
Vite's SSR transform inserted code before it on Windows; its actual Node-based
build and renderer parity tests pass.

See ANDROID_BUILD.md for reproducible builds/signing and ANDROID_TESTING.md for
what was actually verified, including limits of emulator-only validation.
