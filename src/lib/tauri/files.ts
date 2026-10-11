import { invoke } from "@tauri-apps/api/core";
import { get } from "svelte/store";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { document } from "../stores/document";
import { tabStore } from "../stores/tabs";
import { renderFull } from "../renderer/pipeline";
import { addRecentFile } from "../stores/recents";
import { pinnedFolders } from "../stores/pinned";
import { basename } from "../utils/path";
import { isAndroid } from "../utils/platform";
import { native, readAndroidDocument, documentName, rememberDocumentName } from "./android";
import { showToast } from "../stores/toast";

export async function readMarkdownFile(path: string): Promise<string> {
  if (isAndroid) return (await readAndroidDocument(path)).content;
  return invoke<string>("read_markdown_file", { path });
}

export async function saveFile(path: string, content: string, expected?: string): Promise<void> {
  if (isAndroid) { await native("write", { uri: path, content, expected }); return; }
  await invoke("write_markdown_file", { path, content });
}

export async function openFile(path: string): Promise<void> {
  const absolutePath = await resolvePath(path);
  let fileName = documentName(absolutePath) ?? basename(absolutePath);
  const baseDir = getBaseDir(absolutePath);

  document.set({
    filePath: absolutePath,
    fileName,
    content: "",
    renderedHtml: "",
    frontmatter: null,
    wordCount: 0,
    loading: true,
    error: null,
  });

  try {
    const content = await readMarkdownFile(absolutePath);
    fileName = documentName(absolutePath) ?? fileName;
    let result = renderFull(content, baseDir);

    // Whitelist the document's local images with the asset protocol before the
    // HTML hits the DOM, so images outside the static $HOME scope load (#31).
    await allowAssets(result.assetPaths, absolutePath);

    const tabId = tabStore.addTab(absolutePath, fileName, content, result.html, result.frontmatter, result.wordCount);
    watchFile(absolutePath);

    // An empty file has nothing to read — drop straight into the editor so the
    // user can start writing, instead of staring at a blank viewer (#52).
    if (content.trim() === "") tabStore.setEditing(tabId, true);

    const draft = isAndroid ? tabStore.getActiveTab() : null;
    const visibleContent = draft?.dirty ? draft.editContent : content;
    if (draft?.dirty) result = renderFull(visibleContent, baseDir);

    document.set({
      filePath: absolutePath,
      fileName,
      content: visibleContent,
      renderedHtml: result.html,
      frontmatter: result.frontmatter,
      wordCount: result.wordCount,
      loading: false,
      error: null,
    });

    addRecentFile(absolutePath, fileName);
    if (!isAndroid) getCurrentWindow().setTitle(`${fileName} — MDHero`).catch(() => {});
  } catch (err) {
    document.set({
      filePath: absolutePath,
      fileName,
      content: "",
      renderedHtml: "",
      frontmatter: null,
      wordCount: 0,
      loading: false,
      error: `Failed to open file: ${err}`,
    });
  }
}

let newDocCounter = 0;

/**
 * Start a fresh, unsaved markdown document in a new tab, opened straight into
 * the editor — the "new tab" behavior the UI already advertised (#63). It has
 * no filesystem path yet (a `new://` sentinel, like `paste://`); the location
 * is chosen on the first save via `saveAsNewDocument`. The watcher and
 * copy-path/link resolution skip `new://` tabs until they're saved.
 */
export function newDocument(): void {
  const filePath = `new://${Date.now()}-${newDocCounter++}`;
  const result = renderFull("");
  const tabId = tabStore.addTab(
    filePath,
    "Untitled",
    "",
    result.html,
    result.frontmatter,
    result.wordCount
  );
  tabStore.setEditing(tabId, true);
}

/**
 * First-save flow for a `new://` document: prompt for a location, write the
 * content, then re-point the tab at the chosen real path (watch + recents +
 * title). Returns the chosen absolute path, or null if the user cancelled the
 * dialog (caller should leave the tab dirty and in the editor).
 */
export async function saveAsNewDocument(tabId: string, content: string): Promise<string | null> {
  const tab = isAndroid ? get(tabStore.tabs).find(t => t.id === tabId) : null;
  const chosen = isAndroid ? (await native<{uris: string[]}>("create", { name: tab?.fileName === "Untitled" ? "Untitled.md" : tab?.fileName ?? "Untitled.md" })).uris[0] : await save({
    defaultPath: "Untitled.md",
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] }],
  });
  if (!chosen) return null;

  let fileName = basename(chosen);
  if (isAndroid) {
    const info = await native<{name: string}>("stat", { uri: chosen });
    fileName = info.name;
    rememberDocumentName(chosen, fileName);
  }
  await saveFile(chosen, content);
  tabStore.rebindPath(tabId, chosen, fileName);
  watchFile(chosen);
  addRecentFile(chosen, fileName);
  if (!isAndroid) getCurrentWindow().setTitle(`${fileName} — MDHero`).catch(() => {});
  return chosen;
}

export async function openFileDialog(): Promise<void> {
  try {
    const selected = isAndroid ? (await native<{uris: string[]}>("pick")).uris : await open({
      multiple: true,
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown", "mdown", "mkd", "txt"],
        },
      ],
    });

    if (!selected) return;

    // The dialog returns one path when single-select is enabled and an array
    // when multi-select is enabled. Keep the single-path case for API
    // compatibility, and open sequentially so each file is added to a tab.
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
      await openFile(path);
    }
  } catch (err) {
    console.error("File dialog error:", err);
    showToast(`Could not open document: ${err}`);
  }
}

/**
 * Re-read `path` from disk after the watcher saw it change (#97). The content
 * goes to the tab that owns the file — every open tab, not just the active one
 * — and the on-screen document is repainted only when that tab is the active
 * one. Before that guard a background file's reload was painted over whatever
 * the user was reading, the root of the #68 / #91 class of bugs.
 */
export async function reloadFile(path: string): Promise<void> {
  try {
    const absolutePath = await resolvePath(path);
    const content = await readMarkdownFile(absolutePath);
    const baseDir = getBaseDir(absolutePath);
    let result = renderFull(content, baseDir);
    const fileName = documentName(absolutePath) ?? basename(absolutePath);

    await allowAssets(result.assetPaths, absolutePath);

    tabStore.updateTabContent(absolutePath, content, result.html, result.frontmatter, result.wordCount);

    if (tabStore.getActiveTab()?.filePath !== absolutePath) return;

    const draft = isAndroid ? tabStore.getActiveTab() : null;
    const visibleContent = draft?.dirty ? draft.editContent : content;
    if (draft?.dirty) result = renderFull(visibleContent, baseDir);

    document.set({
      filePath: absolutePath,
      fileName,
      content: visibleContent,
      renderedHtml: result.html,
      frontmatter: result.frontmatter,
      wordCount: result.wordCount,
      loading: false,
      error: null,
    });
  } catch (err) {
    console.error("Failed to reload file:", err);
    if (isAndroid) showToast("Document access is unavailable. Your edits are kept; use Save As or select the document again.");
  }
}

/** A path the file watcher can do something with: on disk, not a tab sentinel. */
export function isWatchablePath(path: string): boolean {
  return !!path
    && !path.startsWith("paste://")
    && !path.startsWith("new://")
    && !path.startsWith("url://");
}

/** Ask the backend to deliver `file-changed` events for this file (#97). */
export function watchFile(path: string): void {
  if (isAndroid) return;
  if (!isWatchablePath(path)) return;
  invoke("watch_file", { path }).catch(() => {});
}

/** Stop events for this file; the directory watch is released with its last file. */
export function unwatchFile(path: string): void {
  if (isAndroid) return;
  if (!isWatchablePath(path)) return;
  invoke("unwatch_file", { path }).catch(() => {});
}

export function getBaseDir(path: string): string {
  if (path.startsWith("content://")) return path;
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(0, idx) : ".";
}

export async function resolvePath(path: string): Promise<string> {
  if (isAndroid) return path;
  return invoke<string>("resolve_path", { path });
}

/** Whether a path exists on disk (for the local-file-link existence check, #30). */
export async function pathExists(path: string): Promise<boolean> {
  if (isAndroid) { try { await native("stat", { uri: path }); return true; } catch { return false; } }
  return invoke<boolean>("path_exists", { path });
}

/**
 * Open a supported document/image in the OS default app (#30).
 *
 * The capability allowlist is the backend guard; the caller also rejects
 * executable/script extensions before reaching this function.
 */
export async function openWithSystem(path: string): Promise<void> {
  if (isAndroid) { await native("share", { uri: path }); return; }
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(path);
}

/**
 * Open the file's folder in the OS file manager (Explorer, Finder), with the
 * file selected. Throws if the file is no longer there.
 */
export async function revealInFileManager(path: string): Promise<void> {
  if (isAndroid) { await native("share", { uri: path }); return; }
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

/**
 * Whitelist a document's resolved local image paths with the webview's asset
 * protocol (issue #31). The Rust side serves only files inside the document's
 * own folder tree (its git checkout, if it is in one) or a pinned folder — see
 * `allow_assets` in commands.rs — and hands back whatever it refused, which is
 * logged so a broken image is diagnosable. A failure here must not block text
 * rendering — a broken image is acceptable degradation, a blank document is
 * not — so errors are swallowed.
 */
export async function allowAssets(paths: string[], documentPath: string): Promise<void> {
  if (isAndroid) return;
  if (paths.length === 0) return;
  try {
    const rejected = await invoke<string[]>("allow_assets", {
      documentPath,
      pinnedFolders: get(pinnedFolders),
      paths,
    });
    if (rejected.length > 0) {
      console.warn(
        `MDHero will not serve ${rejected.length} image(s) outside the document's folder tree. Pin the folder they live in to allow them:`,
        rejected
      );
    }
  } catch {}
}
