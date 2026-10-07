"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { AdvisorForm } from "@/components/asesores/advisor-form";
import { createAdvisorAction } from "@/app/(protected)/asesores/actions";

export function AddAdvisorPanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Agregar asesor
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Agregar asesor" description="Participará en la distribución automática según su prioridad y rutas.">
        {open && <AdvisorForm action={createAdvisorAction} submitLabel="Agregar asesor" onSuccess={() => setOpen(false)} onCancel={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}
