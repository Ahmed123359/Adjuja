import { useId } from "react";

/** Cachet circulaire, texte sur le pourtour. Partage par la charte de
 *  confidentialite de l'accueil et par les pages legales : apposer un cachet
 *  est l'un des gestes du produit, pas un ornement. */
export default function Cachet({ texte, taille = 112, className = "" }: { texte: string; taille?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={taille} height={taille} viewBox="0 0 120 120" aria-hidden className={`shrink-0 -rotate-[9deg] text-l-teal opacity-90 ${className}`}>
      <defs>
        <path id={id} d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text fill="currentColor" fontSize="10.5" fontWeight="700" letterSpacing="1.6">
        <textPath href={`#${id}`}>{texte}</textPath>
      </text>
      <path d="M46 61l9 9 19-21" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
