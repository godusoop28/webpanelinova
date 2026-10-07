"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Clock3, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Field, FormMessage, inputClass, selectClass } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/state";
import { WEEKDAYS, describeRound, formatMinute } from "@/lib/advisor-rounds";
import { cn } from "@/lib/utils";
import { createRoundAction, deleteRoundAction, toggleRoundAction, type RoundFormState } from "@/app/(protected)/asesores/actions";

export interface RoundRow {
  id: string;
  advisorId: string;
  advisorName: string;
  advisorActive: boolean;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  active: boolean;
  note: string | null;
  onRoundNow: boolean;
}

const initial: RoundFormState = {};

function RoundForm({ advisors }: { advisors: { id: string; name: string; active: boolean }[] }) {
  const [state, action, pending] = useActionState(createRoundAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4 rounded-xl border border-ink-200 p-4">
      <p className="text-sm font-semibold text-ink-950">Nueva ronda</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field label="Asesor" required>
          <select name="advisorId" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Elige un asesor…
            </option>
            {advisors.map((advisor) => (
              <option key={advisor.id} value={advisor.id} disabled={!advisor.active}>
                {advisor.name}
                {advisor.active ? "" : " (inactivo)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Desde" required>
          <input type="time" name="start" required defaultValue="09:00" className={inputClass} />
        </Field>
        <Field label="Hasta" required hint="Si es menor que el inicio, cruza la medianoche.">
          <input type="time" name="end" required defaultValue="11:00" className={inputClass} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-ink-700">Días</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((day) => (
            <label
              key={day.value}
              className="flex h-9 min-w-12 cursor-pointer items-center justify-center rounded-lg border border-ink-200 px-2.5 text-sm text-ink-700 transition-colors duration-150 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-500 has-[:checked]:font-semibold has-[:checked]:text-ink-950 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-500"
              title={day.long}
            >
              <input type="checkbox" name="weekdays" value={day.value} defaultChecked={day.value <= 5} className="sr-only" />
              {day.short}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Nota (opcional)">
        <input name="note" maxLength={200} placeholder="p. ej. guardia de la mañana" className={inputClass} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          {!pending && <Plus className="size-4" aria-hidden />}
          Agregar ronda
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </div>
    </form>
  );
}

function RoundItem({ round }: { round: RoundRow }) {
  const [toggling, startToggle] = useTransition();
  const [deleting, startDelete] = useTransition();
  return (
    <li className={cn("flex flex-col gap-3 py-3 sm:flex-row sm:items-center", !round.active && "opacity-70")}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={round.advisorName} className="size-9 text-xs" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink-950">
            {round.advisorName}
            {round.onRoundNow && (
              <Badge tone="success" dot>
                En ronda ahora
              </Badge>
            )}
            {!round.active && <Badge tone="neutral">En pausa</Badge>}
            {!round.advisorActive && <Badge tone="warning">Asesor inactivo</Badge>}
          </p>
          <p className="text-xs text-ink-600">{describeRound(round)}</p>
          {round.note && <p className="text-xs text-ink-500">{round.note}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="secondary" size="sm" loading={toggling} onClick={() => startToggle(() => toggleRoundAction(round.id, !round.active))}>
          {round.active ? "Pausar ronda" : "Reactivar"}
        </Button>
        <Button
          variant="danger-ghost"
          size="icon"
          loading={deleting}
          aria-label={`Eliminar ronda de ${round.advisorName}`}
          title="Eliminar ronda"
          onClick={() => {
            if (window.confirm(`¿Eliminar la ronda de ${round.advisorName} (${describeRound(round)})?`)) startDelete(() => deleteRoundAction(round.id));
          }}
        >
          {!deleting && <Trash2 className="size-4" aria-hidden />}
        </Button>
      </div>
    </li>
  );
}

/** Rondas que tocan hoy (día de inicio = hoy), dibujadas sobre 24 h. */
function TodayTimeline({ rounds, todayWeekday, nowMinute }: { rounds: RoundRow[]; todayWeekday: number; nowMinute: number }) {
  const today = rounds.filter((round) => round.active && round.weekdays.includes(todayWeekday));
  if (today.length === 0) return null;
  const segments = (round: RoundRow) =>
    round.endMinute > round.startMinute
      ? [[round.startMinute, round.endMinute]]
      : [
          [round.startMinute, 1440],
          [0, round.endMinute],
        ];
  return (
    <div className="space-y-2 rounded-xl bg-ink-50 p-4">
      <div className="flex items-center justify-between text-xs">
        <p className="font-semibold text-ink-800">Hoy ({WEEKDAYS.find((d) => d.value === todayWeekday)?.long})</p>
        <p className="text-ink-500">Ahora: {formatMinute(nowMinute)} (Ciudad de México)</p>
      </div>
      <div className="relative ml-28 flex justify-between text-[10px] text-ink-400 sm:ml-36" aria-hidden>
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{String(h).padStart(2, "0")}h</span>
        ))}
      </div>
      <ul className="space-y-1.5">
        {today.map((round) => (
          <li key={round.id} className="flex items-center gap-2">
            <span className="w-26 shrink-0 truncate text-xs text-ink-700 sm:w-34" title={round.advisorName}>
              {round.advisorName}
            </span>
            <div className="relative h-4 flex-1 rounded bg-surface ring-1 ring-ink-200" role="img" aria-label={`${round.advisorName}: ${describeRound(round)}`}>
              {segments(round).map(([from, to]) => (
                <span
                  key={from}
                  className={cn("absolute inset-y-0 rounded", round.onRoundNow ? "bg-emerald-400" : "bg-accent-400")}
                  style={{ left: `${(from / 1440) * 100}%`, width: `${((to - from) / 1440) * 100}%` }}
                />
              ))}
              <span className="absolute inset-y-[-3px] w-0.5 bg-rose-500" style={{ left: `${(nowMinute / 1440) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdvisorRounds({
  rounds,
  advisors,
  loadError,
  todayWeekday,
  nowMinute,
}: {
  rounds: RoundRow[];
  advisors: { id: string; name: string; active: boolean }[];
  loadError: string | null;
  todayWeekday: number;
  nowMinute: number;
}) {
  const onRoundNames = [...new Set(rounds.filter((round) => round.onRoundNow).map((round) => round.advisorName))];

  if (loadError) {
    return <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{loadError}</p>;
  }

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl px-4 py-3 text-sm",
          onRoundNames.length > 0 ? "bg-emerald-50 text-emerald-900" : "bg-ink-50 text-ink-700"
        )}
        role="status"
      >
        <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden />
        {onRoundNames.length > 0 ? (
          <p>
            <span className="font-semibold">En ronda ahora: {onRoundNames.join(", ")}.</span> Los leads de ruleta van solo a {onRoundNames.length === 1 ? "este asesor" : "estos asesores"}{" "}
            mientras estén disponibles y con cupo.
          </p>
        ) : (
          <p>Ninguna ronda activa en este momento: la ruleta reparte entre todos los asesores disponibles.</p>
        )}
      </div>

      <TodayTimeline rounds={rounds} todayWeekday={todayWeekday} nowMinute={nowMinute} />

      <RoundForm advisors={advisors} />

      {rounds.length === 0 ? (
        <EmptyState icon={Clock3} title="Sin rondas configuradas" description="Agrega una ronda para que, en ese horario, la ruleta asigne solo a ese asesor." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {rounds.map((round) => (
            <RoundItem key={round.id} round={round} />
          ))}
        </ul>
      )}
    </div>
  );
}
