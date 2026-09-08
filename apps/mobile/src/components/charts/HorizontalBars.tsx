import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '../../theme/colors';

export type BarItem = { value: string; label: string; count: number };

/** Ranked list — good for many named categories (languages, genres). */
export function HorizontalBars({
  items,
  selected,
  onSelect,
  accent = C.CYAN,
}: {
  items: BarItem[];
  selected?: string | null;
  onSelect?: (value: string) => void;
  accent?: string;
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const isSelected = selected === item.value;
        return (
          <Pressable
            key={item.value}
            style={[styles.row, isSelected && styles.rowActive]}
            onPress={() => onSelect?.(item.value)}
          >
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.max((item.count / max) * 100, 3)}%`,
                    backgroundColor: accent,
                    opacity: selected && !isSelected ? 0.35 : 1,
                  },
                ]}
              />
            </View>
            <Text style={styles.count}>{item.count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  rowActive: { backgroundColor: C.ACCENT_SOFT },
  label: { color: C.INK, fontSize: 13, width: 104 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.SURFACE_2, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  count: { color: C.MUTED, fontSize: 12, width: 30, textAlign: 'right' },
});
