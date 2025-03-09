import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/router";

interface SoundSettings {
  volume: number;
  repetitions: number;
  apiAlarmEnabled: boolean;
  refreshInterval: number;
  telegramApiUrl: string;
  setVolume: (v: number) => void;
  setRepetitions: (r: number) => void;
  setApiAlarmEnabled: (enabled: boolean) => void;
  setRefreshInterval: (r: number) => void;
  setTelegramApiUrl: (url: string) => void;
}

const SoundSettingsContext = createContext<SoundSettings | undefined>(
  undefined,
);

export const SoundSettingsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [volume, setVolume] = useState(0.5);
  const [repetitions, setRepetitions] = useState(1);
  const [apiAlarmEnabled, setApiAlarmEnabled] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [telegramApiUrl, setTelegramApiUrlState] = useState("");

  // Custom setter for telegramApiUrl that also updates localStorage
  const setTelegramApiUrl = (url: string) => {
    setTelegramApiUrlState(url);
    // Only store in localStorage when on the client side
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("telegramApiUrl", url);
      } catch (error) {
        console.error("Error storing telegramApiUrl in localStorage:", error);
      }
    }
  };

  // Read query parameters from the URL to set initial settings.
  const { query, isReady } = useRouter();

  // Initialize state from localStorage and URL query parameters
  useEffect(() => {
    // Try to get telegramApiUrl from localStorage first
    if (typeof window !== "undefined") {
      try {
        const storedUrl = localStorage.getItem("telegramApiUrl");
        if (storedUrl) {
          setTelegramApiUrlState(storedUrl);
        }
      } catch (error) {
        console.error("Error reading telegramApiUrl from localStorage:", error);
      }
    }

    if (!isReady) return;

    // URL query parameters override localStorage values
    if (typeof query.apiAlarmEnabled === "string") {
      setApiAlarmEnabled(query.apiAlarmEnabled === "true");
    }
    if (typeof query.volume === "string") {
      setVolume(Number(query.volume));
    }
    if (typeof query.repetitions === "string") {
      setRepetitions(Number(query.repetitions));
    }
    if (typeof query.refresh === "string") {
      const parsedRefresh = parseInt(query.refresh, 10);
      if (!isNaN(parsedRefresh) && parsedRefresh >= 6 && parsedRefresh <= 31) {
        setRefreshInterval(parsedRefresh);
      }
    }
    if (typeof query.telegramApiUrl === "string" && query.telegramApiUrl) {
      setTelegramApiUrl(query.telegramApiUrl);
    }
  }, [
    isReady,
    query.apiAlarmEnabled,
    query.volume,
    query.repetitions,
    query.refresh,
    query.telegramApiUrl,
  ]);

  return (
    <SoundSettingsContext.Provider
      value={{
        volume,
        repetitions,
        apiAlarmEnabled,
        refreshInterval,
        telegramApiUrl,
        setVolume,
        setRepetitions,
        setApiAlarmEnabled,
        setRefreshInterval,
        setTelegramApiUrl,
      }}
    >
      {children}
    </SoundSettingsContext.Provider>
  );
};

export const useSoundSettings = () => {
  const context = useContext(SoundSettingsContext);
  if (!context) {
    throw new Error(
      "useSoundSettings must be used within a SoundSettingsProvider",
    );
  }
  return context;
};
