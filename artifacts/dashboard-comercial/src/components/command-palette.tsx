import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Module } from "@/App";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modules: Module[];
  scopeLabel: string;
  onSelect: (path: string) => void;
}

export default function CommandPalette({
  open,
  onOpenChange,
  modules,
  scopeLabel,
  onSelect,
}: CommandPaletteProps) {
  const groups = [...new Set(modules.map((module) => module.group))];

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Buscar módulos"
      description={scopeLabel}
      className="max-w-lg"
    >
      <Command>
        <CommandInput
          placeholder="Buscar por módulo, grupo o tarea…"
          aria-label="Buscar módulo"
        />
        <p className="px-3 pt-2 text-[11px] text-muted-foreground">
          {scopeLabel}
        </p>
        <CommandList>
          <CommandEmpty>Sin módulos encontrados.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group} heading={group}>
              {modules
                .filter((module) => module.group === group)
                .map((module) => (
                  <CommandItem
                    key={module.path}
                    value={`${module.label} ${module.group} ${module.description}`}
                    onSelect={() => {
                      onSelect(module.path);
                      onOpenChange(false);
                    }}
                  >
                    <module.icon className="size-4 text-primary" />
                    <span className="flex min-w-0 flex-col">
                      <span>{module.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {module.description}
                      </span>
                    </span>
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
