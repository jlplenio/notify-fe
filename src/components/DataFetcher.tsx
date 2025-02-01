import { useState, useEffect } from "react";
import axios from "axios";
import { type GpuCard } from "~/components/types/gpuInterface";
import { getMockApiResponse } from "~/data/mock_responses";
import { useDebug } from "~/context/DebugContext";

function useFetchGpuAvailability(
  initialGpuCards: GpuCard[],
  selectedRegion: string,
  fetchTrigger: number,
): [GpuCard[], boolean, Error | null] {
  const [gpuCards, setGpuCards] = useState<GpuCard[]>(initialGpuCards);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Get spoofingEnabled from the debug context.
  const { spoofingEnabled } = useDebug();

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

  // API fetch: trigger only on timer (fetchTrigger) or region changes.
  useEffect(() => {
    if (fetchTrigger === 0) {
      // When fetchTrigger is 0, do not update; UI changes are managed separately.
      return;
    }

    setIsLoading(true);

    const fetchAvailability = async () => {
      // Use the unmodified parent cards (initialGpuCards) to drive API calls.
      const promises = initialGpuCards.map(async (card) => {
        if (!card.included) {
          return card;
        }

        // Use spoof responses if in development and spoofing is enabled.
        if (process.env.NODE_ENV === "development" && spoofingEnabled) {
          const mockResponse = getMockApiResponse(card.name);
          const isActive = mockResponse.listMap.some(
            (item) => item.is_active === "true",
          );

          return {
            ...card,
            locale: selectedRegion,
            product_url: mockResponse.listMap[0]?.product_url ?? null,
            available: isActive,
            last_seen: isActive ? new Date().toISOString() : card.last_seen,
            api_reachable: true,
            api_error: false,
          };
        }

        let card_url = card.api_url;
        if (
          // Use German (or other selected) URL when applicable.
          ["de-de", "fi-fi", "da-dk", "nb-no", "sv-se", "nl-nl"].includes(
            selectedRegion,
          ) &&
          card.api_url_de
        ) {
          card_url = card.api_url_de;
        }
        const completeUrl = `${card_url}&locale=${selectedRegion}`;

        try {
          const response = await axios.get<ApiResponse>(completeUrl, {
            timeout: 3000,
            validateStatus: (status) => status === 200,
          });
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
            api_error: false,
          };
        } catch (error) {
          return {
            ...card,
            locale: selectedRegion,
            api_reachable: false,
            api_error: true,
          };
        }
      });

      const updatedCards = await Promise.all(promises);
      // Merge in the current "included" state from the parent (initialGpuCards)
      const mergedCards = updatedCards.map((card) => {
        const parentCard = initialGpuCards.find((c) => c.name === card.name);
        return parentCard ? { ...card, included: parentCard.included } : card;
      });
      setGpuCards(mergedCards);
      setIsLoading(false);
    };

    void fetchAvailability();
  }, [selectedRegion, fetchTrigger, spoofingEnabled]);

  // When the parent's GPU cards change (i.e. when a checkbox is toggled),
  // update the local state by merging the latest "included" flags.
  useEffect(() => {
    setGpuCards((current) =>
      current.map((card) => {
        const parentCard = initialGpuCards.find((c) => c.name === card.name);
        return parentCard ? { ...card, included: parentCard.included } : card;
      }),
    );
  }, [initialGpuCards]);

  return [gpuCards, isLoading, error];
}

export { useFetchGpuAvailability };
