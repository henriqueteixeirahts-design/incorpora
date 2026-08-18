import type { CSSProperties } from "react";
import type { MirrorSummary } from "@/server/dashboard";

export function MirrorSummaryGrid({ summary }: { summary: MirrorSummary }) {
  return (
    <>
      <div
        className="inc-mirror"
        style={{ "--inc-mirror-cols": summary.maxCols } as CSSProperties}
      >
        {summary.floors.map((floor) => (
          <div className="inc-mirror__row" key={floor.label}>
            <div className="inc-mirror__floor">{floor.label}</div>
            <div className="inc-mirror__cols">
              {floor.units.map((unit) => (
                <div key={unit.id} className={`inc-unit inc-unit--${unit.bucket}`}>
                  <div className="inc-unit__n">{unit.number}</div>
                  {unit.area !== null ? <div className="inc-unit__area">{unit.area} m²</div> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="inc-legend" style={{ marginTop: "16px" }}>
        {summary.legend.map((item) => (
          <div className="inc-legend__item" key={item.bucket}>
            <span className={`inc-legend__swatch inc-unit--${item.bucket}`} />
            {item.label} {item.count}
          </div>
        ))}
      </div>
    </>
  );
}
