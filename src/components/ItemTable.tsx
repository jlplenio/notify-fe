import { TableHead, TableRow, TableHeader, TableBody, Table } from "@/components/ui/table"
import type { GpuCard } from "./types/gpuInterface"
import ItemRow from "./ItemRow"

export default function Component({ gpuCards }: { gpuCards: GpuCard[] }) {
    return (
        <>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-center">Stock Availability</TableHead>
                        <TableHead>Shop Link</TableHead>
                        <TableHead>Nvidia Link</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {gpuCards.map((gpuCard: GpuCard) => (
                        <ItemRow key={gpuCard.name} gpuCard={gpuCard} />
                    ))}
                </TableBody>
            </Table>
        </>
    )
}
