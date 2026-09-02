---
name: Dashboard build validation
description: Environment requirements for validating the dashboard artifact outside its managed workflow
---

The dashboard's Vite build expects both `PORT` and `BASE_PATH` to be present when run directly; the managed artifact workflow injects these values automatically.

**Why:** Running the package build without workflow-provided configuration fails before compilation, which can be mistaken for an application regression.

**How to apply:** For direct local validation, provide a temporary supported port and the dashboard artifact base path; do not change application code or workflow configuration to work around it.