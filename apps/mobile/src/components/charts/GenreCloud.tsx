import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '../../theme/colors';

export type Tag = { value: string; label: string; count: number };

/** Weighted tag cloud — the right shape for a long tail of genre names. */
export function GenreCloud({
  tags,
  selected,
  onSelect,
}: {
  tags: Tag[];
  selected?: string | null;
  onSelect?: (value: string) => void;
}) {
  const max = Math.max(...tags.map((t) => t.count), 1);
  return (
    <View style={styles.wrap}>
      {tags.map((tag) => {
        const weight = tag.count / max;
        const isSelected = selected === tag.value;
        return (
          <Pressable
            key={tag.value}
            onPress={() => onSelect?.(tag.value)}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? C.ACCENT : C.SURFACE_2,
                borderColor: isSelected ? C.ACCENT : C.CARD_BORDER,
                opacity: selected && !isSelected ? 0.55 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { fontSize: 12 + weight * 6, fontWeight: weight > 0.55 ? '700' : '500' },
              ]}
            >
              {tag.label}
            </Text>
            <Text style={styles.chipCount}>{tag.count}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { color: C.INK },
  chipCount: { color: C.MUTED, fontSize: 11 },
});
