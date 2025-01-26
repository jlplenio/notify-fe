import React, { useEffect } from "react";
import { TableCell, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { ShoppingCart } from "lucide-react";
import type { GpuCard } from "./types/gpuInterface";
import { playSound } from "./Beeper";

function ItemRow({ gpuCard }: { gpuCard: GpuCard }) {
  const nvidiaBaseUrl = `https://store.nvidia.com/${gpuCard.locale}/geforce/store/?page=1&limit=3&locale=${gpuCard.locale}&gpu=RTX%204090,RTX%204070%20SUPER,RTX%204080%20SUPER&manufacturer=NVIDIA`;

  useEffect(() => {
    if (gpuCard.available) {
      console.log("GPU available:", gpuCard.name);
      playSound();
    }
  }, [gpuCard.available, gpuCard.name]);

  return (
    <TableRow>
      <TableCell className="align-middle">{gpuCard.name}</TableCell>
      <TableCell className="justify-center text-center">
        <Badge
          className={`h-6 w-6 align-middle ${gpuCard.api_reachable ? "bg-green-500" : "bg-red-500"}`}
          variant="outline"
        />
      </TableCell>
      <TableCell className="justify-center text-center">
        <Badge
          className={`h-6 w-6 align-middle ${gpuCard.available ? "bg-green-500" : "bg-red-500"}`}
          variant="outline"
        />
      </TableCell>
      <TableCell className="justify-center text-center">
        {gpuCard.available && (
          <a
            href={gpuCard.product_url ? gpuCard.product_url : nvidiaBaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex align-middle"
          >
            <ShoppingCart size={24} color="currentColor" />
          </a>
        )}
      </TableCell>
      <TableCell className="text-center">
        {gpuCard.available && (
          <a
            href={nvidiaBaseUrl ?? ""}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex align-middle"
          >
            <ShoppingCart size={24} color="currentColor" />
          </a>
        )}
      </TableCell>
    </TableRow>
  );
}

export default ItemRow;
