# Asset360

Enterprise asset management — React UI + Node API.

## Desktop (all-in-one)

One installer includes the app, API, and an embedded local database. No separate MongoDB or server setup.

```bash
yarn api:install
yarn electron:build:win   # → release/Asset360 Setup 1.0.0.exe
yarn electron:build:mac   # → release/*.dmg
```

After install, open Asset360 and sign in:

- **username:** `admin`
- **password:** `123`

Data is stored under the OS user data folder for Asset360.

## Local web development

```bash
# API with embedded DB (no Mongo required)
ASSET360_EMBEDDED=1 DATA_DIR=./server/data yarn api:dev

# or API with MongoDB
yarn api:dev

yarn dev   # UI on :5180
```

## Optional: MongoDB server mode

For a shared company server, run the API with `MONGODB_URI` and point clients at that host.
