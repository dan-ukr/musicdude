import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api/client';
import { useT } from '../src/i18n/LanguageContext';
import { C } from '../src/theme/colors';

const FEATURES: { free: string; premium: string }[] = [
  { free: 'Portrait, daily card, both buttons', premium: 'Time-of-day selves and the full blind-spot map' },
  { free: 'Two filters at a time', premium: 'Unlimited filter stacking' },
  { free: '3 playlists a month, your tracks only', premium: 'Unlimited playlists, with recommended tracks blended in' },
  { free: 'Browse matched events', premium: 'Alerts when a matching event appears' },
  { free: 'Last 30 days of change', premium: 'Your whole history' },
  { free: 'Compare by code with anyone', premium: 'Keep friends and track how the match moves' },
];

export default function Premium() {
  const t = useT();
  const [premium, setPremium] = useState(false);
  const [devToggle, setDevToggle] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number | null }>({ used: 0, limit: 3 });

  const load = useCallback(() => {
    api
      .billingStatus()
      .then((s) => {
        setPremium(s.premium);
        setDevToggle(s.devToggleEnabled);
        setQuota(s.playlists);
      })
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>{t('Premium')}</Text>
        <Text style={styles.price}>€3.99 / {t('month')}</Text>
        <Text style={styles.tagline}>{t('Free is the mirror. Premium is the remote control.')}</Text>

        <View style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>{t('Your plan')}</Text>
            <Text style={[styles.statusValue, premium && styles.statusActive]}>
              {premium ? t('Premium') : t('Free')}
            </Text>
          </View>
          <Text style={styles.quota}>
            {t('Playlists this month')}: {quota.used}
            {quota.limit !== null ? ` / ${quota.limit}` : ''}
          </Text>
        </View>

        {FEATURES.map((row) => (
          <View key={row.free} style={styles.featureRow}>
            <View style={styles.featureCol}>
              <Text style={styles.colLabel}>{t('Free')}</Text>
              <Text style={styles.freeText}>{t(row.free)}</Text>
            </View>
            <View style={[styles.featureCol, styles.premiumCol]}>
              <Text style={[styles.colLabel, styles.colLabelPremium]}>{t('Premium')}</Text>
              <Text style={styles.premiumText}>{t(row.premium)}</Text>
            </View>
          </View>
        ))}

        {devToggle ? (
          <View style={styles.devCard}>
            <View style={styles.devRow}>
              <Text style={styles.devText}>{t('Demo: unlock premium')}</Text>
              <Switch
                value={premium}
                onValueChange={async (value) => {
                  await api.setDevPremium(value).catch(() => {});
                  load();
                }}
                trackColor={{ true: C.ACCENT, false: C.SURFACE_2 }}
              />
            </View>
            <Text style={styles.devHint}>
              {t('Local demo switch. In the store, RevenueCat grants this.')}
            </Text>
          </View>
        ) : (
          <Pressable style={styles.primary}>
            <Text style={styles.primaryText}>{t('Subscribe')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  scroll: { padding: 20, paddingBottom: 90 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800' },
  price: { color: C.ACCENT, fontSize: 22, fontWeight: '800', marginTop: 4 },
  tagline: { color: C.MUTED, fontSize: 14, marginTop: 6, marginBottom: 16, lineHeight: 20 },
  card: {
    backgroundColor: C.SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 14,
    marginBottom: 14,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { color: C.MUTED, fontSize: 13 },
  statusValue: { color: C.INK, fontSize: 15, fontWeight: '700' },
  statusActive: { color: C.ACCENT },
  quota: { color: C.MUTED, fontSize: 12, marginTop: 8 },
  featureRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  featureCol: {
    flex: 1,
    backgroundColor: C.SURFACE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 12,
  },
  premiumCol: { borderColor: C.ACCENT, backgroundColor: C.ACCENT_SOFT },
  colLabel: {
    color: C.MUTED,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  colLabelPremium: { color: C.ACCENT },
  freeText: { color: C.MUTED, fontSize: 12, lineHeight: 17 },
  premiumText: { color: C.INK, fontSize: 12, lineHeight: 17 },
  devCard: {
    backgroundColor: C.SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.ACCENT,
    padding: 14,
    marginTop: 6,
  },
  devRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  devText: { color: C.INK, fontSize: 14, fontWeight: '600' },
  devHint: { color: C.MUTED, fontSize: 11, marginTop: 6 },
  primary: { backgroundColor: C.ACCENT, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: C.INK, fontSize: 16, fontWeight: '700' },
});
