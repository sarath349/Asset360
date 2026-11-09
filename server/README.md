# Asset360 API (Node + MongoDB)

On-prem API that mirrors the portal’s existing `/api/*` contract. The React/Electron app talks to this instead of the cloud AssetAPI.

## Requirements

- Node.js 18+
- MongoDB running locally or reachable via `MONGODB_URI`

## Setup

```bash
cd server
cp .env.example .env
yarn install
yarn seed
yarn dev
```

API: `http://127.0.0.1:5050`

Default login after seed:

- **username:** `admin`
- **password:** `123`

## Frontend

From the repo root, `yarn dev` proxies `/api` to this server (`VITE_API_TARGET`).

To use another host:

```bash
VITE_API_TARGET=http://192.168.1.10:5050 yarn dev
ASSET360_API_URL=http://192.168.1.10:5050 yarn electron:dev
```
