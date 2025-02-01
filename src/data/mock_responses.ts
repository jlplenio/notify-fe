export const mockResponses: Record<string, boolean> = {
  "5090": false,
  "5080": false,
  "5070T": false,
  "5070": false,
  "4090": false,
  "4080S": false,
  "4070S": false,
};

// Helper function to toggle availability
export const toggleMockAvailability = (gpuName: string) => {
  if (gpuName in mockResponses) {
    mockResponses[gpuName] = !mockResponses[gpuName];
  }
};

// Function to generate mock API response
export const getMockApiResponse = (gpuName: string) => ({
  success: true,
  map: null,
  listMap: [
    {
      is_active: mockResponses[gpuName] ? "true" : "false",
      product_url: "https://store.nvidia.com/test-url",
      price: "999.99",
      fe_sku: "TEST_SKU",
      locale: "test-locale",
    },
  ],
});
