import { Button } from "@/components/ui/button";

type QueryErrorNoticeProps = {
  error: unknown;
  onRetry?: () => void;
  fallback: string;
  compact?: boolean;
};

export function QueryErrorNotice({
  error,
  onRetry,
  fallback,
  compact = false,
}: QueryErrorNoticeProps) {
  const message = error instanceof Error ? error.message : fallback;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 ${compact ? "p-3" : "p-4"}`}
      role="alert"
    >
      <p className="min-w-0 text-sm text-destructive">{message || fallback}</p>
      {onRetry && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRetry}
        >
          Reintentar
        </Button>
      )}
    </div>
  );
}
