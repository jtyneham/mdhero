import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke, convertFileSrc: (p: string) => `asset:${p}` }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ setTitle: vi.fn() }) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("../../src/lib/renderer/pipeline", () => ({ renderFull: (s: string) => ({ html: s, frontmatter: null, wordCount: 1, assetPaths: [] }) }));
beforeEach(() => {
  vi.resetModules(); invoke.mockReset();
  vi.stubGlobal("navigator", { userAgent: "Android", platform: "Linux" });
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) });
  vi.stubGlobal("window", { scrollY: 0 });
});
afterEach(() => vi.unstubAllGlobals());
describe("Android content URIs", () => {
  it("reads opaque URIs without path normalization or desktop watching", async () => {
    const uri = "content://provider/document/opaque%3A42";
    invoke.mockResolvedValue({ uri, name: "notes.md", content: "# Notes", persistent: true, writable: true });
    const files = await import("../../src/lib/tauri/files");
    await files.openFile(uri);
    const { tabStore } = await import("../../src/lib/stores/tabs");
    expect(tabStore.getActiveTab()?.fileName).toBe("notes.md");
    expect(tabStore.getActiveTab()?.filePath).toBe(uri);
    expect(invoke.mock.calls.every(c => c[0] === "plugin:android-documents|execute")).toBe(true);
    expect(files.getBaseDir(uri)).toBe(uri);
  });
  it("writes the original URI and passes the expected disk version", async () => {
    const { saveFile } = await import("../../src/lib/tauri/files");
    await saveFile("content://p/id", "edited", "original");
    expect(invoke).toHaveBeenCalledWith("plugin:android-documents|execute", { action: "write", payload: { uri: "content://p/id", content: "edited", expected: "original" } });
  });
  it("retains dirty preview edits across reload and reopen", async () => {
    const { tabStore } = await import("../../src/lib/stores/tabs");
    const id = tabStore.addTab("content://p/id", "a.md", "original", "");
    tabStore.setEditing(id, true); tabStore.updateEditContent(id, "my changes"); tabStore.setEditing(id, false);
    tabStore.updateTabContent("content://p/id", "external change", "");
    expect(tabStore.getActiveTab()?.editContent).toBe("my changes");
    invoke.mockResolvedValue({uri: "content://p/id", name: "a.md", content: "another external change"});
    const files = await import("../../src/lib/tauri/files");
    await files.reloadFile("content://p/id");
    const { document } = await import("../../src/lib/stores/document");
    expect(get(document).content).toBe("my changes");
    expect(tabStore.getActiveTab()?.content).toBe("another external change");
    expect(tabStore.getActiveTab()?.diskChanged).toBe(true);
    tabStore.addTab("content://p/id", "a.md", "external change", "");
    expect(tabStore.getActiveTab()?.dirty).toBe(true);
    expect(tabStore.getActiveTab()?.editContent).toBe("my changes");
  });
  it("restores caret, edits and external-change state without treating a backup as saved", async () => {
    const { tabStore } = await import("../../src/lib/stores/tabs");
    const id = tabStore.addTab("content://p/id", "a.md", "original", "");
    const snapshot = { ...tabStore.getActiveTab()!, editContent: "draft", selectionStart: 2, editorScrollTop: 123, isEditing: true };
    tabStore.updateTabContent("content://p/id", "changed", "");
    tabStore.restoreDraft(snapshot);
    const tab = get(tabStore.tabs).find(t => t.id === id)!;
    expect(tab.editContent).toBe("draft"); expect(tab.content).toBe("changed"); expect(tab.diskChanged).toBe(true);
    expect(tab.selectionStart).toBe(2); expect(tab.editorScrollTop).toBe(123);
  });
  it("surfaces revoked permissions as unavailable rather than treating the URI as a path", async () => {
    invoke.mockRejectedValue(new Error("Permission denied"));
    const { pathExists } = await import("../../src/lib/tauri/files");
    expect(await pathExists("content://p/id")).toBe(false);
  });
});
