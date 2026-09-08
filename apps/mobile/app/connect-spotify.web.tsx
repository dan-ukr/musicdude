import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../src/i18n/LanguageContext';
import { C } from '../src/theme/colors';

/**
 * Web build of the Spotify connector. react-native-webview is native-only, and
 * the session token can only be read from inside the app's own WebView, so the
 * browser build points at the other import paths instead of failing to bundle.
 */
export default function ConnectSpotifyWeb() {
  const t = useT();

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.heading}>{t('Connect Spotify')}</Text>
      <View style={styles.card}>
        <Text style={styles.body}>{t('Spotify connect is only available in the app.')}</Text>
        <Pressable style={styles.primary} onPress={() => router.back()}>
          <Text style={styles.primaryText}>{t('Import music')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG, padding: 24 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800', marginBottom: 16 },
  card: {
    backgroundColor: C.SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 24,
    gap: 16,
  },
  body: { color: C.MUTED, fontSize: 15, lineHeight: 21 },
  primary: { backgroundColor: C.ACCENT, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: C.INK, fontSize: 16, fontWeight: '700' },
});
