/** Shared client-side image limits — mirror the server's CardImage domain rules. */
export const ALLOWED_UPLOAD_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
