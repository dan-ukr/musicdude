import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CreatePlaylistRequest, LibraryFacets, TrackSummary } from '@musicdude/shared';
import { api, ApiError } from '../../src/api/client';
import { TrackRow } from '../../src/components/TrackRow';
import { facetValueLabel } from '../../src/i18n/facetLabels';
import { useLanguage, useT } from '../../src/i18n/LanguageContext';
import { C } from '../../src/theme/colors';

type FacetKind = 'genre' | 'language' | 'mood' | 'era' | 'region' | 'tempo' | 'energy' | 'rarity';
const FACET_ORDER: FacetKind[] = ['genre', 'language', 'mood', 'era', 'region', 'tempo', 'energy', 'rarity'];
const FACET_TITLE: Record<FacetKind, string> = {
  genre: 'Genres',
  language: 'Languages',
  mood: 'Moods',
  era: 'Eras',
  region: 'Regions',
  tempo: 'Tempo',
  energy: 'Energy',
  rarity: 'Rarity',
};

export default function Library() {
  const t = useT();
  const { lang } = useLanguage();
  const params = useLocalSearchParams<Record<string, string>>();
  const [facets, setFacets] = useState<LibraryFacets | null>(null);
  const [selected, setSelected] = useState<Partial<Record<FacetKind, string>>>({});
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [recommended, setRecommended] = useState<TrackSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [gate, setGate] = useState<string | null>(null);
  const [premium, setPremium] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number | null }>({ used: 0, limit: 3 });
  const [name, setName] = useState('');
  const [blend, setBlend] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // A tap on any portrait chart lands here with that facet pre-selected.
  useFocusEffect(
    useCallback(() => {
      const incoming: Partial<Record<FacetKind, string>> = {};
      for (const key of FACET_ORDER) {
        const value = params[key];
        if (typeof value === 'string' && value) incoming[key] = value;
      }
      if (Object.keys(incoming).length > 0) setSelected(incoming);
      api.libraryFacets().then(setFacets).catch(() => {});
      api
        .billingStatus()
        .then((s) => {
          setPremium(s.premium);
          setQuota(s.playlists);
        })
        .catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.genre, params.language, params.mood, params.era, params.region]),
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setGate(null);
      api
        .libraryTracks(selected)
        .then((rows) => !cancelled && setTracks(rows))
        .catch((err) => {
          if (!cancelled && err instanceof ApiError && err.isPremiumRequired) {
            setGate('facet_stack');
            setTracks([]);
          }
        })
        .finally(() => !cancelled && setLoading(false));
      if (blend && premium) {
        api
          .recommended(selected)
          .then((rows) => !cancelled && setRecommended(rows))
          .catch(() => !cancelled && setRecommended([]));
      } else {
        setRecommended([]);
      }
      return () => {
        cancelled = true;
      };
    }, [selected, blend, premium]),
  );

  const toggle = (facet: FacetKind, value: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[facet] === value) delete next[facet];
      else next[facet] = value;
      return next;
    });

  const activeCount = Object.keys(selected).length;

  const createPlaylist = async () => {
    setNotice(null);
    try {
      const created = await api.createPlaylist({
        // Chip values come from the server's own facet list, so they are valid
        // members of the union even though the state holds them as strings.
        name: name.trim() || defaultName(selected, t, lang),
        facets: selected as CreatePlaylistRequest['facets'],
        includeRecommended: blend && premium,
      });
      setName('');
      const status = await api.billingStatus().catch(() => null);
      if (status) setQuota(status.playlists);
      setNotice(`${created.name} · ${created.trackCount}`);
      router.push('/playlists');
    } catch (err) {
      if (err instanceof ApiError && err.isPremiumRequired) {
        setGate(String(err.detail?.reason ?? 'playlist_quota'));
      } else if (err instanceof ApiError) {
        setNotice(err.message);
      }
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} stickyHeaderIndices={[0]}>
        <View style={styles.header}>
          <Text style={styles.heading}>{t('Library')}</Text>
          <Pressable onPress={() => router.push('/playlists')}>
            <Text style={styles.link}>{t('Playlists')}</Text>
          </Pressable>
        </View>

        {facets
          ? FACET_ORDER.filter((facet) => (facets[facet] ?? []).length > 1).map((facet) => (
              <View key={facet} style={styles.facetBlock}>
                <Text style={styles.facetTitle}>{t(FACET_TITLE[facet])}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {(facets[facet] ?? []).slice(0, 24).map((option) => {
                      const active = selected[facet] === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => toggle(facet, option.value)}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {t(facetValueLabel(facet, option.value, lang))} · {option.count}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            ))
          : null}

        {gate === 'facet_stack' ? (
          <PremiumNotice
            text={t('Free stacks two filters. Premium stacks as many as you like.')}
            t={t}
          />
        ) : null}
        {gate === 'playlist_quota' ? (
          <PremiumNotice text={t('You have used your 3 playlists this month.')} t={t} />
        ) : null}
        {gate === 'recommended_blend' ? (
          <PremiumNotice text={t('Blending in recommendations is a premium feature.')} t={t} />
        ) : null}

        <View style={styles.createBox}>
          <TextInput
            style={styles.input}
            placeholder={t('Playlist name')}
            placeholderTextColor={C.MUTED}
            value={name}
            onChangeText={setName}
          />
          <Pressable style={styles.blendRow} onPress={() => setBlend((b) => !b)}>
            <View style={[styles.checkbox, blend && styles.checkboxOn]} />
            <Text style={styles.blendText}>
              {t('Add recommended tracks')}
              {premium ? '' : ` · ${t('Premium')}`}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.primary, tracks.length === 0 && styles.disabled]}
            disabled={tracks.length === 0}
            onPress={createPlaylist}
          >
            <Text style={styles.primaryText}>
              {t('Create playlist')}
              {quota.limit !== null ? ` · ${quota.used}/${quota.limit}` : ''}
            </Text>
          </Pressable>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        </View>

        <Text style={styles.resultCount}>
          {tracks.length} {t('tracks')}
          {activeCount > 0 ? ` · ${activeCount} ${t('filters')}` : ''}
        </Text>

        {loading ? <ActivityIndicator color={C.ACCENT} style={styles.spinner} /> : null}

        {recommended.length > 0 ? (
          <>
            <Text style={styles.blockTitle}>{t('Recommended for this filter')}</Text>
            {recommended.map((track) => (
              <TrackRow key={`rec-${track.id}`} track={track} badge={t('New')} />
            ))}
            <Text style={styles.blockTitle}>{t('From your library')}</Text>
          </>
        ) : null}

        {tracks.map((track) => (
          <TrackRow key={track.id} track={track} />
        ))}

        {!loading && tracks.length === 0 && !gate ? (
          <Text style={styles.empty}>{t('No tracks match this filter')}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PremiumNotice({ text, t }: { text: string; t: (s: string) => string }) {
  return (
    <View style={styles.gate}>
      <Text style={styles.gateText}>{text}</Text>
      <Pressable onPress={() => router.push('/premium')}>
        <Text style={styles.gateLink}>{t('See premium')}</Text>
      </Pressable>
    </View>
  );
}

function defaultName(
  selected: Record<string, string | undefined>,
  t: (s: string) => string,
  lang: string,
): string {
  const parts = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([facet, value]) => t(facetValueLabel(facet as never, value as string, lang)));
  return parts.length ? parts.join(' · ') : t('My playlist');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  scroll: { padding: 20, paddingBottom: 90 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.BG,
    paddingBottom: 10,
  },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800' },
  link: { color: C.CYAN, fontSize: 14, fontWeight: '600' },
  facetBlock: { marginBottom: 12 },
  facetTitle: {
    color: C.MUTED,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    backgroundColor: C.SURFACE,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  chipText: { color: C.MUTED, fontSize: 12 },
  chipTextActive: { color: C.INK, fontWeight: '700' },
  createBox: {
    backgroundColor: C.SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 12,
    gap: 10,
    marginVertical: 12,
  },
  input: {
    backgroundColor: C.INPUT_BG,
    borderWidth: 1,
    borderColor: C.INPUT_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.INK,
  },
  blendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    backgroundColor: C.SURFACE_2,
  },
  checkboxOn: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  blendText: { color: C.MUTED, fontSize: 13 },
  primary: { backgroundColor: C.ACCENT, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: C.INK, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  notice: { color: C.CYAN, fontSize: 12 },
  resultCount: { color: C.MUTED, fontSize: 12, marginBottom: 10 },
  blockTitle: { color: C.INK, fontSize: 14, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  spinner: { marginVertical: 12 },
  empty: { color: C.MUTED, textAlign: 'center', marginTop: 20 },
  gate: {
    backgroundColor: C.ACCENT_SOFT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.ACCENT,
    padding: 12,
    gap: 6,
    marginBottom: 10,
  },
  gateText: { color: C.INK, fontSize: 13, lineHeight: 18 },
  gateLink: { color: C.CYAN, fontSize: 13, fontWeight: '700' },
});
