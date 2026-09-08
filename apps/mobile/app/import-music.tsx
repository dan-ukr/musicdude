import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImportedTrack, SearchResult } from '@musicdude/shared';
import { api, ApiError } from '../src/api/client';
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
  const [link, setLink] = useState('');
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(label);
    try {
      await fn();
      router.replace('/(tabs)/portrait');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(null);
    }
  };

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

  const pickFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/xml', 'application/xml', 'text/plain', 'text/csv', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    let content: string;
    if (Platform.OS === 'web' && asset.file) {
      content = await asset.file.text();
    } else {
      const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
      content = await FileSystem.readAsStringAsync(asset.uri);
    }
    await run('file', () => api.importFile(content));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>{t('Import music')}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Spotify')}</Text>
          <Text style={styles.cardBody}>{t('Paste a public playlist, album or track link.')}</Text>
          <TextInput
            style={styles.input}
            placeholder="https://open.spotify.com/playlist/…"
            placeholderTextColor={C.MUTED}
            autoCapitalize="none"
            value={link}
            onChangeText={setLink}
          />
          <Pressable
            style={[styles.spotifyButton, (busy !== null || link.length < 8) && styles.disabled]}
            disabled={busy !== null || link.length < 8}
            onPress={() => run('link', () => api.importSpotifyLink(link.trim()))}
          >
            <Text style={styles.spotifyText}>
              {busy === 'link' ? t('Importing…') : t('Import from link')}
            </Text>
          </Pressable>
          {Platform.OS !== 'web' ? (
            <Pressable style={styles.ghostButton} onPress={() => router.push('/connect-spotify')}>
              <Text style={styles.ghostText}>{t('Or log in and import Liked Songs')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Apple Music / iTunes')}</Text>
          <Text style={styles.cardBody}>
            {t('Upload a library export: iTunes Library.xml, a Spotify data export, or a text list.')}
          </Text>
          <Pressable
            style={[styles.appleButton, busy !== null && styles.disabled]}
            disabled={busy !== null}
            onPress={() => void pickFile()}
          >
            <Text style={styles.appleText}>
              {busy === 'file' ? t('Importing…') : t('Choose a file')}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Paste a list')}</Text>
          <Text style={styles.cardBody}>{t('One track per line: Artist - Title')}</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder={'Океан Ельзи - Обійми\nRadiohead - Paranoid Android'}
            placeholderTextColor={C.MUTED}
            multiline
            value={pasted}
            onChangeText={setPasted}
          />
          <Pressable
            style={[styles.primary, (busy !== null || pasted.trim().length < 3) && styles.disabled]}
            disabled={busy !== null || pasted.trim().length < 3}
            onPress={() => run('paste', () => api.importFile(pasted))}
          >
            <Text style={styles.primaryText}>{t('Import list')}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Search and add')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('Search songs or artists')}
            placeholderTextColor={C.MUTED}
            value={query}
            onChangeText={onQueryChange}
            autoCapitalize="none"
          />
          {searching ? <ActivityIndicator color={C.ACCENT} style={styles.spinner} /> : null}
          {searched && results.length === 0 && !searching ? (
            <Text style={styles.empty}>{t('No results')}</Text>
          ) : null}
          {results.map((item) => {
            const added = stagedKeys.has(keyOf(item));
            return (
              <Pressable key={keyOf(item)} style={styles.row} onPress={() => toggle(item)}>
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
          })}
          {staged.length > 0 ? (
            <Pressable
              style={[styles.primary, busy !== null && styles.disabled]}
              disabled={busy !== null}
              onPress={() => run('search', () => api.startImport('search', staged))}
            >
              <Text style={styles.primaryText}>
                {t('Start scan')} · {staged.length}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.secondary, busy !== null && styles.disabled]}
          disabled={busy !== null}
          onPress={() => run('demo', () => api.importDemo())}
        >
          <Text style={styles.secondaryText}>{t('Try a demo library')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG },
  scroll: { padding: 20, paddingBottom: 60 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800', marginBottom: 14 },
  card: {
    backgroundColor: C.SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 16,
    marginBottom: 14,
    gap: 10,
  },
  cardTitle: { color: C.INK, fontSize: 15, fontWeight: '700' },
  cardBody: { color: C.MUTED, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: C.INPUT_BG,
    borderWidth: 1,
    borderColor: C.INPUT_BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.INK,
    fontSize: 14,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  spotifyButton: {
    backgroundColor: '#1DB954',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  spotifyText: { color: '#000000', fontSize: 15, fontWeight: '700' },
  appleButton: {
    backgroundColor: '#FC3C44',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  appleText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  ghostButton: { paddingVertical: 8, alignItems: 'center' },
  ghostText: { color: C.CYAN, fontSize: 13 },
  primary: { backgroundColor: C.ACCENT, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: C.INK, fontSize: 15, fontWeight: '700' },
  secondary: {
    backgroundColor: C.SURFACE,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
  },
  secondaryText: { color: C.INK, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  spinner: { marginVertical: 6 },
  empty: { color: C.MUTED, textAlign: 'center', paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.SURFACE_2,
    borderRadius: 10,
    padding: 10,
  },
  rowText: { flex: 1, marginRight: 10 },
  rowTitle: { color: C.INK, fontSize: 14, fontWeight: '600' },
  rowArtist: { color: C.MUTED, fontSize: 12, marginTop: 2 },
  addPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  addPillActive: { backgroundColor: C.ACCENT },
  addPillText: { color: C.ACCENT, fontSize: 12, fontWeight: '700' },
  addPillTextActive: { color: C.INK },
  error: { color: C.DANGER, fontSize: 13, marginBottom: 10 },
});
