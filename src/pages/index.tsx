import React, { useState, useEffect } from "react";
import { Analytics } from "@vercel/analytics/react";
import { useFetchGpuAvailability } from "~/components/DataFetcher";
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
import { useSoundSettings } from "~/context/SoundSettingsContext";
import { buildCompleteGpuInfo } from "~/utils/buildGpuInfo";
import { type GpuCard } from "~/components/types/gpuInterface";
import { api } from "~/utils/api";

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const { region } = query;
  const validRegion =
    typeof region === "string" && Object.values(localeInfo).includes(region)
      ? region
      : "en-gb";

  const volumeParam = query.volume;
  let initialVolume = 0.5;
  if (typeof volumeParam === "string") {
    const parsedVolume = parseFloat(volumeParam);
    if (!isNaN(parsedVolume) && parsedVolume >= 0 && parsedVolume <= 1) {
      initialVolume = parsedVolume;
    }
  }

  const repetitionsParam = query.repetitions;
  let initialRepetitions = 1;
  if (typeof repetitionsParam === "string") {
    const parsedReps = parseInt(repetitionsParam, 10);
    if (!isNaN(parsedReps) && parsedReps > 0) {
      initialRepetitions = parsedReps;
    }
  }

  return {
    props: {
      initialRegion: validRegion,
      initialVolume,
      initialRepetitions,
    },
  };
};

function Home({
  initialRegion,
  initialVolume,
  initialRepetitions,
}: {
  initialRegion: string;
  initialVolume: number;
  initialRepetitions: number;
}): JSX.Element {
  const router = useRouter();
  const startCountdown = 16;
  const [countdown, setCountdown] = useState(startCountdown);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [animateSkuTime, setAnimateSkuTime] = useState<boolean>(false);
  const [selectedRegion, setSelectedRegion] = useState(initialRegion);

  const { data: skuData, error: skuError } = api.skus.getSkus.useQuery(
    undefined,
    {
      refetchInterval: 30000,
      staleTime: 25000,
      cacheTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
      notifyOnChangeProps: "all",
      refetchIntervalInBackground: true,
      onSuccess: () => {
        setLastUpdate(new Date());
        setAnimateSkuTime(true);
        const timer = setTimeout(() => setAnimateSkuTime(false), 1000);
        return () => clearTimeout(timer);
      },
    },
  );

  const [gpuCards, setGpuCards] = useState<GpuCard[]>(() => {
    const initialGroupedGpuCards = buildCompleteGpuInfo() as Record<
      string,
      GpuCard[]
    >;
    return initialGroupedGpuCards[initialRegion] ?? [];
  });

  useEffect(() => {
    if (skuData) {
      const grouped = buildCompleteGpuInfo(skuData) as Record<
        string,
        GpuCard[]
      >;
      setGpuCards(grouped[selectedRegion] ?? []);
    }
  }, [skuData, selectedRegion]);

  const playSound = usePlaySound();
  const { setVolume, setRepetitions } = useSoundSettings();

  useEffect(() => {
    const { region } = router.query;
    if (typeof region === "string" && region in Object.values(localeInfo)) {
      setSelectedRegion(region);
    }
  }, [router.query]);

  useEffect(() => {
    setVolume(initialVolume);
    setRepetitions(initialRepetitions);
  }, [initialVolume, initialRepetitions, setVolume, setRepetitions]);

  const handleRegionChange = (newRegion: string) => {
    const grouped = buildCompleteGpuInfo(skuData) as Record<string, GpuCard[]>;
    setGpuCards(grouped[newRegion] ?? []);

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
    void playSound({ forceSingle: true });
  };

  const handleStop = () => {
    setIsActive(false);
  };

  const toggleIncluded = (cardName: string, newValue: boolean) => {
    setGpuCards((prevCards) =>
      prevCards.map((card) =>
        card.name === cardName ? { ...card, included: newValue } : card,
      ),
    );
  };

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

        <div className="mb-2 rounded-lg bg-green-100 px-4 py-2 text-center text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">
          Only checks the NVIDIA store! If the API is online, let the page run
          in the background, wait for the notification sound and click the Shop
          Link. Scalpers don&apos;t win!
        </div>

        <div className="mb-2 text-center">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            The SKU update is experimental. Please do not solely rely on it.
          </div>
          <div
            className={`mb-3 text-xs transition-colors duration-300 ${
              animateSkuTime ? "text-primary" : ""
            } ${skuError ? "text-red-400 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}
          >
            {skuError
              ? "Last Automatic Check For SKU Updates: Failed"
              : lastUpdate
                ? `Last Automatic Check For SKU Updates: ${lastUpdate.toLocaleTimeString()}`
                : "No updates yet"}
          </div>
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
                  className={`h-9 w-[95px] text-sm font-medium`}
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
        <div className="mt-7 grid grid-cols-3 gap-1 sm:gap-3">
          <div className="z-20 flex scale-75 items-center justify-start sm:scale-90 md:scale-100">
            <SettingsButton />
          </div>
          <div className="flex scale-75 items-center justify-center sm:scale-90 md:scale-100">
            <KoFiButton />
          </div>
          <div className="flex scale-75 items-center justify-end sm:scale-90 md:scale-100">
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
