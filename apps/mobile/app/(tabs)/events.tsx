import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { TasteEvent } from '@musicdude/shared';
import { api } from '../../src/api/client';
import { useT, useTemplate } from '../../src/i18n/LanguageContext';
import { C } from '../../src/theme/colors';

export default function Events() {
  const t = useT();
  const tpl = useTemplate();
  const [events, setEvents] = useState<TasteEvent[]>([]);
  const [city, setCity] = useState('');
  const [appliedCity, setAppliedCity] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const load = useCallback((where?: string) => {
    setLoading(true);
    api
      .events(where)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(appliedCity);
    }, [load, appliedCity]),
  );

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>{t('Events')}</Text>
        <Text style={styles.sub}>{t('Events near you, matched to your taste.')}</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder={t('City (leave empty for your artists)')}
            placeholderTextColor={C.MUTED}
            value={city}
            onChangeText={setCity}
            onSubmitEditing={() => setAppliedCity(city.trim() || undefined)}
          />
          <Pressable style={styles.searchButton} onPress={() => setAppliedCity(city.trim() || undefined)}>
            <Text style={styles.searchButtonText}>{t('Search')}</Text>
          </Pressable>
        </View>

        {loading ? <ActivityIndicator color={C.ACCENT} style={styles.spinner} /> : null}

        {!loading && events.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>
              {t('No upcoming events found for your artists. Try a city.')}
            </Text>
          </View>
        ) : null}

        {events.map((event) => (
          <Pressable
            key={event.id}
            style={styles.eventCard}
            onPress={() =>
              Linking.openURL(`https://musicbrainz.org/event/${event.id}`).catch(() => {})
            }
          >
            <View style={styles.dateBlock}>
              <Text style={styles.dateDay}>{event.date.slice(8, 10)}</Text>
              <Text style={styles.dateMonth}>{monthShort(event.date)}</Text>
            </View>
            <View style={styles.eventMeta}>
              <Text style={styles.eventName} numberOfLines={2}>
                {event.name}
              </Text>
              <Text style={styles.eventVenue} numberOfLines={1}>
                {[event.venue, event.city].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.eventReason} numberOfLines={1}>
                {tpl(event.reasonTemplate, event.reasonParams)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function monthShort(iso: string): string {
  const month = Number(iso.slice(5, 7));
  return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][month - 1] ?? '';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  scroll: { padding: 20, paddingBottom: 90 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800' },
  sub: { color: C.MUTED, fontSize: 13, marginTop: 4, marginBottom: 14 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  input: {
    flex: 1,
    backgroundColor: C.INPUT_BG,
    borderWidth: 1,
    borderColor: C.INPUT_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.INK,
  },
  searchButton: {
    backgroundColor: C.ACCENT,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchButtonText: { color: C.INK, fontWeight: '700', fontSize: 13 },
  spinner: { marginVertical: 16 },
  card: {
    backgroundColor: C.SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 16,
  },
  body: { color: C.MUTED, fontSize: 14, lineHeight: 20 },
  eventCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: C.SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 12,
    marginBottom: 10,
  },
  dateBlock: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.SURFACE_2,
    borderRadius: 10,
    paddingVertical: 8,
  },
  dateDay: { color: C.INK, fontSize: 20, fontWeight: '800' },
  dateMonth: { color: C.MUTED, fontSize: 11, letterSpacing: 0.5 },
  eventMeta: { flex: 1 },
  eventName: { color: C.INK, fontSize: 14, fontWeight: '600' },
  eventVenue: { color: C.MUTED, fontSize: 12, marginTop: 2 },
  eventReason: { color: C.CYAN, fontSize: 11, marginTop: 4 },
});
