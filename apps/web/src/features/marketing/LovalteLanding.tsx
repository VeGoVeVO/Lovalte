import { Link } from "react-router-dom";
import { GlassCard, Reveal, haloCss } from "../../design-system/halo";

/* Lovalte marketing landing (the public front door at '/').
   Reuses the Halo glass design system (tokens + primitives) — loyalty content,
   real router-link CTAs into the app. Presentational only, no state. */

function Ico({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/* tiny static QR motif for the hero card (decorative) */
function QrMotif() {
  const cells = [
    "1110111", "1010101", "1110111", "0001000", "1101011", "1010001", "1110111",
  ];
  return (
    <svg viewBox="0 0 7 7" width="56" height="56" aria-hidden="true" shapeRendering="crispEdges">
      <rect width="7" height="7" fill="rgba(255,255,255,.9)" rx="0.6" />
      {cells.flatMap((row, y) =>
        row.split("").map((c, x) =>
          c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#20242A" /> : null
        )
      )}
    </svg>
  );
}

const FEATURES = [
  { d: "M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zm0 0l2-3h14l2 3M16 12h3", title: "Design your card",
    body: "A visual builder — colors, logo, fields and reward rules. Publish a card to Apple Wallet in minutes." },
  { d: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2",
    title: "One QR to scan", body: "Staff scan a customer's pass to award or redeem points. No app for them, no extra hardware for you." },
  { d: "M4 19V5m0 14h16M8 16V11m4 5V8m4 8v-3", title: "See what works",
    body: "A live dashboard of members, visits, redemptions and points liability — across every location." },
];

const STEPS = [
  { n: "1", title: "Build", body: "Design your loyalty card and set the reward." },
  { n: "2", title: "Share", body: "Customers add it to Apple Wallet in one tap." },
  { n: "3", title: "Grow", body: "Scan, reward, and watch repeat visits add up." },
];

export function LovalteLanding() {
  return (
    <div className="halo" style={{ minHeight: "100vh" }}>
      <style>{haloCss}</style>

      <div className="ambient" aria-hidden="true">
        <span className="blob a" /><span className="blob b" /><span className="blob c" /><span className="blob d" />
      </div>

      <div className="content">
        {/* nav */}
        <header className="nav">
          <div className="container">
            <nav className="glass navbar" aria-label="Primary">
              <span className="brand"><span className="dot" aria-hidden="true" />Lovalte</span>
              <div className="navlinks">
                <a href="#features">Product</a>
                <a href="#how">How it works</a>
                <a href="#start">Pricing</a>
              </div>
              <div className="navcta" style={{ gap: "0.9rem" }}>
                <Link to="/login" className="btn ghost">Sign in</Link>
                <Link to="/signup" className="btn">Get started</Link>
              </div>
            </nav>
          </div>
        </header>

        <main>
          {/* hero */}
          <section aria-labelledby="hero-title" style={{ paddingTop: 0 }}>
            <div className="container">
              <div className="hero-wrap">
                <div className="hero-copy">
                  <span className="eyebrow">Loyalty in Apple Wallet</span>
                  <h1 className="hero" id="hero-title">Loyalty cards your customers actually keep.</h1>
                  <p className="lead">
                    Lovalte turns paper punch cards into a beautiful pass in Apple Wallet. Design your
                    card, share one QR, and watch repeat visits grow — nothing for customers to install.
                  </p>
                  <div className="hero-actions">
                    <Link to="/signup" className="btn">Get started free</Link>
                    <a href="#how" className="btn ghost">See how it works</a>
                  </div>
                  <p className="body" style={{ marginTop: "0.4rem" }}>
                    Already a member? <Link to="/login">Sign in</Link>
                  </p>
                </div>

                {/* hero loyalty-card visual (decorative) */}
                <div className="stage" aria-hidden="true">
                  <div className="disc-glow" />
                  <div className="glass" style={{
                    position: "relative", width: "min(360px,80vw)", padding: "1.6rem",
                    borderRadius: "var(--r-hero)", display: "flex", flexDirection: "column", gap: "1.2rem",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>Café Lumière</span>
                      <span className="eyebrow" style={{ fontSize: "0.65rem" }}>Store card</span>
                    </div>
                    <div>
                      <div style={{ fontSize: "1.35rem", fontWeight: 500, letterSpacing: "-0.02em" }}>Gold member</div>
                      <div className="body" style={{ fontSize: "0.9rem" }}>Next reward in 2 visits</div>
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      {[1, 1, 1, 1, 0, 0].map((f, i) => (
                        <span key={i} style={{
                          width: 22, height: 22, borderRadius: "999px",
                          background: f ? "var(--cyan)" : "rgba(111,118,132,.18)",
                          border: "1px solid var(--border)",
                        }} />
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                      <QrMotif />
                      <span className="body" style={{ fontSize: "0.8rem", letterSpacing: "0.06em" }}>•••• 4821</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* features */}
          <section id="features" aria-labelledby="features-title">
            <div className="container">
              <Reveal className="section-head">
                <span className="eyebrow">Everything you need</span>
                <h2 className="section" id="features-title">A loyalty program your customers love.</h2>
              </Reveal>
              <Reveal className="grid-3">
                {FEATURES.map((f) => (
                  <GlassCard hover light className="feature" key={f.title}>
                    <span className="ico"><Ico d={f.d} /></span>
                    <h3 className="cardt">{f.title}</h3>
                    <p className="body">{f.body}</p>
                  </GlassCard>
                ))}
              </Reveal>
            </div>
          </section>

          {/* how it works */}
          <section id="how" aria-labelledby="how-title">
            <div className="container">
              <Reveal className="section-head">
                <span className="eyebrow">How it works</span>
                <h2 className="section" id="how-title">Live in three steps.</h2>
              </Reveal>
              <Reveal className="grid-3">
                {STEPS.map((s) => (
                  <GlassCard light className="feature" key={s.n}>
                    <span className="ico" aria-hidden="true" style={{ fontWeight: 600 }}>{s.n}</span>
                    <h3 className="cardt">{s.title}</h3>
                    <p className="body">{s.body}</p>
                  </GlassCard>
                ))}
              </Reveal>
            </div>
          </section>

          {/* CTA */}
          <section id="start" aria-labelledby="start-title" style={{ paddingTop: 0 }}>
            <div className="container">
              <Reveal>
                <GlassCard light className="waitlist">
                  <span className="eyebrow">Free to start</span>
                  <h2 className="section" id="start-title">Start your loyalty program.</h2>
                  <p className="lead" style={{ maxWidth: "42ch" }}>
                    Build your first card today. No customer app, no hardware — just a QR and Apple Wallet.
                  </p>
                  <div className="hero-actions" style={{ justifyContent: "center" }}>
                    <Link to="/signup" className="btn">Get started free</Link>
                    <Link to="/login" className="btn ghost">Sign in</Link>
                  </div>
                </GlassCard>
              </Reveal>
            </div>
          </section>
        </main>

        <footer>
          <div className="container">
            <div className="foot">
              <span className="brand"><span className="dot" aria-hidden="true" />Lovalte</span>
              <div className="links">
                <a href="#features">Product</a><a href="#how">How it works</a>
                <Link to="/login">Sign in</Link><Link to="/signup">Get started</Link>
              </div>
              <div className="copy">© 2026 Lovalte. Loyalty in Apple Wallet.</div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
