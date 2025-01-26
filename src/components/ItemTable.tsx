import {
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  Table,
} from "@/components/ui/table";
import type { GpuCard } from "./types/gpuInterface";
import ItemRow from "./ItemRow";

export default function Component({ gpuCards }: { gpuCards: GpuCard[] }) {
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
            <ItemRow key={gpuCard.name} gpuCard={gpuCard} />
          ))}
        </TableBody>
      </Table>
    </>
  );
}
