# DeskCity design notes

## Chapter 0: living on your desktop

- **One long street across your desktops.** Each macOS desktop (Space) shows the next stretch of the same town: desktop 1 is the first neighbourhood, desktop 2 the next, and people walk between them. Full-screen apps get no town. On a narrower screen, plots move on to the next desktop instead of disappearing. (Windows virtual desktops aren't supported yet: one stretch of street.)
- **Sun and moon.** DeskCity keeps Beijing time in midsummer (39.9 N, 116.4 E, UTC+8): the sun rises on the left at about 4:51, is highest (73 degrees up) at about 12:16 and sets on the right at about 19:41, then passes behind the street at night; the moon is always opposite and shows its real phase for the date. Both travel a loop just outside the screen's edges and only a little of each (small) disc peeks in. Dusk and dawn follow the sun's real height: it's dark from about 8:30pm to 4:15am. They can be hidden in the settings panel (SUN AND MOON), remembered in `deskcity-prefs`. See `src/sky.js`.
- **Sunlight and moonlight.** Light is aimed from where the sun (or moon) actually is on the screen, so every window gets its own angle and the light moves as the sun crosses the sky: steep and short when it's high, long and golden when it's low. Side windows (in the end walls, into the end rooms and the stairwell) throw shafts across the room; back windows throw a shaft down to the floor; front windows (in the wall that's cut away) throw a window-shaped patch onto the back wall. Each lights a patch of floor and anyone in it, with dust drifting in the shaft. A building between a window and the sun shades it. Indoors is a little dimmer than outdoors by day, so the light shows. At night the moon does the same, faint and blue, as bright as its phase allows. Outside, the wall facing the sun catches the light, sunrise and sunset wash the buildings warm, and buildings cast long shadows along the pavement, away from the sun. See `src/sunlight.js`.
- **Curtains.** Homes' windows have curtains that people draw by hand: most draw them after dark once the light is on (careful people nearly always, forgetful ones about half the time), close the bedroom curtains before going to sleep, and open them again in the morning. Drawn curtains stop the sun through every window of the room (only a warm glow comes through the fabric) and dim the room; from outside the curtain fabric shows in the window, glowing softly at night if the light is on behind it. Bathrooms have frosted glass, and offices keep their blinds as they are.
- **Streetscape.** Round trees, pines or bushes fill the gaps between buildings, with a lamp post (a warm pool of light after dark) on every other gap and the odd hydrant. Empty plots become small pocket parks with trees, bushes, a flower bed, a bench and a lamp. All of it is placed by position, so it never shuffles. See `src/streetscape.js`.
- **Neighbouring houses differ.** Each building picks its own siding or brick colour, trim, shutters, flower boxes, door colour, porch roof, roof shingle colour, chimney side and dormer; flat roofs may get solar panels or a roof garden.
- **Every desktop is live at once.** Each desktop has its own town window, pinned to it (private CoreGraphics calls, the same ones window managers use), so macOS slides the right stretch of street in and out with its own animation and nothing changes when you switch. One window (the leader) runs the town; it sends every frame (people, cars, lights, doors, boxes, lifts) to the others over a BroadcastChannel, and the whole town whenever the buildings change; each of them draws its own stretch. Windows come and go as you add or remove desktops. The settings panel opens on the desktop you're looking at. The app keeps every window drawing while covered (App Nap and WebKit's occlusion throttling are off). See `src/sync.js`.
- **Resizing the Dock** moves the street, and everything on it (parked and moving cars, delivery drivers, people outside) moves with it.
- **The street.** The town window reaches the bottom of the screen; buildings stand on a sidewalk at the top of the Dock / taskbar, with a road running underneath it.
- **Saved layouts.** Each building's room plan is saved with the town, so future updates never reshuffle an existing town.

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

### Growth: a real estate company

**SUNRISE HOMES** decides what gets built, to make money (see `REALTY` in `src/city.js`):
- It starts with $2.5M and a $15M credit line from the bank, and the bank lends a further 60% of what its buildings cost (so a growing town can keep borrowing to grow). Building costs range from $120K for a cottage to $3.6M for a residential tower. The town pays for its own school, fire station, police station and hospital.
- It earns by selling cottages, houses and condo flats (their share of the cost × 1.35) when a household moves in, and by daily rent: $300 per occupied apartment, an $80 service charge per condo flat, $120 per occupied office desk, $1,500 per shop, $1,200 per restaurant, $900 per pub, $2,500 for a factory.
- It only builds when there's demand: offices when people lack jobs, homes when house hunters can't find a vacant one that suits them. If something can't be built (no room, too tall), it moves on to the next thing rather than waiting. If every plot is taken, it rebuilds the smallest building bigger, as tall as the screen allows. When people want homes and every home is already as tall as it can be, it buys a building the town can spare (a second shop, or an office when there are plenty of jobs without it) and builds homes there. When there's truly nowhere left (every plot built up as far as it goes), the settings panel says TOWN FULL: ADD A DESKTOP TO GROW: each extra desktop is another stretch of street with room for more. A household's moving van waits at most two hours for the kerb to be cleared. Its banner hangs on every building site; its cash, vacant homes and house hunters show in the settings panel.
- **House hunters:** a household (1–3 people) starts looking for a home in town about every 1.5 hours.
- **Moving in:** only a whole empty home is offered, never a spare bed. Vacant homes get a FOR SALE or FOR RENT sign. A household signs for one and moves in half an hour to two hours later, during the day (8am–7pm), in its own car: a hatchback, SUV or pickup (which then stays as the household's car), or a rented MOVEZ van with its driver for bigger families. They park, stack their things on the kerb behind the car (neat stacks, biggest box at the bottom, at most three high, growing away from the car), and carry everything in: their own furniture (about half of what the home needs), set up in 4 minutes, and moving boxes unpacked in the bedroom (3 minutes each). Whatever they didn't bring is ordered for delivery. Newcomers take the day off: they stay home until the delivery truck has been and keep unpacking until it's done. Shared lobbies and hallways come furnished by the developer.

| Type | Tiers (floors) | Holds || Type | Tiers (floors) | Holds |
|---|---|---|
| Home | Cottage (1) → House (2, stairs) → Apartments (3–6, stairs) → Condo Tower (10–12, elevator) → Residential Tower (13–16, elevator) | 2 → 3 → 5–13 → 23–28 → 28–36 beds (on average, by design) |
| Office | Small Office (1) → Office (3, stairs) → Office Tower (11–13, elevator) | 3 → 8 → 43–54 desks (on average, by design) |
| Shop | Corner Store → Supermarket | — |
| Restaurant, Pub, School, Fire Station, Police Station, Hospital, Factory | one size each (see Buildings 2) | |

### Downtown, midtown and the suburbs (see the zones in `src/city.js`)

The town grows out from its **centre**, the plot it was founded on in the middle of the first desktop.
- **Zones.** Downtown is a band of plots either side of the centre, then midtown, then the suburbs. The bands widen as the population passes 20, 45 and 80, and again whenever every plot is built up as far as it may go and people still want homes (at most once every six hours). Downtown never leaves the first desktop; past it, midtown creeps outwards a plot at a time, so further desktops stay mostly houses until the town really needs the room.
- **Each plot has a character**, from where its own random number ranks among its desktop's plots: downtown, 2 in 5 may go **tall** (the lowest-ranked as tall as the screen allows, the rest condo height) and the rest stay **mid-rise**; midtown has the odd tall plot and some low ones; the suburbs the odd mid-rise one. The old town at the centre stays **low**, the first shop's plot mid-rise and the first office's plot tall. So the skyline is jagged, towers beside walk-ups, pubs and the school, rather than one peak in the middle.
- **What a plot may hold.** Tall downtown: residential towers, office towers. Tall elsewhere: condo towers. Mid-rise: apartments and three-floor offices. Low: houses, small offices. Shops: a supermarket anywhere but a tall plot.
- **Where things go.** The developer picks the plot first: one that may be as big as wanted and suits it, nearest the centre. Homes and offices are rebuilt bigger where they stand, so they take the plots that could one day go tall; the restaurant, pub, police and hospital keep off them; the school and the fire station go as far out as they can; the factory right at the edge of town. A house is never bought out to make room if its plot could go tall. Rebuilding starts at the centre.
- **Families** would rather have a house with a garden in the suburbs, while there's room there; everyone else takes a flat nearer the middle.
- **Not too tall.** Nothing goes up past about 60% of the way from the street to the top of the screen (a laptop gets 13–14 floor towers; the 16-floor residential tower needs a tall screen). Towers already standing in older towns stay.
- Older towns keep everything they've built; their centre is the middle plot of the first desktop, and the zones apply to whatever's built from now on.

### Designs (see `src/styles.js`)

Each size of building comes in several designs, picked when it's built: one that suits the zone, fits under the height limit, isn't the same as the building next door, and ideally has walls unlike anything within three plots. A building keeps its design (it's in its saved room plan); buildings from before designs keep their original look.

| Size | Designs (the first is the original) |
|---|---|
| Cottage | Cottage · Bungalow (wide, hipped roof, stone base, porch with a railing; suburbs and midtown) · Modern House (white render and timber cladding, flat roof, picture windows) · Cabin (logs crossing at the corners, steep roof, plank door with a lantern; suburbs) |
| House | House · Townhouse (Georgian: brick, stone quoins, sash windows, pillared door with a fanlight) · Tudor House (brick downstairs, oak beams and white render upstairs, leaded windows; suburbs and midtown) · Modern House |
| Apartments | Apartments (5) · Walk-up (3 floors, brick, fire escape, a stoop) · Riviera (6, pastel render, arched windows with shutters, terracotta roof, balconies; downtown and midtown) · Mansion Block (6, art deco: fluted pilasters, coloured spandrels, black granite ground floor, a stepped crown) |
| Condo Tower | Condo Tower (11) · Glass Condos (12, glass between white floor slabs; downtown) · Brick Tower (10, stone bands, art-deco crown) |
| Residential Tower | Residential Tower (16) · Fin Tower (13, tinted glass behind metal fins, a needle on top; downtown) · Banded Tower (14, ribbon windows over coloured bands) |
| Small Office | Small Office · Studio (brick, striped awnings) · Pavilion (timber and ribbon glazing) |
| Office | Office · Warehouse Lofts (dark brick, steel-framed windows, a faded painted sign with the company's name) · Glass Office |
| Office Tower | Office Tower (12) · Stone Tower (11, limestone, ribbon windows, granite base, heavy cornice) · Black Tower (13, black glass and gold fins, a needle; downtown) |

**Insides.** Each design has its own interior look: paint for its rooms (each picks one), a finish per kind of room, the floor and the ceiling lights. Bungalows are 70s (mustard and olive paint, wood-panelled living rooms, globe lights); modern houses white with a concrete kitchen, a bold accent wall and track lights; cabins log-walled with bare bulbs; townhouses and walk-ups have wainscoting and striped wallpaper with a chandelier in the living room; Tudor houses oak beams; the Riviera Mediterranean pastels and terracotta floors; the mansion block jewel colours with gold trim; brick towers and warehouse lofts exposed brick, concrete floors and bare bulbs; glass buildings white and pale wood; studios bright accent walls; the stone tower panelled offices and navy carpet; the black tower dark wood and slate. Original homes now get a little variety too (each room's paint, and stripes, dots or panelling now and then). Shops, cafes, washrooms and lobbies keep their own colours. In condo and residential towers the residents' gym is on the first floor, straight above the lobby.

### Buildings 1.1

**Homes have different rooms.** Every household gets a kitchen, a bedroom and a washroom, then extras if they fit: a living room (85%), a home office with a gaming/work PC or a laptop (35%), a second bedroom (30%), a home gym with treadmill and weight bench (7%), or a greenhouse with planters and seedlings (6%). Houses put the kitchen and living space downstairs and bedrooms upstairs. About 40% of apartment and condo buildings have balconies (roughly the share of renters who call one a must-have); when a building has them, every flat gets one: a slab hanging off the outside wall with a bracket, railing and bistro set, reached through a glass door.

**Cars and car parks.**
- Vehicles are drawn from a side profile: roofline, window glass with pillars, door seams and handles, wing mirrors, bumpers, head- and tail lights, shaded sills, dark wheel arches, and wheels whose hubs turn as they roll. A hatchback is 30 cells long and 13 high next to a 19-cell person.
- Whoever is inside shows in the windows: the driver at the front, passengers behind.
- A vehicle never drives backwards. If where it's going is behind it, it stops and turns round (seen head-on for a moment), then drives off. On ramps it tilts with the slope. After dark the headlights light the road ahead.
- Delivery vans and moving cars come in from the end of the street they're facing and drive on out the other end.
- About half the households own a car. People walk most of the time and drive now and then: about 3 in 10 trips to work and half the shopping trips, when it's too far to stroll and the car is parked nearby. A car left elsewhere is always driven home.
- Apartments, condo towers and office towers have an underground car park: one level, or two with a switchback ramp, depending on how much room there is under the street (the Dock's height). Bays have pillars, yellow lines and strip lights, and the levels are marked P1 and P2. A blue P sign by the ramp shows the free spaces, or FULL. People walk down the ramp to their car and back up.
- When there's no space underground, cars park at the kerb, preferably in a gap or by an empty plot rather than in front of a building. A car in front of a building fades with the front wall when it is cut away, so it never looks parked in the front room.
- A household whose car is at the kerb moves it into the car park under home as soon as a space is free.

**Furniture is delivered and assembled.**
- New homes come with the built-ins: kitchen appliances, toilet, sink, shower or bath. Everything else is flat-pack.
- A household moving in orders its furniture. A delivery arrives 10–30 minutes later in a van (small orders) or a box truck (big ones), from one of five made-up delivery companies, during delivery hours (7am–10pm), otherwise first thing the next morning. Saves with deliveries or moves booked further out bring them forward when loaded. The driver carries each box to the front door (cottages, houses) or the lobby's parcel shelf (apartments, condos).
- Residents fetch the boxes (after dinner, or during the day if they have no job): a quick squat to lift each one, then carry it home. A carried box stays inside the walls, even on stairs that run along the outside wall. The bed comes first. Putting a flat-pack together goes in stages, done as a string of small moves around the room: kneel by the box and cut the tape (knife); lean into the box for each part and carry it over to lay it by the piece (the parts appear on the floor); read the instructions; kneel at one point along the piece to screw it (screwdriver), hammer now and then, then move along (the piece grows as the parts are used up); stand a tall piece up, or lift and turn a low one; fold the cardboard flat. Their own furniture is set down a little way along the floor, unwrapped from either end, then pushed: it slides across the floor into its place with them leaning into it and stepping along behind (scuff marks behind it), then they look it over from a step back, hand on chin. Moving boxes are opened, then emptied one thing at a time: take it out, carry it somewhere in the room, put it away. Tools are only in hand while they're being used. People pick a seat or spot nobody else is using, and step aside if they end up standing on top of someone. Assembly is quick so nobody lives in an empty flat for long: a double bed 40 minutes, a wardrobe 45, a bookcase 15, small pieces 2–12 minutes. A household is usually fully furnished the evening it moves in. Half-built furniture shows as a ghost filling in from the floor up.
- Older saves are re-stacked neatly on load.
- If the bed isn't ready by bedtime they sleep on the floor. With no table or sofa yet they eat sitting on the floor and scroll their phone.
- After an upgrade, people move into the new building and order new furniture.

**Offices are shared.**
- An office tower has a lobby with a directory board, one common floor somewhere in the middle (a cafeteria and a lounge with a TV), and shared washrooms on every third floor.
- The rest is split between 2–4 companies. Each has its own name plaque on its floors, and its own boss office, HR office and meeting room on its top floor, plus more meeting rooms on desk floors (about one per 10–20 people).
- The city's first tower is the headquarters: one company owns all of it and puts its name on the roof.
- Office washrooms sit at the far end of the floor from the stairs and lift (on the ground floor, just past the entrance room).
- Workers go to meetings, walk (or take the lift) to a washroom on another floor, and take afternoon breaks at the coffee machine or on the lounge couch.

**Routines.** People with a home office work from home about one day in four (US average: 1–1.5 days a week). Evenings may go to gaming, the balcony, the greenhouse or the gym, depending on what the home has.

**Doors.** Every doorway has a door. Closed, it's seen edge-on in the wall, as a real side view would show it; open, it swings out face-on. People open doors by hand: they stop at a shut door, reach for the handle, and it swings open. A few steps past it they shut it behind them, or don't: careful people mostly do, forgetful ones mostly don't, front doors always get shut, bathroom doors nearly always, bedroom doors at bedtime mostly, and nobody shuts a door in someone's face. Doors are shaded at night like the rooms beside them. The door into the stairwell or lift is the household's front door. Offices have frosted-glass doors.

Sources: [TaskRabbit IKEA assembly data](https://www.taskrabbit.com/blog/ikea-furniture-assembly-cost/), [MyBuilder assembly times](https://www.mybuilder.com/handyman/price-guides/ikea-assembly-cost), [Minneapolis Fed on remote work](https://www.minneapolisfed.org/article/2026/is-remote-work-declining-what-the-latest-data-show), [S&P Global on work from home](https://www.spglobal.com/market-intelligence/en/news-insights/articles/2025/5/covid-s-impact-post-pandemic-work-from-home-solidifies-88884214), [WeWork on meeting rooms](https://www.wework.com/ideas/workspace-solutions/how-many-meeting-rooms-do-you-really-need), [Apartments.com renter survey](https://www.apartments.com/blog/apartment-features-renters-want-most).

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
- **Lights** (after dark lit rooms glow warm, the rest go dark; outsides darken too). Every room has a light switch on the wall just inside each way in (its toggle is up when the light is on), and people flip them by hand: they walk to the switch, reach up, and the light changes.
  - Coming into a dark room to stay (to do something there, unpack, put furniture together), people switch the light on; passing through, they don't. Someone already sitting in a room when it gets dark gets up and switches it on. Nobody switches a light on over someone asleep.
  - Everyone has a way with lights. **Cosy** (55%): the rooms they're living in stay lit all evening, until bedtime; they only switch off a room they're done with for the night (the bathroom, a bedroom, the study), and coming home or walking into the living room or kitchen after dark they put the light on even just passing through. **Savers** (27%): off every time they leave a room. **Forgetful** (18%): lights left on all over. Children hardly ever touch the switches (and often fall asleep with theirs on). Coming home after dark, most people put the light on by the door.
  - **Bedtime**: the last one up in the home goes round switching off whatever's still on, on every floor (a child's room too, once they're asleep), then their own light before lying down. Cosy people and savers nearly always; the forgetful miss some. Some fall asleep with the light on (2% / 4% / 25% by habit). About 15% of homes keep a bathroom night light on overnight.
  - **Going out after dark**: the last one out switches off what's on as they go; about 1 in 5 cosy households leave a lamp on in the living room so the place doesn't look empty.
  - **Late evenings**: after about 9:15 some cosy households swap the big light for a lamp (the room goes warm and dimmer, and so does its window), and now and then they switch off to watch a film in the dark by the TV's blue flicker (which shows in the window too).
  - Leaving a room on the way out or to bed, nearly everyone switches off; coming straight back (the plan returns to that room), most leave it on. Forgotten lights stay on until someone switches them off.
  - Light spills a little way into a dark room through an open doorway (not through a shut door). Walls and doors are shaded with the rooms beside them.
  - From outside, lit rooms glow in their windows (with a soft halo, and light on the pavement under ground-floor windows); dark rooms' windows go dark.
  - Offices: the first one onto a floor switches its lights on, and the last one to leave a floor switches them off. Office washrooms use motion sensors. Lobbies and reception stay lit until late; stairwells and lifts are always lit. Shops are lit while open (7am–10pm).
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

### Buildings 2: the rest of a town

The realty company builds these on free plots once the town is big enough, in this order of priority: a restaurant (10 people, unless a cafe under some flats will do), a school (12), a fire station (16), a pub (14), a hospital (20) and a police station (22). New homes leave enough plots free for whatever's still to come and grow upwards instead. When every plot is already taken (an older town), the realty buys a cottage or a house whose household can move straight into a suitable empty home elsewhere, moves them (their furniture is delivered to the new place), and pulls the house down under a SOLD banner to make room. A free plot is one plot; a town spread over several desktops has room for everything. See `GROWTH` in `src/city.js`.

| Building | Inside | Jobs (shifts) |
|---|---|---|
| Restaurant (NOODLES, DUMPLINGS, HOTPOT, PIZZA...) | Dining room (tables for two and a long table for four, the till, the pass under a heat lamp), a kitchen at the back (prep counter, grill, fridge), a washroom | 2 chefs, 2 waiters (10:00-16:30, 16:00-23:30) |
| Pub | Bar with taps, two stools and a back shelf of bottles, high tables, a jukebox, a dartboard | Bartender (15:45-02:15) |
| School | Two floors of classrooms (teacher's desk, chalkboard, little desks), a washroom, and a fenced playground beside it with swings, a slide and a sandbox | 3 teachers (07:30-16:00, school days) |
| Fire station | An engine bay with the fire engine parked in it (it drives out through the side), a crew room with a couch, table and TV, bunk beds upstairs | Firefighters (08:00-20:00, 20:00-08:00) |
| Police station | Front desk, two cells with bars, an office of desks upstairs, a police car at the kerb | Officers (07:00-19:00, 19:00-07:00) |
| Hospital | Emergency room (nurses' desk, waiting chairs, exam bed), wards upstairs (beds, drip stands, heart monitors), a lift, an ambulance at the kerb | Doctors, nurses (12-hour shifts) |
| Factory | One big floor (presses that stamp, a conveyor belt that carries boxes, a workbench, crates) under a sawtooth roof with two chimneys | Workers (06:00-14:00, 14:00-22:00, weekdays) |

- **Lobbies.** A condo tower's lobby has a concierge and security desk (camera monitors showing four grainy views, a brass-trimmed front) staffed by a security guard day and night, parcel lockers, a leather sofa and coffee table, tall palms in big pots, a framed artwork, mailboxes, a doormat and a chandelier. An apartment block's lobby has mailboxes, a noticeboard with notes pinned to it, a bike rack with two bikes, a bench, an umbrella stand, a parcel shelf, plants, a doormat and pendant lamps. Lobbies are lit day and night. Older towns get the new lobbies too (saved furniture is renumbered on loading so nothing upstairs changes).
- **Brick** is laid in a running bond: each course offset by half a brick, soft mortar, bricks a shade lighter or darker than their neighbours, darker corners, a stone band at each floor, and a stone lintel with a keystone over every window.
- **Shops** now have a cashier behind the till (07:00-15:00, 14:30-22:15) who scans while you pay, and a pharmacy shelf (medicine and toiletries) alongside food and drinks. Shoppers queue for the till one behind the other.
- **Mixed use.** About half of new apartment and condo blocks put a mini-mart, a cafe or a pub on the ground floor, with its own shop front, awning, sign and door, next to the residents' lobby (which gets its own door). People use whichever door is nearer to where they're going. The cafe has a barista at the counter.
- **Condo gyms.** About 4 in 10 new condo towers give one floor to a gym for the residents: treadmills, exercise bikes, a weight bench, dumbbells.
- **Child's rooms.** A new home's second bedroom is either a child's room (a single bed, a homework desk, a toy box) or a plain single for a roommate. Homes in older saves keep their rooms.
- **Glass offices** look the same from inside as outside: the back wall is floor-to-ceiling glass on the same 8-cell mullion grid, with the same reflective band, and the sun comes in through all of it.
- **Hiring** spreads people out: every workplace, and each of its shifts, gets someone before any gets a second colleague, so the shop has a cashier and the station a crew before the office fills up.
- **Opening hours.** Shops 7:00-22:00, cafes 7:00-20:00, restaurants 11:00-23:00, pubs 16:00-02:00. They're lit while open; schools and the factory while in use; stations and the hospital all night.

### At work (see `src/venues.js`)

Everyone at work has a post and a handful of chores for the quiet moments, and anything that needs doing (a customer at the till, an order up, a patient on the exam bed) comes first. Staff at a counter stand behind it: the counter is drawn in front of them, and customers in front of it.

| Job | At their post | In between |
|---|---|---|
| Cashier | Behind the till: scanning while someone pays, counting the till | Restocking shelves from a carton (top shelf and bottom), sweeping, straightening the produce |
| Waiter | Taking orders on a pad, carrying plates out at shoulder height, ringing up the bill at the till | Clearing plates from tables people have left (the empty plates stay until then), wiping tables, polishing cutlery, asking diners if everything's all right |
| Chef | Cooking and tossing the pan at the grill while orders are on, chopping at the prep counter | Fetching from the fridge, washing up, wiping down, tasting |
| Barista | Pulling coffees behind the counter | Polishing cups, wiping the counter |
| Bartender | Behind the bar: pouring at the taps or shaking a cocktail, handing it over the counter (or carrying it to a table) | Polishing glasses, wiping the bar, restocking the back shelf, chatting to whoever's on a stool |
| Teacher | Teaching at the board, writing on it with chalk, helping a child at their desk, reading to the class | Marking at the desk, tidying the bookshelf when the room's empty; watching the playground at break |
| Doctor | Examining whoever's on the exam bed | Ward rounds (checking each patient, writing notes), notes at the nurses' desk |
| Nurse | Behind the nurses' desk, or at the medicine cart on a ward | Checking drips, seeing patients, talking to people in the waiting room |
| Police officer | At a desk (typing, on the phone), or behind the front desk | The filing cabinet, the coffee machine, a look out of the window |
| Firefighter | The couch (TV) or the table (talking, eating) | Polishing the engine, checking kit on the rack, coffee, stretching; sleeping in the bunks on a night shift |
| Factory worker | The press, the belt (picking and placing), the workbench (screwdriver, hammer) | Fetching crates for the line, checking the line with a clipboard |
| Security guard | Behind the lobby desk watching the cameras | Greeting residents coming in and out with a nod and a wave, a look out of the front door, a walk to the lift, tidying the parcels |

### Things going wrong (see `src/incidents.js`)

- **Fires.** About 1 meal in 80 burns (smoke, the alarm goes off) and about 1 in 250 catches fire. The alarm rings and a red light flashes in every room and over the door. Everyone inside is expected to get out and wait on the pavement, watching, until it stops; about 1 in 8 adults can't be bothered and carry on. Whoever was cooking may grab the extinguisher first (and sometimes burns a hand). Anyone coming home waits outside too. If the town has a fire station, the crew on duty run down to the engine, which comes out of its bay with its lights flashing, parks outside, and the crew go in with the hose (or check it was only smoke), reset the alarm and drive back. With no station, the sprinklers deal with it. A real fire leaves black marks on the wall for two days, and smoke pours from the building while it burns.
- **Shoplifting.** About 1 in 14 people are tempted now and then: they pocket something, skip the till and run. A cashier who sees it phones the police.
- **Pub fights.** Someone with a temper and a few drinks in them may start a fight with whoever's next to them: they trade punches until it breaks up, the bartender phones the police, and both go home. The one who got hit sometimes needs the ambulance.
- **Police.** The officer on duty walks out to the car and drives (lights flashing) to wherever the culprit is now, fetches them out, cuffs them, drives them back and puts them in a cell for 2 to 5 hours. With no station, or nobody on duty, they get away with it.
- **Illness.** About 1 in 60 people fall ill each day (children a bit more): mostly a cold, so they stay home in bed or on the sofa, off work or school, walking slowly with a sniffle; with the flu they go to the hospital's clinic first, wait in the waiting room until the doctor's free, get examined, and go home to rest; now and then it's serious and they're kept in a ward bed for a day or two.
- **The ambulance.** For someone hurt (in a fight, or burnt cooking), the nurse on duty drives over with the lights on, waits at the door, helps them in, and they're kept in a ward bed for a few hours.
- **Pollution and protest.** A working factory puts smoke out of its chimneys and the air gets worse: a brown haze creeps over the sky. Once a day everyone gets a little more fed up, more so the nearer they live and the more they mind smoke, much less if they work there. When at least 3 people (and 3 in 10 adults) have had enough, they protest outside the factory with placards (NO, AIR, STOP, SMOG), waving and chanting: after work on a weekday, the afternoon at weekends. After the third protest the town closes the factory (its workers lose their jobs and look for new ones) and pulls it down over three hours, leaving a pocket park; nobody builds another for two weeks. Only some towns ever want a factory (6 in 10), and only when jobs are short.

## Chapter 2: people

### Households

Real households instead of strangers sharing a bed. About 28% live alone, 27% are couples, 33% are families (two parents, or about 1 in 7 times one, with one or two children) and 12% share as roommates (two or three). A couple shares the double bed; everyone else gets a bed of their own, so a family needs a home with a child's room and roommates need a bed each. House hunters only sign for a home that suits them, and if none does the realty builds one; after two days of nothing suitable they look elsewhere. When a building is rebuilt, each household moves into a home that suits it. Children are smaller (about 15 cells tall), don't work, drive or go to the pub. Older saves: whoever shares a home becomes one household, and in a home of three or more with a couple in the double bed, whoever sleeps in a single bed becomes their child.

### A week of days

The town has a calendar: Monday to Sunday (the settings panel shows the day, weekends in red). Nobody runs on the town's clock any more; each person has their own habits (fixed for life) and plans each day around them (see `src/routine.js`):

- **When they get up**: 5:45 to 8:15 on weekdays, most around 7, half an hour to two and a half hours later at weekends. Early enough for their job, and late after a night shift.
- **How long they sleep**: 6 and three quarters to 8 and a half hours, which sets their bedtime; Friday and Saturday nights run later. Children are in bed by 8:30 (9:15 on Friday and Saturday).
- **Work**: offices start anywhere from 7:30 to 9:45 and run eight and a half hours, Monday to Friday, with lunch, meetings, breaks and the loo timed from their own start. Shops, kitchens, pubs, stations and the hospital work shifts (see the table above), and their staff have their days off in turn. Someone running late jogs.
- **School**: on school days children walk to school for 7:30 (one parent, whoever starts work latest, walks them to the gate and waves them in), sit at their own desk, go out to the playground at break (10:00) and lunch (12:15), and come home at 3; then the playground, homework at their desk (or the kitchen table), play with their toys, dinner, bath, bed.
- **Meals**: 1 in 5 skip breakfast; weekends start with a cooked brunch. A household eats dinner together at its own time (5:45 to 8:00), one of them cooking. Some evenings they eat out (households differ: 4-16% of weeknights, 15-45% of weekends and Fridays): the whole household at one table if there's room.
- **Evenings**: shopping now and then (2 or 3 days a week), hobbies (games, the balcony, the greenhouse, the home gym) or TV. A drink at the pub: weeknights now and then, Fridays and weekends often, the more sociable the more often, until 10:15 to midnight on weeknights and as late as 2:15 at weekends. Parents go out less.
- **Exercise**: the disciplined few (about 15% runners, 13% gym-goers) exercise 3 to 5 days a week, before work or in the evening: a jog along the street and back with a stretch at the end, or the condo gym or home gym, then a shower.
- **Free days**: a couple of things in the morning (relaxing, an outing, the shops, a hobby), lunch at home or out, the afternoon. On some weekend afternoons a family takes the kids to the school playground together: the children go between the swings, the slide (up the ladder, down the slide) and the sandbox, and the parents watch from the fence.

### Walking

Each arm swings with the opposite leg, close to the body (runners hold their elbows at a right angle and pump them), and the legs step at the rate the ground passes under them, so feet don't slide: about 2 steps a second walking, 2.6 jogging, 3 sprinting. The far arm and leg are drawn paler than the near ones, so you can see which limb is which as they pass. Everyone walks their own way, with their own animation, not just a slower one: a stroll (short steps, loose arms; 20%), a normal walk (50%), a brisk walk (leaning in, pumping bent arms; 25%) or a jog (bouncing off the ground; 5%), each at their own pace on top. Children bob along. Runners jog, people running late jog, a thief sprints, firefighters and police jog, someone ill strolls, someone in handcuffs walks with their hands behind them, and nobody runs indoors.

### Not overlapping

- Outside, the pavement has three lanes (nearer the buildings or out towards the kerb), and everyone keeps to their own; people coming up behind someone slower step into another lane and overtake. People step into the doorway to go in. The outer lanes are drawn in front of parked cars.
- Indoors, someone catching up with a slower person slows to their pace instead of walking through them.
- People riding the lift stand apart in the car and step out one at a time.
- Different wake-up times, start times and paces mean crowds don't leave together and walk in lockstep any more.
- Standing around, people still step aside from anyone right on top of them.
- Two people never share a seat, a bed spot, a toilet or a shower. If the bathroom (or the fridge, the stove, the sink, the coffee machine) is in use, they wait nearby for their turn. With every chair and sofa seat taken (or none yet), they sit on the floor in a clear bit between the furniture that nobody else is sitting in (a child in their own room first); at work with no free lunch seat, they eat at their desk. Staff arriving for a shift stand alongside whoever's still at the post. Kids queue for the slide's ladder, and shoppers pick an aisle nobody else is browsing.

### Talking (see `src/social.js`)

People notice each other. What they say shows in **speech bubbles** over their heads: a few pixel icons (about 80: faces, hearts, a thumbs up, a question mark, the weather, noodles, a beer, a briefcase, money, a football, a cat, a fire, a factory, a police light...) and short words in the town's pixel font (HI, BYE, LOL, WOW, THX, MEH, SHH). The bubble's style says how it's said: a white **speech bubble** with a tail, a **thought** cloud with little circles, a spiky red **shout**, a dotted grey **whisper**, a blue **phone** call. Bubbles pop in and fade out, and nudge up out of each other's way.

**Conversations** take turns. The speaker says something about the topic (a picture or two, maybe with a question, an exclamation or a laugh), and everyone listening reacts: a laugh, a nod, a heart, a thumbs up, or a yawn, a glance at the watch and "...". The speaker's hands move as they talk; listeners laugh, nod, look round or cross their arms and tap a foot. Sitting down (at dinner, the bar, a restaurant table, the office lunch table, the sofa) they do it seated.

- **Interest.** Each listener's interest starts from how much they like the others and how chatty they are, and changes every turn: up when it's one of their interests or they like the speaker; down for the impatient, for a topic they don't care about, when the speaker goes on and on without letting anyone else in, and when they've only just talked to this person a minute ago ("you again?"). Bored, they show it. Fed up, they leave: politely (a look at the clock and BYE) or, if they're short-tempered or really fed up, storming off angry, and whoever they left takes it badly (sad, surprised, a broken heart). In a group, the rest carry on without them.
- **Changing the subject.** A chatty speaker who sees everyone drifting has an idea (a light bulb) and moves on to something else.
- **Topics.** Everyone has three interests (food, work, money, family, sports, games, films, music, travel, shopping, health, the news, the town, books, pets, love; children: games, school, sports, pets, films, food). The town adds its own: a fire, the factory's smog, a crime, something being built, the weekend coming. So does the place: food in a restaurant, beer and football at the pub, work at the office, homework at school, whatever's on TV on the sofa.
- **Kinds.** A **chat**. An **argument** between people who don't get on (shouting, pointing, hands on hips). **Gossip**, whispered, about someone nearby they both know. A **phone call**, on your own. A **greeting** in passing: friends wave and say HEY (and sometimes stop for a chat on the pavement), people who know each other wave, strangers in a good mood smile.
- **Where.** At the dinner table, at the bar and the pub's tables, restaurant tables, the office, waiting for and riding the lift, queueing, in the clinic's waiting room, on the swings and in the slide queue, whispering in class (until the teacher says SHH and they look sheepish), and on the pavement outside a fire alarm. Never in the bathroom, asleep, in a cell, under arrest, or when they're running late. Friends and housemates nearby join a group (up to four). At most about one conversation for every five people in town.
- **Saying things while doing things.** Ordering (a bowl of noodles, a beer), THX when it comes, a grumble at the clock when it doesn't, ENJOY from the waiter, the cashier ringing it up; chanting at the protest; shouting in a fight; OW; a cashier on the phone to the police; the officer's STOP; the firefighter's hose; the kids' WHEE and YAY on the slide and swings; the doctor's thermometer; the hand up in class; the lazy ones' MEH as the fire alarm goes off; someone waiting too long for the lift.
- **Thoughts.** Now and then someone thinks about what's next (dinner, a beer, bed, work, the gym) or how they feel (tired, ill, the smog, Monday morning, Friday evening, happy, fed up), in a thought cloud.

**Relationships.** Every pair of people has how much they like each other (-1 to 1) and how well they know each other (how often they've talked). Housemates start close; coworkers and neighbours know each other by sight. Good conversations make friends (who then wave, stop to chat, and join in); boring ones, rude exits and arguments sour things. People who don't get on mostly keep out of each other's way, and argue when they don't. Saved with the town.

**Moods.** Everyone has a mood around their own usual cheerfulness, nudged by how their needs are going (below): a good chat lifts it, being walked out on or argued with lowers it, and it drifts back over ten minutes or so. A bad mood makes a hothead more likely to start an argument.

The window that runs the town decides who says what; the other desktops' windows get each bubble with the frame and show it at the same age. Settings: SPEECH BUBBLES turns them off.

### Who they are, and how they're doing (see `src/life.js`)

Everyone has a **name** (first names from all over; families share a surname, most couples do, nobody at home shares a first name), an **age** and a **birthday** (worked out from their household: children 4 to 12, parents mostly 26 to 48, roommates young, couples and people on their own anything up to their eighties), and the day they **moved in**. On their birthday they turn a year older, and someone at home (or a friend) makes a fuss over dinner: a party popper, HAPPY and a cake.

**Needs**, from empty to full, follow what they're actually doing, in town time:

- **Energy**: sleep fills it; work, school and exercise wear it down fastest.
- **Food**: meals fill it (school has lunch); it drains all day, more slowly overnight.
- **Fun**: TV, games, the pub, the playground and a good chat; work, school and homework drain it.
- **Social**: time spent talking (arguing doesn't count) and other people in the room; being snubbed stings.
- **Hygiene**: a shower or a bath; exercise is the quickest way to lose it.
- **Health**: illness and injury, and the factory's smog when you're outside.

They feed back lightly rather than taking over the routine: whatever's running low shows up in thought bubbles (a yawn, a plate and a question mark, a lonely person), lonely people start more conversations, and their mood drifts with how their needs are going overall.

**The diary** keeps the day: the parts of their routine (woke up, went to work at VOXMI, cooked dinner), fire alarms, fights, arrests, getting ill and better, birthdays, moving in, and the conversations worth remembering (an argument, storming off, being snubbed, gossip, a new friend; an ordinary chat or phone call at most every 45 minutes). It isn't saved.

**Work done today** comes from the tasks staff actually finish (each one counts): customers served, plates served, dishes made, lessons taught, patients seen, parts made, visitors greeted; office workers answer emails and file reports by the hour. With the hours they've spent on each kind of thing, it resets at midnight.

### The passport (see `src/passport.js`)

Click anyone in town while the town is taking clicks (the settings panel, the developer's panel or a passport is open), or OPEN in settings. Their name shows over them as you point at them; a yellow arrow bobs over whoever's passport is open. The panel goes on the far side of the screen from them, and they can be flicked through with < and >.

- **ID**: a live photo (their pose right now), name, age and birthday, household, address, job and shift, what they're doing this minute, their six needs and mood as bars, their personality (early bird, chatty, grumpy, hot-headed, gym regular, light fingers...) and three likes.
- **Calendar**: their plan like a calendar app. **Day**: an hour grid with coloured events (work blue, school green, meals yellow, the pub brown, sleep pale) and a red line for now, with an agenda beside it so the short ones can be read too. **Week**: seven columns, today's date in a blue circle; click a day to open it. This week and next; hover for the times and where.
- **Tasks**: today's to-do list (work or school, homework, the school run, shopping, cooking, the gym), each ticked off, in progress, or missed (off sick, say); their work today (hours done and what they got through) or a child's school report; and how they've spent the day so far, as a bar.
- **People**: their household, then everyone they know, closest first: best friend, friend, coworker, neighbour, acquaintance, not keen, rival, enemy, with how well they get on and how often they've talked. Click one to open theirs.
- **Diary**: the day so far, newest first.

The window that runs the town makes the cards (at most twice a second); another desktop's window asks for the ones it's showing and gets them with each frame.

## Keeping it light

Every desktop's window draws its stretch of town 30 times a second, so drawing is kept cheap without changing what you see: car parks and wheels are drawn once and reused; sunbeams are drawn once per building and only redrawn when the sun has moved a cell, a curtain is drawn or a neighbour is built (the dust in them still drifts every frame); lift doors, room doors and light switches are drawn a colour at a time (changing colour is the slow part); room lighting is worked out in a reusable array; the other desktops' windows only reset what changed when they take each frame from the town. A 100-person town went from about 12 ms a frame to 2-3.

**Potato mode** (settings: POTATO MODE, remembered, shared by every desktop's window) is for slower computers: the desktop you're looking at still draws 30 times a second, but windows on desktops you're not looking at redraw only twice a second (the town carries on at full speed underneath), the main window sends the town to hidden desktops twice a second, and the purely decorative light goes: sunbeams and their dust, building shadows on the pavement, the sunny wall and sunset wash on fronts, the halo round lit windows and the brown haze. Everything people do, the buildings and rooms, lights, fires, cars, smoke and the sky stay. (macOS reports desktop switches up to about a second late, so the desktop you swipe to may look choppy for a moment.)

In both modes, a building with nobody in it doesn't draw its inside at all: the front wall covers it (apart from balconies and a playground, which are still drawn).

## The developer's panel

The **DEV** button in the settings panel's title bar opens it (BACK returns to settings). See `src/devpanel.js`.

- **Speed**: pause, or run everything 2, 4, 8 or 16 times faster: not just the clock (that's the day length in settings), but people walking, cars, lifts, fires, every animation, all together. The town takes several steps per frame and draws the last. Each step is as long as the frame, so it's the same speed-up at any frame rate. Paused, the clock and everyone stand still. The time it skips ahead is kept when the app restarts.
- **View** (remembered, and shared by every desktop's window): **x-ray** sees inside every building at once; **labels** puts what each person is doing over their head (in yellow when something's taken over, like a fire alarm or an arrest); **stats** shows the frame rate, how long a frame takes (and how that splits between running the town, passing it to the other desktops' windows, and drawing), the day and time, and the town's numbers in the top left corner.
- **Time**: jump to 7:00, 12:00, 18:00 or 22:00, or forward a day (people re-plan from there).
- **Town**: move a household in now (one that suits a free home, driving over straight away), finish everything being built, build the next thing the town needs, +$10M, build a factory, and REPLAN ALL (everyone thinks again: unsticks anyone stuck).
- **Events**: a pan fire, burnt toast (a false alarm), a shoplifter (reported), a fight in the street, someone with the flu, an ambulance call, a protest at the factory.
- **Social**: two people near each other start a chat, an argument or some gossip; someone takes a phone call.
- **Town now**: people, households, children, jobs, the jobless, house hunters, free homes, households moving in, buildings going up, cash against the bank's limit, smog, fires, crimes, people ill and people in cells, how many are talking right now, how many friendships there are, and the town's average mood.

Only the window that runs the town carries these out; another desktop's window passes them on to it.

## Testing in a browser

Serve the `src` folder (for example `python3 -m http.server -d src`) and add options to the address:

- `?hour=19`: start at 7pm
- `?speed=60`: run the clock 60x faster
- `?city=40`: grow instantly to about 40 people
- `?fakewin`: two pretend app windows (one slides back and forth)
- `?zoom=3`: bigger pixels
- `?dow=5`: start on that day of the week (0 Monday ... 6 Sunday)
- `?dock=40`: a Dock-sized strip under the street (room for car parks)

In the browser console: `advance(60)` runs the town a minute forward; `fire(lot)` sets a pan on fire in that plot's building (`fire(lot, false)` just burns the food); `peek(x, y, w, h, 4)` shows part of the screen magnified 4x; `world()` is the current state of the world.

Any option means a test run, which never touches your saved town.
