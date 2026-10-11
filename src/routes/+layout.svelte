<script lang="ts">
  import "../app.css";
  import "../android.css";
  import { isAndroid } from "$lib/utils/platform";
  import { onMount } from "svelte";
  import { initThemeListener } from "$lib/stores/theme";

  onMount(() => {
    document.documentElement.classList.toggle("android", isAndroid);
    initThemeListener();
  });
</script>

<slot />
