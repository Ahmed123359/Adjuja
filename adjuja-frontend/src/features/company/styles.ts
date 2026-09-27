// Champ de saisie des sections de reglages encore ecrites en style inline
// (notifications, membres). Aligne le 2026-09-27 sur le champ du socle
// (`fieldInputStyle` de ./ui.tsx) : 44px, texte a 16px, tokens --adj-*.

export const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: "var(--adj-round-s)",
  border: "1px solid var(--adj-hairline)",
  background: "var(--adj-panel)",
  color: "var(--adj-ink)",
  fontSize: "var(--adj-t-base)",
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  transition: "border-color .15s",
};
