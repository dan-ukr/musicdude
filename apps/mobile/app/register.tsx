import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '../src/api/client';
import { useLanguage, useT } from '../src/i18n/LanguageContext';
import { C } from '../src/theme/colors';
import { AUTH_TOKEN_KEY, storage } from '../src/utils/storage';

export default function Register() {
  const t = useT();
  const { lang } = useLanguage();
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (password !== confirm) {
      setError(t('Passwords do not match'));
      return;
    }
    setBusy(true);
    try {
      const { accessToken } = await api.register({
        email: email.trim(),
        password,
        firstName: firstName.trim() || undefined,
        language: lang,
      });
      await storage.setItem(AUTH_TOKEN_KEY, accessToken);
      router.replace('/(tabs)/portrait');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>{t('Create account')}</Text>

      <TextInput
        style={styles.input}
        placeholder={t('First name')}
        placeholderTextColor={C.MUTED}
        value={firstName}
        onChangeText={setFirstName}
      />
      <TextInput
        style={styles.input}
        placeholder={t('Email')}
        placeholderTextColor={C.MUTED}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t('Password')}
        placeholderTextColor={C.MUTED}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={styles.input}
        placeholder={t('Confirm password')}
        placeholderTextColor={C.MUTED}
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.primary, busy && styles.disabled]} onPress={submit} disabled={busy}>
        <Text style={styles.primaryText}>{t('Create account')}</Text>
      </Pressable>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('Already have an account?')}</Text>
        <Pressable onPress={() => router.replace('/login')}>
          <Text style={styles.footerLink}>{t('Log in')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.BG, padding: 24 },
  title: { color: C.INK, fontSize: 32, fontWeight: '800', marginTop: 24, marginBottom: 32 },
  input: {
    backgroundColor: C.INPUT_BG,
    borderWidth: 1,
    borderColor: C.INPUT_BORDER,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.INK,
    fontSize: 16,
    marginBottom: 14,
  },
  error: { color: C.DANGER, marginBottom: 12 },
  primary: {
    backgroundColor: C.ACCENT,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: { color: C.INK, fontSize: 17, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  footer: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 24 },
  footerText: { color: C.MUTED, fontSize: 15 },
  footerLink: { color: C.CYAN, fontSize: 15, fontWeight: '600' },
});
