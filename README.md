# MerchantFlow

I built MerchantFlow to explore the parts of a small commerce system that are easy to overlook in a happy-path demo: retries, inventory consistency, payment state, and keeping a ledger balanced. It is a local portfolio project built with React, Node.js, and PostgreSQL. Its payment gateway is simulated; no real payments are processed.

Pocket Ledger and Study Queue are separate completed projects that gave me practice with data validation, persistence, and browser state. They are part of my learning progression; this description does not claim they were started before MerchantFlow. See [the project journey](docs/PROJECT_JOURNEY.md).

## Run locally

Requirements: Docker Desktop with Compose, Node.js 20 or newer, and npm.

```bash
docker compose up --build
```

Open the dashboard at <http://localhost:5173> and the API at <http://localhost:3000>. The API health endpoint is <http://localhost:3000/health>.

For an existing local Docker volume created with the legacy column names, apply the safe rename migration before restarting the API. The migration preserves the integer values (the existing client has stored paise despite the old names). Back up first and follow [the upgrade steps below](#upgrading-an-existing-local-database).

The first boot creates a demo product. Use the dashboard to create an order and choose **Simulate capture**. The order list refreshes with its payment status and ledger total.

To stop the services, run `docker compose down`. Avoid `-v` if you want to preserve the local PostgreSQL data volume.

## Upgrading an existing local database

The schema change renames legacy `*_cents` columns to `*_paise` without changing stored integer values. Back up local data first. For an existing Docker Compose volume, stop the API, start PostgreSQL, apply the migration once, then rebuild:

```powershell
docker compose stop api
docker compose up -d db
docker compose exec -T db psql -U merchantflow -d merchantflow -f /docker-entrypoint-initdb.d/migrations/001_cents_to_paise.sql
docker compose up --build
```

The migration is mounted read-only and is not rerun automatically on an existing volume. A fresh volume gets the paise schema directly. Do not remove the data volume to perform this rename.

## What it does

- Create and list products.
- Add products from the seller dashboard and choose among them when creating an order.
- Create an order with a caller-provided idempotency key.
- Safely replay an identical order request with the same key; reject reuse of that key with a different request body. The dashboard reuses its key when retrying an unchanged request after a network error.
- Simulate capture, refund, and pending-order cancellation without a payment provider.
- Record event IDs uniquely and write balanced ledger entries in the same database transaction as the order update.
- View orders and ledger totals in a small React dashboard.

The system boundaries and transaction flow are described in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## API sketch

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service and database health |
| `GET` | `/api/v1/products` | List products |
| `POST` | `/api/v1/products` | Create a product |
| `GET` | `/api/v1/orders` | List recent orders |
| `POST` | `/api/v1/orders` | Create an order; requires `Idempotency-Key` |
| `POST` | `/api/v1/orders/:id/capture` | Simulate a payment capture |
| `POST` | `/api/v1/orders/:id/refund` | Simulate a refund |
| `POST` | `/api/v1/orders/:id/cancel` | Cancel a pending order and release reserved stock |
| `POST` | `/api/v1/simulator/webhooks` | Replay a local payment event by ID for failure experiments |

All monetary integers use paise end to end: the API accepts and returns `pricePaise` and `amountPaise`, and PostgreSQL stores `price_paise` and `amount_paise`. The local payment simulator does not model card processing, settlement, or a real provider's signature scheme.

## Design notes

- PostgreSQL constraints protect inventory, idempotency keys, event IDs, and ledger structure.
- Order creation uses a transaction and locks the product row while reserving stock.
- Captures and refunds update payment state, order state, and balanced ledger rows atomically.
- Event processing is idempotent by event ID. The simulator lets you submit the same event more than once to observe the duplicate path.
- The MVP is a modular monolith. Add a background worker or a queue only after a measured need.
- The API has no authentication and is for a local portfolio demo. Do not expose it to the public internet.

## Development

```bash
cd server && npm install && npm test
cd ../client && npm install && npm run build
```

The API tests use Node's built-in test runner. PostgreSQL tests are opt-in locally: start the database with `docker compose up -d db`, then set `RUN_INTEGRATION_TESTS=1` and `DATABASE_URL=postgres://merchantflow:merchantflow@localhost:5432/merchantflow` before running `npm test` from `server`. From `client`, run `npm test` for paise input tests and `npm run build` for the dashboard. CI runs the PostgreSQL suite, dashboard tests/build, a Playwright browser test, and Windows clean-clone install/unit/build checks. Exact commands and status are in [`docs/TESTING.md`](docs/TESTING.md).

## Portfolio path

Alongside MerchantFlow, I have completed [Pocket Ledger](https://github.com/DivyanBabbar/pocket-ledger) and [Study Queue](https://github.com/DivyanBabbar/study-queue). Together, the projects show a progression through data validation, persistence, browser state, and API/database consistency. This is a learning progression rather than a claim about the order in which the repositories were started.

## License

MIT. See [`LICENSE`](LICENSE).

