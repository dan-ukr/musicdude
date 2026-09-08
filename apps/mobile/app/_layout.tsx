import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PlayerProvider } from '../src/audio/PlayerContext';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { C } from '../src/theme/colors';

export default function RootLayout() {
  return (
    <LanguageProvider>
      <PlayerProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: C.BG },
          }}
        />
      </PlayerProvider>
    </LanguageProvider>
  );
}
