import { LitElement, html, css, nothing } from "lit";
import { normalizeConfig, available, summary, lightFeatures, roomCommands, powerCommand, nextPower, kelvinRange, rgbHex } from "./model.js";

const WORDS = {
  en: { title: "Lighting", on: "On", off: "Off", unknown: "Unknown", unavailable: "Unavailable", allOff: "Turn off room lighting", turnOn: "Turn on", turnOff: "Turn off", details: "Light settings", more: "More information", brightness: "Brightness", temperature: "Temperature", color: "Color", waiting: "Awaiting state", timeout: "State not confirmed", partial: "Some loads unavailable", syncing: "Synchronizing", count: "on", noData: "without data", name: "Name", icon: "Icon", note: "Shared lighting / note", entity: "Lighting entity", show_all_off: "Room off button", add: "Add light", remove: "Remove", up: "Move up", down: "Move down", light: "Light", missing: "Entity not found" },
  ru: { title: "Освещение", on: "Включено", off: "Выключено", unknown: "Неизвестно", unavailable: "Недоступно", allOff: "Выключить свет в комнате", turnOn: "Включить", turnOff: "Выключить", details: "Настройки света", more: "Подробнее", brightness: "Яркость", temperature: "Температура", color: "Цвет", waiting: "Ждём состояние", timeout: "Состояние не подтвердилось", partial: "Часть нагрузки недоступна", syncing: "Синхронизация", count: "вкл.", noData: "без данных", name: "Название", icon: "Иконка", note: "Общая подсветка / примечание", entity: "Сущность света", show_all_off: "Кнопка выключения комнаты", add: "Добавить свет", remove: "Удалить", up: "Выше", down: "Ниже", light: "Свет", missing: "Сущность не найдена" }
};
const wordsFor = hass => WORDS[hass?.language?.startsWith("ru") ? "ru" : "en"];
const icon = name => html`<ha-icon .icon=${name}></ha-icon>`;

class RoomLightCard extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true }, expanded: { state: true }, commands: { state: true }, errors: { state: true }, drafts: { state: true } };

  constructor() {
    super();
    this.expanded = {};
    this.commands = {};
    this.errors = {};
    this.drafts = {};
  }

  setConfig(config) {
    for (const command of Object.values(this.commands)) clearTimeout(command.timer);
    this.commands = {};
    this.errors = {};
    this.drafts = {};
    this.config = normalizeConfig(config);
  }

  static getConfigElement() { return document.createElement("room-light-card-editor"); }
  static getStubConfig() { return { name: "Lighting", entities: [] }; }
  getCardSize() { return 2 + (this.config?.entities.length || 0); }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }
  get words() { return wordsFor(this.hass); }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const command of Object.values(this.commands)) clearTimeout(command.timer);
    this.commands = {};
  }

  updated(changed) {
    if (changed.has("hass")) {
      for (const [entity, command] of Object.entries(this.commands)) this.confirm(entity, command);
      const previous = changed.get("hass");
      const errors = { ...this.errors };
      for (const entity of Object.keys(errors)) {
        const value = this.hass?.states[entity]?.state;
        if (["on", "off"].includes(value) && previous?.states[entity]?.state !== value) delete errors[entity];
      }
      if (Object.keys(errors).length !== Object.keys(this.errors).length) this.errors = errors;
    }
  }

  confirm(entity, command) {
    if (this.commands[entity] !== command || this.hass?.states[entity]?.state !== (command.desired ? "on" : "off")) return;
    clearTimeout(command.timer);
    const next = { ...this.commands };
    delete next[entity];
    this.commands = next;
  }

  async send(request, desired) {
    const ids = Array.isArray(request.data.entity_id) ? request.data.entity_id : [request.data.entity_id];
    const records = new Map();
    for (const entity of ids) {
      clearTimeout(this.commands[entity]?.timer);
      const command = { desired };
      command.timer = setTimeout(() => {
        if (this.commands[entity] !== command) return;
        const next = { ...this.commands }; delete next[entity]; this.commands = next;
        this.errors = { ...this.errors, [entity]: this.words.timeout };
      }, 10000);
      records.set(entity, command);
      this.commands = { ...this.commands, [entity]: command };
      this.errors = { ...this.errors, [entity]: "" };
    }
    try {
      await this.hass.callService(request.domain, request.service, request.data);
      for (const [entity, command] of records) this.confirm(entity, command);
    } catch (error) {
      for (const [entity, command] of records) {
        if (this.commands[entity] !== command) continue;
        clearTimeout(command.timer);
        const next = { ...this.commands }; delete next[entity]; this.commands = next;
        this.errors = { ...this.errors, [entity]: error.message || String(error) };
      }
    }
  }

  toggle(entity) {
    if (!available(this.hass.states[entity])) return;
    const on = nextPower(this.hass.states[entity], this.commands[entity]);
    return this.send(powerCommand(entity, on), on);
  }

  allOff() {
    return Promise.all(roomCommands(this.config.entities, this.hass.states).map(request => this.send(request, false)));
  }

  moreInfo(entity) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: entity }, bubbles: true, composed: true }));
  }

  name(item) { return item.name || this.hass.states[item.entity]?.attributes?.friendly_name || item.entity; }

  status(item) {
    const state = this.hass.states[item.entity];
    if (!state) return this.words.missing;
    if (!available(state)) return this.words.unavailable;
    if (this.commands[item.entity]) return this.words.waiting;
    if (state.state !== "on" && state.state !== "off") return this.words.unknown;
    if (state.attributes?.unavailable_load_relays?.length) return this.words.partial;
    if (state.attributes?.out_of_sync_load_relays?.length) return this.words.syncing;
    return this.words[state.state];
  }

  changeLight(entity, data) {
    const brightness = data.brightness_pct;
    const request = brightness === 0 ? powerCommand(entity, false) : { domain: "light", service: "turn_on", data: { entity_id: entity, ...data } };
    return this.send(request, brightness !== 0);
  }

  slider(item, kind, min, max, actual, unit, dataKey) {
    const key = item.entity + ":" + kind;
    const value = this.drafts[key] ?? actual;
    const shown = value === null || value === undefined ? this.words.unknown : Math.round(value) + unit;
    return html`<div class="adjustment">
      <div class="adjustment-heading"><label for=${key}>${this.words[kind]}</label><output>${shown}</output></div>
      <input id=${key} type="range" min=${min} max=${max} step="1" .value=${String(value ?? min)}
        aria-label=${this.words[kind] + ": " + this.name(item)} aria-valuetext=${shown}
        ?disabled=${!available(this.hass.states[item.entity])}
        @input=${event => { this.drafts = { ...this.drafts, [key]: Number(event.target.value) }; }}
        @change=${event => {
          const next = { ...this.drafts }; delete next[key]; this.drafts = next;
          this.changeLight(item.entity, { [dataKey]: Number(event.target.value) });
        }}>
    </div>`;
  }

  settings(item, state, features) {
    if (!this.expanded[item.entity]) return nothing;
    const attributes = state?.attributes || {};
    const range = kelvinRange(attributes);
    const brightness = typeof attributes.brightness === "number" ? attributes.brightness / 255 * 100 : null;
    return html`<div class="settings">
      ${features.brightness ? this.slider(item, "brightness", 0, 100, brightness, "%", "brightness_pct") : nothing}
      ${features.temperature && range ? this.slider(item, "temperature", range[0], range[1], attributes.color_temp_kelvin ?? null, " K", "color_temp_kelvin") : nothing}
      ${features.color ? html`<div class="color-setting"><label for=${item.entity + "-color"}>${this.words.color}</label>
        <input id=${item.entity + "-color"} type="color" .value=${rgbHex(attributes.rgb_color) || "#ffffff"}
          aria-label=${this.words.color + ": " + this.name(item)} ?disabled=${!available(state)}
          @change=${event => {
            const hex = event.target.value;
            this.changeLight(item.entity, { rgb_color: [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) });
          }}>
      </div>` : nothing}
    </div>`;
  }

  render() {
    if (!this.config || !this.hass) return nothing;
    const counts = summary(this.config.entities, this.hass.states);
    const missing = counts.unavailable + counts.unknown;
    return html`<ha-card>
      <header><div class="room-title">${icon(this.config.icon || "mdi:lightbulb-group-outline")}
        <div class="title-text"><h2>${this.config.name || this.words.title}</h2>
          <div class="summary" aria-live="polite">${counts.on} / ${counts.total} ${this.words.count}${missing ? ` · ${missing} ${this.words.noData}` : ""}</div>
        </div>
      </div>
      ${this.config.show_all_off ? html`<button class="icon-button room-off" type="button" title=${this.words.allOff} aria-label=${this.words.allOff}
        ?disabled=${counts.unavailable === counts.total} @click=${() => this.allOff()}>${icon("mdi:lightbulb-group-off-outline")}</button>` : nothing}
      </header>
      <div class="lights">${this.config.entities.map(item => {
        const state = this.hass.states[item.entity];
        const on = state?.state === "on";
        const features = lightFeatures(item.entity, state);
        const adjustable = features.brightness || features.color || features.temperature;
        const warning = !available(state) || state?.state === "unknown" || state?.attributes?.unavailable_load_relays?.length || state?.attributes?.out_of_sync_load_relays?.length;
        return html`<section class="light ${on ? "on" : ""}" data-entity=${item.entity}>
          <div class="light-row">
            <button class="lamp-icon icon-button ${on ? "lit" : ""}" type="button" title=${this.words.more + ": " + this.name(item)}
              aria-label=${this.words.more + ": " + this.name(item)} @click=${() => this.moreInfo(item.entity)}>
              ${icon(item.icon || state?.attributes?.icon || "mdi:lightbulb-outline")}
            </button>
            <div class="light-label"><button class="name" type="button" @click=${() => this.moreInfo(item.entity)}>${this.name(item)}</button>
              <div id=${item.entity + "-status"} class="status ${warning ? "warning" : ""}" aria-live="polite">${this.status(item)}</div>
              ${item.note ? html`<div class="note">${icon("mdi:link-variant")}<span>${item.note}</span></div>` : nothing}
            </div>
            ${adjustable ? html`<button class="icon-button settings-button" type="button" title=${this.words.details + ": " + this.name(item)}
              aria-label=${this.words.details + ": " + this.name(item)} aria-expanded=${String(Boolean(this.expanded[item.entity]))}
              @click=${() => { this.expanded = { ...this.expanded, [item.entity]: !this.expanded[item.entity] }; }}>${icon("mdi:tune-variant")}</button>` : nothing}
            <button class="toggle ${on ? "checked" : ""}" role="switch" type="button" aria-checked=${String(on)}
              aria-describedby=${item.entity + "-status"} aria-label=${this.name(item)}
              title=${(nextPower(state, this.commands[item.entity]) ? this.words.turnOn : this.words.turnOff) + ": " + this.name(item)}
              ?disabled=${!available(state)} @click=${() => this.toggle(item.entity)}><span class="track"><span class="thumb"></span></span></button>
          </div>
          ${this.settings(item, state, features)}
          ${this.errors[item.entity] ? html`<div class="error" role="alert">${this.errors[item.entity]}</div>` : nothing}
        </section>`;
      })}</div>
    </ha-card>`;
  }

  static styles = css`
    :host { display:block; color:var(--primary-text-color,#24292b); font-family:var(--paper-font-body1_-_font-family,system-ui,sans-serif); letter-spacing:0; }
    * { box-sizing:border-box; letter-spacing:0; }
    ha-card { display:block; overflow:hidden; background:var(--ha-card-background,var(--card-background-color,#fff)); border:1px solid var(--divider-color,#e0e4e5); border-radius:var(--ha-card-border-radius,8px); box-shadow:var(--ha-card-box-shadow,none); }
    button,input { font:inherit; color:inherit; touch-action:manipulation; }
    button { border:0; background:none; cursor:pointer; }
    button:disabled { opacity:.4; cursor:default; }
    button:focus-visible,input:focus-visible { outline:2px solid var(--primary-color,#147965); outline-offset:3px; }
    ha-icon { display:inline-flex; width:22px; height:22px; --mdc-icon-size:22px; flex-shrink:0; }
    header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 18px 14px; }
    .room-title { display:flex; align-items:center; gap:12px; min-width:0; }
    .room-title > ha-icon { color:var(--secondary-text-color,#737e80); }
    .title-text { min-width:0; }
    h2 { font-size:17px; font-weight:600; line-height:1.4; margin:0; overflow-wrap:anywhere; }
    .summary { font-size:12px; line-height:1.6; color:var(--secondary-text-color,#737e80); font-variant-numeric:tabular-nums; }
    .icon-button { min-width:44px; width:44px; height:44px; padding:10px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
    .icon-button:hover:not(:disabled) { background:var(--secondary-background-color,#f1f4f5); }
    .room-off { background:var(--secondary-background-color,#f1f4f5); color:var(--secondary-text-color,#737e80); }
    .lights { padding:0 18px 4px; }
    .light { border-top:1px solid var(--divider-color,#e0e4e5); padding:14px 0; }
    .light-row { display:flex; align-items:center; gap:10px; min-height:48px; }
    .lamp-icon { background:var(--secondary-background-color,#f1f4f5); color:var(--secondary-text-color,#737e80); }
    .lamp-icon.lit { color:var(--state-light-active-color,#b77500); background:var(--room-light-active-background,#fff2d4); }
    .light-label { flex:1; min-width:0; }
    .name { display:block; text-align:left; font-size:14px; font-weight:600; padding:0; line-height:1.5; overflow-wrap:anywhere; width:100%; }
    .status { color:var(--secondary-text-color,#737e80); font-size:12px; line-height:1.7; min-height:20px; overflow-wrap:anywhere; }
    .status.warning { color:var(--warning-color,#9c6200); }
    .note { display:flex; align-items:center; gap:5px; color:var(--secondary-text-color,#737e80); font-size:11px; line-height:1.5; margin-top:2px; overflow-wrap:anywhere; }
    .note ha-icon { width:13px; height:13px; --mdc-icon-size:13px; }
    .settings-button { color:var(--secondary-text-color,#737e80); }
    .toggle { flex:0 0 48px; width:48px; height:44px; display:flex; align-items:center; justify-content:center; padding:0; }
    .track { display:block; width:40px; height:24px; border:1px solid var(--secondary-text-color,#737e80); border-radius:14px; background:var(--secondary-background-color,#f1f4f5); padding:3px; }
    .thumb { display:block; width:16px; height:16px; border-radius:50%; background:var(--secondary-text-color,#737e80); transition:transform .15s ease; }
    .checked .track { background:var(--primary-color,#147965); border-color:var(--primary-color,#147965); }
    .checked .thumb { background:#fff; transform:translateX(16px); }
    .settings { padding:10px 2px 0 54px; display:grid; gap:12px; }
    .adjustment-heading,.color-setting { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    label,output { font-size:12px; color:var(--secondary-text-color,#737e80); }
    output { font-variant-numeric:tabular-nums; }
    input[type=range] { display:block; width:100%; height:30px; margin:4px 0 0; accent-color:var(--primary-color,#147965); cursor:pointer; }
    input[type=color] { width:42px; height:32px; padding:2px; border:1px solid var(--divider-color,#e0e4e5); border-radius:4px; background:transparent; cursor:pointer; }
    .error { font-size:12px; line-height:1.6; color:var(--error-color,#be3a3a); padding:8px 0 0 54px; overflow-wrap:anywhere; }
    @media (prefers-reduced-motion:reduce) { .thumb { transition:none; } }
    @media (max-width:360px) { header { padding:14px 12px 12px; } .lights { padding:0 12px 2px; } .light-row { gap:7px; } .settings,.error { padding-left:0; } }
  `;
}

class RoomLightCardEditor extends LitElement {
  static properties = { hass: { attribute: false }, config: { state: true } };
  setConfig(config) {
    this.config = { ...config, entities: (config.entities || []).map(item => typeof item === "string" ? { entity: item } : { ...item }) };
  }
  emit(config) {
    this.config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
  move(index, offset) {
    const entities = [...this.config.entities];
    [entities[index], entities[index + offset]] = [entities[index + offset], entities[index]];
    this.emit({ ...this.config, entities });
  }
  action(label, symbol, handler, disabled = false) {
    return html`<button type="button" title=${label} aria-label=${label} ?disabled=${disabled} @click=${handler}>${icon(symbol)}</button>`;
  }
  render() {
    if (!this.config || !this.hass) return nothing;
    const words = wordsFor(this.hass);
    const label = field => words[field.name] || field.name;
    const header = [{ name: "name", selector: { text: {} } }, { name: "icon", selector: { icon: {} } }, { name: "show_all_off", selector: { boolean: {} } }];
    const row = [{ name: "entity", required: true, selector: { entity: { domain: ["light", "switch"] } } }, { name: "name", selector: { text: {} } }, { name: "icon", selector: { icon: {} } }, { name: "note", selector: { text: {} } }];
    return html`<ha-form .hass=${this.hass} .data=${{ show_all_off: true, ...this.config }} .schema=${header} .computeLabel=${label}
      @value-changed=${event => { event.stopPropagation(); this.emit({ ...this.config, ...event.detail.value }); }}></ha-form>
      ${this.config.entities.map((item, index) => html`<section>
        <div class="row-heading"><strong>${words.light} ${index + 1}</strong><div class="actions">
          ${this.action(words.up, "mdi:arrow-up", () => this.move(index, -1), index === 0)}
          ${this.action(words.down, "mdi:arrow-down", () => this.move(index, 1), index === this.config.entities.length - 1)}
          ${this.action(words.remove, "mdi:delete-outline", () => this.emit({ ...this.config, entities: this.config.entities.filter((_, i) => i !== index) }))}
        </div></div>
        <ha-form .hass=${this.hass} .data=${item} .schema=${row} .computeLabel=${label}
          @value-changed=${event => {
            event.stopPropagation();
            this.emit({ ...this.config, entities: this.config.entities.map((value, i) => i === index ? { ...value, ...event.detail.value } : value) });
          }}></ha-form>
      </section>`)}
      <button class="add" type="button" @click=${() => this.emit({ ...this.config, entities: [...this.config.entities, { entity: "" }] })}>${icon("mdi:plus")}${words.add}</button>`;
  }
  static styles = css`
    :host { display:block; color:var(--primary-text-color,#24292b); font-family:system-ui,sans-serif; }
    * { box-sizing:border-box; letter-spacing:0; }
    section { border-top:1px solid var(--divider-color,#ddd); margin-top:16px; padding-top:12px; }
    .row-heading,.actions { display:flex; align-items:center; justify-content:space-between; gap:4px; }
    strong { font-size:14px; }
    button { border:0; background:none; color:inherit; cursor:pointer; border-radius:4px; width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center; }
    button:focus-visible { outline:2px solid var(--primary-color,#147965); outline-offset:2px; }
    button:disabled { opacity:.3; cursor:default; }
    ha-icon { width:20px; height:20px; --mdc-icon-size:20px; }
    .add { width:auto; padding:8px 12px; margin-top:16px; gap:8px; color:var(--primary-color,#147965); font:inherit; }
  `;
}

if (!customElements.get("room-light-card")) customElements.define("room-light-card", RoomLightCard);
if (!customElements.get("room-light-card-editor")) customElements.define("room-light-card-editor", RoomLightCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === "room-light-card")) window.customCards.push({
  type: "room-light-card", name: "Room Light Card", preview: true,
  description: "One control per lighting group, organized by room.",
  documentationURL: "https://github.com/nikburnt/ha-room-light-card"
});
