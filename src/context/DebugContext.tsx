import React, { createContext, useContext, useState } from "react";

interface DebugContextProps {
  spoofingEnabled: boolean;
  setSpoofingEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}

const DebugContext = createContext<DebugContextProps | undefined>(undefined);

export const DebugProvider = ({ children }: { children: React.ReactNode }) => {
  const [spoofingEnabled, setSpoofingEnabled] = useState(false);

  return (
    <DebugContext.Provider value={{ spoofingEnabled, setSpoofingEnabled }}>
      {children}
    </DebugContext.Provider>
  );
};

export const useDebug = () => {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error("useDebug must be used within a DebugProvider");
  }
  return context;
};
