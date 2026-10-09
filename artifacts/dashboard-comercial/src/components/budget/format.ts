const budgetNumber = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function budgetMoney(value: number | null | undefined): string {
  return `$${budgetNumber.format(Number(value ?? 0))}`;
}
