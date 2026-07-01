import { useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";

export type ScannerStatus = "idle" | "scanning" | "denied" | "unsupported";

export interface UseBarcodeScanner {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: ScannerStatus;
  detectedToken: string | null;
  /** Data URL of the auto-cropped QR (for the confirmation animation). */
  capturedImage: string | null;
  startCamera: () => Promise<void>;
  clearToken: () => void;
}

/** Crop the detected QR (its corner points + padding) into a square thumbnail. */
function cropQr(source: HTMLCanvasElement, corners: { x: number; y: number }[]): string {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  let minX = Math.min(...xs),
    maxX = Math.max(...xs);
  let minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const padX = (maxX - minX) * 0.18;
  const padY = (maxY - minY) * 0.18;
  minX = Math.max(0, minX - padX);
  minY = Math.max(0, minY - padY);
  maxX = Math.min(source.width, maxX + padX);
  maxY = Math.min(source.height, maxY + padY);
  const w = Math.max(1, maxX - minX),
    h = Math.max(1, maxY - minY);
  const out = document.createElement("canvas");
  const size = 224;
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(source, minX, minY, w, h, 0, 0, size, size);
  }
  return out.toDataURL("image/png");
}

/**
 * Reliable cross-browser QR scanner. Owns the camera at high resolution (so dense
 * pass QRs resolve) and decodes the FULL frame each tick with nimiq qr-scanner's
 * Web Worker. On a hit it auto-crops the QR for a confirmation thumbnail.
 */
export function useBarcodeScanner(): UseBarcodeScanner {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(false);
  const timerRef = useRef<number>(0);
  const detectedTokenRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ScannerStatus>(() =>
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function"
      ? "idle"
      : "unsupported",
  );
  const [detectedToken, setDetectedToken] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const stop = useCallback(() => {
    activeRef.current = false;
    window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  const startCamera = useCallback(async () => {
    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setStatus("unsupported");
      return;
    }
    if (streamRef.current && activeRef.current) {
      setStatus("scanning");
      return;
    }
    setStatus("scanning");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play();
      }
      const canvas = canvasRef.current ?? (canvasRef.current = document.createElement("canvas"));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      activeRef.current = true;
      setStatus("scanning");

      const tick = async () => {
        if (!activeRef.current) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && ctx && v.videoWidth) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          try {
            const res = await QrScanner.scanImage(canvas, { returnDetailedScanResult: true });
            if (detectedTokenRef.current !== res.data) {
              detectedTokenRef.current = res.data;
              setCapturedImage(cropQr(canvas, res.cornerPoints));
              setDetectedToken(res.data);
            }
          } catch {
            /* no QR in this frame - keep scanning */
          }
        }
        timerRef.current = window.setTimeout(tick, 110); // ~9 scans/sec
      };
      void tick();
    } catch (err) {
      stop();
      const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
      setStatus(/denied|notallowed|permission/i.test(msg) ? "denied" : "unsupported");
    }
  }, [stop]);

  const clearToken = useCallback(() => {
    detectedTokenRef.current = null;
    setDetectedToken(null);
    setCapturedImage(null);
  }, []);

  return { videoRef, status, detectedToken, capturedImage, startCamera, clearToken };
}
