"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdvisorForm } from "@/components/asesores/advisor-form";
import { createAdvisorAction } from "@/app/(protected)/asesores/actions";

export function AddAdvisorPanel() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Agregar asesor
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Agregar asesor</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Cerrar">
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <AdvisorForm action={createAdvisorAction} submitLabel="Agregar asesor" onSuccess={() => setOpen(false)} />
    </Card>
  );
}
