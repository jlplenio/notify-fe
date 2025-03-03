import { useSoundSettings } from "~/context/SoundSettingsContext"; // Import the context hook

let isSoundPlaying = false;

// Default to empty string for messages - when no specific message is provided,
// we won't send a Telegram notification
const DEFAULT_EVENT_MESSAGE = "";

/**
 * Sends a notification to Telegram with event information and URL
 */
const sendTelegramNotification = async (
  telegramApiUrl: string,
  message: string,
) => {
  if (!telegramApiUrl) return;

  try {
    // Parse the URL to be able to modify parameters
    const url = new URL(telegramApiUrl);

    // Get the current URL to allow quick navigation
    const currentUrl =
      typeof window !== "undefined" ? window.location.href : "";

    // Create notification message with event information and the raw URL
    // The raw URL will automatically be clickable in most Telegram clients
    const notificationMessage = `Notify-FE Alarm: ${message}\n\nClick to open: ${currentUrl}`;

    // Set the text parameter with our message
    url.searchParams.set("text", notificationMessage);

    // Note: We're not setting parse_mode since the plain URL will be clickable in most cases
    // This approach has the highest compatibility across different Telegram clients

    // Send the request to Telegram API
    await fetch(url.toString(), { method: "GET" });
    console.log("Telegram notification sent with clickable URL");
  } catch (error) {
    console.error("Error sending Telegram notification:", error);
  }
};

// Instead of being a simple exported function, we wrap it in a React component hook
// Alternatively, you can export a function that accepts settings as argument,
// but here we create a hook function for consistency.
export const usePlaySound = () => {
  const { volume, repetitions, telegramApiUrl } = useSoundSettings();

  // Accept an optional parameter object with forceSingle and message.
  type PlaySoundOptions = {
    forceSingle?: boolean;
    message?: string;
  };

  const playSound = async ({
    forceSingle = false,
    message = DEFAULT_EVENT_MESSAGE,
  }: PlaySoundOptions = {}) => {
    if (typeof window !== "undefined") {
      if (isSoundPlaying) {
        // Avoid overlapping sounds if one is already playing
        return;
      }
      isSoundPlaying = true;
      try {
        // Only send Telegram notifications if there's a message and Telegram URL
        // Using empty string as default means we only send notifications for explicitly provided messages
        if (telegramApiUrl && message) {
          await sendTelegramNotification(telegramApiUrl, message);
        }

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
