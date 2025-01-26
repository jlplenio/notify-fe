import React, { useState, useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { useFetchGpuAvailability } from "~/components/DataFetcher";
import initialGpuCards from "~/data/gpu_info.json";
import localeInfo from "~/data/locale_info.json";
import ItemTable from "~/components/ItemTable";
import { PlayCircleIcon, StopCircle } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModeToggle } from "~/components/ThemeToggle";
import Image from "next/image";
import { InfoButton } from "~/components/Info";
import KoFiButton from "~/components/KoFiButton";

function Home(): JSX.Element {
  const startCountdown = 21;
  const [countdown, setCountdown] = useState(startCountdown);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("cz-cz");
  const [gpuCards, isLoading, error] = useFetchGpuAvailability(
    initialGpuCards,
    selectedRegion,
    fetchTrigger,
  );

  // Locale detection
  useEffect(() => {
    const availableLocales = Object.values(localeInfo);
    const browserLanguage = navigator.language.toLowerCase();
    const primaryLanguageSubtag = browserLanguage.split("-")[0];

    const exactMatch = availableLocales.find(
      (locale) => locale.toLowerCase() === browserLanguage,
    );
    const primarySubtagMatch = availableLocales.find((locale) =>
      locale.toLowerCase().startsWith(primaryLanguageSubtag + "-"),
    );
    setSelectedRegion(exactMatch ?? primarySubtagMatch ?? "de-de");
  }, []);

  // Countdown logic
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (isActive) {
      intervalId = setInterval(() => {
        setCountdown((currentCountdown) => {
          if (currentCountdown === 1) {
            setFetchTrigger((prev) => prev + 1);
            return startCountdown;
          }
          return currentCountdown - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalId);
  }, [isActive]);

  const handleStart = () => {
    setIsActive(true);
  };

  const handleStop = () => {
    setIsActive(false);
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="w-full max-w-lg rounded-b-2xl border-b border-l border-r p-5 shadow-lg">
        <h1 className="mb-3 text-center text-2xl font-bold">
          Notify-FE | notify-fe.plen.io
        </h1>

        <div className="mb-4 rounded-lg bg-yellow-100 px-4 py-2 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
          Note: 5000 series API is speculative - assumes same pattern as 4000.
          <br />
          The API status field helps to monitor if the endpoints come online.
        </div>

        <div className="mb-4 text-center">
          <div className="grid grid-cols-2 items-center justify-items-center gap-4">
            {!isActive ? (
              <Button
                variant="outline"
                className="flex items-center"
                onClick={handleStart}
              >
                Start <PlayCircleIcon size={19} className="ml-1" />
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex items-center"
                onClick={handleStop}
              >
                Stop <StopCircle size={19} className="ml-1" />
              </Button>
            )}
            <div>
              <p className="text-gray-500 dark:text-gray-400">
                {!isLoading
                  ? `Refreshing in: 00:${countdown.toString().padStart(2, "0")}`
                  : "Refreshing..."}
              </p>
            </div>
          </div>
        </div>
        {error ? <p>Error: {error.message}</p> : null}
        <ItemTable gpuCards={gpuCards} />
        <div className="mt-7 grid grid-cols-3 gap-3">
          <div className="flex items-center justify-start">
            <InfoButton />
          </div>
          <div className="flex items-center justify-center">
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Region" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(localeInfo).map(
                  ([countryName, countryCode]) => (
                    <SelectItem key={countryCode} value={countryCode}>
                      {countryName}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-end">
            <ModeToggle />
          </div>
        </div>
      </div>
      <Analytics />
      <div className="mt-5">
        <KoFiButton />
      </div>
      <div className="mt-3">
        <a
          href="https://github.com/jlplenio/notify-fe"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            className="dark:invert"
            src="/github_logo.svg"
            alt="GitHub Mark"
            height={22}
            width={32}
          />
        </a>
      </div>
    </div>
  );
}

export default Home;
