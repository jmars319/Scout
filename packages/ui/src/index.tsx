import type { CSSProperties, PropsWithChildren, ReactNode } from "react";

const panelStyle: CSSProperties = {
  background: "rgba(255, 255, 255, 0.82)",
  border: "1px solid rgba(15, 23, 42, 0.1)",
  borderRadius: "20px",
  padding: "1.25rem",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.08)"
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
              color: "#0f766e",
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
              <p style={{ margin: "1rem 0 0", color: "#334155", fontSize: "1.02rem", lineHeight: 1.6 }}>
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
        <p style={{ marginTop: 0, marginBottom: "1rem", color: "#475569", lineHeight: 1.55 }}>{description}</p>
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
    tone === "good" ? "#166534" : tone === "warn" ? "#9a3412" : "#0f172a";
  const background =
    tone === "good" ? "rgba(34, 197, 94, 0.12)" : tone === "warn" ? "rgba(249, 115, 22, 0.12)" : "rgba(15, 23, 42, 0.05)";

  return (
    <div style={{ ...panelStyle, padding: "1rem", background }}>
      <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569" }}>
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
    neutral: { background: "rgba(15, 23, 42, 0.08)", color: "#0f172a" },
    good: { background: "rgba(34, 197, 94, 0.12)", color: "#166534" },
    warn: { background: "rgba(249, 115, 22, 0.14)", color: "#9a3412" },
    danger: { background: "rgba(239, 68, 68, 0.12)", color: "#991b1b" }
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
