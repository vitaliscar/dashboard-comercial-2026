import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

type PercentageInputProps = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "onChange"
> & {
  value: number;
  onValueChange: (value: number) => void;
};

/** Keeps the typed string intact while editing, instead of rewriting it as a number on every key. */
export function PercentageInput({
  value,
  onValueChange,
  onBlur,
  onFocus,
  ...props
}: PercentageInputProps) {
  const [rawValue, setRawValue] = useState(String(value));
  const isEditing = useRef(false);

  useEffect(() => {
    if (!isEditing.current) setRawValue(String(value));
  }, [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={rawValue}
      onFocus={(event) => {
        isEditing.current = true;
        if (value === 0) setRawValue("");
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.currentTarget.value;
        if (!/^\d*(?:[.,]\d*)?$/.test(next)) return;
        setRawValue(next);
        if (next === "" || next === "." || next === ",") return;
        const parsed = Number(next.replace(",", "."));
        if (Number.isFinite(parsed)) onValueChange(parsed);
      }}
      onBlur={(event) => {
        isEditing.current = false;
        const parsed = rawValue.trim()
          ? Number(rawValue.replace(",", "."))
          : 0;
        const normalized = Number.isFinite(parsed) ? parsed : 0;
        setRawValue(String(normalized));
        onValueChange(normalized);
        onBlur?.(event);
      }}
    />
  );
}
