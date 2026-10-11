import { execFileSync } from "node:child_process";
import path from "node:path";
export const packageId = "com.mdhero.android.personal";
const executable = path.join(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
export function adb(...args) { return execFileSync(executable, ["-s", process.env.ANDROID_SERIAL ?? "emulator-5554", ...args], { windowsHide: true }); }
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function connect() {
  const pid = adb("shell", "pidof", packageId).toString().trim();
  adb("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
  const pages = await (await fetch("http://127.0.0.1:9222/json")).json();
  const socket = new WebSocket(pages.find(p => p.url.includes("tauri.localhost")).webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", event => { const result = JSON.parse(event.data); pending.get(result.id)?.(result); pending.delete(result.id); });
  async function call(method, params) {
    const next = ++id;
    let timer;
    const result = await new Promise((resolve, reject) => {
      pending.set(next, result => { clearTimeout(timer); resolve(result); }); socket.send(JSON.stringify({ id: next, method, params }));
      timer = setTimeout(() => { if (pending.delete(next)) reject(new Error(`CDP timed out: ${method}`)); }, 30000);
    });
    if (result.error) throw new Error(JSON.stringify(result.error));
    return result.result;
  }
  async function evaluate(expression) {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  return { evaluate, call, close: () => socket.close() };
}
