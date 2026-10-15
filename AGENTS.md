# Room Light Card

This repository owns the frontend bundle. Publish releases and install through
HACS; never patch the installed Home Assistant copy. The card is a view over
explicit public lighting entities, not a synchronization or automation engine.

Use logical Switch Link entities, Unified Device controls, or light entities in
home configurations. Do not discover entities by area or include outlets and
heaters automatically. Shared lighting may be displayed in multiple rooms but
must retain the same entity ID. Never command physical load or indicator relays
behind an existing logical entity.

Opening, rendering, editing or refreshing this card must not send commands.
Unknown and unavailable are not off. Pending commands are not confirmations.
Never block a new user command while waiting for earlier relay feedback.

Run npm test, npm run build and npm run check. Verify the isolated preview with
Playwright at desktop/mobile sizes, light/dark themes, rapid clicks, offline and
partial-load states. Real device commands require separate user permission.
Keep home-specific mappings, credentials and host addresses out of this repo.
