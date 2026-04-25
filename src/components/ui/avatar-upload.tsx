"use client";
import { useRef } from "react";
import { Camera } from "lucide-react";
import { getInitials } from "@/lib/utils";

interface AvatarUploadProps {
  currentUrl: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  onFileSelect?: (file: File) => void;
  readonly?: boolean;
}

const SIZES = {
  sm: { wrap: "w-10 h-10", text: "text-sm",  icon: "w-3 h-3" },
  md: { wrap: "w-16 h-16", text: "text-xl",  icon: "w-4 h-4" },
  lg: { wrap: "w-20 h-20", text: "text-2xl", icon: "w-5 h-5" },
};

export function AvatarUpload({ currentUrl, name, size = "md", onFileSelect, readonly }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const s = SIZES[size];
  const clickable = !readonly && !!onFileSelect;

  return (
    <div className="relative inline-block group">
      <div
        className={`${s.wrap} rounded-full overflow-hidden bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 ${clickable ? "cursor-pointer" : ""}`}
        onClick={() => clickable && inputRef.current?.click()}
      >
        {currentUrl ? (
          <img src={currentUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className={`${s.text} font-semibold select-none`}>{getInitials(name || "?")}</span>
        )}
      </div>

      {clickable && (
        <>
          <div
            className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            <Camera className={`${s.icon} text-white`} />
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelect(file);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}
