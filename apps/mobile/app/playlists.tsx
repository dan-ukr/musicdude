import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PlaylistSummary, TrackSummary } from '@musicdude/shared';
import { api } from '../src/api/client';
import { TrackRow } from '../src/components/TrackRow';
import { useT } from '../src/i18n/LanguageContext';
import { C } from '../src/theme/colors';

export default function Playlists() {
  const t = useT();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      api
        .playlists()
        .then(setPlaylists)
        .catch(() => setPlaylists([]))
        .finally(() => setLoading(false));
    }, []),
  );

  const open = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      setTracks([]);
      return;
    }
    setOpenId(id);
    setTracks(await api.playlistTracks(id).catch(() => []));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>{t('Playlists')}</Text>

        {loading ? <ActivityIndicator color={C.ACCENT} /> : null}

        {!loading && playlists.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>{t('No playlists yet. Build one from a filter.')}</Text>
            <Pressable style={styles.primary} onPress={() => router.push('/(tabs)/library')}>
              <Text style={styles.primaryText}>{t('Library')}</Text>
            </Pressable>
          </View>
        ) : null}

        {playlists.map((playlist) => (
          <View key={playlist.id} style={styles.card}>
            <Pressable style={styles.rowHead} onPress={() => open(playlist.id)}>
              <View style={styles.rowMeta}>
                <Text style={styles.name}>{playlist.name}</Text>
                <Text style={styles.meta}>
                  {playlist.trackCount} {t('tracks')}
                  {playlist.recommendedCount > 0
                    ? ` · ${playlist.recommendedCount} ${t('recommended')}`
                    : ''}
                </Text>
              </View>
              <Text style={styles.chevron}>{openId === playlist.id ? '▾' : '▸'}</Text>
            </Pressable>
            {openId === playlist.id
              ? tracks.map((track) => <TrackRow key={track.id} track={track} />)
              : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  scroll: { padding: 20, paddingBottom: 90 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800', marginBottom: 14 },
  card: {
    backgroundColor: C.SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 14,
    marginBottom: 12,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowMeta: { flex: 1 },
  name: { color: C.INK, fontSize: 15, fontWeight: '700' },
  meta: { color: C.MUTED, fontSize: 12, marginTop: 2 },
  chevron: { color: C.MUTED, fontSize: 16 },
  body: { color: C.MUTED, fontSize: 14, marginBottom: 12 },
  primary: { backgroundColor: C.ACCENT, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: C.INK, fontSize: 15, fontWeight: '700' },
});
