// Graphiques du tableau de bord -- 2026-09-24.
//
// Ecrits en SVG a la main, sans librairie : le projet n'a pas de dependance de
// graphes, et les deux formes utilisees ici (aire et entonnoir) tiennent en une
// centaine de lignes chacune. Ajouter Recharts pour cela couterait 180 ko et
// imposerait son propre langage visuel.
//
// Regles communes aux deux :
//   - aucune donnee inventee : ce qui est trace vient du serveur, et un jeu
//     vide affiche une phrase, jamais une courbe plate decorative ;
//   - la grille est horizontale seulement, en pointille tres clair : des lignes
//     verticales enferment la courbe dans un quadrillage ;
//   - la couleur ne porte jamais seule l'information : chaque serie a sa
//     legende, chaque etape son libelle et son chiffre ;
//   - le survol donne la valeur exacte, parce qu'une courbe ne se lit pas au
//     pixel pres.

import { useLayoutEffect, useRef, useState } from 'react';

/** Largeur reelle du conteneur : les graphes sont dans des colonnes de grille
 *  dont la largeur depend de la fenetre, un viewBox fixe les deformerait. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setW(e.contentRect.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return [ref, w];
}

/* ==========================================================================
   Aire : une ou deux series sur un axe de temps
   ========================================================================== */

export type Serie = {
  key:    string;
  label:  string;
  color:  string;
  values: number[];
};

/** Courbe lissee en Catmull-Rom convertie en cubiques : une polyligne droite
 *  fait « graphe d'ingenieur », une courbe en arcs de cercle sur-lisse et ment
 *  sur les valeurs intermediaires. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;

  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.2;   // tension basse : la courbe reste proche des points
    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function AreaChart({
  labels, series, height = 224, emptyLabel,
}: {
  labels:  string[];
  series:  Serie[];
  height?: number;
  emptyLabel: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [survol, setSurvol] = useState<number | null>(null);

  const vide = series.every(s => s.values.every(v => v === 0));

  // Marges : la gauche porte les valeurs de l'axe, le bas les dates.
  const mL = 34, mR = 8, mT = 12, mB = 26;
  const iw = Math.max(w - mL - mR, 10);
  const ih = height - mT - mB;

  const brut = Math.max(1, ...series.flatMap(s => s.values));
  // Plafond arrondi a un pas lisible : 7 devient 8, 23 devient 25.
  const pas = brut <= 4 ? 1 : brut <= 10 ? 2 : brut <= 25 ? 5 : brut <= 60 ? 10 : 25;
  const max = Math.ceil(brut / pas) * pas;
  // Autant de graduations que de pas entiers, plafonnees a quatre. Un minimum
  // de deux donnait « 0 / 0,5 / 1 » arrondi en « 0 / 1 / 1 » : deux graduations
  // portant la meme etiquette.
  const lignes = Math.min(4, Math.max(1, Math.round(max / pas)));

  const n = labels.length;
  const x = (i: number) => mL + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v: number) => mT + ih - (ih * v) / max;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {w > 0 && (
        <svg
          width={w} height={height} role="img"
          style={{ display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setSurvol(null)}
          onMouseMove={e => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = e.clientX - rect.left;
            const i = Math.round(((px - mL) / Math.max(iw, 1)) * (n - 1));
            setSurvol(i >= 0 && i < n ? i : null);
          }}
        >
          <defs>
            {series.map(s => (
              <linearGradient key={s.key} id={`aire-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={s.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* Grille horizontale + graduations */}
          {Array.from({ length: lignes + 1 }, (_, k) => {
            const v = (max / lignes) * k;
            return (
              <g key={k}>
                <line
                  x1={mL} x2={mL + iw} y1={y(v)} y2={y(v)}
                  stroke="var(--adj-hairline)" strokeDasharray="3 5" strokeWidth={1}
                />
                <text
                  x={mL - 9} y={y(v) + 4} textAnchor="end"
                  fontSize={12} fill="var(--adj-ink-4)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {Math.round(v)}
                </text>
              </g>
            );
          })}

          {!vide && series.map(s => {
            const pts = s.values.map((v, i) => ({ x: x(i), y: y(v) }));
            const trace = smoothPath(pts);
            return (
              <g key={s.key}>
                <path
                  d={`${trace} L${x(n - 1)},${mT + ih} L${x(0)},${mT + ih} Z`}
                  fill={`url(#aire-${s.key})`}
                />
                <path d={trace} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinecap="round" />
              </g>
            );
          })}

          {/* Repere de survol : trait vertical + points sur chaque serie */}
          {!vide && survol !== null && (
            <g>
              <line
                x1={x(survol)} x2={x(survol)} y1={mT} y2={mT + ih}
                stroke="var(--adj-edge)" strokeDasharray="3 4" strokeWidth={1}
              />
              {series.map(s => (
                <circle
                  key={s.key}
                  cx={x(survol)} cy={y(s.values[survol] ?? 0)} r={4.5}
                  fill="var(--adj-panel)" stroke={s.color} strokeWidth={2.4}
                />
              ))}
            </g>
          )}

          {/* Dates : premiere, milieu, derniere. Toutes les etiquettes se
              chevauchent des que la colonne est etroite. */}
          {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => (
            <text
              key={i}
              x={x(i)} y={height - 6}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              fontSize={12} fill="var(--adj-ink-4)"
            >
              {labels[i]}
            </text>
          ))}
        </svg>
      )}

      {vide && (
        <p style={{
          position: 'absolute', inset: 0, margin: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)',
        }}>
          {emptyLabel}
        </p>
      )}

      {/* Infobulle : posee en HTML plutot qu'en SVG, pour heriter des polices et
          des reliefs du socle. */}
      {!vide && survol !== null && w > 0 && (
        <div
          style={{
            position: 'absolute', top: 0,
            left: Math.min(Math.max(x(survol) + 12, 0), Math.max(w - 170, 0)),
            pointerEvents: 'none',
            background: 'var(--adj-panel)', border: '1px solid var(--adj-hairline)',
            borderRadius: 'var(--adj-round-s)', boxShadow: 'var(--adj-lift-2)',
            padding: '9px 11px', minWidth: 140,
          }}
        >
          <span style={{ display: 'block', fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)', marginBottom: 5 }}>
            {labels[survol]}
          </span>
          {series.map(s => (
            <span key={s.key} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-2)', lineHeight: 1.7,
            }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{s.label}</span>
              <strong className="adj-fig" style={{ color: 'var(--adj-ink)' }}>
                {s.values[survol] ?? 0}
              </strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Legende de series : pastille + libelle, alignee dans l'en-tete du panneau. */
export function Legend({ series }: { series: Serie[] }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--adj-4)', flexWrap: 'wrap' }}>
      {series.map(s => (
        <span key={s.key} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)',
        }}>
          <span aria-hidden style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
          {s.label}
        </span>
      ))}
    </span>
  );
}

/* ==========================================================================
   Entonnoir
   --------------------------------------------------------------------------
   Une etape par ligne : son rang, son libelle, une barre proportionnelle, le
   nombre atteint et la part du total. La perte par rapport a l'etape
   precedente est ecrite a droite, en rouge : c'est la seule chose qu'un
   entonnoir sert a montrer.
   ========================================================================== */

export type Step = { key: string; label: string; value: number; color: string };

export function Funnel({ steps, emptyLabel }: { steps: Step[]; emptyLabel: string }) {
  const depart = steps[0]?.value ?? 0;

  if (depart === 0) {
    return (
      <p style={{
        margin: 0, padding: 'var(--adj-8) 0', textAlign: 'center',
        fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)',
      }}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)' }}>
      {steps.map((s, i) => {
        const part = Math.round((s.value / depart) * 100);
        const precedent = i > 0 ? steps[i - 1].value : null;
        const perte = precedent && precedent > 0
          ? Math.round(((s.value - precedent) / precedent) * 100)
          : null;

        return (
          <li key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--adj-2)', minWidth: 0 }}>
              <span className="adj-fig" style={{
                color: 'var(--adj-ink-4)', fontSize: 'var(--adj-t-sm)', flexShrink: 0,
              }}>
                {i + 1}.
              </span>
              <span style={{
                flex: 1, minWidth: 0,
                fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {s.label}
              </span>
              <span className="adj-fig" style={{
                flexShrink: 0,
                fontSize: 'var(--adj-t-base)', fontWeight: 'var(--adj-w-bold)' as never,
                color: 'var(--adj-ink)',
              }}>
                {s.value}
              </span>
            </span>

            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--adj-3)' }}>
              <span aria-hidden style={{
                flex: 1, height: 8, borderRadius: 'var(--adj-round-s)',
                background: 'var(--adj-panel-2)', overflow: 'hidden', minWidth: 0,
              }}>
                <span style={{
                  display: 'block', height: '100%',
                  width: `${Math.max(part, 2)}%`,
                  background: s.color,
                  borderRadius: 'var(--adj-round-s)',
                }} />
              </span>
              <span className="adj-fig" style={{
                flexShrink: 0, width: 42, textAlign: 'right',
                fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)',
              }}>
                {part}%
              </span>
              <span className="adj-fig" style={{
                flexShrink: 0, width: 46, textAlign: 'right',
                fontSize: 'var(--adj-t-xs)',
                color: perte === null || perte === 0 ? 'var(--adj-ink-4)' : 'var(--adj-neg)',
              }}>
                {perte === null ? '' : perte === 0 ? '0%' : `${perte}%`}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
