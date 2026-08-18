# Battle / Multiplayer (archived)

This folder contains the removed battle system, kept for reference but NOT part of
the build. Files under `archive/` are outside `tsconfig.json`'s `include` (`src`,
`vite.config.ts`), so they are never type-checked or bundled.

## Contents

- `src/components/BattleModal.tsx` — the battle lobby UI (host / join / offline tabs).
- `src/game/multiplayer/` — the networking layer:
  - `p2pManager.ts` — Trystero-based room manager (torrent + MQTT signaling, mirror rooms).
  - `manualRoom.ts` — zero-middleman offline rooms (MZ1/MR1 codec).
  - `types.ts` — `MatchResult`, `OpponentInfo`, `PlayerTickPayload`, `PublicLobbyInfo`.

## Removed from the live game

- Battle button on the start screen, `BattleModal` rendering and `#battle=` deep link.
- `p2p` singleton usage in `App.tsx` (callbacks, leave-on-menu, death broadcast).
- Multiplayer sync in `engine.ts` (`sendTick`/`sendDeath`, `isMultiplayer`, `opponentStates`,
  `setOpponentStates`, seeded `startRun(seed)`).
- Opponent ghost rendering and battle leaderboard HUD in `renderer.ts`.
- `isMultiplayer`/`opponentStates` fields from the `RenderHost` surface in `game/types.ts`.
- `@trystero-p2p/*` and `trystero` dependencies from `package.json`.

## Restoring

Move the files back (e.g. `git mv archive/battle/src/components/BattleModal.tsx src/components/`,
`git mv archive/battle/src/game/multiplayer src/game/multiplayer`), restore the imports in
`App.tsx`/`engine.ts`/`renderer.ts`/`types.ts` from git history (commit
`6e8e2b3` or earlier), and re-add the Trystero deps. The game logic itself was never
changed — only the wiring was removed.