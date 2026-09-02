import type { Response } from "express";

const COOKIE_NAME = "ccv_session";
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;

function secureSuffix() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function setSessionCookie(
  response: Response,
  sessionId: string,
  expiresAt: Date,
) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; Max-Age=${SESSION_TTL_SECONDS}; Expires=${expiresAt.toUTCString()}; Path=/; HttpOnly; SameSite=Lax${secureSuffix()}`,
  );
}

export function clearSessionCookie(response: Response) {
  response.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax${secureSuffix()}`,
  );
}