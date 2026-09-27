import { useId } from "react";

/* Orbites : trois ellipses inclinees, une « lune » par orbite. Le mouvement
   passe par <animateMotion> : le point suit l'ellipse sans etre aplati, ce
   qu'une rotation CSS dans un plan ecrase ne permet pas. Avec « reduire les
   animations », les lunes ralentissent (meme choix que la bande des logos). */
const ORBITES = [
  { rx: 560, ry: 150, dur: 46, couleur: "var(--l-blue-soft)", r: 5, depart: 0 },
  { rx: 420, ry: 112, dur: 34, couleur: "var(--l-teal)", r: 4, depart: 0.45 },
  { rx: 290, ry: 78, dur: 24, couleur: "#ffffff", r: 3.5, depart: 0.8 },
];

export default function Orbites({ className = "" }: { className?: string }) {
  const lent = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const halo = useId();
  const cx = 600, cy = 220;
  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 440"
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <defs>
        <radialGradient id={halo} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2B79E8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2B79E8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={cx} cy={cy} rx="420" ry="190" fill={`url(#${halo})`} />
      <g transform={`rotate(-7 ${cx} ${cy})`}>
        {ORBITES.map((o, i) => {
          const chemin = `M${cx - o.rx},${cy} A${o.rx},${o.ry} 0 1,1 ${cx + o.rx},${cy} A${o.rx},${o.ry} 0 1,1 ${cx - o.rx},${cy}`;
          const dur = (lent ? o.dur * 3 : o.dur) + "s";
          return (
            <g key={o.rx}>
              <ellipse
                cx={cx} cy={cy} rx={o.rx} ry={o.ry}
                fill="none"
                stroke="rgba(143,187,255,0.16)"
                strokeWidth="1"
                strokeDasharray={i === 1 ? "3 7" : undefined}
              />
              <g>
                <circle r={o.r * 3.2} fill={o.couleur} opacity="0.16" />
                <circle r={o.r} fill={o.couleur} />
                <animateMotion
                  dur={dur}
                  repeatCount="indefinite"
                  path={chemin}
                  begin={`-${(o.depart * (lent ? o.dur * 3 : o.dur)).toFixed(1)}s`}
                />
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
