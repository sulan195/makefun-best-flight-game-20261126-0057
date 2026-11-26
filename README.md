# makefun-best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/sulan195/makefun-best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/sulan195/makefun-best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Ember Isles** is a static-file browser flight game built for the make.fun bounty **"Make the best flight game"** (`best-flight-game-20261126-0057`, $500 USDC in escrow, top 50 entries share the prize). A small propeller plane flies over a volcanic island chain at sunset — through burning rings, around a smoking volcano, and back down to a short island runway. The renderer is Canvas 2D pseudo-3D, written in vanilla JavaScript with no libraries and no network requests. It supports chase view and cockpit view, keyboard and mouse controls, fuel burn, wind, stall warning, damage on hard landings, and three missions.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080.

You can also serve `game/` with any static server and open `game/index.html`.

To hand in locally:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## How to fly

| Action | Keys |
| --- | --- |
| Throttle | `W` / `S` |
| Pitch | `ArrowUp` / `ArrowDown` |
| Roll / bank | `ArrowLeft` / `ArrowRight` or `A` / `D` |
| Rudder | `Q` / `E` |
| Steer toward cursor | Mouse drag |
| Wheel brake | `Space` |
| Supply drop (Canyon Run) | `X` |
| Landing gear | `G` |
| Flaps | `F` |
| Toggle cockpit / chase view | `V` |
| Pause | `P` |
| Restart | `R` |
| Mute | `M` |
| Select mission | `1` / `2` / `3` |
| Start | `Enter` |

## Missions

### Ring Race
Fly through 6 glowing rings in order around the volcano. Each ring is worth 250 points; finishing fast adds a speed bonus.

### Precision Landing
Take off, fly a circuit around the bay, and grease a landing on runway 09. Scored on centerline offset, sink rate, and touchdown speed — a perfect landing earns up to +400 bonus.

### Canyon Run
Thread all 6 rings at low level, then press `X` over the marked supply drop zone. Rings plus an accuracy-weighted drop bonus, with a time bonus for a fast run.

## What is inside

- `game/` — static files: `index.html` + `src/*.js` (14 modules: seeded RNG, config, projection, world, aircraft physics, input, HUD, missions, audio, effects, render, shots, main).
- `main.ts` — Node 22, standard library only. Copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.
- `screenshots/` — 4 real renders of the game's own code: cover (chase view over the lagoon at sunset), cockpit view, ring pass, landing flare.
- `vendor/makefun-game.ts` — kit file, unchanged.
- `LICENSE` — MIT.

The flight model uses throttle and turn discipline, fuel burn, damage on hard landings, wind, and stall warning. Physics run on a fixed timestep with deterministic, seeded world generation, so screenshots are reproducible: every shot is staged with `?shot=<name>&seed=1`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=makefun-arrow-runway-sled&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
