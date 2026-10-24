import Link from "next/link";
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, ExternalLink, House, Trash2, Info } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { formatMexicoCityDateTime } from "@/lib/timezone";
import {
  C21_STATUS_LABELS,
  EB_STATUS_LABELS,
  getSyncState,
  inventoryCounts,
  listInventory,
  type InventoryRow,
  type InventoryView,
} from "@/lib/services/inventory.service";
import { TableSearch } from "@/components/table-search";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { RestoreButton, SyncNowButton } from "@/components/propiedades/inventory-actions";

interface SearchParams {
  vista?: string;
  q?: string;
}

const EB_TONES: Record<string, BadgeTone> = {
  published: "success",
  reserved: "warning",
  sold: "info",
  rented: "info",
  not_published: "neutral",
  suspended: "neutral",
};

const C21_TONES: Record<string, BadgeTone> = {
  synced: "success",
  pending: "neutral",
  error: "danger",
  removed: "neutral",
  not_sent: "neutral",
  transferred: "neutral",
};

function price(row: InventoryRow): string | null {
  if (row.price == null) return null;
  const amount = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(row.price);
  const op = row.operationType === "rental" ? " · renta" : row.operationType === "sale" ? " · venta" : "";
  return `$${amount} ${row.currency ?? "MXN"}${op}`;
}

function details(row: InventoryRow): string | null {
  const parts = [
    row.propertyType,
    row.bedrooms != null ? `${row.bedrooms} rec.` : null,
    row.bathrooms != null ? `${row.bathrooms} baños` : null,
    row.location,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default async function InventarioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireSection("propiedades");
  const params = await searchParams;
  const view: InventoryView = params.vista === "eliminadas" ? "eliminadas" : "activas";
  const canRestore = user.role === "ADMIN" || user.role === "DIRECCION";

  let rows: InventoryRow[] = [];
  let counts = { active: 0, deleted: 0, published: 0, c21Synced: 0, c21Errors: 0 };
  let state: Awaited<ReturnType<typeof getSyncState>> = null;
  let error: string | null = null;
  try {
    const companyId = await getDefaultCompanyId();
    [rows, counts, state] = await Promise.all([listInventory(companyId, view, params.q), inventoryCounts(companyId), getSyncState(companyId)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Error desconocido";
  }

  const summary = (state?.lastSummary ?? null) as { c21?: { enabled?: boolean; error?: string } } | null;
  const c21Enabled = summary?.c21?.enabled === true;
  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventario EasyBroker"
        description="Todas las propiedades de EasyBroker (la fuente de verdad), reflejadas aquí y en 21Online. Altas, cambios y bajas se sincronizan solas cada 10 minutos."
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <Link href="/propiedades" className={buttonClass("secondary")}>
              <ArrowLeft className="size-4" aria-hidden />
              Reporte por propiedad
            </Link>
            {user.role === "ADMIN" && <SyncNowButton />}
          </div>
        }
      />

      {error ? (
        <ErrorState title="No se pudo cargar el inventario" description={error} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <StatCard label="En EasyBroker" value={counts.active} icon={House} hint={`${counts.published} publicadas`} />
            <StatCard
              label="En 21Online"
              value={counts.c21Synced}
              icon={CheckCircle2}
              tone="neutral"
              hint={c21Enabled ? "Sincronizadas con la API Externa" : "Falta conectar la credencial de 21Online"}
            />
            <StatCard label="Con error en 21Online" value={counts.c21Errors} icon={AlertTriangle} tone="neutral" hint="Se reintentan en cada corrida" />
            <StatCard label="Eliminadas (copia)" value={counts.deleted} icon={Trash2} tone="neutral" hint="Se pueden restaurar" />
          </div>

          <div className="space-y-1 text-xs text-ink-600">
            <p>
              Última sincronización:{" "}
              <span className="font-semibold text-ink-800">{state?.lastSuccessAt ? formatMexicoCityDateTime(state.lastSuccessAt) : "todavía no corre"}</span>
              {state?.lastStatus === "running" && <Badge tone="info" className="ml-2">Sincronizando…</Badge>}
              {state?.requestedAt && <Badge tone="info" className="ml-2">Sincronización solicitada</Badge>}
            </p>
            {state?.lastStatus === "error" && state.lastError && <p className="text-rose-600">Error en la última corrida: {state.lastError}</p>}
            {summary?.c21?.error && <p className="text-amber-700">21Online: {summary.c21.error}</p>}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex gap-1 rounded-xl bg-surface-muted p-1">
              <Link href="/propiedades/inventario" className={tabClass(view === "activas")}>
                Activas ({counts.active})
              </Link>
              <Link href="/propiedades/inventario?vista=eliminadas" className={tabClass(view === "eliminadas")}>
                Eliminadas ({counts.deleted})
              </Link>
            </div>
            <TableSearch placeholder="Código, nombre o zona…" className="sm:ml-auto sm:max-w-md" />
          </div>

          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={params.q ? "Sin resultados" : view === "eliminadas" ? "No hay propiedades eliminadas" : "Todavía no hay propiedades sincronizadas"}
                  description={
                    params.q
                      ? "Ninguna propiedad coincide con la búsqueda."
                      : view === "eliminadas"
                        ? "Cuando una propiedad se borre en EasyBroker, aquí queda su copia para restaurarla."
                        : "El backend copia el inventario de EasyBroker en los próximos minutos."
                  }
                />
              </div>
            ) : (
              <div className="md:overflow-x-auto">
                <table className="responsive-table data-table w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-5 py-3">Propiedad</th>
                      <th className="px-4 py-3">Precio</th>
                      <th className="px-4 py-3">EasyBroker</th>
                      <th className="px-4 py-3">21Online</th>
                      <th className="px-4 py-3">{view === "eliminadas" ? "Eliminada" : "Actualizada en EB"}</th>
                      <th className="px-4 py-3">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 tabular-nums">
                    {rows.map((row) => {
                      const info = details(row);
                      return (
                        <tr key={row.publicId} className="transition-colors duration-150 hover:bg-surface-muted">
                          <td data-label="Propiedad" className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              {row.coverImageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={row.coverImageUrl} alt="" className="hidden size-12 shrink-0 rounded-lg object-cover md:block" loading="lazy" />
                              ) : (
                                <div className="hidden size-12 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-400 md:flex" aria-hidden>
                                  <Building2 className="size-5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                {view === "activas" ? (
                                  <Link href={`/propiedades/${row.publicId}`} className="font-medium text-ink-900 hover:text-accent-700 hover:underline">
                                    {row.title || row.publicId}
                                  </Link>
                                ) : (
                                  <span className="font-medium text-ink-900">{row.title || row.publicId}</span>
                                )}
                                {info && <p className="max-w-96 truncate text-xs text-ink-500">{info}</p>}
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-semibold text-ink-700">{row.publicId}</span>
                                  {row.agentName && <span className="text-xs text-ink-500">· {row.agentName}</span>}
                                  {row.restoredFromPublicId && <Badge tone="gold">Restaurada de {row.restoredFromPublicId}</Badge>}
                                  {row.publicUrl && view === "activas" && (
                                    <a
                                      href={row.publicUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-0.5 text-xs text-ink-500 hover:text-accent-700"
                                    >
                                      Ver anuncio <ExternalLink className="size-3" aria-hidden />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td data-label="Precio" className="whitespace-nowrap px-4 py-3 text-ink-800">
                            {price(row) ?? "—"}
                          </td>
                          <td data-label="EasyBroker" className="px-4 py-3">
                            {view === "eliminadas" ? (
                              <Badge tone="danger">Eliminada</Badge>
                            ) : (
                              <Badge tone={EB_TONES[row.status] ?? "neutral"}>{EB_STATUS_LABELS[row.status] ?? row.status}</Badge>
                            )}
                          </td>
                          <td data-label="21Online" className="px-4 py-3">
                            <Badge tone={C21_TONES[row.c21Status] ?? "neutral"} title={row.c21Error ?? undefined}>
                              {C21_STATUS_LABELS[row.c21Status] ?? row.c21Status}
                            </Badge>
                            {row.c21Error && <p className="mt-1 max-w-64 truncate text-xs text-rose-600" title={row.c21Error}>{row.c21Error}</p>}
                          </td>
                          <td data-label={view === "eliminadas" ? "Eliminada" : "Actualizada"} className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">
                            {view === "eliminadas"
                              ? row.deletedAt
                                ? formatMexicoCityDateTime(row.deletedAt)
                                : "—"
                              : row.ebUpdatedAt
                                ? formatMexicoCityDateTime(new Date(row.ebUpdatedAt))
                                : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {view === "eliminadas" &&
                              (row.restoredAsPublicId ? (
                                <Badge tone="success">Restaurada como {row.restoredAsPublicId}</Badge>
                              ) : row.restoreRequestedAt ? (
                                <Badge tone="info">Restaurando…</Badge>
                              ) : (
                                <div className="flex flex-col items-end gap-1">
                                  {canRestore && <RestoreButton publicId={row.publicId} />}
                                  {row.restoreError && (
                                    <p className="max-w-64 text-xs text-rose-600" title={row.restoreError}>
                                      No se pudo restaurar: {row.restoreError}
                                    </p>
                                  )}
                                </div>
                              ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="flex items-start gap-1.5 text-xs text-ink-500">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              EasyBroker manda: lo que se edita o borra allá se refleja aquí y en 21Online. Una propiedad borrada en EasyBroker se retira de 21Online y queda
              aquí con todos sus datos; &quot;Restaurar&quot; la vuelve a crear en EasyBroker (con un código nuevo) y reutiliza su mismo anuncio de 21Online, sin
              duplicarlo. Las no publicadas, vendidas o rentadas no se suben a 21Online.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
