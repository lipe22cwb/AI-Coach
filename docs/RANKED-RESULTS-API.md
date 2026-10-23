# Ranked results API

This local prototype stores completed Ranked wins in `data/ranked-results.json`.
It does not store Practice games. The API has no account system, so `playerName`
is a display label and is not a verified identity.

## Submit a win

`POST /api/ranked-results`

```json
{
  "gameId": "7d5ae0b1-09df-4285-a8a6-5d5f8128b712",
  "playerName": "Player",
  "boardSize": 16,
  "mineCount": 40,
  "durationMs": 128450,
  "outcome": "win"
}
```

Only completed wins are accepted. The server validates the fields, assigns a
record ID and timestamp, and prevents the same `gameId` from being recorded
twice. The response includes the result's current position for its board setup.

## Read the leaderboard

`GET /api/ranked-results?boardSize=16&mineCount=40`

Results are grouped by the exact board size and mine count, then sorted by
shortest winning time. Equal times are ordered by submission time. Both query
parameters are required so unlike boards are not compared in one ranking.

## Storage and limits

The file is `data/ranked-results.json`. The write uses a temporary file and
atomic rename, with writes serialized inside one Node.js process.

This is a local demonstration store, not production leaderboard storage. There
is no account verification or server-side replay of the game, so a caller can
submit a fabricated win. The JSON file is not shared or durable across multiple
server instances and is unsuitable for serverless hosting. Before using Ranked
results competitively, add authenticated players, server-owned game sessions,
move replay and verification, and persistent shared storage.
