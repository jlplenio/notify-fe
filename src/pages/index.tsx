import React, { useState, useEffect, useRef } from "react";
import { Analytics } from "@vercel/analytics/react";
import { track } from "@vercel/analytics";
import { useFetchGpuAvailability } from "~/components/DataFetcher";
import localeInfo from "~/data/locale_info.json";
import ItemTable from "~/components/ItemTable";
import { PlayCircleIcon, StopCircle, CloudIcon, InfoIcon } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Type definition for the SKU data returned from the API
interface SkuItem {
  sku: string;
  old_sku: string;
  last_change: string;
}

type SkuLocaleData = Record<string, SkuItem>;
type SkuData = Record<string, SkuLocaleData>;

// Map of regions that should show the Prime Cloudflare button and their TLDs
const primeCloudflareRegions: Record<string, string> = {
  "de-de": "de", // Germany
  "de-at": "at", // Austria
  "fi-fi": "fi", // Finland
  "nb-no": "no", // Norway
  "da-dk": "dk", // Denmark
  "nl-nl": "nl", // Netherlands
  "sv-se": "se", // Sweden
};

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

  // Track when Prime Cloudflare was last used
  const [lastCloudflareUse, setLastCloudflareUse] = useState<string | null>(null);

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

      // Preserve the 'included' state when updating gpuCards with new SKU data
      setGpuCards((prevCards) => {
        const newCards = grouped[selectedRegion] ?? [];
        return newCards.map((newCard) => {
          // Find the corresponding card in previous state
          const prevCard = prevCards.find((card) => card.name === newCard.name);
          // Preserve the 'included' state if it exists, otherwise use the new card's value
          return prevCard
            ? { ...newCard, included: prevCard.included }
            : newCard;
        });
      });
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

  // Load the last Cloudflare usage time from localStorage on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const lastUsed = localStorage.getItem(`primeCloudflare_${selectedRegion}`);
      if (lastUsed) {
        setLastCloudflareUse(lastUsed);
      }
    }
  }, [selectedRegion]);

  const handleRegionChange = (newRegion: string) => {
    const grouped = buildCompleteGpuInfo(skuData ?? undefined) as Record<
      string,
      GpuCard[]
    >;

    // Preserve the included state when changing regions
    setGpuCards((prevCards) => {
      const newCards = grouped[newRegion] ?? [];

      // For each new card, check if there's a card with the same name in the previous region
      // and preserve its 'included' state if found
      return newCards.map((newCard) => {
        // Try to find a card with the same name in the previous region
        const prevCard = prevCards.find(
          (card) =>
            // Look for matching names (ignoring region-specific parts of the name if present)
            card.name.replace(selectedRegion, "").trim() ===
            newCard.name.replace(newRegion, "").trim(),
        );

        // If a matching card is found, preserve its included state
        return prevCard ? { ...newCard, included: prevCard.included } : newCard;
      });
    });

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

  const handlePrimeCloudflare = () => {
    const tld = primeCloudflareRegions[selectedRegion];
    if (tld) {
      const url = `${atob("aHR0cHM6Ly9udmlkaWEuY29tLnBsZW4uaW8v")}?url=https://www.proshop.${tld}/Basket/BuyNvidiaGraphicCard?t=R`;
      window.open(url, '_blank');
      
      // Record the timestamp
      const now = new Date().toISOString();
      setLastCloudflareUse(now);
      
      // Save to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(`primeCloudflare_${selectedRegion}`, now);
      }
      
      track('primeCloudflareClicked', { region: selectedRegion, tld });
    }
  };

  const formatCooldownTime = (timestamp: string): string => {
    const lastTime = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - lastTime.getTime();
    const cooldownMs = 10 * 60 * 1000; // 10 minutes in milliseconds
    const remainingMs = cooldownMs - diffMs;
    
    if (remainingMs <= 0) return "Ready";
    
    const remainingMins = Math.floor(remainingMs / (1000 * 60));
    const remainingSecs = Math.floor((remainingMs % (1000 * 60)) / 1000);
    
    return `${remainingMins}:${remainingSecs.toString().padStart(2, '0')} left`;
  };

  // Check if we need to show a cooldown warning
  const shouldShowCooldownWarning = (timestamp: string | null): boolean => {
    if (!timestamp) return false;
    
    const lastTime = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - lastTime.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    // Return true if last used less than 10 minutes ago
    return diffMins < 10;
  };

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
            💝 This service has cost $173.12 to run so far (Mar 23). Thank you
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
            
            {/* Prime Cloudflare button for selected regions */}
            {primeCloudflareRegions[selectedRegion] && (
              <div className="my-3 px-4">
                <div className="flex items-center justify-between rounded-md border overflow-hidden">
                  <Button 
                    variant="ghost"
                    className={`h-9 px-3 flex-grow hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-none border-0 text-sm font-medium ${
                      shouldShowCooldownWarning(lastCloudflareUse) ? "opacity-75" : ""
                    }`}
                    onClick={handlePrimeCloudflare}
                    disabled={shouldShowCooldownWarning(lastCloudflareUse)}
                  >
                    <CloudIcon size={16} className="mr-1.5" />
                    {shouldShowCooldownWarning(lastCloudflareUse) ? "Cloudflare Primed ✓ " : "Prime Cloudflare"}
                    <span className="ml-2 text-xs">
                      {shouldShowCooldownWarning(lastCloudflareUse) 
                        ? "Cooling down..." 
                        : "Use before drop"}
                    </span>
                  </Button>
                  <div className="flex items-center pr-3 text-xs whitespace-nowrap">
                    <span className={shouldShowCooldownWarning(lastCloudflareUse) ? "text-gray-500 dark:text-gray-400" : ""}>
                      {lastCloudflareUse 
                        ? formatCooldownTime(lastCloudflareUse) 
                        : "Ready"}
                    </span>
                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <button className="ml-1.5 p-1 -mr-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800/50 focus:outline-none">
                            <InfoIcon size={14} className="text-gray-500 dark:text-gray-400" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent 
                          side="top" 
                          align="end" 
                          sideOffset={5}
                          className="max-w-[400px] w-[400px] p-3 text-sm z-50 whitespace-normal"
                        >
                          <p>Use this option every 10 minutes or directly before a drop to have a better chance to bypass Cloudflare checks.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>
            )}
          </div>
          {error ? <p>Error: {error.message}</p> : null}
          <ItemTable
            gpuCards={updatedGpuCards}
            onToggleIncluded={toggleIncluded}
          />

          <div className="mt-2 text-center">
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
            {skuError && (
              <div className="mt-1 text-xs text-red-400 dark:text-red-400">
                Error: {skuError.message}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1 sm:gap-3">
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
