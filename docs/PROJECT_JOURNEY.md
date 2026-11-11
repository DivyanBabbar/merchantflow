# MerchantFlow project journey

This document is the practical story behind the repo: what you are learning, what order to build in, and how to prove each decision with evidence instead of vague "it works" claims.

The goal is not to write a polished product from day one. The goal is to learn system design by building visible constraints: inventory, idempotency, payment state, ledger correctness, and duplicate-event handling.

## Why this repo exists

MerchantFlow is a small commerce workflow built to practice the exact problems that show up in real backend work:

- validating requests before mutating state
- making operations safe under retries and duplicate calls
- keeping money and inventory consistent
- handling event replay and out-of-order delivery
- proving correctness with automated checks

This project sits in the middle of a broader learning path: small systems first, then a more realistic flow that grows in complexity without losing clarity.

## The learning path

### Phase 1: build the fundamentals elsewhere

Before tackling MerchantFlow, spend time on two smaller projects:

1. Pocket Ledger
   - a command-line app for tracking income and expenses
   - learn data structures, validation, CSV persistence, and edge-case handling

2. Study Queue
   - a browser app for task management
   - learn DOM state, forms, accessibility, localStorage, and UI behavior under edge conditions

These projects are intentionally small. The point is to get comfortable with correctness, testing, and clear documentation before building a multi-part system.

### Phase 2: build MerchantFlow as a realistic single-service app

MerchantFlow should be built in visible steps, not in one giant leap.

Start with the simplest order flow that actually works:

- create a product
- create an order with an idempotency key
- view orders and totals
- simulate capture and refund

Then add the reliability and correctness layer:

- duplicate request handling
- duplicate event rejection or deduplication
- stock reservation and release on cancel
- ledger entry balance rules
- real transaction boundaries in Postgres

Only after that, add the resilience experimentation:

- replay webhooks
- retry scenarios
- reconciliations
- load and timing measurements

## Suggested release stages

### v0-simple

This is the minimal working demo.

Focus:

- product creation
- order creation
- payment simulation
- ledger display
- a simple React dashboard

Question to answer:

- Can a person create a realistic flow end-to-end in a local environment without confusion?

### v1-correctness

This is the quality pass.

Focus:

- idempotency keys for order creation
- duplicate request rejection
- locking inventory while reserving stock
- payment state transitions
- balanced ledger entries
- database transaction safety
- explicit invariant checks

Question to answer:

- What incorrect states are possible, and how do we prevent them?

### v2-resilience

This is the operational pass.

Focus:

- replaying the same payment webhook or event multiple times
- retry behavior and retry-safe logic
- reconciliation between state and ledger
- failure injection in a controlled way
- measurements of throughput, retries, and recovery time

Question to answer:

- What breaks under duplicate or delayed events, and how do we recover without data loss?

## What to document at each stage

Every milestone should include concrete evidence instead of a broad summary.

Add:

- the problem you were trying to solve
- the failing behavior you reproduced
- the fix you implemented
- the tests or checks that prove it
- any tradeoff or limitation you kept intentionally

A good project log has short notes like this:

- "On retry, the same payment event created a second ledger row. We fixed this by making event processing idempotent by event ID."
- "Stock dropped below zero when a cancel path fired after a failed capture. We fixed this by moving stock changes into a single database transaction."

That is much more useful than a generic README that says the app is "reliable".

## What to keep in mind while building

### 1. Start with business invariants

The most important questions are not UI questions. They are invariants like:

- inventory must never go negative
- a payment capture must never create an unbalanced ledger
- the same idempotency key must never represent two different requests
- an event with the same ID must produce the same result every time

If those are wrong, the app is broken even if the UI looks great.

### 2. Treat retries as part of the design

A real system receives duplicate requests, partial failures, and delayed events. That is normal.

The project should deliberately explore:

- duplicate POSTs
- repeated webhook calls
- idempotent operations
- retry-safe database updates

### 3. Prove with tests, not intuition

Every new rule should be backed by a test or reproducible check. Examples:

- order creation rejects a reused idempotency key with a different payload
- duplicate payment events do not create duplicate ledger entries
- canceling a pending order restores reserved stock
- ledger totals remain balanced after refund and capture flows

### 4. Keep the app small enough to understand

This project should remain a modular monolith until you have evidence that a split is necessary.

Do not add a queue, worker, or microservice just because it looks modern. Add it only when a real measurement or operational problem demands it.

## Recommended evidence to collect

Keep a single place for notes and artifacts. For each milestone write down:

- the scenario
- the expected result
- the actual result
- root cause
- fix
- proof

Examples of evidence:

- terminal output from failing tests
- SQL snippets showing the invariant
- small diagrams of state transitions
- screenshots or short recordings of the dashboard flow
- a note on why a design choice was better than the previous one

## Practical roadmap for this repo

Use the repo in this order:

1. Learn the basic flow in a clean MVP.
2. Lock down correctness before adding complexity.
3. Add duplicate/retry scenarios and document the failures.
4. Measure the effect of each fix.
5. Only then decide whether the architecture should split or scale.

## Done criteria

A stage is complete when:

- the behavior is reproducible
- the edge case is documented
- the fix is tested
- the result is easy to explain in one or two paragraphs

That is the standard for a useful portfolio project: not "it works on my machine", but "here is the problem, here is the invariant, here is the proof."

## In one sentence

MerchantFlow is a learning project for building a small commerce system that is correct under failure, explicit about its invariants, and documented with evidence rather than hype.
