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
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-center">API Status</TableHead>
            <TableHead className="text-center">In Stock</TableHead>
            <TableHead className="text-center">Shop Link</TableHead>
            <TableHead className="text-center">Nvidia Link</TableHead>
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
