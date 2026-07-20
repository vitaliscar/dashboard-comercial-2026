import { money } from "@/lib/format";
import "./goal-feedback.css";

type Props = {
  pct: number;
  brecha: number;
};

export function GoalFeedback({ pct, brecha }: Props) {
  if (pct < 75) {
    return (
      <div className="goal-feedback goal-feedback-amb">
        <div className="text-xs font-medium text-danger">{`Faltaron ${money(brecha)} para la meta`}</div>
        <img src="/ambulancia.svg" alt="" width={120} height={74} />
      </div>
    );
  }

  if (pct < 100) {
    return (
      <div className="goal-feedback goal-feedback-truck">
        <div className="text-xs font-medium text-warning">{`Faltaron ${money(brecha)} para la meta`}</div>
        <img src="/camion.svg" alt="" width={84} height={84} />
      </div>
    );
  }

  return (
    <div className="goal-feedback goal-feedback-rocket">
      <div className="text-xs font-medium text-success">{`Superó la meta por ${money(Math.abs(brecha))}`}</div>
      <img src="/cohete.svg" alt="" width={84} height={84} />
    </div>
  );
}
