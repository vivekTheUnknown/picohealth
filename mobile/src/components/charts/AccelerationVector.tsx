import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Polygon, Text as SvgText } from "react-native-svg";

import { magnitude } from "@/features/sensors/orientation";
import { type, useTheme } from "@/theme/tokens";

export interface AccelerationVectorProps {
  /** X, Y, Z in g. Z is not drawn in this 2-D view. */
  vector: [number, number, number] | null;
  /** Recent X/Y samples for the trail. */
  trail?: Array<[number, number]>;
  size?: number;
  maxG?: number;
}

/**
 * Polar view of the gravity-removed (lateral) acceleration in the sensor's
 * X-Y plane. True centripetal acceleration needs a known rotation radius,
 * which one IMU cannot supply, so this is labelled as lateral acceleration.
 */
export function AccelerationVector({
  vector,
  trail = [],
  size = 220,
  maxG = 2,
}: AccelerationVectorProps) {
  const { colors } = useTheme();
  const radius = size / 2 - 18;
  const center = size / 2;

  const project = (x: number, y: number): [number, number] => {
    const clampedX = Math.max(-maxG, Math.min(maxG, x));
    const clampedY = Math.max(-maxG, Math.min(maxG, y));
    return [center + (clampedX / maxG) * radius, center - (clampedY / maxG) * radius];
  };

  const [tipX, tipY] = vector ? project(vector[0], vector[1]) : [center, center];
  const angle = Math.atan2(center - tipY, tipX - center);
  const arrow = [
    `${tipX},${tipY}`,
    `${tipX - 8 * Math.cos(angle - 0.4)},${tipY + 8 * Math.sin(angle - 0.4)}`,
    `${tipX - 8 * Math.cos(angle + 0.4)},${tipY + 8 * Math.sin(angle + 0.4)}`,
  ].join(" ");

  const magnitudeG = vector ? magnitude(vector) : null;

  return (
    <View
      style={styles.wrapper}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        vector
          ? `Lateral acceleration vector: ${magnitudeG?.toFixed(2)} g, X ${vector[0].toFixed(2)} g, Y ${vector[1].toFixed(2)} g.`
          : "No acceleration vector available."
      }
    >
      <Svg width={size} height={size}>
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <Circle
            key={fraction}
            cx={center}
            cy={center}
            r={radius * fraction}
            stroke={colors.border}
            strokeWidth={1}
            fill="none"
          />
        ))}
        <Line
          x1={center - radius}
          y1={center}
          x2={center + radius}
          y2={center}
          stroke={colors.border}
          strokeWidth={1}
        />
        <Line
          x1={center}
          y1={center - radius}
          x2={center}
          y2={center + radius}
          stroke={colors.border}
          strokeWidth={1}
        />

        {/* +1 g reference ring label */}
        <SvgText
          x={center + radius * 0.5 + 3}
          y={center - 4}
          fontSize={9}
          fill={colors.textSubtle}
        >
          1g
        </SvgText>
        <SvgText x={center + radius + 2} y={center + 10} fontSize={9} fill={colors.textSubtle}>
          +X
        </SvgText>
        <SvgText x={center + 3} y={center - radius - 4} fontSize={9} fill={colors.textSubtle}>
          +Y
        </SvgText>

        {trail.slice(-40).map(([x, y], index, all) => {
          const [px, py] = project(x, y);
          const opacity = 0.08 + (index / Math.max(all.length - 1, 1)) * 0.35;
          return (
            <Circle
              key={`${x}-${y}-${index}`}
              cx={px}
              cy={py}
              r={1.8}
              fill={colors.accent}
              opacity={opacity}
            />
          );
        })}

        {vector ? (
          <>
            <Path
              d={`M ${center} ${center} L ${tipX} ${tipY}`}
              stroke={colors.accent}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <Polygon points={arrow} fill={colors.accent} />
            <Circle cx={tipX} cy={tipY} r={3} fill={colors.accent} />
          </>
        ) : null}
      </Svg>

      {vector ? (
        <View style={styles.readout}>
          <Text style={[styles.value, { color: colors.text }]}>
            {magnitudeG?.toFixed(2)} g
          </Text>
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            X {vector[0].toFixed(2)} · Y {vector[1].toFixed(2)} · Z{" "}
            {vector[2].toFixed(2)} g
          </Text>
        </View>
      ) : (
        <Text style={[styles.caption, { color: colors.textSubtle }]}>
          No vector yet
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center", gap: 4 },
  readout: { alignItems: "center", gap: 1 },
  value: {
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  caption: { fontSize: type.caption, textAlign: "center" },
});
