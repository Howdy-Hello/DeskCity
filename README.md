# DeskCity

A tiny pixel town that lives on your desktop. Stick people go to work, cook, shop, watch TV and sleep on your real clock, climb up and sit on your open windows, and their town slowly grows from a few cottages into a city of towers.

Runs on macOS and Windows. Built with [Tauri](https://tauri.app), so the app is only a few MB. See [DESIGN.md](DESIGN.md) for how it all works.

## Run it

You need [Node.js](https://nodejs.org) and [Rust](https://rustup.rs).

```bash
npm install
npm run dev
```

Quit it from the Dock, or the tray / menu bar icon (the town itself lets clicks pass through). The town saves itself every 30 seconds.

## Settings

Press **Control+Option+D** (Ctrl+Alt+D on Windows), click DeskCity's Dock icon, or pick Settings… from the tray menu. While it's open the town comes up above your windows; press the shortcut again, Esc, or click anywhere else to close.

- **Town time**: nudge the clock by 10 minutes or an hour, or match it back to the real clock.
- **Length of a day**: from 24 hours (real time) down to 1 hour, so a whole town day can go by in an hour.
- **Saved towns**: three save slots. Save keeps the whole town plus its time and day length; Load brings it back. The town also saves itself automatically every 30 seconds.
- **Start a new town**: click twice to confirm. Your save slots are kept.

## Build installers

```bash
npm run build
```

Or push a version tag and GitHub Actions builds the Mac and Windows installers into a draft release:

```bash
git tag v0.1.0 && git push --tags
```

## Where things are

- `src/furniture.js`: every piece of furniture and wall decoration, and which rooms get what.
- `src/buildings.js`: building types and sizes, room layouts, the three drawing layers, stairs and elevators.
- `src/stickman.js`: the stick figure's skeleton and all its animations.
- `src/people.js`: daily routines, getting around, and climbing on your windows.
- `src/city.js`: who lives and works where, how the town grows, saving.
- `src/settings.js`: the town clock and the settings panel.
- `src/main.js`: the main loop and drawing order.
- `src-tauri/src/`: the transparent desktop-layer window, the tray menu, and reading your other windows' positions.

## Roadmap

- People roles, starting with construction workers who build and repair
- Socialising: people chatting when they meet
- More places: café, park, arcade
