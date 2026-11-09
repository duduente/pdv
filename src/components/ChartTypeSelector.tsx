export type ChartType = 'bar' | 'line' | 'pie';

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Colunas',
  line: 'Linhas',
  pie: 'Pizza',
};

export function ChartTypeSelector({
  value,
  onChange,
  label,
}: {
  value: ChartType;
  onChange: (value: ChartType) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      Visualização
      <select
        aria-label={`Tipo de gráfico: ${label}`}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value as ChartType)}
      >
        {(Object.keys(CHART_TYPE_LABELS) as ChartType[]).map((type) => (
          <option key={type} value={type}>{CHART_TYPE_LABELS[type]}</option>
        ))}
      </select>
    </label>
  );
}
