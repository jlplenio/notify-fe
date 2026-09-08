import { useEffect, useRef, useState } from "react";

export function useAlertSound(volume: number) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  const play = async () => {
    const player = audio.current ?? new Audio("/notification1.mp3");
    audio.current = player;
    player.volume = volume;
    // Match the original Beeper's slower notification sound.
    player.playbackRate = 0.7;
    player.currentTime = 0;
    try {
      await player.play();
      setReady(true);
      setBlocked(false);
      return true;
    } catch {
      setReady(false);
      setBlocked(true);
      return false;
    }
  };
  const mute = () => {
    audio.current?.pause();
    setReady(false);
    setBlocked(false);
  };
  // Try enabled alerts by default; report browser playback failures honestly.
  // Testing is an explicit gesture and does not require a permission prompt.
  return { ready, blocked, enable: play, play, mute };
}
