import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePlayer } from '../audio/PlayerContext';
import { C } from '../theme/colors';

/** Persistent mini player: cover, title, progress through the 30s preview. */
export function NowPlayingBar() {
  const { current, isPlaying, positionMs, durationMs, toggle, stop } = usePlayer();
  if (!current) return null;

  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;

  return (
    <View style={styles.bar}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        {current.artworkUrl ? (
          <Image source={{ uri: current.artworkUrl }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverEmpty]} />
        )}
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {current.artist}
          </Text>
        </View>
        <Pressable style={styles.control} onPress={() => toggle(current)}>
          <Text style={styles.controlText}>{isPlaying ? '❚❚' : '▶'}</Text>
        </Pressable>
        <Pressable style={styles.control} onPress={stop}>
          <Text style={styles.controlText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: C.SURFACE_2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    overflow: 'hidden',
  },
  progressTrack: { height: 3, backgroundColor: C.SURFACE },
  progressFill: { height: 3, backgroundColor: C.CYAN },
  row: { flexDirection: 'row', alignItems: 'center', padding: 8, gap: 10 },
  cover: { width: 40, height: 40, borderRadius: 6 },
  coverEmpty: { backgroundColor: C.SURFACE },
  meta: { flex: 1 },
  title: { color: C.INK, fontSize: 13, fontWeight: '600' },
  artist: { color: C.MUTED, fontSize: 11 },
  control: { paddingHorizontal: 10, paddingVertical: 6 },
  controlText: { color: C.INK, fontSize: 15 },
});
