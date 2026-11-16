# Testing and setup record

## Commands

From the repository root, the PostgreSQL-backed API suite is:

```sh
cd server
npm install
RUN_INTEGRATION_TESTS=1 DATABASE_URL=postgres://merchantflow:merchantflow@localhost:5432/merchantflow npm test
```

On Windows PowerShell, set the environment first:

```powershell
Set-Location server
npm install
$env:RUN_INTEGRATION_TESTS = '1'
$env:DATABASE_URL = 'postgres://merchantflow:merchantflow@localhost:5432/merchantflow'
npm test
```

Web tests and production build:

```sh
cd client
npm install
npm test
npm run build
npm run test:e2e
```

The E2E suite requires the API, PostgreSQL, and Vite dev server; GitHub Actions starts those services and installs Chromium. The Windows CI job performs a clean checkout, installs both Node packages, runs unit tests, and builds the dashboard. It does not run Docker Compose or PostgreSQL on Windows.

## Existing database safety

The migration at `server/db/migrations/001_cents_to_paise.sql` renames legacy columns and preserves their integer contents. Back up the local database before applying it. See the root README for the PowerShell command. A fresh database loads the paise schema directly; the migration is not applied automatically to an existing Docker volume.

## Observed results (2026-11-13)

The Codex host provides Node.js `v24.22.1`, but `npm`, Docker, and `psql` are not installed and outbound DNS prevents a fresh `git clone`. Therefore the PostgreSQL suite and browser E2E test were not run locally. No local PostgreSQL result is claimed. CI run links and exact command outcomes will be added after the updated workflow completes.
