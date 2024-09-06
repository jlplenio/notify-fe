import Image from "next/image";
import { Button } from "./ui/button";

const KoFiButton = () => {
  const handleButtonClick = () => {
    window.open("https://ko-fi.com/W7W512ZD8I", "_blank");
  };

  return (
    <Button
      onClick={handleButtonClick}
      className="flex items-center justify-center space-x-1"
      variant="outline"
    >
      <div className="mt-0.3 relative h-12 w-12">
        <Image
          src={"/kofi_logo.png"}
          alt="KoFi Logo"
          layout="fill"
          objectFit="contain"
        />
      </div>
      <span className="pr-1">Fund Server Costs & Provide Feedback</span>
    </Button>
  );
};

export default KoFiButton;
