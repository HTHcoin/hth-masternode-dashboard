# HTH Masternode Staking Platform — `stake.HTH.foundation`

A **self-hosted, non-custodial** masternode dashboard for **HelpTheHomeless (HTH)**.
Users keep their own **1,000,000 HTH** collateral and run their own VPS node; this
platform helps them generate the config, deploy the node, and monitor the network.
No keys or funds ever touch the platform.

```
stake.HTH.foundation  (GitHub Pages, static)     api.stake.HTH.foundation  (Oracle VM)
 ├─ index.html   dashboard + MN lookup            ├─ server.js   read-only RPC proxy ──▶ HTH full node (:9998)
 ├─ setup.html   in-browser config generator      └─ (behind Caddy/nginx TLS)
 ├─ guide.html   step-by-step
 └─ install-hth-masternode.sh   VPS installer
```

## Layout
- `frontend/` — static site (deploy to GitHub Pages, `CNAME` = `stake.HTH.foundation`).
  Edit `frontend/config.js` → set `API_BASE` to the public backend URL.
- `backend/` — Node/Express read-only proxy to the HTH node. Runs on the Oracle VM
  under PM2 (`ecosystem.config.js`), matching the existing WATTx stack.
- `frontend/install-hth-masternode.sh` — served from the Pages site; users `curl | sudo bash` it on their VPS.

## Deploy the frontend
Same pattern as the existing `hth.foundation` site (GitHub Pages + custom domain):
1. Push `frontend/` to a repo (or a `stake/` path) served by Pages.
2. DNS: `CNAME stake.HTH.foundation → <ghpages>.github.io` (Enforce HTTPS on).
3. Set `API_BASE` in `config.js` to the backend URL and commit.

## Deploy the backend (Oracle VM, 129.80.148.11)
Requires a synced **unpruned, `txindex` not needed** HTH full node with RPC enabled
(masternode RPCs only need the node running with `server=1`).
```
cd backend
cp .env.example .env      # set RPC_PASSWORD to match helpthehomeless.conf
npm install
pm2 start ecosystem.config.js && pm2 save
```
Front it with Caddy/nginx for TLS so the Pages site (https) can call it:
`api.stake.HTH.foundation → 127.0.0.1:8710`. Add that host to `CORS_ORIGINS` if
you change the frontend origin.

### Backend endpoints (all read-only)
| endpoint | returns |
|---|---|
| `GET /api/health` | liveness |
| `GET /api/network` | block height, MN counts, mnsync state, ChainLocks spork, peers |
| `GET /api/masternodes` | normalized `masternodelist` (status, payee, active time) |
| `GET /api/masternode/:key` | one MN by outpoint / IP / payee |

## Security notes
- The backend calls **only** read RPCs; it never touches the wallet. Do not add
  wallet/spending RPCs to it, and keep the node's RPC bound to localhost.
- The setup wizard generates everything **client-side**; nothing is POSTed.
- The masternode private key (`masternode genkey`) is not a spending key — but the
  UI still warns users never to paste seeds or collateral keys.

## Chain facts (helpthehomelesscoin/src/chainparams.cpp)
x25x PoW · 60s blocks · **1,000,000 HTH** collateral · ChainLocks · p2p 65000 · RPC 9998.
