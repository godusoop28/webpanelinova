import "server-only";

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function requireEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(
      `Falta la variable de entorno "${name}". Revisa .env.example para configurarla.`
    );
  }
  return value;
}

/**
 * Google Sheets normalizes the PEM newlines when stored as a single-line env var.
 */
function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

export const env = {
  google: {
    get projectId() {
      return requireEnv("GOOGLE_PROJECT_ID");
    },
    get clientEmail() {
      return requireEnv("GOOGLE_CLIENT_EMAIL");
    },
    get privateKey() {
      return normalizePrivateKey(requireEnv("GOOGLE_PRIVATE_KEY"));
    },
    get spreadsheetId() {
      return requireEnv("GOOGLE_SPREADSHEET_ID");
    },
  },
  make: {
    get webhookSecret() {
      return requireEnv("MAKE_WEBHOOK_SECRET");
    },
    get syncWebhookUrl() {
      return optionalEnv("MAKE_SYNC_WEBHOOK_URL");
    },
  },
  auth: {
    get secret() {
      return requireEnv("AUTH_SECRET");
    },
    get password() {
      return requireEnv("AUTH_PASSWORD");
    },
  },
  database: {
    /** Optional on purpose: absent means DATA_SOURCE must stay "sheets" (see shouldUseDatabase). */
    get url() {
      return optionalEnv("DATABASE_URL");
    },
  },
  easybroker: {
    get apiKey() {
      return requireEnv("EASYBROKER_API_KEY");
    },
    /**
     * Agent email EasyBroker returns for properties with no dedicated
     * advisor — those leads fall back to the weighted roulette instead of
     * a direct assignment. Configurable per Fase 16 of the migration ask.
     */
    get fallbackAgentEmail() {
      return (optionalEnv("EASYBROKER_FALLBACK_AGENT_EMAIL") ?? "contacto@c21inova.com").toLowerCase();
    },
  },
  manychat: {
    get apiKey() {
      return requireEnv("MANYCHAT_API_KEY");
    },
    /** Flow ManyChat runs to notify an advisor. Per-Company config later; env-wide for now. */
    get advisorFlowId() {
      return optionalEnv("MANYCHAT_ADVISOR_FLOW_ID");
    },
  },
  openai: {
    get apiKey() {
      return requireEnv("OPENAI_API_KEY");
    },
    /**
     * No hardcoded model name: the Make scenario this replaces used
     * "gpt-5.4-mini", but that's this account's choice, not a guarantee of
     * what's available on any given OpenAI key. Configure explicitly.
     */
    get propertySearchModel() {
      return requireEnv("OPENAI_PROPERTY_SEARCH_MODEL");
    },
  },
  integration: {
    /** Shared secret for the new /api/webhooks/* and /api/admin/* endpoints. */
    get secret() {
      return requireEnv("INTEGRATION_SECRET");
    },
  },
  cron: {
    get secret() {
      return requireEnv("CRON_SECRET");
    },
  },
};

// ---------------------------------------------------------------------------
// Data source / automation mode
// ---------------------------------------------------------------------------

export type DataSource = "database" | "sheets";

/**
 * Precedence (documented per Fase 25 — no estados ambiguos):
 *   1. DEMO_MODE active  -> every read path returns lib/demo-data.ts, full
 *      stop. Neither Sheets nor the database are touched. This function is
 *      irrelevant in that case; callers must check isDemoModeActive() first.
 *   2. DATA_SOURCE=database -> Postgres/Prisma is the source of truth.
 *   3. anything else (unset, "sheets", typo) -> Google Sheets, the legacy
 *      behavior every existing deployment already has today. This is the
 *      default specifically so adding Prisma to the project never flips
 *      production reads until someone opts in on purpose.
 */
export function getDataSource(): DataSource {
  return optionalEnv("DATA_SOURCE") === "database" ? "database" : "sheets";
}

export type AutomationMode = "shadow" | "live";

/**
 * Defaults to "shadow" (safe) whenever unset or unrecognized. Fase 55: the
 * panel UI only ever displays this value, never a control to change it —
 * flipping to "live" is a Vercel env var change, deliberately outside the
 * app's own reach.
 */
export function getAutomationMode(): AutomationMode {
  return optionalEnv("AUTOMATION_MODE") === "live" ? "live" : "shadow";
}

export function isLiveAutomation(): boolean {
  return getAutomationMode() === "live";
}

/**
 * Whether the Google Sheets service account is fully configured. When it
 * isn't, lib/google-sheets.ts serves seeded demo data instead of throwing,
 * so the panel can be shown working before Sheets access is wired up.
 */
export function hasGoogleSheetsCredentials(): boolean {
  return Boolean(
    optionalEnv("GOOGLE_PROJECT_ID") &&
      optionalEnv("GOOGLE_CLIENT_EMAIL") &&
      optionalEnv("GOOGLE_PRIVATE_KEY") &&
      optionalEnv("GOOGLE_SPREADSHEET_ID")
  );
}

/**
 * Temporary opt-out for showing the panel to someone outside the team (a
 * client demo) with seeded data and without requiring the login password.
 * Defaults to ON: until told otherwise, the panel should show simulated
 * data by default. Set DEMO_MODE=false on the hosting provider to turn the
 * real login/Sheets data back on.
 */
export function isDemoModeActive(): boolean {
  return optionalEnv("DEMO_MODE") !== "false";
}

/** Whether the panel is currently rendering seeded data instead of real Sheets rows. */
export function isServingDemoData(): boolean {
  return isDemoModeActive() || !hasGoogleSheetsCredentials();
}

/**
 * Gate for lib/google-sheets.ts read functions: whether they're allowed to
 * fall back to seeded demo data instead of hitting Sheets. Without
 * DEMO_MODE, only true in `next dev` without credentials, so the panel can
 * be demoed locally. `next build`/`next start` (and every Vercel
 * deployment, preview or production — both set NODE_ENV=production) throw
 * instead: a deployed panel must never silently render fake advisors
 * because Sheets access broke or was never configured, unless DEMO_MODE
 * explicitly says this is a deliberate demo.
 */
export function shouldUseDemoData(): boolean {
  if (isDemoModeActive()) return true;
  if (hasGoogleSheetsCredentials()) return false;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Google Sheets no está configurado (faltan GOOGLE_PROJECT_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY o GOOGLE_SPREADSHEET_ID) y esta build es de producción, así que no se sirven datos de demostración. Define DEMO_MODE=true si esto es una demo deliberada."
    );
  }
  return true;
}

/**
 * Reports which integrations are missing configuration, for the
 * /integraciones panel and for startup diagnostics. Never throws.
 */
export function getMissingEnvVars(): string[] {
  const required = [
    "GOOGLE_PROJECT_ID",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_SPREADSHEET_ID",
    "MAKE_WEBHOOK_SECRET",
    "MAKE_SYNC_WEBHOOK_URL",
    "AUTH_SECRET",
    "AUTH_PASSWORD",
  ];
  return required.filter((name) => !optionalEnv(name));
}

/**
 * Config-presence booleans for the new stack (Fase 29/37 readiness). Never
 * throws, never returns a secret value — only whether one is set.
 * `databaseReachable` is deliberately excluded: it needs an actual
 * connection attempt, which belongs in the route handler (lib/db.ts's
 * checkDatabaseConnection), not here.
 */
export function getIntegrationReadiness() {
  return {
    databaseConfigured: Boolean(optionalEnv("DATABASE_URL")),
    easyBrokerConfigured: Boolean(optionalEnv("EASYBROKER_API_KEY")),
    manyChatConfigured: Boolean(optionalEnv("MANYCHAT_API_KEY")),
    openAIConfigured: Boolean(optionalEnv("OPENAI_API_KEY")),
    integrationSecretConfigured: Boolean(optionalEnv("INTEGRATION_SECRET")),
    googleSheetsConfigured: hasGoogleSheetsCredentials(),
    makeConfigured: Boolean(optionalEnv("MAKE_WEBHOOK_SECRET")),
    automationMode: getAutomationMode(),
    dataSource: getDataSource(),
  };
}
