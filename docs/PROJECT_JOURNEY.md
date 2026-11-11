# From small tools to MerchantFlow

I built Pocket Ledger and Study Queue before starting MerchantFlow. They are finished projects, not exercises waiting to be done. Each gave me a chance to work through a different set of problems, and MerchantFlow brings those lessons into a system with a database, an API, and payment-like events.

This page is the public record of that progression: what each project does, what I took from it, and what I am working to understand in MerchantFlow. I want the code, tests, and documented limitations to speak for themselves; I do not want to claim reliability without showing how it is checked.

## Pocket Ledger — finished

[ Pocket Ledger ](https://github.com/DivyanBabbar/pocket-ledger) is a C++17 command-line income and expense tracker. It saves entries to CSV, stores amounts as integer paise, supports listing and monthly or all-time totals, and handles malformed rows without stopping at the first bad record.

Building it taught me to be precise about data at the edges: parsing CSV, validating dates and amounts, and avoiding floating-point arithmetic for money. It also gave me a small codebase where I could build and test the core behavior without external dependencies.

## Study Queue — finished

[Study Queue](https://github.com/DivyanBabbar/study-queue) is a responsive study-task app built with HTML, CSS, and vanilla JavaScript. It supports creating, editing, completing, filtering, searching, and deleting tasks, with task data stored in versioned browser local storage.

I focused on keyboard access, accessible status announcements, input handling, and safe rendering of user text. The project helped me understand how much of a frontend app is state management and careful handling of user input, even without a framework or server.

## MerchantFlow — current project

MerchantFlow is a small seller workflow built with React, Node.js, and PostgreSQL. It lets a user manage products and orders, simulate captures and refunds, and inspect the resulting ledger. The payment gateway is a local simulator; this project does not process real payments.

The main challenge is keeping state correct when requests or events are repeated. The current implementation uses idempotency keys for order creation, database transactions for inventory and payment updates, unique event IDs, and balanced ledger entries. I have kept it as a modular monolith so the flow stays understandable while I work through those guarantees.

## What I am exploring

I am using MerchantFlow to make correctness visible rather than treating it as an assumption. The cases I care about include:

- repeating an order request with the same key, and rejecting a different request under that key
- reserving and releasing stock without allowing inventory to become negative
- receiving the same simulated payment event more than once
- keeping order/payment state and ledger entries consistent through capture, refund, and cancellation

I want each behavior to be backed by a test or a reproducible demo. When I investigate a failure, I will record what happened, why it happened, and how the fix is verified rather than inventing a success story after the fact.

## How I approach the work

I am keeping the project small enough to reason about. I will add a queue, worker, or separate service only if a concrete requirement or measurement makes the case for it. For now, the useful work is in the domain rules, transaction boundaries, API behavior, and tests.

The progression is straightforward:

1. Keep the end-to-end seller flow easy to run and demonstrate.
2. Test the correctness boundaries: retries, inventory, payment transitions, and ledger balance.
3. Use the event simulator to explore duplicate and delayed delivery.
4. Add complexity only when I can explain the problem it solves and show evidence that it helps.

## Links

- [Pocket Ledger](https://github.com/DivyanBabbar/pocket-ledger) — completed C++ command-line app
- [Study Queue](https://github.com/DivyanBabbar/study-queue) — completed browser task app
- [MerchantFlow](https://github.com/DivyanBabbar/merchantflow) — current commerce workflow project
