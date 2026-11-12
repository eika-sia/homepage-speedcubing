// Single shared Web Bluetooth connection for the whole /3x3/ page.
// The third-party dependency is built to vendor/smartcube.js once at dev time.

export function parseCubeMove(event) {
  if (typeof event?.move === "string") {
    const move = event.move.trim();
    if (/^[URFDLB](?:2|')?$/.test(move)) return move;
  }
  if (event?.move && typeof event.move.toString === "function") {
    const move = event.move.toString();
    if (/^[URFDLB](?:2|')?$/.test(move)) return move;
  }
  if (typeof event?.face === "string" && /^[URFDLB]$/.test(event.face)) {
    if (event.direction === -1 || event.direction === "ccw") return `${event.face}'`;
    if (event.direction === 2 || event.direction === -2) return `${event.face}2`;
    return event.face;
  }
  return null;
}

export class SmartCubeSession {
  constructor({ onMove, onStatus }) {
    this.onMove = onMove;
    this.onStatus = onStatus;
    this.connection = null;
    this.subscription = null;
    this.driver = null;
    this.ready = false;
    this.connecting = false;
    this.hasSynced = false;
  }

  notify(message = "") {
    this.onStatus({ connected: !!this.connection, ready: this.ready, connecting: this.connecting,
      name: this.deviceName ?? "", synced: this.hasSynced, message });
  }

  async preload() {
    try {
      const mod = await import("./vendor/smartcube.js");
      if (typeof mod.connectSmartCube !== "function") throw new Error("Nedostaje connectSmartCube().");
      this.driver = mod;
      this.ready = true;
      this.notify();
    } catch {
      this.ready = false;
      this.notify("Bluetooth driver nije izgraden. Kopiraj vendor/smartcube.js iz test projekta ili pokreni lesson-bluetooth/npm run build.");
    }
  }

  async connect() {
    if (this.connection || this.connecting) return;
    if (!navigator.bluetooth) throw new Error("Web Bluetooth nije dostupan. Koristi Chrome/Chromium na HTTPS-u ili localhostu.");
    if (!this.driver) throw new Error("Bluetooth driver nije ucitan.");
    this.connecting = true;
    this.notify();
    try {
      // connectSmartCube() must begin inside the user's click activation.
      const conn = await this.driver.connectSmartCube();
      this.connection = conn;
      this.deviceName = String(conn.device?.name || conn.bluetoothDevice?.name || "Pametna kocka");
      this.hasSynced = false;
      this.subscription = conn.events$.subscribe({
        next: (event) => {
          // Tornado V4 can report incorrect facelets. We intentionally use MOVE only.
          if (event?.type === "MOVE") {
            const move = parseCubeMove(event);
            if (move && this.hasSynced) this.onMove(move);
          }
          if (event?.type === "HARDWARE" && /disconnect/i.test(JSON.stringify(event))) {
            this.onDisconnected("Kocka je prekinula vezu.");
          }
        },
        error: (error) => this.onDisconnected(error?.message || "Greska Bluetooth veze."),
        complete: () => this.onDisconnected("Bluetooth veza je zavrsila."),
      });
      const device = conn.device ?? conn.bluetoothDevice;
      device?.addEventListener?.("gattserverdisconnected", () => this.onDisconnected("Kocka je odspojena."), { once: true });
      this.notify("Povezano. Najprije slozi fizicku kocku i odaberi 'Sinkroniziraj slozenu'.");
    } catch (error) {
      if (this.connection) this.disconnect();
      this.notify(error?.message || "Spajanje nije uspjelo.");
      throw error;
    } finally {
      this.connecting = false;
      this.notify();
    }
  }

  syncSolved() {
    // This does not send a command to the cube. Caller resets the virtual history.
    this.hasSynced = true;
    this.notify("Virtualna kocka postavljena na slozeno stanje.");
  }

  onDisconnected(message = "Odspojeno.") {
    this.subscription?.unsubscribe?.();
    this.subscription = null;
    this.connection = null;
    this.hasSynced = false;
    this.deviceName = "";
    this.notify(message);
  }

  disconnect() {
    const conn = this.connection;
    if (!conn) return;
    try { conn.disconnect?.(); } catch { /* hardware may already be disconnected */ }
    try { (conn.device ?? conn.bluetoothDevice)?.gatt?.disconnect?.(); } catch { /* ignored */ }
    this.onDisconnected();
  }
}
