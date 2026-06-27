import { Reveal } from "../components/Reveal";
import { GlassCard } from "../components/GlassCard";

/* quiet statement + meta row — verbatim from the original Halo component. */
export function QuietStatement() {
  return (
    <section id="detail" aria-labelledby="detail-title">
      <Reveal className="container quiet">
        <span className="eyebrow">The idea</span>
        <h2 className="section" id="detail-title">
          Designed to be felt, not noticed.
        </h2>
        <p className="lead">
          Most lights demand attention — a switch, a setting, a glare. Halo was
          built to recede. The effort went into the parts you never see.
        </p>
        <div className="meta-row">
          <GlassCard hover light className="meta">
            <div className="n">0</div>
            <div className="l">buttons or dials</div>
          </GlassCard>
          <GlassCard hover light className="meta">
            <div className="n">2,200–6,500K</div>
            <div className="l">tunable warmth</div>
          </GlassCard>
          <GlassCard hover light className="meta">
            <div className="n">14 hrs</div>
            <div className="l">on a quiet charge</div>
          </GlassCard>
        </div>
      </Reveal>
    </section>
  );
}
