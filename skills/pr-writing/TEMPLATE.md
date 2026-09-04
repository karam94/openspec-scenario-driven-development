## 🎯 Summary

<!-- One or two sentences describing what this PR delivers, in plain language. -->

Adds `GET /characters/:character/quotes` to the public Springfield API, adds pagination to the existing `GET /quotes` list, and retires the long-deprecated singular `GET /quote` endpoint.

## ❓ Why

<!-- The problem or opportunity this addresses, drawn from the proposal. Link the motivation, not the implementation. -->

Consumers keep pulling the entire `GET /quotes` payload just to find lines for one character (Homer alone is ~30% of traffic), which is slow and wasteful. There's no first-class way to ask for a single character's quotes, and the unpaginated list has grown large enough to time out for some clients. Meanwhile the singular `GET /quote` (one random quote) has been superseded by `GET /quotes?limit=1&random=true` and marked deprecated for two releases.


## 🛠 Changes

<!--
- Very high level bullet list of the concrete, observable changes.
- Every bullet MUST start with an emoji: ✨ new behaviour, 🔧 changed behaviour, 💩 removed behaviour. For anything that isn't one of those, use a fitting emoji (e.g. ⚠️ error handling, 🔒 security, ⚡ performance, 📝 docs).
- Group by capability or scenario where it aids the reviewer.
- Mark breaking changes with **BREAKING**.
-->

- ✨ Add `GET /characters/:character/quotes` — returns all quotes for a character (case-insensitive, e.g. `homer`, `Homer`, `HOMER`), with the same `limit`/`offset` pagination as the list endpoint.
- 🔧 Add `limit` (default `50`, max `200`) and `offset` (default `0`) query params to `GET /quotes`; responses now include a `total` count and `nextOffset`. Existing callers with no params get the first 50 instead of the full dump. **BREAKING** for clients that relied on receiving every quote in one response.
- 💩 Remove the deprecated `GET /quote` endpoint; it now returns `410 Gone` with a pointer to `GET /quotes?limit=1&random=true`.
- ⚠️ Unknown character → `404` with `{ error: "Unknown character" }`, matched against the canonical cast list.


## 💥 Breaking Changes

<!-- Delete this section if none. List each behaviour change that could break existing consumers and, where relevant, the migration path. -->

- `GET /quotes` now returns 50 records by default instead of the entire dataset.
- `GET /quote` has been removed and returns `410 Gone`.


## 👀 Suggested Reviewer Focus

<!--
Call out anything that deserves particular scrutiny.
Delete this section if there is nothing noteworthy.
-->

- ⚠️ Pagination changes the default behaviour of `GET /quotes`.
- 🔍 Please sanity-check the backwards compatibility implications for existing consumers.
- 🧠 Character matching logic lives in `src/characters/...`.

## 🚀 Deployment & Operational Impact

<!-- Delete this section if none apply. One line per item; keep to what's operationally relevant. -->

- **Migration:** None
- **Config:** None
- **Feature flag:** None
- **Rollback risk:** Low — existing `/quotes` consumers may now depend on the new pagination behaviour.
- **Monitoring:** Existing API latency/error dashboards cover the new endpoint.


## 🧪 Testing

### 📜 Acceptance Criteria
<!--
- One top-level bullet per acceptance scenario this pull request exercises, holding the emoji marker and a **bold** short scenario title. Where OpenSpec has created scenarios that drove development, these should be listed.
- Nest each **GIVEN** / **WHEN** / **THEN** / **AND** clause as its own sub-bullet under the scenario so they render on separate lines.
- If an acceptance scenario is new behaviour the top-level bullet should start with ✨. If it's changing existing functionality it should start with 🔧. If it's deleting functionality it should start with 💩.
-->
<!--
- ✨ **Short scenario title**
  - **GIVEN** ...
  - **WHEN** ...
  - **THEN** ...
-->

- ✨ **Character quotes endpoint returns only that character's quotes**
  - **GIVEN** the API has quotes for Homer
  - **WHEN** a client sends `GET /characters/homer/quotes`
  - **THEN** `200` with only Homer's quotes and a `total` count
- ✨ **Character quotes endpoint paginates**
  - **GIVEN** a character with more quotes than the page size
  - **WHEN** a client sends `GET /characters/homer/quotes?limit=10&offset=10`
  - **THEN** `200` with quotes 11–20 and a `nextOffset` of `20`
- ✨ **Unknown character is rejected**
  - **GIVEN** a name that isn't in the cast
  - **WHEN** a client sends `GET /characters/frank-grimes-jr/quotes`
  - **THEN** `404` with `{ error: "Unknown character" }`
- 🔧 **`GET /quotes` defaults to the first page**
  - **GIVEN** the full quote set
  - **WHEN** a client sends `GET /quotes` with no params
  - **THEN** `200` with the first 50 quotes, a `total`, and a `nextOffset`
  - **AND** the response is no longer the entire list
- 🔧 **`GET /quotes` clamps oversized page requests**
  - **GIVEN** the full quote set
  - **WHEN** a client sends `GET /quotes?limit=500`
  - **THEN** `200` with at most 200 quotes (the limit is clamped)
- 💩 **Retired `GET /quote` responds Gone**
  - **GIVEN** a client on the old integration
  - **WHEN** they send `GET /quote`
  - **THEN** `410 Gone` with a message pointing at `GET /quotes?limit=1&random=true`


### ✅ Test Suites
<!--
- A table of every test suite run. Columns: Test Suite | Status | Added | Removed | Notes.
- Put test counts in the Added/Removed columns using GitHub inline math so they render coloured:
  green for additions `$\color{green}{+N}$`, red for removals `$\color{red}{-N}$`. Use `–` when a column doesn't apply.
-->

| Test Suite | Status | Added | Removed | Notes |
| --- | --- | --- | --- | --- |
| `test/characters-quotes.spec.ts` | new | $\color{green}{+3}$ | – | Character endpoint scenarios |
| `test/quotes.spec.ts` | updated | $\color{green}{+3}$ | $\color{red}{-1}$ | Pagination defaults & clamping; drops old `GET /quote` happy path |
| `test/quote-gone.spec.ts` | new | $\color{green}{+1}$ | – | `410` on the retired endpoint |
| Full API suite | re-run | – | – | Green |

### ‼️ Failed to Test
<!--
- Note anything that could not be verified and why.
- Every item MUST include a nested **Next steps** sub-bullet stating what still needs doing to verify it (e.g. the exact manual test to run, the environment required, or who needs to check it).
-->

- Could not verify behaviour behind the CDN cache layer locally (no edge in the test harness); the `Cache-Control` change on `/quotes` was validated by unit assertion on the response header only, not an end-to-end cache hit.
  - **Next steps:** after deploy to staging, manually issue two `GET /quotes` requests within the TTL and confirm the second is served from the edge (`age` header > 0 / `x-cache: HIT`), then confirm a `no-store` request bypasses it.
