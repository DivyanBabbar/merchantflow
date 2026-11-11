# Learning path: small systems to MerchantFlow

The goal is to show fundamentals first, then connect them in a product. Keep each exercise small enough to finish and explain. Use separate repositories for the first two exercises; keep MerchantFlow as the capstone.

## Project 1 — Pocket Ledger (C++ command-line app)

**Build:** add income and expenses, list entries, filter by month/category, and show a balance. Store data in a CSV file.

**Learn:** structs/classes, vectors, functions, input validation, file I/O, dates, and basic tests.

**Break and rebuild:** start with a simple vector and CSV format. Try malformed rows, negative amounts, duplicate IDs, and a crash during save. Add validation, stable IDs, safe file replacement, and a small test suite. Write down what could still go wrong.

**Done when:** a clean clone compiles with one documented command, sample data works, and edge cases are demonstrated in a short terminal recording.

## Project 2 — Study Queue (HTML, CSS, JavaScript)

**Build:** a responsive task queue with create, edit, complete, filter, and search actions. Persist it in browser local storage. Use semantic HTML and plain JavaScript before adding a framework.

**Learn:** DOM events, state, forms, accessibility, CSS layout, browser storage, and HTTP basics by inspecting requests in the browser tools.

**Break and rebuild:** try empty/oversized input, refresh during editing, duplicate clicks, keyboard-only use, and a narrow screen. Add clear validation, empty/loading/error states, accessible labels, and focused modules.

**Done when:** it works on mobile and desktop, keyboard users can finish every action, and the README explains the state model.

## Project 3 — MerchantFlow (React, Node.js, PostgreSQL)

**Build:** start with the existing demo order flow. Then add seller-facing product/order management, simulated payment events, refunds, and ledger history.

**Learn:** React components, JavaScript/TypeScript, REST APIs, SQL, database transactions, API contracts, Docker, and CI.

**Break and rebuild:** document the initial failure, reproduce it in an automated test, fix it, and show the test passing. Prioritize duplicate requests, duplicate/out-of-order events, stock contention, timeout/retry behavior, and interrupted processing. Record before/after measurements for any performance change.

**Done when:** the app starts from a clean clone, the demo is repeatable, and correctness claims are backed by tests or measurements.

## How to show the journey

Use one concise README for each small project and a detailed decision log for MerchantFlow. Include dated notes, diagrams, test output, and short demos. Do not invent bug stories or performance numbers. AI assistance is fine; keep the decisions and explanations yours, and be ready to modify the code live.

## Suggested order inside MerchantFlow

1. `v0-simple`: happy-path product and order creation.
2. `v1-correctness`: validation, transactional inventory, idempotency, payment state machine, and ledger invariants.
3. `v2-resilience`: replayable webhooks, retry experiments, reconciliation, and measured load improvements.

Keep a modular monolith until measurements give a concrete reason to split a component into another service.
