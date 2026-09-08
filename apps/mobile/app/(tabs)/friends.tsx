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
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Comparison, FriendSummary } from '@musicdude/shared';
import { api, ApiError } from '../../src/api/client';
import { TrackRow } from '../../src/components/TrackRow';
import { facetValueLabel } from '../../src/i18n/facetLabels';
import { useLanguage, useT } from '../../src/i18n/LanguageContext';
import { C } from '../../src/theme/colors';

/**
 * Pairwise social: compare by code, keep friends. Built on taste only —
 * mood never leaves the owner's app, by design.
 */
export default function Friends() {
  const t = useT();
  const { lang } = useLanguage();
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api.shareCode().then((r) => setCode(r.code)).catch(() => {});
      api.friends().then(setFriends).catch(() => {});
    }, []),
  );

  const compare = async () => {
    setError(null);
    setComparison(null);
    setBusy(true);
    try {
      setComparison(await api.compare(input.trim()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const addFriend = async () => {
    setError(null);
    try {
      await api.addFriend(input.trim());
      setFriends(await api.friends());
      setComparison((c) => (c ? { ...c, isFriend: true } : c));
    } catch (err) {
      if (err instanceof ApiError && err.isPremiumRequired) {
        setError(t('Keeping friends is a premium feature.'));
      } else if (err instanceof ApiError) {
        setError(err.message);
      }
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>{t('Friends')}</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Your code')}</Text>
          <Text style={styles.body}>{t('Share it — anyone can compare taste with you, app or not.')}</Text>
          <Pressable
            style={styles.codeBox}
            onPress={async () => {
              if (!code) return;
              await Clipboard.setStringAsync(code);
              setCopied(true);
            }}
          >
            <Text style={styles.code}>{code ?? '…'}</Text>
            <Text style={styles.copyHint}>{copied ? t('Copied') : t('Tap to copy')}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Compare with someone')}</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder={t('Enter their code')}
              placeholderTextColor={C.MUTED}
              autoCapitalize="characters"
              value={input}
              onChangeText={setInput}
            />
            <Pressable style={styles.button} onPress={compare} disabled={busy || input.length < 4}>
              <Text style={styles.buttonText}>{t('Compare')}</Text>
            </Pressable>
          </View>
          {busy ? <ActivityIndicator color={C.ACCENT} style={styles.spinner} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {comparison ? (
          <View style={styles.card}>
            <Text style={styles.matchName}>{comparison.otherName}</Text>
            <View style={styles.matchRing}>
              <Text style={styles.matchPct}>{comparison.matchPct}%</Text>
              <Text style={styles.matchLabel}>{t('taste match')}</Text>
            </View>
            <View style={styles.matchBarTrack}>
              <View style={[styles.matchBarFill, { width: `${comparison.matchPct}%` }]} />
            </View>

            {comparison.sharedFacets.length > 0 ? (
              <View style={styles.sharedWrap}>
                {comparison.sharedFacets.map((f) => (
                  <View key={`${f.facet}-${f.value}`} style={styles.sharedChip}>
                    <Text style={styles.sharedText}>
                      {t(facetValueLabel(f.facet as never, f.value, lang))}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {comparison.bridgeTracks.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>{t('Bridge tracks')}</Text>
                <Text style={styles.body}>{t('You both love these — each thought it was only theirs.')}</Text>
                {comparison.bridgeTracks.map((track, i) => (
                  <TrackRow
                    key={`${track.title}-${i}`}
                    track={{
                      id: `bridge-${i}`,
                      title: track.title,
                      artist: track.artist,
                      previewUrl: track.previewUrl,
                      artworkUrl: (track as { artworkUrl?: string | null }).artworkUrl ?? null,
                      releaseYear: null,
                      facets: null,
                    }}
                  />
                ))}
              </>
            ) : (
              <Text style={styles.body}>{t('No shared tracks yet — but the taste overlap is real.')}</Text>
            )}

            {!comparison.isFriend ? (
              <Pressable style={styles.primary} onPress={addFriend}>
                <Text style={styles.primaryText}>{t('Add friend')}</Text>
              </Pressable>
            ) : (
              <Text style={styles.friendNote}>{t('Already a friend')}</Text>
            )}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('Your friends')}</Text>
          {friends.length === 0 ? (
            <Text style={styles.body}>{t('No friends yet. Swap codes with someone.')}</Text>
          ) : (
            friends.map((friend) => (
              <View key={friend.userId} style={styles.friendRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{friend.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <Text style={styles.friendName}>{friend.name}</Text>
                <Text style={styles.friendMatch}>{friend.matchPct}%</Text>
              </View>
            ))
          )}
        </View>

        <Pressable style={styles.secondary} onPress={() => router.push('/premium')}>
          <Text style={styles.secondaryText}>{t('See premium')}</Text>
        </Pressable>
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
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    color: C.MUTED,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  body: { color: C.MUTED, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  codeBox: {
    backgroundColor: C.SURFACE_2,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  code: { color: C.CYAN, fontSize: 26, fontWeight: '800', letterSpacing: 4 },
  copyHint: { color: C.MUTED, fontSize: 11, marginTop: 4 },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: C.INPUT_BG,
    borderWidth: 1,
    borderColor: C.INPUT_BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.INK,
    letterSpacing: 2,
  },
  button: {
    backgroundColor: C.ACCENT,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  buttonText: { color: C.INK, fontWeight: '700', fontSize: 13 },
  spinner: { marginTop: 10 },
  error: { color: C.DANGER, fontSize: 13, marginTop: 8 },
  matchName: { color: C.INK, fontSize: 18, fontWeight: '700' },
  matchRing: { alignItems: 'center', marginVertical: 10 },
  matchPct: { color: C.ACCENT, fontSize: 44, fontWeight: '800' },
  matchLabel: { color: C.MUTED, fontSize: 12 },
  matchBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.SURFACE_2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  matchBarFill: { height: 8, borderRadius: 4, backgroundColor: C.ACCENT },
  sharedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  sharedChip: {
    backgroundColor: C.ACCENT_SOFT,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sharedText: { color: C.INK, fontSize: 12 },
  primary: { backgroundColor: C.ACCENT, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: C.INK, fontSize: 15, fontWeight: '700' },
  friendNote: { color: C.CYAN, fontSize: 13, textAlign: 'center' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.ACCENT_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: C.ACCENT, fontWeight: '800' },
  friendName: { color: C.INK, fontSize: 14, flex: 1 },
  friendMatch: { color: C.CYAN, fontSize: 14, fontWeight: '700' },
  secondary: {
    backgroundColor: C.SURFACE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
  },
  secondaryText: { color: C.INK, fontSize: 14, fontWeight: '600' },
});
