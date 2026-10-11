<script lang="ts">
  let zoom = $state(1);
  let { visible = $bindable(false), src = "", images = [] as string[], index = $bindable(0) }: {
    visible: boolean;
    src: string;
    images: string[];
    index: number;
  } = $props();

  function close() { visible = false; zoom = 1; }

  function next() {
    zoom = 1;
    if (images.length > 1) {
      index = (index + 1) % images.length;
    }
  }

  function prev() {
    zoom = 1;
    if (images.length > 1) {
      index = (index - 1 + images.length) % images.length;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  $effect(() => {
    if (visible) {
      document.addEventListener("keydown", handleKeydown);
      return () => document.removeEventListener("keydown", handleKeydown);
    }
  });

  let currentSrc = $derived(images.length > 0 ? images[index] : src);
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div class="lightbox" onclick={handleBackdrop}>
    <button class="lb-close" onclick={close} aria-label="Close image">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="4" y1="4" x2="16" y2="16"/><line x1="16" y1="4" x2="4" y2="16"/></svg>
    </button>

    {#if images.length > 1}
      <button class="lb-nav lb-prev" onclick={prev} aria-label="Previous image">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="13,4 7,10 13,16"/></svg>
      </button>
      <button class="lb-nav lb-next" onclick={next} aria-label="Next image">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="7,4 13,10 7,16"/></svg>
      </button>
      <div class="lb-counter">{index + 1} / {images.length}</div>
    {/if}

    <div class="lb-stage">
      <img class="lb-image" src={currentSrc} alt="" style={zoom > 1 ? `max-width: none; max-height: none; width: ${zoom * 90}vw;` : undefined} />
    </div>
    <div class="lb-zoom">
      <button aria-label="Zoom out" onclick={() => zoom = Math.max(1, zoom - .5)}>−</button>
      <button aria-label="Reset zoom" onclick={() => zoom = 1}>{Math.round(zoom * 100)}%</button>
      <button aria-label="Zoom in" onclick={() => zoom = Math.min(5, zoom + .5)}>+</button>
    </div>
  </div>
{/if}

<style>
  .lb-stage { max-width: 100vw; max-height: 90vh; overflow: auto; }
  .lb-zoom { position: absolute; bottom: 48px; left: 50%; transform: translateX(-50%); display: flex; background: #222; color: white; border-radius: 5px; }
  .lb-zoom button { min-width: 44px; min-height: 44px; }
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(4px);
  }

  .lb-image {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 4px;
    user-select: none;
  }

  .lb-close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.1);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    transition: background 0.15s;
  }

  .lb-close:hover { background: rgba(255,255,255,0.2); }

  .lb-nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.1);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    transition: background 0.15s;
  }

  .lb-nav:hover { background: rgba(255,255,255,0.2); }
  .lb-prev { left: 16px; }
  .lb-next { right: 16px; }

  .lb-counter {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 13px;
    color: rgba(255,255,255,0.6);
    font-variant-numeric: tabular-nums;
  }
</style>
