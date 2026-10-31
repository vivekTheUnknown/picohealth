import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { useTheme } from "@/theme/tokens";
import { type } from "@/theme/tokens";

export interface ChartPoint {
  t: number;
  v: number | null;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: ChartPoint[];
}

interface TimeSeriesChartProps {
  series: ChartSeries[];
  windowMs: number;
  now: number;
  height?: number;
  unit?: string;
  yMin?: number;
  yMax?: number;
  formatValue?: (value: number) => string;
  emptyLabel?: string;
}

const GAP_MS = 3000;
const PADDING = { left: 42, right: 10, top: 10, bottom: 20 };

/**
 * A compact time-series chart drawn with SVG.
 *
 * No interpolation: a gap longer than 3 s breaks the line. Missing values are
 * skipped rather than carried forward.
 */
export function TimeSeriesChart({
  series,
  windowMs,
  now,
  height = 156,
  unit,
  yMin,
  yMax,
  formatValue = (value) => value.toFixed(1),
  emptyLabel = "No data in this window",
}: TimeSeriesChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const start = now - windowMs;
  const points = series.flatMap((entry) =>
    entry.points
      .filter((point) => point.t >= start && point.t <= now && point.v !== null)
      .map((point) => ({ t: point.t, v: point.v as number })),
  );

  const innerWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const innerHeight = Math.max(0, height - PADDING.top - PADDING.bottom);

  let low = yMin;
  let high = yMax;
  if (low === undefined || high === undefined) {
    if (points.length === 0) {
      low = 0;
      high = 1;
    } else {
      const values = points.map((point) => point.v);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const pad = Math.max((max - min) * 0.15, 0.5);
      low = yMin ?? min - pad;
      high = yMax ?? max + pad;
    }
  }
  const span = Math.max(high! - low!, 0.001);

  const x = (t: number) => PADDING.left + ((t - start) / windowMs) * innerWidth;
  const y = (value: number) =>
    PADDING.top + (1 - (value - low!) / span) * innerHeight;

  const xLabels = [start, start + windowMs / 2, now].map((value) =>
    new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  );

  const hasData = points.length > 0;

  if (!hasData) {
    return (
      <View style={[styles.emptyBox, { height }]}>
        <Text style={[styles.empty, { color: colors.textSubtle }]}>
          {emptyLabel}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${series.map((entry) => entry.label).join(", ")} chart. ${
          hasData
            ? `Latest ${formatValue(points[points.length - 1].v)} ${unit ?? ""}, ${points.length} points in the selected window.`
            : emptyLabel
        }`}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {/* horizontal grid + y labels */}
            {[0, 0.5, 1].map((fraction) => {
              const value = high! - fraction * span;
              const yPos = PADDING.top + fraction * innerHeight;
              return (
                <Line
                  key={fraction}
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={yPos}
                  y2={yPos}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              );
            })}
            {[0, 0.5, 1].map((fraction) => {
              const value = high! - fraction * span;
              return (
                <SvgText
                  key={`label-${fraction}`}
                  x={PADDING.left - 6}
                  y={PADDING.top + fraction * innerHeight + 4}
                  fontSize={10}
                  fill={colors.textSubtle}
                  textAnchor="end"
                >
                  {formatValue(value)}
                </SvgText>
              );
            })}

            {/* x labels */}
            {xLabels.map((label, index) => (
              <SvgText
                key={`x-${index}`}
                x={
                  PADDING.left +
                  (index / (xLabels.length - 1)) * innerWidth
                }
                y={height - 4}
                fontSize={10}
                fill={colors.textSubtle}
                textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
              >
                {label}
              </SvgText>
            ))}

            {/* series, split at gaps */}
            {series.map((entry) => {
              const sorted = entry.points
                .filter(
                  (point) =>
                    point.t >= start && point.t <= now && point.v !== null,
                )
                .sort((a, b) => a.t - b.t) as Array<{ t: number; v: number }>;

              const segments: Array<Array<{ t: number; v: number }>> = [];
              let current: Array<{ t: number; v: number }> = [];
              for (const point of sorted) {
                const previous = current[current.length - 1];
                if (previous && point.t - previous.t > GAP_MS) {
                  if (current.length > 0) segments.push(current);
                  current = [];
                }
                current.push(point);
              }
              if (current.length > 0) segments.push(current);

              return segments.map((segment, index) => {
                if (segment.length === 1) {
                  return (
                    <Circle
                      key={`${entry.key}-${index}`}
                      cx={x(segment[0].t)}
                      cy={y(segment[0].v)}
                      r={2.5}
                      fill={entry.color}
                    />
                  );
                }
                const path = segment
                  .map(
                    (point, pointIndex) =>
                      `${pointIndex === 0 ? "M" : "L"} ${x(point.t).toFixed(2)} ${y(point.v).toFixed(2)}`,
                  )
                  .join(" ");
                return (
                  <Path
                    key={`${entry.key}-${index}`}
                    d={path}
                    stroke={entry.color}
                    strokeWidth={2}
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                );
              });
            })}

            {/* latest point marker */}
            {series.map((entry) => {
              const latest = [...entry.points]
                .filter(
                  (point) =>
                    point.t >= start && point.t <= now && point.v !== null,
                )
                .sort((a, b) => a.t - b.t)
                .at(-1);
              if (!latest || latest.v === null) return null;
              return (
                <Circle
                  key={`latest-${entry.key}`}
                  cx={Math.min(width - PADDING.right, x(latest.t))}
                  cy={y(latest.v)}
                  r={3}
                  fill={entry.color}
                  stroke={colors.surface}
                  strokeWidth={1}
                />
              );
            })}
          </Svg>
        ) : null}
      </View>

      <View style={styles.legend}>
        {series.map((entry) => (
          <View key={entry.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: entry.color }]} />
            <Text style={[styles.legendText, { color: colors.textMuted }]}>
              {entry.label}
            </Text>
          </View>
        ))}
        {unit ? (
          <Text style={[styles.legendText, { color: colors.textSubtle }]}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  empty: {
    fontSize: type.caption,
    textAlign: "center",
    lineHeight: 18,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: type.caption },
});
