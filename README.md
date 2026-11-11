# MerchantFlow

MerchantFlow is a learning project for a small seller who needs to create orders, simulate checkout, and inspect what happened when requests or payment events are retried. It uses a React interface, a Node.js REST API, PostgreSQL, and a local payment simulator. It never accepts card details or moves real money.

The project is designed to grow in visible steps: a minimal working flow, deliberate failure experiments, and a reliability rebuild. Keep the tradeoffs and evidence in [`docs/PROJECT_JOURNEY.md`](docs/PROJECT_JOURNEY.md) as you work.

## Run locally

Requirements: Docker Desktop with Compose, Node.js 20 or newer, and npm.

```bash
docker compose up --build
```

Open the dashboard at <http://localhost:5173> and the API at <http://localhost:3000>. The API health endpoint is <http://localhost:3000/health>.

The first boot creates a demo product. Use the dashboard to create an order and choose **Simulate capture**. The order list refreshes with its payment status and ledger total.

To stop the services, run `docker compose down`. Add `-v` only if you also want to delete the local PostgreSQL data volume.

## Current MVP

- Create and list products.
- Create an order with a caller-provided idempotency key.
- Safely replay an identical order request with the same key; reject reuse of that key with a different request body.
- Simulate capture, refund, and pending-order cancellation without a payment provider.
- Record event IDs uniquely and write balanced ledger entries in the same database transaction as the order update.
- View orders and ledger totals in a small React dashboard.

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
| `POST` | `/api/v1/simulator/webhooks` | Replay a signed-off local event by ID for failure experiments |

Amounts are integer cents. The fake gateway is local-only and intentionally does not model card processing, settlement, or a real provider's signature scheme.

## Design notes

- PostgreSQL constraints protect inventory, idempotency keys, event IDs, and ledger structure.
- Order creation uses a transaction and locks the product row while reserving stock.
- Captures and refunds update payment state, order state, and balanced ledger rows atomically.
- Event processing is idempotent by event ID. The simulator lets you submit the same event more than once to observe the duplicate path.
- The MVP is a modular monolith. Add a background worker or a queue only after a measured need.

## Development

```bash
cd server && npm install && npm test
cd ../client && npm install && npm run build
```

The domain tests use Node's built-in test runner. The API integration tests use a real PostgreSQL database and are opt-in so they cannot modify a database accidentally. Start the database with `docker compose up -d db`, then from `server` run `npm test` and `RUN_INTEGRATION_TESTS=1 DATABASE_URL=postgres://merchantflow:merchantflow@localhost:5432/merchantflow npm test`.

## Portfolio path

Start with the smaller exercises in [`docs/PROJECT_JOURNEY.md`](docs/PROJECT_JOURNEY.md). Build this MVP only after the basics feel familiar, then document each failure you reproduce and each fix you verify. A project is interview-ready when you can run it from a clean checkout, demo its failure cases, and explain the design without relying on the README.

## License

MIT. See [`LICENSE`](LICENSE).
