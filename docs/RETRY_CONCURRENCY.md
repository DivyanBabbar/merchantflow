# Retry and concurrency guide

MerchantFlow is a local learning project. The simulator does not process real payments.

| Risk or retry case | Mechanism | Covering test |
| --- | --- | --- |
| Client retries an unchanged order after a network error | UI retains one idempotency key for the same product and quantity; server stores request hash and response | `server/test/api.test.js` — “order creation is replay-safe…”; client E2E exercises the create flow |
| Same key is reused for different inputs | Server compares normalized request hash and returns 409 | `server/test/api.test.js` — same idempotency test |
| Two orders contend for one unit | Product row is selected `FOR UPDATE` inside the reservation transaction | `server/test/api.test.js` — “concurrent orders cannot reserve more units than are in stock” |
| Duplicate simulated capture delivery | Unique event ID plus order lock; duplicate event does not create another payment or ledger pair | `server/test/api.test.js` — “concurrent duplicate capture webhooks…” |
| Cancellation races or repeats | Order row lock and PENDING state check; stock release shares the transaction | `server/test/api.test.js` — “cancel releases the reserved inventory once…” |
| Capture/refund changes ledger state | State transition and debit/credit pair share one database transaction | `server/test/api.test.js` — “capture and refund transition state…”; `server/test/domain.test.js` checks pair directions |
| Lost update in an unsafe stale-read implementation | Two clients intentionally read one unit, then write a stale absolute stock value | `server/test/oversell-experiment.test.js` reproduces the oversell; the concurrent-order integration test verifies the production path |

Run PostgreSQL tests against a disposable local database with `RUN_INTEGRATION_TESTS=1` and `DATABASE_URL` set. See [TESTING.md](TESTING.md) for commands and observed results.
