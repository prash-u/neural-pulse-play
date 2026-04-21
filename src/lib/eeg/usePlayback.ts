// Playback clock for an EEG recording. Exposes currentTime (seconds),
// isPlaying, and mutation helpers. Uses requestAnimationFrame for smoothness.

import { useCallback, useEffect, useRef, useState } from "react";

export interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  speed: number;
}

export function useEEGPlayback(duration: number) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const durationRef = useRef(duration);

  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    const loop = (now: number) => {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      if (playingRef.current) {
        timeRef.current += dt * speedRef.current;
        if (timeRef.current >= durationRef.current) {
          timeRef.current = durationRef.current;
          playingRef.current = false;
          setIsPlaying(false);
        }
        setCurrentTime(timeRef.current);
      }
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      lastTickRef.current = null;
    };
  }, []);

  const play = useCallback(() => {
    if (timeRef.current >= durationRef.current) {
      timeRef.current = 0;
      setCurrentTime(0);
    }
    setIsPlaying(true);
  }, []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const toggle = useCallback(() => {
    if (playingRef.current) pause(); else play();
  }, [play, pause]);
  const seek = useCallback((t: number) => {
    const clamped = Math.max(0, Math.min(durationRef.current, t));
    timeRef.current = clamped;
    setCurrentTime(clamped);
  }, []);
  const reset = useCallback(() => {
    timeRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }, []);

  return { currentTime, isPlaying, speed, setSpeed, play, pause, toggle, seek, reset };
}
