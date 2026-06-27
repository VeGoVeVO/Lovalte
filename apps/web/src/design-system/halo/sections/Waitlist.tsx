import { Reveal } from "../components/Reveal";
import { GlassCard } from "../components/GlassCard";
import { GlassInput } from "../components/GlassInput";
import { GlassButton } from "../components/GlassButton";
import { Icon } from "../icons";

/* waitlist capture - verbatim from the original Halo component.
   `email`, `setEmail`, `joined`, `join` are owned by the page composition
   (HaloLanding) and passed down so the form JSX stays unchanged. */
export function Waitlist({ email, setEmail, joined, join }) {
  return (
    <section id="waitlist" aria-labelledby="waitlist-title" style={{ paddingTop: 0 }}>
      <div className="container">
        <Reveal>
          <GlassCard light className="waitlist">
            <span className="eyebrow">Limited first run</span>
            <h2 className="section" id="waitlist-title">Be among the first.</h2>
            <p className="lead" style={{ maxWidth: "40ch" }}>
              Reservations open this autumn. Leave your email and we’ll hold your
              place - one note, no noise.
            </p>
            {joined ? (
              <div className="thanks" role="status">
                <span className="check"><Icon.Check /></span>
                You’re on the list. We’ll be in touch.
              </div>
            ) : (
              <div className="waitform">
                <GlassInput
                  type="email"
                  inputMode="email"
                  aria-label="Email address"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && join()}
                />
                <GlassButton onClick={join}>
                  Join the list <Icon.Arrow />
                </GlassButton>
              </div>
            )}
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}
