import { useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
// Let Vite emit + fingerprint the decoder worker and hand us its URL.
import QrScannerWorkerPath from "qr-scanner/qr-scanner-worker.min.js?url";

// qr-scanner loads its Web Worker from WORKER_PATH (it doesn't use import.meta.url).
QrScanner.WORKER_PATH = QrScannerWorkerPath;

export type ScannerStatus =
  | "idle"        // ready to start
  | "requesting"  // camera permission in-flight
  | "scanning"    // camera live, decoding
  | "denied"      // permission rejected
  | "unsupported"; // no camera / non-secure origin

export interface UseBarcodeScanner {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: ScannerStatus;
  detectedToken: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  clearToken: () => void;
}

/**
 * Cross-browser QR scanner built on nimiq qr-scanner (Web-Worker decode, high
 * detection rate). Works on Safari/iOS, Firefox and Chrome over HTTPS — unlike
 * the old BarcodeDetector path that was unsupported almost everywhere.
 */
export function useBarcodeScanner(): UseBarcodeScanner {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [detectedToken, setDetectedToken] = useState<string | null>(null);

  // Destroy the scanner (releases the camera + worker) on unmount.
  useEffect(() => () => { scannerRef.current?.destroy(); scannerRef.current = null; }, []);

  const stopCamera = useCallback(() => {
    scannerRef.current?.stop();
    setStatus("idle");
  }, []);

  const startCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setStatus("requesting");
    try {
      if (!scannerRef.current) {
        scannerRef.current = new QrScanner(
          video,
          (result) => {
            setDetectedToken(result.data);
            scannerRef.current?.stop();
            setStatus("idle");
          },
          {
            preferredCamera: "environment",
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 5,
            returnDetailedScanResult: true,
          },
        );
      }
      await scannerRef.current.start();
      setStatus("scanning");
    } catch (err) {
      scannerRef.current?.stop();
      const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
      setStatus(/denied|notallowed|permission/i.test(msg) ? "denied" : "unsupported");
    }
  }, []);

  const clearToken = useCallback(() => setDetectedToken(null), []);

  return { videoRef, status, detectedToken, startCamera, stopCamera, clearToken };
}
