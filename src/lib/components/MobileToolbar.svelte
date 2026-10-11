<script lang="ts">
  import { onMount } from "svelte";
  import { Home, Files, Search, List, Ellipsis, X, Save } from "@lucide/svelte";
  import { document as doc } from "../stores/document";
  import { tabStore, HOME_TAB_ID } from "../stores/tabs";
  import { tocVisible, tocEntries, toggleToc } from "../stores/toc";
  import { themeMode, cycleTheme } from "../stores/theme";
  import { openFileDialog, newDocument } from "../tauri/files";
  import { copyAsMarkdown, copyAsRichText } from "../utils/clipboard";
  import { native, printDocumentNative } from "../tauri/android";
  import { showToast } from "../stores/toast";
  import ReaderControls from "./ReaderControls.svelte";
  import logo from "$lib/assets/mdhero-icon.png";

  let { panel = $bindable(null), mode, dirty, onMode, onSave, onSaveAs, onSearch, onSettings, onPaste, onUrl, onClose, onZen, onPresent, canPresent, onAI, onAbout }:
    { panel: "menu" | "documents" | "preferences" | null; mode: "viewer" | "raw" | "editor"; dirty: boolean;
      onMode: (mode: "viewer" | "raw" | "editor") => void; onSave: () => void; onSaveAs: () => void;
      onSearch: () => void; onSettings: () => void; onPaste: () => void; onUrl: () => void;
      onClose: (id: string) => Promise<boolean>; onZen: () => void; onPresent: () => void; canPresent: boolean; onAI: () => void; onAbout: () => void } = $props();
  const { tabs, activeTabId } = tabStore;
  let toolbarEl: HTMLElement | undefined = $state();
  onMount(() => {
    const observer = new ResizeObserver(() => {
      if (toolbarEl) globalThis.document.documentElement.style.setProperty("--mobile-header", `${toolbarEl.offsetHeight}px`);
    });
    if (toolbarEl) observer.observe(toolbarEl);
    return () => observer.disconnect();
  });
  function toggle(value: typeof panel) { panel = panel === value ? null : value; }
  function action(fn: () => void) { panel = null; fn(); }
  async function copy(rich: boolean) {
    const tab = tabStore.getActiveTab();
    const content = tab?.dirty ? tab.editContent : $doc.content;
    const ok = rich ? await copyAsRichText(globalThis.document.querySelector("article.prose")?.innerHTML ?? "", content) : await copyAsMarkdown(content);
    showToast(ok ? "Copied" : "Could not copy"); panel = null;
  }
  async function share() {
    panel = null;
    const tab = tabStore.getActiveTab();
    if (!tab) return;
    try { await native("share", { name: tab.fileName, content: tab.dirty ? tab.editContent : tab.content }); }
    catch (e) { showToast(`Sharing failed: ${e}`); }
  }
</script>

<header bind:this={toolbarEl} class="mobile-toolbar print:hidden">
  <div class="mobile-top">
    <button aria-label="Home" onclick={() => action(() => tabStore.goHome())}><Home size={19} /></button>
    <img src={logo} alt="" width="22" height="22" />
    <span class="mobile-title">{$doc.fileName ?? "MDHero"}{dirty ? " •" : ""}</span>
    {#if dirty}<button aria-label="Save changes" onclick={onSave}><Save size={19} /></button>{/if}
    <button aria-label="Open documents" onclick={() => toggle("documents")}><Files size={19} /><span class="tab-count">{$tabs.length}</span></button>
    <button aria-label="More options" onclick={() => toggle("menu")}><Ellipsis size={21} /></button>
  </div>
  {#if $doc.filePath}
    <div class="mobile-bottom">
      <div class="mobile-modes" role="group" aria-label="Document mode">
        {#each [["viewer", "Reader"], ["raw", "Raw"], ["editor", "Edit"]] as [value, label]}
          <button class:active={mode === value} onclick={() => action(() => onMode(value as typeof mode))}>{label}</button>
        {/each}
      </div>
      <button aria-label="Search document" onclick={() => action(onSearch)}><Search size={19} /></button>
      <button aria-label="Table of contents" disabled={mode !== "viewer" || !$tocEntries.length} class:active={$tocVisible} onclick={() => action(toggleToc)}><List size={19} /></button>
      <button aria-label="Reading preferences" onclick={() => toggle("preferences")}>Aa</button>
    </div>
  {/if}
</header>

{#if panel}
  <button class="mobile-shade print:hidden" aria-label="Close panel" onclick={() => panel = null}></button>
  <dialog open class="mobile-panel print:hidden" aria-modal="true" aria-label={panel === "documents" ? "Open documents" : panel === "preferences" ? "Reading preferences" : "More options"}>
    <div class="mobile-panel-heading"><strong>{panel === "documents" ? "Open documents" : panel === "preferences" ? "Reading preferences" : "MDHero"}</strong><button aria-label="Close panel" onclick={() => panel = null}><X size={20} /></button></div>
    {#if panel === "documents"}
      <button class="mobile-row" onclick={() => action(() => tabStore.switchTab(HOME_TAB_ID))}>Home</button>
      {#each $tabs as tab (tab.id)}
        <div class="mobile-document" class:active={$activeTabId === tab.id}>
          <button class="mobile-row" onclick={() => action(() => tabStore.switchTab(tab.id))}>{tab.fileName}{tab.dirty ? " •" : ""}</button>
          <button aria-label={`Close ${tab.fileName}`} onclick={() => onClose(tab.id)}><X size={18} /></button>
        </div>
      {/each}
      <button class="mobile-row" onclick={() => action(newDocument)}>New document</button>
      <button class="mobile-row" onclick={() => action(() => void openFileDialog())}>Browse files…</button>
    {:else if panel === "preferences"}
      <ReaderControls visible />
    {:else}
      <button class="mobile-row" onclick={() => action(() => void openFileDialog())}>Open document…</button>
      <button class="mobile-row" onclick={() => action(newDocument)}>New document</button>
      <button class="mobile-row" onclick={() => action(onPaste)}>Paste Markdown</button>
      <button class="mobile-row" onclick={() => action(onUrl)}>Open URL</button>
      {#if $doc.filePath}
        <hr />
        <button class="mobile-row" onclick={() => action(onSave)} disabled={!dirty}>Save changes</button>
        <button class="mobile-row" onclick={() => action(onSaveAs)}>Save As…</button>
        <button class="mobile-row" onclick={() => copy(false)}>Copy as Markdown</button>
        <button class="mobile-row" onclick={() => copy(true)} disabled={mode !== "viewer"}>Copy as rich text</button>
        <button class="mobile-row" onclick={share}>Share document…</button>
        <button class="mobile-row" onclick={() => action(() => void printDocumentNative($doc.fileName ?? "MDHero").catch(e => showToast(`Printing failed: ${e}`)))} disabled={mode !== "viewer"}>Print / Save PDF…</button>
        <button class="mobile-row" onclick={() => action(onZen)}>Distraction-free reading</button>
        {#if canPresent}<button class="mobile-row" onclick={() => action(onPresent)}>Present slides</button>{/if}
        <button class="mobile-row" onclick={() => action(onAI)}>AI lookup / custom prompt…</button>
      {/if}
      <hr />
      <button class="mobile-row" onclick={() => themeMode.update(cycleTheme)}>Appearance: {$themeMode}</button>
      <button class="mobile-row" onclick={() => action(onSettings)}>Settings</button>
      <button class="mobile-row" onclick={() => action(onAbout)}>About MDHero</button>
    {/if}
  </dialog>
{/if}

<style>
  .mobile-toolbar { position: sticky; top: 0; z-index: 30; background: #fafafa; border-bottom: 1px solid #e5e5e5; padding-top: env(safe-area-inset-top); }
  :global(html.dark) .mobile-toolbar, :global(html.dark) .mobile-panel { background: #161618; border-color: #2c2c2e; }
  .mobile-top, .mobile-bottom { display: flex; align-items: center; min-height: 44px; gap: 2px; padding: 0 6px; }
  button { min-height: 44px; min-width: 44px; display: inline-flex; align-items: center; justify-content: center; color: inherit; background: transparent; border: none; }
  button:disabled { opacity: .35; }
  .mobile-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; padding-left: 6px; }
  .mobile-modes { display: flex; flex: 1; font-size: 12px; gap: 2px; }
  .mobile-modes button { padding: 0 7px; min-width: 42px; }
  .active { color: #0891b2; background: rgba(8,145,178,.07); border-radius: 5px; }
  .tab-count { font-size: 10px; padding-left: 2px; }
  .mobile-shade { position: fixed; inset: 0; z-index: 39; background: rgba(0,0,0,.25); width: 100%; }
  .mobile-panel { position: fixed; bottom: 0; left: 0; right: 0; z-index: 40; max-height: 80dvh; overflow: auto; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 10px 10px 0 0; padding: 8px 16px calc(16px + env(safe-area-inset-bottom)); font-size: 14px; }
  .mobile-panel-heading, .mobile-document { display: flex; align-items: center; justify-content: space-between; }
  .mobile-row { width: 100%; justify-content: flex-start; text-align: left; padding: 8px; overflow-wrap: anywhere; }
  .mobile-document .mobile-row { flex: 1; }
  hr { border-color: rgba(128,128,128,.2); margin: 8px 0; }
</style>
