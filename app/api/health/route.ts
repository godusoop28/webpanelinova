import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/db";
import { getAutomationMode } from "@/lib/env";

/** Fase 29: public, no secrets, safe to hit from an uptime monitor. */
export async function GET() {
  const database = await checkDatabaseConnection();
  return NextResponse.json({
    status: database.ok ? "ok" : "degraded",
    database: database.ok ? "connected" : "unavailable",
    automationMode: getAutomationMode(),
  });
}
