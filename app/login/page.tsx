import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { ShieldCheck } from "lucide-react";
import { isDemoModeActive } from "@/lib/env";

// See app/page.tsx: DEMO_MODE must be re-checked per request.
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Contraseña incorrecta. Intenta de nuevo.",
  Configuration: "El acceso al panel aún no está configurado. Contacta al equipo técnico.",
  Default: "No pudimos iniciar sesión. Intenta nuevamente.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  if (isDemoModeActive()) {
    redirect("/dashboard");
  }
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage = params.error
    ? (ERROR_MESSAGES[params.error] ?? ERROR_MESSAGES.Default)
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-ink-900 text-lg font-bold tracking-tight text-gold-400">
            C21
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Century 21 Inova</h1>
            <p className="text-sm text-ink-400">Panel administrativo</p>
          </div>
        </div>

        <div className="card p-6">
          <div className="mb-5 flex items-center gap-2 text-ink-700">
            <ShieldCheck className="size-4 text-gold-600" aria-hidden />
            <p className="text-xs">Acceso restringido a personal autorizado</p>
          </div>

          {errorMessage && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {errorMessage}
            </div>
          )}

          <form
            action={async (formData: FormData) => {
              "use server";
              try {
                await signIn("credentials", {
                  password: formData.get("password"),
                  redirectTo: params.callbackUrl ?? "/dashboard",
                });
              } catch (error) {
                if (error instanceof AuthError) {
                  redirect(`/login?error=${error.type}`);
                }
                throw error;
              }
            }}
            className="space-y-3"
          >
            <input
              type="password"
              name="password"
              required
              autoFocus
              placeholder="Contraseña"
              className="w-full rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-sm outline-none transition-colors focus:border-gold-500"
            />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg bg-ink-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-800"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
