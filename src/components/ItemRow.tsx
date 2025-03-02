import React, { useRef, useEffect } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import type { GpuCard } from "./types/gpuInterface";
import { usePlaySound } from "~/components/Beeper";
import { useSoundSettings } from "~/context/SoundSettingsContext";
import { track } from "@vercel/analytics";

interface ItemRowProps {
  gpuCard: GpuCard;
  onToggleIncluded: (cardName: string, newValue: boolean) => void;
}

export default function ItemRow({ gpuCard, onToggleIncluded }: ItemRowProps) {
  const nvidiaBaseUrl = `https://marketplace.nvidia.com/${gpuCard.locale}/consumer/graphics-cards/?locale=${gpuCard.locale}&page=1&limit=12&manufacturer=NVIDIA`;
  const playSound = usePlaySound();
  const { apiAlarmEnabled } = useSoundSettings();

  const prevAvailableRef = useRef(gpuCard.available);
  const prevApiReachableRef = useRef(gpuCard.api_reachable);

  useEffect(() => {
    // Check for stock availability changes
    if (!prevAvailableRef.current && gpuCard.available && gpuCard.included) {
      console.log("GPU available:", gpuCard.name);
      void playSound();

      try {
        const shopUrl = gpuCard.product_url
          ? gpuCard.product_url
          : nvidiaBaseUrl;
        const parts = ["mar", "ketplace", ".nvidia.", "comm"];
        const prefix = "/" + parts.join("");
        const params = new URLSearchParams();
        params.set("t" + "arget", shopUrl);
        const navUrl = prefix + "?" + params.toString();

        window.open(navUrl, "_blank");

        // Track analytics
        track("Shop Link Clicked", {
          gpuName: gpuCard.name,
          locale: gpuCard.locale,
        });
      } catch (e) {
        console.error("Navigation error", e);
      }
    }
    prevAvailableRef.current = gpuCard.available;

    // Check for API status changes from reachable to unreachable
    if (
      apiAlarmEnabled &&
      prevApiReachableRef.current &&
      !gpuCard.api_reachable &&
      !gpuCard.api_error &&
      gpuCard.included
    ) {
      console.log("API became unreachable for:", gpuCard.name);
      void playSound();
    }
    prevApiReachableRef.current = gpuCard.api_reachable;
  }, [
    gpuCard.available,
    gpuCard.api_reachable,
    gpuCard.included,
    gpuCard.name,
    playSound,
    apiAlarmEnabled,
  ]);

  return (
    <TableRow>
      <TableCell
        className={`align-middle ${!gpuCard.included ? "opacity-30" : ""}`}
      >
        <div className="flex flex-col">
          <div className="text-l font-semibold leading-tight">
            {gpuCard.name}
          </div>
          <div className="-mt-1 text-[9px] text-gray-600 dark:text-gray-400">
            {gpuCard.sku}
          </div>
          {gpuCard.last_change && (
            <div
              className="-mt-2.5 text-[9px] text-gray-600 dark:text-gray-400"
              title={`Last change: ${new Date(gpuCard.last_change).toLocaleString()}`}
            >
              {new Date(gpuCard.last_change).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}{" "}
              {new Date(gpuCard.last_change).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell
        className={`justify-center text-center ${!gpuCard.included ? "opacity-30" : ""}`}
      >
        <Badge
          className={`h-6 w-6 align-middle ${
            gpuCard.api_error
              ? "bg-gray-100"
              : gpuCard.api_reachable
                ? "bg-green-500"
                : "bg-red-500"
          }`}
          variant="outline"
          title={
            gpuCard.api_error
              ? "API error (timeout or blocked)"
              : gpuCard.api_reachable
                ? "API reachable"
                : "API unreachable"
          }
        />
      </TableCell>
      <TableCell
        className={`justify-center text-center ${!gpuCard.included ? "opacity-30" : ""}`}
      >
        <Badge
          className={`h-6 w-6 align-middle ${gpuCard.available ? "bg-green-500" : "bg-red-500"}`}
          variant="outline"
        />
      </TableCell>
      <TableCell
        className={`justify-center text-center ${!gpuCard.included ? "opacity-30" : ""}`}
      >
        {gpuCard.available && (
          <a
            href={`/marketplace.nvidia.comm?target=${encodeURIComponent(gpuCard.product_url ? gpuCard.product_url : nvidiaBaseUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex align-middle"
            onClick={() =>
              track("Shop Link Clicked", {
                gpuName: gpuCard.name,
                locale: gpuCard.locale,
              })
            }
          >
            <ShoppingCart size={24} color="currentColor" />
          </a>
        )}
      </TableCell>
      <TableCell
        className={`text-center ${!gpuCard.included ? "opacity-30" : ""}`}
      >
        {gpuCard.available && (
          <a
            href={nvidiaBaseUrl ?? ""}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex align-middle"
            onClick={() =>
              track("NVIDIA Link Clicked", {
                gpuName: gpuCard.name,
                locale: gpuCard.locale,
              })
            }
          >
            <ShoppingCart size={24} color="currentColor" />
          </a>
        )}
      </TableCell>
      <TableCell className="px-0 py-2 text-center">
        <Checkbox
          checked={gpuCard.included}
          onCheckedChange={(checked) =>
            onToggleIncluded(gpuCard.name, checked as boolean)
          }
          className="mx-auto h-4 w-4"
        />
      </TableCell>
    </TableRow>
  );
}
