// ============================================================================
// Redstone Launcher (RL) — interface
// ============================================================================

// ---------------- utilitaires ----------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const api = {
  async get(path) {
    const r = await fetch(path);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Erreur");
    return j;
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Erreur");
    return j;
  },
  async del(path) {
    const r = await fetch(path, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Erreur");
    return j;
  },
  async upload(path, formData) {
    const r = await fetch(path, { method: "POST", body: formData });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Erreur");
    return j;
  },
};

const fmtSize = (b) => {
  if (!b && b !== 0) return "—";
  if (b === 0) return "0 o";
  if (b > 1 << 30) return (b / (1 << 30)).toFixed(1) + " Go";
  if (b > 1 << 20) return (b / (1 << 20)).toFixed(0) + " Mo";
  if (b > 1 << 10) return (b / (1 << 10)).toFixed(0) + " Ko";
  return b + " o";
};

const TYPE_LABEL = {
  release: "Release", snapshot: "Snapshot", old_beta: "Bêta", old_alpha: "Alpha", custom: "Personnalisée",
};

let toastTimer = null;
function toast(msg, kind = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "toast hidden"; }, 4200);
}

// ---------------- état ----------------
let VERSIONS = [];
let CURRENT_VERSION = null;
let ACCOUNTS = [];
let SETTINGS = {};
let filter = "all";
let query = "";
let pollTimer = null;
let logTimer = null;
let installedMap = {}; // vid -> {installed, size}

// ---------------- apparence / thèmes ----------------
const THEMES = {
  "github-dark": { name: "GitHub Dark", c: ["#0d1117", "#21262d", "#58a6ff"] },
  "midnight":    { name: "Minuit",      c: ["#0a0e1a", "#1c2536", "#7aa2ff"] },
  "forest":      { name: "Forêt",       c: ["#0b1310", "#1d3027", "#3fb950"] },
  "dracula":     { name: "Dracula",     c: ["#12101f", "#2a2744", "#bd93f9"] },
  "sunset":      { name: "Coucher",     c: ["#17100d", "#33221a", "#ff9e64"] },
  "ocean":       { name: "Océan",       c: ["#0b1220", "#1d3152", "#38bdf8"] },
  "nord":        { name: "Nord",        c: ["#11151d", "#242c37", "#88c0d0"] },
};

const BG_PRESETS = {
  auto:     ["rgba(88,166,255,.09)", "rgba(63,185,80,.05)",  "rgba(230,73,45,.04)"],
  redstone: ["rgba(255,107,61,.14)", "rgba(230,73,45,.06)",  "rgba(255,220,180,.03)"],
  emerald:  ["rgba(63,185,80,.14)",  "rgba(46,160,67,.06)",  "rgba(210,255,220,.03)"],
  blue:     ["rgba(56,139,253,.16)", "rgba(88,166,255,.06)", "rgba(190,220,255,.03)"],
  purple:   ["rgba(188,140,255,.15)", "rgba(140,90,220,.06)", "rgba(240,220,255,.03)"],
  plain:    ["transparent", "transparent", "transparent"],
};

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "88,166,255";
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

function shadeHex(hex, amt) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const to = (v) => {
    v = parseInt(v, 16) + amt;
    return Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  };
  return "#" + to(m[1]) + to(m[2]) + to(m[3]);
}

function applyAppearance(app) {
  app = app || {};
  const preset = app.preset || "github-dark";
  document.body.dataset.theme = preset;
  document.body.dataset.anim = app.anim === false ? "off" : "on";

  // Couleur d'accent personnalisée (sinon celle du thème CSS)
  const baseAccent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#58a6ff";
  const accent = app.accent && /^#([a-f\d]{3}|[a-f\d]{6})$/i.test(app.accent)
    ? app.accent : (preset === "github-dark" ? baseAccent : baseAccent);
  if (app.accent && /^#([a-f\d]{3}|[a-f\d]{6})$/i.test(app.accent)) {
    document.documentElement.style.setProperty("--accent", app.accent);
    document.documentElement.style.setProperty("--accent-dim", shadeHex(app.accent, -45));
    document.documentElement.style.setProperty("--glow-blue", `rgba(${hexToRgb(app.accent)},.2)`);
  } else {
    document.documentElement.style.removeProperty("--accent");
    document.documentElement.style.removeProperty("--accent-dim");
    document.documentElement.style.removeProperty("--glow-blue");
  }

  // Halo du logo (torche) : on/off via classe CSS
  document.body.classList.toggle("no-logo-glow", app.glow === false);

  // Fond
  const bgSet = BG_PRESETS[app.bg] || BG_PRESETS.auto;
  document.documentElement.style.setProperty("--bg-glow-1", bgSet[0]);
  document.documentElement.style.setProperty("--bg-glow-2", bgSet[1]);
  document.documentElement.style.setProperty("--bg-glow-3", bgSet[2]);
}

function themeTileSwatches(id) {
  const t = THEMES[id];
  return `<span class="tt-swatch"><i style="background:${t.c[0]}"></i><i style="background:${t.c[1]}"></i><i style="background:${t.c[2]}"></i></span>`;
}

function renderThemeGrid(app) {
  const grid = $("#themeGrid");
  if (!grid) return;
  grid.innerHTML = Object.entries(THEMES).map(([id, t]) =>
    `<button class="theme-tile${app.preset === id ? " active" : ""}" data-theme-id="${id}">` +
      themeTileSwatches(id) + `<span class="tt-name">${t.name}</span></button>`
  ).join("");
  grid.querySelectorAll(".theme-tile").forEach((b) => {
    b.onclick = () => {
      grid.querySelectorAll(".theme-tile").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      draftAppearance.preset = b.dataset.themeId;
      applyAppearance(draftAppearance);
      syncAppearanceControls(draftAppearance);
    };
  });
}

let draftAppearance = { preset: "github-dark", accent: "", glow: true, anim: true, bg: "auto" };

function syncAppearanceControls(app) {
  if ($("#accentColor")) $("#accentColor").value = app.accent || (THEMES[app.preset] || THEMES["github-dark"]).c[2];
  if ($("#accentHex")) $("#accentHex").textContent = app.accent || (THEMES[app.preset] || THEMES["github-dark"]).c[2];
  if ($("#themeGlow")) $("#themeGlow").checked = app.glow !== false;
  if ($("#themeAnim")) $("#themeAnim").checked = app.anim !== false;
  if ($("#themeBg")) $("#themeBg").value = app.bg || "auto";
  renderThemeGrid(app);
}

function loadAppearance() {
  const app = (SETTINGS.appearance && typeof SETTINGS.appearance === "object")
    ? SETTINGS.appearance : {};
  draftAppearance = {
    preset: app.preset || "github-dark",
    accent: app.accent || "",
    glow: app.glow !== false,
    anim: app.anim !== false,
    bg: app.bg || "auto",
  };
  applyAppearance(draftAppearance);
  syncAppearanceControls(draftAppearance);
}

async function saveAppearance() {
  try {
    await api.post("/api/settings", { appearance: draftAppearance });
    SETTINGS.appearance = draftAppearance;
    if ($("#appearanceStatus")) $("#appearanceStatus").textContent = "✓ Apparence enregistrée.";
    return true;
  } catch (e) {
    if ($("#appearanceStatus")) $("#appearanceStatus").textContent = "✕ Erreur : " + e.message;
    return false;
  }
}

// ---------------- navigation par vues ----------------
function switchView(name) {
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + name));
  if (name === "servers") loadServers();
  if (name === "accounts") loadAccounts();
  if (name === "bedrock") loadBedrockStatus();
  if (name === "settings") { loadSettings(); refreshJavaHint(); loadDiskStats(); }
}

// ---------------- versions ----------------
async function loadVersions(force) {
  const data = await api.get("/api/versions" + (force ? "?force=1" : ""));
  VERSIONS = data.versions;
  renderList();
  // Restaure la version sélectionnée (si elle est dans la liste)
  const sel = CURRENT_VERSION || data.selected;
  if (sel && VERSIONS.some((v) => v.id === sel)) selectVersion(sel, false);
  // Rafraîchit les badges "installé" en arrière-plan
  refreshAllInstalled();
  return data;
}

function filteredVersions() {
  const q = query.trim().toLowerCase();
  return VERSIONS.filter((v) => {
    if (filter !== "all" && v.type !== filter) return false;
    if (q && !v.id.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderList() {
  const list = $("#versionList");
  list.innerHTML = "";
  const items = filteredVersions();
  const count = $("#filterCount");
  if (count) count.textContent = items.length + " version(s)";
  if (!items.length) {
    list.innerHTML = '<div class="muted" style="padding:16px;text-align:center">Aucune version.</div>';
    return;
  }
  for (const v of items) {
    const li = document.createElement("li");
    li.className = "version-item" + (CURRENT_VERSION === v.id ? " selected" : "");
    const inst = installedMap[v.id];
    li.innerHTML =
      `<span class="vleft">` +
        `<span class="vname">${escapeHtml(v.id)}</span>` +
        (inst && inst.installed ? `<span class="vinst" title="Installée">✓</span>` : "") +
      `</span>` +
      `<span class="vtype ${v.type}">${TYPE_LABEL[v.type] || v.type}</span>`;
    li.onclick = () => selectVersion(v.id);
    list.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function selectVersion(id, persist = true) {
  CURRENT_VERSION = id;
  renderList();
  if (persist) api.post("/api/select", { version: id }).catch(() => {});
  $("#emptyState").classList.add("hidden");
  $("#detailPane").classList.remove("hidden");
  try {
    const d = await api.get("/api/version/" + encodeURIComponent(id));
    $("#dVersion").textContent = d.id;
    $("#dType").textContent = TYPE_LABEL[d.type] || d.type;
    $("#dType").className = "badge " + d.type;
    $("#dDate").textContent = d.release_time ? new Date(d.release_time).toLocaleDateString("fr-FR") : "";
    $("#dJava").textContent = d.java ? "Java " + d.java : "Java 8";
    $("#dSizeClient").textContent = fmtSize(d.size_client);
    $("#dSizeAssets").textContent = fmtSize(d.size_assets);
    refreshJavaHint(d.java);
    refreshInstalledStatus(id);
  } catch (e) {
    toast("Erreur version : " + e.message);
  }
}

async function refreshInstalledStatus(id) {
  try {
    const s = await api.get("/api/version/" + encodeURIComponent(id) + "/installed");
    installedMap[id] = s;
    const chip = $("#dInstalled");
    const sizeEl = $("#dSizeInstalled");
    if (s.installed) {
      chip.textContent = "✓ Installée";
      chip.classList.remove("hidden");
      sizeEl.textContent = fmtSize(s.size);
    } else {
      chip.classList.add("hidden");
      sizeEl.textContent = "—";
    }
    renderList();
  } catch (e) { /* silencieux */ }
}

async function refreshAllInstalled() {
  const ids = VERSIONS.slice(0, 60).map((v) => v.id);
  await Promise.all(ids.map(async (id) => {
    try {
      const s = await api.get("/api/version/" + encodeURIComponent(id) + "/installed");
      installedMap[id] = s;
    } catch (e) { /* silencieux */ }
  }));
  renderList();
}

// ---------------- comptes ----------------
async function loadAccounts() {
  const d = await api.get("/api/accounts");
  ACCOUNTS = d.accounts;
  renderAccountSelect(d.selected);
  renderAccountList();
}

function renderAccountSelect(selectedId) {
  const sel = $("#accountSelect");
  if (!sel) return;
  sel.innerHTML = "";
  if (!ACCOUNTS.length) {
    sel.innerHTML = '<option value="">Aucun compte — ajoute-en un</option>';
  } else {
    for (const a of ACCOUNTS) {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = a.label || a.username;
      sel.appendChild(opt);
    }
    if (selectedId && ACCOUNTS.some((a) => a.id === selectedId)) {
      sel.value = selectedId;
    }
  }
}

function renderAccountList() {
  const box = $("#accountList");
  if (!box) return;
  box.innerHTML = "";
  if (!ACCOUNTS.length) {
    box.innerHTML = '<div class="muted" style="padding:8px 0">Aucun compte pour l\'instant.</div>';
    return;
  }
  for (const a of ACCOUNTS) {
    const div = document.createElement("div");
    div.className = "account-item";
    const idEnc = encodeURIComponent(a.id);
    const skinSrc = a.has_skin ? `/api/accounts/${idEnc}/skin.png?t=${Date.now()}` : "";
    div.innerHTML =
      `<div class="acc-main">` +
        (skinSrc
          ? `<img class="acc-skin" src="${skinSrc}" alt="skin">`
          : `<div class="acc-skin placeholder">?</div>`) +
        `<div class="acc-id"><div class="acc-name">${escapeHtml(a.username)}</div>` +
        `<div class="acc-type">${a.type === "microsoft" ? "Microsoft" : "Local (hors-ligne)"}</div></div>` +
      `</div>` +
      `<div class="acc-actions">` +
        `<label class="btn small ghost" title="Ajouter / remplacer le skin (PNG 64x64 ou 128x128)">Skin` +
          `<input type="file" accept="image/png" class="hidden" data-skin="${idEnc}"></label>` +
        (a.has_skin
          ? `<button class="btn small ghost" data-skindel="${idEnc}" title="Retirer le skin">✕ Skin</button>` : "") +
        `<button class="acc-del" title="Supprimer le compte" data-del="${idEnc}">✕</button>` +
      `</div>`;
    div.querySelector("[data-del]").onclick = async () => {
      if (!confirm("Supprimer le compte « " + a.username + " » ?")) return;
      await api.del("/api/accounts/" + idEnc);
      await loadAccounts();
    };
    const fileInput = div.querySelector("[data-skin]");
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append("file", file);
      try {
        await api.upload("/api/accounts/" + idEnc + "/skin", fd);
        toast("Skin ajouté à « " + a.username + " ».");
        await loadAccounts();
      } catch (err) { toast("Erreur skin : " + err.message, "err"); }
      fileInput.value = "";
    };
    const delSkin = div.querySelector("[data-skindel]");
    if (delSkin) delSkin.onclick = async () => {
      await api.del("/api/accounts/" + idEnc + "/skin");
      toast("Skin retiré.");
      await loadAccounts();
    };
    box.appendChild(div);
  }
}

// ---------------- réglages ----------------
async function loadSettings() {
  const d = await api.get("/api/settings");
  SETTINGS = d.settings;
  const rs = $("#ramSlider");
  if (rs) {
    rs.value = SETTINGS.ram_mb || 2048;
    $("#ramLabel").textContent = (SETTINGS.ram_mb || 2048) + " Mo";
  }
  if ($("#setJava")) $("#setJava").value = SETTINGS.java_override || "";
  if ($("#setAutoJava")) $("#setAutoJava").checked = SETTINGS.auto_install_java !== false;
  if ($("#setFullscreen")) $("#setFullscreen").checked = SETTINGS.fullscreen === true;
  if ($("#setWidth")) $("#setWidth").value = SETTINGS.width || 854;
  if ($("#setHeight")) $("#setHeight").value = SETTINGS.height || 480;
  if ($("#setInstallDir")) $("#setInstallDir").value = SETTINGS.install_dir || "";
  if ($("#setProxy")) $("#setProxy").value = SETTINGS.proxy || "";
  if ($("#setMirror")) $("#setMirror").value = SETTINGS.dl_mirror || "auto";
  loadAppearance();
}

async function refreshJavaHint(required) {
  try {
    const d = await api.get("/api/java");
    const avail = [];
    if (d.system_major) avail.push("système (Java " + d.system_major + ")");
    for (const b of d.bundled) avail.push("Java " + b.major + " (embarquée)");
    $("#javaStatus").innerHTML = avail.length
      ? "Java disponible : " + avail.join(", ") + "."
      : "Aucun Java détecté.";
    if (required && $("#javaRow")) {
      const ok = (d.system_major && d.system_major >= required) ||
                 d.bundled.some((b) => b.major >= required);
      $("#javaRow").innerHTML = ok
        ? '<span style="color:var(--green)">✓ Java compatible disponible.</span>'
        : `<b>⚠ Java ${required} requis</b> — il sera téléchargé automatiquement au lancement.`;
    }
  } catch (e) { /* silencieux */ }
}

async function loadDiskStats() {
  try {
    const d = await api.get("/api/disk");
    const rows = [
      ["Versions (clients)", d.versions || 0],
      ["Bibliothèques", d.libraries || 0],
      ["Assets", d.assets || 0],
      ["Java", d.java || 0],
      ["Instances (mondes)", d.instances || 0],
      ["Logs & natives", (d.logs || 0) + (d.natives || 0)],
      ["Skins", d.skins || 0],
    ];
    const total = rows.reduce((s, r) => s + r[1], 0);
    const box = $("#diskStats");
    if (box) {
      box.innerHTML = rows.map(([k, v]) =>
        `<div class="ds-row"><span>${k}</span><span>${fmtSize(v)}</span></div>`
      ).join("") + `<div class="ds-row ds-total"><span>Total</span><span>${fmtSize(total)}</span></div>`;
    }
    const chip = $("#diskChip");
    if (chip) chip.textContent = "💾 " + fmtSize(total) + " utilisés";
  } catch (e) { /* silencieux */ }
}

async function runCleanup() {
  try {
    const r = await api.post("/api/cleanup", {});
    toast("Nettoyage terminé : " + fmtSize(r.freed) + " libérés. (" + r.logs_kept + " logs conservés)", "ok");
    loadDiskStats();
  } catch (e) { toast("Erreur nettoyage : " + e.message, "err"); }
}

// ---------------- Microsoft ----------------
async function msLogin() {
  const btn = $("#btnMSLogin");
  btn.disabled = true;
  $("#msMessage").textContent = "Demande du code à Microsoft…";
  try {
    const d = await api.post("/api/auth/microsoft/start", {});
    $("#msArea").classList.remove("hidden");
    $("#msUri").textContent = d.verification_uri;
    $("#msCode").textContent = d.user_code;
    $("#msMessage").textContent = "En attente de validation… (ne ferme pas cette fenêtre)";
    window.open(d.verification_uri + "?otc=" + d.user_code, "_blank");
    const iv = setInterval(async () => {
      try {
        const r = await api.get("/api/auth/microsoft/status");
        if (r.status === "ok") {
          clearInterval(iv);
          $("#msArea").classList.add("hidden");
          $("#msMessage").textContent = "Connecté : " + r.account.username;
          await loadAccounts();
          toast("Compte Microsoft ajouté : " + r.account.username, "ok");
          btn.disabled = false;
        } else if (r.status === "error" || r.status === "expired") {
          clearInterval(iv);
          $("#msMessage").textContent = r.message || "Connexion annulée.";
          btn.disabled = false;
        }
      } catch (e) {
        clearInterval(iv); btn.disabled = false;
      }
    }, 1500);
  } catch (e) {
    $("#msMessage").textContent = "Erreur : " + e.message;
    btn.disabled = false;
  }
}

// ---------------- lancement / progression ----------------
async function play() {
  const version = CURRENT_VERSION;
  const account = $("#accountSelect").value;
  if (!version) return toast("Sélectionne une version.");
  if (!account) return toast("Ajoute d'abord un compte (ex : un compte local).");

  $("#btnPlay").disabled = true;
  try {
    await api.post("/api/launch", {
      version: version, account,
      ram_mb: +$("#ramSlider").value,
      width: +$("#setWidth").value,
      height: +$("#setHeight").value,
    });
    $("#progressArea").classList.remove("hidden");
    startPolling();
  } catch (e) {
    toast("Échec du lancement : " + e.message, "err");
    $("#btnPlay").disabled = false;
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const p = await api.get("/api/progress");
      updateProgress(p);
      if (p.status === "done" || p.status === "error" || !p.active) {
        clearInterval(pollTimer);
        pollTimer = null;
        setTimeout(() => {
          $("#btnPlay").disabled = false;
          refreshInstalledStatus(CURRENT_VERSION);
        }, 500);
        if (p.status === "error") toast("Erreur : " + (p.error || "inconnue"), "err");
      }
    } catch (e) { /* silencieux */ }
  }, 900);
  // Suivi du journal de lancement
  if (logTimer) clearInterval(logTimer);
  logTimer = setInterval(async () => {
    try {
      const l = await api.get("/api/logs");
      if (l.logs && $("#logText")) $("#logText").textContent = l.logs;
    } catch (e) { /* silencieux */ }
  }, 2000);
}

function updateProgress(p) {
  $("#pStage").textContent = p.stage || "…";
  $("#pPercent").textContent = p.percent != null ? Math.round(p.percent) + "%" : "";
  $("#pBar").style.width = (p.percent != null ? Math.min(100, p.percent) : 0) + "%";
  $("#pMessage").textContent = p.message || "";
}

// ---------------- actions de version (réparer / supprimer / ouvrir dossier) ----------------
async function repairVersion() {
  if (!CURRENT_VERSION) return;
  confirmAction(
    "Réparer la version",
    "Cette action supprime le client et les natives de « " + CURRENT_VERSION +
    " » pour forcer un re-téléchargement propre. Les mondes sont conservés. Continuer ?",
    async () => {
      try {
        await api.post("/api/version/" + encodeURIComponent(CURRENT_VERSION) + "/repair", {});
        toast("Version « " + CURRENT_VERSION + " » réparée. Elle sera re-téléchargée au prochain lancement.", "ok");
        refreshInstalledStatus(CURRENT_VERSION);
      } catch (e) { toast("Erreur : " + e.message, "err"); }
    }
  );
}

async function openVersionFolder() {
  if (!CURRENT_VERSION) return;
  try {
    await api.post("/api/version/" + encodeURIComponent(CURRENT_VERSION) + "/open-folder", {});
  } catch (e) { toast("Erreur : " + e.message, "err"); }
}

async function deleteVersion() {
  if (!CURRENT_VERSION) return;
  const vid = CURRENT_VERSION;
  confirmAction(
    "Supprimer la version",
    "Supprimer complètement « " + vid + " » (client, bibliothèques de la version, natives) ? " +
    "Les mondes dans le dossier d'installation seront conservés.",
    async () => {
      try {
        // Ajout d'une route de suppression dans le backend
        const r = await api.post("/api/version/" + encodeURIComponent(vid) + "/delete", {});
        toast("Version « " + vid + " » supprimée.", "ok");
        delete installedMap[vid];
        renderList();
        if (CURRENT_VERSION === vid) {
          CURRENT_VERSION = null;
          $("#detailPane").classList.add("hidden");
          $("#emptyState").classList.remove("hidden");
        }
      } catch (e) { toast("Erreur : " + e.message, "err"); }
    }
  );
}

// ---------------- modale de confirmation ----------------
let confirmCb = null;
function confirmAction(title, text, cb) {
  $("#confirmTitle").textContent = title;
  $("#confirmText").textContent = text;
  confirmCb = cb;
  openModal("modalConfirm");
}

// ---------------- modals ----------------
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove("hidden");
}
function closeModals() {
  $$(".modal").forEach((m) => m.classList.add("hidden"));
}

// ---------------- Gestionnaire de serveurs ----------------
async function loadServers() {
  try {
    const d = await api.get("/api/servers");
    const box = $("#serverList");
    if (!box) return;
    box.innerHTML = "";
    if (!d.servers || !d.servers.length) {
      box.innerHTML = '<li class="muted" style="justify-content:center;padding:16px">Aucun serveur enregistré.</li>';
      return;
    }
    for (const s of d.servers) {
      const li = document.createElement("li");
      const addr = s.port ? s.address + ":" + s.port : s.address;
      li.innerHTML =
        `<div class="srv-main"><div class="srv-name">${escapeHtml(s.name)}</div>` +
        `<div class="srv-addr">${escapeHtml(addr)}</div></div>` +
        `<button class="btn small" data-connect>Connexion rapide</button>` +
        `<button class="btn small ghost danger" data-del title="Supprimer">✕</button>`;
      li.querySelector("[data-connect]").onclick = () => quickConnect(s);
      li.querySelector("[data-del]").onclick = async () => {
        if (!confirm("Supprimer le serveur « " + s.name + " » ?")) return;
        await api.del("/api/servers/" + encodeURIComponent(s.id));
        await loadServers();
      };
      box.appendChild(li);
    }
  } catch (e) { toast("Erreur serveurs : " + e.message, "err"); }
}

async function quickConnect(server) {
  const version = CURRENT_VERSION;
  const account = $("#accountSelect").value;
  if (!version) { switchView("play"); return toast("Sélectionne d'abord une version."); }
  if (!account) { switchView("play"); return toast("Ajoute d'abord un compte."); }
  const addr = server.port ? server.address + ":" + server.port : server.address;
  switchView("play");
  toast("Connexion à « " + server.name + " »…");
  try {
    await api.post("/api/launch", { version: version, account, server: addr });
    $("#progressArea").classList.remove("hidden");
    startPolling();
  } catch (e) { toast("Erreur de lancement : " + e.message, "err"); }
}

// ---------------- Minecraft Bedrock ----------------
async function loadBedrockStatus() {
  try {
    const d = await api.get("/api/bedrock/status");
    const notInstalled = document.querySelector(".bedrock-not-installed");
    const installed = document.querySelector(".bedrock-installed");
    if (!notInstalled || !installed) return;
    if (d.installed) {
      notInstalled.classList.add("hidden");
      installed.classList.remove("hidden");
      $("#bedrockVersion").textContent = "Version " + (d.version || "inconnue");
      renderBedrockPacks(d.resource_packs || []);
    } else {
      notInstalled.classList.remove("hidden");
      installed.classList.add("hidden");
    }
  } catch (e) {
    toast("Erreur Bedrock : " + e.message, "err");
  }
}

function renderBedrockPacks(packs) {
  const box = $("#bedrockPackList");
  if (!box) return;
  box.innerHTML = "";
  if (!packs.length) {
    box.innerHTML = '<li class="muted" style="padding:8px">Aucun resource pack installé.</li>';
    return;
  }
  for (const p of packs) {
    const li = document.createElement("li");
    li.className = "mod-item";
    li.innerHTML =
      `<span class="mname">${escapeHtml(p.name)}</span>` +
      `<span class="msize">${escapeHtml(p.version || "")}</span>` +
      `<button class="mdel" title="Supprimer">✕</button>`;
    li.querySelector(".mdel").onclick = async () => {
      if (!confirm("Supprimer le pack « " + p.name + " » ?")) return;
      await api.del("/api/bedrock/packs/" + encodeURIComponent(p.folder));
      await loadBedrockStatus();
    };
    box.appendChild(li);
  }
}

async function uploadBedrockPack(fileList) {
  const files = [...fileList].filter((f) => f.name.endsWith(".mcpack") || f.name.endsWith(".zip"));
  if (!files.length) return toast("Seuls les fichiers .mcpack / .zip sont acceptes.");
  const fd = new FormData();
  fd.append("file", files[0], files[0].name);
  try {
    const r = await api.upload("/api/bedrock/packs", fd);
    toast("Resource pack installe : " + (r.pack?.folder || files[0].name), "ok");
    await loadBedrockStatus();
  } catch (e) { toast("Erreur : " + e.message, "err"); }
}

// ---------------- explorateur de dossiers ----------------
const folderState = { path: "", parent: null };

async function openFolderBrowser() {
  folderState.path = "";
  openModal("modalFolder");
  await renderFolder();
}

async function renderFolder() {
  try {
    const d = await api.get("/api/fs/list?path=" + encodeURIComponent(folderState.path));
    folderState.path = d.path;
    folderState.parent = d.parent;
    $("#folderPath").textContent = d.path || "Choisir un lecteur";
    $("#btnFolderUp").disabled = !d.parent;
    const box = $("#folderList");
    box.innerHTML = "";
    if (!d.dirs.length) {
      box.innerHTML = '<li class="muted" style="padding:8px">(dossier vide)</li>';
    }
    for (const name of d.dirs) {
      const li = document.createElement("li");
      li.className = "folder-item";
      li.innerHTML = `<span class="fico">📁</span>${escapeHtml(name)}`;
      li.onclick = async () => {
        folderState.path = d.path ? d.path + (d.path.endsWith("\\") ? "" : "\\") + name : name;
        await renderFolder();
      };
      box.appendChild(li);
    }
  } catch (e) {
    toast("Impossible de lire le dossier : " + e.message, "err");
  }
}

// ---------------- init ----------------
async function init() {
  try {
    // Navigation par vues
    $$(".nav-item").forEach((b) => b.onclick = () => switchView(b.dataset.view));

    // Chargement initial
    await Promise.all([loadVersions(false), loadAccounts(), loadSettings()]);
    loadDiskStats();
    const sel = CURRENT_VERSION;
    if (sel) selectVersion(sel, false);
    // Actualisation en arrière-plan
    loadVersions(true).catch(() => {});
  } catch (e) {
    toast("Impossible de joindre le lanceur : " + e.message, "err");
  }

  $("#search").addEventListener("input", (e) => { query = e.target.value; renderList(); });
  $$(".filter-tabs button").forEach((b) => {
    b.onclick = () => {
      $$(".filter-tabs button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      filter = b.dataset.filter;
      renderList();
    };
  });
  $("#btnRefresh").onclick = async () => {
    $("#btnRefresh").disabled = true;
    try { await loadVersions(true); toast("Liste des versions actualisée.", "ok"); }
    catch (e) { toast("Échec de l'actualisation : " + e.message, "err"); }
    $("#btnRefresh").disabled = false;
  };
  const rs = $("#ramSlider");
  if (rs) rs.addEventListener("input", () => {
    $("#ramLabel").textContent = rs.value + " Mo";
  });
  // Mémorise le compte choisi
  const accSel = $("#accountSelect");
  if (accSel) accSel.addEventListener("change", () => {
    const v = accSel.value;
    if (v) api.post("/api/select", { account: v }).catch(() => {});
  });

  // Boutons de la vue Jouer
  $("#btnPlay").onclick = play;
  $("#btnNewAccount").onclick = () => switchView("accounts");
  $("#btnOpenFolder").onclick = openVersionFolder;
  $("#btnRepair").onclick = repairVersion;
  $("#btnDelete").onclick = deleteVersion;

  // Comptes
  $("#btnAddOffline").onclick = async () => {
    const name = $("#offlineName").value.trim();
    if (!name) return toast("Entre un nom de compte local.");
    try {
      await api.post("/api/accounts/offline", { username: name });
      $("#offlineName").value = "";
      await loadAccounts();
      toast("Compte local « " + name + " » créé.", "ok");
    } catch (e) { toast("Erreur : " + e.message, "err"); }
  };
  $("#btnMSLogin").onclick = msLogin;

  // Réglages
  $("#btnSaveSettings").onclick = async () => {
    try {
      await api.post("/api/settings", {
        java_override: $("#setJava").value.trim(),
        auto_install_java: $("#setAutoJava").checked,
        fullscreen: $("#setFullscreen").checked,
        width: +$("#setWidth").value || 854,
        height: +$("#setHeight").value || 480,
        ram_mb: +$("#ramSlider").value,
        install_dir: $("#setInstallDir").value.trim(),
        proxy: $("#setProxy").value.trim(),
        dl_mirror: $("#setMirror").value,
      });
      SETTINGS = (await api.get("/api/settings")).settings;
      closeModals();
      toast("Réglages enregistrés. Les nouvelles parties seront installées dans ce dossier.", "ok");
    } catch (e) { toast("Erreur : " + e.message, "err"); }
  };
  $("#btnCleanup").onclick = runCleanup;
  $("#linkCleanup").onclick = (e) => { e.preventDefault(); runCleanup(); };
  $("#linkStats").onclick = (e) => { e.preventDefault(); switchView("settings"); };

  // Apparence
  $("#accentColor").addEventListener("input", (e) => {
    draftAppearance.accent = e.target.value;
    $("#accentHex").textContent = e.target.value;
    applyAppearance(draftAppearance);
  });
  $("#btnAccentReset").onclick = () => {
    draftAppearance.accent = "";
    applyAppearance(draftAppearance);
    syncAppearanceControls(draftAppearance);
  };
  $("#themeGlow").addEventListener("change", (e) => {
    draftAppearance.glow = e.target.checked;
    applyAppearance(draftAppearance);
  });
  $("#themeAnim").addEventListener("change", (e) => {
    draftAppearance.anim = e.target.checked;
    applyAppearance(draftAppearance);
  });
  $("#themeBg").addEventListener("change", (e) => {
    draftAppearance.bg = e.target.value;
    applyAppearance(draftAppearance);
  });
  $("#btnAppearanceSave").onclick = async () => {
    if (await saveAppearance()) toast("Apparence enregistrée.", "ok");
    else toast("Erreur lors de l'enregistrement de l'apparence.", "err");
  };
  $("#btnAppearanceReset").onclick = async () => {
    draftAppearance = { preset: "github-dark", accent: "", glow: true, anim: true, bg: "auto" };
    applyAppearance(draftAppearance);
    syncAppearanceControls(draftAppearance);
    await saveAppearance();
    toast("Apparence rétablie par défaut.", "ok");
  };

  // Bedrock
  $("#btnBedrockPlay").onclick = async () => {
    try {
      await api.post("/api/bedrock/launch");
      toast("Minecraft Bedrock lance.", "ok");
    } catch (e) { toast("Erreur : " + e.message, "err"); }
  };
  $("#btnBedrockStore").onclick = () => api.post("/api/bedrock/open-store").catch(() => {});
  $("#btnBedrockOpenFolder").onclick = () => api.post("/api/bedrock/open-folder").catch(() => {});
  const dzB = $("#dropZoneBedrock");
  if (dzB) {
    dzB.addEventListener("click", () => $("#bedrockPackInput").click());
    dzB.addEventListener("dragover", (e) => { e.preventDefault(); dzB.classList.add("drag"); });
    dzB.addEventListener("dragleave", () => dzB.classList.remove("drag"));
    dzB.addEventListener("drop", (e) => {
      e.preventDefault();
      dzB.classList.remove("drag");
      uploadBedrockPack(e.dataTransfer.files);
    });
  }
  const bpIn = $("#bedrockPackInput");
  if (bpIn) bpIn.addEventListener("change", (e) => {
    uploadBedrockPack(e.target.files);
    e.target.value = "";
  });

  // Serveurs
  $("#btnAddServer").onclick = async () => {
    const name = $("#srvName").value.trim();
    const address = $("#srvAddress").value.trim();
    if (!name || !address) return toast("Nom et adresse requis.");
    try {
      await api.post("/api/servers", { name, address });
      $("#srvName").value = "";
      $("#srvAddress").value = "";
      await loadServers();
      toast("Serveur ajouté.", "ok");
    } catch (e) { toast("Erreur : " + e.message, "err"); }
  };

  // explorateur de dossiers
  $("#btnBrowse").onclick = openFolderBrowser;
  $("#btnFolderUp").onclick = () => {
    folderState.path = folderState.parent || "";
    renderFolder();
  };
  $("#btnFolderChoose").onclick = () => {
    if (!folderState.path) return toast("Choisis un dossier.");
    $("#setInstallDir").value = folderState.path;
    closeModals();
    toast("Dossier choisi : " + folderState.path);
  };

  // Modals
  $$(".modal [data-close]").forEach((b) => (b.onclick = closeModals));
  $$(".modal").forEach((m) => m.addEventListener("click", (e) => {
    if (e.target === m) closeModals();
  }));

  // Modale de confirmation
  $("#btnConfirmCancel").onclick = () => { confirmCb = null; closeModals(); };
  $("#btnConfirmOk").onclick = () => {
    const cb = confirmCb;
    confirmCb = null;
    closeModals();
    if (cb) cb();
  };
}

init();
