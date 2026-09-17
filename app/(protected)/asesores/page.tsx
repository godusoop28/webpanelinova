import { UserCheck, UserX, PauseCircle, Users } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getAdvisorRows, getLeadRows, type AdvisorRow as AdvisorRowData } from "@/lib/google-sheets";
import { getDataSource, isDemoModeActive } from "@/lib/env";
import { getDefaultCompanyId } from "@/lib/company";
import { listAdvisorViews } from "@/lib/services/advisor.service";
import { getAdvisorsDailyAssignmentCounts } from "@/lib/services/assignment.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { AddAdvisorPanel } from "@/components/asesores/add-advisor-panel";
import { AdvisorRow } from "@/components/asesores/advisor-row";
import { DistributionTest } from "@/components/asesores/distribution-test";
import { buildTodayLeadCounts, countTodayLeadsForAdvisor, isPaused, type AdvisorLeadCounts } from "@/lib/advisors";

async function loadAdvisorsFromDatabase(): Promise<{ advisors: AdvisorRowData[]; leadsHoyById: Map<string, number> }> {
  const companyId = await getDefaultCompanyId();
  const advisors = await listAdvisorViews(companyId);
  const leadsHoyById = await getAdvisorsDailyAssignmentCounts(advisors.map((advisor) => advisor.id));
  return { advisors, leadsHoyById };
}

export default async function AsesoresPage() {
  await requireSection("asesores");

  const usingDatabase = !isDemoModeActive() && getDataSource() === "database";

  let advisors: AdvisorRowData[] = [];
  let todayCounts: AdvisorLeadCounts = { byId: new Map(), byWhatsapp: new Map(), byNombre: new Map() };
  let leadsHoyById: Map<string, number> | null = null;
  let loadError: string | null = null;
  try {
    if (usingDatabase) {
      const result = await loadAdvisorsFromDatabase();
      advisors = result.advisors;
      leadsHoyById = result.leadsHoyById;
    } else {
      const [advisorRows, leadRows] = await Promise.all([getAdvisorRows(), getLeadRows()]);
      advisors = advisorRows;
      todayCounts = buildTodayLeadCounts(leadRows, new Date());
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  const now = new Date();
  const total = advisors.length;
  const activos = advisors.filter((a) => a.activo && !isPaused(a, now)).length;
  const pausados = advisors.filter((a) => a.activo && isPaused(a, now)).length;
  const inactivos = advisors.filter((a) => !a.activo).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Asesores</h1>
          <p className="text-sm text-ink-500">
            Administra los asesores que participan en la distribución automática de leads.
          </p>
        </div>
        <AddAdvisorPanel />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
        <KpiCard label="Total asesores" icon={Users} status={loadError ? "error" : "ready"} value={total} />
        <KpiCard label="Activos" icon={UserCheck} status={loadError ? "error" : "ready"} value={activos} />
        <KpiCard label="Pausados" icon={PauseCircle} status={loadError ? "error" : "ready"} value={pausados} />
        <KpiCard label="Inactivos" icon={UserX} status={loadError ? "error" : "ready"} value={inactivos} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Probar distribución</CardTitle>
            <CardDescription>
              Simula la ruleta ponderada sin afectar leads reales, EasyBroker ni ManyChat.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DistributionTest />
        </CardContent>
      </Card>

      {loadError ? (
        <Card>
          <div className="p-5">
            <ErrorState
              title={usingDatabase ? "No se pudo cargar la base de datos" : "No se pudo cargar Google Sheets"}
              description={loadError}
            />
          </div>
        </Card>
      ) : advisors.length === 0 ? (
        <Card>
          <div className="p-5">
            <EmptyState title="Sin asesores registrados" />
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {advisors.map((advisor) => (
            <AdvisorRow
              key={advisor.id || advisor.rowNumber}
              advisor={advisor}
              leadsHoy={leadsHoyById ? leadsHoyById.get(advisor.id) ?? 0 : countTodayLeadsForAdvisor(advisor, todayCounts)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
