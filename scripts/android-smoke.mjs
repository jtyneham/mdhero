import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { connect, adb, delay, packageId } from "./android-cdp.mjs";
import { tap } from "./android-ui.mjs";

// Run only against an isolated emulator: this edits the bundled test fixtures.
if (!(process.env.ANDROID_SERIAL ?? "emulator-5554").startsWith("emulator-")) throw new Error("Use an isolated emulator for these tests.");
if (process.argv.includes("--prepare")) {
  adb("shell", "am", "force-stop", packageId);
  adb("shell", "pm", "clear", packageId);
  adb("push", "tests/fixtures/android-folder/.", "/sdcard/Download/MDHeroTests/");
  adb("shell", "am", "start", "-n", `${packageId}/.MainActivity`);
  await delay(2200);
}
let c = await connect();
const resume = process.argv.includes("--resume-folder");
const results = resume ? JSON.parse(readFileSync("artifacts/android-smoke-checkpoint.json", "utf8")) : [];
async function check(name, predicate) { assert.ok(await predicate(), name); results.push(name); writeFileSync("artifacts/android-smoke-checkpoint.json",JSON.stringify(results)); console.log(`PASS ${name}`); }
async function click(label) {
  await c.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.innerText.trim()===${JSON.stringify(label)}); if(!b) throw new Error('Control missing: '+${JSON.stringify(label)}); b.click(); })()`);
  await delay(450);
}
async function back() { adb("shell", "input", "keyevent", "4"); await delay(700); }
async function native(action, payload={}) { return c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:android-documents|execute',${JSON.stringify({action,payload})})`); }
if (process.argv.includes("--prepare")) {
  for(let retry=0;retry<60&&!await c.evaluate("[...document.querySelectorAll('button')].some(b=>b.innerText==='Browse Files')");retry++)await delay(250);
  await click("Browse Files"); await delay(600);
  await tap("Show roots"); await tap(adb("shell", "getprop", "ro.product.model").toString().trim());
  await tap("Download"); await tap("MDHeroTests"); await tap("guide.md"); await delay(1600);
}
const session = await c.evaluate("JSON.parse(localStorage.getItem('mdhero-android-drafts-v1'))");
const uri = session.tabs.find(t=>t.fileName==="guide.md")?.filePath;
assert.ok(uri?.startsWith("content://"), "First open tests/fixtures/android-folder/guide.md through Browse Files");
let edited;
if (!resume) {
await delay(1500);
await check("offline Markdown, syntax highlighting, KaTeX and Mermaid", ()=>c.evaluate("!!document.querySelector('article h1') && !!document.querySelector('.hljs-keyword') && document.querySelectorAll('.katex').length===2 && !!document.querySelector('.mermaid-diagram svg')"));
await check("untrusted HTML and javascript links stay inert", ()=>c.evaluate("!document.querySelector('article script,article a[href^=\"javascript:\"]')"));
await check("portrait document fits viewport", ()=>c.evaluate("document.documentElement.scrollWidth===innerWidth && innerHeight>innerWidth"));
await click("Raw");
await check("Raw mode shows Markdown source", ()=>c.evaluate("!!document.querySelector('.raw-source') && document.body.innerText.includes('```typescript')"));
await click("Edit");
const baseline = (await native("read", {uri})).content;
edited = baseline + "\nAndroid save verification — 😀\n";
await c.evaluate(`(()=>{const t=document.querySelector('textarea');t.value=${JSON.stringify(edited)};t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await delay(500);
await check("editing marks the tab dirty", ()=>c.evaluate("document.querySelector('.mobile-title').innerText.includes('•')"));
await back();
if (await c.evaluate("!!document.querySelector('textarea')")) await back();
await check("system Back returns to reader without discarding draft", ()=>c.evaluate("!!document.querySelector('article') && document.body.innerText.includes('Android save verification')"));
await click("More options"); await click("Save changes"); await delay(600);
await check("save writes the original SAF URI", async()=> (await native("read",{uri})).content===edited);
await check("save clears dirty indicator", ()=>c.evaluate("!document.querySelector('.mobile-title').innerText.includes('•')"));
await check("external-change conflict rejects a stale baseline", async()=> {
  try { await native("write",{uri,content:"bad overwrite",expected:"stale baseline"}); return false; } catch(e) { return e.message.includes("CONFLICT"); }
});
await check("unselected content URIs are rejected", async()=> {
  try { await native("read",{uri:"content://com.android.externalstorage.documents/document/primary%3Asecret.md"});return false; } catch(e) {return e.message.includes("Select this document");}
});
await click("Table of contents");
await check("ToC opens as a drawer", ()=>c.evaluate("!!document.querySelector('.toc-sidebar')"));
await back(); await check("Back closes ToC", ()=>c.evaluate("!document.querySelector('.toc-sidebar')"));
await click("Search document");
await c.evaluate("(()=>{let i=document.querySelector('.search-input');i.value='verification';i.dispatchEvent(new Event('input',{bubbles:true}));})()");
await delay(600);
await check("reader search highlights matches", ()=>c.evaluate("!!document.querySelector('article mark')"));
await back(); if (await c.evaluate("!!document.querySelector('.search-bar')")) await back();
await click("Reading preferences");
await check("reading preference sheet uses original controls", ()=>c.evaluate("!!document.querySelector('.rc-panel')"));
await back();
await click("More options");
while ((await c.evaluate("localStorage.getItem('mdhero-theme')"))!=="dark") await click(`Appearance: ${await c.evaluate("localStorage.getItem('mdhero-theme')")}`);
await check("dark theme applies", ()=>c.evaluate("document.documentElement.classList.contains('dark')"));
// Native edge gesture, independent of dispatching a synthetic DOM Back event.
adb("shell", "input", "swipe", "2", "1200", "400", "1200", "350"); await delay(1000);
await check("Android edge Back gesture closes overflow", ()=>c.evaluate("!document.querySelector('.mobile-panel')"));
await click("Home"); await click("Pin Folder"); await delay(900);
}
// DocumentsUI restores the last external-storage folder used for Browse Files.
if (!process.argv.includes("--folder-granted")) { await tap("Use this folder"); await tap("Allow"); await delay(1100); }
if (resume) edited = (await native("read", {uri})).content;
await check("folder tree grant is pinned", ()=>c.evaluate("JSON.parse(localStorage.getItem('mdhero_pinned_folders')).length>0"));
const tree = await c.evaluate("JSON.parse(localStorage.getItem('mdhero_pinned_folders'))[0]");
const listed = await native("listTree",{uri:tree});
await check("pinned folder enumerates Markdown documents", async()=>listed.files.some(f=>f.name==="second.md"));
await click("Open documents"); await click("guide.md");
// Refresh via mode switch so the renderer resolves newly granted relative assets.
await click("Raw"); await click("Reader"); await delay(700);
await check("relative image reads through granted folder", ()=>c.evaluate("document.querySelector('article img')?.src.startsWith('data:image/svg+xml;base64,')"));
await c.evaluate("document.querySelector('article img').click()"); await delay(200);
await check("image lightbox opens", ()=>c.evaluate("!!document.querySelector('.lightbox')"));
await back();
await c.evaluate("document.querySelector('article a[href=\"second.md\"]').click()"); await delay(700);
await check("relative Markdown link opens another document", ()=>c.evaluate("document.querySelector('.mobile-title').innerText==='second.md'"));
await click("Open documents"); await click("guide.md");
await click("Edit");
const draft = edited + "\nRecovered unsaved draft\n";
await c.evaluate(`(()=>{let t=document.querySelector('textarea');t.value=${JSON.stringify(draft)};t.dispatchEvent(new Event('input',{bubbles:true}));t.setSelectionRange(25,25);t.dispatchEvent(new Event('select'));})()`);
await delay(800);
await check("native backup contains the unsaved draft", async()=> (await native("draftLoad")).content.includes("Recovered unsaved draft"));
c.close(); adb("shell","am","force-stop",packageId); adb("shell","am","start","-n",`${packageId}/.MainActivity`); await delay(3000); c=await connect();
for (let retry=0; retry<40 && !await c.evaluate("document.querySelector('textarea')?.value.includes('Recovered unsaved draft')"); retry++) await delay(250);
await check("unsaved draft survives process restart", ()=>c.evaluate("document.querySelector('textarea')?.value.includes('Recovered unsaved draft')"));
await check("theme and recents persist", ()=>c.evaluate("document.documentElement.classList.contains('dark') && JSON.parse(localStorage.getItem('mdhero-recent-files')).length>=2"));
writeFileSync("artifacts/android-editor.png",adb("exec-out","screencap","-p"));
await back(); if (await c.evaluate("!!document.querySelector('textarea')")) await back();
writeFileSync("artifacts/android-reader.png",adb("exec-out","screencap","-p"));
writeFileSync("artifacts/android-smoke-results.json",JSON.stringify({device:"API 36 x86_64 isolated emulator",passed:results},null,2));
c.close(); console.log(`${results.length} emulator checks passed`);
