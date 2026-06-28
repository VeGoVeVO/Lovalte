import { Reveal } from "../components/Reveal";
import { GlassCard } from "../components/GlassCard";

/* testimonial quote - verbatim from the original Halo component. */
export function Testimonial() {
  return (
    <section id="story" aria-labelledby="story-title">
      <div className="container">
        <Reveal>
          <GlassCard light className="quote">
            <p id="story-title">
              “It’s the first object in my home I stopped thinking about. By the second evening it
              just felt like the room had always known when to soften.”
            </p>
            <div className="who">Mara Eldridge · early access</div>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}
