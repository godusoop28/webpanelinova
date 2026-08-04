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
  easybroker: {
    get apiKey() {
      return requireEnv("EASYBROKER_API_KEY");
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
};

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
    "EASYBROKER_API_KEY",
    "MAKE_WEBHOOK_SECRET",
    "AUTH_SECRET",
    "AUTH_PASSWORD",
  ];
  return required.filter((name) => !optionalEnv(name));
}
