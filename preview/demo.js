import { LitElement, html, css } from "lit";
import { mdiLightbulbOutline, mdiLightbulbGroupOutline, mdiLightbulbGroupOffOutline, mdiLinkVariant, mdiTuneVariant, mdiArrowUp, mdiArrowDown, mdiDeleteOutline, mdiPlus, mdiThemeLightDark, mdiPencilOutline, mdiClose, mdiFloorLamp, mdiLedStripVariant } from "@mdi/js";

const icons = {
  "mdi:lightbulb-outline": mdiLightbulbOutline, "mdi:lightbulb-group-outline": mdiLightbulbGroupOutline,
  "mdi:lightbulb-group-off-outline": mdiLightbulbGroupOffOutline, "mdi:link-variant": mdiLinkVariant,
  "mdi:tune-variant": mdiTuneVariant, "mdi:arrow-up": mdiArrowUp, "mdi:arrow-down": mdiArrowDown,
  "mdi:delete-outline": mdiDeleteOutline, "mdi:plus": mdiPlus, "mdi:theme-light-dark": mdiThemeLightDark,
  "mdi:pencil-outline": mdiPencilOutline, "mdi:close": mdiClose, "mdi:floor-lamp": mdiFloorLamp, "mdi:led-strip-variant": mdiLedStripVariant
};
class Icon extends HTMLElement {
  static observedAttributes = ["icon"];
  set icon(value) { this.setAttribute("icon", value); }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  render() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden="true"><path d="${icons[this.getAttribute("icon")] || mdiLightbulbOutline}"></path></svg>`;
  }
}
customElements.define("ha-icon", Icon);

// Only the preview emulates Home Assistant's form fields and service calls.
class PreviewForm extends LitElement {
  static properties = { schema: { attribute: false }, data: { attribute: false }, hass: { attribute: false }, computeLabel: { attribute: false } };
  change(name, value) {
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: { ...this.data, [name]: value } }, bubbles: true, composed: true }));
  }
  render() {
    return html`${(this.schema || []).map(field => html`<label><span>${this.computeLabel(field)}</span>
      ${field.selector.boolean ? html`<input type="checkbox" .checked=${Boolean(this.data[field.name])} @change=${event => this.change(field.name, event.target.checked)}>`
      : field.selector.entity ? html`<select .value=${this.data[field.name] || ""} @change=${event => this.change(field.name, event.target.value)}><option value="">—</option>${Object.keys(this.hass.states).filter(id => /^(light|switch)\./.test(id)).map(id => html`<option value=${id}>${id}</option>`)}</select>`
      : html`<input type="text" .value=${this.data[field.name] || ""} @input=${event => this.change(field.name, event.target.value)}>`}
    </label>`)}`;
  }
  static styles = css`
    :host { display:grid; gap:12px; }
    label { display:grid; gap:6px; font:13px system-ui,sans-serif; color:var(--secondary-text-color,#626f73); }
    input[type=text],select { padding:10px; border:1px solid var(--divider-color,#ddd); border-radius:4px; color:var(--primary-text-color,#24292b); background:var(--ha-card-background,#fff); min-width:0; width:100%; font:14px system-ui,sans-serif; }
    input[type=checkbox] { justify-self:start; width:20px; height:20px; }
  `;
}
customElements.define("ha-form", PreviewForm);

const makeState = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes: { friendly_name: entity_id, ...attributes } });
const baseline = {
  "switch.living_room_main": makeState("switch.living_room_main", "on"),
  "switch.common_area_ambient": makeState("switch.common_area_ambient", "on", { load_relays: ["switch.demo_load_a", "switch.demo_load_b"], synchronized: true }),
  "switch.corridor_main": makeState("switch.corridor_main", "off"),
  "switch.bedroom_main": makeState("switch.bedroom_main", "off"),
  "switch.bedroom_ambient": makeState("switch.bedroom_ambient", "on"),
  "light.balcony_small_lamp": makeState("light.balcony_small_lamp", "on", { supported_color_modes: ["color_temp"], brightness: 153, color_temp_kelvin: 3000, min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 }),
  "light.balcony_large_lamp": makeState("light.balcony_large_lamp", "off", { supported_color_modes: ["color_temp", "rgb"], brightness: 102, color_temp_kelvin: 3500, min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500, rgb_color: [255, 170, 85] }),
  "switch.unrelated_outlet": makeState("switch.unrelated_outlet", "on")
};
const configs = [
  { name: "Living Room", entities: [{ entity: "switch.living_room_main", name: "Main" }, { entity: "switch.common_area_ambient", name: "Ambient", icon: "mdi:led-strip-variant", note: "Living Room + Corridor" }] },
  { name: "Corridor", entities: [{ entity: "switch.corridor_main", name: "Main" }, { entity: "switch.common_area_ambient", name: "Ambient", icon: "mdi:led-strip-variant", note: "Living Room + Corridor" }] },
  { name: "Bedroom", entities: [{ entity: "switch.bedroom_main", name: "Main" }, { entity: "switch.bedroom_ambient", name: "Ambient", icon: "mdi:led-strip-variant" }] },
  { name: "Balcony", entities: [{ entity: "light.balcony_small_lamp", name: "Small Lamp", icon: "mdi:floor-lamp" }, { entity: "light.balcony_large_lamp", name: "Large Lamp", icon: "mdi:floor-lamp" }] }
];
let states = structuredClone(baseline);
let language = "ru";
const calls = [];
const cards = configs.map(config => {
  const card = document.createElement("room-light-card");
  card.setConfig(config);
  document.getElementById("cards").append(card);
  return card;
});
const editor = document.querySelector("room-light-card-editor");
editor.setConfig({ ...configs[0], type: "custom:room-light-card" });
function update() {
  const hass = { states: { ...states }, language, callService };
  for (const card of cards) card.hass = hass;
  editor.hass = hass;
}
async function callService(domain, service, data) {
  calls.push({ domain, service, data: structuredClone(data) });
  if (window.demo.failNext) { window.demo.failNext = false; throw new Error("Service unavailable"); }
  if (window.demo.stall) return;
  await new Promise(resolve => setTimeout(resolve, window.demo.delay));
  for (const id of Array.isArray(data.entity_id) ? data.entity_id : [data.entity_id]) {
    const attributes = { ...states[id]?.attributes };
    if (data.brightness_pct !== undefined) attributes.brightness = Math.round(data.brightness_pct / 100 * 255);
    if (data.color_temp_kelvin !== undefined) attributes.color_temp_kelvin = data.color_temp_kelvin;
    if (data.rgb_color !== undefined) attributes.rgb_color = data.rgb_color;
    states[id] = makeState(id, service === "turn_off" ? "off" : "on", attributes);
  }
  update();
}
window.demo = {
  calls, cards, configs, failNext: false, stall: false, delay: 250,
  setState(id, value, attributes = {}) { states[id] = makeState(id, value, { ...states[id]?.attributes, ...attributes }); update(); },
  getState(id) { return structuredClone(states[id]); },
  setLanguage(value) { language = value; update(); },
  reset() { states = structuredClone(baseline); calls.length = 0; this.failNext = false; this.stall = false; this.delay = 250; update(); },
  editorChanges: []
};
document.getElementById("theme").addEventListener("click", () => document.body.classList.toggle("dark"));
document.getElementById("language").addEventListener("change", event => { language = event.target.value; update(); });
document.getElementById("scenario").addEventListener("change", event => {
  window.demo.reset();
  if (event.target.value === "off" || event.target.value === "offline") {
    for (const state of Object.values(states)) state.state = event.target.value === "off" ? "off" : "unavailable";
  } else if (event.target.value === "partial") states["switch.common_area_ambient"].attributes.unavailable_load_relays = ["switch.demo_load_b"];
  update();
});
document.getElementById("editor").addEventListener("click", () => document.getElementById("editor-dialog").showModal());
document.getElementById("close-editor").addEventListener("click", () => document.getElementById("editor-dialog").close());
document.getElementById("close-info").addEventListener("click", () => document.getElementById("info-dialog").close());
editor.addEventListener("config-changed", event => {
  window.demo.editorChanges.push(structuredClone(event.detail.config));
  try { cards[0].setConfig(event.detail.config); } catch { /* Incomplete editor selections are expected. */ }
});
document.addEventListener("hass-more-info", event => {
  document.getElementById("more-info").textContent = event.detail.entityId;
  document.getElementById("info-dialog").showModal();
});
update();
