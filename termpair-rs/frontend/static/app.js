"use strict";

const TERMPAIR_VERSION = "0.5.0";
const IV_LENGTH = 12;

const $ = (sel) => document.querySelector(sel);
const $id = (id) => document.getElementById(id);

// ---- Toast ----

function toast(msg, duration) {
  duration = duration || 5000;
  const container = $id("toast-container");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  container.appendChild(el);
  el.addEventListener("click", () => el.remove());
  setTimeout(() => el.remove(), duration);
}

// ---- Encryption (Web Crypto API, AES-128-GCM) ----

async function importAesKey(rawKeyData, usages) {
  return crypto.subtle.importKey(
    "raw",
    rawKeyData,
    { name: "AES-GCM" },
    false,
    usages
  );
}

function ivFromInteger(count) {
  const iv = new Uint8Array(IV_LENGTH);
  const a = [];
  a.unshift(count & 255);
  while (count >= 256) {
    count = count >>> 8;
    a.unshift(count & 255);
  }
  iv.set(a);
  return iv;
}

async function aesDecrypt(cryptoKey, encryptedPayload) {
  const iv = encryptedPayload.slice(0, IV_LENGTH);
  const ciphertext = encryptedPayload.slice(IV_LENGTH);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext
  );
  return new Uint8Array(plaintext);
}

async function aesEncrypt(cryptoKey, utf8String, ivCount) {
  const iv = ivFromInteger(ivCount);
  const encoded = new TextEncoder().encode(utf8String);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded
  );
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64urlToBytes(b64url) {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return base64ToBytes(b64);
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// ---- State ----

const state = {
  ws: null,
  xterm: null,
  aesKeys: { unix: null, browser: null, ivCount: null, maxIvCount: null },
  terminalData: null,
  terminalId: null,
  status: null,
  isPublic: false,
};

// ---- URL parsing ----

function getParams() {
  const pathMatch = window.location.pathname.match(/\/s\/([^/]+)/);
  const terminalId = pathMatch
    ? pathMatch[1]
    : new URLSearchParams(window.location.search).get("terminal_id");
  const hash = window.location.hash;
  const bootstrapKeyB64 = hash ? hash.substring(1) : null;
  return { terminalId, bootstrapKeyB64 };
}

function getServerBaseUrl() {
  const path = window.location.pathname.replace(/\/s\/.*$/, "/");
  return `${window.location.protocol}//${window.location.host}${path}`;
}

function httpToWs(url) {
  return url.replace(/^http/, "ws");
}

// ---- UI updates ----

function setStatus(status) {
  state.status = status;
  const bar = $id("status-bar");
  const text = $id("status-text");

  if (!status) {
    bar.style.display = "none";
    return;
  }

  bar.style.display = "flex";
  text.textContent = status;

  bar.className = status === "Connected" ? "connected" : "disconnected";
}

function updateBottomBar() {
  const dims = $id("terminal-dimensions");
  const access = $id("access-mode");
  const clients = $id("client-count");

  if (state.terminalData) {
    access.textContent = state.terminalData.allow_browser_control ? "read/write" : "read-only";
  }
}

function loadXtermAssets() {
  return new Promise((resolve) => {
    if (window.Terminal) { resolve(); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "xterm.min.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "xterm.min.js";
    script.onload = resolve;
    document.body.appendChild(script);
  });
}

function showTerminal() {
  $id("landing").style.display = "none";
  $id("terminal-view").style.display = "flex";
  $id("status-bar").style.display = "flex";
}

// ---- Terminal setup ----

function createXterm() {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const term = new Terminal({
    cursorBlink: true,
    macOptionIsMeta: true,
    scrollback: 5000,
    fontSize: 14,
    theme: {
      background: isLight ? "#ffffff" : "#0a0a0a",
      foreground: isLight ? "#1a1a1a" : "#e5e5e5",
      cursor: isLight ? "#1a1a1a" : "#e5e5e5",
    },
  });
  return term;
}

// ---- WebSocket message handlers ----

async function handleMessage(data) {
  switch (data.event) {
    case "new_output":
      await handleNewOutput(data);
      break;
    case "resize":
      handleResize(data);
      break;
    case "num_clients":
      handleNumClients(data);
      break;
    case "aes_keys":
      await handleAesKeys(data);
      break;
    case "aes_key_rotation":
      await handleKeyRotation(data);
      break;
    case "error":
      toast("Error: " + (data.payload || "unknown"));
      break;
    default:
      console.warn("unknown event:", data.event);
  }
}

async function handleNewOutput(data) {
  if (state.isPublic) {
    try {
      const raw = base64ToBytes(data.payload);
      const json = JSON.parse(new TextDecoder().decode(raw));
      const ptyOutput = base64ToBytes(json.pty_output);
      state.xterm.write(ptyOutput);
    } catch (e) {
      console.error("public output error:", e);
    }
    return;
  }
  if (!state.aesKeys.unix) return;
  try {
    const encrypted = base64ToBytes(data.payload);
    const decrypted = await aesDecrypt(state.aesKeys.unix, encrypted);
    const json = JSON.parse(new TextDecoder().decode(decrypted));
    const ptyOutput = base64ToBytes(json.pty_output);
    state.xterm.write(ptyOutput);
  } catch (e) {
    console.error("decrypt error:", e);
  }
}

function handleResize(data) {
  if (data.payload && data.payload.cols != null && data.payload.rows != null) {
    const cols = data.payload.cols;
    const rows = data.payload.rows;
    if (cols > 0 && rows > 0) {
      state.xterm.resize(cols, rows);
    }
    $id("terminal-dimensions").textContent = `${cols}x${rows}`;
  }
}

function handleNumClients(data) {
  const n = data.payload;
  $id("client-count").textContent = n === 1 ? "1 viewer" : `${n} viewers`;
}

async function handleAesKeys(data) {
  try {
    const { terminalId, bootstrapKeyB64 } = getParams();
    const bootstrapKeyData = base64urlToBytes(bootstrapKeyB64);
    const bootstrapKey = await importAesKey(bootstrapKeyData, ["decrypt"]);

    const unixKeyEncrypted = base64ToBytes(data.payload.b64_bootstrap_unix_aes_key);
    const unixKeyRaw = await aesDecrypt(bootstrapKey, unixKeyEncrypted);
    state.aesKeys.unix = await importAesKey(unixKeyRaw, ["decrypt"]);

    const browserKeyEncrypted = base64ToBytes(data.payload.b64_bootstrap_browser_aes_key);
    const browserKeyRaw = await aesDecrypt(bootstrapKey, browserKeyEncrypted);
    state.aesKeys.browser = await importAesKey(browserKeyRaw, ["encrypt"]);

    state.aesKeys.ivCount = parseInt(data.payload.iv_count, 10);
    state.aesKeys.maxIvCount = parseInt(data.payload.max_iv_count, 10);
  } catch (e) {
    console.error("failed to obtain encryption keys:", e);
    toast("Failed to obtain encryption keys. Is your key valid?");
    setStatus("Key Error");
  }
}

async function handleKeyRotation(data) {
  if (!state.aesKeys.unix) return;
  try {
    const newUnixRaw = await aesDecrypt(
      state.aesKeys.unix,
      base64ToBytes(data.payload.b64_aes_secret_unix_key)
    );
    const newBrowserRaw = await aesDecrypt(
      state.aesKeys.unix,
      base64ToBytes(data.payload.b64_aes_secret_browser_key)
    );
    state.aesKeys.unix = await importAesKey(newUnixRaw, ["decrypt"]);
    state.aesKeys.browser = await importAesKey(newBrowserRaw, ["encrypt"]);
  } catch (e) {
    console.error("key rotation failed:", e);
    toast("AES key rotation failed");
  }
}

// ---- Input handling ----

function getSalt() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(12)));
}

async function sendInput(input) {
  if (!state.terminalData?.allow_browser_control) {
    toast("Terminal is in read-only mode");
    return;
  }
  if (!state.aesKeys.browser || state.aesKeys.ivCount == null) {
    toast("Cannot type: encryption keys not available");
    return;
  }

  const payload = JSON.stringify({ data: input, salt: getSalt() });
  const encrypted = await aesEncrypt(
    state.aesKeys.browser,
    payload,
    state.aesKeys.ivCount++
  );

  state.ws.send(JSON.stringify({ event: "command", payload: encrypted }));

  if (state.aesKeys.ivCount >= state.aesKeys.maxIvCount) {
    state.ws.send(JSON.stringify({ event: "request_key_rotation" }));
    state.aesKeys.maxIvCount += 1000;
  }
}

function setupKeyHandler(xterm) {
  xterm.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown") return true;
    if (e.ctrlKey && e.shiftKey) {
      const key = e.key.toLowerCase();
      if (key === "v") {
        if (!state.terminalData?.allow_browser_control) {
          toast("Terminal is in read-only mode");
          return false;
        }
        navigator.clipboard.readText().then((text) => sendInput(text));
        return false;
      }
      if (key === "c" || key === "x") {
        const sel = xterm.getSelection();
        if (sel) navigator.clipboard.writeText(sel);
        xterm.focus();
        return false;
      }
    }
    return true;
  });
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// ---- Connection ----

async function connect(terminalId, bootstrapKeyB64) {
  const baseUrl = getServerBaseUrl();

  const resp = await fetch(`${baseUrl}terminal/${terminalId}`);
  if (resp.status !== 200) {
    toast("Terminal not found. Check the Terminal ID.");
    setStatus("Not Found");
    return;
  }

  state.terminalData = await resp.json();
  state.isPublic = state.terminalData.is_public || false;

  await loadXtermAssets();
  showTerminal();

  const xterm = createXterm();
  state.xterm = xterm;
  xterm.open($id("terminal"));

  setupKeyHandler(xterm);

  const wsUrl = `${httpToWs(baseUrl)}connect_browser_to_terminal?terminal_id=${terminalId}`;
  const ws = new WebSocket(wsUrl);
  state.ws = ws;

  setStatus("Connecting...");

  ws.addEventListener("open", () => {
    setStatus("Connected");

    const td = state.terminalData;
    const startedAt = td.broadcast_start_time_iso ? new Date(td.broadcast_start_time_iso) : null;
    const elapsed = startedAt ? formatElapsed(Date.now() - startedAt.getTime()) : "";

    if (state.isPublic) {
      const name = td.display_name || terminalId;
      xterm.writeln("\x1b[1mTermPair\x1b[0m \x1b[90m— live terminal\x1b[0m");
      xterm.writeln("");
      xterm.writeln(`\x1b[1;33mPublic session\x1b[0m — \x1b[1m${name}\x1b[0m`);
      xterm.writeln(`\x1b[90mThis is a public, read-only session. No encryption.\x1b[0m`);
      xterm.writeln("");
      if (td.command) xterm.writeln(`\x1b[90m  command:  \x1b[0m${td.command}`);
      xterm.writeln(`\x1b[90m  access:   \x1b[0mread-only`);
      if (elapsed) xterm.writeln(`\x1b[90m  sharing:  \x1b[0m${elapsed}`);
      xterm.writeln("");
    } else {
      const mode = td.allow_browser_control ? "read/write" : "read-only";
      xterm.writeln("\x1b[1mTermPair\x1b[0m \x1b[90m— secure terminal sharing\x1b[0m");
      xterm.writeln("");
      xterm.writeln("\x1b[1;32mConnected\x1b[0m with end-to-end encryption");
      xterm.writeln(`\x1b[90mThe server cannot read any transmitted data.\x1b[0m`);
      xterm.writeln("");
      if (td.command) xterm.writeln(`\x1b[90m  command:  \x1b[0m${td.command}`);
      xterm.writeln(`\x1b[90m  access:   \x1b[0m${mode}`);
      if (elapsed) xterm.writeln(`\x1b[90m  sharing:  \x1b[0m${elapsed}`);
      xterm.writeln("");
    }

    ws.send(JSON.stringify({ event: "request_terminal_dimensions" }));
    if (!state.isPublic) {
      ws.send(JSON.stringify({ event: "new_browser_connected", payload: {} }));
    }

    if (!state.isPublic) {
      xterm.onData((data) => sendInput(data));
    }
    xterm.focus();
    updateBottomBar();
    $id("terminal-dimensions").textContent = `${xterm.cols}x${xterm.rows}`;
  });

  ws.addEventListener("message", async (event) => {
    try {
      const data = JSON.parse(event.data);
      await handleMessage(data);
    } catch (e) {
      console.error("failed to parse message:", e);
    }
  });

  ws.addEventListener("close", () => {
    setStatus("Disconnected");
    xterm.writeln("");
    xterm.writeln("\x1b[1;31mTerminal session has ended\x1b[0m");
    $id("client-count").textContent = "";
  });

  ws.addEventListener("error", (event) => {
    console.error("websocket error:", event);
    toast("WebSocket connection error");
    setStatus("Error");
  });
}

// ---- Live Sessions ----

async function fetchSessions() {
  const container = $id("live-sessions");
  if (!container) return;

  try {
    const baseUrl = getServerBaseUrl();
    const resp = await fetch(`${baseUrl}api/sessions`);
    if (!resp.ok) return;
    const sessions = await resp.json();

    if (sessions.length === 0) {
      container.innerHTML = '<p class="no-sessions">No live sessions right now.</p>';
      $id("live-count").textContent = "";
      return;
    }

    $id("live-count").textContent = `(${sessions.length})`;

    container.innerHTML = sessions.map((s) => {
      const started = new Date(s.broadcast_start_time_iso);
      const elapsed = formatElapsed(Date.now() - started.getTime());
      const viewers = s.viewer_count === 1 ? "1 viewer" : `${s.viewer_count} viewers`;
      return `<a href="${baseUrl}s/${s.terminal_id}" class="session-card">
        <div class="session-name">${escapeHtml(s.display_name)}</div>
        <div class="session-meta">
          <span>${escapeHtml(s.command)}</span>
          <span>${viewers}</span>
          <span>${elapsed}</span>
        </div>
      </a>`;
    }).join("");
  } catch (e) {
    console.error("failed to fetch sessions:", e);
  }
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

setInterval(fetchSessions, 5000);

// ---- Init ----

function init() {
  $id("version").textContent = `v${TERMPAIR_VERSION}`;

  const baseUrl = getServerBaseUrl();
  const port = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
  const host = `${window.location.protocol}//${window.location.hostname}`;
  $id("share-command").textContent = `termpair share --host "${host}" --port ${port}`;
  $id("share-command-public").textContent = `termpair share --public --host "${host}" --port ${port}`;

  if (!window.isSecureContext) {
    $id("secure-warning").style.display = "block";
  }

  const { terminalId, bootstrapKeyB64 } = getParams();

  if (terminalId) {
    $id("input-terminal-id").value = terminalId;
  }
  if (bootstrapKeyB64) {
    $id("input-secret-key").value = bootstrapKeyB64;
  }
  if (terminalId && bootstrapKeyB64) {
    connect(terminalId, bootstrapKeyB64);
  } else if (terminalId && !bootstrapKeyB64) {
    connect(terminalId, null);
  }

  $id("connect-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const tid = $id("input-terminal-id").value.trim();
    const key = $id("input-secret-key").value.trim();
    if (!tid) { toast("Terminal ID cannot be empty"); return; }
    if (!key) { toast("Secret key cannot be empty"); return; }
    connect(tid, key);
  });

  fetchSessions();

  // theme
  const saved = localStorage.getItem("termpair-theme") || "dark";
  setTheme(saved);
  $id("theme-select").value = saved;
  $id("theme-select").addEventListener("change", (e) => {
    setTheme(e.target.value);
  });
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("termpair-theme", theme);
  if (state.xterm) {
    const bg = theme === "light" ? "#ffffff" : "#0a0a0a";
    const fg = theme === "light" ? "#1a1a1a" : "#e5e5e5";
    const cursor = theme === "light" ? "#1a1a1a" : "#e5e5e5";
    state.xterm.options.theme = { background: bg, foreground: fg, cursor };
  }
}

document.addEventListener("DOMContentLoaded", init);
