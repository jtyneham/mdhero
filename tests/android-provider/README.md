# External provider regression fixture

This is a **separate test APK**, never part of the MDHero APK. Its private,
grant-enabled content provider models a file manager rather than a SAF
DocumentsProvider. It ignores `COLUMN_FLAGS`, and can return missing columns,
empty cursors or unsupported metadata projections while still serving UTF-8
Markdown. It also supplies read-only grants and an unavailable source.

Use an isolated emulator. From the repository root, with the Android SDK and
JDK configured as in `ANDROID_BUILD.md`:

```sh
src-tauri/gen/android/gradlew -p tests/android-provider assembleDebug
adb install -r artifacts/MDHero-Android-debug.apk
adb install -r artifacts/provider-build/outputs/apk/debug/MDHeroProviderRegression-debug.apk
node scripts/android-open-with-smoke.mjs
```

On Windows use `gradlew.bat`. Set `ANDROID_SERIAL` to select the emulator.
The script edits only the fixture provider's private test files and MDHero's
emulator session. It exercises cold/warm ACTION_VIEW, ACTION_SEND, URI grants,
same-URI saves, optional metadata, quick/full app switches, failed-open recovery
and actual background process eviction. It refuses physical device serials.
Screenshots and assertion results are saved under ignored `artifacts/`.
