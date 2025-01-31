import { useState, useEffect } from "react";
import axios from "axios";
import { type GpuCard } from "~/components/types/gpuInterface";

function useFetchGpuAvailability(
  initialGpuCards: GpuCard[],
  selectedRegion: string,
  fetchTrigger: number,
): [GpuCard[], boolean, Error | null] {
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
          let card_url = card.api_url;
          if (["de-de", "fi-fi", "da-dk", "nb-no", "sv-se"].includes(selectedRegion) && card.api_url_de) {
            card_url = card.api_url_de;
          }
          const completeUrl = `${card_url}&locale=${selectedRegion}`;

          try {
            const response = await axios.get<ApiResponse>(completeUrl);
            const isApiReachable =
              response.data.listMap &&
              Array.isArray(response.data.listMap) &&
              response.data.listMap.length > 0 &&
              "is_active" in (response.data.listMap[0] ?? {});

            const isActive = response.data.listMap.some(
              (item) => item.is_active === "true",
            );

            return {
              ...card,
              locale: selectedRegion,
              product_url: response.data.listMap[0]?.product_url ?? null,
              available: isActive,
              last_seen: isActive ? new Date().toISOString() : card.last_seen,
              api_reachable: isApiReachable,
            };
          } catch (error) {
            return {
              ...card,
              locale: selectedRegion,
              api_reachable: false,
            };
          }
        });

        const updatedCards = await Promise.all(promises);
        setGpuCards(updatedCards);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("An error occurred"));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchAvailability();
  }, [initialGpuCards, selectedRegion, fetchTrigger]);

  return [gpuCards, isLoading, error];
}

export { useFetchGpuAvailability };
