import { adb, delay } from "./android-cdp.mjs";
export async function nodes() {
  adb("shell", "uiautomator", "dump", "/sdcard/mdhero-window.xml");
  const xml = adb("shell", "cat", "/sdcard/mdhero-window.xml").toString();
  return [...xml.matchAll(/<node\s+([^>]+)>?/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])));
}
export async function tap(label) {
  let node;
  for (let attempt = 0; attempt < 5 && !node; attempt++) {
    node = (await nodes()).findLast(n => n.text.toLowerCase() === label.toLowerCase() || n["content-desc"].toLowerCase() === label.toLowerCase());
    if (!node) await delay(500);
  }
  if (!node) throw new Error(`Android control not found: ${label}`);
  const bounds = [...node.bounds.matchAll(/\d+/g)].map(n => Number(n[0]));
  adb("shell", "input", "tap", `${(bounds[0] + bounds[2]) / 2}`, `${(bounds[1] + bounds[3]) / 2}`);
  await delay(700);
}
