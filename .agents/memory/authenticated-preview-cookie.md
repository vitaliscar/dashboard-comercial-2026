---
name: Authenticated preview cookie isolation
description: Browser screenshots do not inherit cookies created by curl against the development domain.
---

Use a short-lived, development-only session bridge when visual QA must exercise authenticated routes, then remove the bridge and its fixtures before finishing.

**Why:** The screenshot browser and shell requests use separate cookie jars, so API login verification alone can silently render the unauthenticated demo fallback.

**How to apply:** Prefer the real login flow for app behavior; only add a narrowly scoped temporary bridge for visual capture, and verify its route and QA records are gone afterward.