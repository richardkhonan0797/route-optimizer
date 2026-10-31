import Image from "next/image";
export function GoogleAttribution() {
  return (
    <div className="mt-4 px-[10px] pt-[10px] pb-[5px]">
      <Image
        src="/google-maps.svg"
        alt="Google Maps"
        width={98}
        height={18}
        unoptimized
        className="h-[18px] w-auto"
      />
    </div>
  );
}
