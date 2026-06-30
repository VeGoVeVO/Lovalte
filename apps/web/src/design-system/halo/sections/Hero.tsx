import type { RefObject } from "react";
import { GlassButton } from "../components/GlassButton";
import { Icon } from "../icons";
import { scrollTo } from "../lib/scrollTo";

/* hero with parallax glass disc - verbatim from the original Halo component.
   `discRef` is owned by the page composition (HaloLanding) which drives the
   pointer parallax effect; passed down so the JSX stays unchanged. */
export function Hero({ discRef }: { discRef: RefObject<HTMLDivElement> }) {
  return (
    <section aria-labelledby="hero-title" style={{ paddingTop: 0 }}>
      <div className="container">
        <div className="hero-wrap">
          <div className="hero-copy">
            <span className="eyebrow">A light, reconsidered</span>
            <h1 className="hero" id="hero-title">
              Light that knows the hour.
            </h1>
            <p className="lead">
              Halo is a single piece of glass that lights your space to match the day. It warms as
              the sun sets, quiets when the room is empty, and asks nothing of you.
            </p>
            <div className="hero-actions">
              <GlassButton onClick={() => scrollTo("waitlist")}>
                Reserve Halo <Icon.Arrow />
              </GlassButton>
              <GlassButton variant="ghost" onClick={() => scrollTo("features")}>
                <Icon.Play /> See how it works
              </GlassButton>
            </div>
          </div>

          <div className="stage" aria-hidden="true">
            <div className="disc-glow" />
            <div className="disc-parallax" ref={discRef}>
              <div className="disc">
                <span className="sheen" />
                <span className="glare" />
                <span className="core" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
