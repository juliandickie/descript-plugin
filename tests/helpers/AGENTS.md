<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# helpers

## Purpose

Shared test infrastructure. Currently one module, the `mockFetch` builder, used by nearly every test in the suite.

## Key Files

| File | Description |
|------|-------------|
| `mockFetch.ts` | Builds a queueable `fetch` mock. Each test pushes expected `{ url, method, body?, response }` records; the mock pops them on each call and asserts the request shape. Throws on unexpected calls. Exposes a `assertDrained()` helper to confirm every queued expectation was hit. |

## For AI Agents

### Working In This Directory

- This is the single place real `fetch` is mocked. Tests should NEVER stub `globalThis.fetch` directly, they should compose through `mockFetch`.

- New shared helpers go here, not next to the tests that use them. Tests-helpers cross-references stay shallow (`../helpers/...`).

- Helpers must be hermetic-friendly: no module-level state that survives between tests. Each call returns a fresh mock.

- Documented in `cli.test.ts` and most workflow tests by example.

### Common Patterns

- Order matters in the queue. Tests assert call sequence implicitly.

- The mock returns the queued `response` object as a `Response`-shaped value with `ok`, `status`, `json()`, `text()`, and `arrayBuffer()` as appropriate.

## Dependencies

### Internal

- None.

### External

- The standard `Response` constructor (Node 24 global).

<!-- MANUAL: -->
