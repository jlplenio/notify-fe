import React, { createContext, useContext, useState } from "react";

interface SoundSettings {
  volume: number;
  repetitions: number;
  setVolume: (v: number) => void;
  setRepetitions: (r: number) => void;
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

  return (
    <SoundSettingsContext.Provider
      value={{ volume, repetitions, setVolume, setRepetitions }}
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
