import { useT } from "../../lib/i18n";
import { useDeliveryStatus } from "./useDeliveryStatus";

/**
 * Compact "did holders receive the update" strip for a published card:
 * pass/device counts on one line, push failures + last push time (subdued)
 * on a second. Loading shows a skeleton bar; errors and the zero-passes case
 * degrade to a single quiet line rather than blocking the card. CSS lives in
 * BuilderPage's shared stylesheet (.lvt-delivery-status*) so it isn't
 * duplicated once per card in the rail.
 */
export function DeliveryStatusPanel({ templateId }: { templateId: string }) {
  const { t } = useT();
  const { data, isLoading, isError } = useDeliveryStatus(templateId);

  if (isLoading) {
    return (
      <div className="lvt-delivery-status" aria-busy="true" aria-live="polite">
        <span className="lvt-delivery-status-skel" aria-label={t("Checking delivery status…")} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="lvt-delivery-status">
        <span className="lvt-delivery-status-sub" role="alert">
          {t("Delivery status unavailable")}
        </span>
      </div>
    );
  }

  if (data.passes === 0) {
    return (
      <div className="lvt-delivery-status">
        <span className="lvt-delivery-status-sub">{t("No passes issued yet")}</span>
      </div>
    );
  }

  return (
    <div className="lvt-delivery-status" aria-live="polite">
      <span className="lvt-delivery-status-line">
        {t("{passes} passes · {devices} devices · {upToDate} up to date · {stale} stale", {
          passes: data.passes,
          devices: data.registeredDevices,
          upToDate: data.upToDateDevices,
          stale: data.staleDevices,
        })}
      </span>
      <span className="lvt-delivery-status-sub">
        {data.pushFailures24h > 0
          ? t("{count} push failures (24h)", { count: data.pushFailures24h })
          : t("No push failures (24h)")}
        {data.lastPushAt
          ? ` · ${t("Last push {time}", { time: new Date(data.lastPushAt).toLocaleString() })}`
          : ""}
      </span>
    </div>
  );
}
