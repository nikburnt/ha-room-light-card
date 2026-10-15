# Room Light Card

A Home Assistant dashboard card with one control per lighting group, organized
by room. Use existing Switch Link logical switches, Unified Device controls,
or ordinary light entities. Multiple wall buttons and physical integration
sources do not need separate dashboard controls.

## Installation

Add `nikburnt/ha-room-light-card` to HACS custom repositories as a **Dashboard**
repository, then download **Room Light Card**. If HACS has not registered the
resource, add `/hacsfiles/ha-room-light-card/ha-room-light-card.js` as a
JavaScript module in Dashboard Resources. No Core restart is required.

Add **Room Light Card** in the dashboard card picker. The visual editor supports
adding, renaming, annotating, reordering and removing individual controls.

```yaml
type: custom:room-light-card
name: Living Room
entities:
  - entity: switch.living_room_main
    name: Main
  - entity: switch.common_area_ambient
    name: Ambient
    icon: mdi:led-strip-variant
    note: Living Room + Corridor
```

The same shared ambient entity may appear in the Corridor card. Both controls
reflect and command that same entity, not separate room-specific copies.

## Behavior

- **Room off** addresses only the explicit entity list. It never searches areas
  or automatically includes outlets, heaters or appliance lights.
- Opening, rendering and editing the card send no service calls.
- Wall-button changes and automations appear through normal Home Assistant
  state updates. Synchronization remains owned by the existing integration.
- Each row uses explicit `turn_on` / `turn_off`. Rapid successive presses can
  supersede an outstanding request; the UI does not lock during relay feedback.
- The UI shows reported state. Service acceptance alone is not confirmation;
  pending requests expire visibly after 10 seconds. Unknown and unavailable
  states remain distinct from off. An unknown but present entity can still
  receive explicit commands; missing and unavailable entities cannot.
- Switch Link partial-load and out-of-sync attributes are shown when present.
- Compatible light entities expose brightness, Kelvin temperature and RGB color
  settings. Switches never receive dimming or color commands. Kelvin controls
  use the entity's actual reported limits.
- The lamp icon and name open Home Assistant's entity information dialog.
- English and Russian interface strings follow the Home Assistant language.
  User-defined names and notes are preserved as entered. HA themes are inherited.

`entities` accepts entity ID strings or objects with `entity`, `name`, `icon`
and `note`. `name` and `icon` also customize the card header.
Set `show_all_off: false` to omit the room-off command.

The card contains no schedules, relinking rules, entity discovery or separate
automation engine. Independent control of loads already linked together must
be configured in the owning integration, not inferred by the dashboard.

## Development

```sh
npm ci
npm test
npm run build
npm run check
```

Open `preview/index.html` locally for an isolated interactive demonstration.
The preview emulates Home Assistant and never connects to a real server.
Use Playwright for shared-state, service routing, error, editor, mobile and
dark-theme checks. Production output is `dist/ha-room-light-card.js` and is
self-contained; it needs no runtime CDN requests.

Home Assistant custom-card API:
https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/
