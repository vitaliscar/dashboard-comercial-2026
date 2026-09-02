---
name: RLS schema drift
description: Durable rule for applying role-aware SQL to tables whose dimensions differ from the canonical business model.
---

Role predicates must be selected per table schema, not blindly appended by the caller's role. Some commercial aggregates are scoped by sucursal/unidad only and do not have an `asesor_id`; the database policy remains the authority for whether an asesor can see those rows.

**Why:** Applying a generic asesor predicate to drifted tables caused PostgreSQL parse failures in the real transaction path even though direct RLS checks passed.

**How to apply:** When adding or changing a shared query scope helper, explicitly opt tables in or out of each dimension and validate every supported role against the real endpoint.