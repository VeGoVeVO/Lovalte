/* Halo design-system barrel.
   The landing page plus the reusable frosted-glass primitives + tokens, so the
   rest of the app (auth, builder, dashboard, scan) can compose on the same
   material without re-importing internals. */
export { default as HaloLanding } from "./HaloLanding";

// design tokens (inject once near the app root, or scope per surface)
export { css as haloCss } from "./styles/halo-tokens";
export { globalCss } from "./styles/global-css";

// reusable primitives
export { GlassCard } from "./components/GlassCard";
export { GlassButton } from "./components/GlassButton";
export { GlassInput } from "./components/GlassInput";
export { Modal } from "./components/Modal";
export { Reveal } from "./components/Reveal";
export { Dropdown, type DropdownOption } from "./components/Dropdown";
export { ColorPicker } from "./components/ColorPicker";
export { Scrollbar } from "./components/Scrollbar";
export { AmbientBackground } from "./components/AmbientBackground";

// hooks + utilities + icon set
export { useReveal } from "./hooks/useReveal";
export { scrollTo } from "./lib/scrollTo";
export { Icon } from "./icons";
