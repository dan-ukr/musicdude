import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ImportedTrack } from '@musicdude/shared';
import { api } from '../src/api/client';
import { useT } from '../src/i18n/LanguageContext';
import { C } from '../src/theme/colors';

const MAX_LIKED = 10_000;
const PAGE = 50;

/**
 * One-tap Spotify connect, no developer credentials involved:
 * the user logs into open.spotify.com inside the WebView with their own
 * account, the page's session token (embedded by Spotify's web player in a
 * <script id="session"> block) is read by injected JS and posted back, and
 * the app pulls Liked Songs with it. Unofficial by nature — the injected
 * probe fails soft (user just sees the login page) if Spotify changes markup.
 */
const SESSION_PROBE = `(function () {
  function check() {
    try {
      var el = document.getElementById('session');
      if (el) {
        var s = JSON.parse(el.textContent);
        if (s && s.accessToken && s.isAnonymous === false) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'token', token: s.accessToken }));
          return;
        }
      }
    } catch (e) {}
    setTimeout(check, 1000);
  }
  check();
})(); true;`;

type Phase = 'login' | 'importing' | 'error';

export default function ConnectSpotify() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('login');
  const [fetched, setFetched] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const importing = useRef(false);
  const [webviewKey, setWebviewKey] = useState(0);

  const runImport = useCallback(async (token: string) => {
    if (importing.current) return;
    importing.current = true;
    setPhase('importing');
    try {
      const tracks: ImportedTrack[] = [];
      let offset = 0;
      let totalCount = Infinity;
      while (offset < totalCount && offset < MAX_LIKED) {
        const res = await fetch(
          `https://api.spotify.com/v1/me/tracks?limit=${PAGE}&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`liked songs: ${res.status}`);
        const data = (await res.json()) as {
          total: number;
          items: { added_at?: string; track?: { name: string; artists?: { name: string }[] } }[];
        };
        totalCount = data.total;
        setTotal(data.total);
        for (const item of data.items) {
          if (!item.track?.name) continue;
          tracks.push({
            title: item.track.name,
            artist: item.track.artists?.[0]?.name ?? '',
            playedAt: item.added_at, // liked-at: when this taste arrived — feeds Change
          });
        }
        offset += PAGE;
        setFetched(Math.min(offset, totalCount));
      }
      await api.startImport('spotify-liked', tracks);
      router.replace('/(tabs)/portrait');
    } catch {
      importing.current = false;
      setPhase('error');
    }
  }, []);

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as { type?: string; token?: string };
        if (msg.type === 'token' && msg.token) void runImport(msg.token);
      } catch {
        /* not ours */
      }
    },
    [runImport],
  );

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.heading}>{t('Connect Spotify')}</Text>

      {phase === 'login' ? (
        <>
          <Text style={styles.hint}>
            {t('Log in to Spotify and your Liked Songs will import automatically.')}
          </Text>
          <View style={styles.webviewFrame}>
            <WebView
              key={webviewKey}
              source={{ uri: 'https://open.spotify.com/' }}
              injectedJavaScript={SESSION_PROBE}
              onMessage={onMessage}
              sharedCookiesEnabled
              incognito={false}
              style={styles.webview}
            />
          </View>
        </>
      ) : null}

      {phase === 'importing' ? (
        <View style={styles.centerCard}>
          <ActivityIndicator color={C.ACCENT} size="large" />
          <Text style={styles.progressText}>{t('Importing your Liked Songs…')}</Text>
          {total !== null ? (
            <Text style={styles.progressCount}>
              {fetched}/{total}
            </Text>
          ) : null}
        </View>
      ) : null}

      {phase === 'error' ? (
        <View style={styles.centerCard}>
          <Text style={styles.errorText}>{t('Something went wrong. Try again.')}</Text>
          <Pressable
            style={styles.retry}
            onPress={() => {
              setPhase('login');
              setWebviewKey((k) => k + 1);
            }}
          >
            <Text style={styles.retryText}>{t('Retry')}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG, padding: 24 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800', marginBottom: 8 },
  hint: { color: C.MUTED, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  webviewFrame: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
  },
  webview: { flex: 1, backgroundColor: C.SURFACE },
  centerCard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  progressText: { color: C.INK, fontSize: 16, fontWeight: '600' },
  progressCount: { color: C.MUTED, fontSize: 14 },
  errorText: { color: C.DANGER, fontSize: 15 },
  retry: {
    backgroundColor: C.ACCENT,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  retryText: { color: C.INK, fontSize: 15, fontWeight: '700' },
});
