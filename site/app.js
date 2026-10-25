"use strict";

/* ═════════════════ Утилиты ═════════════════ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const LS = {
  cfg: "serialwatch.cfg",
  cache: "serialwatch.cache",
  people: "serialwatch.people",
  tint: "serialwatch.tint",
  mine: "serialwatch.mine",
  log: "serialwatch.log",
  tab: "serialwatch.tab",
  synced: "serialwatch.synced."
};

/* ═════════════════ Язык интерфейса ═════════════════ */
const LANGS = { ru: { tmdb: "ru-RU", loc: "ru-RU" }, uk: { tmdb: "uk-UA", loc: "uk-UA" }, en: { tmdb: "en-US", loc: "en-US" } };
let LANG = "ru";
try { const d0 = window.APP_CONFIG && window.APP_CONFIG.lang; if (d0 && LANGS[d0]) LANG = d0; } catch (e) {}
try { const c0 = JSON.parse(localStorage.getItem("serialwatch.cfg") || "{}") || {}; if (c0.lang && LANGS[c0.lang]) LANG = c0.lang; } catch (e) {}
const DEC = LANG === "en" ? "." : ",";
const T = (function () {
  const I = (window.I18N && window.I18N[LANG]) || null;
  if (!I) return function (s) { return s; };
  const exact = I.exact || {}, ph = I.phrases || {};
  const isL = (ch) => /\p{L}/u.test(ch);
  const keys = Object.keys(ph).sort((a, b) => b.length - a.length).map((k) =>
    (isL(k[0]) ? "(?<!\\p{L})" : "") + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (isL(k[k.length - 1]) ? "(?!\\p{L})" : ""));
  const re = keys.length ? new RegExp(keys.join("|"), "gu") : null;
  const cache = Object.create(null);
  return function (s) {
    if (s in cache) return cache[s];
    let out = Object.prototype.hasOwnProperty.call(exact, s) ? exact[s] : re ? s.replace(re, (m) => ph[m]) : s;
    cache[s] = out;
    return out;
  };
})();
document.documentElement.lang = LANG;
const TMDB_API = "https://api.themoviedb.org/3";
const IMG_API = "https://image.tmdb.org/t/p";
const FB_SCRIPTS = [
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"
];

const STATUS = {
  watching: { label: T("Смотрим"), color: "var(--s-watching)" },
  want: { label: T("В планах"), color: "var(--s-want)" },
  paused: { label: T("Отложили"), color: "var(--s-paused)" },
  done: { label: T("Досмотрели"), color: "var(--s-done)" }
};
const TMDB_STATUS_RU = {
  "Returning Series": T("Выходит"),
  "Ended": T("Завершён"),
  "Canceled": T("Закрыт"),
  "In Production": T("В производстве"),
  "Planned": T("Запланирован"),
  "Pilot": T("Пилот")
};
const PALETTE = ["#ff7a96", "#55d6c2", "#a99bff", "#ffb23e", "#7bd88f", "#6ab7ff", "#ff8f5c", "#e86bff", "#4fd1ff", "#c8e65a", "#ff6b6b", "#7f8cff"];

const state = {
  cfg: {},
  series: {},          // активный список (общий или личный)
  shared: {},
  mine: {},
  log: {},
  mylog: {},
  kind: "pair",
  tab: "together",
  statsScope: "together",
  people: {},
  tint: {},
  filter: "all",
  current: null,
  codes: {},
  conn: "none"          // none | offline | online | error
};
let metaRef = null, rootRef = null, seriesRef = null, peopleRef = null, connRef = null, mineRef = null, logRef = null, mylogRef = null, codesRef = null, removedRef = null, joinIntent = false, connTok = null;
const CODES_KEY = "serialwatch.codes.me";
let codesSynced = false;
const MINE_KEY = "serialwatch.mine.me", MYLOG_KEY = "serialwatch.mylog.me";
let connError = "";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function plural(n, forms) {
  if (LANG === "en") return Math.abs(n) === 1 ? forms[0] : forms[1];
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
function slug(name) {
  return String(name || "").trim().toLowerCase().replace(/[.#$\[\]\/\s]+/g, "_");
}
function clean(o) { return JSON.parse(JSON.stringify(o)); }
function lsGet(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

function toast(msg, act) {
  const t = $("#toast");
  t.innerHTML = "<span>" + esc(msg) + "</span>" + (act ? '<button type="button">' + esc(act.label || T("Отменить")) + "</button>" : "");
  t.hidden = false;
  if (act) {
    t.querySelector("button").onclick = () => { t.hidden = true; act.fn(); };
  }
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, act ? 5500 : 2800);
}

/* ═════════════════ Шторки ═════════════════ */
let openId = null, openLocked = false;

function openSheet(id, opts) {
  const el = $("#" + id);
  openLocked = !!(opts && opts.lock);
  el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("open")));
  openId = id;
  if (!openLocked) { try { history.pushState({ sheet: id }, ""); } catch (e) {} }
}
function closeSheet(fromPop) {
  if (!openId) return;
  const id = openId, el = $("#" + id), wasLocked = openLocked;
  el.classList.remove("open");
  openId = null; openLocked = false;
  setTimeout(() => { if (openId !== id) el.hidden = true; }, 300);
  if (!fromPop && !wasLocked && history.state && history.state.sheet) { popSkip = true; history.back(); }
}
let popSkip = false;
window.addEventListener("popstate", () => {
  if (popSkip) { popSkip = false; return; }
  if (openId && !openLocked) { closeSheet(true); return; }
  if (!openId && state.tab !== "together") setTab("together", true);
});
// Кнопка «Назад» в APK: сначала закрываем окно, потом возвращаемся на «Вместе», и только потом выходим.
function handleBack() {
  if (openId) { if (!openLocked) closeSheet(); return; }
  if (state.tab !== "together") { setTab("together"); return; }
  try { window.Capacitor.Plugins.App.exitApp(); } catch (e) {}
}
function bindNativeBack() {
  try {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App && App.addListener) App.addListener("backButton", handleBack);
  } catch (e) {}
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeSheet();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openId && !openLocked) closeSheet(); });

/* ═════════════════ Настройки ═════════════════ */
function loadConfig() {
  const d = window.APP_CONFIG || {};
  const c = {
    tmdbApiKey: d.tmdbApiKey || "",
    firebase: d.firebase || null,
    listCode: d.listCode || "",
    nick: d.nick || "",
    region: d.region || "UA",
    theme: "",
    lang: "",
    userId: "",
    solo: false
  };
  const saved = lsGet(LS.cfg, null);
  if (saved) {
    Object.keys(saved).forEach((k) => {
      if (saved[k] !== null && saved[k] !== "" && saved[k] !== undefined) c[k] = saved[k];
    });
  }
  state.cfg = c;
  if (!c.userId) { c.userId = genUserId(); persistConfig(); }
  state.tint = lsGet(LS.tint, {});
}
// Данные каждого кода хранятся отдельно, как кабинеты: смена кода не переносит списки между ними.
function K(base) { const c = safeCode(state.cfg.listCode); return c ? base + "." + c : base; }
function upgradeCaches() {
  // Старые версии хранили всё в общих ключах. Переносим их под текущий код один раз.
  if (lsGet("serialwatch.cachev3", false)) return;
  const code = safeCode(state.cfg.listCode);
  if (code) {
    [LS.cache, LS.mine, LS.log, LS.people].forEach((b) => {
      try {
        const v = localStorage.getItem(b);
        if (v != null && localStorage.getItem(b + "." + code) == null) localStorage.setItem(b + "." + code, v);
        if (v != null) localStorage.removeItem(b);
      } catch (e) {}
    });
  }
  lsSet("serialwatch.cachev3", true);
}
function upgradeMine() {
  // «Моё» теперь принадлежит человеку, а не коду пары: переносим то, что было под кодом.
  if (lsGet("serialwatch.minev4", false)) return;
  try {
    const code = safeCode(state.cfg.listCode);
    const v = (code && localStorage.getItem(LS.mine + "." + code)) || localStorage.getItem(LS.mine);
    if (v != null && localStorage.getItem(MINE_KEY) == null) localStorage.setItem(MINE_KEY, v);
  } catch (e) {}
  lsSet("serialwatch.minev4", true);
}
function loadCaches() {
  state.shared = normalizeAll(lsGet(K(LS.cache), {}));
  state.mine = normalizeAll(lsGet(MINE_KEY, {}));
  state.mylog = lsGet(MYLOG_KEY, {}) || {};
  state.log = lsGet(K(LS.log), {}) || {};
  state.kind = KINDS[lsGet(K(KIND_KEY), "pair")] ? lsGet(K(KIND_KEY), "pair") : "pair";
  state.people = lsGet(K(LS.people), {}) || {};
  state.series = state.tab === "mine" ? state.mine : state.shared;
}
function persistConfig() {
  // Сохраняем только то, что отличается от config.js — так обновления config.js подхватываются.
  const d = window.APP_CONFIG || {};
  const out = {};
  Object.keys(state.cfg).forEach((k) => {
    if (JSON.stringify(state.cfg[k]) !== JSON.stringify(d[k])) out[k] = state.cfg[k];
  });
  lsSet(LS.cfg, out);
}
function safeCode(code) {
  return String(code || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[.#$\[\]\/]/g, "_");
}
function genUserId() {
  const a = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(a);
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(a, (x) => chars[x % chars.length]).join("");
}
function genCode() {
  const a = new Uint8Array(9);
  (window.crypto || window.msCrypto).getRandomValues(a);
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const s = Array.from(a, (x) => chars[x % chars.length]).join("");
  return s.slice(0, 3) + "-" + s.slice(3, 6) + "-" + s.slice(6, 9);
}
function inviteLink(code) {
  if (window.Capacitor || !/^https?:/.test(location.protocol)) return "";
  return location.origin + location.pathname + "#join=" + encodeURIComponent(code);
}
function meSlug() { return slug(state.cfg.nick) || "me"; }

let draft = { avatar: "", color: "" };
function renderPickers() {
  const col = draft.color || personColor(state.cfg.nick);
  const nm = $("#cfg-nick").value || state.cfg.nick;
  $("#avatar-picker").innerHTML = avatarFromValue(draft.avatar, col, 72, nm);
  const taken = Object.keys(state.people).filter((k) => k !== meSlug()).map((k) => state.people[k].color);
  $("#color-picker").innerHTML = PALETTE.map((c) =>
    '<button type="button" class="sw' + (draft.color === c ? " on" : "") + '" data-col="' + c + '" style="background:' + c + '"' + (taken.indexOf(c) >= 0 ? " disabled" : "") + T(' aria-label="Цвет"></button>')).join("");
  $("#theme-picker").innerHTML = THEMES.map((t) =>
    '<button type="button" class="thm' + ((state.cfg.theme || "") === t.id ? " on" : "") + '" data-theme-id="' + t.id + '"><i style="background:linear-gradient(120deg,' + t.bg + " 55%," + t.ac + ')"></i>' + esc(t.name) + "</button>").join("");
}
function pickPhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = () => {
    const S = 128, c = document.createElement("canvas");
    c.width = c.height = S;
    const x = c.getContext("2d");
    const m = Math.min(im.width, im.height);
    x.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, S, S);
    URL.revokeObjectURL(url);
    draft.avatar = "img:" + c.toDataURL("image/jpeg", 0.82);
    renderPickers();
  };
  im.onerror = () => { URL.revokeObjectURL(url); toast(T("Не получилось открыть картинку")); };
  im.src = url;
}
function openSettings() {
  const me = state.people[meSlug()] || {};
  draft = { avatar: me.avatar || "", color: me.color || personColor(state.cfg.nick) };
  renderPickers();
  $("#cfg-nick").value = state.cfg.nick || "";
  $("#cfg-code").value = state.cfg.listCode || "";
  $("#cfg-tmdb").value = state.cfg.tmdbApiKey || "";
  $("#cfg-fb").value = state.cfg.firebase ? JSON.stringify(state.cfg.firebase, null, 2) : "";
  $("#cfg-region").value = state.cfg.region || "UA";
  $("#cfg-uid").value = state.cfg.userId || "";
  renderMembers();
  openSheet("sheet-settings");
}
function renderMembers() {
  const box = $("#members-field"), list = $("#members");
  const me = meSlug();
  const others = Object.keys(state.people).filter((k) => k !== me && state.people[k] && state.people[k].name);
  box.hidden = !(state.cfg.listCode && others.length);
  list.innerHTML = others.map((k) => {
    const p = state.people[k];
    return '<div class="member"><span class="mav">' + avatarFromValue(p.avatar, p.color, 34, p.name) + '</span><span class="mname">' + esc(p.name) + '</span>' +
      '<button type="button" class="iconbtn" data-rmmember="' + esc(k) + '" aria-label="' + T("Убрать из кабинета") + '">&times;</button></div>';
  }).join("");
}
function removeMember(k) {
  const p = state.people[k];
  if (!p || !state.cfg.listCode) return;
  if (!window.confirm(T("Убрать из кабинета: ") + p.name + "?\n" + T("Его отметки в сериалах останутся, а сам он выйдет из кабинета."))) return;
  delete state.people[k];
  lsSet(K(LS.people), state.people);
  if (peopleRef) peopleRef.child(k).remove().catch(onWriteError);
  if (removedRef) removedRef.child(k).set(Date.now()).catch(onWriteError);
  renderMembers(); render();
  toast(T("Убрано: ") + p.name);
}
function saveSettings() {
  const fbText = $("#cfg-fb").value.trim();
  let fb = null;
  if (fbText) {
    try { fb = JSON.parse(fbText); }
    catch (e) { toast(T("Конфиг Firebase не похож на JSON. Проверьте скобки и кавычки.")); return; }
  }
  const nick = $("#cfg-nick").value.trim();
  if (!nick) { toast(T("Введите ваше имя")); $("#cfg-nick").focus(); return; }
  const prevCode = state.cfg.listCode, prevFb = JSON.stringify(state.cfg.firebase), prevMe = meSlug(), prevUid = state.cfg.userId;
  const uid = $("#cfg-uid").value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (uid && uid.length >= 12 && uid !== prevUid) {
    state.cfg.userId = uid;
    state.mine = {}; state.mylog = {};
    lsSet(MINE_KEY, {}); lsSet(MYLOG_KEY, {});
    if (state.tab === "mine") state.series = state.mine;
  }
  state.cfg.nick = nick;
  state.cfg.listCode = safeCode($("#cfg-code").value);
  if (state.cfg.listCode && state.cfg.listCode !== prevCode) joinIntent = true;
  state.cfg.tmdbApiKey = $("#cfg-tmdb").value.trim();
  state.cfg.firebase = fb;
  state.cfg.region = ($("#cfg-region").value.trim() || "UA").toUpperCase();
  state.cfg.solo = !state.cfg.listCode;
  persistConfig();
  closeSheet();
  {
    const key = meSlug();
    const rec = Object.assign({}, state.people[key] || {}, { name: nick, color: draft.color || personColor(nick), avatar: draft.avatar || "" });
    state.people[key] = rec;
    lsSet(K(LS.people), state.people);
    if (peopleRef) peopleRef.child(key).update(rec).catch(onWriteError);
  }
  if (prevCode !== state.cfg.listCode || prevFb !== JSON.stringify(fb) || prevMe !== meSlug() || prevUid !== state.cfg.userId || !rootRef) connect();
  ensureMe();
  render();
  toast(T("Сохранено"));
}
async function shareCode() {
  const code = safeCode($("#cfg-code").value) || state.cfg.listCode;
  if (!code) { toast(T("Сначала введите или придумайте код")); return; }
  const link = inviteLink(code);
  const text = KT().share + code + (link ? T("\nИли откройте ссылку: ") + link : "");
  try {
    if (navigator.share) { await navigator.share({ title: T("Наши сериалы"), text }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text); toast(T("Скопировано. Отправьте это остальным")); }
  catch (e) { window.prompt(T("Скопируйте и отправьте остальным:"), text); }
}

function applyShare() {
  // Поделиться ссылкой из браузера прямо в приложение (PWA на Android).
  const q = new URLSearchParams(location.search);
  const v = q.get("url") || q.get("text") || q.get("title");
  if (!v) return;
  try { history.replaceState(null, "", location.pathname); } catch (e) {}
  const m = v.match(/https?:\/\/\S+/);
  setTimeout(() => {
    openSearch();
    $("#search-input").value = m ? m[0] : v;
    runSearch();
  }, 400);
}
const INTRO_KEY = "serialwatch.introdone";
function maybeIntro() {
  const preset = !!(state.cfg.tmdbApiKey && state.cfg.firebase), force = !!(window.APP_CONFIG && window.APP_CONFIG.intro);
  if (lsGet(INTRO_KEY, false) || (preset && !force) || (!preset && (state.cfg.tmdbApiKey || state.cfg.firebase))) { maybeWelcome(); return; }
  $("#sheet-intro").classList.toggle("preset", preset);
  openSheet("sheet-intro", { lock: true });
}
function introNext(then) {
  lsSet(INTRO_KEY, true);
  closeSheet();
  setTimeout(then, 280);
}
function exportSetup() {
  const o = { t: state.cfg.tmdbApiKey || "", f: state.cfg.firebase || null, r: state.cfg.region || "UA" };
  return "sw1:" + btoa(unescape(encodeURIComponent(JSON.stringify(o))));
}
function importSetup(text) {
  const m = String(text || "").trim().match(/sw1:([A-Za-z0-9+\/=_-]+)/);
  if (!m) return false;
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")))));
    if (!o || (!o.t && !o.f)) return false;
    if (o.t) state.cfg.tmdbApiKey = String(o.t);
    if (o.f && typeof o.f === "object") state.cfg.firebase = o.f;
    if (o.r) state.cfg.region = String(o.r).toUpperCase();
    persistConfig();
    return true;
  } catch (e) { return false; }
}
async function copySetup() {
  if (!state.cfg.tmdbApiKey && !state.cfg.firebase) { toast(T("Сначала введите ключи")); return; }
  const code = exportSetup();
  try { await navigator.clipboard.writeText(code); toast(T("Код настроек скопирован. Вставьте его на другом телефоне")); }
  catch (e) { window.prompt(T("Скопируйте код настроек:"), code); }
}
function bindIntro() {
  $("#intro-apply").addEventListener("click", () => {
    if (!importSetup($("#intro-code").value)) { toast(T("Код не подходит. Скопируйте его целиком")); return; }
    introNext(() => { connect(); render(); maybeWelcome(); });
  });
  $("#intro-manual").addEventListener("click", () => introNext(() => { openSettings(); const d = document.querySelector("#sheet-settings details.adv"); if (d) d.open = true; }));
  $("#intro-skip").addEventListener("click", () => introNext(maybeWelcome));
  $("#intro-start").addEventListener("click", () => introNext(maybeWelcome));
  $("#btn-copy-setup").addEventListener("click", copySetup);
}
function maybeWelcome() {
  const needNick = !state.cfg.nick;
  const needCode = !state.cfg.listCode && !state.cfg.solo && !!state.cfg.firebase;
  if (!needNick && !needCode) return;
  $("#w-nick").value = state.cfg.nick || "";
  $("#w-code").value = state.cfg.listCode || "";
  openSheet("sheet-welcome", { lock: true });
}
function finishWelcome(solo) {
  const nick = $("#w-nick").value.trim();
  if (!nick) { toast(T("Введите ваше имя")); $("#w-nick").focus(); return; }
  const code = safeCode($("#w-code").value);
  if (!solo && !code && state.cfg.firebase) { toast(T("Введите код или нажмите «Придумать»")); $("#w-code").focus(); return; }
  state.cfg.nick = nick;
  state.cfg.listCode = solo ? "" : code;
  state.cfg.solo = solo || !code;
  if (!solo && code) joinIntent = true;
  persistConfig();
  lsSet(K(KIND_KEY), state.kind);
  closeSheet();
  connect();
  ensureMe();
  render();
}
function applyJoinFromHash() {
  const m = location.hash.match(/join=([^&]+)/);
  if (!m) return;
  const code = safeCode(decodeURIComponent(m[1]));
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  if (code) {
    state.cfg.listCode = code;
    state.cfg.solo = false;
    persistConfig();
  }
}

/* ═════════════════ Аватарки и оформления ═════════════════ */
const THEMES = [
  { id: "", name: T("Ночной сеанс"), bg: "#2d2640", ac: "#ffb23e", meta: "#16131f" },
  { id: "powder", name: T("Пудра"), bg: "#3d2542", ac: "#ff8fb1", meta: "#1f1320" },
  { id: "ocean", name: T("Океан"), bg: "#1e3a52", ac: "#55c8f0", meta: "#0e1a24" },
  { id: "forest", name: T("Лес"), bg: "#243a2c", ac: "#a6e06a", meta: "#111a15" },
  { id: "sunset", name: T("Закат"), bg: "#46281f", ac: "#ff9d5c", meta: "#20130f" },
  { id: "acid", name: T("Кислота"), bg: "#1d2a05", ac: "#c6ff00", meta: "#0a0f03" },
  { id: "neon", name: T("Неон"), bg: "#3a0f5e", ac: "#ff2bd6", meta: "#12001f" },
  { id: "cyber", name: T("Кибер"), bg: "#00384f", ac: "#00f0ff", meta: "#00121a" },
  { id: "lava", name: T("Лава"), bg: "#4a1010", ac: "#ff4a1f", meta: "#1a0505" },
  { id: "cosmos", name: T("Космос"), bg: "#23236b", ac: "#9a86ff", meta: "#0a0a1f" },
  { id: "mint", name: T("Мята"), bg: "#1a4a40", ac: "#5ef2c6", meta: "#0c1a17" },
  { id: "cream", name: T("Сливки"), bg: "#f1e6d6", ac: "#f2683a", meta: "#fbf4ea" }
];
function applyTheme(id) {
  const t = THEMES.find((x) => x.id === (id || "")) || THEMES[0];
  if (t.id) document.documentElement.setAttribute("data-theme", t.id); else document.documentElement.removeAttribute("data-theme");
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", t.meta);
}
function personRec(name) { return state.people[slug(name)] || null; }
function initialOf(name) { return esc(String(name || "?").trim().charAt(0).toUpperCase() || "?"); }
function avatarHtml(name, px, extra) {
  const p = personRec(name), color = personColor(name);
  const inner = p && p.avatar && p.avatar.indexOf("img:") === 0
    ? '<img alt="" src="' + esc(p.avatar.slice(4)) + '">'
    : '<b class="avinit">' + initialOf(name) + "</b>";
  return '<span class="av' + (extra ? " " + extra : "") + '" style="--s:' + (px || 32) + "px;--c:" + esc(color) + '">' + inner + "</span>";
}
function avatarFromValue(value, color, px, name) {
  const inner = value && value.indexOf("img:") === 0 ? '<img alt="" src="' + esc(value.slice(4)) + '">' : '<b class="avinit">' + initialOf(name) + "</b>";
  return '<span class="av" style="--s:' + (px || 48) + "px;--c:" + esc(color) + '">' + inner + "</span>";
}
/* ═════════════════ Тип компании: пара, друзья, семья ═════════════════ */
const KIND_KEY = "serialwatch.kind";
const KINDS = {
  pair: {
    all: T("Мы вдвоём"), fx: "heart",
    title: T("Давайте настроим вашу пару"), lead: T("Один раз вводите имя и общий код. На втором телефоне введите тот же код, и список станет общим."),
    code: T("Код вашей пары"), share: T("Код нашей пары в «Наши сериалы»: "),
    sync: T("Синхронизация работает: список общий для вас двоих."),
    empty: T("<h3>Здесь пока пусто</h3><p>Нажмите «Добавить» и найдите первый сериал или фильм для вас двоих.</p>"),
    mine: T("<h3>Здесь только ваше</h3><p>То, что вы смотрите без пары. Нажмите «Добавить», и это увидите только вы.</p>")
  },
  friends: {
    all: T("Мы все"), fx: "star",
    title: T("Давайте соберём вашу компанию"), lead: T("Один раз вводите имя и общий код. Друзья вводят тот же код, и список становится общим для всех."),
    code: T("Код вашей компании"), share: T("Код нашей компании в «Наши сериалы»: "),
    sync: T("Синхронизация работает: список общий для всей компании."),
    empty: T("<h3>Здесь пока пусто</h3><p>Нажмите «Добавить» и найдите первый сериал или фильм для всей компании.</p>"),
    mine: T("<h3>Здесь только ваше</h3><p>То, что вы смотрите без компании. Нажмите «Добавить», и это увидите только вы.</p>")
  },
  family: {
    all: T("Вся семья"), fx: "smile",
    title: T("Давайте соберём вашу семью"), lead: T("Один раз вводите имя и общий код. Родные вводят тот же код, и список становится общим для всех."),
    code: T("Код вашей семьи"), share: T("Код нашей семьи в «Наши сериалы»: "),
    sync: T("Синхронизация работает: список общий для всей семьи."),
    empty: T("<h3>Здесь пока пусто</h3><p>Нажмите «Добавить» и найдите первый сериал или фильм для всей семьи.</p>"),
    mine: T("<h3>Здесь только ваше</h3><p>То, что вы смотрите отдельно от семьи. Нажмите «Добавить», и это увидите только вы.</p>")
  }
};
function KT() { return KINDS[state.kind] || KINDS.pair; }
function applyKindTexts() {
  const k = KT();
  const t = $("#w-title"), l = $("#w-lead");
  if (t) t.textContent = k.title;
  if (l) l.textContent = k.lead;
  document.querySelectorAll(".lbl-code").forEach((e) => { e.textContent = k.code; });
  document.querySelectorAll("[data-kind]").forEach((b) => { b.classList.toggle("active", b.dataset.kind === state.kind); b.style.setProperty("--c", "var(--amber)"); });
}
function setKind(kind) {
  if (!KINDS[kind] || kind === state.kind) return;
  state.kind = kind;
  lsSet(K(KIND_KEY), kind);
  if (metaRef) metaRef.set(kind).catch(onWriteError);
  applyKindTexts();
  render();
}
function orderedPeople() {
  const me = meSlug();
  const ks = Object.keys(state.people).filter((k) => state.people[k] && state.people[k].name);
  if (state.cfg.nick && ks.indexOf(me) < 0) ks.push(me);
  ks.sort((a, b) => (a === me ? -1 : b === me ? 1 : a < b ? -1 : 1));
  return ks.map((k) => (state.people[k] && state.people[k].name) || state.cfg.nick);
}
function renderPair() {
  const names = orderedPeople();
  const el = $("#pair");
  if (!el) return;
  if (!names.length) { el.innerHTML = ""; return; }
  const pairMode = names.length === 2 && state.kind === "pair";
  const heart = '<svg class="pheart" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z"/></svg>';
  el.classList.toggle("grp", !pairMode);
  if (pairMode) { el.innerHTML = names.map((n) => avatarHtml(n, 34)).join(heart); return; }
  const shown = names.slice(0, 4), more = names.length - shown.length;
  el.innerHTML = shown.map((n) => avatarHtml(n, 32)).join("") + (more > 0 ? '<span class="pmore">+' + more + "</span>" : "");
}

/* ═════════════════ Люди и цвета ═════════════════ */
function personColor(name) {
  const p = state.people[slug(name)];
  if (p && p.color) return p.color;
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
let peopleReady = false;
// Записываем себя в общий список людей. При синхронизации ждём, пока придёт список от партнёра:
// иначе оба телефона выберут один и тот же цвет и свою запись мы бы не отправили в облако.
function ensureMe(remote) {
  const nick = state.cfg.nick;
  if (!nick) return;
  const syncing = !!(state.cfg.firebase && state.cfg.listCode);
  if (syncing && !peopleReady) return;
  const key = meSlug();
  const cur = state.people[key];
  const r = remote && remote[key];
  const pushNeeded = !!(peopleRef && peopleReady && !(r && r.name === nick && r.color));
  if (cur && cur.name === nick && !pushNeeded) return;
  const others = Object.keys(state.people).filter((k) => k !== key);
  const used = others.map((k) => state.people[k].color);
  const color = (cur && cur.color) || PALETTE.find((c) => used.indexOf(c) < 0) || PALETTE[0];
  const rec = { name: nick, color };
  if (cur && cur.avatar) rec.avatar = cur.avatar;
  state.people[key] = rec;
  lsSet(K(LS.people), state.people);
  if (peopleRef) peopleRef.child(key).update(rec).catch(onWriteError);
}

/* ═════════════════ Firebase ═════════════════ */
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.async = false;
    s.onload = res;
    s.onerror = () => { s.remove(); rej(new Error(T("Не загрузился ") + src)); };
    document.head.appendChild(s);
  });
}
let fbLoading = null;
function ensureFirebase() {
  if (window.firebase && window.firebase.database) return Promise.resolve();
  if (!fbLoading) {
    fbLoading = FB_SCRIPTS.reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve())
      .catch((e) => { fbLoading = null; throw e; });
  }
  return fbLoading;
}
function detach() {
  [seriesRef, peopleRef, connRef, mineRef, logRef, mylogRef, metaRef, codesRef, removedRef].forEach((r) => { if (r && r.off) { try { r.off(); } catch (e) {} } });
  rootRef = seriesRef = peopleRef = connRef = mineRef = logRef = mylogRef = metaRef = codesRef = removedRef = null;
  connTok = null;
  peopleReady = false;
}
function setConn(kind, err) {
  state.conn = kind;
  connError = err || "";
  const dot = $("#sync-dot");
  dot.className = "dot" + (kind === "online" ? " on" : kind === "none" || kind === "error" ? " warn" : "");
  renderSubtitle();
}
function connText() {
  switch (state.conn) {
    case "online": return KT().sync;
    case "offline": return T("Нет связи. Изменения сохранены на телефоне и отправятся, когда появится интернет.");
    case "error": return T("Ошибка облака: ") + connError;
    default: if (state.cfg.firebase && !state.cfg.listCode) return T("Введите код в настройках, чтобы список «Вместе» был общим. «Моё» уже сохраняется в облаке."); return T("Синхронизация выключена: список хранится только на этом телефоне. Включите её в настройках.");
  }
}

async function connect() {
  detach();
  loadCaches();
  render();
  const fb = state.cfg.firebase, code = safeCode(state.cfg.listCode);
  if (!fb) { setConn("none"); return; }
  setConn(code ? "offline" : "none");
  try { await ensureFirebase(); } catch (e) { return; }   // повторим, когда вернётся интернет
  let app;
  try {
    const existing = window.firebase.apps[0];
    if (existing && existing.options && existing.options.databaseURL !== fb.databaseURL) await existing.delete();
    app = window.firebase.apps[0] || window.firebase.initializeApp(fb);
  } catch (e) { setConn("error", e.message); return; }

  const db = app.database();
  const tok = connTok = {};
  const alive = () => tok === connTok;
  connRef = db.ref(".info/connected");
  connRef.on("value", (snap) => { if (alive() && code) setConn(snap.val() ? "online" : "offline"); });

  // Личный кабинет: привязан к вам (личный ключ), а не к коду пары.
  const personal = db.ref("lists/u-" + state.cfg.userId);
  mineRef = personal.child("series");
  mylogRef = personal.child("log");
  let firstMine = true;
  mineRef.on("value", (snap) => {
    if (!alive()) return;
    let remote = normalizeAll(snap.val() || {});
    if (firstMine) { firstMine = false; remote = migrateMine(remote); legacyMine(code, remote); }
    state.mine = remote;
    if (state.tab === "mine") state.series = state.mine;
    lsSet(MINE_KEY, state.mine);
    render();
    if (openId === "sheet-detail" && state.current) renderDetail();
  }, () => {});
  mylogRef.on("value", (snap) => {
    if (!alive()) return;
    const remote = snap.val() || {};
    state.mylog = Object.assign({}, state.mylog, remote);
    lsSet(MYLOG_KEY, state.mylog);
    if (state.tab === "stats") renderStats();
  }, () => {});

  codesRef = personal.child("codes");
  codesRef.on("value", (snap) => {
    if (!alive()) return;
    const remote = snap.val() || {};
    state.codes = Object.assign({}, state.codes, remote);
    Object.keys(state.codes).forEach((k) => { if (remote[k] === undefined && codesSynced) delete state.codes[k]; });
    codesSynced = true;
    lsSet(CODES_KEY, state.codes);
    noteCode();
    if (state.tab === "codes") renderCodes();
  }, () => {});

  if (!code) { render(); return; }

  rootRef = db.ref("lists/" + code);
  seriesRef = rootRef.child("series");
  peopleRef = rootRef.child("people");
  logRef = rootRef.child("log");
  metaRef = rootRef.child("meta/kind");
  removedRef = rootRef.child("meta/removed");
  if (joinIntent) { joinIntent = false; removedRef.child(meSlug()).remove().catch(() => {}); }   // вы вошли сами, значит метка «удалён» снимается
  removedRef.on("value", (snap) => {
    if (!alive()) return;
    const rm = snap.val() || {};
    if (rm[meSlug()]) {
      // вас убрали из кабинета: выходим из него, личное остаётся
      const gone = safeCode(state.cfg.listCode);
      state.cfg.listCode = ""; state.cfg.solo = true; persistConfig();
      toast(T("Вас убрали из кабинета ") + gone);
      connect(); render();
    }
  }, () => {});
  metaRef.on("value", (snap) => {
    if (!alive()) return;
    const v = snap.val();
    if (v && KINDS[v]) { if (v !== state.kind) { state.kind = v; lsSet(K(KIND_KEY), v); applyKindTexts(); render(); } noteCode(); }
    else { metaRef.set(state.kind).catch(() => {}); noteCode(); }   // новый кабинет: записываем выбранный тип
  }, () => {});

  let first = true;
  seriesRef.on("value", (snap) => {
    if (!alive()) return;
    let remote = normalizeAll(snap.val() || {});
    if (first) { first = false; remote = migrate(code, remote); }
    state.shared = remote;
    if (state.tab !== "mine") state.series = state.shared;
    lsSet(K(LS.cache), state.shared);
    render();
    if (openId === "sheet-detail" && state.current) renderDetail();
  }, (err) => setConn("error", err && err.message ? err.message : T("нет доступа")));

  logRef.on("value", (snap) => {
    if (!alive()) return;
    const remote = snap.val() || {};
    const mine = state.log[meSlug()] || {};
    // свои отметки, которые ещё не дошли до облака, не теряем
    const merged = Object.assign({}, remote);
    if (Object.keys(mine).length) merged[meSlug()] = Object.assign({}, mine, remote[meSlug()] || {});
    state.log = merged;
    lsSet(K(LS.log), state.log);
    if (state.tab === "stats") renderStats();
  }, () => {});

  peopleRef.on("value", (snap) => {
    if (!alive()) return;
    const remote = snap.val() || {};
    state.people = Object.assign({}, remote);
    peopleReady = true;
    lsSet(K(LS.people), state.people);
    ensureMe(remote);
    render();
  });
}

// Первое подключение к коду: то, что было только на этом телефоне, уезжает в облако — ничего не теряется.
function migrate(code, remote) {
  const flag = LS.synced + "solo";
  if (lsGet(flag, false)) return remote;
  const local = lsGet(LS.cache, {}) || {};   // ключ без кода: только то, что добавили без синхронизации
  const merged = Object.assign({}, remote);
  Object.keys(local).forEach((id) => {
    if (!merged[id]) {
      merged[id] = normalizeSeries(local[id]);
      seriesRef.child(id).set(clean(merged[id])).catch(onWriteError);
    }
  });
  lsSet(flag, true);
  try { localStorage.removeItem(LS.cache); } catch (e) {}
  return merged;
}
function migrateMine(remote) {
  const flag = LS.synced + "mine." + state.cfg.userId;
  if (lsGet(flag, false)) return remote;
  const local = lsGet(MINE_KEY, {}) || {};
  const merged = Object.assign({}, remote);
  Object.keys(local).forEach((id) => {
    if (!merged[id]) {
      merged[id] = normalizeSeries(local[id]);
      mineRef.child(id).set(clean(merged[id])).catch(onWriteError);
    }
  });
  lsSet(flag, true);
  return merged;
}
// Личные сериалы, которые успели сохраниться внутри кода пары (прошлая версия), переезжают в личный кабинет один раз.
function legacyMine(code, current) {
  if (!code || !rootRef) return;
  const flag = LS.synced + "legacy." + code + "." + meSlug();
  if (lsGet(flag, false)) return;
  const ref = rootRef.child("personal/" + meSlug());
  ref.once("value").then((snap) => {
    lsSet(flag, true);
    const old = normalizeAll(snap.val() || {});
    let n = 0;
    Object.keys(old).forEach((id) => {
      if (!state.mine[id] && !current[id]) { state.mine[id] = old[id]; mineRef.child(id).set(clean(old[id])).catch(onWriteError); n++; }
    });
    if (n) { lsSet(MINE_KEY, state.mine); render(); }
  }).catch(() => {});
}
function onWriteError(e) {
  const msg = e && e.message ? e.message : String(e);
  if (/permission/i.test(msg)) toast(T("Облако не принимает записи. Проверьте правила Firebase (см. инструкцию)."));
  else toast(T("Не удалось отправить в облако: ") + msg);
}
window.addEventListener("online", () => {
  if (state.cfg.firebase && state.cfg.listCode && !rootRef) connect();
});

/* ═════════════════ Данные ═════════════════ */
function asArray(v) { return Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v).map((k) => v[k]) : []; }
function normalizeSeries(s) {
  const o = Object.assign({}, s);
  o.genres = asArray(o.genres);
  o.seasonEps = asArray(o.seasonEps);
  o.providers = asArray(o.providers);
  o.progress = o.progress || { season: 1, episode: 0 };
  o.ratings = o.ratings || {};
  localize(o);
  return o;
}
// Названия и описания лежат по языкам (tr/<язык>/...): у каждого из вас всё на своём языке.
function localize(o) {
  const t = o && o.tr && o.tr[LANG];
  if (!t) return o;
  if (t.title) o.title = t.title;
  if (t.overview !== undefined && t.overview !== null) o.overview = t.overview;
  if (t.genres) o.genres = asArray(t.genres);
  return o;
}
function needsWiki(s) { return !isAnime(s) && s.wiki === undefined; }
function needsLang(s) {
  return !isAnime(s) && LANG !== (s.lang || "ru") && !(s.tr && s.tr[LANG]);
}
function normalizeAll(map) {
  const out = {};
  Object.keys(map || {}).forEach((k) => { if (map[k] && typeof map[k] === "object") out[k] = normalizeSeries(map[k]); });
  return out;
}
function setPath(o, path, v) {
  const ks = path.split("/");
  let t = o;
  for (let i = 0; i < ks.length - 1; i++) {
    if (typeof t[ks[i]] !== "object" || t[ks[i]] === null) t[ks[i]] = {};
    t = t[ks[i]];
  }
  if (v === null) delete t[ks[ks.length - 1]]; else t[ks[ks.length - 1]] = v;
}
function saveCache() { if (state.series === state.mine) lsSet(MINE_KEY, state.mine); else lsSet(K(LS.cache), state.series); }
function activeRef() { return state.series === state.mine ? mineRef : seriesRef; }

// Каждое изменение пишем точечно: два телефона не затирают друг друга.
function patchSeries(id, patch) {
  const s = state.series[id];
  if (!s) return;
  const full = Object.assign({}, patch, { updatedAt: Date.now(), updatedBy: state.cfg.nick || "" });
  Object.keys(full).forEach((k) => setPath(s, k, full[k]));
  saveCache();
  if (activeRef()) activeRef().child(id).update(clean(full)).catch(onWriteError);
  render();
  if (openId === "sheet-detail" && state.current === id) renderDetail();
}
function putSeries(s) {
  state.series[s.id] = s;
  saveCache();
  if (activeRef()) activeRef().child(s.id).set(clean(s)).catch(onWriteError);
  render();
}
function removeSeries(id) {
  const old = state.series[id];
  delete state.series[id];
  saveCache();
  if (activeRef()) activeRef().child(id).remove().catch(onWriteError);
  render();
  return old;
}

/* ═════════════════ TMDB ═════════════════ */
async function tmdb(path, params) {
  const key = state.cfg.tmdbApiKey;
  if (!key) throw new Error(T("не задан ключ TMDB"));
  const q = new URLSearchParams(Object.assign({ api_key: key, language: LANGS[LANG].tmdb }, params || {}));
  let res;
  try { res = await fetch(TMDB_API + path + "?" + q.toString()); }
  catch (e) { throw new Error(T("нет связи с TMDB")); }
  if (res.status === 401) throw new Error(T("ключ TMDB не подходит"));
  if (!res.ok) throw new Error(T("TMDB ответил ") + res.status);
  return res.json();
}
function img(path, size) { return path ? (/^https?:/.test(path) ? path : IMG_API + "/" + (size || "w342") + path) : ""; }

const GENERIC_WORDS = ["series", "serial", "serials", "film", "films", "movie", "movies", "tv", "show", "shows", "watch", "title", "online", "serialy", "filmy"];
function titleFromUrl(u) {
  let path = "";
  try { path = new URL(/^https?:/i.test(u) ? u : "https://" + u).pathname; } catch (e) { return u; }
  let parts = [];
  try { parts = decodeURIComponent(path).split("/").filter(Boolean); } catch (e) { parts = path.split("/").filter(Boolean); }
  let seg = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].toLowerCase();
    if (/[a-zа-яёіїє]{3,}/i.test(p) && GENERIC_WORDS.indexOf(p) < 0) { seg = parts[i]; break; }
  }
  seg = seg.replace(/\.(html?|php)$/i, "").replace(/^\d+[-_]/, "").replace(/[-_]+(19|20)\d{2}$/, "")
    .replace(/[-_+]+/g, " ").trim();
  return seg;
}
function isMovie(s) { return !!s && (s.kind === "movie" || String(s.id || "")[0] === "m"); }
function kindOf(key) { return String(key)[0] === "m" ? "movie" : String(key)[0] === "a" ? "anime" : "tv"; }
function rawId(key) { return String(key).replace(/^[tma]/, ""); }
function runtimeText(min) {
  if (!min) return "";
  const h = Math.floor(min / 60), m = min % 60;
  return (h ? h + T(" ч ") : "") + (m ? m + T(" мин") : "");
}
/* ═════════════════ Аниме: Jikan (данные MyAnimeList) ═════════════════ */
const JIKAN = "https://api.jikan.moe/v4";
function isAnime(s) { return !!s && String(s.id || "")[0] === "a"; }
async function jget(url, opts) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, Object.assign({ signal: ctl.signal }, opts || {}));
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}
const ANIME_KIND = { TV: T("Аниме-сериал"), Movie: T("Аниме-фильм"), OVA: "OVA", ONA: "ONA", Special: T("Спецвыпуск"), "TV Special": T("ТВ-спецвыпуск"), Music: T("Клип") };
function jikanPoster(m) { return (m.images && m.images.jpg && (m.images.jpg.large_image_url || m.images.jpg.image_url)) || ""; }
async function searchAnime(q) {
  const d = await jget(JIKAN + "/anime?limit=8&sfw=true&order_by=popularity&q=" + encodeURIComponent(q));
  return ((d && d.data) || []).map((m) => ({
    key: "a" + m.mal_id, title: m.title_english || m.title, orig: m.title,
    year: m.year ? String(m.year) : ((m.aired && m.aired.from) || "").slice(0, 4),
    rating: m.score || 0, poster: jikanPoster(m), overview: cleanText(m.synopsis || ""),
    label: ANIME_KIND[m.type] || T("Аниме")
  }));
}
function cleanText(h) {
  if (!h) return "";
  const t = String(h).replace(/<br\s*\/?>/gi, "\n");
  const d = new DOMParser().parseFromString(t, "text/html");
  return (d.body.textContent || "").replace(/\[Written by MAL Rewrite\]/gi, "").replace(/\n{3,}/g, "\n\n").trim();
}
function metaFromJikan(m) {
  if (!m) throw new Error(T("не найдено"));
  const eps = m.episodes || 0, st = m.status || "";
  const ongoing = /currently/i.test(st);
  const dur = parseInt((String(m.duration || "").match(/\d+/) || [0])[0], 10) || 0;
  return {
    kind: "anime", title: m.title_english || m.title, originalName: m.title, overview: cleanText(m.synopsis || ""),
    posterPath: jikanPoster(m), backdropPath: "",
    year: m.year ? String(m.year) : ((m.aired && m.aired.from) || "").slice(0, 4),
    genres: (m.genres || []).map((g) => g.name), seasons: 1, episodes: eps, seasonEps: eps ? [eps] : [],
    runtime: dur, rating: m.score || 0,
    tmdbStatus: ongoing ? "Returning Series" : /finished/i.test(st) ? "Ended" : /not yet/i.test(st) ? "Planned" : "",
    nextAir: null, providers: [], trailer: (m.trailer && m.trailer.youtube_id) || "", wiki: {}, metaAt: Date.now()
  };
}
async function fetchAnimeMeta(key) {
  const d = await jget(JIKAN + "/anime/" + rawId(key) + "/full");
  return metaFromJikan(d && d.data);
}

// Сайты вроде HDRezka и DoramaClub кладут в ссылку название латиницей (ochen-strannye-dela). Пробуем и как есть, и «по-русски».
function translitRu(t) {
  const multi = [["shch", "щ"], ["sch", "щ"], ["zh", "ж"], ["kh", "х"], ["ch", "ч"], ["sh", "ш"], ["ts", "ц"], ["yo", "ё"], ["yu", "ю"], ["ya", "я"], ["ye", "е"], ["ju", "ю"], ["ja", "я"]];
  const one = { a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и", j: "й", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "ы", z: "з" };
  let s = String(t || "").toLowerCase().replace(/yy/g, "ый").replace(/([bcdfghjklmnpqrstvwxz])ye/g, "$1ые").replace(/([aeiou])y(?![aeiou])/g, "$1й"), out = "";
  for (let i = 0; i < s.length;) {
    let hit = false;
    for (const [k, v] of multi) if (s.startsWith(k, i)) { out += v; i += k.length; hit = true; break; }
    if (hit) continue;
    const ch = s[i++];
    out += one[ch] != null ? one[ch] : ch;
  }
  return out.replace(/ыи/g, "ы").replace(/(^|\s)ы/g, "$1и");
}
function parseInput(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  const imdb = s.match(/tt\d{6,10}/);
  if (imdb) return { type: "imdb", value: imdb[0] };
  const an = s.match(/myanimelist\.net\/(?:animes|anime)\/[a-z]?(\d+)/i);
  if (an) return { type: "tmdb", value: "a" + an[1] };
  const tv = s.match(/themoviedb\.org\/(tv|movie)\/(\d+)/);
  if (tv) return { type: "tmdb", value: (tv[1] === "movie" ? "m" : "t") + tv[2] };
  if (/kinopoisk|kp\.|ivi\.ru|okko/i.test(s) && /^(https?:\/\/|www\.)/i.test(s)) return { type: "hint", value: T("В ссылках этого сайта нет названия. Вставьте название.") };
  if (/^(https?:\/\/|www\.)/i.test(s) || /^[\w-]+(\.[\w-]+)+\/\S+/.test(s)) {
    const t = titleFromUrl(s);
    return t ? { type: "query", value: t, fromUrl: true, alt: /[a-z]/i.test(t) && !/[а-яёіїє]/i.test(t) ? translitRu(t) : "" } : { type: "hint", value: T("Не вышло достать название из ссылки. Вставьте название.") };
  }
  return { type: "query", value: s };
}

/* ═════════════════ Поиск и добавление ═════════════════ */
let searchSeq = 0, searchTimer = null;

function openSearch() {
  $("#search-input").value = "";
  $("#results").innerHTML = T('<div class="hintline">Начните вводить название сериала или фильма. Можно вставить ссылку с IMDb или TMDB, а для других сайтов название берётся из адреса.</div>');
  openSheet("sheet-search");
  setTimeout(() => $("#search-input").focus(), 350);
}
function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 380);
}
function tmdbToResult(it) {
  const mv = it.media_type === "movie";
  return {
    key: (mv ? "m" : "t") + it.id,
    title: it.name || it.title || it.original_name || it.original_title || T("Без названия"),
    orig: it.original_name || it.original_title || "",
    year: (it.first_air_date || it.release_date || "").slice(0, 4),
    rating: it.vote_average || 0,
    poster: img(it.poster_path, "w154"),
    overview: it.overview || "",
    label: (it.original_language === "ja" && (it.genre_ids || []).indexOf(16) >= 0) ? (mv ? T("Аниме-фильм") : T("Аниме-сериал")) : mv ? T("Фильм") : T("Сериал")
  };
}
async function runSearch() {
  const raw = $("#search-input").value;
  const parsed = parseInput(raw);
  const box = $("#results");
  const my = ++searchSeq;
  if (!parsed) { box.innerHTML = ""; return; }
  if (parsed.type === "hint") { box.innerHTML = '<div class="hintline">' + esc(parsed.value) + "</div>"; return; }
  if (parsed.type === "query" && parsed.value.length < 2) return;
  const isAnimeLink = parsed.type === "tmdb" && parsed.value[0] === "a";
  if (!state.cfg.tmdbApiKey && !isAnimeLink && parsed.type !== "query") { box.innerHTML = T('<div class="hintline">Нужен ключ TMDB: откройте настройки, раздел «Ключи и регион».</div>'); return; }
  box.innerHTML = T('<div class="hintline">Ищем…</div>');
  try {
    let main = [], anime = [], animeErr = null, mainErr = null;
    if (parsed.type === "query") {
      const jobs = [];
      jobs.push(state.cfg.tmdbApiKey
        ? tmdb("/search/multi", { query: parsed.value, include_adult: "false" })
            .then(async (d) => {
              let res = (d.results || []).filter((x) => x.media_type === "tv" || x.media_type === "movie");
              if (parsed.alt) {
                try {
                  const d2 = await tmdb("/search/multi", { query: parsed.alt, include_adult: "false" });
                  const seen = {};
                  res.forEach((x) => { seen[x.media_type + x.id] = 1; });
                  (d2.results || []).forEach((x) => { if ((x.media_type === "tv" || x.media_type === "movie") && !seen[x.media_type + x.id]) res.push(x); });
                } catch (e) {}
              }
              main = res.map(tmdbToResult);
            })
            .catch((e) => { mainErr = e; })
        : Promise.resolve());
      jobs.push(parsed.value.length >= 3 ? searchAnime(parsed.value).then((l) => { anime = l; }).catch((e) => { animeErr = e; }) : Promise.resolve());
      await Promise.all(jobs);
    } else if (parsed.type === "imdb") {
      const d = await tmdb("/find/" + parsed.value, { external_source: "imdb_id" });
      main = (d.tv_results || []).map((x) => tmdbToResult(Object.assign({ media_type: "tv" }, x)))
        .concat((d.movie_results || []).map((x) => tmdbToResult(Object.assign({ media_type: "movie" }, x))));
    } else if (isAnimeLink) {
      const m = await fetchAnimeMeta(parsed.value);
      main = [{ key: parsed.value, title: m.title, orig: m.originalName, year: m.year, rating: m.rating, poster: m.posterPath, overview: m.overview, label: T("Аниме") }];
    } else {
      const k = kindOf(parsed.value);
      main = [tmdbToResult(Object.assign({ media_type: k }, await tmdb("/" + k + "/" + rawId(parsed.value))))];
    }
    if (my !== searchSeq) return;
    if (mainErr && !anime.length) throw mainErr;
    renderResults(main.slice(0, 12), parsed, anime.slice(0, 6), animeErr);
  } catch (e) {
    if (my !== searchSeq) return;
    box.innerHTML = T('<div class="hintline">Не получилось найти: ') + esc(e.message) + "</div>";
  }
}
function resultHtml(r) {
  const have = state.series[r.key];
  const sub = [r.label, r.year, r.rating ? "★ " + Number(r.rating).toFixed(1) : "", r.orig && r.orig !== r.title ? r.orig : ""].filter(Boolean).join(" · ");
  const poster = r.poster ? '<img loading="lazy" referrerpolicy="no-referrer" src="' + esc(r.poster) + '" alt="">' : '<div class="noposter">' + esc(r.title.charAt(0).toUpperCase()) + "</div>";
  const mv = r.label === T("Фильм") || r.label === T("Аниме-фильм");
  const acts = have
    ? T('<div class="inlist">Уже в списке: ') + esc(STATUS[have.status] ? STATUS[have.status].label : "") + "</div>"
    : '<div class="racts"><button class="btn small ghost" type="button" data-add="' + esc(r.key) + T('" data-status="want">В планы</button>') +
      '<button class="btn small primary" type="button" data-add="' + esc(r.key) + '" data-status="watching">' + (mv ? T("Смотрим сейчас") : T("Смотрим")) + "</button></div>";
  return '<div class="res"><div class="rimg">' + poster + "</div><div><h4>" + esc(r.title) + "</h4>" +
    (sub ? '<p class="rsub">' + esc(sub) + "</p>" : "") +
    (r.overview ? '<p class="rov">' + esc(r.overview) + "</p>" : "") + acts + "</div></div>";
}
function renderResults(main, parsed, anime, animeErr) {
  const box = $("#results");
  anime = anime || [];
  if (!main.length && !anime.length) {
    box.innerHTML = T('<div class="hintline">Ничего не нашлось') + (parsed && parsed.fromUrl ? T(" по «") + esc(parsed.value) + "»" : "") + T(". Попробуйте написать название по-русски или по-английски") +
      ".</div>";
    return;
  }
  let h = main.map(resultHtml).join("");
  if (anime.length) h += T('<h3 class="rhead">Из аниме-базы</h3>') + anime.map(resultHtml).join("");
  box.innerHTML = h;
}

function pickProviders(d) {
  const r = d["watch/providers"] && d["watch/providers"].results && d["watch/providers"].results[state.cfg.region || "UA"];
  if (!r) return [];
  const seen = {}, out = [];
  ["flatrate", "free", "ads"].forEach((k) => (r[k] || []).forEach((p) => {
    if (!seen[p.provider_id]) { seen[p.provider_id] = 1; out.push({ n: p.provider_name, l: p.logo_path || "" }); }
  }));
  return out.slice(0, 6);
}
function pickTrailer(d) {
  const v = (d.videos && d.videos.results || []).filter((x) => x.site === "YouTube");
  const score = (x) => (x.type === "Trailer" ? 2 : x.type === "Teaser" ? 1 : 0) * 10 + (x.iso_639_1 === "ru" ? 2 : x.iso_639_1 === "en" ? 1 : 0);
  v.sort((a, b) => score(b) - score(a));
  return v.length ? v[0].key : "";
}
// Данные о сериале, которые приходят из TMDB (статус и прогресс сюда не входят).
function metaFromMovie(d) {
  return {
    kind: "movie",
    title: d.title || d.original_title || T("Без названия"),
    originalName: d.original_title || "",
    overview: d.overview || "",
    posterPath: d.poster_path || "",
    backdropPath: d.backdrop_path || "",
    year: (d.release_date || "").slice(0, 4),
    genres: (d.genres || []).map((g) => g.name),
    seasons: 0, episodes: 0, seasonEps: [],
    runtime: d.runtime || 0,
    wikidata: (d.external_ids && d.external_ids.wikidata_id) || "",
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : 0,
    tmdbStatus: "",
    nextAir: null,
    providers: pickProviders(d),
    trailer: pickTrailer(d),
    metaAt: Date.now()
  };
}
function metaFrom(d) {
  const eps = (d.seasons || []).filter((s) => s.season_number > 0).sort((a, b) => a.season_number - b.season_number).map((s) => s.episode_count || 0);
  const na = d.next_episode_to_air;
  return {
    title: d.name || d.original_name || T("Без названия"),
    originalName: d.original_name || "",
    jp: d.original_language === "ja" && (d.genres || []).some((g) => g.id === 16),
    overview: d.overview || "",
    posterPath: d.poster_path || "",
    backdropPath: d.backdrop_path || "",
    year: (d.first_air_date || "").slice(0, 4),
    genres: (d.genres || []).map((g) => g.name),
    seasons: d.number_of_seasons || eps.length || 0,
    episodes: eps.reduce((a, b) => a + b, 0) || d.number_of_episodes || 0,
    seasonEps: eps,
    epRuntime: (d.episode_run_time && d.episode_run_time[0]) || (d.last_episode_to_air && d.last_episode_to_air.runtime) || 0,
    wikidata: (d.external_ids && d.external_ids.wikidata_id) || "",
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : 0,
    tmdbStatus: d.status || "",
    nextAir: na && na.air_date ? { date: na.air_date, season: na.season_number, episode: na.episode_number } : null,
    providers: pickProviders(d),
    trailer: pickTrailer(d),
    metaAt: Date.now()
  };
}
async function fetchMeta(key) {
  if (kindOf(key) === "anime") return fetchAnimeMeta(key);
  const k = kindOf(key), path = "/" + k + "/" + rawId(key);
  const d = await tmdb(path, { append_to_response: "videos,watch/providers,external_ids", include_video_language: "ru,en,null" });
  if (!d.overview) {
    try { const en = await tmdb(path, { language: "en-US" }); d.overview = en.overview || ""; } catch (e) {}
  }
  return wikiLinks(k === "movie" ? metaFromMovie(d) : metaFrom(d));
}
// Статьи Википедии на трёх языках: через Wikidata, который знает TMDB. Если статьи нет, в карточке будет ссылка на поиск.
async function wikiLinks(meta) {
  const out = {};
  if (meta.wikidata) {
    try {
      const id = meta.wikidata;
      const d = await jget("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" + encodeURIComponent(id) + "&props=sitelinks/urls&sitefilter=enwiki|ruwiki|ukwiki&format=json&origin=*");
      const sl = (d.entities && d.entities[id] && d.entities[id].sitelinks) || {};
      ["en", "ru", "uk"].forEach((l) => { if (sl[l + "wiki"] && sl[l + "wiki"].url) out[l] = sl[l + "wiki"].url; });
    } catch (e) { /* без Википедии карточка тоже работает */ }
  }
  meta.wiki = out;
  return meta;
}
function wikiHtml(s) {
  const w = s.wiki || {};
  const items = [["en", "EN"], ["ru", "RU"], ["uk", "UK"]].map((p) => {
    const l = p[0];
    const q = encodeURIComponent(l === "en" ? (s.originalName || s.title) : (LANG === l ? s.title : (s.originalName || s.title)));
    const url = w[l] || "https://" + l + ".wikipedia.org/w/index.php?search=" + q;
    return '<a class="wk' + (w[l] ? "" : " srch") + '" target="_blank" rel="noopener" href="' + esc(url) + '">' + p[1] + "</a>";
  }).join("");
  return T('<div class="wiki">Википедия: ') + items + "</div>";
}
let adding = false;
async function addSeries(key, status) {
  if (adding) return;
  adding = true;
  try {
    const meta = await fetchMeta(key);
    const s = Object.assign({
      id: key,
      lang: LANG,
      status,
      progress: { season: 1, episode: 0 },
      ratings: {},
      addedBy: state.cfg.nick || "",
      addedAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: state.cfg.nick || ""
    }, meta);
    putSeries(s);
    closeSheet();
    toast(T("Добавлено: ") + s.title);
  } catch (e) {
    toast(T("Не удалось добавить: ") + e.message);
  } finally { adding = false; }
}
const META_KEYS = ["title", "originalName", "overview", "posterPath", "backdropPath", "year", "genres", "seasons", "episodes", "seasonEps", "rating", "tmdbStatus", "nextAir", "providers", "trailer", "metaAt", "runtime", "kind", "epRuntime", "wikidata", "wiki"];
async function refreshMeta(id) {
  const s = state.series[id];
  if (!s || (!state.cfg.tmdbApiKey && !isAnime(s)) || !navigator.onLine) return;
  try {
    const meta = await fetchMeta(id);
    const patch = {};
    const own = isAnime(s) || (s.lang || "ru") === LANG;   // тексты на своём языке пишем в tr/<язык>, чужие не трогаем
    META_KEYS.forEach((k) => {
      const v = meta[k] === undefined ? null : meta[k];
      if (!own && (k === "title" || k === "overview" || k === "genres")) patch["tr/" + LANG + "/" + k] = v;
      else patch[k] = v;
    });
    patchSeriesQuiet(id, patch);
  } catch (e) { /* тихо: данные обновятся в следующий раз */ }
}
// Обновление данных из TMDB не должно «поднимать» сериал в ленте как будто его смотрели.
function patchSeriesQuiet(id, patch) {
  const s = state.series[id];
  if (!s) return;
  Object.keys(patch).forEach((k) => setPath(s, k, patch[k]));
  localize(s);
  saveCache();
  if (activeRef()) activeRef().child(id).update(clean(patch)).catch(() => {});
  render();
  if (openId === "sheet-detail" && state.current === id) renderDetail();
}
let backfilling = false;
async function backfillMeta() {
  if (backfilling) return;
  backfilling = true;
  const ids = Object.keys(state.series).filter((id) => { const x = state.series[id]; return !x.metaAt || needsLang(x) || needsWiki(x) || (!isMovie(x) && !isAnime(x) && x.epRuntime == null); }).slice(0, 25);
  for (const id of ids) {
    await refreshMeta(id);
    await new Promise((r) => setTimeout(r, 350));
  }
  backfilling = false;
}

/* ═════════════════ Прогресс ═════════════════ */
function pos(s) { return s.progress || { season: 1, episode: 0 }; }
function watchedCount(s) {
  const p = pos(s), eps = s.seasonEps || [];
  let n = 0;
  for (let i = 0; i < (p.season || 1) - 1; i++) n += eps[i] || 0;
  return n + (p.episode || 0);
}
function totalEps(s) { return (s.seasonEps || []).reduce((a, b) => a + b, 0) || s.episodes || 0; }
function pctOf(s) {
  if (s.status === "done") return 1;
  if (isMovie(s)) return 0;
  const t = totalEps(s);
  return t ? Math.max(0, Math.min(1, watchedCount(s) / t)) : 0;
}
function posText(s) {
  const p = pos(s);
  if ((p.season || 1) === 1 && !(p.episode > 0)) return T("Ещё не начали");
  return T("Сезон ") + p.season + T(" · серия ") + p.episode;
}
function advance(id) {
  const s = state.series[id];
  if (!s) return;
  if (isMovie(s)) {
    const was = s.status;
    patchSeries(id, { status: "done" });
    bumpLog(1); hearts();
    toast(T("Посмотрели «") + s.title + "»", { label: T("Отменить"), fn: () => { patchSeries(id, { status: was }); bumpLog(-1); } });
    return;
  }
  const p = pos(s), eps = s.seasonEps || [];
  let n = { season: p.season || 1, episode: (p.episode || 0) + 1 };
  const cur = eps[n.season - 1];
  if (cur && n.episode > cur) {
    if (n.season < eps.length) n = { season: n.season + 1, episode: 1 };
    else { toast(T("Это последняя вышедшая серия. Новых пока нет.")); return; }
  }
  const prev = { progress: { season: p.season || 1, episode: p.episode || 0 }, status: s.status };
  const patch = { progress: n };
  const lastEp = eps.length && n.season === eps.length && n.episode >= eps[eps.length - 1];
  const ended = ["Ended", "Canceled"].indexOf(s.tmdbStatus) >= 0;
  let finished = false;
  if (lastEp && ended) { patch.status = "done"; finished = true; }
  else if (s.status === "want" || s.status === "paused") patch.status = "watching";
  patchSeries(id, patch);
  popPos();
  bumpLog(1); hearts();
  toast(finished ? T("Досмотрели «") + s.title + "»" : T("Сезон ") + n.season + T(" · серия ") + n.episode,
    { label: T("Отменить"), fn: () => { patchSeries(id, prev); bumpLog(-1); } });
}
let lastPt = { x: innerWidth / 2, y: innerHeight * 0.7 };
document.addEventListener("pointerdown", (e) => { lastPt = { x: e.clientX, y: e.clientY }; }, true);
const FX = {
  heart: (c) => '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="' + c + '"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z"/></svg>',
  star: (c) => '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="' + c + '"><path d="M12 2.8l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>',
  smile: (c) => '<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="10" fill="' + c + '"/><circle cx="8.6" cy="10" r="1.5" fill="#2a2236"/><circle cx="15.4" cy="10" r="1.5" fill="#2a2236"/><path d="M7.6 14.2q4.4 4.4 8.8 0" stroke="#2a2236" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>'
};
function hearts() {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const col = personColor(state.cfg.nick);
  const draw = FX[KT().fx] || FX.heart;
  for (let i = 0; i < 7; i++) {
    const h = document.createElement("span");
    h.className = "flyheart";
    h.innerHTML = draw(col);
    h.style.left = lastPt.x + "px"; h.style.top = lastPt.y + "px";
    h.style.setProperty("--dx", Math.round((Math.random() - 0.5) * 120) + "px");
    h.style.setProperty("--dy", -Math.round(70 + Math.random() * 90) + "px");
    h.style.setProperty("--sz", Math.round(12 + Math.random() * 12) + "px");
    h.style.animationDelay = Math.round(i * 40) + "ms";
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 1400);
  }
}
function popPos() {
  const el = $("#bigpos");
  if (el) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
}
function stepProgress(id, which, delta) {
  const s = state.series[id];
  if (!s) return;
  const p = Object.assign({ season: 1, episode: 0 }, pos(s)), eps = s.seasonEps || [];
  if (which === "season") {
    p.season = Math.max(1, p.season + delta);
    if (eps.length) p.season = Math.min(eps.length, p.season);
    const cap = eps[p.season - 1];
    if (cap && p.episode > cap) p.episode = cap;
  } else {
    p.episode = Math.max(0, p.episode + delta);
    const cap = eps[p.season - 1];
    if (cap) p.episode = Math.min(cap, p.episode);
  }
  patchSeries(id, { progress: p });
}

/* ═════════════════ Цвет постера ═════════════════ */
function hueFromTitle(t) {
  let h = 0;
  for (const ch of String(t || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}
function tintFor(s) {
  return (s.posterPath && state.tint[s.posterPath]) || { h: hueFromTitle(s.title || s.id), s: 36 };
}
function tintStyle(s) { const t = tintFor(s); return "--th:" + t.h + ";--ts:" + t.s + "%"; }
function computeTint(url) {
  return new Promise((resolve) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      try {
        const W = 16, H = 24, c = document.createElement("canvas");
        c.width = W; c.height = H;
        const x = c.getContext("2d");
        x.drawImage(im, 0, 0, W, H);
        const d = x.getImageData(0, 0, W, H).data;
        let sx = 0, sy = 0, sw = 0, ss = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx - mn;
          if (mx < 0.15 || sat < 0.12) continue;
          let h;
          if (mx === r) h = ((g - b) / sat) % 6; else if (mx === g) h = (b - r) / sat + 2; else h = (r - g) / sat + 4;
          h *= 60; if (h < 0) h += 360;
          const w = sat * mx;
          sx += Math.cos(h * Math.PI / 180) * w; sy += Math.sin(h * Math.PI / 180) * w; sw += w; ss += sat * w;
        }
        if (!sw) return resolve(null);
        let h = Math.atan2(sy, sx) * 180 / Math.PI; if (h < 0) h += 360;
        resolve({ h: Math.round(h), s: Math.round(Math.max(28, Math.min(58, (ss / sw) * 100))) });
      } catch (e) { resolve(null); }
    };
    im.onerror = () => resolve(null);
    im.src = url;
  });
}
let tinting = false;
async function queueTints() {
  if (tinting) return;
  tinting = true;
  try {
    const todo = [];
    Object.keys(state.series).forEach((id) => {
      const p = state.series[id].posterPath;
      if (p && !state.tint[p] && todo.indexOf(p) < 0) todo.push(p);
    });
    for (const p of todo.slice(0, 40)) {
      const t = await computeTint(img(p, "w92"));
      state.tint[p] = t || tintFor({ title: p });
      lsSet(LS.tint, state.tint);
      $$('[data-tint="' + p + '"]').forEach((el) => { el.style.setProperty("--th", state.tint[p].h); el.style.setProperty("--ts", state.tint[p].s + "%"); });
    }
  } finally { tinting = false; }
}

/* ═════════════════ Отрисовка списка ═════════════════ */
function byRecent(a, b) { return (b.updatedAt || b.addedAt || 0) - (a.updatedAt || a.addedAt || 0); }

function renderSubtitle() {
  const list = Object.keys(state.series).map((k) => state.series[k]);
  const watching = list.filter((s) => s.status === "watching").length;
  const names = Object.keys(state.people).map((k) => state.people[k].name).filter(Boolean);
  let t;
  if (!list.length) t = state.conn === "online" || state.conn === "offline" ? T("Пока ничего не добавлено") : T("Список пуст");
  else {
    const mv = list.filter(isMovie).length, tv = list.length - mv;
    const parts = [];
    if (tv) parts.push(tv + " " + plural(tv, [T("сериал"), T("сериала"), T("сериалов")]));
    if (mv) parts.push(mv + " " + plural(mv, [T("фильм"), T("фильма"), T("фильмов")]));
    t = parts.join(T(" и ")) + (watching ? T(", смотрим ") + watching : "");
  }
  if (state.tab === "together") {
    if (names.length === 2 && state.kind === "pair") t = names[0] + T(" и ") + names[1] + ": " + t;
    else if (names.length >= 2) t = names.length + " " + plural(names.length, [T("человек"), T("человека"), T("людей")]) + " · " + t;
  }
  if (state.tab === "mine") t = list.length ? T("Только для вас · ") + t : T("Только для вас");
  if (state.tab === "stats") t = T("Итоги");
  if (state.tab === "codes") t = T("Ваши кабинеты");
  if (state.conn === "none") t += T(" · только на этом телефоне");
  if (state.conn === "offline") t += T(" · нет связи");
  $("#subtitle").textContent = t;
}

function whoHtml(s) {
  if (!s.addedBy || state.tab === "mine") return "";
  return T('<span class="who" title="Добавил(а) ') + esc(s.addedBy) + '">' + avatarHtml(s.addedBy, 26) + "</span>";
}
function posterHtml(s, size) {
  const u = img(s.posterPath, size);
  return u ? '<img loading="lazy" src="' + esc(u) + '" alt="">' : '<div class="noposter">' + esc((s.title || "?").trim().charAt(0).toUpperCase()) + "</div>";
}
function relDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  const abs = d.toLocaleDateString(LANGS[LANG].loc, { day: "numeric", month: "long" });
  if (diff === 0) return T("сегодня");
  if (diff === 1) return T("завтра");
  if (diff > 1 && diff < 15) return T("через ") + diff + " " + plural(diff, [T("день"), T("дня"), T("дней")]) + " (" + abs + ")";
  if (diff < 0) return abs;
  return abs;
}

function renderRail() {
  const wrap = $("#rail-wrap");
  const items = Object.keys(state.series).map((k) => state.series[k]).filter((s) => s.status === "watching" && !isMovie(s)).sort(byRecent).slice(0, 8);
  if (!items.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  $("#rail").innerHTML = items.map((s) => {
    const bd = img(s.backdropPath || s.posterPath, s.backdropPath ? "w500" : "w342");
    let next = "";
    if (s.nextAir && s.nextAir.date) next = T("Новая серия: ") + relDate(s.nextAir.date);
    else if (["Ended", "Canceled"].indexOf(s.tmdbStatus) >= 0) next = TMDB_STATUS_RU[s.tmdbStatus] === T("Закрыт") ? T("Сериал закрыт") : T("Сериал завершён");
    const p = pos(s);
    const started = !((p.season || 1) === 1 && !(p.episode > 0));
    return '<article class="rcard" data-id="' + esc(s.id) + '" data-tint="' + esc(s.posterPath) + '" style="' + tintStyle(s) + '">' +
      (bd ? '<div class="rbg" style="background-image:url(\'' + esc(bd) + '\')"></div>' : "") + '<div class="rshade"></div>' +
      '<div class="rbody"><div class="rtitle">' + esc(s.title) + "</div>" +
      '<div class="rpos">' + (started ? T("Сезон <b>") + esc(p.season) + T("</b> · серия <b>") + esc(p.episode) + "</b>" : T("Ещё не начали")) + "</div>" +
      '<div class="rbar"><i style="width:' + Math.round(pctOf(s) * 100) + '%"></i></div>' +
      '<div class="rrow"><span class="rnext">' + esc(next) + '</span><button class="plus1" type="button" data-act="plus1" data-id="' + esc(s.id) + T('">+1 серия</button></div>') +
      "</div></article>";
  }).join("");
}

function renderChips() {
  const list = Object.keys(state.series).map((k) => state.series[k]);
  const counts = { all: list.length };
  Object.keys(STATUS).forEach((k) => { counts[k] = list.filter((s) => s.status === k).length; });
  const defs = [["all", T("Все")]].concat(Object.keys(STATUS).map((k) => [k, STATUS[k].label]));
  $("#filters").innerHTML = defs.map((d) =>
    '<button type="button" class="chip' + (state.filter === d[0] ? " active" : "") + '" data-filter="' + d[0] + '">' + esc(d[1]) + "<em>" + counts[d[0]] + "</em></button>"
  ).join("");
}

function renderGrid() {
  const grid = $("#grid");
  const all = Object.keys(state.series).map((k) => state.series[k]);
  const list = (state.filter === "all" ? all : all.filter((s) => s.status === state.filter)).sort(byRecent);
  if (!list.length) {
    grid.innerHTML = all.length
      ? T('<div class="empty"><h3>В этом разделе пусто</h3><p>Смените фильтр сверху или добавьте что-нибудь.</p></div>')
      : '<div class="empty">' + avatarHtml(state.cfg.nick || T("Вы"), 84, "bounce") + (state.tab === "mine" ? KT().mine : KT().empty) + "</div>";
    return;
  }
  grid.innerHTML = list.map((s) => {
    const st = STATUS[s.status] || STATUS.want;
    const p = pos(s);
    const started = !((p.season || 1) === 1 && !(p.episode > 0));
    const line = isMovie(s) ? (s.status === "done" ? T("Посмотрели") : st.label) : s.status === "done" ? T("Досмотрели") : s.status === "watching" && started ? T("С") + p.season + T(" · Э") + p.episode : st.label;
    return '<article class="pcard" data-id="' + esc(s.id) + '" data-tint="' + esc(s.posterPath) + '" style="' + tintStyle(s) + '">' +
      '<div class="pimg">' + posterHtml(s, "w342") + whoHtml(s) +
      (s.status !== "want" && !(isMovie(s) && s.status !== "done") ? '<div class="pbar' + (s.status === "done" ? " done" : "") + '"><b style="width:' + Math.round(pctOf(s) * 100) + '%"></b></div>' : "") + "</div>" +
      '<div class="pmeta"><h3 class="ptitle">' + esc(s.title) + '</h3><p class="pline"><span class="sdot" style="background:' + st.color + '"></span>' + esc(line) + "</p></div></article>";
  }).join("");
}

/* ═════════════════ Итоги ═════════════════ */
function dkey(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function bumpLog(n) {
  const me = meSlug(), day = dkey(new Date());
  state.log[me] = state.log[me] || {};
  state.log[me][day] = Math.max(0, (state.log[me][day] || 0) + n);
  lsSet(K(LS.log), state.log);
  if (logRef) logRef.child(me + "/" + day).set(state.log[me][day]).catch(() => {});
  state.mylog[day] = Math.max(0, (state.mylog[day] || 0) + n);
  lsSet(MYLOG_KEY, state.mylog);
  if (mylogRef) mylogRef.child(day).set(state.mylog[day]).catch(() => {});
}
function minutesOf(s) {
  if (isMovie(s)) return s.status === "done" ? (s.runtime || 110) : 0;
  const per = s.epRuntime || s.runtime || (isAnime(s) ? 24 : 45);
  const n = Math.max(watchedCount(s), s.status === "done" ? totalEps(s) : 0);
  return n * per;
}
function epsOf(s) {
  if (isMovie(s)) return 0;
  return Math.max(watchedCount(s), s.status === "done" ? totalEps(s) : 0);
}
function statsList() {
  if (state.statsScope === "me") return Object.keys(state.shared).map((k) => state.shared[k]).filter((s) => !state.mine[s.id]).concat(Object.keys(state.mine).map((k) => state.mine[k]));
  return Object.keys(state.shared).map((k) => state.shared[k]);
}
function hoursText(min) {
  if (min < 60) return min + T(" мин");
  const h = min / 60;
  return (h >= 100 ? Math.round(h) : Math.round(h * 10) / 10).toString().replace(".", DEC) + T(" ч");
}
function renderStats() {
  const box = $("#stats");
  const names = state.statsScope === "me" ? [state.cfg.nick].filter(Boolean) : orderedPeople();
  const list = statsList();
  const seg = '<div class="seg statsseg"><button type="button" data-sscope="together" class="' + (state.statsScope === "together" ? "active" : "") + ('" style="--c:var(--amber)">' + KT().all + "</button>") +
    '<button type="button" data-sscope="me" class="' + (state.statsScope === "me" ? "active" : "") + T('" style="--c:var(--amber)">Только я</button></div>');
  if (!list.length) {
    box.innerHTML = seg + '<div class="empty">' + avatarHtml(state.cfg.nick || T("Вы"), 84, "bounce") + T("<h3>Пока считать нечего</h3><p>Добавьте сериал и отметьте серию: здесь появятся часы, жанры и недельная активность.</p></div>");
    return;
  }
  let eps = 0, min = 0, films = 0, finished = 0;
  list.forEach((s) => {
    eps += epsOf(s); min += minutesOf(s);
    if (isMovie(s) && s.status === "done") films++;
    if (s.status === "done" && !isMovie(s)) finished++;
  });

  const tiles = [
    [T("Серий"), eps, T("серий просмотрено")],
    [T("Время"), hoursText(min), T("перед экраном")],
    [T("Досмотрели"), finished, plural(finished, [T("сериал"), T("сериала"), T("сериалов")])],
    [T("Фильмов"), films, T("просмотрено")]
  ].map((t) => '<div class="tile"><b>' + esc(t[1]) + "</b><span>" + esc(t[0]) + "</span></div>").join("");

  // неделя
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const wdName = (d) => d.toLocaleDateString(LANGS[LANG].loc, { weekday: "short" }).replace(".", "");
  const who = names.length ? names : [state.cfg.nick || T("Вы")];
  let maxv = 1, weekTotal = 0;
  const LG = state.statsScope === "me" ? { [slug(who[0])]: state.mylog } : state.log;
  const vals = days.map((d) => who.map((n) => { const v = (LG[slug(n)] || {})[dkey(d)] || 0; maxv = Math.max(maxv, v); weekTotal += v; return v; }));
  const week = days.map((d, i) => '<div class="wcol"><div class="wbars">' + who.map((n, j) => {
    const v = vals[i][j];
    return '<i style="height:' + (v ? Math.max(8, Math.round(v / maxv * 100)) : 3) + "%;background:" + esc(personColor(n)) + (v ? "" : ";opacity:.25") + '">' + (v ? "<em>" + v + "</em>" : "") + "</i>";
  }).join("") + "</div><span" + (i === 6 ? ' class="today"' : "") + ">" + wdName(d) + "</span></div>").join("");
  const legend = who.length > 1 ? '<div class="legend">' + who.map((n) => avatarHtml(n, 20) + "<span>" + esc(n) + "</span>").join("") + "</div>" : "";

  // статусы
  const cnt = {};
  list.forEach((s) => { cnt[s.status] = (cnt[s.status] || 0) + 1; });
  const stbar = Object.keys(STATUS).filter((k) => cnt[k]).map((k) => '<i style="flex:' + cnt[k] + ";background:" + STATUS[k].color + '" title="' + esc(STATUS[k].label) + '"></i>').join("");
  const stleg = Object.keys(STATUS).filter((k) => cnt[k]).map((k) => '<span><i style="background:' + STATUS[k].color + '"></i>' + esc(STATUS[k].label) + " <b>" + cnt[k] + "</b></span>").join("");

  // жанры
  const gc = {};
  list.forEach((s) => (s.genres || []).forEach((g) => { gc[g] = (gc[g] || 0) + 1; }));
  const top = Object.keys(gc).sort((a, b) => gc[b] - gc[a]).slice(0, 5);
  const gmax = top.length ? gc[top[0]] : 1;
  const genres = top.map((g) => '<div class="grow"><span>' + esc(g) + '</span><div><i style="width:' + Math.round(gc[g] / gmax * 100) + '%"></i></div><b>' + gc[g] + "</b></div>").join("");

  // оценки
  const agg = {};
  list.forEach((s) => Object.keys(s.ratings || {}).forEach((k) => {
    const n = s.ratings[k] && s.ratings[k].n;
    if (!n) return;
    agg[k] = agg[k] || { sum: 0, c: 0 };
    agg[k].sum += n; agg[k].c++;
  }));
  const rateRows = who.map((n) => {
    const a = agg[slug(n)];
    return '<div class="rrow2">' + avatarHtml(n, 30) + "<span>" + esc(n) + "</span><b>" + (a ? (a.sum / a.c).toFixed(1).replace(".", DEC) : "—") + "</b><small>" + (a ? a.c + " " + plural(a.c, [T("оценка"), T("оценки"), T("оценок")]) : T("нет оценок")) + "</small></div>";
  }).join("");
  let strict = "";
  const rated = who.filter((n) => agg[slug(n)] && agg[slug(n)].c >= 3);
  if (who.length >= 3 && rated.length >= 2) {
    const avg = (n) => agg[slug(n)].sum / agg[slug(n)].c;
    const sorted = rated.slice().sort((x, y) => avg(x) - avg(y));
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    strict = avg(hi) - avg(lo) >= 0.2
      ? T('<p class="statnote">Строже всех оценивает ') + esc(lo) + T(", щедрее всех ") + esc(hi) + ".</p>"
      : T('<p class="statnote">Вкусы у вас почти совпадают.</p>');
  }
  if (who.length === 2) {
    const a = agg[slug(who[0])], b = agg[slug(who[1])];
    if (a && b && a.c >= 3 && b.c >= 3) {
      const da = a.sum / a.c, db = b.sum / b.c;
      if (Math.abs(da - db) >= 0.2) strict = T('<p class="statnote">Строже оценивает ') + esc(da < db ? who[0] : who[1]) + ".</p>";
      else strict = T('<p class="statnote">Вкусы у вас почти совпадают.</p>');
    }
  }
  const favs = list.map((s) => {
    const rs = Object.keys(s.ratings || {}).map((k) => s.ratings[k] && s.ratings[k].n).filter(Boolean);
    return rs.length ? { s, avg: rs.reduce((x, y) => x + y, 0) / rs.length, n: rs.length } : null;
  }).filter(Boolean).sort((x, y) => y.avg - x.avg || y.n - x.n).slice(0, 3);
  const favHtml = favs.length ? T('<h4 class="sublabel">Лучшее у вас</h4>') + favs.map((f) =>
    '<div class="fav" data-id="' + esc(f.s.id) + '"><div class="fimg">' + posterHtml(f.s, "w154") + "</div><div><b>" + esc(f.s.title) + "</b><span>" + STAR_S + " " + f.avg.toFixed(1).replace(".", DEC) + "</span></div></div>").join("") : "";

  // забавное
  const fun = [];
  const added = list.map((s) => s.addedAt).filter(Boolean);
  if (state.statsScope === "together" && added.length) {
    const d = Math.max(1, Math.floor((Date.now() - Math.min.apply(null, added)) / 86400000));
    fun.push([T("Вместе в списке"), d + " " + plural(d, [T("день"), T("дня"), T("дней")])]);
  }
  const longest = list.filter((s) => !isMovie(s)).sort((a, b) => totalEps(b) - totalEps(a))[0];
  if (longest && totalEps(longest)) fun.push([T("Самый длинный"), longest.title + " · " + totalEps(longest) + T(" сер.")]);
  if (min) {
    const movies = Math.round(min / 110);
    if (movies >= 2) fun.push([T("Это как"), movies + " " + plural(movies, [T("фильм"), T("фильма"), T("фильмов")]) + T(" подряд")]);
  }
  const funHtml = fun.length ? '<div class="funs">' + fun.map((f) => '<div><span>' + esc(f[0]) + "</span><b>" + esc(f[1]) + "</b></div>").join("") + "</div>" : "";

  box.innerHTML = seg +
    '<div class="tiles">' + tiles + "</div>" +
    T('<section class="card"><h3>Эта неделя</h3><p class="statnote">') + (weekTotal ? weekTotal + " " + plural(weekTotal, [T("отметка"), T("отметки"), T("отметок")]) + T(" за 7 дней") : T("Отметки появятся, когда нажмёте «+1 серия»")) + "</p>" +
    '<div class="week">' + week + "</div>" + legend + "</section>" +
    T('<section class="card"><h3>Что в списке</h3><div class="stbar">') + stbar + '</div><div class="stleg">' + stleg + "</div></section>" +
    (genres ? T('<section class="card"><h3>Любимые жанры</h3>') + genres + "</section>" : "") +
    T('<section class="card"><h3>Оценки</h3>') + rateRows + strict + favHtml + "</section>" +
    funHtml;
}

function renderTabs() {
  document.querySelectorAll("#tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));
}
function render() {
  renderSubtitle();
  renderPair();
  renderTabs();
  const st = state.tab === "stats", cd = state.tab === "codes", off = st || cd;
  $("#filters").hidden = off; $("#grid").hidden = off; $("#stats").hidden = !st; $("#codes").hidden = !cd; $("#fab").hidden = off;
  if (off) {
    $("#rail-wrap").hidden = true;
    if (st) renderStats(); else renderCodes();
    return;
  }
  renderRail();
  renderChips();
  renderGrid();
  queueTints();
}

/* ═════════════════ Мои коды (кабинеты) ═════════════════ */
function noteCode() {
  const code = safeCode(state.cfg.listCode);
  if (!code) return;
  const old = state.codes[code] || {};
  const rec = { kind: state.kind, at: old.at || Date.now(), seen: Date.now() };
  if (old.kind === rec.kind && old.seen && Date.now() - old.seen < 3600000) return;   // не пишем в облако без нужды
  state.codes[code] = rec;
  lsSet(CODES_KEY, state.codes);
  if (codesRef) codesRef.child(code).set(rec).catch(() => {});
  if (state.tab === "codes") renderCodes();
}
function codeCount(code) {
  const cur = safeCode(state.cfg.listCode) === code;
  if (cur) return { n: Object.keys(state.shared || {}).length, people: Object.keys(state.people || {}).length };
  const sh = lsGet(code ? "serialwatch.cache." + code : "", null), pp = lsGet(code ? "serialwatch.people." + code : "", null);
  return { n: sh ? Object.keys(sh).length : null, people: pp ? Object.keys(pp).length : null };
}
let codeDraftKind = "pair";
function renderCodes() {
  const box = $("#codes");
  const cur = safeCode(state.cfg.listCode);
  const list = Object.keys(state.codes).sort((a, b) => (a === cur ? -1 : b === cur ? 1 : (state.codes[b].seen || 0) - (state.codes[a].seen || 0)));
  const kindName = (k) => (KINDS[k] ? ({ pair: T("Пара"), friends: T("Друзья"), family: T("Семья") })[k] : "");
  let h = '<p class="codes-note">' + T("Здесь только ваши кабинеты. Другие люди этот список не видят.") + "</p>";
  if (!list.length) h += '<div class="empty">' + T("<h3>Пока пусто</h3><p>Кабинеты появятся здесь, когда вы войдёте по коду. Или добавьте код ниже.</p>") + "</div>";
  h += '<div class="codelist">';
  list.forEach((code) => {
    const r = state.codes[code], active = code === cur, cc = codeCount(code);
    const info = [];
    if (cc.n !== null) info.push(cc.n + " " + plural(cc.n, [T("сериал"), T("сериала"), T("сериалов")]));
    if (cc.people) info.push(cc.people + " " + plural(cc.people, [T("человек"), T("человека"), T("людей")]));
    h += '<div class="codecard' + (active ? " on" : "") + '" data-code="' + esc(code) + '">' +
      '<button type="button" class="codemain" data-codego="' + esc(code) + '"><span class="codeval">' + esc(code) + '</span>' +
      '<span class="codemeta">' + esc(kindName(r.kind)) + (info.length ? " · " + esc(info.join(" · ")) : "") + '</span></button>' +
      (active ? '<span class="codenow">' + T("Сейчас") + "</span>" : "") +
      '<button type="button" class="iconbtn codeshare" data-codeshare="' + esc(code) + '" aria-label="' + T("Поделиться кодом") + '">&#8599;</button>' +
      (active ? "" : '<button type="button" class="iconbtn codedel" data-codedel="' + esc(code) + '" aria-label="' + T("Убрать из списка") + '">&times;</button>') +
      "</div>";
  });
  h += "</div>";
  h += '<div class="codeadd"><h3>' + T("Добавить кабинет") + "</h3>" +
    '<input id="code-new" type="text" placeholder="' + T("Код кабинета") + '" autocomplete="off" autocapitalize="off" spellcheck="false">' +
    '<div class="seg" id="code-kind">' + ["pair", "friends", "family"].map((k) => '<button type="button" data-ck="' + k + '" class="' + (codeDraftKind === k ? "active" : "") + '">' + kindName(k) + "</button>").join("") + "</div>" +
    '<div class="row2"><button type="button" class="btn" id="code-gen">' + T("Придумать") + '</button><button type="button" class="btn primary" id="code-join">' + T("Войти") + "</button></div></div>";
  box.innerHTML = h;
}
function switchCode(code, kind) {
  code = safeCode(code);
  if (!code) { toast(T("Введите код")); return; }
  if (code === safeCode(state.cfg.listCode)) { toast(T("Вы уже в этом кабинете")); return; }
  state.cfg.listCode = code;
  state.cfg.solo = false;
  joinIntent = true;
  persistConfig();
  state.kind = kind || (state.codes[code] && state.codes[code].kind) || lsGet(K(KIND_KEY), "pair");
  if (!KINDS[state.kind]) state.kind = "pair";
  lsSet(K(KIND_KEY), state.kind);
  if (!state.codes[code]) { state.codes[code] = { kind: state.kind, at: Date.now(), seen: Date.now() }; lsSet(CODES_KEY, state.codes); if (codesRef) codesRef.child(code).set(state.codes[code]).catch(() => {}); }
  applyKindTexts();
  connect();
  ensureMe();
  state.series = state.shared;
  toast(T("Кабинет: ") + code);
  setTab("together");
}
function bindCodes() {
  const box = $("#codes");
  box.addEventListener("click", (e) => {
    const go = e.target.closest("[data-codego]"), sh = e.target.closest("[data-codeshare]"), del = e.target.closest("[data-codedel]"), ck = e.target.closest("[data-ck]");
    if (go) { switchCode(go.dataset.codego); return; }
    if (sh) { shareCodeValue(sh.dataset.codeshare); return; }
    if (del) {
      const code = del.dataset.codedel;
      if (!window.confirm(T("Убрать код из вашего списка? Сам кабинет и его сериалы не удалятся."))) return;
      delete state.codes[code]; lsSet(CODES_KEY, state.codes);
      if (codesRef) codesRef.child(code).remove().catch(() => {});
      renderCodes(); return;
    }
    if (ck) { codeDraftKind = ck.dataset.ck; box.querySelectorAll("[data-ck]").forEach((b) => b.classList.toggle("active", b === ck)); return; }
    if (e.target.closest("#code-gen")) { $("#code-new").value = genCode(); return; }
    if (e.target.closest("#code-join")) switchCode($("#code-new").value, codeDraftKind);
  });
}
async function shareCodeValue(code) {
  const link = inviteLink(code);
  const text = KT().share + code + (link ? T("\nИли откройте ссылку: ") + link : "");
  try { if (navigator.share) { await navigator.share({ title: T("Наши сериалы"), text }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(text); toast(T("Скопировано. Отправьте это остальным")); }
  catch (e) { window.prompt(T("Скопируйте и отправьте остальным:"), text); }
}
function setTab(t, fromPop) {
  if (t === state.tab) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (!fromPop) {
    try {
      if (t === "together" && history.state && history.state.tab) { history.back(); return; }   // вернёмся через popstate
      if (state.tab === "together") history.pushState({ tab: t }, "");
      else history.replaceState({ tab: t }, "");
    } catch (e) {}
  }
  state.tab = t;
  lsSet(LS.tab, t);
  if (t !== "stats" && t !== "codes") state.series = t === "mine" ? state.mine : state.shared;
  state.filter = "all";
  render();
  window.scrollTo(0, 0);
  if (t !== "stats" && t !== "codes") backfillMeta();
}

/* ═════════════════ Карточка сериала ═════════════════ */
function openDetail(id) {
  if (!state.series[id]) return;
  state.current = id;
  renderDetail();
  openSheet("sheet-detail");
  const s = state.series[id];
  if (!s.metaAt || Date.now() - s.metaAt > 3 * 86400000 || needsLang(s) || needsWiki(s)) refreshMeta(id);
}
const STAR = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/></svg>';
const STAR_S = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/></svg>';
let synopsisOpen = false;

function renderDetail() {
  const s = state.series[state.current];
  if (!s) return;
  const panel = $("#sheet-detail .panel");
  panel.classList.add("tinted");
  const t = tintFor(s);
  panel.style.setProperty("--th", t.h); panel.style.setProperty("--ts", t.s + "%");

  const bd = img(s.backdropPath || "", "w780");
  const meta = [];
  if (s.year) meta.push("<span>" + esc(s.year) + "</span>");
  if (isMovie(s)) meta.push(T("<span>Фильм</span>"));
  if (isAnime(s) || s.jp) meta.push(T("<span>Аниме</span>"));
  if (s.runtime) meta.push("<span>" + esc(runtimeText(s.runtime)) + "</span>");
  if (s.seasons && !isAnime(s)) meta.push("<span>" + s.seasons + " " + plural(s.seasons, [T("сезон"), T("сезона"), T("сезонов")]) + "</span>");
  if (s.episodes) meta.push("<span>" + s.episodes + " " + plural(s.episodes, [T("серия"), T("серии"), T("серий")]) + "</span>");
  if (s.rating) meta.push("<span>" + STAR_S + " " + esc(s.rating.toFixed(1)) + "</span>");
  if (s.tmdbStatus && TMDB_STATUS_RU[s.tmdbStatus]) meta.push("<span>" + esc(TMDB_STATUS_RU[s.tmdbStatus]) + "</span>");

  const p = pos(s), eps = s.seasonEps || [];
  const cap = eps[(p.season || 1) - 1];
  const started = !((p.season || 1) === 1 && !(p.episode > 0));
  const watched = watchedCount(s), total = totalEps(s);

  const people = {};
  Object.keys(state.people).forEach((k) => { people[k] = state.people[k].name; });
  Object.keys(s.ratings || {}).forEach((k) => { if (!people[k]) people[k] = (s.ratings[k] && s.ratings[k].name) || k; });
  if (state.cfg.nick && !people[meSlug()]) people[meSlug()] = state.cfg.nick;
  let keys = Object.keys(people).sort((a, b) => (a === meSlug() ? -1 : b === meSlug() ? 1 : 0));
  if (state.tab === "mine") keys = [meSlug()];
  const rates = keys.map((k) => {
    const mine = k === meSlug();
    const n = s.ratings && s.ratings[k] ? s.ratings[k].n : 0;
    let stars = "";
    for (let i = 1; i <= 5; i++) stars += '<button type="button" class="' + (i <= n ? "on" : "") + '" data-rate="' + i + T('" aria-label="Оценка ') + i + '">' + STAR + "</button>";
    return '<div class="rate"><div class="who2">' + avatarHtml(people[k], 28) + esc(people[k]) + (mine ? T(" (вы)") : "") +
      '</div><div class="stars' + (mine ? "" : " ro") + '" style="--pc:' + esc(personColor(people[k])) + '">' + stars + "</div></div>";
  }).join("");

  const next = s.nextAir && s.nextAir.date
    ? T('<div class="nextep">Следующая серия: <b>') + esc(relDate(s.nextAir.date)) + "</b>" +
      (s.nextAir.season ? T(" · сезон ") + esc(s.nextAir.season) + T(", серия ") + esc(s.nextAir.episode) : "") + "</div>" : "";
  const where = s.providers && s.providers.length
    ? T('<div class="where">Где смотреть: ') + s.providers.map((pr) => pr.l ? '<img src="' + esc(img(pr.l, "w92")) + '" alt="' + esc(pr.n) + '" title="' + esc(pr.n) + '">' : "<span>" + esc(pr.n) + "</span>").join("") + "</div>" : "";
  const long = (s.overview || "").length > 220;
  const statusBtns = Object.keys(STATUS).map((k) =>
    '<button type="button" class="' + (s.status === k ? "active" : "") + '" style="--c:' + STATUS[k].color + '" data-status="' + k + '">' + esc(STATUS[k].label) + "</button>").join("");

  $("#detail-body").innerHTML =
    T('<button class="dclose" type="button" data-close aria-label="Закрыть"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>') +
    '<div class="dhero">' + (bd ? '<div class="dback" style="background-image:url(\'' + esc(bd) + '\')"></div>' : "") + "</div>" +
    '<div class="dtop"><div class="dposter">' + posterHtml(s, "w342") + "</div>" +
    '<div class="dhead"><h2 class="dtitle">' + esc(s.title) + "</h2>" +
    (s.originalName && s.originalName !== s.title ? '<p class="dorig">' + esc(s.originalName) + "</p>" : "") +
    (meta.length ? '<div class="dmeta">' + meta.join("") + "</div>" : "") + "</div></div>" +
    next +
    (s.genres && s.genres.length ? '<div class="tags">' + s.genres.map((g) => "<span>" + esc(g) + "</span>").join("") + "</div>" : "") +
    (s.overview ? '<p class="dsyn' + (long && !synopsisOpen ? " clamp" : "") + '">' + esc(s.overview) + "</p>" +
      (long ? '<button class="more" type="button" data-act="more">' + (synopsisOpen ? T("Свернуть") : T("Читать полностью")) + "</button>" : "") : "") +
    where + wikiHtml(s) +
    (s.trailer ? '<a class="btn ghost wide" style="display:block;text-align:center;text-decoration:none" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=' + esc(s.trailer) + T('">Смотреть трейлер</a>') : "") +

    T('<h3 class="dlabel">Статус</h3><div class="seg">') + statusBtns + "</div>" +

    (isMovie(s)
      ? T('<h3 class="dlabel">Просмотр</h3><button class="btn ') + (s.status === "done" ? "ghost" : "primary") + ' wide" type="button" data-act="watched">' + (s.status === "done" ? T("Вернуть в планы") : T("Посмотрели фильм")) + "</button>"
      : T('<h3 class="dlabel">Где остановились</h3><div class="prog"><div class="progtop">') +
    '<div class="bigpos" id="bigpos">' + (started ? T("С") + esc(p.season) + T(" · Э") + esc(p.episode) : T("Не начали")) +
    (total ? "<small>" + watched + T(" из ") + total + "</small>" : "") + "</div>" +
    T('<div class="steppers"><div class="stepper"><button type="button" data-step="season:-1" aria-label="Сезон назад">−</button><span>сез.</span><button type="button" data-step="season:1" aria-label="Сезон вперёд">+</button></div>') +
    T('<div class="stepper"><button type="button" data-step="episode:-1" aria-label="Серия назад">−</button><span>сер.</span><button type="button" data-step="episode:1" aria-label="Серия вперёд">+</button></div></div></div>') +
    '<div class="dbar"><i style="width:' + Math.round(pctOf(s) * 100) + '%"></i></div>' +
    (cap ? T('<p class="note">В этом сезоне ') + cap + " " + plural(cap, [T("серия"), T("серии"), T("серий")]) + "</p>" : "") +
    T('<button class="btn primary wide" type="button" data-act="plus1">Посмотрели серию, +1</button></div>')) +

    T('<h3 class="dlabel">Оценки</h3>') + rates +
    T('<div class="dfoot"><button class="btn danger" type="button" data-act="remove">Удалить из списка</button></div>');
}

/* ═════════════════ События ═════════════════ */
function translateDom() {
  if (LANG === "ru") return;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach((n) => {
    const p = n.parentNode && n.parentNode.nodeName;
    if (p === "SCRIPT" || p === "STYLE" || !/[А-Яа-яЁёІіЇїЄє]/.test(n.nodeValue)) return;
    n.nodeValue = n.nodeValue.replace(/\S[\s\S]*\S|\S/, (m) => T(m));
  });
  document.querySelectorAll("[placeholder],[aria-label],[title]").forEach((el) => {
    ["placeholder", "aria-label", "title"].forEach((a) => { const v = el.getAttribute(a); if (v && /[А-Яа-яЁёІіЇїЄє]/.test(v)) el.setAttribute(a, T(v)); });
  });
  document.title = T(document.title);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-kind]");
  if (b) setKind(b.dataset.kind);
});
function markLang() {
  document.querySelectorAll("[data-lang]").forEach((b) => { b.classList.toggle("active", b.dataset.lang === LANG); b.style.setProperty("--c", "var(--amber)"); });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-lang]");
  if (!b || b.dataset.lang === LANG) return;
  state.cfg.lang = b.dataset.lang;
  persistConfig();
  location.reload();
});
function bind() {
  $("#btn-settings").addEventListener("click", openSettings);
  $("#btn-sync").addEventListener("click", () => toast(connText()));
  $("#fab").addEventListener("click", openSearch);
  $("#pair").addEventListener("click", openSettings);
  bindCodes();
  bindIntro();
  $("#members").addEventListener("click", (e) => { const b = e.target.closest("[data-rmmember]"); if (b) removeMember(b.dataset.rmmember); });
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
  $("#stats").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sscope]");
    if (b) { state.statsScope = b.dataset.sscope; renderStats(); return; }
    const f = e.target.closest(".fav");
    if (f) { const id = f.dataset.id; state.series = state.shared[id] ? state.shared : state.mine; openDetail(id); }
  });
  $("#theme-picker").addEventListener("click", (e) => { const b = e.target.closest("[data-theme-id]"); if (b) { state.cfg.theme = b.dataset.themeId; applyTheme(state.cfg.theme); persistConfig(); renderPickers(); } });
  $("#btn-nophoto").addEventListener("click", () => { draft.avatar = ""; renderPickers(); });
  $("#color-picker").addEventListener("click", (e) => { const b = e.target.closest("[data-col]"); if (b && !b.disabled) { draft.color = b.dataset.col; renderPickers(); } });
  $("#btn-photo").addEventListener("click", () => $("#cfg-photo").click());
  $("#cfg-photo").addEventListener("change", (e) => { pickPhoto(e.target.files && e.target.files[0]); e.target.value = ""; });
  $("#btn-save-cfg").addEventListener("click", saveSettings);
  $("#btn-gen-code").addEventListener("click", () => { $("#cfg-code").value = genCode(); });
  $("#btn-share-code").addEventListener("click", shareCode);
  $("#w-gen").addEventListener("click", () => { $("#w-code").value = genCode(); });
  $("#w-save").addEventListener("click", () => finishWelcome(false));
  $("#w-solo").addEventListener("click", () => finishWelcome(true));

  $("#search-form").addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(searchTimer); runSearch(); });
  $("#search-input").addEventListener("input", onSearchInput);
  $("#results").addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (b) addSeries(b.dataset.add, b.dataset.status);
  });

  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    state.filter = b.dataset.filter;
    render();
  });
  $("#rail").addEventListener("click", (e) => {
    const b = e.target.closest('[data-act="plus1"]');
    if (b) { e.stopPropagation(); advance(b.dataset.id); return; }
    const c = e.target.closest(".rcard");
    if (c) openDetail(c.dataset.id);
  });
  $("#grid").addEventListener("click", (e) => {
    const c = e.target.closest(".pcard");
    if (c) openDetail(c.dataset.id);
  });

  $("#detail-body").addEventListener("click", (e) => {
    const id = state.current;
    const t = e.target;
    let el;
    if ((el = t.closest("[data-status]"))) { patchSeries(id, { status: el.dataset.status }); return; }
    if ((el = t.closest("[data-step]"))) { const a = el.dataset.step.split(":"); stepProgress(id, a[0], parseInt(a[1], 10)); return; }
    if ((el = t.closest("[data-rate]"))) {
      const n = parseInt(el.dataset.rate, 10), cur = state.series[id].ratings && state.series[id].ratings[meSlug()];
      const val = cur && cur.n === n ? null : { n, name: state.cfg.nick || "" };
      patchSeries(id, { ["ratings/" + meSlug()]: val });
      return;
    }
    if ((el = t.closest("[data-act]"))) {
      const act = el.dataset.act;
      if (act === "plus1") advance(id);
      else if (act === "watched") {
        const sr = state.series[id];
        if (sr.status === "done") patchSeries(id, { status: "want" }); else advance(id);
      }
      else if (act === "more") { synopsisOpen = !synopsisOpen; renderDetail(); }
      else if (act === "remove") {
        const old = removeSeries(id);
        closeSheet();
        toast(T("Удалено: ") + old.title, { label: T("Вернуть"), fn: () => putSeries(old) });
      }
    }
  });
}

/* ═════════════════ Запуск ═════════════════ */
function init() {
  loadConfig();
  applyTheme(state.cfg.theme);
  applyJoinFromHash();
  const t = lsGet(LS.tab, "together");
  state.tab = t === "mine" || t === "stats" || t === "codes" ? t : "together";
  state.codes = lsGet(CODES_KEY, {}) || {};
  upgradeCaches();
  upgradeMine();
  loadCaches();
  translateDom();
  applyKindTexts();
  bind();
  markLang();
  bindNativeBack();
  render();
  setConn(state.cfg.firebase && state.cfg.listCode ? "offline" : "none");
  connect().then(() => backfillMeta());
  ensureMe();
  maybeIntro();
  if (!openLocked) applyShare();
  if ("serviceWorker" in navigator && !window.Capacitor && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
document.addEventListener("DOMContentLoaded", init);
