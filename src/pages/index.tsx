import React, { useState, useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { useFetchGpuAvailability } from "~/components/DataFetcher";
import initialGpuCardsData from "~/data/gpu_info.json";
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
import { SettingsButton } from "~/components/SettingsButton";
import KoFiButton from "~/components/KoFiButton";
import { usePlaySound } from "~/components/Beeper";
import { DebugPanel } from "~/components/DebugPanel";
import { useRouter } from "next/router";
import { type GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const { region } = query;
  const validRegion =
    typeof region === "string" && Object.values(localeInfo).includes(region)
      ? region
      : "en-gb";

  return {
    props: {
      initialRegion: validRegion,
    },
  };
};

function Home({ initialRegion }: { initialRegion: string }): JSX.Element {
  const router = useRouter();
  const startCountdown = 21;
  const [countdown, setCountdown] = useState(startCountdown);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState(initialRegion);
  const [gpuCards, setGpuCards] = useState(initialGpuCardsData);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const playSound = usePlaySound();

  // Handle URL query parameter
  useEffect(() => {
    const { region } = router.query;
    if (typeof region === "string" && region in Object.values(localeInfo)) {
      setSelectedRegion(region);
    }
  }, [router.query]);

  // Update URL when region changes
  const handleRegionChange = (newRegion: string) => {
    void router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, region: newRegion },
      },
      undefined,
      { shallow: true },
    );
    setSelectedRegion(newRegion);
  };

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
    setFetchTrigger((prev) => prev + 1);
    setIsActive(true);
    setHasStartedOnce(true);
    void playSound({ forceSingle: true });
  };

  const handleStop = () => {
    setIsActive(false);
  };

  // Callback to update the "included" property for a card
  const toggleIncluded = (cardName: string, newValue: boolean) => {
    setGpuCards((prevCards) =>
      prevCards.map((card) =>
        card.name === cardName ? { ...card, included: newValue } : card,
      ),
    );
  };

  // Pass the updated gpuCards into the fetcher hook.
  // When a card's included property changes, the fetcher will use this updated value.
  const [updatedGpuCards, isLoading, error] = useFetchGpuAvailability(
    gpuCards,
    selectedRegion,
    fetchTrigger,
  );

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="w-full max-w-lg rounded-b-2xl border-b border-l border-r p-5 shadow-lg">
        <h1 className="mb-3 text-center text-2xl font-bold">
          Notify-FE | notify-fe.plen.io
        </h1>

        <div className="mb-6 rounded-lg bg-green-100 px-4 py-2 text-center text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">
          Only checks the NVIDIA store! If the API is online, let the page run
          in the background, wait for the notification sound and click the Shop
          Link. Scalpers don&apos;t win!
        </div>

        <div className="mb-4 text-center">
          <div className="grid grid-cols-3 items-center gap-3 px-4">
            <div className="flex justify-center">
              <div className="w-[161px]">
                <Select
                  value={selectedRegion}
                  onValueChange={handleRegionChange}
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
            <div className="flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium text-muted-foreground sm:w-[138px]">
              {!isLoading
                ? `Refresh in ${countdown.toString().padStart(2, "0")}s`
                : "Refreshing..."}
            </div>
          </div>
        </div>
        {error ? <p>Error: {error.message}</p> : null}
        <ItemTable
          gpuCards={updatedGpuCards}
          onToggleIncluded={toggleIncluded}
        />
        <div className="mt-7 grid grid-cols-3 gap-3">
          <div className="flex scale-90 items-center justify-start sm:scale-100">
            <SettingsButton />
          </div>
          <div className="flex scale-90 items-center justify-center sm:scale-100">
            <KoFiButton />
          </div>
          <div className="flex scale-90 items-center justify-end sm:scale-100">
            <ModeToggle />
          </div>
        </div>
      </div>
      <Analytics />
      {process.env.NODE_ENV === "development" && <DebugPanel />}
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
