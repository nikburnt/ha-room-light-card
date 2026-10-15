import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig, summary, lightFeatures, roomCommands, powerCommand, nextPower, kelvinRange, rgbHex } from "../src/model.js";

const state = (value, attributes = {}) => ({ state: value, attributes });
const config = normalizeConfig({ entities: ["switch.main", { entity: "light.ambient", name: "Ambient" }] });

test("normalizes explicit entities without changing the input", () => {
  const input = { name: "Room", entities: ["switch.main"] };
  assert.deepEqual(normalizeConfig(input).entities, [{ entity: "switch.main" }]);
  assert.deepEqual(input.entities, ["switch.main"]);
  assert.equal(normalizeConfig(input).show_all_off, true);
});
test("rejects unsupported domains, malformed IDs and duplicate rows", () => {
  for (const entity of ["sensor.power", "button.action", "switch.", "switch.main extra"]) {
    assert.throws(() => normalizeConfig({ entities: [entity] }));
  }
  assert.throws(() => normalizeConfig({ entities: ["switch.main", { entity: "switch.main" }] }));
  assert.throws(() => normalizeConfig({ entities: "switch.main" }));
  assert.throws(() => normalizeConfig({ entities: [{ entity: "switch.main", note: 17 }] }));
});
test("allows an empty card while choosing entities in the editor", () => {
  assert.deepEqual(normalizeConfig({}).entities, []);
});
test("a shared entity can appear once in each room", () => {
  const left = normalizeConfig({ entities: ["switch.shared_ambient"] });
  const right = normalizeConfig({ entities: ["switch.shared_ambient"] });
  assert.deepEqual(left.entities, right.entities);
});
test("counts unknown and unavailable separately from off", () => {
  const entities = ["light.on", "light.off", "light.unknown", "light.offline", "light.missing"].map(entity => ({ entity }));
  assert.deepEqual(summary(entities, {
    "light.on": state("on"), "light.off": state("off"),
    "light.unknown": state("unknown"), "light.offline": state("unavailable")
  }), { on: 1, off: 1, unknown: 1, unavailable: 2, total: 5 });
});
test("room off targets only the explicit list and skips missing/offline entities", () => {
  const states = { "switch.main": state("on"), "light.ambient": state("off"), "switch.outlet": state("on") };
  assert.deepEqual(roomCommands(config.entities, states), [
    { domain: "switch", service: "turn_off", data: { entity_id: ["switch.main"] } },
    { domain: "light", service: "turn_off", data: { entity_id: ["light.ambient"] } }
  ]);
  assert.deepEqual(roomCommands(config.entities, { "switch.main": state("unavailable") }), []);
});
test("unknown entities remain explicitly commandable, never assumed off in the summary", () => {
  assert.equal(roomCommands(config.entities, { "switch.main": state("unknown") }).length, 1);
});
test("power commands address public entities, not load relays", () => {
  assert.deepEqual(powerCommand("switch.room_main", true), {
    domain: "switch", service: "turn_on", data: { entity_id: "switch.room_main" }
  });
  assert.deepEqual(powerCommand("light.lamp", false), {
    domain: "light", service: "turn_off", data: { entity_id: "light.lamp" }
  });
});
test("a fast second click reverses the pending request, not the stale reported state", () => {
  assert.equal(nextPower(state("off"), undefined), true);
  assert.equal(nextPower(state("off"), { desired: true }), false);
  assert.equal(nextPower(state("on"), { desired: false }), true);
});
test("sliders are supported by capability, never by the switch name", () => {
  assert.deepEqual(lightFeatures("switch.lamp", state("on", { supported_color_modes: ["rgb"] })), { brightness: false, color: false, temperature: false });
  assert.deepEqual(lightFeatures("light.lamp", state("on", { supported_color_modes: ["onoff"] })), { brightness: false, color: false, temperature: false });
  assert.deepEqual(lightFeatures("light.lamp", state("on", { supported_color_modes: ["color_temp", "rgb"] })), { brightness: true, color: true, temperature: true });
});
test("uses actual kelvin limits and supports older mired limits", () => {
  assert.deepEqual(kelvinRange({ min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500 }), [2700, 6500]);
  assert.deepEqual(kelvinRange({ min_mireds: 200, max_mireds: 400 }), [2500, 5000]);
  assert.equal(kelvinRange({}), null);
  assert.equal(kelvinRange({ min_color_temp_kelvin: 6500, max_color_temp_kelvin: 2700 }), null);
});
test("represents RGB values without allowing invalid color data", () => {
  assert.equal(rgbHex([255, 128, 0]), "#ff8000");
  assert.equal(rgbHex([999, 1, 1]), null);
  assert.equal(rgbHex(null), null);
});
