"use client";

export type TabDef = {
  id: string;
  label: string;
  disabled?: boolean;
  disabledHint?: string;
};

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs-list" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-label={tab.disabled && tab.disabledHint ? `${tab.label} — ${tab.disabledHint}` : undefined}
          className={`tab-button${active === tab.id ? " active" : ""}`}
          disabled={tab.disabled}
          title={tab.disabled ? tab.disabledHint : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
