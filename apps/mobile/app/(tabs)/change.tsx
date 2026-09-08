import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChangeSummary } from '@musicdude/shared';
import { api } from '../../src/api/client';
import { facetValueLabel } from '../../src/i18n/facetLabels';
import { useLanguage, useT } from '../../src/i18n/LanguageContext';
import { C } from '../../src/theme/colors';

const AREA_HEIGHT = 120;

export default function Change() {
  const t = useT();
  const { lang } = useLanguage();
  const [data, setData] = useState<ChangeSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      api
        .change()
        .then((res) => !cancelled && setData(res))
        .catch(() => !cancelled && setData(null))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const timeline = data?.timeline ?? [];
  const max = Math.max(...timeline.map((p) => p.trackCount), 1);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>{t('Change')}</Text>
        <Text style={styles.sub}>{t('How your taste changes over time.')}</Text>

        {loading ? <ActivityIndicator color={C.ACCENT} style={styles.spinner} /> : null}

        {!loading && timeline.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>{t('Import music to begin.')}</Text>
          </View>
        ) : null}

        {timeline.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('Tracks added')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.stepWrap}>
                {timeline.map((point) => (
                  <View key={point.month} style={styles.stepColumn}>
                    <View style={styles.stepArea}>
                      <View
                        style={[
                          styles.step,
                          { height: Math.max((point.trackCount / max) * AREA_HEIGHT, 3) },
                        ]}
                      />
                    </View>
                    <Text style={styles.stepMonth}>{point.month.slice(2)}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}

        {timeline.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('Month by month')}</Text>
            {[...timeline].reverse().map((point) => (
              <View key={point.month} style={styles.monthRow}>
                <Text style={styles.monthLabel}>{point.month}</Text>
                <View style={styles.monthTags}>
                  {point.topGenre ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>{point.topGenre}</Text>
                    </View>
                  ) : null}
                  {point.topLanguage ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>
                        {t(facetValueLabel('language', point.topLanguage, lang))}
                      </Text>
                    </View>
                  ) : null}
                  {point.topRegion ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>
                        {t(facetValueLabel('region', point.topRegion, lang))}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.monthCount}>{point.trackCount}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {data && data.arrived.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('New territory')}</Text>
            <Text style={styles.body}>{t('These appeared in your library for the first time.')}</Text>
            {data.arrived.map((item) => (
              <View key={`${item.facet}-${item.value}`} style={styles.arrivedRow}>
                <Text style={styles.arrivedValue}>
                  {item.facet === 'genre'
                    ? item.value
                    : t(facetValueLabel(item.facet as never, item.value, lang))}
                </Text>
                <Text style={styles.arrivedMonth}>{item.month}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {data?.locked ? (
          <View style={styles.gate}>
            <Text style={styles.gateText}>{t('Free shows the last 30 days. Premium shows your whole history.')}</Text>
            <Pressable onPress={() => router.push('/premium')}>
              <Text style={styles.gateLink}>{t('See premium')}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  scroll: { padding: 20, paddingBottom: 90 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800' },
  sub: { color: C.MUTED, fontSize: 13, marginTop: 4, marginBottom: 14 },
  spinner: { marginVertical: 16 },
  card: {
    backgroundColor: C.SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    color: C.MUTED,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  body: { color: C.MUTED, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  stepWrap: { flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  stepColumn: { alignItems: 'center', width: 40 },
  stepArea: { height: AREA_HEIGHT, justifyContent: 'flex-end' },
  step: { width: 30, backgroundColor: C.CYAN, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  stepMonth: { color: C.MUTED, fontSize: 10, marginTop: 6 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  monthLabel: { color: C.INK, fontSize: 12, width: 58 },
  monthTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 },
  tag: { backgroundColor: C.SURFACE_2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { color: C.MUTED, fontSize: 11 },
  monthCount: { color: C.CYAN, fontSize: 12, fontWeight: '700' },
  arrivedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  arrivedValue: { color: C.INK, fontSize: 13 },
  arrivedMonth: { color: C.MUTED, fontSize: 12 },
  gate: {
    backgroundColor: C.ACCENT_SOFT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.ACCENT,
    padding: 12,
    gap: 6,
  },
  gateText: { color: C.INK, fontSize: 13, lineHeight: 18 },
  gateLink: { color: C.CYAN, fontSize: 13, fontWeight: '700' },
});
