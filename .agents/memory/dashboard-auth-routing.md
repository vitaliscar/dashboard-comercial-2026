---
name: Dashboard auth routing
description: Role-based dashboard redirects must wait for the assigned-unit catalog before resolving a single-unit commercial manager.
---

For client-side role redirects, do not fall back to the global management route while the unit catalog is still loading; defer the redirect until the assigned unit can be matched by ID.

**Why:** Auth/profile data and catalog data arrive independently, so an eager fallback can send a single-unit gerente_comercial to the wrong destination before the catalog resolves.

**How to apply:** Gate the redirect on catalog readiness only for the single-unit branch; multi-unit or zero-unit profiles can resolve immediately to the global route.