import { get } from "svelte/store";
import { tabStore, type Tab, HOME_TAB_ID } from "../stores/tabs";
import { renderFull } from "../renderer/pipeline";
import { openFile } from "./files";
import { isAndroid } from "../utils/platform";
import { showToast } from "../stores/toast";
import { native } from "./android";

const KEY = "mdhero-android-drafts-v1";
export interface DraftSession { tabs: Tab[]; activePath: string | null }
export function loadDrafts(): DraftSession | null {
  try {
    return parseDrafts(localStorage.getItem(KEY));
  } catch { return null; }
}
function parseDrafts(content: string | null): DraftSession | null {
  const parsed = JSON.parse(content ?? "null");
  if (!Array.isArray(parsed?.tabs)) return null;
  return { tabs: parsed.tabs.filter((t: Tab) => typeof t?.filePath === "string" && typeof t?.content === "string" && typeof t?.editContent === "string"), activePath: parsed.activePath ?? null };
}
const saved = isAndroid ? loadDrafts() : null;
let restoring = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let warned = false;
export function persistDrafts() {
  if (!isAndroid || restoring) return;
  clearTimeout(timer);
  const tabs = get(tabStore.tabs);
  const active = tabStore.getActiveTab();
  try {
    const content = JSON.stringify({ tabs: tabs.map(t => ({ ...t, renderedHtml: "", scrollTop: t.id === active?.id && !t.isEditing ? window.scrollY : t.scrollTop })), activePath: active?.filePath ?? null });
    // Native AtomicFile is durable after each completed write; WebView storage
    // may delay flushing to disk even after setItem returns.
    void native("draftSave", { content }).catch(() => {
      if (!warned) { warned = true; showToast("Draft backup is full or unavailable. Save your changes before leaving MDHero."); }
    });
    localStorage.setItem(KEY, content);
  } catch {
    if (!warned) { warned = true; showToast("Draft backup is full. Save your changes before leaving MDHero."); }
  }
}
export function initDraftPersistence(): () => void {
  const schedule = () => { if (!restoring) { clearTimeout(timer); timer = setTimeout(persistDrafts, 250); } };
  const unsubTabs = tabStore.tabs.subscribe(schedule);
  const unsubActive = tabStore.activeTabId.subscribe(schedule);
  const onVisibility = () => { if (document.hidden) persistDrafts(); };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", persistDrafts);
  return () => { persistDrafts(); unsubTabs(); unsubActive(); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("pagehide", persistDrafts); };
}
export async function restoreMobileDrafts(): Promise<void> {
  restoring = true;
  const paths = new Map<string, string>();
  try {
    let session = saved;
    try { const backup = await native<{content: string | null}>("draftLoad"); session = parseDrafts(backup.content) ?? saved; } catch {}
    if (!session) return;
    for (const snapshot of session.tabs) {
      if (snapshot.filePath.startsWith("content://")) await openFile(snapshot.filePath);
      let tab = get(tabStore.tabs).find(t => t.filePath === snapshot.filePath);
      if (!tab) {
        const recovered = snapshot.filePath.startsWith("content://");
        const path = recovered ? `new://recovered-${Date.now()}-${paths.size}` : snapshot.filePath;
        const result = renderFull(snapshot.content);
        const id = tabStore.addTab(path, snapshot.fileName, recovered ? "" : snapshot.content, result.html, result.frontmatter, result.wordCount);
        tab = tabStore.getActiveTab()!;
        tabStore.restoreDraft({ ...snapshot, id, filePath: path });
        if (path !== snapshot.filePath) {
          tabStore.updateEditContent(id, snapshot.editContent);
          showToast(`Recovered ${snapshot.fileName}. Use Save As or select the original document again.`);
        }
      } else tabStore.restoreDraft(snapshot);
      paths.set(snapshot.filePath, tab.id);
    }
    tabStore.switchTab(session.activePath ? paths.get(session.activePath) ?? HOME_TAB_ID : HOME_TAB_ID);
  } finally { restoring = false; persistDrafts(); }
}
