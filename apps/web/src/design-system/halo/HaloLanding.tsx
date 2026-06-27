import { useState, useRef, useEffect } from "react";
import { css } from "./styles/halo-tokens";
import { Ambient } from "./sections/Ambient";
import { Nav } from "./sections/Nav";
import { Hero } from "./sections/Hero";
import { Features } from "./sections/Features";
import { QuietStatement } from "./sections/QuietStatement";
import { Testimonial } from "./sections/Testimonial";
import { Waitlist } from "./sections/Waitlist";
import { Footer } from "./sections/Footer";

/* ────────────────────────────────────────────────────────────────────────
   Halo - ambient glass landing page (page composition).
   Verbatim logic from the original single-file component; only split into
   modules. This file owns the page-level state (email / joined), the hero
   disc ref, the pointer-parallax effect, and the join() handler - then
   composes the section modules under the same .halo wrapper + <style>.
   ──────────────────────────────────────────────────────────────────────── */
export default function HaloLanding() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const discRef = useRef(null);

  /* gentle pointer parallax on the hero disc - layers shift with motion */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = discRef.current;
        if (!el) return;
        el.style.transform = `translate(${nx * 26}px, ${ny * 26}px)`;
        el.style.setProperty("--gx", 50 + nx * 70 + "%");
        el.style.setProperty("--gy", 50 + ny * 70 + "%");
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const join = () => {
    if (email.trim().length > 3 && email.includes("@")) setJoined(true);
  };

  return (
    <div className="halo">
      <style>{css}</style>

      <Ambient />

      <div className="content">
        <Nav />

        <main>
          <Hero discRef={discRef} />
          <Features />
          <QuietStatement />
          <Testimonial />
          <Waitlist email={email} setEmail={setEmail} joined={joined} join={join} />
        </main>

        <Footer />
      </div>
    </div>
  );
}
