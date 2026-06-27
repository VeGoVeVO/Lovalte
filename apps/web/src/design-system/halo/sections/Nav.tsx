import { GlassButton } from "../components/GlassButton";
import { Icon } from "../icons";
import { scrollTo } from "../lib/scrollTo";

/* sticky glass nav - verbatim from the original Halo component. */
export function Nav() {
  return (
    <header className="nav">
      <div className="container">
        <nav className="glass navbar" aria-label="Primary">
          <div className="brand">
            <span className="dot" aria-hidden="true" />
            Halo
          </div>
          <div className="navlinks">
            <a href="#features">Overview</a>
            <a href="#detail">Made of glass</a>
            <a href="#story">Story</a>
          </div>
          <div className="navcta">
            <GlassButton onClick={() => scrollTo("waitlist")}>
              Reserve <Icon.Arrow />
            </GlassButton>
          </div>
        </nav>
      </div>
    </header>
  );
}
