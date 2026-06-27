import { Reveal } from "../components/Reveal";
import { GlassCard } from "../components/GlassCard";
import { features } from "../content/features";

/* feature grid - verbatim from the original Halo component. */
export function Features() {
  return (
    <section id="features" aria-labelledby="features-title">
      <div className="container">
        <Reveal className="section-head">
          <span className="eyebrow">What it does</span>
          <h2 className="section" id="features-title">
            Quiet on its own. Right when you need it.
          </h2>
        </Reveal>
        <Reveal className="grid-3">
          {features.map((f) => {
            const I = f.icon;
            return (
              <GlassCard hover light className="feature" key={f.title}>
                <span className="ico">
                  <I />
                </span>
                <h3 className="cardt">{f.title}</h3>
                <p className="body">{f.body}</p>
              </GlassCard>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
