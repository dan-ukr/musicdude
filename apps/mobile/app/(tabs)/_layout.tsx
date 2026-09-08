import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { NowPlayingBar } from '../../src/components/NowPlayingBar';
import { useT } from '../../src/i18n/LanguageContext';
import { C } from '../../src/theme/colors';

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.5 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const t = useT();

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: C.TAB_BAR, borderTopColor: C.DIVIDER },
          tabBarActiveTintColor: C.TAB_ACTIVE_TEXT,
          tabBarInactiveTintColor: C.TAB_INACTIVE_TEXT,
          tabBarLabelStyle: { fontSize: 10 },
          sceneStyle: { backgroundColor: C.BG },
        }}
      >
        <Tabs.Screen
          name="portrait"
          options={{ title: t('Portrait'), tabBarIcon: ({ focused }) => <TabIcon glyph="🌌" focused={focused} /> }}
        />
        <Tabs.Screen
          name="library"
          options={{ title: t('Library'), tabBarIcon: ({ focused }) => <TabIcon glyph="🎛" focused={focused} /> }}
        />
        <Tabs.Screen
          name="events"
          options={{ title: t('Events'), tabBarIcon: ({ focused }) => <TabIcon glyph="📍" focused={focused} /> }}
        />
        <Tabs.Screen
          name="friends"
          options={{ title: t('Friends'), tabBarIcon: ({ focused }) => <TabIcon glyph="👥" focused={focused} /> }}
        />
        <Tabs.Screen
          name="change"
          options={{ title: t('Change'), tabBarIcon: ({ focused }) => <TabIcon glyph="📈" focused={focused} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: t('Profile'), tabBarIcon: ({ focused }) => <TabIcon glyph="👤" focused={focused} /> }}
        />
      </Tabs>
      <NowPlayingBar />
    </>
  );
}
