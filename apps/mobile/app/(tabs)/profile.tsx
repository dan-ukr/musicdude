import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguagePickerModal } from '../../src/components/LanguagePickerModal';
import { LANGUAGE_LABELS } from '../../src/i18n';
import { useLanguage, useT } from '../../src/i18n/LanguageContext';
import { C } from '../../src/theme/colors';
import { AUTH_TOKEN_KEY, storage } from '../../src/utils/storage';

export default function Profile() {
  const t = useT();
  const { lang } = useLanguage();
  const [pickerOpen, setPickerOpen] = useState(false);

  const logOut = async () => {
    await storage.removeItem(AUTH_TOKEN_KEY);
    router.replace('/welcome');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.heading}>{t('Profile')}</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('Settings')}</Text>
        <Pressable style={styles.row} onPress={() => setPickerOpen(true)}>
          <Text style={styles.rowLabel}>{t('Language')}</Text>
          <Text style={styles.rowValue}>{LANGUAGE_LABELS[lang]}</Text>
        </Pressable>
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('Notifications')}</Text>
          <Text style={styles.rowValue}>{t('Coming soon')}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('Account')}</Text>
        <Pressable style={styles.row} onPress={logOut}>
          <Text style={[styles.rowLabel, { color: C.DANGER }]}>{t('Log out')}</Text>
        </Pressable>
      </View>

      <LanguagePickerModal visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG, padding: 24 },
  heading: { color: C.INK, fontSize: 28, fontWeight: '800', marginBottom: 20 },
  card: {
    backgroundColor: C.SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: { color: C.MUTED, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowLabel: { color: C.INK, fontSize: 16 },
  rowValue: { color: C.MUTED, fontSize: 15 },
  divider: { height: 1, backgroundColor: C.DIVIDER },
});
