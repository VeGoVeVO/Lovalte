import { useMutation } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import { ALLOWED_UPLOAD_TYPES, MAX_IMAGE_BYTES } from "./imageConstants";

export interface StoredImageDTO {
  id: string;
  url: string;
  kind: "icon" | "logo" | "strip" | "generic";
  contentType: string;
  byteSize: number;
}

export interface UploadImageVars {
  kind: "icon" | "logo" | "strip" | "generic";
  source?: "upload" | "lucide";
  dataUrl: string;
}

/** Read a File into a base64 data URL (data:<mime>;base64,<...>). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/** Client-side guard mirroring the server's domain validation (fast UX feedback). */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    return "Use a PNG, JPEG, WebP, GIF, or SVG image (converted to PNG automatically).";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 2 MB or smaller.";
  }
  return null;
}

/** Store an image in the card-image DB; returns its public `/api/v1/images/:id` ref. */
export function useUploadImage() {
  return useMutation<StoredImageDTO, ApiError, UploadImageVars>({
    mutationFn: (body) => api.post<StoredImageDTO>("/api/v1/images", body),
  });
}
