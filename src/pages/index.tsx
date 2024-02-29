import React, { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { useFetchGpuAvailability } from '~/components/DataFetcher';
import initialGpuCards from '~/data/gpu_info.json';
import localeInfo from '~/data/locale_info.json';
import ItemTable from '~/components/ItemTable';
import { PlayCircleIcon, StopCircle } from 'lucide-react';
import { InfoCircledIcon } from "@radix-ui/react-icons" // good icons
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from '~/components/ui/switch';
import { Label } from '~/components/ui/label';
import { ModeToggle } from '~/components/ThemeToggle';
import Image from 'next/image'
import { InfoButton } from '~/components/Info';


function Home(): JSX.Element {
  const startCountdown = 21;
  const [countdown, setCountdown] = useState(startCountdown);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState("cz-cz");
  const [gpuCards, isLoading, error] = useFetchGpuAvailability(initialGpuCards, selectedRegion, fetchTrigger);

  // Locale detection
  useEffect(() => {
    const availableLocales = Object.values(localeInfo);
    const browserLanguage = navigator.language.toLowerCase();
    const primaryLanguageSubtag = browserLanguage.split('-')[0];

    const exactMatch = availableLocales.find((locale) => locale.toLowerCase() === browserLanguage);
    const primarySubtagMatch = availableLocales.find((locale) => locale.toLowerCase().startsWith(primaryLanguageSubtag + '-'));
    setSelectedRegion(exactMatch ?? primarySubtagMatch ?? 'de-de');
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
      <div className="border-b border-l border-r shadow-lg rounded-b-2xl p-5 w-full max-w-lg">
        <h1 className="text-2xl font-bold text-center mb-5">Notify-FE v0.4</h1>
        <div className="text-center mb-4">
          <div className="grid grid-cols-2 gap-4 justify-items-center items-center">
            {!isActive ? (
              <Button variant="outline" className="flex items-center" onClick={handleStart}>
                Start <PlayCircleIcon size={19} className="ml-1" />
              </Button>
            ) : (
              <Button variant="outline" className="flex items-center" onClick={handleStop}>
                Stop <StopCircle size={19} className="ml-1" />
              </Button>
            )}
            <div>
              <p className="text-gray-500 dark:text-gray-400">
                {!isLoading ? `Refreshing in: 00:${countdown.toString().padStart(2, '0')}` : 'Refreshing...'}
              </p>
            </div>
          </div>
        </div>
        {error ? <p>Error: {error.message}</p> : null}
        <ItemTable gpuCards={gpuCards} />
        <div className="grid grid-cols-3 gap-3 mt-7">
          <div className="flex justify-start items-center">
            <InfoButton />
          </div>
          <div className="flex justify-center items-center">
            <Select value={selectedRegion} onValueChange={setSelectedRegion}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Region" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(localeInfo).map(([countryName, countryCode]) => (
                  <SelectItem key={countryCode} value={countryCode}>{countryName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end items-center">
            <ModeToggle />
          </div>
        </div>
      </div>
      <Analytics />
      <div className='mt-5'>
        <a href='https://ko-fi.com/R6R6GVS9E' target='_blank'>
          <Image src='https://storage.ko-fi.com/cdn/kofi6.png?v=3' alt='Buy Me a Coffee at ko-fi.com' height={22} width={160} /></a>
      </div>
      <div className='mt-3'>
        <a href='https://github.com/jlplenio/notify-fe' target='_blank' rel="noopener noreferrer">
          <Image className='dark:invert' src='/github_logo.svg' alt='GitHub Mark' height={22} width={32} /></a>
      </div>
    </div >
  );
};

export default Home;
