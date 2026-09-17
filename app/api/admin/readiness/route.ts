import { NextResponse } from "next/server";
import { requireAdminApi, unauthorizedResponse } from "@/lib/api-auth";
import { checkDatabaseConnection, isDatabaseConfigured } from "@/lib/db";
import { getIntegrationReadiness } from "@/lib/env";

/** Fase 29/56: admin-only, booleans only — never a secret value. */
export async function GET() {
  const authResult = await requireAdminApi();
  if (!authResult.ok) return unauthorizedResponse(authResult);

  const config = getIntegrationReadiness();
  const databaseReachable = isDatabaseConfigured() ? (await checkDatabaseConnection()).ok : false;

  return NextResponse.json({
    databaseConfigured: config.databaseConfigured,
    databaseReachable,
    easyBrokerConfigured: config.easyBrokerConfigured,
    manyChatConfigured: config.manyChatConfigured,
    openAIConfigured: config.openAIConfigured,
    integrationSecretConfigured: config.integrationSecretConfigured,
    googleSheetsConfigured: config.googleSheetsConfigured,
    makeConfigured: config.makeConfigured,
    automationMode: config.automationMode,
    dataSource: config.dataSource,
  });
}
