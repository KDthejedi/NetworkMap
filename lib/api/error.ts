/**
 * Standard error envelope per spec section 9.10.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "AGENT_BUSY"
  | "FORBIDDEN_TIER_TRANSITION"
  | "TOUCHPOINT_LOCKED"
  | "EXPORT_IN_PROGRESS"
  | "INTERNAL_ERROR";

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  AGENT_BUSY: 503,
  FORBIDDEN_TIER_TRANSITION: 409,
  TOUCHPOINT_LOCKED: 409,
  EXPORT_IN_PROGRESS: 409,
  INTERNAL_ERROR: 500,
};

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      error: { code, message, ...(details ? { details } : {}) },
      request_id: randomUUID(),
    },
    { status: STATUS[code] },
  );
}

export function apiOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}
