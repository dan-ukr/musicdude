import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DailyCard, PortraitPayload, PortraitResponse } from '@musicdude/shared';
import { api } from '../../src/api/client';
import { usePlayer } from '../../src/audio/PlayerContext';
import { DonutChart } from '../../src/components/charts/DonutChart';
import { GenreCloud } from '../../src/components/charts/GenreCloud';
import { HorizontalBars } from '../../src/components/charts/HorizontalBars';
import { MoodConstellation } from '../../src/components/charts/MoodConstellation';
import { VerticalBars } from '../../src/components/charts/VerticalBars';
import { facetValueLabel } from '../../src/i18n/facetLabels';
import { useLanguage, useT, useTemplate } from '../../src/i18n/LanguageContext';
import { C } from '../../src/theme/colors';

const POLL_MS = 3000;
const ERA_ORDER = ['pre-1970', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s', 'unknown'];

export default function Portrait() {
  const t = useT();
  const tpl = useTemplate();
  const { lang } = useLanguage();
  const player = usePlayer();
  const [data, setData] = useState<PortraitResponse | null>(null);
  const [card, setCard] = useState<DailyCard | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (cancelled?: () => boolean) => {
    const res = await api.portrait().catch(() => null);
    if (res && !cancelled?.()) setData(res);
    if (res?.portrait && !cancelled?.()) {
      const c = await api.dailyCard().catch(() => null);
      if (c && !cancelled?.()) setCard(c);
    }
    return res;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const isCancelled = () => cancelled;
      const tick = async () => {
        const res = await load(isCancelled);
        if (!cancelled && res?.scan?.state !== 'running' && timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      };
      tick();
      timer.current = setInterval(tick, POLL_MS);
      return () => {
        cancelled = true;
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
      };
    }, [load]),
  );

  const act = async (action: 'more-of-this' | 'get-me-out') => {
    setCardBusy(true);
    const next = await api.dailyCardAction(action).catch(() => null);
    if (next) setCard(next);
    setCardBusy(false);
  };

  const openFiltered = (facet: string, value: string) =>
    router.push(`/(tabs)/library?${facet}=${encodeURIComponent(value)}`);

  const scan = data?.scan ?? null;
  const portrait = data?.portrait ?? null;
  const scanning = scan?.state === 'running';
  const progress = scan && scan.total > 0 ? Math.min(scan.processed / scan.total, 1) : 0;

  const toItems = (dist: Record<string, number> = {}, kind: Parameters<typeof facetValueLabel>[0]) =>
    Object.entries(dist)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value,
        count,
        label: t(facetValueLabel(kind, value, lang)),
      }));

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>{t('Portrait')}</Text>

        {scanning ? (
          <View style={styles.progressCard}>
            <Text style={styles.progressLabel}>{t('Scanning your library…')}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Text style={styles.progressCount}>
              {scan?.processed}/{scan?.total} · {t('tracks analyzed')}
            </Text>
          </View>
        ) : null}

        {card ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('Song for today')}</Text>
            <Pressable
              style={styles.cardTrack}
              onPress={() =>
                card.track.previewUrl &&
                player.toggle({
                  id: card.track.id,
                  title: card.track.title,
                  artist: card.track.artist,
                  previewUrl: card.track.previewUrl,
                  artworkUrl: card.track.artworkUrl,
                })
              }
            >
              {card.track.artworkUrl ? (
                <Image source={{ uri: card.track.artworkUrl }} style={styles.cardCover} />
              ) : (
                <View style={[styles.cardCover, styles.coverEmpty]} />
              )}
              <View style={styles.cardMeta}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {card.track.title}
                </Text>
                <Text style={styles.cardArtist} numberOfLines={1}>
                  {card.track.artist}
                </Text>
                <Text style={styles.cardReason}>
                  {tpl(card.reason.template, localizeParams(card.reason.params, t, lang))}
                </Text>
              </View>
              <Text style={styles.cardPlay}>
                {player.current?.id === card.track.id && player.isPlaying ? '❚❚' : '▶'}
              </Text>
            </Pressable>
            <View style={styles.cardActions}>
              <Pressable
                style={[styles.cardButton, cardBusy && styles.disabled]}
                disabled={cardBusy}
                onPress={() => act('more-of-this')}
              >
                <Text style={styles.cardButtonText}>{t('More of this')}</Text>
              </Pressable>
              <Pressable
                style={[styles.cardButton, styles.cardButtonAlt, cardBusy && styles.disabled]}
                disabled={cardBusy}
                onPress={() => act('get-me-out')}
              >
                <Text style={styles.cardButtonText}>{t('Get me out of this')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {portrait ? (
          <PortraitBody
            portrait={portrait}
            toItems={toItems}
            onSelect={openFiltered}
            t={t}
          />
        ) : !scanning ? (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>{t('Your portrait appears after your first scan.')}</Text>
            <Text style={styles.body}>{t('Import your music to begin.')}</Text>
            <Pressable style={styles.primary} onPress={() => router.push('/import-music')}>
              <Text style={styles.primaryText}>{t('Import music')}</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator color={C.ACCENT} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PortraitBody({
  portrait,
  toItems,
  onSelect,
  t,
}: {
  portrait: PortraitPayload;
  toItems: (d: Record<string, number>, kind: never) => { value: string; label: string; count: number }[];
  onSelect: (facet: string, value: string) => void;
  t: (s: string) => string;
}) {
  const moods = toItems(portrait.moodDistribution, 'mood' as never);
  const regions = toItems(portrait.regionDistribution, 'region' as never).filter(
    (r) => r.value !== 'unknown',
  );
  const languages = toItems(portrait.languageDistribution, 'language' as never).slice(0, 8);
  const eras = toItems(portrait.eraDistribution, 'era' as never).sort(
    (a, b) => ERA_ORDER.indexOf(a.value) - ERA_ORDER.indexOf(b.value),
  );
  const genres = toItems(portrait.genreDistribution ?? {}, 'genre' as never).slice(0, 18);

  // The absent facets are as interesting as the present ones.
  const missingRegions = ['western-europe', 'eastern-europe', 'north-america', 'latin-america', 'africa', 'asia', 'middle-east', 'oceania']
    .filter((r) => !(portrait.regionDistribution ?? {})[r]);

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('Your constellation')}</Text>
        <MoodConstellation
          stars={moods}
          onSelect={(value) => onSelect('mood', value)}
          axisXLabel={t('Energy')}
          axisYLabel={t('Brightness')}
        />
      </View>

      {regions.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Regions')}</Text>
          <DonutChart
            slices={regions}
            centerLabel={t('Tracks')}
            onSelect={(value) => onSelect('region', value)}
          />
        </View>
      ) : null}

      {eras.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Eras')}</Text>
          <VerticalBars columns={eras} onSelect={(value) => onSelect('era', value)} />
        </View>
      ) : null}

      {languages.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Languages')}</Text>
          <HorizontalBars items={languages} onSelect={(value) => onSelect('language', value)} />
        </View>
      ) : null}

      {genres.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Genres')}</Text>
          <GenreCloud tags={genres} onSelect={(value) => onSelect('genre', value)} />
        </View>
      ) : null}

      {missingRegions.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Blind spots')}</Text>
          <Text style={styles.body}>{t('Nothing in your library from:')}</Text>
          <View style={styles.blindWrap}>
            {missingRegions.map((r) => (
              <View key={r} style={styles.blindChip}>
                <Text style={styles.blindText}>{t(regionLabel(r))}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

function regionLabel(value: string): string {
  return value
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/** Facet values inside a reason sentence are localized too. */
function localizeParams(
  params: Record<string, string>,
  t: (s: string) => string,
  lang: string,
): Record<string, string> {
  const kindByKey: Record<string, string> = {
    mood: 'mood',
    from: 'mood',
    to: 'mood',
    region: 'region',
    era: 'era',
    language: 'language',
  };
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const kind = kindByKey[key];
    out[key] = kind ? t(facetValueLabel(kind as never, value, lang)) : value;
  }
  return out;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  scroll: { padding: 20, paddingBottom: 90 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800', marginBottom: 16 },
  progressCard: {
    backgroundColor: C.SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 16,
    marginBottom: 14,
  },
  progressLabel: { color: C.INK, fontSize: 15, fontWeight: '600', marginBottom: 10 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: C.SURFACE_2, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: C.ACCENT },
  progressCount: { color: C.MUTED, fontSize: 13, marginTop: 8 },
  card: {
    backgroundColor: C.SURFACE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    color: C.MUTED,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  cardHeading: { color: C.INK, fontSize: 17, fontWeight: '700', marginBottom: 8 },
  body: { color: C.MUTED, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  cardTrack: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cardCover: { width: 78, height: 78, borderRadius: 10 },
  coverEmpty: { backgroundColor: C.SURFACE_2 },
  cardMeta: { flex: 1 },
  cardTitle: { color: C.INK, fontSize: 16, fontWeight: '700' },
  cardArtist: { color: C.MUTED, fontSize: 13, marginTop: 2 },
  cardReason: { color: C.CYAN, fontSize: 12, marginTop: 6, lineHeight: 17 },
  cardPlay: { color: C.INK, fontSize: 18, paddingHorizontal: 6 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cardButton: {
    flex: 1,
    backgroundColor: C.ACCENT,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  cardButtonAlt: { backgroundColor: C.SURFACE_2, borderWidth: 1, borderColor: C.CARD_BORDER },
  cardButtonText: { color: C.INK, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  primary: { backgroundColor: C.ACCENT, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: C.INK, fontSize: 16, fontWeight: '700' },
  blindWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  blindChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.MUTED,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  blindText: { color: C.MUTED, fontSize: 12 },
});
