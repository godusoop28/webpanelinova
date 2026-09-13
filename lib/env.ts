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
    "EASYBROKER_API_KEY",
    "MAKE_WEBHOOK_SECRET",
    "MAKE_SYNC_WEBHOOK_URL",
    "AUTH_SECRET",
    "AUTH_PASSWORD",
  ];
  return required.filter((name) => !optionalEnv(name));
}
