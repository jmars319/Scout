import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

const panelStyle: CSSProperties = {
  background: "var(--surface-strong)",
  border: "1px solid var(--line)",
  borderRadius: "20px",
  minWidth: 0,
  padding: "1.25rem",
  boxShadow: "var(--panel-shadow)"
};

export function AppFrame({
  title,
  description,
  children,
  eyebrow,
  actions
}: PropsWithChildren<{
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}>) {
  return (
    <main style={{ maxWidth: "1120px", margin: "0 auto", padding: "2.5rem 1.25rem 4rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        {eyebrow ? (
          <div
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--accent)",
              marginBottom: "0.75rem"
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
            flexWrap: "wrap"
          }}
        >
          <div style={{ maxWidth: "50rem" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 3.8rem)", lineHeight: 1.04 }}>
              {title}
            </h1>
            {description ? (
              <p
                style={{
                  margin: "1rem 0 0",
                  color: "var(--muted)",
                  fontSize: "1.02rem",
                  lineHeight: 1.6
                }}
              >
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </div>
      </header>
      {children}
    </main>
  );
}

export function Panel({
  title,
  description,
  children
}: PropsWithChildren<{ title?: string; description?: string }>) {
  return (
    <section style={panelStyle}>
      {title ? <h2 style={{ marginTop: 0, marginBottom: "0.5rem", fontSize: "1.1rem" }}>{title}</h2> : null}
      {description ? (
        <p
          style={{
            marginTop: 0,
            marginBottom: "1rem",
            color: "var(--muted)",
            lineHeight: 1.55
          }}
        >
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}

export function MetricGrid({ children }: PropsWithChildren) {
  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
      }}
    >
      {children}
    </div>
  );
}

export function Metric({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: "neutral" | "good" | "warn"; }) {
  const color =
    tone === "good"
      ? "var(--tone-good-ink)"
      : tone === "warn"
        ? "var(--tone-warn-ink)"
        : "var(--tone-neutral-ink)";
  const background =
    tone === "good"
      ? "var(--tone-good-bg)"
      : tone === "warn"
        ? "var(--tone-warn-bg)"
        : "var(--metric-neutral-bg)";

  return (
    <div style={{ ...panelStyle, padding: "1rem", background }}>
      <div
        style={{
          fontSize: "0.8rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--muted)"
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: "0.35rem", fontSize: "1.7rem", fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export function Tag({
  children,
  tone = "neutral"
}: PropsWithChildren<{ tone?: "neutral" | "good" | "warn" | "danger" }>) {
  const styles: Record<string, CSSProperties> = {
    neutral: { background: "var(--tone-neutral-bg)", color: "var(--tone-neutral-ink)" },
    good: { background: "var(--tone-good-bg)", color: "var(--tone-good-ink)" },
    warn: { background: "var(--tone-warn-bg)", color: "var(--tone-warn-ink)" },
    danger: { background: "var(--tone-danger-bg)", color: "var(--tone-danger-ink)" }
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        borderRadius: "999px",
        padding: "0.32rem 0.7rem",
        fontSize: "0.84rem",
        fontWeight: 600,
        ...styles[tone]
      }}
    >
      {children}
    </span>
  );
}
