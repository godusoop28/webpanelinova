import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDemoModeActive } from "@/lib/env";

// Must re-check DEMO_MODE on every request, not once at build time —
// otherwise toggling it off after a demo wouldn't take effect without a
// full rebuild, silently leaving the login bypass baked into static HTML.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (isDemoModeActive()) {
    redirect("/dashboard");
  }
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/login");
}
