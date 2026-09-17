import { NextResponse } from "next/server";
import { requireAdminApi, unauthorizedResponse } from "@/lib/api-auth";
import { checkDatabaseConnection, isDatabaseConfigured } from "@/lib/db";
import { getIntegrationReadiness } from "@/lib/env";

/** Admin-only, booleans only — never a secret value. */
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
    automationMode: config.automationMode,
  });
}
