# THE AUCTION

A player-auction party game, IPL style. Every team gets the same purse. Bid for real players one at a time, build your squad, pick a Playing XI, and the site decides **whose team is better** from real stats. There is no match simulation, only a verdict with the reasons.

**Cricket** is the first sport pack. **Football** is already registered as a pack and shows as "Coming soon".

- **Modes:** solo against AI bots (easy, medium or hard), pass-and-play with several human teams on one device, or online rooms with a room code (Firebase).
- **Host controls everything:**
  - Purse: minimum 50 Cr, default 100 Cr, no upper limit.
  - Teams: 2–10, with names and colours.
  - Squad: min/max size and overseas limits (squad and XI). Per-role minimums are optional house rules and off by default: buy who you like, and the verdict judges the balance.
  - Player pool filters: retired players, era, country, role, Indian vs overseas.
  - Prices: base-price rules and bid increments.
  - Auction: timer, order (shuffled, by sets, or marquee first), how many players, and a second round for unsold players.
  - Retention and RTM cards, bots and difficulty.
  - Presets you can save and reuse.
- **Player database:** 898 players covering every IPL season from 2008 to 2026, plus T20I stars who never played IPL. Real numbers come from Cricsheet ball-by-ball data. Each player has an era-adjusted, percentile-based rating, and the card shows the full breakdown.
- **Auction:** a dramatic 3D reveal (spotlight, smoke, rotating pedestal, signature pose, floating stats) with an animated 2D fallback. The bid timer resets on every bid, then "going once, going twice", then a hammer-strike **SOLD!** Purse, squad and players remaining are always visible, along with an auction log. Synthesised sound effects, an optional auctioneer voice, and a mute toggle.
- **Verdict:** a leaderboard, a head-to-head breakdown, and shareable result links.

---

## Run it locally

Requires **Node 18+** (built with Node 24).

```powershell
cd $env:USERPROFILE\Desktop\the-auction
npm install
npm run dev
```

Open http://localhost:5173. Solo mode works straight away. The player database is already built in `public/data/cricket/players.json`.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` / `npm run preview` | Production build in `dist/` / preview it |
| `npm run simulate` | Plays complete bot-only auctions headlessly, using the real engine, and checks every rule (purse, squad, overseas, roles, legal XI) |
| `npm run data:cricket` | Rebuilds the player database (see below) |

### Try multiplayer without Firebase

Open **http://localhost:5173/?backend=tabs** in two browser tabs. Create a room in one tab and join with the code in the other. The tabs share a local test database, which uses the same code path as Firebase: transactions, a host loop and presence.

---

## Firebase setup (online rooms)

Online rooms use the **Realtime Database** with **anonymous auth**. The Realtime Database has lower latency than Firestore and has built-in presence and server-time offsets, which suits a bidding game. The free Spark plan is enough.

1. Go to https://console.firebase.google.com and click **Add project**. You don't need Analytics.
2. Turn on anonymous sign-in: **Build → Authentication → Get started → Sign-in method → Anonymous → Enable**.
3. Create the database: **Build → Realtime Database → Create database**. Pick a location and start in **locked mode**.
4. Add the rules: **Realtime Database → Rules**. Paste the contents of `database.rules.json` and click **Publish**.
5. Register the web app: **Project settings (gear) → Your apps → Web (</>)**. Register it, then copy the config values.
6. Copy `.env.example` to `.env.local` and fill in the config values:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.<region>.firebasedatabase.app
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_APP_ID=...
   ```
7. Restart `npm run dev`. **Create room** and **Join room** now work across devices on the internet.

**Local emulators (optional, needs Java 11+):** run `npm i -g firebase-tools` once. Then run `npm run emulators` and set `VITE_FIREBASE_EMULATORS=true` in `.env.local`.

### How sync works

- The room host's browser runs the authoritative game loop in `src/net/hostRunner.js`. It opens lots, closes them when the timer runs out, settles sales and drives the bots.
- Every player's bid is an RTDB **transaction** on the small `lot` node, so simultaneous bids are resolved by the database.
- Closing a lot is also a transaction, and settling a sale is idempotent. A refresh, a reconnect or a second host tab can never sell a player twice.
- If the host disconnects, the auction pauses until they come back.

## Deploy to Vercel

1. Push the folder to a Git repository and click **Import Project** in Vercel. It detects Vite; `vercel.json` is included.
2. In Vercel, under **Settings → Environment Variables**, add the five `VITE_FIREBASE_*` values.
3. Deploy. In Firebase, add your Vercel domain under **Authentication → Settings → Authorized domains**.

---

## Refreshing the player data

```powershell
npm run data:cricket            # uses cached downloads in data-raw/ if present
npm run data:cricket -- --refresh   # re-download the latest Cricsheet + Wikidata data
```

The script (`scripts/cricket/build-players.mjs`) works like this:

1. It downloads the following public sources into `data-raw/` (git-ignored):

   | Source | File | Size |
   |---|---|---|
   | [Cricsheet](https://cricsheet.org) IPL ball-by-ball | `ipl_json.zip` | ~5 MB |
   | Cricsheet men's T20I ball-by-ball | `t20s_male_json.zip` | ~15 MB |
   | Cricsheet people register | `people.csv` | ~1 MB |

2. It aggregates every delivery into IPL and T20I career stats:
   - **Batting:** matches, innings, runs, high score, average, strike rate, 50s/100s, 4s/6s, ducks.
   - **Bowling:** overs, wickets, economy, average, strike rate, best figures, 4w/5w, dot %, maidens.
   - **Fielding and more:** catches, stumpings, run-outs, player-of-the-match awards.
   - It excludes super overs. It has been checked against official records, e.g. Gayle's 4,965 runs at 148.96 and Malinga's 170 wickets at 7.14.
3. It looks up **Wikidata** (CC0) by ESPNcricinfo id for each player's full name, date of birth and country.
4. It derives each player's role from how they were actually used: batting position, overs per match, and stumpings for wicketkeepers.
5. Status is **active** if the player appeared on or after `ACTIVE_SINCE` (2025-01-01), otherwise **retired**.
6. It computes ratings:
   - **Batting:** runs, average and strike rate, with average and strike rate as era indexes (100 = league average for the seasons played).
   - **Bowling:** wickets, plus economy and strike rate as era indexes.
   - Each is turned into a percentile against all regular batters or bowlers in the pool, with shrinkage for small samples.
   - These combine into a role-weighted composite: `OVR = 35 + 64 × (role percentile)^1.6`.
   - Ratings use IPL plus T20Is between full members only, so associate fixtures don't inflate them.
7. It sets the base price from OVR (20 L up to 2 Cr at a 100 Cr purse; it scales with the purse).

Hand-maintained inputs (they contain no stats):

- `data/cricket/overrides.json`: corrections to role, country, status, name or `customImage`. Keyed by Cricsheet short name or id.
- `data/cricket/traits.json`: 3D character traits (see below).

Known gap: Cricsheet publishes no Afghanistan T20Is, so Afghan players such as Rashid Khan are rated on their IPL numbers only.

Data licence: Cricsheet data is ODC-BY 1.0, and Wikidata is CC0.

---

## Player characters (3D)

Each player is a **rigged 3D human** built from his trait fields in `players.json → character`. There are no photos, scans or scraped images.

- **Base model:** "Universal Base Characters" by [Quaternius](https://quaternius.itch.io/universal-base-characters), free Standard version, **CC0** (licence in `public/models/cricketer/`).
  - The body plus 5 hair pieces and a beard come to about 1 MB of GLB files.
  - To rebuild them, save the Standard zip as `data-raw/models/ubc-standard.zip`, then run `node scripts/models/pack-models.mjs` and `node scripts/models/pack-textures.mjs`.
- **Skin and hair textures:** the pack's skin and hair textures become small greyscale "detail" maps plus normal maps (about 400 KB of WebP in `public/models/cricketer/tex/`). They are tinted at runtime to each player's skin and hair colour.
- **Clothing and build:** the jersey and trousers are separate, slightly loose meshes, smoothed so they read as fabric over the body. Slim, athletic, stocky and heavy change the girth of the body itself (`src/sports/cricket/characterMesh.js`).
- **Kit:** jersey, trousers and shoes are painted onto the body by bone region. The name and number go on the back. Pads, gloves, bat, ball, helmet or patka and accessories are attached to the skeleton.
- **Face sculpting:** the head mesh is reshaped per player by `face` multipliers: head, width, length, jaw, cheeks, nose, brow, forehead, chin and ears. The 101 hand-styled players have tuned values (Rohit's round face, Bumrah's long narrow face, Gayle's heavy jaw, and so on). Everyone else gets a slight seeded variation.
- **Signature poses** from `src/sports/cricket/poses.js` are retargeted onto the skeleton. A small IK solver puts both hands on the bat handle. Left-handers are mirrored.
- **Fallback:** if the model files are missing, the older all-primitive low-poly figure is used automatically.

| Field | Values |
|---|---|
| `skin` | `light`, `tan`, `brown`, `deep` or a `#hex` colour |
| `hair` / `hairColor` | bald, buzz, crop, short, side-part, quiff, slick-back, undercut, textured, spiky, curly, afro, long, mullet, man-bun, mohawk, dreadlocks, receding |
| `beard` | none, stubble, short, full, long, chinstrap, goatee, mustache, french |
| `face` | `{ head, width, length, jaw, cheeks, nose, brow, forehead, chin, ears }`, each about 0.8–1.25 (1 = base) |
| `build` / `height` | slim, athletic, stocky, heavy / short, medium, tall |
| `headgear` | none, helmet, cap, sunhat, patka, headband, bandana |
| `sleeves`, `shoes`, `hand` | short or long / white, black or neon / right or left |
| `accessories` | sunglasses, chain, wristbands, tattoo-sleeve, zinc, keeper-gloves |
| `number`, `backName`, `jersey` | jersey number, name on the back, team-neutral colour |
| `pose` | cover-drive, helicopter, pull-shot, straight-drive, lofted-drive, scoop, sweep, upper-cut, switch-hit, bat-raise, forward-defence, fast-bowl, sling-bowl, short-run-bowl, leg-spin, off-spin, keeper-crouch, wicket-celebration, sword-celebration, arms-crossed |
| `customModel` | optional path or URL to **your own licensed** 3D model (`.glb`) of the player. It replaces the generated character in the reveal. |
| `customImage` | optional path or URL to **your own licensed** cutout or artwork. It replaces the character on the 2D card and pedestal. |

**Character creator** (on the home screen) has a full-body and a **Face** close-up view, sliders for every face value, and a "Copy traits JSON" button.

To change a player's look:

1. Paste the copied JSON line into `data/cricket/traits.json`.
2. Run `npm run data:cricket -- --offline`.

**Honest limit:** the generated figures are recognisable caricatures, not photo-real likenesses. For true likenesses, use licensed per-player models or art through `customModel` / `customImage`. Put the files in `public/models/players/` or `public/images/players/`, and set the field in `data/cricket/overrides.json` or `traits.json`.

**Reveal modes:** the top-bar button cycles **Auto / 3D / 2D**. Auto uses the animated 2D card on weak phones, without WebGL, with reduced motion, or if the 3D stage measures under 22 fps. Choose **3D** to force it.

---

## Sport packs (multi-sport)

The engine, rooms, host settings, bidding and bots know nothing about cricket. Everything sport-specific lives in `src/sports/<sport>/`:

```
src/sports/index.js            registry (shown on the home screen)
src/sports/cricket/pack.js     data URL, roles, labels, currency, theme, eras, filters,
                               default squad rules, base-price slabs, increment tiers,
                               retention slabs, card stats, reveal stats, stat tables,
                               rating breakdown, evaluateLineup, autoPickLineup, poses
src/sports/cricket/CricketCharacter.jsx + poses.js   3D character creator
scripts/cricket/build-players.mjs                    data pipeline
src/sports/football/pack.js    "Coming soon" placeholder
```

To add football:

1. Write a data script that outputs `public/data/football/players.json`. It needs the same top-level player fields: `id, name, role, country, overseas, status, years, ovr, rating, stats, character`.
2. Implement the same fields as the cricket pack (positions GK/DEF/MID/FWD, a formation-aware `evaluateLineup`, and so on).
3. Add a `FootballCharacter.jsx`.
4. Set `available: true`.

The auction, rooms, bots and results work unchanged.

## Project layout

```
src/engine/     pure, sport-independent game logic (rules, pool, bots, state machine)
src/net/        backends (memory = solo, tabs = local test, firebase = online), host runner, rooms
src/screens/    Home, Lobby/settings, Retention draft, Auction, Playing XI, Results, Database, Creator
src/three/      3D reveal stage, viewer, device capability checks
src/components/ cards, 2D avatar, SOLD hammer, timer, UI kit
database.rules.json   Firebase Realtime Database security rules
```

No official logos, team marks or player photos are used. Franchise names appear only as factual history in the stats.
