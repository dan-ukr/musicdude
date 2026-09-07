import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { AUTH_TOKEN_KEY, storage } from '../src/utils/storage';

export default function Index() {
  const [dest, setDest] = useState<string | null>(null);

  useEffect(() => {
    storage.getItem(AUTH_TOKEN_KEY).then((token) => {
      setDest(token ? '/(tabs)/portrait' : '/welcome');
    });
  }, []);

  if (!dest) return null;
  return <Redirect href={dest as never} />;
}
