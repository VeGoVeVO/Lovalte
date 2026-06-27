/**
 * App-wide ambient background: slow drifting pastel orbs on a soft dot grid.
 * Fixed behind all content (z-index -1), pointer-events none. Surfaces above
 * are transparent / translucent (Halo glass) so this shows through. Motion is
 * disabled under prefers-reduced-motion.
 */
export function AmbientBackground() {
  return (
    <>
      <style>{`
        @keyframes lvtDrift1 { 0%{transform:translate(0,0) scale(1) rotate(0deg)} 33%{transform:translate(4vw,-4vh) scale(1.05) rotate(2deg)} 66%{transform:translate(-3vw,3vh) scale(.95) rotate(-1deg)} 100%{transform:translate(0,0) scale(1) rotate(0deg)} }
        @keyframes lvtDrift2 { 0%{transform:translate(0,0) scale(1) rotate(0deg)} 33%{transform:translate(-3vw,5vh) scale(1.08) rotate(-2deg)} 66%{transform:translate(4vw,-3vh) scale(.92) rotate(1deg)} 100%{transform:translate(0,0) scale(1) rotate(0deg)} }
        @keyframes lvtDrift3 { 0%{transform:translate(0,0) scale(1)} 50%{transform:translate(6vw,2vh) scale(1.03)} 100%{transform:translate(0,0) scale(1)} }
        .lvt-orb{ position:absolute; border-radius:50%; will-change:transform; }
        @media (prefers-reduced-motion: reduce){ .lvt-orb{ animation:none !important; } }
      `}</style>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, overflow: "hidden", pointerEvents: "none" }}>
        <div className="lvt-orb" style={{ top: "-15%", left: "-10%", width: "60vw", height: "60vw", background: "#A9F5FF", opacity: 0.45, filter: "blur(120px)", mixBlendMode: "multiply", animation: "lvtDrift1 35s ease-in-out infinite" }} />
        <div className="lvt-orb" style={{ top: "10%", right: "-15%", width: "55vw", height: "55vw", background: "#FFDDF4", opacity: 0.45, filter: "blur(140px)", mixBlendMode: "multiply", animation: "lvtDrift2 42s ease-in-out infinite" }} />
        <div className="lvt-orb" style={{ bottom: "-25%", left: "5%", width: "70vw", height: "70vw", background: "#E5D8FF", opacity: 0.45, filter: "blur(160px)", mixBlendMode: "multiply", animation: "lvtDrift1 48s ease-in-out infinite reverse" }} />
        <div className="lvt-orb" style={{ top: "30%", left: "25%", width: "55vw", height: "55vw", background: "#C8EEFF", opacity: 0.35, filter: "blur(130px)", animation: "lvtDrift3 30s ease-in-out infinite alternate" }} />
      </div>
    </>
  );
}
