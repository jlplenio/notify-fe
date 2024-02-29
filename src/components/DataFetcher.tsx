import { useState, useEffect } from 'react';
import axios from 'axios';
import { type GpuCard } from '~/components/types/gpuInterface';

function useFetchGpuAvailability(initialGpuCards: GpuCard[], selectedRegion: string, fetchTrigger: number): [GpuCard[], boolean, Error | null] {
  const [gpuCards, setGpuCards] = useState<GpuCard[]>(initialGpuCards);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  interface ApiResponse {
    success: boolean;
    map: null | undefined;
    listMap: Array<{
      is_active: string;
      product_url: string;
      price: string;
      fe_sku: string;
      locale: string;
    }>;
  }

  useEffect(() => {
    const fetchAvailability = async () => {

      if (fetchTrigger === 0) {
        setGpuCards(initialGpuCards);
        return;
      }

      setIsLoading(true);

      try {
        const promises = initialGpuCards.map(async (card) => {
          const card_url = selectedRegion === "en-us" ? card.api_url_us : card.api_url;
          const completeUrl = `${card_url}&locale=${selectedRegion}`;
          const response = await axios.get<ApiResponse>(completeUrl /*,{
            headers: {
              "Accept-Language": "de,en-US;q=0.7,en;q=0.3",
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Site": "same-site",
              "Referer": "https://store.nvidia.com/",
              "Origin": "https://store.nvidia.com/",
            }
          }*/);
          const isActive = response.data.listMap.some((item) => item.is_active === "true");
          return { ...card, locale: selectedRegion, product_url: response.data.listMap[0]?.product_url ?? null, available: isActive, last_seen: isActive ? new Date().toISOString() : card.last_seen };
        });

        const updatedCards = await Promise.all(promises);
        setGpuCards(updatedCards);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('An error occurred'));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchAvailability(); // Todo
  }, [initialGpuCards, fetchTrigger]); // Include fetchTrigger in the dependency array

  return [gpuCards, isLoading, error];
};

export { useFetchGpuAvailability };
