import { useCallback, useEffect, useRef, useState } from "react";

// BarcodeDetector is a newer Web API not yet included in TypeScript's lib.dom.d.ts.
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => {
      detect(
        source: HTMLVideoElement | HTMLCanvasElement,
      ): Promise<Array<{ rawValue: string; format: string }>>;
    };
  }
}

export type ScannerStatus =
  | "idle"        // ready to start (BarcodeDetector available)
  | "requesting"  // getUserMedia in-flight
  | "scanning"    // camera live, polling for QR
  | "denied"      // permission rejected
  | "unsupported"; // BarcodeDetector or getUserMedia not available

export interface UseBarcodeScanner {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: ScannerStatus;
  detectedToken: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  clearToken: () => void;
}

export function useBarcodeScanner(): UseBarcodeScanner {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  /** Set to false to halt the scan loop without a ref-chasing closure problem. */
  const activeRef = useRef(false);

  const [status, setStatus] = useState<ScannerStatus>(() =>
    "BarcodeDetector" in window ? "idle" : "unsupported",
  );
  const [detectedToken, setDetectedToken] = useState<string | null>(null);

  /** Stop all media tracks and clear the video srcObject. Does NOT change status. */
  const stopTracks = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    activeRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  // Cleanup on unmount — stop any live camera stream.
  useEffect(() => () => stopTracks(), [stopTracks]);

  const stopCamera = useCallback(() => {
    stopTracks();
    setStatus("idle");
  }, [stopTracks]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.BarcodeDetector) {
      setStatus("unsupported");
      return;
    }

    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }

      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      activeRef.current = true;
      setStatus("scanning");

      const scanFrame = async () => {
        if (!activeRef.current) return;
        const v = videoRef.current;
        // readyState >= 2 means HAVE_CURRENT_DATA — safe to detect
        if (v && v.readyState >= 2) {
          try {
            const codes = await detector.detect(v);
            if (codes.length > 0 && codes[0].rawValue) {
              setDetectedToken(codes[0].rawValue);
              stopTracks();
              setStatus("idle");
              return; // exit loop after detection
            }
          } catch {
            // Individual frame errors are non-fatal; keep scanning.
          }
        }
        rafRef.current = requestAnimationFrame(scanFrame);
      };

      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      const name = (err as DOMException)?.name;
      stopTracks();
      setStatus(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "denied"
          : "unsupported",
      );
    }
  }, [stopTracks]);

  const clearToken = useCallback(() => {
    setDetectedToken(null);
  }, []);

  return { videoRef, status, detectedToken, startCamera, stopCamera, clearToken };
}
