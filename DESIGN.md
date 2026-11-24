# DeskCity design notes

## Chapter 0: living on your desktop

- The town is one transparent window covering the screen between the menu bar and the Dock (taskbar on Windows). It sits on the **desktop layer**: under every app window, above the wallpaper, on every Space. Clicks pass straight through.
- Four times a second the app reads where your other windows are (position and size only, never their contents, so no Screen Recording permission is needed). People react to them:
  - **Climb**: in their free time, someone walks to the side of a window that reaches down to the ground and climbs up it.
  - **Hang out on top**: they walk along the window's top edge, sit with their legs dangling over it, then jump off the end.
  - **Ride along**: drag a window and anyone on it moves with it.
  - **Fall**: close, minimise or pull a window out from under them and they fall, flailing, then land on the ground or another window.
- Anything behind a window is hidden by it, like objects on a real desk. Buildings stand on the bottom edge of the screen.

## The stick figure

A jointed skeleton (hips, knees, shoulders, elbows, head), about 19 points tall (just under door height), drawn pixel by pixel. Every animation is a target pose, and the figure blends smoothly toward it, so changes between actions are never instant.

Animations: walk (knees and elbows bend), stairs, idle breathing, idle fidgets (stretch, scratch head, look around, check watch), waiting with arms crossed and a tapping foot, sit, type, eat, watch TV, toilet, bath, chat, cook (stirring), wash dishes, open the fridge, wash hands, shower, get coffee, browse shelves (reach high, bend low), pay, climb, sit on a ledge, fall, land (crouch), sleep (lying down under a blanket, with Z's).

## Chapter 1: buildings

### Three layers

| Layer | What it is | Drawn |
|---|---|---|
| 1. Exterior | Walls (siding, brick, stucco, panels, glass), windows lined up with the rooms behind them, door, roof, shop signs and awnings | On top. Fades away while anyone is inside, so you can watch them |
| 2. Interior | Rooms and wallpaper, floors, outer walls, the stairwell and elevator shaft, all furniture | Underneath |
| 3. Details | Pictures, clocks, shelves, mirrors, towels, whiteboards, posters, windows with curtains, ceiling lamps, doorways, stair handrails, elevator doors, floor numbers | Over the walls, under the furniture |

### Growth

The town grows with its population (see `GROWTH` in `src/city.js`):

- A newcomer walks in from the edge of the screen about **once an hour** while there is a free bed.
- When the beds run out, the town builds: first it upgrades the smallest home if the population calls for a bigger kind, otherwise it builds on an empty lot. When every lot is taken, it builds upward instead.
- Offices grow when people lack desks; shops grow at 25 people and a second one opens at 45.
- One building site at a time, **30 minutes per storey**, shown with scaffolding rising. During an upgrade the old building stays in use until the new one is finished. Later, construction workers will do this work.

| Type | Tiers (floors) | Holds |
|---|---|---|
| Home | Cottage (1) → House (2, stairs) → Apartments (5, stairs) → Condo Tower (11, elevator) | 2 → 3 → 8 → 20 people |
| Office | Small Office (1) → Office (3, stairs) → Office Tower (12, elevator) | 3 → 8 → 42 desks |
| Shop | Corner Store → Supermarket | — |

### Getting between floors

- **Up to 5 floors: stairs.** A switchback stairwell on the right of the building: between two floors, a gentle flight of 5 steps up to a half landing, then a second flight back the other way. People climb, turn on the landing, and carry on. A guard rail runs round the opening on the top floor.
- **Towers: an elevator.** One car runs in a shaft beside the rooms, with sliding doors and a floor number on every floor. It is both layer 2 (the shaft and moving car) and layer 3 (the doors and numbers).
  - Someone walks to the doors on their floor and presses the call button, then waits with arms crossed.
  - The car serves calls in the direction it is already travelling, like a real lift, so a morning rush becomes one trip up rather than many.
  - When it arrives the doors slide open and stay open while people get on. Riders are visible in the lit car while the doors are open and hidden while they are closed.
  - Ideas for later: a second car in very tall towers, a capacity limit, and service elevators for construction workers.

### Live details (layer 3, redrawn every frame)

- **TVs** (only while someone's on the sofa): a news channel (studio, anchor, globe graphic, red BREAKING band, scrolling ticker, blinking LIVE light) or a streaming app (browse a hero banner and rows of posters, then a letterboxed movie: sunset drive, night city, boat at sea). They change channel every couple of minutes.
- **Office computers** (only while someone's at the desk): spreadsheet, code editor, bar chart, email inbox or a video call. The boss watches stocks; reception shows a bouncing-logo screensaver.
- **Wall clocks** show the town time with moving hands.
- **Lights** (after dark lit rooms glow warm, the rest go dark; outsides darken too). Homes remember every switch:
  - People switch a light on when they go into a dark room to do something, but rarely when just passing through.
  - Leaving a room, each person follows their habit: careful (45% of people) almost always switch off, average (40%) usually, forgetful (15%) often don't. Kitchens and bathrooms get left on most, and people are more careful when leaving home than when going to another room.
  - Going to bed, most switch off; some fall asleep with it on (3% / 8% / 25% by habit). About 15% of homes keep a bathroom night light on overnight.
  - Forgotten lights stay on until someone next passes through, even all day.
  - Lobbies, reception, stairwells and lifts are always lit. Offices are lit 7:30am–7pm, then the cleaners switch most off by 10pm and about a fifth of rooms stay lit all night; office washrooms use motion sensors. Shops are lit while open (7am–10pm).
  - Sources: Lutron/Harris household survey (kitchens 49%, bathrooms 28% most often left on), YouGov for Smart Energy GB (38% plan to come back, 29% forget), YouGov sleep study (8% sleep with a light on), WPI study of London offices lit at night.
- **Appliances**: flames and steam while cooking, the fridge door and light open, shower water, running taps, coffee steam, bubbles in the water cooler, bath water.
- **Elevator**: a light shows which floor the car is on, and arrows show which way it's going.

### Rooms and furniture

Each room lists its furniture in priority order: the essentials are placed first, and extras only if the room is wide enough. Bigger buildings get roomier rooms, so they get more furniture automatically. All of it is in `src/furniture.js`.

| Room | Furniture (essentials first) | Wall details |
|---|---|---|
| Bedroom | Bed (double or single), nightstand with lamp, wardrobe, dresser, plant | Window with curtains, picture, clock |
| Kitchen | Fridge, stove with pot and hood, dining table and chairs, sink counter with wall cabinets, plant | Window, clock, shelf |
| Living room | Sofa, TV on a stand (flickers while watched), bookshelf, armchair, floor lamp, plant | Window, picture, shelf |
| Washroom | Toilet, sink with mirror, shower (bathtub in wide rooms) | Small window, towel rail |
| Lobby | Bench, plants | Mailboxes, picture |
| Office desks | Workstations (desk, office chair, monitor, keyboard, drawers), filing cabinet, printer, plant | Whiteboard, clock |
| Boss office | Executive desk with leather chair, banker's lamp and guest chair, bookshelf, plant | Certificates, picture |
| Common space | Coffee counter with microwave, lunch table, fridge, water cooler, vending machine | Poster, clock |
| Meeting room | Conference table with chairs, plants | Whiteboard, screen |
| Reception | Reception desk, waiting couch, plant | Company logo, clock |
| Office washroom | Two toilets, two sinks | Mirrors, towel rail |
| Store | Checkout counter with register and belt, shelving aisles of products, glass-door drink fridges, produce crates, basket stack | SALE and OPEN signs |

These lists follow standard room-by-room furnishing checklists from furniture retailers, office fit-out guides (workstations, executive office, break room, reception, conference room), and convenience-store fixture lists (gondola shelving, checkout counter, reach-in coolers).

Sources: [Macy's essential furniture guide](https://macys.com/ce/essential-home-furniture-layout-ideas/types-of-furniture), [Raymour & Flanigan furnishing checklist](https://www.raymourflanigan.com/blog/expertise/guides/our-furnishing-a-new-home-checklist), [Stamford Office Furniture build-out checklist](https://stamfordofficefurniture.com/?p=17848), [Branch office setup guide](https://www.branchfurniture.com/blogs/turn-key/how-to-set-up-an-office-guide), [KaTom convenience store equipment list](https://www.katom.com/learning-center/convenience-store-equipment-list.html).

### A day in town

Sleep at 11pm. Wake around 6:45 (toilet, shower, wash). Breakfast, then work 9 to 5, with lunch in the office break room and sometimes an afternoon coffee. After work: some evenings shopping (browse aisles, pay at the checkout), cooking (fridge, then stove), dinner, TV, and some evenings climbing your windows. Everyone's times shift a little so the town doesn't move in lockstep. People without a job yet relax at home or go exploring.

## Testing in a browser

Serve the `src` folder (for example `python3 -m http.server -d src`) and add options to the address:

- `?hour=19`: start at 7pm
- `?speed=60`: run the clock 60x faster
- `?city=40`: grow instantly to about 40 people
- `?fakewin`: two pretend app windows (one slides back and forth)
- `?zoom=3`: bigger pixels

Any option means a test run, which never touches your saved town. In the browser console, `advance(60)` runs the town a minute forward right away.
