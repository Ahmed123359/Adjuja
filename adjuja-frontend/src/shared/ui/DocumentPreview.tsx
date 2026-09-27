// Aperçu de document -- 2026-09-26, déplacé dans le socle le 2026-09-27.
//
// Première brique de `context/feature-spec/preview-documents-ocr/` : afficher un
// document dans l'application. Vit dans `shared/ui` et non dans `features/ao` :
// les outils produisent aussi des PDF (signés, paraphés, remplis), et « voir
// avant de télécharger » vaut pour tous. Jusqu'ici un CPS ne pouvait qu'être téléchargé,
// donc lu hors de l'outil, dans un autre logiciel, sans rien de ce que
// l'application sait de lui.
//
// **Défilement continu** : les pages s'enchaînent dans un même défilement, comme
// dans un lecteur PDF. La navigation page à page reste -- elle sert à sauter
// loin dans un CPS de soixante pages -- mais elle ne gouverne plus l'affichage :
// elle fait défiler jusqu'à la page, et le compteur suit ce qu'on regarde.
// Lire un marché, c'est parcourir des articles qui enjambent les pages ; obliger
// à cliquer « suivant » à chaque fois revenait à découper cette lecture.
//
// **Rendu à la demande.** Les pages se dessinent quand elles approchent de
// l'écran, pas toutes au chargement : un CPS de deux cents pages rendues d'un
// coup bloquerait l'onglet. Chaque page réserve d'emblée sa taille réelle, donc
// la barre de défilement est juste dès la première seconde et ne saute pas.
//
// Rendu avec `pdfjs-dist`, **déjà dans les dépendances** (6.0.227) : la question
// ouverte de la spec (« react-pdf, pdf.js direct, autre ? ») se tranche sans
// rien installer. pdf.js direct, aussi parce que les briques 2 et 3 (surlignage
// d'un passage, saut vers une citation) ont besoin de la couche de texte et des
// positions, que `react-pdf` masque derrière son API.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft, ChevronRight, Download, Loader2, ZoomIn, ZoomOut,
} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Le worker est servi depuis le paquet local plutôt qu'un CDN : l'application
// tourne derrière nginx en prod, et dépendre d'un CDN ferait échouer l'aperçu
// sur un réseau fermé -- exactement le cas d'un service public.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_PAS = 0.25;

/** Nombre de pages gardées dessinées de part et d'autre de la page courante.
 *  Au-delà, le canevas est vidé : vingt pages A4 en mémoire à 2x représentent
 *  plusieurs centaines de Mo, et le navigateur finit par ralentir. */
const MARGE_RENDU = 2;

type Taille = { largeur: number; hauteur: number };

export function DocumentPreview({
  url, nomFichier,
}: {
  /** URL présignée du document. Vaut null tant qu'elle n'est pas obtenue. */
  url: string | null;
  nomFichier: string;
}) {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [tailles, setTailles] = useState<Taille[]>([]);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const zone = useRef<HTMLDivElement>(null);
  const pages = useRef<(HTMLDivElement | null)[]>([]);
  const canevas = useRef<(HTMLCanvasElement | null)[]>([]);
  const couches = useRef<(HTMLDivElement | null)[]>([]);
  /** Pages déjà dessinées, et rendus en vol -- pdf.js refuse deux rendus
   *  simultanés sur le même canevas, et le défilement en déclenche vite deux. */
  const dessinees = useRef<Set<number>>(new Set());
  const enVol = useRef<Map<number, { cancel: () => void }>>(new Map());
  /** Vrai pendant un défilement programmé (bouton page) : l'observateur ne doit
   *  pas alors corriger le numéro de page en cours de route. */
  const saut = useRef(false);

  /* ------------------------------------------------------------ ouverture */

  useEffect(() => {
    if (!url) return;
    let vivant = true;
    setChargement(true);
    setErreur(null);
    dessinees.current.clear();

    const tache = pdfjs.getDocument({ url });
    tache.promise
      .then(async d => {
        if (!vivant) return;
        // Les dimensions de chaque page sont lues d'emblée : elles coûtent une
        // lecture d'en-tête, pas un rendu, et permettent de réserver la hauteur
        // exacte du document avant d'avoir dessiné quoi que ce soit.
        const mesures: Taille[] = [];
        for (let i = 1; i <= d.numPages; i++) {
          const v = (await d.getPage(i)).getViewport({ scale: 1 });
          mesures.push({ largeur: v.width, hauteur: v.height });
        }
        if (!vivant) return;
        setTailles(mesures);
        setDoc(d);
        setPage(1);
      })
      .catch((e: unknown) => {
        if (!vivant) return;
        // Cause la plus probable : le navigateur n'a pas pu lire l'URL
        // présignée (CORS sur MinIO, ou lien expiré au bout de 15 minutes).
        setErreur(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (vivant) setChargement(false); });

    return () => {
      vivant = false;
      for (const r of enVol.current.values()) r.cancel();
      enVol.current.clear();
      tache.destroy().catch(() => { /* deja detruit */ });
    };
  }, [url]);

  /* --------------------------------------------------------------- echelle */

  const [largeurZone, setLargeurZone] = useState(0);
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    setLargeurZone(el.clientWidth);
    const obs = new ResizeObserver(e => { for (const x of e) setLargeurZone(x.contentRect.width); });
    obs.observe(el);
    return () => obs.disconnect();
  }, [doc]);

  // Ajustée à la largeur disponible puis multipliée par le zoom : un A4 rendu à
  // l'échelle 1 est trop étroit sur un écran large et déborde sur un étroit.
  const echelle = tailles.length && largeurZone
    ? ((largeurZone - 48) / tailles[0].largeur) * zoom
    : zoom;

  /* ----------------------------------------------------------------- rendu */

  const dessiner = useCallback(async (n: number) => {
    if (!doc || dessinees.current.has(n) || enVol.current.has(n)) return;
    const c = canevas.current[n - 1];
    if (!c) return;

    const p = await doc.getPage(n);
    const vue = p.getViewport({ scale: echelle });
    const ctx = c.getContext('2d');
    if (!ctx) return;

    // Le rendu suit la densité de l'écran : à 1x un CPS est flou, donc illisible.
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(vue.width * dpr);
    c.height = Math.floor(vue.height * dpr);
    c.style.width = `${Math.floor(vue.width)}px`;
    c.style.height = `${Math.floor(vue.height)}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tache = p.render({ canvasContext: ctx, viewport: vue, canvas: c });
    enVol.current.set(n, tache);
    try {
      await tache.promise;
      dessinees.current.add(n);
    } catch {
      return;   // rendu annule : ce n'est pas une erreur
    } finally {
      enVol.current.delete(n);
    }

    // Couche de texte : elle rend le document sélectionnable et trouvable par
    // Ctrl+F, et c'est elle qui portera le surlignage des briques suivantes.
    const couche = couches.current[n - 1];
    if (couche) {
      couche.replaceChildren();
      couche.style.width = `${Math.floor(vue.width)}px`;
      couche.style.height = `${Math.floor(vue.height)}px`;
      try {
        const contenu = await p.getTextContent();
        await new pdfjs.TextLayer({ textContentSource: contenu, container: couche, viewport: vue }).render();
      } catch {
        // Page scannée : pas de texte numérique. L'aperçu reste valable, c'est
        // l'OCR de la brique 3 qui la traitera.
      }
    }
  }, [doc, echelle]);

  /** Vide les pages éloignées : le document reste navigable, la mémoire pas. */
  const liberer = useCallback((courante: number) => {
    for (const n of [...dessinees.current]) {
      if (Math.abs(n - courante) <= MARGE_RENDU + 1) continue;
      const c = canevas.current[n - 1];
      if (c) { c.width = 0; c.height = 0; }
      couches.current[n - 1]?.replaceChildren();
      dessinees.current.delete(n);
    }
  }, []);

  // Changer de zoom invalide tout ce qui est dessiné : les canevas portent
  // l'ancienne échelle.
  useEffect(() => {
    for (const r of enVol.current.values()) r.cancel();
    enVol.current.clear();
    dessinees.current.clear();
    for (const c of canevas.current) { if (c) { c.width = 0; c.height = 0; } }
  }, [echelle]);

  /* ------------------------------------------------ pages visibles, page courante */

  useEffect(() => {
    if (!doc || !zone.current) return;

    const obs = new IntersectionObserver(
      entrees => {
        for (const e of entrees) {
          const n = Number((e.target as HTMLElement).dataset.page);
          if (!n) continue;
          if (e.isIntersecting) {
            for (let k = n - MARGE_RENDU; k <= n + MARGE_RENDU; k++) {
              if (k >= 1 && k <= doc.numPages) dessiner(k);
            }
            // La page courante est celle qui occupe le plus l'écran.
            if (!saut.current && e.intersectionRatio > 0.5) {
              setPage(n);
              liberer(n);
            }
          }
        }
      },
      // La marge fait démarrer le rendu avant que la page n'entre à l'écran :
      // sans elle on voit une page blanche se remplir en défilant.
      { root: zone.current, rootMargin: '300px 0px', threshold: [0, 0.5, 1] },
    );

    for (const el of pages.current) if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [doc, dessiner, liberer]);

  const allerA = (n: number) => {
    const cible = pages.current[n - 1];
    if (!cible) return;
    saut.current = true;
    setPage(n);
    cible.scrollIntoView({ block: 'start', behavior: 'smooth' });
    // Le temps que le défilement doux se termine : pendant ce trajet,
    // l'observateur traverse les pages intermédiaires et corrigerait le
    // compteur vers elles.
    window.setTimeout(() => { saut.current = false; }, 700);
  };

  /* ----------------------------------------------------------------- rendu */

  const total = doc?.numPages ?? 0;

  const bouton: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, flexShrink: 0,
    borderRadius: 'var(--adj-round-s)',
    border: '1px solid var(--adj-hairline)',
    background: 'var(--adj-panel)', color: 'var(--adj-ink-2)',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--adj-3)', minHeight: 0, height: '72vh' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--adj-2)', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <button
          type="button" style={bouton} className="adj-focusable"
          onClick={() => allerA(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label={t('pipeline.preview.prevPage')}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <span className="adj-fig" style={{
          fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)', minWidth: 86, textAlign: 'center',
        }}>
          {total ? t('pipeline.preview.pageOf', { page, total }) : '—'}
        </span>
        <button
          type="button" style={bouton} className="adj-focusable"
          onClick={() => allerA(Math.min(total || 1, page + 1))}
          disabled={!total || page >= total}
          aria-label={t('pipeline.preview.nextPage')}
        >
          <ChevronRight size={16} strokeWidth={2} />
        </button>

        <span style={{ flex: 1 }} />

        <button
          type="button" style={bouton} className="adj-focusable"
          onClick={() => setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_PAS))}
          disabled={zoom <= ZOOM_MIN}
          aria-label={t('pipeline.preview.zoomOut')}
        >
          <ZoomOut size={16} strokeWidth={2} />
        </button>
        <span className="adj-fig" style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)', minWidth: 44, textAlign: 'center' }}>
          {Math.round(zoom * 100)}&nbsp;%
        </span>
        <button
          type="button" style={bouton} className="adj-focusable"
          onClick={() => setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_PAS))}
          disabled={zoom >= ZOOM_MAX}
          aria-label={t('pipeline.preview.zoomIn')}
        >
          <ZoomIn size={16} strokeWidth={2} />
        </button>

        {url && (
          <a
            href={url} download={nomFichier} target="_blank" rel="noreferrer"
            style={{ ...bouton, textDecoration: 'none' }}
            className="adj-focusable"
            aria-label={t('pipeline.preview.download')}
            title={t('pipeline.preview.download')}
          >
            <Download size={16} strokeWidth={2} />
          </a>
        )}
      </div>

      <div
        ref={zone}
        className="adj-scroll"
        style={{
          flex: 1, minHeight: 0, overflow: 'auto',
          padding: 'var(--adj-4)',
          background: 'var(--adj-panel-2)',
          borderRadius: 'var(--adj-round-m)',
          border: '1px solid var(--adj-hairline)',
        }}
      >
        {chargement && (
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: '100%',
            fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)',
          }}>
            <Loader2 size={16} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
            {t('pipeline.preview.loading')}
          </span>
        )}

        {erreur && !chargement && (
          <span style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', textAlign: 'center', padding: 'var(--adj-4)',
          }}>
            <span style={{ fontSize: 'var(--adj-t-sm)', color: 'var(--adj-neg)', marginBottom: 6 }}>
              {t('pipeline.preview.failed')}
            </span>
            <span style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)', lineHeight: 1.55, maxWidth: 420 }}>
              {t('pipeline.preview.failedHint')}
            </span>
          </span>
        )}

        {/* Toutes les pages sont présentes d'emblée, à leur taille réelle : la
            barre de défilement est juste dès le départ, et seules celles qui
            approchent de l'écran sont dessinées. */}
        {!erreur && tailles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--adj-4)' }}>
            {tailles.map((taille, i) => (
              <div
                key={i}
                data-page={i + 1}
                ref={el => { pages.current[i] = el; }}
                style={{
                  position: 'relative', lineHeight: 0, flexShrink: 0,
                  width: Math.floor(taille.largeur * echelle),
                  height: Math.floor(taille.hauteur * echelle),
                  background: 'var(--adj-panel)',
                  borderRadius: 2,
                  boxShadow: 'var(--adj-lift-1)',
                }}
              >
                <canvas ref={el => { canevas.current[i] = el; }} style={{ display: 'block', borderRadius: 2 }} />
                <div
                  ref={el => { couches.current[i] = el; }}
                  className="adj-pdf-text"
                  style={{ position: 'absolute', inset: 0, lineHeight: 1 }}
                />
                {/* Repère de page : dans un défilement continu, rien ne dit
                    sinon où l'une finit et où la suivante commence. */}
                <span style={{
                  position: 'absolute', top: 6, right: 8,
                  padding: '2px 7px', borderRadius: 'var(--adj-round-s)',
                  background: 'var(--adj-panel-2)', color: 'var(--adj-ink-4)',
                  fontSize: 'var(--adj-t-xs)', lineHeight: 1.5,
                  fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
                }}>
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
