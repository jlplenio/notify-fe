import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function PermissionHandler() {
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);

  useEffect(() => {
    // Only run in browser environment
    if (typeof window !== "undefined") {
      // Check if permission is not already set (still in default state)
      if (Notification.permission === "default") {
        console.log("Notification permission status:", Notification.permission);
        setShowPermissionBanner(true);
      }
    }
  }, []);

  const requestPermission = () => {
    void Notification.requestPermission()
      .then((permission) => {
        console.log("Permission response:", permission);
        if (permission === "granted" || permission === "denied") {
          setShowPermissionBanner(false);
        }
      })
      .catch((error) => {
        console.error("Error requesting notification permission:", error);
      });
  };

  if (!showPermissionBanner) {
    return null;
  }

  return (
    <div className="mb-3 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-2 text-sm dark:bg-blue-900/30">
      <div className="text-blue-700 dark:text-blue-200">
        Open the first Shop Link automatically on availability?
      </div>
      <Button
        variant="outline"
        size="sm"
        className="ml-2 whitespace-nowrap bg-blue-100 dark:bg-blue-800"
        onClick={requestPermission}
      >
        Allow
      </Button>
    </div>
  );
}
