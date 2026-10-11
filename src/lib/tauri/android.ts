import { invoke } from "@tauri-apps/api/core";
import { isAndroid } from "../utils/platform";

export interface AndroidDocument { uri: string; name: string; content: string; writable: boolean; persistent: boolean }
export interface FolderFile { name: string; path: string; rel_path: string; modified: number }
const names: Record<string, string> = (() => {
  try { return JSON.parse(localStorage.getItem("mdhero-document-names") ?? "{}"); } catch { return {}; }
})();

export function native<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>("plugin:android-documents|execute", { action, payload });
}
export function rememberDocumentName(uri: string, name: string) {
  names[uri] = name;
  try { localStorage.setItem("mdhero-document-names", JSON.stringify(names)); } catch {}
}
export function documentName(uri: string): string | undefined { return names[uri]; }
export async function readAndroidDocument(uri: string): Promise<AndroidDocument> {
  const doc = await native<AndroidDocument>("read", { uri });
  rememberDocumentName(uri, doc.name);
  return doc;
}
export async function pickFolder(): Promise<string | null> {
  if (!isAndroid) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  }
  const result = await native<{uri?: string; name: string}>("pickTree");
  if (!result.uri) return null;
  rememberDocumentName(result.uri, result.name);
  return result.uri;
}
export async function listFolderFiles(folder: string): Promise<FolderFile[]> {
  if (!isAndroid) return invoke<FolderFile[]>("list_folder_md_files", { folder });
  return (await native<{files: FolderFile[]}>("listTree", { uri: folder })).files;
}
export async function fetchDocumentUrl(url: string): Promise<Response> {
  if (!isAndroid) return fetch(url);
  const result = await native<{content: string}>("fetchUrl", { url });
  return new Response(result.content, { status: 200 });
}
export async function printDocumentNative(name: string): Promise<void> {
  if (isAndroid) await native("print", { name }); else window.print();
}
