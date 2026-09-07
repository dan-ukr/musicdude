import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../../src/i18n/LanguageContext';
import { C } from '../../src/theme/colors';

/** Taste timeline + usage stats. Free: last 30 days; premium: full history + narratives. */
export default function Change() {
  const t = useT();

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.heading}>{t('Change')}</Text>
      <View style={styles.card}>
        <Text style={styles.cardBody}>{t('How your taste changes over time.')}</Text>
        <Text style={styles.soon}>{t('Coming soon')}</Text>
      </View>
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
    padding: 24,
    gap: 10,
  },
  cardBody: { color: C.MUTED, fontSize: 15, lineHeight: 21 },
  soon: { color: C.AMBER, fontSize: 13, fontWeight: '600' },
});
