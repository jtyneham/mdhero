# MDHero Android document bridge

This private, local Tauri plugin uses ContentResolver and Android's Storage Access
Framework. It never converts content URIs to filesystem paths. Rust exposes one
allowlisted action dispatcher; Android checks the user-selected document registry
and Android's own URI grants on every document operation.

`DocumentsPlugin.kt` implements document/tree pickers, UTF-8 reads, conflict-aware
writes, folder-relative links/images, intents, clipboard, sharing, native printing,
Back and lifecycle events, public HTTPS fetching, and atomic private draft backup.
`DocumentPolicy.kt` bounds relative paths to the selected tree and is covered by
JUnit tests. See the repository's ANDROID_PORT.md for limits and security notes.
