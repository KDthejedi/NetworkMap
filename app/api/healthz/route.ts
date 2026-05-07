import { NextResponse } from "next/server";
import { pool } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await pool.query<{ ok: number }>("SELECT 1 as ok");
    return NextResponse.json({
      status: "ok",
      db: result.rows[0]?.ok === 1 ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "error",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
