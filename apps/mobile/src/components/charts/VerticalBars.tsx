import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../../theme/colors';

export type Column = { value: string; label: string; count: number };

const HEIGHT = 130;

/** Columns in a fixed order — for anything that reads as a sequence (decades). */
export function VerticalBars({
  columns,
  selected,
  onSelect,
}: {
  columns: Column[];
  selected?: string | null;
  onSelect?: (value: string) => void;
}) {
  const max = Math.max(...columns.map((c) => c.count), 1);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrap}>
      {columns.map((column) => {
        const isSelected = selected === column.value;
        const barHeight = Math.max((column.count / max) * HEIGHT, 4);
        return (
          <Pressable
            key={column.value}
            style={styles.column}
            onPress={() => onSelect?.(column.value)}
          >
            <Text style={styles.count}>{column.count}</Text>
            <View style={styles.barArea}>
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: isSelected ? C.AMBER : C.ACCENT,
                    opacity: selected && !isSelected ? 0.4 : 1,
                  },
                ]}
              />
            </View>
            <Text style={[styles.label, isSelected && styles.labelActive]} numberOfLines={1}>
              {column.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 12, alignItems: 'flex-end', paddingVertical: 4 },
  column: { alignItems: 'center', width: 62 },
  barArea: { height: HEIGHT, justifyContent: 'flex-end' },
  bar: { width: 26, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  count: { color: C.MUTED, fontSize: 11, marginBottom: 4 },
  label: { color: C.MUTED, fontSize: 11, marginTop: 6, textAlign: 'center' },
  labelActive: { color: C.INK, fontWeight: '700' },
});
