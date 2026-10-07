import { BarChart3, Clock3, PauseCircle, UserCheck, UserX, UsersRound } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { listAdvisorViews } from "@/lib/services/advisor.service";
import { getAdvisorsDailyAssignmentCounts } from "@/lib/services/assignment.service";
import { Card, SectionHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { AddAdvisorPanel } from "@/components/asesores/add-advisor-panel";
import { AdvisorsBoard } from "@/components/asesores/advisors-board";
import { DistributionTest } from "@/components/asesores/distribution-test";
import { isPaused } from "@/lib/advisors";
import { isRoundActiveAt, mexicoCityClock } from "@/lib/advisor-rounds";
import { listRounds } from "@/lib/services/advisor-round.service";
import { AdvisorRounds, type RoundRow } from "@/components/asesores/advisor-rounds";
import type { AdvisorView } from "@/lib/types";

export default async function AsesoresPage() {
  await requireSection("asesores");

  let advisors: AdvisorView[] = [];
  let leadsHoyById = new Map<string, number>();
  let loadError: string | null = null;
  let rounds: RoundRow[] = [];
  let roundsError: string | null = null;
  const now = new Date();
  try {
    const companyId = await getDefaultCompanyId();
    const [advisorList, roundListing] = await Promise.all([listAdvisorViews(companyId), listRounds(companyId)]);
    advisors = advisorList;
    leadsHoyById = await getAdvisorsDailyAssignmentCounts(advisors.map((advisor) => advisor.id));
    if (roundListing.ok) {
      rounds = roundListing.rounds.map((round) => ({
        id: round.id,
        advisorId: round.advisorId,
        advisorName: round.advisor.name,
        advisorActive: round.advisor.active,
        weekdays: round.weekdays,
        startMinute: round.startMinute,
        endMinute: round.endMinute,
        active: round.active,
        note: round.note,
        onRoundNow: round.advisor.active && isRoundActiveAt(round, now),
      }));
    } else {
      roundsError = roundListing.error;
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }
  const clock = mexicoCityClock(now);
  const activos = advisors.filter((a) => a.activo && !isPaused(a, now)).length;
  const pausados = advisors.filter((a) => a.activo && isPaused(a, now)).length;
  const inactivos = advisors.filter((a) => !a.activo).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asesores"
        description="Administra los asesores que participan en la distribución automática de leads."
        actions={<AddAdvisorPanel />}
      />

      {loadError ? (
        <ErrorState title="No se pudo cargar la información de asesores" description={loadError} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatCard size="sm" label="Total de asesores" value={advisors.length} icon={UsersRound} />
            <StatCard size="sm" label="Disponibles" value={activos} icon={UserCheck} tone="success" />
            <StatCard size="sm" label="En pausa" value={pausados} icon={PauseCircle} tone="warning" />
            <StatCard size="sm" label="Inactivos" value={inactivos} icon={UserX} tone="neutral" />
          </div>

          {advisors.length === 0 ? (
            <EmptyState title="Sin asesores registrados" description="Agrega el primero con el botón “Agregar asesor”." />
          ) : (
            <AdvisorsBoard advisors={advisors} leadsHoy={Object.fromEntries(leadsHoyById)} />
          )}
        </>
      )}

      {!loadError && (
        <Card id="rondas" className="scroll-mt-6">
          <SectionHeader
            icon={Clock3}
            title="Rondas por horario"
            description="En el horario de una ronda, los leads de ruleta (sin asesor propio) se asignan solo a los asesores en ronda. Si ninguno está disponible o con cupo, la ruleta reparte entre todos. Hora de Ciudad de México."
          />
          <div className="px-5 pb-5">
            <AdvisorRounds
              rounds={rounds}
              advisors={advisors.map((a) => ({ id: a.id, name: a.nombre, active: a.activo }))}
              loadError={roundsError}
              todayWeekday={clock.weekday}
              nowMinute={clock.minute}
            />
          </div>
        </Card>
      )}

      <Card id="simulador" className="scroll-mt-6">
        <SectionHeader
          icon={BarChart3}
          title="Simulador de distribución"
          description="Prueba la ruleta ponderada en memoria, sin afectar leads reales ni llamar a EasyBroker o ManyChat."
        />
        <div className="px-5 pb-5">
          <DistributionTest />
        </div>
      </Card>
    </div>
  );
}
