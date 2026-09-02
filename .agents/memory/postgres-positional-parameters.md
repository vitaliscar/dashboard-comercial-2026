---
name: Postgres positional parameters
description: Prevent PostgreSQL type-inference failures when several queries share one positional parameter array.
---

When a query receives a shared positional parameter array, reference and explicitly cast every placeholder used by that array, even when a particular query only needs a subset.

**Why:** PostgreSQL rejects otherwise valid prepared statements when an unused positional placeholder has no type context, producing `could not determine data type of parameter`.

**How to apply:** Prefer query-specific parameter arrays. If keeping one shared array for parallel queries, add typed predicates for otherwise-unused placeholders and verify every query variant, including drilldowns.