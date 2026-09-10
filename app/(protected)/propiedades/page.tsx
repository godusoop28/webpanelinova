import Link from "next/link";
import { BedDouble, Car, MapPin, Ruler, ShowerHead } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getProperties } from "@/lib/easybroker";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Button } from "@/components/ui/button";

export default async function PropiedadesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireSection("propiedades");
  const { page } = await searchParams;
  const currentPage = Number(page) > 0 ? Number(page) : 1;

  let content: Awaited<ReturnType<typeof getProperties>>["content"] = [];
  let pagination: Awaited<ReturnType<typeof getProperties>>["pagination"] | null = null;
  let loadError: string | null = null;

  try {
    const result = await getProperties({ page: currentPage, limit: 12 });
    content = result.content;
    pagination = result.pagination;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Propiedades</h1>
        <p className="text-sm text-ink-500">Inventario sincronizado desde EasyBroker.</p>
      </div>

      {loadError ? (
        <ErrorState title="No se pudo conectar con EasyBroker" description={loadError} />
      ) : content.length === 0 ? (
        <EmptyState title="Sin propiedades" description="EasyBroker no devolvió resultados." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {content.map((property) => {
              const operation = property.operations?.[0];
              return (
                <Card key={property.public_id} className="overflow-hidden">
                  <div className="relative h-40 w-full bg-ink-100">
                    {property.title_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- EasyBroker serves images from arbitrary, unconfigured hosts
                      <img
                        src={property.title_image_url}
                        alt={property.title ?? property.public_id}
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-ink-500">
                        Sin imagen
                      </div>
                    )}
                    {property.status && (
                      <Badge tone="gold" className="absolute left-3 top-3">
                        {property.status}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <h3 className="line-clamp-1 text-sm font-semibold text-ink-900">
                      {property.title || property.public_id}
                    </h3>
                    {property.location?.name && (
                      <p className="flex items-center gap-1 text-xs text-ink-500">
                        <MapPin className="size-3.5" aria-hidden />
                        {property.location.name}
                      </p>
                    )}
                    <p className="text-sm font-semibold text-gold-700">
                      {operation?.formatted_amount ?? "Precio no disponible"}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-ink-500">
                      {property.bedrooms !== undefined && (
                        <span className="flex items-center gap-1">
                          <BedDouble className="size-3.5" aria-hidden />
                          {property.bedrooms}
                        </span>
                      )}
                      {property.bathrooms !== undefined && (
                        <span className="flex items-center gap-1">
                          <ShowerHead className="size-3.5" aria-hidden />
                          {property.bathrooms}
                        </span>
                      )}
                      {property.parking_spaces !== undefined && (
                        <span className="flex items-center gap-1">
                          <Car className="size-3.5" aria-hidden />
                          {property.parking_spaces}
                        </span>
                      )}
                      {property.construction_size !== undefined && (
                        <span className="flex items-center gap-1">
                          <Ruler className="size-3.5" aria-hidden />
                          {property.construction_size} m²
                        </span>
                      )}
                    </div>
                    {property.public_url && (
                      <a
                        href={property.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block pt-1 text-xs font-medium text-gold-700 hover:text-gold-600"
                      >
                        Ver en EasyBroker →
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {pagination && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-500">
                Página {pagination.page} · {pagination.total} propiedades en total
              </p>
              <div className="flex gap-2">
                {currentPage > 1 ? (
                  <Link href={`/propiedades?page=${currentPage - 1}`}>
                    <Button variant="secondary" size="sm">
                      Anterior
                    </Button>
                  </Link>
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    Anterior
                  </Button>
                )}
                {pagination.next_page ? (
                  <Link href={`/propiedades?page=${currentPage + 1}`}>
                    <Button variant="secondary" size="sm">
                      Siguiente
                    </Button>
                  </Link>
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    Siguiente
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
