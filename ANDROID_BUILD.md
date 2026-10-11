# Building and installing MDHero for Android

This fork uses Tauri 2, the existing Svelte frontend and an Android SAF plugin.
The personal application ID is `com.mdhero.android.personal`. Minimum Android
version is 8.0 / API 26. The APK contains ARM64 (`arm64-v8a`) and emulator
`x86_64` code. No development server is required to use it.

## Prerequisites

- Node.js 22 or newer; pnpm **10.11.0** (pnpm 11 uses incompatible override rules).
- Stable Rust and the targets below.
- JDK 21, Android SDK platform 36 and build tools 36.0.0.
- Android NDK 27.2.12479018, platform-tools, and optionally the Android emulator.
- Windows: Visual Studio C++ build tools. Linux: standard compiler tools.

Install Android Studio or Android command-line tools, accept SDK licenses, and set
`JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME`. Keep their `bin` / platform-tools
directories available on PATH where appropriate. Example PowerShell:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\27.2.12479018"
$env:PATH = "$env:JAVA_HOME\bin;$env:USERPROFILE\.cargo\bin;$env:PATH"
rustup target add aarch64-linux-android x86_64-linux-android
sdkmanager 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.2.12479018'
npx --yes pnpm@10.11.0 install --frozen-lockfile
npm run android:build
```

The Android Gradle project is committed. Do not run `android init` over it; that
would replace the portrait, document-intent and backup settings. Tauri refreshes
machine-specific generated bindings automatically during builds.

## Build output

`npm run android:build` builds the frontend once, compiles embedded native
libraries for both architectures, copies and strips only the packaged libraries,
runs native JUnit tests and produces:

```
artifacts/MDHero-Android-debug.apk
src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

`npm run android:build -- --arm64-only` packages just the phone architecture.
`--package-only` is for repackaging **already compiled** native libraries; it does
not pick up frontend/Rust changes. Full builds are the default. Logs are saved in
`artifacts/`, which is ignored by Git.

The ordinary Tauri command is also supported on hosts with symlink permissions:

```sh
pnpm tauri android build --debug --apk --target aarch64 x86_64 --ci
```

On Windows without Developer Mode, Tauri compiles successfully but fails while
symlinking native libraries. The build script accepts only that specific failure
and packages copies through Gradle; actual compiler/build failures still stop it.
It also scopes the JDK's supported TCP pipe fallback to the build process, for
Windows hosts on which Java Unix-domain loopback sockets fail. It does not change
OS Developer Mode or global Java settings.

## Signing

The delivered APK is debug-signed by Gradle. That is suitable for this personal
installation. The local debug key is outside the repository. A CI debug build
may use a different key, so it may require uninstalling an older local build;
save documents/drafts before uninstalling because app data is removed.

For stable release distribution, use your own private signing key and Android's
Gradle `signingConfigs` / environment-secret configuration, then use the Tauri
release build. The generated project supports release minification, and the
native plugin includes reflection keep rules. Release signing has not been
configured or verified here. Never commit keys, passwords or signing properties.

## Installation

Transfer the APK to an ARM64 Android phone, open it and allow installation from
that file manager when Android requests it. Or use USB debugging:

```sh
adb install -r artifacts/MDHero-Android-debug.apk
adb shell am start -n com.mdhero.android.personal/.MainActivity
```

Choose Browse Files to open the original document. Pin its containing folder if
you want relative links and local images. Saving writes the same document URI;
Save As opens Android's destination picker. Markdown remains standard UTF-8.

## CI

`.github/workflows/android.yml` builds and uploads the same debug APK on the fork.
It is a reproducible additional build path, not a substitute for the locally
generated, installed and tested APK. CI status is recorded in ANDROID_TESTING.md.
