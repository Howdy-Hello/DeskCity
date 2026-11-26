# DeskCity

A tiny pixel town that lives on your desktop. Families, couples, roommates and people living alone go to work and school, cook, shop, eat out, go to the pub, exercise and sleep, each on their own routine through the week; they climb up and sit on your open windows; and their town slowly grows from a few cottages into a city of towers, with a school, restaurants, a pub, a hospital, fire and police stations, and maybe a factory the town ends up protesting.

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

- **Town time**: the day of the week and the time; nudge the clock by 10 minutes or an hour, or match it back to the real clock.
- **Length of a day**: from 24 hours (real time) down to 1 hour, so a whole town day can go by in an hour.
- **Potato mode**: for slower computers. Desktops you're not looking at redraw twice a second instead of 30 times, and decorative light (sunbeams, shadows, window halos) is switched off. Everything else is the same.
- **Speech bubbles**: what people say to each other (and think to themselves) over their heads. On by default.
- **Passports**: OPEN shows someone's passport. While any panel's open you can also just click anyone in town. It shows their name, age and birthday, household, job, what they're doing, their needs (energy, food, fun, social, hygiene, health) and mood, a calendar of their week, today's to-do list and work, the people they know, and their diary.
- **Saved towns**: three save slots. Save keeps the whole town plus its time and day length; Load brings it back. The town also saves itself automatically every 30 seconds.
- **Start a new town**: click twice to confirm. Your save slots are kept.
- **DEV** (top right): the developer's panel: speed everything up (or pause), x-ray, labels and stats overlays, jump the time, make things happen (move-ins, fires, thefts, fights, flu, ambulances, protests, a chat, an argument, gossip, a phone call) and the town's numbers.

## Build installers

On a Mac, to build and install it in Applications (and remove the build's own copy, so only one DeskCity app shows up in Spotlight and Launchpad):

```bash
./scripts/install-mac.sh
```

For installers:

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
- `src/routine.js`: the week, everyone's habits, job shifts, and each person's plan for the day.
- `src/people.js`: getting around (at their own pace), doing things, and climbing on your windows.
- `src/venues.js`: restaurants, cafes and pubs: ordering, cooking, serving, eating and drinking.
- `src/incidents.js`: fires, crime, illness, the emergency services, pollution and protests.
- `src/social.js`: speech bubbles and their pixel icons, conversations, friendships and moods.
- `src/life.js`: names, ages and birthdays, needs, the diary, the work people get through, and the passport card.
- `src/passport.js`: the passport panel, and picking people out in town.
- `src/city.js`: who lives and works where, how the town grows, saving.
- `src/settings.js`: the town clock and the settings panel.
- `src/devpanel.js`: the developer's panel.
- `src/main.js`: the main loop and drawing order.
- `src-tauri/src/`: the transparent desktop-layer window, the tray menu, and reading your other windows' positions.

## Roadmap

- People roles, starting with construction workers who build and repair
- More places: park, arcade, library
