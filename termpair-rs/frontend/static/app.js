"use strict";

const TERMPAIR_VERSION = "1.2.0";
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
  for (let i = 0; i < 8 && count > 0; i++) {
    iv[i] = count & 0xff;
    count = Math.floor(count / 256);
  }
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
  let bin = "";
  for (let i = 0; i < combined.length; i++) bin += String.fromCharCode(combined[i]);
  return btoa(bin);
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
  sessionEnded: false,
  broadcastStarted: false,
  chatName: null,
  chatOpen: false,
  chatMessages: [],
  chatUnread: 0,
  chatIvCount: 0,
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
  var banner = $id("session-banner");
  if (banner && status) {
    banner.style.display = "block";
    banner.textContent = status;
    if (status === "Connected" || status.indexOf("Connected") === 0) {
      banner.className = "connected";
    } else if (status === "Session ended" || status === "Connection lost") {
      banner.className = "ended";
    } else {
      banner.className = "waiting";
    }
  }
}

function showBanner(text, type) {
  var banner = $id("session-banner");
  if (!banner) return;
  banner.textContent = text;
  banner.className = type;
  banner.style.display = "block";
}

function hideBanner() {
  var banner = $id("session-banner");
  if (banner) banner.style.display = "none";
}

function showWelcomeBanner(xterm, terminalId) {
  var td = state.terminalData;
  var startedAt = td.broadcast_start_time_iso ? new Date(td.broadcast_start_time_iso) : null;
  var elapsed = startedAt ? formatElapsed(Date.now() - startedAt.getTime()) : "";
  var cols = xterm.cols || 80;
  var bar = "\x1b[90m" + "\u2500".repeat(Math.min(cols, 60)) + "\x1b[0m";

  if (state.isPublic) {
    var name = td.display_name || terminalId;
    xterm.writeln("");
    xterm.writeln("  \x1b[1mTermPair\x1b[0m \x1b[90m\u2014 live terminal sharing\x1b[0m");
    xterm.writeln("  \x1b[90mhttps://github.com/cs01/termpair\x1b[0m");
    xterm.writeln("");
    xterm.writeln("  " + bar);
    xterm.writeln("");
    xterm.writeln("  \x1b[1;33m\u25cf Public session\x1b[0m \u2014 \x1b[1m" + name + "\x1b[0m");
    xterm.writeln("  \x1b[90mThis is a public, read-only session. No encryption.\x1b[0m");
    xterm.writeln("");
    if (td.command) xterm.writeln("  \x1b[90m  command:  \x1b[0m" + td.command);
    xterm.writeln("  \x1b[90m  access:   \x1b[0mread-only");
    if (elapsed) xterm.writeln("  \x1b[90m  sharing:  \x1b[0m" + elapsed);
    xterm.writeln("");
    xterm.writeln("  " + bar);
    xterm.writeln("");
  } else {
    var mode = td.allow_browser_control ? "read/write" : "read-only";
    xterm.clear();
    xterm.writeln("");
    xterm.writeln("  \x1b[1mTermPair\x1b[0m \x1b[90m\u2014 secure terminal sharing\x1b[0m");
    xterm.writeln("  \x1b[90mhttps://github.com/cs01/termpair\x1b[0m");
    xterm.writeln("");
    xterm.writeln("  " + bar);
    xterm.writeln("");
    xterm.writeln("  \x1b[1;32m\u25cf Connected\x1b[0m \x1b[90m\u2014 end-to-end encrypted\x1b[0m");
    xterm.writeln("");
    if (td.command) xterm.writeln("  \x1b[90m  command:  \x1b[0m" + td.command);
    xterm.writeln("  \x1b[90m  access:   \x1b[0m" + mode);
    if (elapsed) xterm.writeln("  \x1b[90m  sharing:  \x1b[0m" + elapsed);
    xterm.writeln("");
    xterm.writeln("  " + bar);
    xterm.writeln("");
  }
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
  $id("chat-sidebar").style.display = "flex";
  var isMobile = window.innerWidth <= 768;
  if (isMobile) {
    $id("chat-sidebar").style.display = "none";
    $id("chat-bar").style.display = "flex";
  }
  if (!state.chatName) {
    state.chatName = generateChatName();
    $id("chat-name").value = state.chatName;
  }
  $id("chat-name").addEventListener("change", function() {
    state.chatName = this.value.trim() || generateChatName();
    this.value = state.chatName;
  });
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
    case "start_broadcast":
      state.broadcastStarted = true;
      hideBanner();
      if (state.xterm) state.xterm.clear();
      break;
    case "chat":
      await handleChatMessage(data);
      break;
    case "session_ended":
      state.sessionEnded = true;
      setStatus("Session ended");
      $id("client-count").textContent = "";
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
    if (!bootstrapKeyB64) {
      toast("No encryption key found in URL. Cannot decrypt.");
      setStatus("Key Error");
      return;
    }
    const bootstrapKeyData = base64urlToBytes(bootstrapKeyB64);
    const bootstrapKey = await importAesKey(bootstrapKeyData, ["decrypt"]);

    const unixKeyEncrypted = base64ToBytes(data.payload.b64_bootstrap_unix_aes_key);
    const unixKeyRaw = await aesDecrypt(bootstrapKey, unixKeyEncrypted);
    state.aesKeys.unix = await importAesKey(unixKeyRaw, ["encrypt", "decrypt"]);

    const browserKeyEncrypted = base64ToBytes(data.payload.b64_bootstrap_browser_aes_key);
    const browserKeyRaw = await aesDecrypt(bootstrapKey, browserKeyEncrypted);
    state.aesKeys.browser = await importAesKey(browserKeyRaw, ["encrypt"]);

    state.aesKeys.ivCount = parseInt(data.payload.iv_count, 10);
    state.aesKeys.maxIvCount = parseInt(data.payload.max_iv_count, 10);
    if (!state.broadcastStarted) {
      state.broadcastStarted = true;
      hideBanner();
      if (state.xterm) {
        showWelcomeBanner(state.xterm, terminalId);
      }
    }
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
    state.aesKeys.unix = await importAesKey(newUnixRaw, ["encrypt", "decrypt"]);
    state.aesKeys.browser = await importAesKey(newBrowserRaw, ["encrypt"]);
    state.aesKeys.ivCount = parseInt(data.payload.iv_count, 10) || 0;
    state.aesKeys.maxIvCount = parseInt(data.payload.max_iv_count, 10) || state.aesKeys.maxIvCount;
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
  if (state.sessionEnded) {
    toast("Session has ended");
    return;
  }
  if (!state.terminalData?.allow_browser_control) {
    toast("Terminal is in read-only mode");
    return;
  }
  if (!state.broadcastStarted) {
    toast("Waiting for the terminal to start broadcasting...");
    return;
  }
  if (!state.aesKeys.browser || state.aesKeys.ivCount == null) {
    toast("Waiting for encryption keys...");
    return;
  }

  if (state.aesKeys.ivCount >= state.aesKeys.maxIvCount) {
    state.ws.send(JSON.stringify({ event: "request_key_rotation" }));
    toast("Waiting for key rotation...");
    return;
  }

  const payload = JSON.stringify({ data: input, salt: getSalt() });
  const encrypted = await aesEncrypt(
    state.aesKeys.browser,
    payload,
    state.aesKeys.ivCount++
  );

  state.ws.send(JSON.stringify({ event: "command", payload: encrypted }));

  if (state.aesKeys.ivCount >= state.aesKeys.maxIvCount - 100) {
    state.ws.send(JSON.stringify({ event: "request_key_rotation" }));
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

// ---- Chat ----

const CHAT_ADJECTIVES = ["brave","calm","clever","cosmic","daring","eager","fierce","golden","keen","lively","mighty","noble","quick","sharp","swift","vivid","warm","wild","wise","steady"];
const CHAT_NOUNS = ["aurora","badger","canyon","comet","crane","eagle","falcon","fox","glacier","hawk","jade","lark","luna","maple","nebula","oak","otter","raven","sage","wolf"];
const CHAT_IV_OFFSET = 10000000;
const CHAT_MAX_MESSAGES = 200;

function generateChatName() {
  var adj = CHAT_ADJECTIVES[Math.floor(Math.random() * CHAT_ADJECTIVES.length)];
  var noun = CHAT_NOUNS[Math.floor(Math.random() * CHAT_NOUNS.length)];
  return adj + "-" + noun;
}

function toggleChat() {
  var sidebar = $id("chat-sidebar");
  var chatBar = $id("chat-bar");
  var isVisible = sidebar.style.display !== "none";
  if (isVisible) {
    sidebar.style.display = "none";
    if (chatBar) chatBar.style.display = "flex";
    state.chatOpen = false;
  } else {
    sidebar.style.display = "flex";
    if (chatBar) chatBar.style.display = "none";
    state.chatOpen = true;
    state.chatUnread = 0;
    $id("chat-badge").style.display = "none";
    setTimeout(function() { $id("chat-input").focus(); }, 100);
  }
}

async function handleChatMessage(data) {
  var chatData;
  if (state.isPublic) {
    chatData = data.payload;
  } else {
    if (!state.aesKeys.unix) return;
    try {
      var encrypted = base64ToBytes(data.payload);
      var decrypted = await aesDecrypt(state.aesKeys.unix, encrypted);
      chatData = JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) {
      console.error("chat decrypt error:", e);
      return;
    }
  }
  if (!chatData || !chatData.message) return;
  var isSelf = chatData.sender === state.chatName;
  state.chatMessages.push(chatData);
  if (state.chatMessages.length > CHAT_MAX_MESSAGES) {
    state.chatMessages.shift();
    var el = $id("chat-messages").firstChild;
    if (el) el.remove();
  }
  renderChatMessage(chatData, isSelf);
  if (!state.chatOpen) {
    state.chatUnread++;
    var badge = $id("chat-badge");
    badge.textContent = state.chatUnread > 99 ? "99+" : state.chatUnread;
    badge.style.display = "flex";
  }
}

function renderChatMessage(msg, isSelf) {
  var container = $id("chat-messages");
  var div = document.createElement("div");
  div.className = "chat-msg" + (isSelf ? " self" : "");
  var time = new Date(msg.timestamp);
  var timeStr = time.getHours().toString().padStart(2, "0") + ":" + time.getMinutes().toString().padStart(2, "0");
  div.innerHTML = '<div class="chat-sender">' + escapeHtml(msg.sender) + '</div><div class="chat-text">' + escapeHtml(msg.message) + '</div><div class="chat-time">' + timeStr + '</div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function sendChatMessage(text) {
  if (!state.ws || !text.trim()) return;
  if (state.sessionEnded) { toast("Session has ended"); return; }
  var payload = { sender: state.chatName, message: text.trim(), timestamp: Date.now() };
  var msg;
  if (state.isPublic) {
    msg = JSON.stringify({ event: "chat", payload: payload });
  } else {
    if (!state.aesKeys.unix) { toast("Waiting for encryption keys..."); return; }
    state.chatIvCount++;
    var encrypted = await aesEncrypt(state.aesKeys.unix, JSON.stringify(payload), CHAT_IV_OFFSET + state.chatIvCount);
    msg = JSON.stringify({ event: "chat", payload: encrypted });
  }
  state.ws.send(msg);
}

function handleChatSubmit(e) {
  e.preventDefault();
  var input = $id("chat-input");
  if (input.value.trim()) {
    sendChatMessage(input.value);
    input.value = "";
  }
  return false;
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

  state.broadcastStarted = state.isPublic;

  await loadXtermAssets();
  showTerminal();

  const xterm = createXterm();
  state.xterm = xterm;
  xterm.open($id("terminal"));
  $id("terminal").addEventListener("click", function() { xterm.focus(); });

  if (!state.broadcastStarted) {
    setStatus("Waiting for terminal to start...");
  }

  setupKeyHandler(xterm);

  let firstConnect = true;
  let reconnectAttempt = 0;
  let reconnectStartTime = null;
  const MAX_RECONNECT_DELAY = 30000;
  const MAX_RECONNECT_TIME = 300000;

  function connectWs() {
    const wsUrl = `${httpToWs(baseUrl)}connect_browser_to_terminal?terminal_id=${encodeURIComponent(terminalId)}`;
    const ws = new WebSocket(wsUrl);
    state.ws = ws;

    if (firstConnect) {
      setStatus("Connecting...");
    }

    ws.addEventListener("open", () => {
      reconnectAttempt = 0;
      reconnectStartTime = null;
      setStatus(state.isPublic ? "Connected — public session" : "Connected — end-to-end encrypted");

      if (firstConnect) {
        firstConnect = false;

        if (state.isPublic) {
          showWelcomeBanner(xterm, terminalId);
        }

        if (!state.isPublic) {
          xterm.onData((data) => sendInput(data));
        }
      }

      ws.send(JSON.stringify({ event: "request_terminal_dimensions" }));
      if (!state.isPublic) {
        ws.send(JSON.stringify({ event: "new_browser_connected", payload: {} }));
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

    ws.addEventListener("close", (event) => {
      if (state.sessionEnded) return;
      const cleanClose = event.code === 1000 || event.code === 1001;
      if (!reconnectStartTime) reconnectStartTime = Date.now();
      if (cleanClose || Date.now() - reconnectStartTime > MAX_RECONNECT_TIME) {
        state.sessionEnded = true;
        setStatus("Session ended");
        $id("client-count").textContent = "";
        return;
      }
      const base = Math.min(1000 * Math.pow(2, reconnectAttempt), MAX_RECONNECT_DELAY);
      const delay = base * (0.5 + Math.random() * 0.5);
      reconnectAttempt++;
      setStatus(`Reconnecting (${reconnectAttempt})...`);
      setTimeout(connectWs, delay);
    });

    ws.addEventListener("error", (event) => {
      console.error("websocket error:", event);
    });
  }

  connectWs();
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

    container.innerHTML = "";
    sessions.forEach((s) => {
      const started = new Date(s.broadcast_start_time_iso);
      const elapsed = formatElapsed(Date.now() - started.getTime());
      const viewers = s.viewer_count === 1 ? "1 viewer" : `${s.viewer_count} viewers`;

      const a = document.createElement("a");
      a.href = `${baseUrl}s/${encodeURIComponent(s.terminal_id)}`;
      a.className = "session-card";

      const nameDiv = document.createElement("div");
      nameDiv.className = "session-name";
      nameDiv.textContent = s.display_name;

      const metaDiv = document.createElement("div");
      metaDiv.className = "session-meta";
      const cmdSpan = document.createElement("span");
      cmdSpan.textContent = s.command;
      const viewerSpan = document.createElement("span");
      viewerSpan.textContent = viewers;
      const elapsedSpan = document.createElement("span");
      elapsedSpan.textContent = elapsed;
      metaDiv.append(cmdSpan, viewerSpan, elapsedSpan);

      a.append(nameDiv, metaDiv);
      container.appendChild(a);
    });
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

function applyThemeConfig() {
  try {
    var meta = document.querySelector('meta[name="termpair-theme"]');
    if (!meta) return;
    var cfg = JSON.parse(meta.getAttribute("content"));
    if (!cfg || cfg.name === "termpair") return;

    if (cfg.cssVars) {
      var root = document.documentElement;
      Object.keys(cfg.cssVars).forEach(function(k) { root.style.setProperty(k, cfg.cssVars[k]); });
    }
    if (cfg.logoHtml) {
      var logo = document.querySelector(".logo");
      if (logo) logo.innerHTML = cfg.logoHtml;
    }
    if (cfg.heroLogoHtml) {
      var heroWrap = document.querySelector(".hero-logo-wrap");
      if (heroWrap) heroWrap.innerHTML = cfg.heroLogoHtml;
    }
    if (cfg.tagline) {
      var tagline = document.querySelector(".hero-tagline");
      if (tagline) tagline.textContent = cfg.tagline;
    }
    if (cfg.appName) document.title = cfg.appName;
    if (cfg.githubUrl) {
      var ghLink = document.querySelector(".topbar-right a[aria-label*='GitHub']");
      if (ghLink) ghLink.href = cfg.githubUrl;
    }
    if (cfg.installCmd) {
      var installCode = document.querySelector("#quickstart .code-block code");
      if (installCode) installCode.textContent = cfg.installCmd;
    }
    if (cfg.shareCmd) {
      var sc = $id("share-command");
      if (sc) sc.textContent = cfg.shareCmd;
    }
    if (cfg.shareCmdPublic) {
      var scp = $id("share-command-public");
      if (scp) scp.textContent = cfg.shareCmdPublic;
    }
    var features = document.querySelector("[data-section='features']");
    if (features && cfg.showFeatures === false) features.style.display = "none";
    var callout = document.querySelector("[data-section='callout']");
    if (callout && cfg.showCallout === false) callout.style.display = "none";
    var disclaimer = $id("disclaimer");
    if (disclaimer && cfg.showDisclaimer) {
      disclaimer.textContent = cfg.disclaimerText || "";
      disclaimer.style.display = "block";
    }
    if (cfg.footerLinks) {
      var footerEl = document.querySelector(".footer-links");
      if (footerEl) {
        footerEl.innerHTML = cfg.footerLinks.map(function(l) { return '<a href="' + l.url + '">' + l.text + '</a>'; }).join(" &middot; ");
      }
    }
    var themeSelect = $id("theme-select");
    if (themeSelect && cfg.name !== "termpair") themeSelect.style.display = "none";
  } catch (e) {
    console.warn("theme config error:", e);
  }
}

function init() {
  applyThemeConfig();

  const baseUrl = getServerBaseUrl().replace(/\/$/, "");
  const port = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
  $id("share-command").textContent = `termpair --host "${baseUrl}" --port ${port}`;
  $id("share-command-public").textContent = `termpair --public --host "${baseUrl}" --port ${port}`;

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

  var saved = localStorage.getItem("termpair-theme") || "dark";
  setTheme(saved);
  var sel = $id("theme-select");
  if (sel) {
    sel.value = saved;
    sel.addEventListener("change", (e) => { setTheme(e.target.value); });
  }

  var copyIcon = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy';
  document.querySelectorAll(".copy-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var text = btn.previousElementSibling.textContent.trim();
      navigator.clipboard.writeText(text);
      btn.innerHTML = "Copied!";
      setTimeout(function() { btn.innerHTML = copyIcon; }, 1500);
    });
  });

  var chatMinBtn = $id("chat-minimize-btn");
  if (chatMinBtn) chatMinBtn.addEventListener("click", toggleChat);

  var chatForm = $id("chat-form");
  if (chatForm) chatForm.addEventListener("submit", handleChatSubmit);

  var chatBar = $id("chat-bar");
  if (chatBar) chatBar.addEventListener("click", toggleChat);
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
