import { useDebug } from "~/context/DebugContext";
import {
  mockResponses,
  toggleMockAvailability,
  toggleMockApiStatus,
} from "~/data/mock_responses";
import { Button } from "./ui/button";

export function DebugPanel() {
  const { spoofingEnabled, setSpoofingEnabled } = useDebug();

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 rounded-lg border bg-background p-4 shadow-lg">
      <h3 className="mb-2 font-bold">Debug Controls</h3>
      <div className="mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSpoofingEnabled((prev) => !prev)}
        >
          {spoofingEnabled ? "Spoof Mode: ON" : "Spoof Mode: OFF"}
        </Button>
      </div>
      {spoofingEnabled && (
        <div className="space-y-2">
          {Object.entries(mockResponses).map(([gpuName, config]) => (
            <div key={gpuName} className="flex items-center gap-2">
              <span>{gpuName}:</span>
              <Button
                variant={config.available ? "destructive" : "default"}
                size="sm"
                onClick={() => toggleMockAvailability(gpuName)}
              >
                {config.available ? "Set Unavailable" : "Set Available"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleMockApiStatus(gpuName)}
                className="capitalize"
              >
                Status: {config.apiStatus}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
