# Trader Local File Contracts

Mission Center's Trader tab reads only fixed allowlisted files under the OpenClaw workspace:

- `autonomous-crypto-trader/state.json`
- `autonomous-crypto-trader/trades.jsonl`
- `autonomous-crypto-trader/trader.log` (best-effort last error extraction)
- `autonomous-crypto-trader/KILL_SWITCH` (kill switch flag file)
- Optional (not currently queried by Mission Center): `autonomous-crypto-trader/data/trader.db`

No path parameters are accepted by Trader APIs. Arbitrary file reads are not supported.

## state.json schema (current trader format)

Example shape observed in `autonomous-crypto-trader/state.json`:

```json
{
  "mode": "paper",
  "open_orders": [],
  "portfolio": {
    "cash_usd": 100.0,
    "equity_usd": 100.0,
    "open_meta": {},
    "positions": {}
  },
  "prices": {
    "BTC-USD": 68327.515,
    "ETH-USD": 1979.805
  },
  "products": ["BTC-USD", "ETH-USD"],
  "state_version": 1,
  "strategy_params": {
    "name": "rsi_momentum",
    "entry_rsi": 55,
    "exit_rsi": 45
  },
  "ts": 1772593043.9652522
}
```

Fields used by Mission Center:

- `mode` (`paper` or `live`)
- `portfolio.equity_usd` and `portfolio.cash_usd`
- `portfolio.positions` and/or `open_positions`
- `open_orders` and/or `openOrdersCount`
- `products` and `prices`
- `ts` (fallback to file modified time if missing)

## trades.jsonl schema

`trades.jsonl` is JSONL (one JSON object per line). Mission Center reads the newest lines from the end of file and extracts:

- `ts` (or `timestamp` / `time`)
- `product` (or `symbol`)
- `side`
- `qty`
- `price`
- `fees`
- `pnlUsd`
- `reason` (best-effort)

Malformed lines are skipped.

## Kill switch behavior

- Create `autonomous-crypto-trader/KILL_SWITCH` to stop the trader immediately.
- Delete `autonomous-crypto-trader/KILL_SWITCH` to clear the kill switch.
- Mission Center's `POST /api/trader/kill-switch` writes/deletes exactly this file path.
