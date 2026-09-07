import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '../src/api/client';
import { useT } from '../src/i18n/LanguageContext';
import { C } from '../src/theme/colors';
import { AUTH_TOKEN_KEY, storage } from '../src/utils/storage';

export default function Login() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const { accessToken } = await api.login({ email: email.trim(), password });
      await storage.setItem(AUTH_TOKEN_KEY, accessToken);
      router.replace('/(tabs)/portrait');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? t('Invalid email or password')
          : t('Something went wrong. Try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>{t('Log in')}</Text>

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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.primary, busy && styles.disabled]} onPress={submit} disabled={busy}>
        <Text style={styles.primaryText}>{t('Log in')}</Text>
      </Pressable>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('New here?')}</Text>
        <Pressable onPress={() => router.replace('/register')}>
          <Text style={styles.footerLink}>{t('Create one')}</Text>
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
