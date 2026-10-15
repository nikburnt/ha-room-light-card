export function normalizeConfig(config) {
  if (config.entities !== undefined && !Array.isArray(config.entities)) throw new Error("entities must be an array");
  const seen = new Set();
  const entities = (config.entities || []).map(value => {
    const item = typeof value === "string" ? { entity: value } : { ...value };
    if (!/^(light|switch)\.[a-z0-9_]+$/.test(item.entity || "")) throw new Error("Choose a light or switch entity");
    if (seen.has(item.entity)) throw new Error("Duplicate lighting entity: " + item.entity);
    seen.add(item.entity);
    for (const key of ["name", "icon", "note"]) {
      if (item[key] !== undefined && typeof item[key] !== "string") throw new Error(key + " must be text");
    }
    return item;
  });
  return { ...config, show_all_off: config.show_all_off !== false, entities };
}

export const available = state => Boolean(state && state.state !== "unavailable");

export function summary(entities, states) {
  const counts = { on: 0, off: 0, unknown: 0, unavailable: 0, total: entities.length };
  for (const { entity } of entities) {
    const state = states[entity];
    if (!available(state)) counts.unavailable++;
    else if (state.state === "on") counts.on++;
    else if (state.state === "off") counts.off++;
    else counts.unknown++;
  }
  return counts;
}

export function powerCommand(entity, on) {
  return { domain: entity.split(".")[0], service: on ? "turn_on" : "turn_off", data: { entity_id: entity } };
}

export function nextPower(state, pending) {
  return !(pending ? pending.desired : state?.state === "on");
}

export function roomCommands(entities, states) {
  const domains = new Map();
  for (const { entity } of entities) {
    if (!available(states[entity])) continue;
    const domain = entity.split(".")[0];
    if (!domains.has(domain)) domains.set(domain, []);
    domains.get(domain).push(entity);
  }
  return [...domains].map(([domain, ids]) => ({ domain, service: "turn_off", data: { entity_id: ids } }));
}

export function lightFeatures(entity, state) {
  const modes = entity.startsWith("light.") ? state?.attributes?.supported_color_modes || [] : [];
  return {
    brightness: modes.some(mode => ["brightness", "color_temp", "hs", "xy", "rgb", "rgbw", "rgbww", "white"].includes(mode)),
    color: modes.some(mode => ["hs", "xy", "rgb", "rgbw", "rgbww"].includes(mode)),
    temperature: modes.includes("color_temp")
  };
}

export function kelvinRange(attributes) {
  const min = attributes.min_color_temp_kelvin ?? (attributes.max_mireds > 0 ? Math.round(1e6 / attributes.max_mireds) : null);
  const max = attributes.max_color_temp_kelvin ?? (attributes.min_mireds > 0 ? Math.round(1e6 / attributes.min_mireds) : null);
  return Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min ? [min, max] : null;
}

export function rgbHex(rgb) {
  return Array.isArray(rgb) && rgb.length === 3 && rgb.every(value => Number.isFinite(value) && value >= 0 && value <= 255)
    ? "#" + rgb.map(value => Math.round(value).toString(16).padStart(2, "0")).join("") : null;
}
