---
name: API migration quirks
description: Constraints discovered while moving the commercial dashboard from Next server actions to the shared Replit API.
---

Orval v8 emits Zod 4 syntax unless the Zod target is explicitly pinned; this workspace uses Zod 3, so code generation must keep `override.zod.version` at 3.

**Why:** The generated contract can look valid while failing the workspace build with `zod.email()` and `zod.uuid()` when the installed dependency is Zod 3.

**How to apply:** Re-run API code generation after OpenAPI changes and verify the generated Zod package and all workspace typechecks together.