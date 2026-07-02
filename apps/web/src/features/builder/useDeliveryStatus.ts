import { useQuery } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";

/** Mirrors GetDeliveryStatusHandler's DeliveryStatusDTO (apps/api delivery context). */
export interface DeliveryStatusDTO {
  passes: number;
  registeredDevices: number;
  upToDateDevices: number;
  staleDevices: number;
  pushFailures24h: number;
  lastPushAt: string | null;
}

/**
 * Merchant-facing "did holders actually receive the update" check for one
 * template. Refetches on window focus so re-opening the tab after a push
 * shows fresh numbers without a manual reload.
 */
export function useDeliveryStatus(templateId: string, enabled = true) {
  return useQuery<DeliveryStatusDTO, ApiError>({
    queryKey: ["card-templates", templateId, "delivery-status"] as const,
    queryFn: () =>
      api.get<DeliveryStatusDTO>(`/api/v1/card-templates/${templateId}/delivery-status`),
    enabled,
    refetchOnWindowFocus: true,
  });
}
