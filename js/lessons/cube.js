// One cubing.js viewer for both algorithms and the shared Bluetooth session.
const CUBING_MODULE = "https://cdn.cubing.net/v0/js/cubing/twisty";
const algText = (value) => String(value ?? "").trim();

// cubing.js renders its controls and scene in a CLOSED shadow root. Styles
// from css/lessons.css cannot reach these elements, even with !important.
// The documented canvas accessor gives us a reference to a descendant of that
// root, so we can size the existing internal grid without touching the WebGL
// canvas bitmap or depending on an open shadowRoot.
export async function stretchInnerViewer(player) {
  if (typeof player?.experimentalCurrentCanvases !== "function") return false;
  const canvases = await player.experimentalCurrentCanvases();
  for (const canvas of canvases ?? []) {
    let node = canvas;
    let grid = null;
    let visualization = null;
    // Cross shadow boundaries via host, just as the diagnostic did.
    for (let i = 0; node && i < 24; i++) {
      if (node.classList?.contains("controls-bottom-row")) grid = node;
      if (node.classList?.contains("visualization-wrapper")) visualization = node;
      if (node === player) break;
      node = node.parentElement ?? node.getRootNode?.()?.host ?? null;
    }
    if (!grid || !visualization) continue;

    const important = (element, property, value) =>
      element.style.setProperty(property, value, "important");
    important(grid, "box-sizing", "border-box");
    important(grid, "height", "100%");
    important(grid, "max-height", "none");
    important(grid, "min-height", "0");
    important(grid, "aspect-ratio", "auto");
    important(grid, "grid-template-rows", "minmax(0, 1fr) auto");
    important(visualization, "height", "100%");
    important(visualization, "min-height", "0");
    return true;
  }
  return false;
}

export class CubeManager {
  constructor() {
    this.TwistyPlayer = null;
    this.players = new Map();
    this.mode = "animated";
    this.liveMoves = [];
    // Size the custom element BEFORE connecting it to the DOM. Otherwise
    // cubing.js can first initialize its internal scene at the default 384x256.
    this.resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((changes) => {
      for (const change of changes) {
        const entry = this.players.get(change.target);
        if (entry) {
          this.sizePlayer(entry);
          if (entry.player) {
            this.applyInnerLayout(entry.player);
            this.scheduleAfterPaint(entry);
          }
        }
      }
    });
    // cubing.js initializes its 3D scene lazily. A section can be attached
    // before the browser has painted it, especially when presentation mode
    // toggles display:none. Recheck when it enters the viewport in any browser.
    this.intersectionObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((changes) => {
      for (const change of changes) {
        if (!change.isIntersecting) continue;
        const entry = this.players.get(change.target);
        if (!entry || entry.host.isConnected === false || !this.isVisible(entry)) continue;
        if (!entry.player || entry.renderedMode !== this.mode) this.mountEntry(entry);
        this.scheduleAfterPaint(entry);
      }
    }, { rootMargin: "150px" });
  }

  // The first layout pass does not guarantee cubing.js has drawn its canvas.
  // Retry after the next paint without recreating the player or its algorithm.
  scheduleAfterPaint(entry) {
    if (entry.afterPaintQueued || typeof requestAnimationFrame !== "function") return;
    entry.afterPaintQueued = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      entry.afterPaintQueued = false;
      if (this.players.get(entry.host) !== entry ||
          entry.host.isConnected === false || !this.isVisible(entry) || !entry.player) return;
      this.sizePlayer(entry);
      this.applyInnerLayout(entry.player);
    }));
  }

  sizePlayer(entry, player = entry.player) {
    if (!player?.style || !entry.host?.getBoundingClientRect) return;
    // A hidden slide has no usable dimensions; we'll retry when it is shown.
    const { width, height } = entry.host.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const w = `${Math.round(entry.host.clientWidth || width)}px`;
    const h = `${Math.round(entry.host.clientHeight || height)}px`;
    if (player.style.width !== w) player.style.width = w;
    if (player.style.height !== h) player.style.height = h;
  }

  applyInnerLayout(player) {
    // The first call waits until cubing.js has created its internal canvas.
    // Reapplying on a resize is harmless and handles scene reconstruction.
    void stretchInnerViewer(player).catch((error) => {
      console.warn("Could not resize cubing.js inner viewer", error);
    });
  }

  async preload() {
    const { TwistyPlayer } = await import(CUBING_MODULE);
    if (!TwistyPlayer) throw new Error("Nije učitan cubing.js TwistyPlayer.");
    this.TwistyPlayer = TwistyPlayer;
  }

  // A live player must never survive as an algorithm player. Remove it even
  // when its slide is hidden; hidden slides aren't visited by mountSections().
  discardPlayer(entry) {
    entry.player?.pause();
    entry.player = null;
    entry.renderedMode = null;
    entry.host.replaceChildren();
  }

  clearSections() {
    for (const entry of this.players.values()) {
      this.discardPlayer(entry);
      this.resizeObserver?.unobserve(entry.host);
      this.intersectionObserver?.unobserve(entry.host);
    }
    this.players.clear();
  }

  addSection(host, section) {
    if (!this.TwistyPlayer) throw new Error("cubing.js nije dostupan.");
    // Capture immutable CMS algorithms. Bluetooth moves only affect liveMoves.
    const entry = {
      host,
      demoAlg: algText(section.alg),
      demoSetupAlg: algText(section.setupAlg),
      player: null,
      renderedMode: null,
    };
    this.players.set(host, entry);
    // Observing the panel (not the player) avoids feedback loops.
    if (typeof Element !== "undefined" && host instanceof Element) {
      this.resizeObserver?.observe(host);
      this.intersectionObserver?.observe(host);
    }
    // During rendering the host is still in a detached DocumentFragment.
    if (host.isConnected !== false) this.mountSections();
    return entry.player;
  }

  isVisible(entry) {
    const section = entry.host.closest?.(".lesson-section");
    return !section || (section.getClientRects?.().length ?? 1) > 0;
  }

  mountSections() {
    for (const entry of this.players.values()) {
      if (entry.host.isConnected === false || !this.isVisible(entry)) continue;
      if (!entry.player || entry.renderedMode !== this.mode) this.mountEntry(entry);
      this.sizePlayer(entry);
      this.scheduleAfterPaint(entry);
    }
  }

  mountEntry(entry) {
    const live = this.mode === "live";
    const player = new this.TwistyPlayer({
      puzzle: "3x3x3",
      visualization: "3D",
      backView: "none",
      background: "none",
      hintFacelets: "none",
      viewerLink: "none",
      controlPanel: "bottom-row",
      experimentalSetupAlg: live ? "" : entry.demoSetupAlg,
      alg: live ? this.liveMoves.join(" ") : entry.demoAlg,
    });
    // The panel is already connected and visible here. Configure the player
    // before insertion so its internal canvas sees the final size at startup.
    this.sizePlayer(entry, player);
    entry.player?.pause();
    entry.host.replaceChildren(player);
    entry.player = player;
    entry.renderedMode = this.mode;
    this.applyInnerLayout(player);
    player.pause();
    if (live) player.jumpToEnd();
    else player.jumpToStart();
  }

  setMode(mode) {
    if (mode !== "animated" && mode !== "live") return;
    if (mode !== this.mode) {
      this.mode = mode;
      // Important: dispose *all* old viewers, including hidden slides.
      // Recreate visible ones from their original CMS algorithm or liveMoves.
      for (const entry of this.players.values()) this.discardPlayer(entry);
    }
    this.mountSections();
  }

  recordMove(move) {
    if (!/^[URFDLB](?:2|')?$/.test(move)) return;
    this.liveMoves.push(move);
    if (this.mode !== "live") return;
    for (const entry of this.players.values()) {
      if (!entry.player || entry.renderedMode !== "live") continue;
      // No need to update a player belonging to a hidden presentation slide.
      // When shown again, it will be reconstructed from the live move history.
      if (!this.isVisible(entry)) {
        this.discardPlayer(entry);
        continue;
      }
      try {
        entry.player.experimentalAddMove(move, { cancel: true });
      } catch (error) {
        console.warn("Live cube append failed", error);
        this.discardPlayer(entry);
        if (this.isVisible(entry)) this.mountEntry(entry);
      }
    }
  }

  syncSolved() {
    this.liveMoves = [];
    if (this.mode !== "live") return; // Never reset authored animations.
    for (const entry of this.players.values()) this.discardPlayer(entry);
    this.mountSections();
  }
}
