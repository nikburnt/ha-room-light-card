async page => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const cards = page.locator("room-light-card");
  const living = cards.nth(0);
  const corridor = cards.nth(1);
  const balcony = cards.nth(3);
  assert(await cards.count() === 4, "Preview has four rooms");
  assert(await page.evaluate(() => window.demo.calls.length) === 0, "Rendering must not send commands");

  await living.getByRole("switch", { name: "Ambient", exact: true }).click();
  await page.waitForFunction(() => window.demo.getState("switch.common_area_ambient").state === "off");
  assert(await corridor.getByRole("switch", { name: "Ambient", exact: true }).getAttribute("aria-checked") === "false", "Shared ambient updates both rooms");
  assert(await page.evaluate(() => window.demo.calls[0].data.entity_id) === "switch.common_area_ambient", "Use the logical entity");

  await page.evaluate(() => { window.demo.reset(); window.demo.setState("switch.living_room_main", "off"); window.demo.delay = 500; });
  await living.getByRole("switch", { name: "Main", exact: true }).click();
  await living.getByRole("switch", { name: "Main", exact: true }).click();
  const rapid = await page.evaluate(() => window.demo.calls.slice(-2).map(call => call.service));
  assert(rapid.join(",") === "turn_on,turn_off", "Fast second press supersedes pending request");
  await page.waitForTimeout(650);
  assert(await page.evaluate(() => window.demo.getState("switch.living_room_main").state) === "off", "Rapid final state");

  await page.evaluate(() => window.demo.reset());
  await living.getByRole("button", { name: "Выключить свет в комнате", exact: true }).click();
  await page.waitForFunction(() => window.demo.getState("switch.living_room_main").state === "off");
  const targets = await page.evaluate(() => window.demo.calls.flatMap(call => [call.data.entity_id].flat()));
  assert(targets.length === 2 && targets.includes("switch.common_area_ambient") && targets.includes("switch.living_room_main"), "Room off exact targets");
  assert(await page.evaluate(() => window.demo.getState("switch.unrelated_outlet").state) === "on", "Room off does not touch outlets");

  await page.evaluate(() => { window.demo.reset(); window.demo.failNext = true; });
  await living.getByRole("switch", { name: "Main", exact: true }).click();
  await living.getByRole("alert").waitFor();
  assert((await living.getByRole("alert").textContent()).includes("Service unavailable"), "Show service failure");
  assert(await living.getByRole("switch", { name: "Main", exact: true }).isEnabled(), "Failure does not lock controls");
  await page.evaluate(() => { window.demo.reset(); window.demo.stall = true; });
  await living.getByRole("switch", { name: "Main", exact: true }).click();
  assert(await living.getByRole("switch", { name: "Main", exact: true }).getAttribute("aria-checked") === "true", "Accepted service is not confirmed state");
  await page.waitForTimeout(10200);
  assert((await living.getByRole("alert").textContent()).includes("Состояние не подтвердилось"), "Unconfirmed request times out visibly");
  await page.evaluate(() => window.demo.setState("switch.living_room_main", "off"));
  assert(await living.getByRole("alert").count() === 0, "Delayed feedback clears the obsolete warning");
  await page.evaluate(() => { window.demo.reset(); window.demo.setState("switch.living_room_main", "unavailable"); });
  assert(await living.getByRole("switch", { name: "Main", exact: true }).isDisabled(), "Unavailable control disabled");
  assert((await living.locator(".status").first().textContent()).includes("Недоступно"), "Unavailable is not off");
  await page.evaluate(() => window.demo.setState("switch.living_room_main", "unknown"));
  assert((await living.locator(".status").first().textContent()).includes("Неизвестно"), "Unknown is not off");
  await page.evaluate(() => { window.demo.reset(); window.demo.setState("switch.common_area_ambient", "on", { unavailable_load_relays: ["switch.demo_load_b"] }); });
  assert((await living.locator(".status").last().textContent()).includes("Часть нагрузки"), "Partial-load warning");

  await page.evaluate(() => window.demo.reset());
  await balcony.getByRole("button", { name: "Настройки света: Large Lamp", exact: true }).click();
  const brightness = balcony.getByRole("slider", { name: "Яркость: Large Lamp", exact: true });
  await brightness.fill("35");
  await brightness.dispatchEvent("change");
  await page.waitForFunction(() => window.demo.calls.length > 0);
  assert(await page.evaluate(() => window.demo.calls.at(-1).data.brightness_pct) === 35, "Brightness routing");
  const temperature = balcony.getByRole("slider", { name: "Температура: Large Lamp", exact: true });
  await temperature.fill("4200");
  await temperature.dispatchEvent("change");
  assert(await page.evaluate(() => window.demo.calls.at(-1).data.color_temp_kelvin) === 4200, "Kelvin routing");
  await balcony.getByLabel("Цвет: Large Lamp", { exact: true }).fill("#12ab34");
  await balcony.getByLabel("Цвет: Large Lamp", { exact: true }).dispatchEvent("change");
  const rgb = await page.evaluate(() => window.demo.calls.at(-1).data.rgb_color);
  assert(rgb.join(",") === "18,171,52", "RGB routing");
  await page.waitForTimeout(500);

  const count = await page.evaluate(() => window.demo.calls.length);
  await living.getByRole("button", { name: "Подробнее: Main", exact: true }).click();
  assert(await page.locator("#info-dialog").isVisible(), "More-info event");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Редактор карточки", exact: true }).click();
  const editor = page.locator("room-light-card-editor");
  await editor.getByRole("textbox", { name: "Название", exact: true }).first().fill("A Very Long Room Name For Layout Verification");
  assert(await page.evaluate(() => window.demo.editorChanges.at(-1).name) === "A Very Long Room Name For Layout Verification", "Editor emits config");
  await editor.getByRole("button", { name: "Добавить свет", exact: true }).click();
  assert(await editor.locator("section").count() === 3, "Editor adds rows");
  await editor.getByRole("button", { name: "Удалить", exact: true }).last().click();
  await editor.getByRole("button", { name: "Ниже", exact: true }).first().click();
  assert(await page.evaluate(() => window.demo.editorChanges.at(-1).entities[0].entity) === "switch.common_area_ambient", "Editor reorders rows");
  assert(await page.evaluate(() => window.demo.calls.length) === count, "Editing does not send commands");
  await page.getByRole("button", { name: "Закрыть редактор", exact: true }).click();

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "Page overflow at " + width);
    assert(await cards.evaluateAll(elements => elements.every(card => card.shadowRoot.querySelector("ha-card").scrollWidth <= card.clientWidth)), "Card overflow at " + width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "output/playwright/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Сменить тему", exact: true }).click();
  await page.screenshot({ path: "output/playwright/mobile-dark.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "output/playwright/desktop-dark.png" });
  await page.getByRole("combobox", { name: "Язык", exact: true }).selectOption("en");
  assert(await living.getByRole("button", { name: "Turn off room lighting", exact: true }).count() === 1, "English localization");
  await page.reload();
  assert(await page.evaluate(() => window.demo.calls.length) === 0, "Reload is passive");
}
