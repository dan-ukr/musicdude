import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { C } from '../src/theme/colors';

export default function RootLayout() {
  return (
    <LanguageProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.BG },
        }}
      />
    </LanguageProvider>
  );
}
