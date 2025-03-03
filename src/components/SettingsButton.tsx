import * as React from "react";
import { Button } from "./ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useSoundSettings } from "~/context/SoundSettingsContext";
import { usePlaySound } from "./Beeper";
import {
  GearIcon,
  SpeakerLoudIcon,
  BellIcon,
  Link2Icon,
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import { ClockIcon } from "lucide-react";
import { useRouter } from "next/router";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { Input } from "~/components/ui/input";

export function SettingsButton() {
  const {
    volume,
    repetitions,
    setVolume,
    setRepetitions,
    apiAlarmEnabled,
    setApiAlarmEnabled,
    refreshInterval,
    setRefreshInterval,
    telegramApiUrl,
    setTelegramApiUrl,
  } = useSoundSettings();
  const playSound = usePlaySound();
  const router = useRouter();
  const [isPulsing, setIsPulsing] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPulsing(false);
    }, 15000);

    return () => clearTimeout(timer);
  }, []);

  const handlePopoverOpenChange = (open: boolean) => {
    if (open) {
      // Stop pulsing when popover is opened
      setIsPulsing(false);
    }

    if (!open) {
      // when popover closes, update URL query parameters, but not the telegramApiUrl
      // since that's stored in localStorage
      const query = {
        ...router.query,
        volume: volume.toString(),
        repetitions: repetitions.toString(),
        apiAlarmEnabled: apiAlarmEnabled.toString(),
        refresh: refreshInterval.toString(),
      };
      // Remove telegramApiUrl from URL if it exists
      if ("telegramApiUrl" in query) {
        delete query.telegramApiUrl;
      }
      void router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      });
    }
  };

  return (
    <Popover onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon">
          <GearIcon
            className={`h-[1.2rem] w-[1.2rem] ${isPulsing ? "animate-pulse-gentle" : ""}`}
          />
          <span className="sr-only">Settings</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[420px] max-w-[100vw] rounded-lg bg-white p-3 shadow-lg dark:bg-gray-800"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <SpeakerLoudIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Volume
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {(Number(volume) * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 dark:bg-gray-700"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Refresh Interval (seconds)
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {refreshInterval}s
                </span>
              </div>
              <input
                type="range"
                min="6"
                max="31"
                step="1"
                value={refreshInterval}
                onChange={(e) =>
                  setRefreshInterval(parseInt(e.target.value, 10))
                }
                className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full"
                style={{
                  background:
                    "linear-gradient(to right, rgb(255, 150, 150) 0%, rgb(255, 150, 150) 40%, rgb(134, 239, 172) 40%, rgb(134, 239, 172) 100%)",
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <BellIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <div className="flex flex-1 items-center justify-between">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Repeat Sound
              </label>
              <select
                value={repetitions}
                onChange={(e) => setRepetitions(Number(e.target.value))}
                className="ml-2 rounded-md border-gray-200 bg-transparent text-xs dark:border-gray-700 dark:bg-gray-800"
              >
                <option value={1}>Once</option>
                <option value={2}>Twice</option>
                <option value={3}>3 times</option>
              </select>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-between">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Alarm for API going down
            </label>
            <Switch
              checked={apiAlarmEnabled}
              onCheckedChange={(checked) =>
                setApiAlarmEnabled(checked as boolean)
              }
              className="ml-2"
            />
          </div>

          <div className="my-2 h-px w-full bg-gray-200 dark:bg-gray-700"></div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Link2Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              <div className="flex items-center gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Receive Notifications via Telegram Bot API
                </label>
                <a
                  href="https://gist.github.com/nafiesl/4ad622f344cd1dc3bb1ecbe468ff9f8a"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs text-blue-500 transition-colors hover:text-blue-600"
                >
                  <InfoCircledIcon className="h-3.5 w-3.5" />
                  <span>Tutorial</span>
                </a>
              </div>
            </div>
            <Input
              type="text"
              placeholder="https://api.telegram.org/botTOKEN/sendMessage?chat_id=RECEIVER"
              value={telegramApiUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setTelegramApiUrl(e.target.value)
              }
              className="h-8 text-xs"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Enter the Telegram Bot API URL without parse_mode and text
              parameters.
            </p>
            {telegramApiUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  playSound({
                    message:
                      "✅ Test notification - Telegram integration is working",
                    forceSingle: true,
                  })
                }
                className="mt-1 w-full text-xs"
              >
                Test Telegram
              </Button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void playSound({ forceSingle: true, message: "" })}
            className="w-full text-xs"
          >
            Test Sound
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
