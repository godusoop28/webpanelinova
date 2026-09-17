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

export const env = {
  auth: {
    get secret() {
      return requireEnv("AUTH_SECRET");
    },
  },
  database: {
    get url() {
      return requireEnv("DATABASE_URL");
    },
  },
  easybroker: {
    get apiKey() {
      return requireEnv("EASYBROKER_API_KEY");
    },
    /** Agent email EasyBroker returns for a property with no dedicated advisor — falls back to the weighted rotation. */
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
    /** No hardcoded default — configure the model your OpenAI account actually has access to. */
    get propertySearchModel() {
      return requireEnv("OPENAI_PROPERTY_SEARCH_MODEL");
    },
  },
  integration: {
    /** Shared secret for /api/webhooks/* (ManyChat) and the admin API. */
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

export type AutomationMode = "shadow" | "live";

/**
 * Internal safety switch, not a product feature: "shadow" runs the full
 * pipeline (Lead/LeadAssignment/AuditLog all real) without ever calling
 * EasyBroker/ManyChat for real. Defaults to "shadow" whenever unset. The
 * panel UI never exposes a control for this — flipping to "live" is a
 * hosting-provider env var change only.
 */
export function getAutomationMode(): AutomationMode {
  return optionalEnv("AUTOMATION_MODE") === "live" ? "live" : "shadow";
}

export function isLiveAutomation(): boolean {
  return getAutomationMode() === "live";
}

/** Internal-only diagnostics page (/testing). Off unless explicitly enabled — never shown in the sidebar either way. */
export function isInternalTestingEnabled(): boolean {
  return optionalEnv("ENABLE_INTERNAL_TESTING") === "true";
}

/**
 * Config-presence booleans for /api/admin/readiness. Never throws, never
 * returns a secret value — only whether one is set. `databaseReachable` is
 * excluded on purpose: it needs an actual connection attempt (lib/db.ts's
 * checkDatabaseConnection), not just an env var check.
 */
export function getIntegrationReadiness() {
  return {
    databaseConfigured: Boolean(optionalEnv("DATABASE_URL")),
    easyBrokerConfigured: Boolean(optionalEnv("EASYBROKER_API_KEY")),
    manyChatConfigured: Boolean(optionalEnv("MANYCHAT_API_KEY")),
    openAIConfigured: Boolean(optionalEnv("OPENAI_API_KEY")),
    integrationSecretConfigured: Boolean(optionalEnv("INTEGRATION_SECRET")),
    automationMode: getAutomationMode(),
  };
}
