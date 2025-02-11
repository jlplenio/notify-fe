import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/router";

interface SoundSettings {
  volume: number;
  repetitions: number;
  apiAlarmEnabled: boolean;
  setVolume: (v: number) => void;
  setRepetitions: (r: number) => void;
  setApiAlarmEnabled: (enabled: boolean) => void;
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
  const [apiAlarmEnabled, setApiAlarmEnabled] = useState(false);

  // Read query parameters from the URL to set initial settings.
  const { query, isReady } = useRouter();

  useEffect(() => {
    if (!isReady) return;
    if (typeof query.apiAlarmEnabled === "string") {
      setApiAlarmEnabled(query.apiAlarmEnabled === "true");
    }
    if (typeof query.volume === "string") {
      setVolume(Number(query.volume));
    }
    if (typeof query.repetitions === "string") {
      setRepetitions(Number(query.repetitions));
    }
  }, [isReady, query.apiAlarmEnabled, query.volume, query.repetitions]);

  return (
    <SoundSettingsContext.Provider
      value={{
        volume,
        repetitions,
        apiAlarmEnabled,
        setVolume,
        setRepetitions,
        setApiAlarmEnabled,
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
