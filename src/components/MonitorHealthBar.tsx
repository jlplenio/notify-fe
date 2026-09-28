import { useId } from "react";
import { Info } from "lucide-react";
import type { MonitorView } from "~/hooks/useMonitor";
import { monitorHealthPercent } from "~/lib/realtime/health";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import styles from "~/styles/monitor.module.css";

export function MonitorHealthBar({ monitor }: { monitor: MonitorView }) {
  const percent = monitorHealthPercent(monitor);
  const valueId = useId();
  const tone =
    percent === null
      ? "waiting"
      : percent === 100
        ? "full"
        : percent >= 50
          ? "partial"
          : "low";
  return (
    <div
      className={styles.healthCapacity}
      data-tone={tone}
      data-testid="monitor-health-bar"
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`${styles.healthCapacityLabel} ${styles.healthInfoButton}`}
            aria-label="About Monitor Health"
            aria-describedby={valueId}
          >
            <span>Monitor Health</span>
            <span
              id={valueId}
              className={styles.healthCapacityValue}
              data-testid="monitor-health-value"
            >
              {percent === null ? "Waiting" : `${percent}%`}
            </span>
            <Info size={12} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className={styles.catalogPopover}
          side="bottom"
          align="end"
          collisionPadding={12}
          aria-label="About Monitor Health"
        >
          <p className={styles.catalogPopoverTitle}>About Monitor Health</p>
          <p>
            We use proxy connections to keep an eye on stock. When they’re
            temporarily blocked or unavailable, checks can slow down while we
            retry automatically.
          </p>
          <p className={styles.healthInfoSupport}>
            Want to help keep the checks running? Donations through the Say
            thanks button below are always appreciated.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
