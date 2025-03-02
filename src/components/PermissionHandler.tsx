import { useEffect, useState, useRef } from "react";

export function PermissionHandler() {
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const popupChecked = useRef(false);

  useEffect(() => {
    // Only run in browser environment and only once
    if (typeof window !== "undefined" && !popupChecked.current) {
      popupChecked.current = true;

      // Test if we can open a popup
      const testPopup = window.open(
        "about:blank",
        "_blank",
        "width=1,height=1,top=-9999,left=-9999",
      );

      if (
        !testPopup ||
        testPopup.closed ||
        typeof testPopup.closed === "undefined"
      ) {
        // Popup was blocked
        setShowPermissionBanner(true);
        console.log("Popups are blocked. User needs to enable them.");
      } else {
        // Popup worked, close it immediately
        testPopup.close();
        console.log("Popups are allowed.");
      }
    }
  }, []);

  if (!showPermissionBanner) {
    return null;
  }

  return (
    <div className="mb-3 rounded-lg bg-yellow-50 px-4 py-2 text-center text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
      Automatic opening of Shop Link is blocked. Allow popups and refresh.
    </div>
  );
}
