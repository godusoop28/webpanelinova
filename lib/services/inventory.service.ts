import "server-only";
import { prisma } from "@/lib/db";

/**
 * Inventario de EasyBroker reflejado en el CRM. Lo llena el backend
 * (inovaback, cada 10 min); el panel solo lo lee y deja peticiones
 * (sincronizar ahora / restaurar) que el backend toma en menos de un minuto.
 */

export type InventoryView = "activas" | "eliminadas";

export const EB_STATUS_LABELS: Record<string, string> = {
  published: "Publicada",
  not_published: "No publicada",
  reserved: "Reservada",
  sold: "Vendida",
  rented: "Rentada",
  suspended: "Suspendida",
};

export const C21_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  synced: "Sincronizada",
  error: "Con error",
  removed: "Retirada",
  not_sent: "No se envía",
  transferred: "Pasó a la restaurada",
};

export async function listInventory(companyId: string, view: InventoryView, search?: string) {
  const q = search?.trim();
  return prisma.ebProperty.findMany({
    where: {
      companyId,
      deletedAt: view === "eliminadas" ? { not: null } : null,
      ...(q
        ? {
            OR: [
              { publicId: { contains: q, mode: "insensitive" as const } },
              { title: { contains: q, mode: "insensitive" as const } },
              { location: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: view === "eliminadas" ? { deletedAt: "desc" } : { ebUpdatedAt: { sort: "desc", nulls: "last" } },
    select: {
      publicId: true,
      title: true,
      propertyType: true,
      status: true,
      operationType: true,
      price: true,
      currency: true,
      location: true,
      bedrooms: true,
      bathrooms: true,
      coverImageUrl: true,
      publicUrl: true,
      agentName: true,
      ebUpdatedAt: true,
      deletedAt: true,
      restoreRequestedAt: true,
      restoreError: true,
      restoredAt: true,
      restoredAsPublicId: true,
      restoredFromPublicId: true,
      c21ListingKey: true,
      c21Status: true,
      c21Error: true,
    },
  });
}

export type InventoryRow = Awaited<ReturnType<typeof listInventory>>[number];

export async function inventoryCounts(companyId: string) {
  const [active, deleted, published, c21Synced, c21Errors] = await Promise.all([
    prisma.ebProperty.count({ where: { companyId, deletedAt: null } }),
    prisma.ebProperty.count({ where: { companyId, deletedAt: { not: null }, restoredAsPublicId: null } }),
    prisma.ebProperty.count({ where: { companyId, deletedAt: null, status: "published" } }),
    prisma.ebProperty.count({ where: { companyId, deletedAt: null, c21Status: "synced" } }),
    prisma.ebProperty.count({ where: { companyId, deletedAt: null, c21Status: "error" } }),
  ]);
  return { active, deleted, published, c21Synced, c21Errors };
}

export async function getSyncState(companyId: string) {
  return prisma.propertySyncState.findUnique({ where: { companyId } });
}

export async function requestInventorySync(companyId: string, by: string) {
  await prisma.propertySyncState.upsert({
    where: { companyId },
    create: { companyId, requestedAt: new Date(), requestedBy: by },
    update: { requestedAt: new Date(), requestedBy: by, updatedAt: new Date() },
  });
}

export async function requestRestore(companyId: string, publicId: string, by: string) {
  const result = await prisma.ebProperty.updateMany({
    where: { companyId, publicId, deletedAt: { not: null }, restoredAsPublicId: null },
    data: { restoreRequestedAt: new Date(), restoreRequestedBy: by, restoreError: null, updatedAt: new Date() },
  });
  if (result.count === 0) throw new Error("No hay una propiedad eliminada con ese código.");
}
