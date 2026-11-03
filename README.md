# Wander

A free, mostly-offline pocket walking-adventure app. Hit **GO!**, get a random walkable destination about 15 minutes away, walk there and back, and collect geotagged photos and voice notes in a retro pixel-game journal.

Live: https://wander-boo.vercel.app

## What it does

- **Go button**: picks a random destination around 15 min (±2.5) away at 5.5 km/h, within 3 km, from GPS or a typed address. Routes use a free foot router; if routing is unavailable it falls back to cached routes, then a straight line.
- **One walk per day**: re-roll freely until "Start walk". Flow: planned, walking out, arrived, walking back, quest clear.
- **Capture on the way**: photos (native camera, downscaled) and voice notes (2-minute cap, no transcription), each geotagged.
- **Journal**: day-by-day list plus a map of pins; tap a pin to view the photo or play the note.
- **Offline**: service worker caches the app; "Save map area" stores ~3 km of OSM tiles (~20 MB); "Prepare 2 weeks" banks 14 verified routes.
- **Data**: everything lives on-device in IndexedDB; Export/Import for backup.
- **Look**: pastel baby pink and blue, white, black pixel outlines; pixel fonts and icons; blue-tinted map.
- **Cost**: free services only (OSM tiles, Nominatim, routing.openstreetmap.de, Vercel hobby).

## Tech

Single-file PWA (`app/index.src.html`) with Leaflet 1.9.4, IndexedDB (`walks`, `media`, `bank`, `kv`), Geolocation, MediaRecorder + Wake Lock, canvas downscaling.
`app/build.js` inlines Leaflet, fonts and CSS into `public/index.html`, generates PNG icons, and copies `app/static/` (service worker, manifest).

## Build and deploy

```
cd app && npm install && npm run build   # outputs app/public/
```
Deployed to Vercel project `wander-boo` (static, output dir `public`, build command `node build.js`).
Tests: `test/run2.js` is a Playwright flow test with mocked tiles and routing.

## Known gaps

Not yet tested on a real phone (iOS Safari, real camera/mic, live routing/tiles). Journal/Settings tab failure reported earlier could not be reproduced; on-screen error toasts were added to reveal the cause.

## Next up

See [docs/PLAN.md](docs/PLAN.md).
