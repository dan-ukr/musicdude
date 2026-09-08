import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PortraitResponse } from '@musicdude/shared';
import { api } from '../../src/api/client';
import { facetValueLabel } from '../../src/i18n/facetLabels';
import { useLanguage, useT } from '../../src/i18n/LanguageContext';
import { C } from '../../src/theme/colors';

const POLL_MS = 3000;

type FacetKind = 'mood' | 'era' | 'region' | 'language' | 'genre';

function DistributionCard({
  title,
  kind,
  data,
}: {
  title: string;
  kind: FacetKind;
  data: Record<string, number>;
}) {
  const { lang, t } = useLanguage();
  const entries = Object.entries(data)
    .filter(([k]) => k !== 'unknown')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const unknown = data['unknown'] ?? 0;
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  if (entries.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {entries.map(([value, count]) => (
        <View key={value} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>
            {t(facetValueLabel(kind, value, lang))}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.round((count / total) * 100)}%` }]} />
          </View>
          <Text style={styles.barCount}>{count}</Text>
        </View>
      ))}
      {unknown > 0 ? (
        <Text style={styles.unknownNote}>
          {t('Unknown')} · {unknown}
        </Text>
      ) : null}
    </View>
  );
}

export default function Portrait() {
  const t = useT();
  const [data, setData] = useState<PortraitResponse | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (isCancelled?: () => boolean) => {
    try {
      const res = await api.portrait();
      if (!isCancelled?.()) setData(res);
      return res;
    } catch {
      return null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const isCancelled = () => cancelled;

      const tick = async () => {
        const res = await load(isCancelled);
        // keep polling only while a scan is running
        if (!cancelled && res?.scan?.state !== 'running' && timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      };

      tick();
      timer.current = setInterval(tick, POLL_MS);
      return () => {
        cancelled = true;
        if (timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      };
    }, [load]),
  );

  const scan = data?.scan ?? null;
  const portrait = data?.portrait ?? null;
  const scanning = scan?.state === 'running';
  const progress = scan && scan.total > 0 ? Math.min(scan.processed / scan.total, 1) : 0;

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

        {scan?.state === 'done' && portrait ? (
          <Text style={styles.doneNote}>{t('Scan complete')}</Text>
        ) : null}

        {portrait ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('Tracks')}</Text>
              <Text style={styles.bigNumber}>{portrait.trackCount}</Text>
            </View>
            <DistributionCard title={t('Genres')} kind="genre" data={portrait.genreDistribution ?? {}} />
            <DistributionCard title={t('Eras')} kind="era" data={portrait.eraDistribution} />
            <DistributionCard title={t('Moods')} kind="mood" data={portrait.moodDistribution} />
            <DistributionCard title={t('Regions')} kind="region" data={portrait.regionDistribution} />
            <DistributionCard
              title={t('Languages')}
              kind="language"
              data={portrait.languageDistribution}
            />
          </>
        ) : !scanning ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Your portrait appears after your first scan.')}</Text>
            <Text style={styles.cardBody}>{t('Import your music to begin.')}</Text>
            <Pressable style={styles.primary} onPress={() => router.push('/import-music')}>
              <Text style={styles.primaryText}>{t('Import music')}</Text>
            </Pressable>
          </View>
        ) : null}

        {portrait && !scanning ? (
          <Pressable style={styles.secondary} onPress={() => router.push('/import-music')}>
            <Text style={styles.secondaryText}>{t('Import music')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  scroll: { padding: 24, paddingBottom: 40 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800', marginBottom: 20 },
  progressCard: {
    backgroundColor: C.SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 16,
    marginBottom: 16,
  },
  progressLabel: { color: C.INK, fontSize: 15, fontWeight: '600', marginBottom: 10 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.SURFACE_2,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: C.ACCENT },
  progressCount: { color: C.MUTED, fontSize: 13, marginTop: 8 },
  doneNote: { color: C.CYAN, fontSize: 13, fontWeight: '600', marginBottom: 12 },
  card: {
    backgroundColor: C.SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: { color: C.INK, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  cardBody: { color: C.MUTED, fontSize: 15, lineHeight: 21, marginBottom: 12 },
  bigNumber: { color: C.ACCENT, fontSize: 36, fontWeight: '800' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  barLabel: { color: C.INK, fontSize: 13, width: 96 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: C.SURFACE_2, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: C.CYAN },
  barCount: { color: C.MUTED, fontSize: 12, width: 32, textAlign: 'right' },
  unknownNote: { color: C.MUTED, fontSize: 12, marginTop: 4 },
  primary: { backgroundColor: C.ACCENT, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: C.INK, fontSize: 16, fontWeight: '700' },
  secondary: {
    backgroundColor: C.SURFACE,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
  },
  secondaryText: { color: C.INK, fontSize: 15, fontWeight: '600' },
});
