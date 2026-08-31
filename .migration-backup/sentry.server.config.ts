import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.2,
  // GlitchTip self-hosted no soporta todas las features de Sentry SaaS
  // (profiling, session replay) — se omiten deliberadamente.
});
