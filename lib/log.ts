/**
 * Structured logger (spec section 10.6). pino with request_id correlation.
 * Used by route handlers and the agent runner.
 */
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "networkmap" },
  ...(isDev
    ? {
        transport: {
          target: "pino/file",
          options: { destination: 1 },
        },
      }
    : {}),
  redact: {
    paths: [
      "password",
      "token",
      "access_token",
      "refresh_token",
      "*.password",
      "*.token",
      "user.email",
      "*.user.email",
    ],
    remove: true,
  },
});

export function child(bindings: Record<string, unknown>) {
  return log.child(bindings);
}
