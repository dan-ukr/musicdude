import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguagePickerModal } from '../src/components/LanguagePickerModal';
import { useLanguage, useT } from '../src/i18n/LanguageContext';
import { C } from '../src/theme/colors';

export default function Welcome() {
  const t = useT();
  const { ready, hasStoredChoice } = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);

  // First visit: language choice comes before anything else.
  useEffect(() => {
    if (ready && !hasStoredChoice) setPickerOpen(true);
  }, [ready, hasStoredChoice]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable style={styles.langButton} onPress={() => setPickerOpen(true)}>
          <Text style={styles.langButtonText}>🌐</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>{t('Your music. Your mirror.')}</Text>
        <Text style={styles.subtitle}>
          {t('See what your library says about you — eras, cultures, languages, moods.')}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => router.push('/register')}>
          <Text style={styles.primaryText}>{t('Get started')}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.push('/login')}>
          <Text style={styles.secondaryText}>{t('Log in')}</Text>
        </Pressable>
      </View>

      <LanguagePickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG, padding: 24 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  langButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.SURFACE,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langButtonText: { fontSize: 20 },
  hero: { flex: 1, justifyContent: 'center' },
  title: { color: C.INK, fontSize: 40, fontWeight: '800', lineHeight: 46 },
  subtitle: { color: C.MUTED, fontSize: 17, lineHeight: 24, marginTop: 16 },
  actions: { gap: 12, marginBottom: 12 },
  primary: {
    backgroundColor: C.ACCENT,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryText: { color: C.INK, fontSize: 17, fontWeight: '700' },
  secondary: {
    backgroundColor: C.SURFACE,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
  },
  secondaryText: { color: C.INK, fontSize: 17, fontWeight: '600' },
});
