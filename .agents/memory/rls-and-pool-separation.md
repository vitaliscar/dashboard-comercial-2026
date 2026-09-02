---
name: RLS and pool separation
description: The commercial API needs separate administrative and application database connections plus request-scoped transactions.
---

The commercial API must treat the application connection as non-BYPASSRLS and reserve the administrative connection for authentication and operational work. Every scoped request must set the role, user, and primary branch context inside a transaction; application-level filters remain defense in depth.

**Why:** The development database was observed using a superuser with BYPASSRLS and no active policies, so a successful query alone does not prove row isolation.

**How to apply:** Before production release, provision both connection roles, apply the existing RLS policies, and test gerencia, gerente comercial, coordinador multi-sucursal, and asesor isolation end to end.