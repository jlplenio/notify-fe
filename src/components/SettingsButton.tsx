import * as React from "react";
import { Button } from "./ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useSoundSettings } from "~/context/SoundSettingsContext";
import { usePlaySound } from "./Beeper";
import { GearIcon, SpeakerLoudIcon, BellIcon } from "@radix-ui/react-icons";

export function SettingsButton() {
  const { volume, repetitions, setVolume, setRepetitions } = useSoundSettings();
  const playSound = usePlaySound();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon">
          <GearIcon className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Settings</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 rounded-lg bg-white p-3 shadow-lg dark:bg-gray-800"
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => void playSound()}
            className="w-full text-xs"
          >
            Test Sound
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
