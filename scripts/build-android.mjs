import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync, createWriteStream, unlinkSync, lstatSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Debug-signed, embedded/offline APK. Also works on Windows without symlink rights.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "artifacts");
mkdirSync(output, { recursive: true });
const env = { ...process.env };
if (process.platform === "win32" && !env.JAVA_TOOL_OPTIONS?.includes("jdk.net.unixdomain.tmpdir")) {
  // A nonexistent path makes the JDK use its supported TCP pipe fallback.
  env.JAVA_TOOL_OPTIONS = `${env.JAVA_TOOL_OPTIONS ?? ""} "-Djdk.net.unixdomain.tmpdir=${path.join(output, "unavailable-unix-sockets").replaceAll("\\", "/")}"`.trim();
}
async function run(command, args, label, allowSymlinkFailure = false) {
  console.log(`MDHero Android: ${label}`);
  const log = createWriteStream(path.join(output, `${label}.log`));
  let tail = "";
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, windowsHide: true, windowsVerbatimArguments: command === "cmd.exe" });
    child.on("error", reject);
    for (const stream of [child.stdout, child.stderr]) stream.on("data", data => {
      log.write(data); tail = (tail + data.toString()).slice(-16000);
    });
    child.on("close", resolve);
  });
  log.end();
  if (code !== 0 && !(allowSymlinkFailure && /symlink/i.test(tail) && /privilege|Developer Mode|1314/i.test(tail))) {
    throw new Error(`${label} failed (${code}):\n${tail}`);
  }
  if (code !== 0) console.log("Using copied JNI libraries because this Windows account cannot create symlinks.");
}
const cli = path.join(root, "node_modules/@tauri-apps/cli/tauri.js");
if (!process.argv.includes("--package-only")) await run(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build"], "frontend");
const config = path.join(output, "native-only.json");
writeFileSync(config, JSON.stringify({ build: { beforeBuildCommand: "" } }));
const targets = process.argv.includes("--arm64-only")
  ? [["aarch64", "aarch64-linux-android", "arm64-v8a", "arm64"]]
  : [["aarch64", "aarch64-linux-android", "arm64-v8a", "arm64"], ["x86_64", "x86_64-linux-android", "x86_64", "x86_64"]];
for (const [target, triple, abi] of targets) {
  if (!process.argv.includes("--package-only")) await run(process.execPath, [cli, "android", "build", "--debug", "--apk", "--target", target, "--ci", "--config", config], target, true);
  const source = path.join(root, "src-tauri/target", triple, "debug/libmdhero_lib.so");
  if (!existsSync(source)) throw new Error(`Native library missing: ${source}`);
  const destination = path.join(root, "src-tauri/gen/android/app/src/main/jniLibs", abi, "libmdhero_lib.so");
  mkdirSync(path.dirname(destination), { recursive: true });
  // Tauri normally creates a symlink; replace it safely before copying.
  try { if (lstatSync(destination).isSymbolicLink()) unlinkSync(destination); } catch (e) { if (e.code !== "ENOENT") throw e; }
  copyFileSync(source, destination);
  // Strip only packaged copies. Keep the Cargo outputs available for debugging.
  const ndk = env.NDK_HOME;
  if (!ndk) throw new Error("Set NDK_HOME to the installed Android NDK directory.");
  const host = process.platform === "win32" ? "windows-x86_64" : process.platform === "darwin" ? "darwin-x86_64" : "linux-x86_64";
  await run(path.join(ndk, "toolchains/llvm/prebuilt", host, "bin", process.platform === "win32" ? "llvm-strip.exe" : "llvm-strip"), ["--strip-debug", destination], `strip-${target}`);
}
const gradleRoot = path.join(root, "src-tauri/gen/android");
const apk = path.join(gradleRoot, "app/build/outputs/apk/universal/debug/app-universal-debug.apk");
// A fresh ZIP avoids unused space from Gradle's incremental APK updates after
// replacing large debug libraries with stripped copies.
if (existsSync(apk)) unlinkSync(apk);
const args = ["-p", gradleRoot, "--no-daemon", "assembleUniversalDebug",
  `-PabiList=${targets.map(t => t[2]).join(",")}`, `-ParchList=${targets.map(t => t[3]).join(",")}`,
  `-PtargetList=${targets.map(t => t[0]).join(",")}`, "-x", ":app:rustBuildUniversalDebug",
  ":tauri-plugin-android-documents:testDebugUnitTest"];
if (process.platform === "win32") await run("cmd.exe", ["/d", "/s", "/c", `""${path.join(gradleRoot, "gradlew.bat")}" ${args.map(a => `"${a}"`).join(" ")}"`], "package");
else await run(path.join(gradleRoot, "gradlew"), args, "package");
if (!existsSync(apk)) throw new Error(`APK missing: ${apk}`);
copyFileSync(apk, path.join(output, "MDHero-Android-debug.apk"));
console.log(`APK: ${path.join(output, "MDHero-Android-debug.apk")}`);
