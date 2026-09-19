import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/state";

export default function ReportesLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-6 w-32 animate-pulse rounded bg-ink-100" />
          <div className="h-4 w-80 animate-pulse rounded bg-ink-100" />
        </div>
        <div className="h-9 w-72 animate-pulse rounded-lg bg-ink-100" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-24 animate-pulse p-5" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="h-64 animate-pulse" />
        <Card className="h-64 animate-pulse" />
      </div>

      <Card className="p-5">
        <TableSkeleton rows={8} cols={6} />
      </Card>
    </div>
  );
}
