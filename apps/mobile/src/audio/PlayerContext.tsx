import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type PlayableTrack = {
  id: string;
  title: string;
  artist: string;
  previewUrl: string | null;
  artworkUrl: string | null;
};

type PlayerValue = {
  current: PlayableTrack | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  play: (track: PlayableTrack) => void;
  toggle: (track: PlayableTrack) => void;
  stop: () => void;
};

const PlayerContext = createContext<PlayerValue>({
  current: null,
  isPlaying: false,
  positionMs: 0,
  durationMs: 30_000,
  play: () => {},
  toggle: () => {},
  stop: () => {},
});

/**
 * 30-second preview playback. Previews are what Apple and Deezer distribute for
 * exactly this purpose, so playing one is the intended use of the asset — and
 * it is what turns discovery from reading into listening.
 *
 * Implemented on the platform's own audio element: HTMLAudioElement on web,
 * expo-audio on native, behind one interface so screens never branch.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<PlayableTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(30_000);
  const webAudio = useRef<HTMLAudioElement | null>(null);
  const nativePlayer = useRef<{ play: () => void; pause: () => void; remove: () => void } | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const teardown = useCallback(() => {
    if (ticker.current) {
      clearInterval(ticker.current);
      ticker.current = null;
    }
    if (webAudio.current) {
      webAudio.current.pause();
      webAudio.current.src = '';
      webAudio.current = null;
    }
    if (nativePlayer.current) {
      nativePlayer.current.pause();
      nativePlayer.current.remove();
      nativePlayer.current = null;
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const play = useCallback(
    (track: PlayableTrack) => {
      if (!track.previewUrl) return;
      teardown();
      setCurrent(track);
      setPositionMs(0);

      if (Platform.OS === 'web') {
        const audio = new globalThis.Audio(track.previewUrl);
        webAudio.current = audio;
        audio.addEventListener('loadedmetadata', () => {
          if (Number.isFinite(audio.duration)) setDurationMs(audio.duration * 1000);
        });
        audio.addEventListener('ended', () => {
          setIsPlaying(false);
          setPositionMs(0);
        });
        void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        ticker.current = setInterval(() => setPositionMs(audio.currentTime * 1000), 250);
        return;
      }

      // Required lazily: expo-audio is native-only and must not load on web.
      const { createAudioPlayer } = require('expo-audio') as typeof import('expo-audio');
      const player = createAudioPlayer({ uri: track.previewUrl });
      nativePlayer.current = player as never;
      player.play();
      setIsPlaying(true);
      ticker.current = setInterval(() => {
        setPositionMs((player.currentTime ?? 0) * 1000);
        if (player.duration) setDurationMs(player.duration * 1000);
        if (player.currentTime && player.duration && player.currentTime >= player.duration) {
          setIsPlaying(false);
        }
      }, 250);
    },
    [teardown],
  );

  const stop = useCallback(() => {
    teardown();
    setIsPlaying(false);
    setCurrent(null);
    setPositionMs(0);
  }, [teardown]);

  const toggle = useCallback(
    (track: PlayableTrack) => {
      if (current?.id === track.id && isPlaying) {
        if (webAudio.current) webAudio.current.pause();
        if (nativePlayer.current) nativePlayer.current.pause();
        setIsPlaying(false);
        return;
      }
      if (current?.id === track.id && !isPlaying) {
        if (webAudio.current) {
          void webAudio.current.play();
          setIsPlaying(true);
          return;
        }
        if (nativePlayer.current) {
          nativePlayer.current.play();
          setIsPlaying(true);
          return;
        }
      }
      play(track);
    },
    [current, isPlaying, play],
  );

  const value = useMemo(
    () => ({ current, isPlaying, positionMs, durationMs, play, toggle, stop }),
    [current, isPlaying, positionMs, durationMs, play, toggle, stop],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  return useContext(PlayerContext);
}
