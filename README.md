# MerchantFlow

I built MerchantFlow to explore the parts of a small commerce system that are easy to overlook in a happy-path demo: retries, inventory consistency, payment state, and keeping a ledger balanced. It is a local portfolio project, built with React, Node.js, and PostgreSQL. The payment gateway is simulated; no real payments are processed.

MerchantFlow follows two completed projects of mine: [Pocket Ledger](https://github.com/DivyanBabbar/pocket-ledger), a C++ command-line finance tracker, and [Study Queue](https://github.com/DivyanBabbar/study-queue), a browser-based task app. I describe that progression and the problems I am exploring in [the project journey](docs/PROJECT_JOURNEY.md).

## Run locally

Requirements: Docker Desktop with Compose, Node.js 20 or newer, and npm.

```bash
docker compose up --build
```

Open the dashboard at <http://localhost:5173> and the API at <http://localhost:3000>. The API health endpoint is <http://localhost:3000/health>.

The first boot creates a demo product. Use the dashboard to create an order and choose **Simulate capture**. The order list refreshes with its payment status and ledger total.

To stop the services, run `docker compose down`. Add `-v` only if you also want to delete the local PostgreSQL data volume.

## What it does

- Create and list products.
- Create an order with a caller-provided idempotency key.
- Replay an identical order request with the same key; reject reuse of that key with a different request body.
- Simulate capture, refund, and pending-order cancellation without a payment provider.
- Record event IDs uniquely and write balanced ledger entries in the same database transaction as the order update.
- View orders and ledger totals in a small React dashboard.

## API

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
| `POST` | `/api/v1/simulator/webhooks` | Replay a local payment event by ID |

Amounts are integer cents. The fake gateway is local-only and intentionally does not model card processing, settlement, or a real provider's signature scheme.

## Design notes

- PostgreSQL constraints protect inventory, idempotency keys, event IDs, and ledger structure.
- Order creation uses a transaction and locks the product row while reserving stock.
- Captures and refunds update payment state, order state, and balanced ledger rows atomically.
- Event processing is idempotent by event ID. The simulator makes it possible to submit the same event more than once and inspect the duplicate path.
- The app is a modular monolith. I am keeping it that way unless measurements or a concrete requirement justify a split.
- The API has no authentication and is intended for a local demo. Do not expose it to the public internet.

## Development

```bash
cd server && npm install && npm test
cd ../client && npm install && npm run build
```

The domain tests use Node's built-in test runner. API integration tests use a real PostgreSQL database and are opt-in so they cannot modify a database accidentally. For the database setup and test command, see the server's test documentation.

## Project journey

I have completed [Pocket Ledger](https://github.com/DivyanBabbar/pocket-ledger) and [Study Queue](https://github.com/DivyanBabbar/study-queue). They gave me a foundation in data validation, persistence, browser state, and accessibility. MerchantFlow is where I am applying those ideas to transactions, retries, and consistency across an API and database. More context is in [`docs/PROJECT_JOURNEY.md`](docs/PROJECT_JOURNEY.md).

## License

MIT. See [`LICENSE`](LICENSE).
