import { InfoCircledIcon } from "@radix-ui/react-icons";
import { Button } from "./ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

export function InfoButton() {

    return (
        <>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="icon">
                        <InfoCircledIcon className="h-[1.2rem] w-[1.2rem] transition-all" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start">
                    <p className="text-gray-500 dark:text-gray-200 text-sm">
                        Select your region and leave the browser tab running in the background. A sound will play if stock is available. Tested on desktop browsers only. Good luck &lt;3
                    </p>
                </PopoverContent>
            </Popover >
        </>
    )
}
