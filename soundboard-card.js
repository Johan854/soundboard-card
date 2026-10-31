{ // bloc isolé
/*
 * Soundboard Card (FR)
 * Carte Home Assistant « boîte à sons » : une grille de tuiles qui lancent des morceaux courts (jingles, sonneries) via des
 * interrupteurs impulsionnels, avec progression pendant la durée du morceau, blocage des autres tuiles, recherche,
 * repli de la grille et volume. Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.
 */
const CARD_VERSION = "1.1.0";

/* === NUANCE COMMUNE v2 (cartes Johan854) ===
 * Bloc identique dans toutes les cartes. Options : nuance, nuance_perso, intensite.
 * nuance "theme" (par défaut) : suit la variable carte-nuance du thème Home Assistant ;
 * si elle n'existe pas, la carte garde ses couleurs d'origine. Intensité : 0 = neutre, 1 = normal, 2 = très coloré. */
const GV_NUANCES = [["braise", "Braise (rouge)", "#e0524f"], ["ocean", "Océan (bleu)", "#2f8fd8"], ["lagon", "Lagon (turquoise)", "#1fb5a8"], ["foret", "Forêt (vert)", "#3fae5a"], ["lavande", "Lavande (violet)", "#8a63d8"], ["framboise", "Framboise (rose)", "#e05597"], ["ambre", "Ambre (orange)", "#e8902c"], ["ardoise", "Ardoise (neutre)", "#7d8595"]];
const GV_DEFAULTS = { nuance: "theme", intensite: 1 };
const gvAccent = (c) => {
  const p = c && c.nuance_perso;
  if (c && c.nuance === "perso") {
    if (Array.isArray(p) && p.length === 3) return "#" + p.map((v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, "0")).join("");
    if (typeof p === "string" && /^#?[0-9a-f]{6}$/i.test(p.trim())) return "#" + p.trim().replace("#", "");
  }
  const n = GV_NUANCES.find((x) => x[0] === (c && c.nuance));
  return n ? n[2] : "var(--carte-nuance)";
};
/* Variables posées sur <ha-card> : --g-bg-x (fond dégradé teinté) et --acc-ui-x (couleur d'accent).
 * Sans nuance (thème sans carte-nuance), elles sont invalides : chaque carte retombe alors sur ses couleurs d'origine. */
const gvStyle = (c, dark) => {
  const i = Number(c && c.intensite), ai = Number.isFinite(i) ? Math.max(0, Math.min(2, i)) : 1;
  const m = (pct, base) => `color-mix(in srgb,var(--acc-ui) ${+(pct * ai).toFixed(1)}%,${base})`;
  const bg = dark ? `linear-gradient(160deg,${m(5, "#1b1e32")} 0%,${m(11, "#1f1b2c")} 55%,${m(22, "#1c1620")} 100%)`
    : `linear-gradient(160deg,${m(2, "#f8f9fd")} 0%,${m(5, "#eef1f8")} 55%,${m(11, "#f8f8fa")} 100%)`;
  return `--acc-ui:${gvAccent(c)};--g-bg-x:${bg};--acc-ui-x:color-mix(in srgb,var(--acc-ui) ${dark ? "80%,#fff" : "82%,#000"})`;
};
const GV_FIELDS = [
  { name: "nuance", selector: { select: { mode: "dropdown", options: [{ value: "theme", label: "Selon le thème (couleurs d'origine)" }, ...GV_NUANCES.map((n) => ({ value: n[0], label: n[1] })), { value: "perso", label: "Personnalisée" }] } } },
  { name: "nuance_perso", selector: { color_rgb: {} } },
  { name: "intensite", selector: { number: { min: 0, max: 2, step: 0.1, mode: "slider" } } }];
const GV_LABELS = { nuance: "Nuance de couleur", nuance_perso: "Couleur personnalisée (nuance « Personnalisée »)", intensite: "Intensité de la nuance" };
/* === FIN NUANCE COMMUNE === */
const DEFAULTS = {
  title: "Audio", theme: "auto", ...GV_DEFAULTS,
  tiles: [], // [{ entity, name, icon }] ou simples noms d'entités
  volume_entity: "", // number / input_number
  duration: 5, // secondes de lecture d'un morceau
  columns: 0, // 0 = automatique
  lock_while_playing: true,
  show_search: true,
  collapsed_count: 12, // nombre de tuiles visibles avant « Tout afficher » (0 = tout afficher)
  stop_on_press: false, // un second appui sur le morceau en cours renvoie l'impulsion
  auto_volume: 0, // % de volume appliqué avant chaque morceau (0 = désactivé)
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bad = (st) => !st || st.state === "unavailable" || st.state === "unknown";

class SoundboardCard extends HTMLElement {
  static getConfigElement() { return document.createElement("soundboard-card-editor"); }
  static getStubConfig(hass) {
    const t = Object.keys((hass && hass.states) || {}).filter((k) => k.startsWith("switch.")).slice(0, 6);
    return { ...DEFAULTS, tiles: t };
  }
  constructor() { super(); this.attachShadow({ mode: "open" }); this._sig = ""; this._until = {}; this._prev = {}; this._seen = false; this._expanded = false; this._q = ""; this._vol = null; this._cur = ""; }
  connectedCallback() { this._iv = setInterval(() => this._tick(), 250); }
  disconnectedCallback() { clearInterval(this._iv); }

  setConfig(config) {
    if (!config) throw new Error("Configuration invalide");
    this._config = { ...DEFAULTS, ...config };
    if (!Array.isArray(this._config.tiles)) this._config.tiles = [];
    this._sig = "";
    if (this._hass) this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const dur = this._dur() * 1000, now = Date.now();
    this._tiles().forEach((t) => {
      const s = hass.states[t.entity]; if (!s) return;
      const lc = Date.parse(s.last_changed) || 0;
      if (!this._seen) { if (lc && now - lc < dur && !bad(s)) this._until[t.entity] = lc + dur; }
      else if (this._prev[t.entity] !== "on" && s.state === "on" && now > (this._until[t.entity] || 0)) this._until[t.entity] = now + dur;
      this._prev[t.entity] = s.state;
    });
    this._seen = true;
    if (this._dragging) return;
    const ids = [...this._tiles().map((t) => t.entity), this._config.volume_entity].filter(Boolean);
    const sig = ids.map((e) => { const s = hass.states[e]; return s ? s.state : "x"; }).join(";") + (this._isDark() ? "d" : "l") + this._playingId();
    if (sig !== this._sig) { this._sig = sig; this._render(); }
  }
  getCardSize() { return 6; }
  _dur() { const d = Number(this._config && this._config.duration); return d > 0 ? d : 5; }
  _tiles() { return (this._config.tiles || []).map((i) => (typeof i === "string" ? { entity: i } : i)).filter((i) => i && i.entity); }
  _playingId() { const n = Date.now(); return Object.keys(this._until).find((e) => this._until[e] > n) || ""; }
  _isDark() {
    const t = this._config && this._config.theme;
    if (t === "dark") return true;
    if (t === "light") return false;
    const dm = this._hass && this._hass.themes && this._hass.themes.darkMode;
    return typeof dm === "boolean" ? dm : !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  _tick() {
    if (!this._config || !this._hass) return;
    const id = this._playingId();
    if (id !== this._cur) { this._cur = id; this._sig = ""; this._render(); }
  }
  /* noms courts : on retire le préfixe commun à toutes les tuiles (nom de l'appareil) */
  _names() {
    const tiles = this._tiles(), h = this._hass;
    const words = tiles.map((t) => String((h.states[t.entity] && h.states[t.entity].attributes.friendly_name) || t.entity).split(/\s+/));
    let k = 0;
    while (words.length > 1 && words.every((w) => w.length > k + 1 && w[k].toLowerCase() === words[0][k].toLowerCase())) k++;
    return tiles.map((t, i) => t.name || words[i].slice(k).join(" "));
  }

  /* Bornes du volume (number / input_number) */
  _volInfo() {
    const c = this._config, vs = c.volume_entity ? this._hass.states[c.volume_entity] : null;
    if (!vs || bad(vs) || isNaN(Number(vs.state))) return null;
    const a = vs.attributes, min = isFinite(Number(a.min)) ? Number(a.min) : 0, max = isFinite(Number(a.max)) && Number(a.max) > min ? Number(a.max) : 100, step = Number(a.step) > 0 ? Number(a.step) : 1;
    return { min, max, step, v: Number(vs.state) };
  }
  _setVol(value) {
    const c = this._config, vi = this._volInfo();
    if (!vi) return Promise.resolve();
    const v = Math.max(vi.min, Math.min(vi.max, Math.round((value - vi.min) / vi.step) * vi.step + vi.min));
    this._vol = v; this._sig = ""; setTimeout(() => { this._vol = null; this._sig = ""; }, 2500);
    return this._hass.callService(c.volume_entity.split(".")[0], "set_value", { entity_id: c.volume_entity, value: v });
  }

  _render() {
    const c = this._config, h = this._hass;
    if (!c || !h) return;
    const dark = this._isDark(), dur = this._dur(), now = Date.now();
    const tiles = this._tiles(), names = this._names();
    const playing = this._playingId();
    const lim = Number(c.collapsed_count) > 0 && !this._expanded && !this._q ? Number(c.collapsed_count) : tiles.length;
    const html = tiles.map((t, i) => {
      const s = h.states[t.entity], off = bad(s), isP = playing === t.entity, locked = c.lock_while_playing && playing && !isP;
      const hid = i >= lim;
      const rem = isP ? (this._until[t.entity] - now) / 1000 : 0;
      const icon = t.icon || (s && s.attributes.icon) || "mdi:music-note";
      return `<button class="tile ${isP ? "play" : ""} ${locked ? "lock" : ""}" data-i="${i}" data-name="${esc(names[i].toLowerCase())}" ${hid ? "hidden data-over" : ""} ${off || locked ? "disabled" : ""} title="${esc(names[i])}">
        <ha-icon icon="${esc(icon)}"></ha-icon><span class="n">${esc(names[i])}</span>
        ${isP ? `<i class="eq"><u></u><u></u><u></u><u></u></i><i class="pr"><u style="animation-duration:${dur}s;animation-delay:${-(dur - rem).toFixed(2)}s"></u></i>` : ""}</button>`;
    }).join("");
    let volHtml = "";
    const vi = this._volInfo();
    if (vi) {
      const { min, max, step } = vi;
      const v = this._vol !== null ? this._vol : vi.v, pct = Math.round(((v - min) / (max - min)) * 100);
      const auto = Number(c.auto_volume) > 0 ? `<small class="auto" title="Volume réglé avant chaque morceau">auto ${Math.round(Number(c.auto_volume))} %</small>` : "";
      volHtml = `<div class="vol"><button class="vb" data-vstep="-1" aria-label="Baisser le volume"><ha-icon icon="${pct <= 0 ? "mdi:volume-off" : "mdi:volume-minus"}"></ha-icon></button><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" style="--p:${pct}%" aria-label="Volume"><button class="vb" data-vstep="1" aria-label="Monter le volume"><ha-icon icon="mdi:volume-plus"></ha-icon></button><b data-vp>${pct} %</b>${auto}</div>`;
    }
    const over = tiles.length - lim;
    this.shadowRoot.innerHTML = `<style>
      * { box-sizing:border-box; }
      ha-card.dark { --sb-text:#f4f6fb; --sb-muted:#a9afc0; --sb-bg:var(--g-bg-x,linear-gradient(160deg,#1b1e32 0%,#241a2a 55%,#2d1519 100%)); --sb-border:rgba(255,255,255,.14); --sb-shadow:0 .6em 2em rgba(0,0,0,.35); --sb-glass:rgba(255,255,255,.07); --sb-glass-b:rgba(255,255,255,.13); --sb-fill:rgba(255,255,255,.09); --sb-fill-b:rgba(255,255,255,.16); --sb-acc:#ff8a9a; --sb-gold:#ffcf6b; }
      ha-card.light { --sb-text:#1c2030; --sb-muted:#5d6477; --sb-bg:var(--g-bg-x,linear-gradient(160deg,#f8f9fd 0%,#eef1f8 55%,#f8eff0 100%)); --sb-border:rgba(20,24,40,.12); --sb-shadow:0 .4em 1.4em rgba(20,24,40,.12); --sb-glass:rgba(255,255,255,.7); --sb-glass-b:rgba(20,24,40,.1); --sb-fill:rgba(20,24,40,.06); --sb-fill-b:rgba(20,24,40,.14); --sb-acc:#d6246e; --sb-gold:#c98a14; }
      ha-card { container-type:inline-size; display:flex; flex-direction:column; gap:12px; padding:16px; color:var(--sb-text); border-radius:24px; border:1px solid var(--sb-border); background:var(--sb-bg); box-shadow:var(--sb-shadow); overflow:hidden; }
      button { font:inherit; color:inherit; cursor:pointer; border:0; background:none; padding:0; text-align:left; -webkit-tap-highlight-color:transparent; }
      ha-icon { --mdc-icon-size:1.5em; flex:none; }
      .head { display:flex; align-items:center; justify-content:space-between; gap:12px; } .head b { font-size:1.1em; font-weight:650; } .head small { color:var(--sb-muted); font-size:.8em; }
      .row { display:flex; align-items:center; gap:.7em; padding:.55em .85em; border-radius:1em; background:var(--sb-glass); border:1px solid var(--sb-glass-b); -webkit-backdrop-filter:blur(18px) saturate(140%); backdrop-filter:blur(18px) saturate(140%); }
      .vol { flex:1; display:flex; align-items:center; gap:.5em; min-width:0; } .vol b { min-width:2.8em; text-align:right; font-variant-numeric:tabular-nums; font-size:.85em; }
      .vb { flex:none; display:grid; place-items:center; width:2.2em; height:2.2em; border-radius:50%; background:var(--sb-fill); border:1px solid var(--sb-fill-b); } .vb:active { transform:scale(.92); } .vb ha-icon { --mdc-icon-size:1.2em; color:var(--sb-gold); }
      .auto { flex:none; font-size:.7em; font-weight:700; color:var(--sb-gold); padding:.15em .5em; border-radius:1em; border:1px solid var(--sb-gold); }
      @container (max-width: 460px) { .row { flex-wrap:wrap; } .search, .vol { flex:1 1 100%; } }
      input[type=range] { flex:1; min-width:3em; touch-action:pan-y; -webkit-appearance:none; appearance:none; height:.45em; border-radius:.3em; background:linear-gradient(90deg,var(--sb-gold) var(--p),var(--sb-fill-b) var(--p)); outline:none; }
      input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:1.4em; height:1.4em; border-radius:50%; background:var(--sb-text); border:2px solid var(--sb-gold); } input[type=range]::-moz-range-thumb { width:1.2em; height:1.2em; border-radius:50%; background:var(--sb-text); border:2px solid var(--sb-gold); }
      .search { flex:1; display:flex; align-items:center; gap:.5em; } .search input { flex:1; min-width:0; font:inherit; color:inherit; background:none; border:0; outline:none; } .search input::placeholder { color:var(--sb-muted); }
      .grid { display:grid; grid-template-columns:repeat(${Number(c.columns) > 0 ? Number(c.columns) : "auto-fill"}, ${Number(c.columns) > 0 ? "minmax(0,1fr)" : "minmax(6.4em,1fr)"}); gap:.55em; }
      .tile { position:relative; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.35em; min-height:4.6em; padding:.6em .4em; border-radius:1em; text-align:center; background:var(--sb-glass); border:1px solid var(--sb-glass-b); transition:transform .1s; }
      .tile:active:not(:disabled) { transform:scale(.96); } .tile:disabled { cursor:default; } .tile.lock { opacity:.4; }
      .tile ha-icon { color:var(--sb-acc); } .n { font-size:.75em; font-weight:600; line-height:1.15; overflow-wrap:break-word; }
      .tile[hidden] { display:none; }
      .tile.play { border-color:var(--sb-gold); background:color-mix(in srgb, var(--sb-gold) 16%, transparent); } .tile.play ha-icon { color:var(--sb-gold); }
      .pr { position:absolute; left:0; right:0; bottom:0; height:.28em; background:var(--sb-fill-b); } .pr u { display:block; height:100%; width:0; background:var(--sb-gold); text-decoration:none; animation:sb-pr linear forwards; } @keyframes sb-pr { to { width:100%; } }
      .eq { position:absolute; top:.45em; right:.5em; display:flex; align-items:flex-end; gap:2px; height:.9em; } .eq u { display:block; width:2.5px; height:30%; background:var(--sb-gold); text-decoration:none; animation:sb-eq .7s ease-in-out infinite alternate; } .eq u:nth-child(2) { animation-delay:-.2s; } .eq u:nth-child(3) { animation-delay:-.4s; } .eq u:nth-child(4) { animation-delay:-.1s; } @keyframes sb-eq { to { height:100%; } }
      .more { align-self:center; padding:.45em 1em; border-radius:2em; font-size:.82em; font-weight:600; color:var(--sb-muted); background:var(--sb-fill); border:1px solid var(--sb-fill-b); }
      .empty { color:var(--sb-muted); text-align:center; font-size:.85em; padding:.6em; } .empty[hidden] { display:none; }
      @media (prefers-reduced-motion: reduce) { .eq u, .pr u { animation:none; } .pr u { width:100%; } }
    </style>
    <ha-card class="${dark ? "dark" : "light"}" style="${gvStyle(c, dark)}">
      <div class="head"><b>${esc(c.title)}</b><small>${tiles.length} morceau${tiles.length > 1 ? "x" : ""} · ${dur} s</small></div>
      ${volHtml || c.show_search ? `<div class="row">${c.show_search ? `<label class="search"><ha-icon icon="mdi:magnify"></ha-icon><input type="search" data-q placeholder="Rechercher un morceau" value="${esc(this._q)}"></label>` : ""}${volHtml}</div>` : ""}
      <div class="grid">${html}</div><div class="empty" data-empty hidden>Aucun morceau ne correspond.</div>
      ${over > 0 ? `<button class="more" data-more-btn>Tout afficher (${tiles.length})</button>` : c.collapsed_count > 0 && this._expanded && tiles.length > c.collapsed_count ? `<button class="more" data-more-btn>Réduire</button>` : ""}
    </ha-card>`;
    const r = this.shadowRoot;
    r.querySelectorAll(".tile").forEach((el) => el.addEventListener("click", () => {
      const t = tiles[Number(el.dataset.i)], pl = this._playingId();
      if (pl === t.entity && !c.stop_on_press) return;
      if (pl && pl !== t.entity && c.lock_while_playing) return;
      const go = () => h.callService("homeassistant", "toggle", { entity_id: t.entity });
      const av = Number(c.auto_volume), vi2 = this._volInfo();
      if (pl !== t.entity && av > 0 && vi2) {
        const target = vi2.min + ((vi2.max - vi2.min) * Math.min(100, av)) / 100;
        if (Math.abs(vi2.v - target) >= vi2.step / 2) Promise.resolve(this._setVol(target)).catch(() => {}).then(go); else go();
      } else go();
      this._until[t.entity] = pl === t.entity ? 0 : Date.now() + dur * 1000; this._prev[t.entity] = "on";
      this._cur = ""; this._sig = ""; this._tick(); this._render();
    }));
    const mb = r.querySelector("[data-more-btn]"); if (mb) mb.addEventListener("click", () => { this._expanded = !this._expanded; this._render(); });
    const q = r.querySelector("[data-q]");
    if (q) q.addEventListener("input", () => {
      this._q = q.value.trim().toLowerCase(); let n = 0;
      r.querySelectorAll(".tile").forEach((el) => { const ok = !this._q || el.dataset.name.includes(this._q); el.hidden = !ok && !!this._q ? true : (!this._q && el.hasAttribute("data-over") && !this._expanded); if (this._q && ok) n++; });
      const e = r.querySelector("[data-empty]"); if (e) e.hidden = !(this._q && n === 0);
      const m = r.querySelector("[data-more-btn]"); if (m) m.hidden = !!this._q;
    });
    r.querySelectorAll("[data-vstep]").forEach((b) => b.addEventListener("click", () => {
      const vi = this._volInfo(); if (!vi) return;
      const cur = this._vol !== null ? this._vol : vi.v, inc = Math.max(vi.step, (vi.max - vi.min) / 10);
      this._setVol(cur + Number(b.dataset.vstep) * inc); this._render();
    }));
    const inp = r.querySelector("input[type=range]");
    if (inp) {
      inp.addEventListener("pointerdown", () => { this._dragging = true; });
      inp.addEventListener("input", () => { this._vol = Number(inp.value); const mn = Number(inp.min), mx = Number(inp.max), pc = Math.round(((this._vol - mn) / (mx - mn)) * 100); inp.style.setProperty("--p", pc + "%"); const b = r.querySelector("[data-vp]"); if (b) b.textContent = pc + " %"; });
      inp.addEventListener("change", () => { h.callService(c.volume_entity.split(".")[0], "set_value", { entity_id: c.volume_entity, value: Number(inp.value) }); this._dragging = false; setTimeout(() => { this._vol = null; this._sig = ""; }, 2500); });
    }
  }
}

/* ---------- Éditeur visuel ---------- */
const LABELS = { ...GV_LABELS, title: "Titre", tiles: "Morceaux (interrupteurs)", volume_entity: "Volume (number / input_number)", duration: "Durée d'un morceau (secondes)", columns: "Colonnes (0 = automatique)",
  lock_while_playing: "Bloquer les autres morceaux pendant la lecture", show_search: "Afficher la recherche", collapsed_count: "Morceaux visibles avant « Tout afficher » (0 = tous)", stop_on_press: "Un second appui renvoie l'impulsion", theme: "Thème",
  auto_volume: "Volume automatique avant chaque morceau (%, 0 = désactivé)" };
class SoundboardCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...DEFAULTS, ...config }; this._keep = (config.tiles || []).filter((x) => x && typeof x === "object"); if (!this._form) this._build(); else this._form.data = this._data(); }
  set hass(h) { this._hass = h; if (this._form) this._form.hass = h; }
  _data() { return { ...this._config, tiles: (this._config.tiles || []).map((i) => (typeof i === "string" ? i : i.entity)) }; }
  _build() {
    const el = document.createElement("ha-form");
    el.hass = this._hass; el.data = this._data(); el.computeLabel = (s) => LABELS[s.name] || s.name;
    el.schema = [
      { name: "title", selector: { text: {} } },
      { name: "tiles", selector: { entity: { multiple: true, domain: ["switch", "button", "input_boolean"] } } },
      { name: "volume_entity", selector: { entity: { domain: ["number", "input_number"] } } },
      { name: "auto_volume", selector: { number: { min: 0, max: 100, step: 5, mode: "slider", unit_of_measurement: "%" } } },
      { type: "grid", name: "", schema: [{ name: "duration", selector: { number: { min: 1, max: 600, mode: "box" } } }, { name: "columns", selector: { number: { min: 0, max: 8, mode: "box" } } }, { name: "collapsed_count", selector: { number: { min: 0, max: 100, mode: "box" } } },
        { name: "theme", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Automatique" }, { value: "light", label: "Clair" }, { value: "dark", label: "Sombre" }] } } }] },
      { type: "grid", name: "", schema: [{ name: "lock_while_playing", selector: { boolean: {} } }, { name: "show_search", selector: { boolean: {} } }, { name: "stop_on_press", selector: { boolean: {} } }] },
      { type: "expandable", name: "", title: "Nuance de couleur", schema: GV_FIELDS },
    ];
    el.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const cfg = { ...ev.detail.value };
      cfg.tiles = (cfg.tiles || []).map((id) => this._keep.find((x) => x.entity === id) || id);
      if (!cfg.volume_entity) delete cfg.volume_entity;
      this._config = cfg;
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
    });
    this._form = el; this.appendChild(el);
  }
}

customElements.define("soundboard-card", SoundboardCard);
customElements.define("soundboard-card-editor", SoundboardCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: "soundboard-card", name: "Soundboard Card (FR)", description: "Boîte à sons : tuiles qui lancent des morceaux courts, progression, recherche, repli et volume.", preview: true });
console.info(`%c SOUNDBOARD-CARD %c v${CARD_VERSION} `, "color:#fff;background:#d6246e;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px", "color:#d6246e;background:#fff;font-weight:700;border-radius:0 3px 3px 0;padding:2px 4px");
}
