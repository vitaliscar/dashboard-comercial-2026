import type { LabelProps } from "recharts";

type ChartLabelConfig = {
  formatter: (value: number) => string;
  fill: string;
  dy?: number;
  fontSize?: number;
  skipEmpty?: boolean;
  lastOnly?: boolean;
  dataLength?: number;
  minSegmentHeight?: number;
};

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  const n = Number(value);
  return Number.isNaN(n) || n === 0;
}

function asNumber(value: string | number | undefined | null): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function createChartLabel({
  formatter,
  fill,
  dy = -8,
  fontSize = 10,
  skipEmpty = true,
  lastOnly = false,
  dataLength = 0,
  minSegmentHeight = 0,
}: ChartLabelConfig) {
  return function ChartLabel(props: LabelProps) {
    const { x, y, value, index, height, width } = props;

    if (skipEmpty && isEmptyValue(value)) return null;
    if (lastOnly && index !== dataLength - 1) return null;

    const h = asNumber(height) ?? 0;
    if (minSegmentHeight > 0 && h < minSegmentHeight) return null;

    const nx = asNumber(x);
    const ny = asNumber(y);
    const nw = asNumber(width);

    const anchorX = nw != null && nx != null ? nx + nw / 2 : nx;
    const anchorY = minSegmentHeight > 0 && ny != null && h > 0 ? ny + h / 2 : ny;

    if (anchorX == null || anchorY == null) return null;

    return (
      <text
        x={anchorX}
        y={anchorY}
        dy={minSegmentHeight > 0 ? 0 : dy}
        textAnchor="middle"
        dominantBaseline={minSegmentHeight > 0 ? "central" : "auto"}
        fill={fill}
        fontSize={fontSize}
        fontWeight={700}
      >
        {formatter(Number(value))}
      </text>
    );
  };
}

export function createLastPointLabel(
  dataLength: number,
  formatter: (value: number) => string,
  fill: string,
  lane = 0,
) {
  const laneSpacing = 14;
  return createChartLabel({
    formatter,
    fill,
    dy: -8 - lane * laneSpacing,
    lastOnly: true,
    dataLength,
  });
}

export function createHighlightedLabel(
  formatter: (value: number) => string,
  fill: string,
  lane = 0,
) {
  const laneSpacing = 14;
  return createChartLabel({
    formatter,
    fill,
    dy: -8 - lane * laneSpacing,
    skipEmpty: true,
  });
}

export function createHorizontalBarLabel(formatter: (value: number) => string, fill: string) {
  return function HorizontalBarLabel(props: LabelProps) {
    const { x, y, width, value } = props;
    if (isEmptyValue(value)) return null;

    const nx = asNumber(x);
    const ny = asNumber(y);
    const nw = asNumber(width) ?? 0;
    if (nx == null || ny == null) return null;

    return (
      <text
        x={nx + nw + 6}
        y={ny}
        dy={4}
        textAnchor="start"
        fill={fill}
        fontSize={9}
        fontWeight={700}
      >
        {formatter(Number(value))}
      </text>
    );
  };
}

export function createHorizontalLineLabel(
  formatter: (value: number) => string,
  fill: string,
  dx = 48,
) {
  return function HorizontalLineLabel(props: LabelProps) {
    const { x, y, value } = props;
    if (isEmptyValue(value)) return null;

    const nx = asNumber(x);
    const ny = asNumber(y);
    if (nx == null || ny == null) return null;

    return (
      <text
        x={nx + dx}
        y={ny}
        dy={4}
        textAnchor="start"
        fill={fill}
        fontSize={9}
        fontWeight={700}
      >
        {formatter(Number(value))}
      </text>
    );
  };
}
