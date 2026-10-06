import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface BulkPercentageEntry {
  key: string;
  label: string;
}

export function BulkPercentageEditor({
  entries,
  onApply,
  title,
}: {
  entries: BulkPercentageEntry[];
  onApply: (values: number[]) => void;
  title: string;
}) {
  const [rawValues, setRawValues] = useState("");
  const tokens = rawValues.trim() ? rawValues.trim().split(/[\t;\r\n]+/) : [];
  const values = tokens.map((token) => Number(token.replace(/%/g, "").replace(",", ".").trim()));
  const validNumbers = values.every((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const total = values.reduce((sum, value) => sum + value, 0);
  const valid = entries.length > 0 && values.length === entries.length && validNumbers && Math.abs(total - 100) <= 0.011;
  const message = !rawValues.trim()
    ? ""
    : values.length !== entries.length
      ? `Se esperan ${entries.length} valores y se encontraron ${values.length}.`
      : !validNumbers
        ? "Cada valor debe ser un porcentaje entre 0 y 100."
        : Math.abs(total - 100) > 0.011
          ? `Los porcentajes suman ${total.toFixed(2)} %; deben sumar 100 %.`
          : `Total: ${total.toFixed(2)} %.`;

  return (
    <details className="rounded-lg border border-dashed p-3">
      <summary className="cursor-pointer text-sm font-medium">Pegar porcentajes en lote · {title}</summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground">Pega una columna de Excel en el orden mostrado. Se aceptan saltos de línea, tabulaciones o punto y coma; los valores deben sumar 100 %.</p>
        <ol className="grid list-inside list-decimal gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
          {entries.map((entry) => <li key={entry.key}>{entry.label}</li>)}
        </ol>
        <Textarea
          value={rawValues}
          onChange={(event) => setRawValues(event.target.value)}
          rows={Math.min(Math.max(entries.length, 2), 6)}
          aria-label={`Porcentajes para ${title}`}
          placeholder={"15,00 %\n25,00 %\n…"}
        />
        {message && <p role="status" aria-live="polite" className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>{message}</p>}
        <Button type="button" size="sm" variant="outline" disabled={!valid} onClick={() => { onApply(values); setRawValues(""); }}>
          Aplicar porcentajes
        </Button>
      </div>
    </details>
  );
}
