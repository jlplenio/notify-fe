import React, { useState, useEffect, useRef } from "react";
import { Analytics } from "@vercel/analytics/react";
import { track } from "@vercel/analytics";
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
import axios from "axios"; // Import axios for making HTTP requests
import { PermissionHandler } from "~/components/PermissionHandler";

// Type definition for the SKU data returned from the API
interface SkuItem {
  sku: string;
  old_sku: string;
  last_change: string;
}

type SkuLocaleData = Record<string, SkuItem>;
type SkuData = Record<string, SkuLocaleData>;

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
  const { refreshInterval, setVolume, setRepetitions } = useSoundSettings();
  const [countdown, setCountdown] = useState(refreshInterval);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [animateSkuTime, setAnimateSkuTime] = useState<boolean>(false);
  const [selectedRegion, setSelectedRegion] = useState(initialRegion);
  const [skuData, setSkuData] = useState<SkuData | null>(null);
  const [skuError, setSkuError] = useState<Error | null>(null);
  const skuUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialFetchDoneRef = useRef<boolean>(false);

  const [gpuCards, setGpuCards] = useState<GpuCard[]>(() => {
    const initialGroupedGpuCards = buildCompleteGpuInfo() as Record<
      string,
      GpuCard[]
    >;
    return initialGroupedGpuCards[initialRegion] ?? [];
  });

  // Client-side fetch for SKU data every X seconds
  useEffect(() => {
    const fetchSkuData = async () => {
      try {
        const uniqueParam = Math.random();
        const response = await axios.get<SkuData>(
          `https://r2.jlplen.io/skus.json?nocache=${uniqueParam}`,
          // Please use with consideration and donate https://ko-fi.com/timesaved <3
          // Use http://localhost:3000 if running locally
          {
            timeout: 5000,
          },
        );
        setSkuData(response.data);
        setLastUpdate(new Date());
        setAnimateSkuTime(true);
        setSkuError(null);

        // Update animation state
        const timer = setTimeout(() => setAnimateSkuTime(false), 1000);
        return () => clearTimeout(timer);
      } catch (error) {
        console.error("Error fetching SKU data:", error);
        setSkuError(
          error instanceof Error
            ? error
            : new Error("Failed to fetch SKU data"),
        );
      }
    };

    // Only perform the initial fetch if it hasn't been done yet
    if (!initialFetchDoneRef.current) {
      void fetchSkuData();
      initialFetchDoneRef.current = true;
    }

    // Set up the interval to fetch every 15 seconds
    skuUpdateIntervalRef.current = setInterval(() => {
      void fetchSkuData();
    }, 10100); // Do not change this, you will get rate-limit banned by Cloudflare

    // Clean up on unmount
    return () => {
      if (skuUpdateIntervalRef.current) {
        clearInterval(skuUpdateIntervalRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    setCountdown(refreshInterval);
  }, [refreshInterval]);

  const handleRegionChange = (newRegion: string) => {
    const grouped = buildCompleteGpuInfo(skuData ?? undefined) as Record<
      string,
      GpuCard[]
    >;
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
            return refreshInterval;
          }
          return currentCountdown - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalId);
  }, [isActive, refreshInterval]);

  const handleStart = () => {
    setFetchTrigger((prev) => prev + 1);
    setIsActive(true);
    void playSound({ forceSingle: true, message: "" });
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
    <>
      <div className="flex flex-col items-center justify-center">
        <div className="w-full max-w-lg rounded-b-2xl border-b border-l border-r p-5 shadow-lg">
          <h1 className="mb-3 text-center text-2xl font-bold">
            Notify-FE | notify-fe.plen.io
          </h1>

          <div className="mb-2 rounded-lg bg-green-100 px-4 py-2 text-center text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">
            NVIDIA store only! Click start, a notification will sound on
            availability.{" "}
            <span className="font-semibold">
              The first Shop Link will open automatically
            </span>
            , afterwards click it manually. More general and{" "}
            <span className="font-semibold">Telegram</span> settings bottom-left
            ⚙️ Scalpers don&apos;t win!
          </div>

          <PermissionHandler />

          <div className="mb-3 text-center text-xs text-gray-500 dark:text-gray-400">
            💝 This service has cost $131.40 to run so far (Mar 4). Thank you
            for your support!
          </div>

          <div className="mb-2 text-center">
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

          <div className="mt-4 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              The SKU update is experimental. Please do not solely rely on it.
            </div>
            <div
              className={`text-xs transition-colors duration-300 ${
                animateSkuTime ? "text-primary" : ""
              } ${skuError ? "text-red-400 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}
            >
              {skuError
                ? "Last Automatic Check For SKU Updates: Failed"
                : lastUpdate
                  ? `Last Automatic Check For SKU Updates: ${lastUpdate.toLocaleTimeString()}`
                  : "No updates yet"}
            </div>
          </div>

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
    </>
  );
}

export default Home;
