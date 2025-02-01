import React, { useRef, useEffect } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { Checkbox } from "./ui/checkbox";
import type { GpuCard } from "./types/gpuInterface";
import { usePlaySound } from "~/components/Beeper";
import { track } from "@vercel/analytics";

interface ItemRowProps {
  gpuCard: GpuCard;
  onToggleIncluded: (cardName: string, newValue: boolean) => void;
}

export default function ItemRow({ gpuCard, onToggleIncluded }: ItemRowProps) {
  const nvidiaBaseUrl = `https://marketplace.nvidia.com/${gpuCard.locale}/consumer/graphics-cards/?locale=${gpuCard.locale}&page=1&limit=12&manufacturer=NVIDIA`;
  const playSound = usePlaySound();

  const prevAvailableRef = useRef(gpuCard.available);

  useEffect(() => {
    if (!prevAvailableRef.current && gpuCard.available && gpuCard.included) {
      console.log("GPU available:", gpuCard.name);
      void playSound();
    }
    prevAvailableRef.current = gpuCard.available;
  }, [gpuCard.available, gpuCard.included, gpuCard.name, playSound]);

  return (
    <TableRow>
      <TableCell
        className={`align-middle ${!gpuCard.included ? "opacity-30" : ""}`}
      >
        {gpuCard.name}
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
            href={gpuCard.product_url ? gpuCard.product_url : nvidiaBaseUrl}
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
      <TableCell className="flex items-center justify-center px-0 py-2.5 text-center">
        <Checkbox
          checked={gpuCard.included}
          onCheckedChange={(checked) =>
            onToggleIncluded(gpuCard.name, checked as boolean)
          }
          className="h-4 w-4"
        />
      </TableCell>
    </TableRow>
  );
}
