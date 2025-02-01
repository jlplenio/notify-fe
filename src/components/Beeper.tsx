import { useSoundSettings } from "~/context/SoundSettingsContext"; // Import the context hook

let isSoundPlaying = false;

// Instead of being a simple exported function, we wrap it in a React component hook
// Alternatively, you can export a function that accepts settings as argument,
// but here we create a hook function for consistency.
export const usePlaySound = () => {
  const { volume, repetitions } = useSoundSettings();

  // Accept an optional parameter object with forceSingle.
  type PlaySoundOptions = { forceSingle?: boolean };

  const playSound = async ({ forceSingle = false }: PlaySoundOptions = {}) => {
    if (typeof window !== "undefined") {
      if (isSoundPlaying) {
        // Avoid overlapping sounds if one is already playing
        return;
      }
      isSoundPlaying = true;
      try {
        // Use 1 play when forceSingle is true, otherwise use the repetitions from settings.
        const playCount = forceSingle ? 1 : repetitions;
        for (let i = 0; i < playCount; i++) {
          // Wait for each sound to complete before playing the next one
          await new Promise<void>((resolve) => {
            const audio = new Audio("/notification1.mp3");
            audio.volume = volume;
            audio.playbackRate = 0.7;

            // Resolve the promise when the audio finishes playing
            audio.onended = () => resolve();

            audio.play().catch((err) => {
              console.error("Error playing the sound:", err);
              resolve(); // Resolve even on error to prevent hanging
            });
          });
        }
      } finally {
        isSoundPlaying = false;
      }
    }
  };

  return playSound;
};
