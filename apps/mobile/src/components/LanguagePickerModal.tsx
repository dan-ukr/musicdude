import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LANGUAGE_LABELS, type AppLanguage } from '../i18n';
import { useLanguage, useT } from '../i18n/LanguageContext';
import { C } from '../theme/colors';

const LANGS = Object.keys(LANGUAGE_LABELS) as AppLanguage[];

export function LanguagePickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { lang, setLanguage } = useLanguage();
  const t = useT();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('Choose your language')}</Text>
          <FlatList
            data={LANGS}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, item === lang && styles.rowActive]}
                onPress={async () => {
                  await setLanguage(item);
                  onClose();
                }}
              >
                <Text style={[styles.rowText, item === lang && styles.rowTextActive]}>
                  {LANGUAGE_LABELS[item]}
                </Text>
              </Pressable>
            )}
          />
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t('Cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: C.SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.CARD_BORDER,
    padding: 20,
    maxHeight: '80%',
  },
  title: { color: C.INK, fontSize: 18, fontWeight: '700', marginBottom: 12 },
  row: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  rowActive: { backgroundColor: C.ACCENT_SOFT },
  rowText: { color: C.MUTED, fontSize: 16 },
  rowTextActive: { color: C.INK, fontWeight: '700' },
  cancel: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  cancelText: { color: C.MUTED, fontSize: 15 },
});
