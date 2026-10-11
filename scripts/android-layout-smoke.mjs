import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { connect, adb, delay, packageId } from "./android-cdp.mjs";
import { nodes, tap } from "./android-ui.mjs";
if (!(process.env.ANDROID_SERIAL ?? "emulator-5554").startsWith("emulator-")) throw new Error("Use an isolated emulator.");
let c=await connect();
const passed=[];
async function check(name,value) { assert.ok(value,name);passed.push(name);console.log(`PASS ${name}`); }
async function click(label) {
  await c.evaluate(`(()=>{let b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.innerText.trim()===${JSON.stringify(label)});if(!b)throw new Error('Missing control');b.click()})()`); await delay(500);
}
async function keyBack() {adb("shell","input","keyevent","4");await delay(700);}
try {
  adb("shell","settings","put","system","accelerometer_rotation","0");
  adb("shell","settings","put","system","user_rotation","1");await delay(700);
  await check("activity stays portrait when device rotation changes",await c.evaluate("innerHeight>innerWidth"));
  adb("shell","wm","size","840x1800");await delay(800);
  await check("320dp portrait viewport has no page overflow",await c.evaluate("innerWidth<=322&&document.documentElement.scrollWidth===innerWidth"));
  writeFileSync("artifacts/android-320dp.png",adb("exec-out","screencap","-p"));
  adb("shell","settings","put","system","font_scale","1.3");await delay(1300);
  c.close();c=await connect();await delay(700);
  await check("130% Android font scaling stays within viewport",await c.evaluate("document.documentElement.scrollWidth===innerWidth"));
  await click("Edit");
  const rect=await c.evaluate("(()=>{let r=document.querySelector('textarea').getBoundingClientRect();return {x:r.x+60,y:r.y+60}})()");
  const ratio=840/await c.evaluate("innerWidth");
  adb("shell","input","tap",`${Math.round(rect.x*ratio)}`,`${Math.round((rect.y+52)*ratio)}`);await delay(1200);
  await check("software keyboard is visible",adb("shell","dumpsys","input_method").toString().includes("mInputShown=true"));
  await check("editor fits the keyboard's visual viewport",await c.evaluate("document.querySelector('.editor-wrap').getBoundingClientRect().bottom<=visualViewport.height+2"));
  await check("textarea retains focus",await c.evaluate("document.activeElement===document.querySelector('textarea')"));
  writeFileSync("artifacts/android-keyboard.png",adb("exec-out","screencap","-p"));
  await keyBack();if(await c.evaluate("!!document.querySelector('textarea')"))await keyBack();
  // Escape on an attached keyboard should use Back, never close a dirty tab.
  await click("More options");
  adb("shell","input","keyevent","111");await delay(400);
  await check("physical-keyboard Escape closes mobile overflow",await c.evaluate("!document.querySelector('.mobile-panel')&&!!document.querySelector('article')"));
  await click("Open documents");
  await click("Close guide.md");await delay(500);
  await check("dirty close opens native confirmation",(await nodes()).some(n=>n.text.includes("unsaved")||n.text.includes("Discard")));
  await keyBack();await keyBack();
  await check("canceling close keeps draft",await c.evaluate("document.body.innerText.includes('Recovered unsaved draft')"));
  await click("More options");await click("Share document…");await delay(600);
  await check("native Android share sheet opens",adb("shell","dumpsys","activity","activities").toString().includes("ChooserActivity"));
  await keyBack();
  await click("More options");await click("Print / Save PDF…");await delay(1800);
  await check("native Print / Save PDF workflow opens",adb("shell","dumpsys","activity","activities").toString().includes("printspooler"));
  writeFileSync("artifacts/android-print.png",adb("exec-out","screencap","-p"));
  console.log((await nodes()).filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,label:n['content-desc']})));
  await keyBack();
  await click("More options");await click("Save As…");await delay(600);
  await check("Save As uses Android's document-creation picker",adb("shell","dumpsys","activity","activities").toString().includes("documentsui"));
  for(let attempt=0;attempt<8&&(await nodes()).some(n=>n.package.includes('documentsui'));attempt++)await keyBack();
  await check("canceling Save As returns from the native picker",!(await nodes()).some(n=>n.package.includes('documentsui')));
  await check("canceling Save As leaves the dirty document intact",await c.evaluate("document.querySelector('.mobile-title').innerText.includes('•')"));
} finally {
  adb("shell","wm","size","reset");adb("shell","settings","put","system","font_scale","1.0");adb("shell","settings","put","system","user_rotation","0");adb("shell","settings","put","system","accelerometer_rotation","1");
  c.close();
  writeFileSync("artifacts/android-layout-results.json",JSON.stringify({passed},null,2));
}
console.log(`${passed.length} layout/native checks passed`);
