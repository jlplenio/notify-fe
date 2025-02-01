import {
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  Table,
} from "@/components/ui/table";
import type { GpuCard } from "./types/gpuInterface";
import ItemRow from "./ItemRow";

interface ItemTableProps {
  gpuCards: GpuCard[];
  onToggleIncluded: (cardName: string, newValue: boolean) => void;
}

export default function Component({
  gpuCards,
  onToggleIncluded,
}: ItemTableProps) {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="">
            <TableHead className="max-[500px]:text-[90%]">Item</TableHead>
            <TableHead className="text-center max-[500px]:text-[90%]">
              API Status
            </TableHead>
            <TableHead className="text-center max-[500px]:text-[90%]">
              In Stock
            </TableHead>
            <TableHead className="text-center max-[500px]:text-[90%]">
              Shop Link{" "}
            </TableHead>
            <TableHead className="text-center max-[500px]:text-[90%]">
              Nvidia Link
            </TableHead>
            <TableHead className="w-[50px] text-center max-[500px]:text-[90%]">
              🔔
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {gpuCards.map((gpuCard: GpuCard) => (
            <ItemRow
              key={gpuCard.name}
              gpuCard={gpuCard}
              onToggleIncluded={onToggleIncluded}
            />
          ))}
        </TableBody>
      </Table>
    </>
  );
}
