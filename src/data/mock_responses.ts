type ApiStatus = "reachable" | "unreachable" | "error";

type MockResponseConfig = {
  available: boolean;
  apiStatus: ApiStatus;
};

export const mockResponses: Record<string, MockResponseConfig> = {
  "5090": { available: false, apiStatus: "reachable" },
  "5080": { available: false, apiStatus: "reachable" },
  "5070T": { available: false, apiStatus: "reachable" },
  "5070": { available: false, apiStatus: "reachable" },
  "4090": { available: false, apiStatus: "reachable" },
  "4080S": { available: false, apiStatus: "reachable" },
  "4070S": { available: false, apiStatus: "reachable" },
};

// Helper function to toggle availability
export const toggleMockAvailability = (gpuName: string) => {
  const config = mockResponses[gpuName];
  if (config) {
    config.available = !config.available;
  }
};

// Function to toggle the API status
export const toggleMockApiStatus = (gpuName: string) => {
  const config = mockResponses[gpuName];
  if (config) {
    // Cycle through the statuses
    switch (config.apiStatus) {
      case "reachable":
        config.apiStatus = "unreachable";
        break;
      case "unreachable":
        config.apiStatus = "error";
        break;
      case "error":
        config.apiStatus = "reachable";
        break;
      default:
        config.apiStatus = "reachable";
    }
  }
};

// Function to generate mock API response
export const getMockApiResponse = (gpuName: string) => {
  const config = mockResponses[gpuName];
  if (!config) {
    throw new Error(`No mock configuration found for GPU: ${gpuName}`);
  }

  return {
    success: true,
    map: null,
    listMap: [
      {
        is_active: config.available ? "true" : "false",
        product_url: "https://store.nvidia.com/test-url",
        price: "999.99",
        fe_sku: "TEST_SKU",
        locale: "test-locale",
      },
    ],
    apiStatus: config.apiStatus,
  };
};
