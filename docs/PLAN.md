# Next-version plan

## 1. Navigation (5 tabs)
Today · Journal · Camera (raised center button) · Map · Profile. Today stays home with the GO! flow. Options becomes Profile.

## 2. Camera button (anytime)
- Opens native camera, geotags from current GPS.
- During a walk the photo attaches to that walk; otherwise it saves as a standalone entry for today.
- Quick "add voice note" option beside it.

## 3. Journal with manual entries
- "+" opens a form: date/time picker, note text, optional photos or voice note, location (my location, tap the map, or none).
- Lets her log after the walk or on another day. Editable and deletable; sorted by the time she sets.
- Journal keeps the list; the big map moves to the Map tab.

## 4. Map tab
- Full-screen map with all pins and live position shown as the character.
- Tap a pin to open photo, voice note or entry.
- Filters: all, a specific walk, or a date range.

## 5. Live walking mode
- During an active walk the character appears at the GPS position and walks along the route.
- 4-frame walk cycle, faces left or right by heading, position smoothed between GPS updates.
- Progress strip with distance and time left.

## 6. Profile and character creator
- Top: name and character creator with animated live preview.
- Parts: skin tone, hair style and color, shirt, pants/skirt/dress, shoes.
- Custom pixel-styled color wheel (hue ring plus saturation/brightness square), hex field, preset swatches.
- Layered pixel bitmaps recolored per part; saved character used on Map and Today.
- Settings below: start address, pace, save map area, prepare 2 weeks, backup.

## 7. Under the hood
- DB upgrade (version bump) to support entries not tied to a walk; keep existing data.
- Backup/restore includes entries and the character.
- Bump service worker cache version.

## 8. Build order
1. Tab bar, Map tab, Profile shell.
2. Camera anywhere, then manual journal entries.
3. Character creator, walking character, live mode.
4. Test, deploy, fix.

## Defaults
4 hair styles; 3 outfit types (pants, skirt, dress); walking animation only during an active walk (static pose elsewhere); entries without a location don't appear on the map.

## Risks
Cannot test on a real phone from the dev sandbox; GPS smoothness and iOS camera/color-input behavior are the likely rough spots.
