import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackSummary } from '@musicdude/shared';
import { usePlayer } from '../audio/PlayerContext';
import { C } from '../theme/colors';

export function TrackRow({ track, badge }: { track: TrackSummary; badge?: string }) {
  const { current, isPlaying, toggle } = usePlayer();
  const active = current?.id === track.id;
  const playable = Boolean(track.previewUrl);

  return (
    <Pressable
      style={[styles.row, active && styles.rowActive]}
      onPress={() =>
        playable &&
        toggle({
          id: track.id,
          title: track.title,
          artist: track.artist,
          previewUrl: track.previewUrl,
          artworkUrl: track.artworkUrl,
        })
      }
    >
      {track.artworkUrl ? (
        <Image source={{ uri: track.artworkUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}>
          <Text style={styles.coverGlyph}>♪</Text>
        </View>
      )}
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
          {track.releaseYear ? ` · ${track.releaseYear}` : ''}
        </Text>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={[styles.play, !playable && styles.playDisabled]}>
        {active && isPlaying ? '❚❚' : '▶'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 12,
    backgroundColor: C.SURFACE,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    marginBottom: 8,
  },
  rowActive: { borderColor: C.CYAN },
  cover: { width: 46, height: 46, borderRadius: 8 },
  coverEmpty: { backgroundColor: C.SURFACE_2, alignItems: 'center', justifyContent: 'center' },
  coverGlyph: { color: C.MUTED, fontSize: 18 },
  meta: { flex: 1 },
  title: { color: C.INK, fontSize: 14, fontWeight: '600' },
  artist: { color: C.MUTED, fontSize: 12, marginTop: 2 },
  badge: {
    backgroundColor: C.ACCENT_SOFT,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: C.ACCENT, fontSize: 10, fontWeight: '700' },
  play: { color: C.INK, fontSize: 15, paddingHorizontal: 8 },
  playDisabled: { color: C.MUTED, opacity: 0.4 },
});
