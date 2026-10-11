import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { adb, connect, delay, packageId } from "./android-cdp.mjs";

// Install tests/android-provider first. This does not clear MDHero's data.
if (!(process.env.ANDROID_SERIAL ?? "emulator-5554").startsWith("emulator-")) throw new Error("Use an isolated emulator.");
let c;
const passed = [];
function check(name, value) { assert.ok(value, name); passed.push(name); console.log(`PASS ${name}`); }
async function connection() {
  c?.close();
  for (let attempt = 0; attempt < 60; attempt++) {
    try { c = await connect(); return; } catch { await delay(250); }
  }
  throw new Error("MDHero WebView did not start");
}
async function open(kind, { write = false, share = false, cold = false } = {}) {
  if (cold) { c?.close(); c = null; adb("shell", "am", "force-stop", packageId); }
  adb("shell", "am", "start", "-f", "0x10008000", "-n", "com.mdhero.providerfixture/.OpenActivity", "--es", "kind", kind, "--ez", "write", String(write), "--ez", "share", String(share));
  if (!c) await connection();
  for (let retry = 0; retry < 80; retry++) {
    if (await c.evaluate(`document.querySelector('article h1')?.innerText === ${JSON.stringify("External " + kind)}`)) return;
    await delay(250);
  }
  throw new Error(`External ${kind} did not render: ${await c.evaluate("document.body.innerText")}`);
}
function native(action, payload = {}) {
  return c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:android-documents|execute',${JSON.stringify({ action, payload })})`);
}
const uri = kind => `content://com.mdhero.providerfixture/items/${kind}`;
try {
  await open("normal", { write: true, cold: true });
  check("cold Open With accepts a provider without document flags", true);
  const info = await native("read", { uri: uri("normal") });
  check("external display name and actual write grant are retained", info.name === "External normal.md" && info.writable && !info.persistent);
  await native("write", { uri: uri("normal"), content: info.content + "\nSame URI write\n", expected: info.content });
  check("external original URI supports read/write without metadata flags", (await native("read", { uri: uri("normal") })).content.endsWith("Same URI write\n"));
  for (const kind of ["noname", "empty", "throws"]) {
    await open(kind);
    check(`warm Open With renders ${kind} optional metadata`, true);
  }
  await open("readonly");
  check("read-only URI is readable without advertising write access", !(await native("read", { uri: uri("readonly") })).writable);
  let denied = false;
  try { await native("write", { uri: uri("readonly"), content: "must fail" }); } catch { denied = true; }
  check("OS rejects writing a read-only external grant", denied);
  await open("shared", { share: true });
  check("ACTION_SEND also opens the provider stream", true);
  await c.evaluate("[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Edit').click()");
  await delay(300);
  await c.evaluate("(()=>{let t=document.querySelector('textarea');t.value+='\\nUnsaved external draft';t.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await delay(800);
  for (const duration of [150, 1300, 150, 1300]) {
    adb("shell", "am", "start", "-f", "0x10008000", "-n", "com.mdhero.providerfixture/.OpenActivity", "--ez", "idle", "true");
    await delay(duration);
    adb("shell", "am", "start", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-n", `${packageId}/.MainActivity`);
    await delay(700);
    check(`return after ${duration}ms app switch preserves editor and draft`, await c.evaluate("document.visibilityState==='visible'&&document.querySelector('textarea')?.value.includes('Unsaved external draft')"));
  }
  await c.evaluate("window.dispatchEvent(new Event('mdhero-back'))"); await delay(500);
  writeFileSync(`artifacts/android-open-with-api${adb('shell','getprop','ro.build.version.sdk').toString().trim()}.png`, adb("exec-out", "screencap", "-p"));
  check("resumed reader has rendered content and toolbar", await c.evaluate("!!document.querySelector('article h1')&&!!document.querySelector('.mobile-toolbar')"));
  adb("shell", "am", "start", "-f", "0x10008000", "-n", "com.mdhero.providerfixture/.OpenActivity", "--es", "kind", "gone");
  for (let retry = 0; retry < 40 && !await c.evaluate("!!document.querySelector('.error-msg')"); retry++) await delay(250);
  check("unavailable external source produces a recoverable error", await c.evaluate("document.querySelector('.error-msg')?.innerText.includes('Source was removed')"));
  let unavailable = false;
  try { await native("stat", { uri: uri("gone") }); } catch { unavailable = true; }
  check("metadata fallback does not hide an unavailable document", unavailable);
  adb("shell", "am", "start", "-f", "0x10008000", "-n", "com.mdhero.providerfixture/.OpenActivity", "--ez", "idle", "true"); await delay(1300);
  adb("shell", "am", "start", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-n", `${packageId}/.MainActivity`); await delay(1000);
  check("return after failed Open With restores the unsaved reader", await c.evaluate("!!document.querySelector('article h1')&&document.body.innerText.includes('Unsaved external draft')"));
  const backup = await native("draftLoad");
  check("external draft is durable before background process eviction", backup.content.includes("Unsaved external draft"));
  const oldPid = adb("shell", "pidof", packageId).toString().trim();
  c.close(); c = null;
  adb("shell", "am", "start", "-f", "0x10008000", "-n", "com.mdhero.providerfixture/.OpenActivity", "--ez", "idle", "true"); await delay(1500);
  adb("shell", "am", "kill", packageId); await delay(1000);
  adb("shell", "am", "start", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", "-n", `${packageId}/.MainActivity`);
  await connection();
  for (let retry = 0; retry < 80 && !await c.evaluate("document.body?.innerText.includes('Unsaved external draft')===true"); retry++) await delay(250);
  check("background eviction actually restarted the app process", adb("shell", "pidof", packageId).toString().trim() !== oldPid);
  check("background process recovery restores the external draft without force stop", await c.evaluate("document.body.innerText.includes('Unsaved external draft')&&!!document.querySelector('.mobile-toolbar')"));
  writeFileSync(`artifacts/android-open-with-recovery-api${adb('shell','getprop','ro.build.version.sdk').toString().trim()}.png`, adb("exec-out", "screencap", "-p"));
} finally {
  c?.close();
  writeFileSync("artifacts/android-open-with-results.json", JSON.stringify({ passed }, null, 2));
}
console.log(`${passed.length} external provider/lifecycle checks passed`);
