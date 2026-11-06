# Wander

A free, mostly-offline pocket walking-adventure app. Hit **GO!**, get a random walkable destination about 15 minutes away, walk there and back, and collect geotagged photos, voice notes and journal entries in a retro pixel-game journal, with your own pixel character walking the map.

Live: https://wander-boo.vercel.app

## What it does

Five tabs: **Today · Journal · Camera (raised center button) · Map · Profile**.

- **Today**: the GO! flow. Picks a random destination from GPS or a typed start address. The walk time is set with the - / + buttons (5 min steps) or by typing a number (10-120 min total, out and back; default 30, so 15 each way), at 5.5 km/h by default, routed to within about a sixth of the time each way. Routes use a free foot router; if routing is unavailable it falls back to cached routes, then a straight line. Any number of walks per day; re-roll freely until "Start walk". **ENTER AN ADDRESS** (small button on the GO! screen) searches OpenStreetMap as she types, previews the route on the map and walks her to that place; her last 5 places are kept for one-tap reuse (offline they give a straight-line estimate). Flow: planned, walking out, arrived, walking back, quest clear. CANCEL (planned) and CANCEL WALK (while walking) discard the walk and return to GO!; photos and voice notes already taken stay in the journal. **END HERE** (while walking out) ends the trip where she is: that spot is logged (an E pin), the route is cut to it and only the distance actually walked is counted. At the checkpoint, END WALK counts the way out plus however much of the way back she actually walked (so a ride home counts as one way). After a walk, NEW WALK starts another. While walking, a progress strip shows distance and minutes left (out and back), and the map follows your character.
- **Camera button (anytime)**: opens the native camera from any tab and geotags the photo. It attaches to the walk only while walking (out or at the checkpoint); otherwise it is a standalone photo for today. A small mic button beside it records a quick voice note (2-minute cap, no transcription).
- **Journal**: day-by-day list, sorted by the time on each item. **+ ADD** creates a manual entry with a date/time she sets, a note, photos (library or camera), a voice note and a location (my spot, tap the map, or none). Entries can be edited and deleted. Tap a day to see it on the map.
- **Map**: full-screen map with walk trails, photo/voice pins and entry pins (entries without a location are not shown). Tap a pin to open it. Filters: all, a specific walk, or a date range. Your live position is your character.
- **Profile**: name, the **character creator**, and settings.
  - Character: 8 one-tap presets, female/male build, 10 hair styles, 4 tops (tee, long sleeve, tank, hoodie), 4 bottoms (pants, shorts, skirt, dress), glasses, and a beanie/cap/bow. Every part has preset swatches, a hex field and a pixel colour wheel (hue ring + saturation/brightness square). Animated preview.
  - The character is drawn on the Today and Map screens. The 4-frame walk animation runs only during an active walk while she is actually moving (otherwise a static pose); it faces left or right by heading and glides smoothly between GPS fixes.
  - Settings: start address, pace, "Save map area", "Prepare 2 weeks", backup.
- **Offline**: a service worker caches the app; "Save map area" stores ~3 km of OSM tiles (~20 MB); "Prepare 2 weeks" banks 14 verified routes.
- **Data**: everything lives on-device in IndexedDB. Export/Import backs up walks, entries, photos/voice notes, settings and the character.
- **Look**: pastel baby pink and blue, white, black pixel outlines (3px); a fine pixel font (Tiny5) for headings and Pixelify Sans for text; pixel icons and character; blue-tinted map.
- **Cost**: free services only (OSM tiles, Nominatim, routing.openstreetmap.de, Vercel hobby).

## Tech

Single-file PWA (`app/index.src.html`) with Leaflet 1.9.4, IndexedDB (`walks`, `media`, `entries`, `bank`, `kv`; DB version 2), Geolocation, MediaRecorder + Wake Lock, canvas downscaling. The character is a code-drawn pixel sprite (layered, recoloured per part, rendered as crisp SVG).
`app/build.js` inlines Leaflet, fonts and CSS into `public/index.html`, generates PNG icons, and copies `app/static/` (service worker, manifest). Bump the cache name in `app/static/sw.js` when you ship a release (currently `wander-app-v6`).

## Build and deploy

```
cd app && npm install && npm run build   # outputs app/public/
```
Deployed to Vercel project `wander-boo` (static; root directory `app`, build command `node build.js`, output dir `public`). Deploys are made from this repo's `main` branch commit with the Vercel connector's `create_deployment`.

## Tests

Playwright flow tests (iPhone emulation, mocked tiles and routing). Serve the build, then run from a scratch directory (they write screenshots to the current directory):

```
(cd app/public && python3 -m http.server 8765) &
node test/run2.js   # core flow, tabs, map filters, camera, profile name (needs python3 + PIL for the mock tile)
node test/run3.js   # DB v1 -> v2 upgrade, camera anywhere, quick voice note, manual entries
node test/run4.js   # colour wheel, walking character, progress strip, backup restore
node test/run5.js   # cancel a walk (planned, walking, checkpoint), photos kept
node test/run6.js   # presets, male/female, hair, tops, bottoms, glasses, hats
node test/run7.js   # walk to an address: search, preview, recents, offline
node test/run8.js   # walk time picker, several walks a day, end early, ride back, stats
```

## Known gaps

Not yet tested on a real phone (iOS Safari, real camera/mic, live routing/tiles). Likely rough spots: iOS `datetime-local` picker, the photo-library/camera chooser, mic permission, colour-wheel touch dragging, and GPS smoothness/heading flips outdoors. The Journal/Settings tab failure reported earlier could not be reproduced (the tabs have since been rebuilt); on-screen error toasts reveal the cause if it happens again.

## Plan

[docs/PLAN.md](docs/PLAN.md) has been implemented in full (tabs, camera anywhere, manual entries, Map tab, live walking mode, character creator, DB v2). Added since: finer pixels, cancel walk, creator presets/options, walk to an address, several walks per day, real walked-distance stats, end early, and a free walk-time picker. Planned next: removing past walks from the Journal; then whatever real-phone testing turns up.
