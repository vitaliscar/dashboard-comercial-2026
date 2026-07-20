import { useEffect, useRef, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
};

export function SegmentedToggle<T extends string>({ value, onChange, options }: Props<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const activeItem = itemRefs.current.get(value);
    if (!container || !activeItem) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    setIndicator({
      left: itemRect.left - containerRect.left,
      width: itemRect.width,
    });
  }, [value, options]);

  return (
    <div ref={containerRef} className="relative">
      {indicator && (
        <div
          className="pointer-events-none absolute inset-y-0 z-0 rounded-lg bg-primary transition-[transform,width] duration-200 ease-out"
          style={{
            width: `${indicator.width}px`,
            transform: `translateX(${indicator.left}px)`,
          }}
        />
      )}
      <ToggleGroup
        value={[value]}
        onValueChange={(v) => {
          // A single-select segmented control always keeps exactly one option active —
          // ignore the toggle-off click that would otherwise empty the selection.
          if (v.length > 0) onChange(v[0] as T);
        }}
        variant="outline"
        spacing={0}
        className="relative z-10 bg-transparent"
      >
        {options.map((opt) => (
          <ToggleGroupItem
            key={opt.value}
            ref={(el) => {
              if (el) itemRefs.current.set(opt.value, el);
              else itemRefs.current.delete(opt.value);
            }}
            value={opt.value}
            className="px-3 py-1.5 text-xs font-bold tracking-wide data-[state=on]:bg-transparent data-[state=on]:text-primary-foreground"
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
