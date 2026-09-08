import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { C } from '../../theme/colors';

export type Slice = { value: string; label: string; count: number };

const SIZE = 220;
const RADIUS = 88;
const THICKNESS = 26;
const PALETTE = ['#8B5CF6', '#22D3EE', '#F5B950', '#FF6B9D', '#4ADE80', '#F97362', '#A78BFA', '#38BDF8'];

/** Radial breakdown — the whole of something split into parts. Arcs are tappable. */
export function DonutChart({
  slices,
  selected,
  onSelect,
  centerLabel,
}: {
  slices: Slice[];
  selected?: string | null;
  onSelect?: (value: string) => void;
  centerLabel?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  let angle = -Math.PI / 2; // start at 12 o'clock
  const arcs = slices.map((slice, i) => {
    const sweep = (slice.count / total) * Math.PI * 2;
    const path = arcPath(SIZE / 2, SIZE / 2, RADIUS, angle, angle + sweep);
    const mid = angle + sweep / 2;
    angle += sweep;
    return { slice, path, color: PALETTE[i % PALETTE.length], mid, sweep };
  });

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        <G>
          {arcs.map(({ slice, path, color, sweep }) => {
            const isSelected = selected === slice.value;
            const dim = selected && !isSelected;
            return (
              <Path
                key={slice.value}
                d={path}
                stroke={color}
                strokeOpacity={dim ? 0.28 : 1}
                strokeWidth={isSelected ? THICKNESS + 8 : THICKNESS}
                fill="none"
                strokeLinecap={sweep < 0.15 ? 'round' : 'butt'}
                onPress={() => onSelect?.(slice.value)}
              />
            );
          })}
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS - THICKNESS} fill={C.BG} />
          <SvgText
            x={SIZE / 2}
            y={SIZE / 2 - 4}
            fill={C.INK}
            fontSize="30"
            fontWeight="800"
            textAnchor="middle"
          >
            {String(total)}
          </SvgText>
          {centerLabel ? (
            <SvgText
              x={SIZE / 2}
              y={SIZE / 2 + 18}
              fill={C.MUTED}
              fontSize="12"
              textAnchor="middle"
            >
              {centerLabel}
            </SvgText>
          ) : null}
        </G>
      </Svg>

      <View style={styles.legend}>
        {arcs.map(({ slice, color }) => (
          <Pressable
            key={slice.value}
            style={[styles.legendRow, selected === slice.value && styles.legendRowActive]}
            onPress={() => onSelect?.(slice.value)}
          >
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {slice.label}
            </Text>
            <Text style={styles.legendCount}>{slice.count}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  // A full circle cannot be drawn as a single arc; nudge the sweep.
  const sweep = Math.min(end - start, Math.PI * 2 - 0.001);
  const e = start + sweep;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(e);
  const y2 = cy + r * Math.sin(e);
  const largeArc = sweep > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  legend: { alignSelf: 'stretch', gap: 2 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  legendRowActive: { backgroundColor: C.ACCENT_SOFT },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: C.INK, fontSize: 13, flex: 1 },
  legendCount: { color: C.MUTED, fontSize: 12 },
});
