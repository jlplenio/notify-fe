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
import { playSound } from "~/components/Beeper";

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
  const [hasStartedOnce, setHasStartedOnce] = useState(false);

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
    setHasStartedOnce(true);
    playSound();
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

        <div className="mb-6 rounded-lg bg-green-100 px-4 py-2 text-center text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">
          Click Start and let it refresh. If the API is online, let the page run
          in the background, wait for the notification sound and click the Shop
          Link. Scalpers don&apos;t win!
        </div>

        <div className="mb-4 text-center">
          <div className="grid grid-cols-3 items-center gap-3 px-4">
            <div className="flex justify-center">
              <div className="w-[161px]">
                <Select
                  value={selectedRegion}
                  onValueChange={setSelectedRegion}
                >
                  <SelectTrigger className="h-9 bg-background text-sm font-medium">
                    <SelectValue placeholder="Select Region" />
                  </SelectTrigger>
                  <SelectContent className="text-sm">
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
            </div>
            <div className="flex justify-center">
              {!isActive ? (
                <Button
                  variant="outline"
                  className={`h-9 w-[95px] text-sm font-medium ${!hasStartedOnce ? "border-2 border-green-400" : ""}`}
                  onClick={handleStart}
                >
                  Start <PlayCircleIcon size={16} className="ml-1.5" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="h-9 w-[95px] text-sm font-medium"
                  onClick={handleStop}
                >
                  Stop <StopCircle size={16} className="ml-1.5" />
                </Button>
              )}
            </div>
            <div className="flex h-9 w-[138px] items-center justify-start rounded-md border border-input bg-background px-3 text-sm font-medium text-muted-foreground">
              {!isLoading
                ? `Refreshing in ${countdown.toString().padStart(2, "0")}s`
                : "Refreshing..."}
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
            <KoFiButton />
          </div>
          <div className="flex items-center justify-end">
            <ModeToggle />
          </div>
        </div>
      </div>
      <Analytics />
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
