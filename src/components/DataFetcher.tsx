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

    // Make sure we have the latest initialGpuCards before fetching
    // This ensures we respect the current included state
    void fetchAvailability();
  }, [selectedRegion, fetchTrigger, spoofingEnabled]);

  const fetchAvailability = async () => {
    // Use the latest initialGpuCards state when the function runs
    // This ensures we have current card state but don't trigger on every toggle
    const promises = initialGpuCards.map(async (card) => {
      if (!card.included) {
        // For disabled cards, just return the card with its current state
        return { ...card, locale: selectedRegion };
      }

      // Use spoof responses if in development and spoofing is enabled.
      if (process.env.NODE_ENV === "development" && spoofingEnabled) {
        const mockResponse = getMockApiResponse(card.name);
        const isActive = mockResponse.listMap.some(
          (item) => item.is_active === "true",
        );

        // Map API status to reachable and error flags
        let api_reachable = false;
        let api_error = false;
        switch (mockResponse.apiStatus) {
          case "reachable":
            api_reachable = true;
            api_error = false;
            break;
          case "unreachable":
            api_reachable = false;
            api_error = false;
            break;
          case "error":
            api_reachable = false;
            api_error = true;
            break;
        }

        return {
          ...card,
          locale: selectedRegion,
          product_url: mockResponse.listMap[0]?.product_url ?? null,
          available: isActive,
          last_seen: isActive ? new Date().toISOString() : card.last_seen,
          api_reachable,
          api_error,
        };
      }

      const completeUrl = `${card.api_url}&locale=${selectedRegion}`;

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
          // Preserve last_change from the original card
          last_change: card.last_change,
        };
      } catch (error) {
        return {
          ...card,
          locale: selectedRegion,
          api_reachable: false,
          api_error: true,
          // Preserve last_change from the original card
          last_change: card.last_change,
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

  // When the parent's GPU cards change (i.e. when a checkbox is toggled),
  // update the local state by merging the latest "included" flags.
  // This effect only updates the UI state without triggering API refreshes.
  useEffect(() => {
    setGpuCards((current) =>
      current.map((card) => {
        const parentCard = initialGpuCards.find((c) => c.name === card.name);
        // Ensure we always use the parent's included state
        return parentCard ? { ...card, included: parentCard.included } : card;
      }),
    );
  }, [initialGpuCards]);

  return [gpuCards, isLoading, error];
}

export { useFetchGpuAvailability };
