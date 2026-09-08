import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { C } from '../../theme/colors';

export type Star = { value: string; label: string; count: number };

/**
 * The portrait's signature view: moods placed in energy x brightness space, so
 * the library reads as a constellation rather than a list. Stars are tappable
 * and sized by how much of the library sits there.
 */
const POSITION: Record<string, { x: number; y: number }> = {
  euphoric: { x: 0.78, y: 0.22 },
  energetic: { x: 0.85, y: 0.52 },
  dark: { x: 0.72, y: 0.82 },
  melancholic: { x: 0.28, y: 0.8 },
  calm: { x: 0.18, y: 0.45 },
  warm: { x: 0.3, y: 0.2 },
  unknown: { x: 0.5, y: 0.5 },
};

export function MoodConstellation({
  stars,
  selected,
  onSelect,
  axisXLabel,
  axisYLabel,
}: {
  stars: Star[];
  selected?: string | null;
  onSelect?: (value: string) => void;
  axisXLabel: string;
  axisYLabel: string;
}) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 88, 320);
  const height = size * 0.78;
  const max = Math.max(...stars.map((s) => s.count), 1);
  const placed = stars
    .filter((s) => POSITION[s.value])
    .map((s) => ({ ...s, pos: POSITION[s.value] }));

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={height}>
        {/* faint links between neighbouring moods, drawn first so stars sit on top */}
        {placed.map((a, i) =>
          placed.slice(i + 1).map((b) => (
            <Line
              key={`${a.value}-${b.value}`}
              x1={a.pos.x * size}
              y1={a.pos.y * height}
              x2={b.pos.x * size}
              y2={b.pos.y * height}
              stroke={C.ACCENT}
              strokeOpacity={0.12}
              strokeWidth={1}
            />
          )),
        )}
        {placed.map((star) => {
          const isSelected = selected === star.value;
          const r = 10 + (star.count / max) * 22;
          return (
            <React.Fragment key={star.value}>
              <Circle
                cx={star.pos.x * size}
                cy={star.pos.y * height}
                r={r + 8}
                fill={C.ACCENT}
                fillOpacity={isSelected ? 0.22 : 0.08}
                onPress={() => onSelect?.(star.value)}
              />
              <Circle
                cx={star.pos.x * size}
                cy={star.pos.y * height}
                r={r}
                fill={isSelected ? C.AMBER : C.CYAN}
                fillOpacity={selected && !isSelected ? 0.45 : 0.9}
                onPress={() => onSelect?.(star.value)}
              />
              <SvgText
                x={star.pos.x * size}
                y={star.pos.y * height + r + 14}
                fill={isSelected ? C.INK : C.MUTED}
                fontSize="11"
                textAnchor="middle"
              >
                {star.label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.axes}>
        <Text style={styles.axis}>↑ {axisYLabel}</Text>
        <Text style={styles.axis}>{axisXLabel} →</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  axes: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 2 },
  axis: { color: C.MUTED, fontSize: 11 },
});
