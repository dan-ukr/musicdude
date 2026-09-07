import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImportedTrack, SearchResult } from '@musicdude/shared';
import { api } from '../src/api/client';
import { useT } from '../src/i18n/LanguageContext';
import { C } from '../src/theme/colors';

const keyOf = (t: { title: string; artist: string }) => `${t.artist}::${t.title}`.toLowerCase();

export default function ImportMusic() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [staged, setStaged] = useState<ImportedTrack[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onQueryChange = (text: string) => {
    setQuery(text);
    if (debounce.current) clearTimeout(debounce.current);
    if (text.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await api.searchTracks(text.trim()));
        setSearched(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const stagedKeys = new Set(staged.map(keyOf));

  const toggle = (r: SearchResult) => {
    const key = keyOf(r);
    setStaged((prev) =>
      prev.some((s) => keyOf(s) === key)
        ? prev.filter((s) => keyOf(s) !== key)
        : [...prev, { title: r.title, artist: r.artist }],
    );
  };

  const start = async (mode: 'search' | 'demo') => {
    setError(null);
    setBusy(true);
    try {
      if (mode === 'demo') await api.importDemo();
      else await api.startImport('search', staged);
      router.replace('/(tabs)/portrait');
    } catch {
      setError(t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.heading}>{t('Import music')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('Search songs or artists')}
        placeholderTextColor={C.MUTED}
        value={query}
        onChangeText={onQueryChange}
        autoCapitalize="none"
      />

      {searching ? <ActivityIndicator color={C.ACCENT} style={styles.spinner} /> : null}

      <FlatList
        style={styles.list}
        data={results}
        keyExtractor={keyOf}
        ListEmptyComponent={
          searched && !searching ? <Text style={styles.empty}>{t('No results')}</Text> : null
        }
        renderItem={({ item }) => {
          const added = stagedKeys.has(keyOf(item));
          return (
            <Pressable style={styles.row} onPress={() => toggle(item)}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowArtist} numberOfLines={1}>
                  {item.artist}
                  {item.year ? ` · ${item.year}` : ''}
                </Text>
              </View>
              <View style={[styles.addPill, added && styles.addPillActive]}>
                <Text style={[styles.addPillText, added && styles.addPillTextActive]}>
                  {added ? t('Added') : t('Add')}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.footer}>
        {staged.length > 0 ? (
          <Pressable
            style={[styles.primary, busy && styles.disabled]}
            onPress={() => start('search')}
            disabled={busy}
          >
            <Text style={styles.primaryText}>
              {t('Start scan')} · {staged.length}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.secondary, busy && styles.disabled]}
          onPress={() => start('demo')}
          disabled={busy}
        >
          <Text style={styles.secondaryText}>{t('Try a demo library')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG, padding: 24 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800', marginBottom: 16 },
  input: {
    backgroundColor: C.INPUT_BG,
    borderWidth: 1,
    borderColor: C.INPUT_BORDER,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.INK,
    fontSize: 16,
  },
  spinner: { marginTop: 12 },
  list: { flex: 1, marginTop: 12 },
  empty: { color: C.MUTED, textAlign: 'center', marginTop: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 14,
    marginBottom: 10,
  },
  rowText: { flex: 1, marginRight: 12 },
  rowTitle: { color: C.INK, fontSize: 15, fontWeight: '600' },
  rowArtist: { color: C.MUTED, fontSize: 13, marginTop: 2 },
  addPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.ACCENT,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addPillActive: { backgroundColor: C.ACCENT },
  addPillText: { color: C.ACCENT, fontSize: 13, fontWeight: '700' },
  addPillTextActive: { color: C.INK },
  error: { color: C.DANGER, marginBottom: 8 },
  footer: { gap: 10 },
  primary: { backgroundColor: C.ACCENT, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: C.INK, fontSize: 16, fontWeight: '700' },
  secondary: {
    backgroundColor: C.SURFACE,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
  },
  secondaryText: { color: C.INK, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
