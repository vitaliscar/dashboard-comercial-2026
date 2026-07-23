import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// La cookie httpOnly de sesión viaja sola con cada request SSR/RPC — ya no
// hace falta adjuntar un Bearer manualmente (ver src/lib/server/auth.ts).
export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
