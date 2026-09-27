// Briques de formulaire des reglages d'entreprise, sur le socle --adj-* -- 2026-09-27.
//
// Partagees par les onglets Profil et Equipe : meme libelle (15px), meme champ
// (44px, filet, anneau de focus de marque), meme grille de champs. Avant, chaque
// onglet recopiait son `<input>` a 13px avec ses propres couleurs.

export const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: "var(--adj-t-sm)",
  fontWeight: "var(--adj-w-medium)" as never,
  color: "var(--adj-ink-2)",
};

export const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: "var(--adj-round-s)",
  border: "1px solid var(--adj-hairline)",
  background: "var(--adj-panel)",
  color: "var(--adj-ink)",
  fontFamily: "inherit",
  fontSize: "var(--adj-t-base)",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color .15s, box-shadow .15s",
};

export function focusOn(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--adj-brand)";
  e.currentTarget.style.boxShadow = "var(--adj-ring)";
}
export function focusOff(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--adj-hairline)";
  e.currentTarget.style.boxShadow = "none";
}

/** Fraction de la grille qu'occupe un champ. Memes classes que les panneaux
 *  (`.adj-1-4`, `.adj-1-2`...) : un champ declare sa taille, il ne la subit pas.
 *  Chaque panneau compose ses rangees pour qu'elles tombent pile sur 8/8 --
 *  c'est ce qui supprime les trous (un champ seul sur sa ligne a cote du vide). */
export type Fraction = "1-8" | "1-4" | "3-8" | "1-2" | "5-8" | "3-4" | "1-1";

/** Grille des champs d'un panneau : la grille de fractions du socle (8 colonnes,
 *  4 sous 1240px, 2 sous 720px). */
export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="adj-grid">{children}</div>;
}

export function TextField({
  id, label, value, onChange, required, placeholder, span = "1-2", type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  /** Fraction occupee dans la grille de champs (defaut : la moitie). */
  span?: Fraction;
  type?: string;
}) {
  return (
    <div className={`adj-${span}`} style={{ minWidth: 0 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
        {required && <span aria-hidden style={{ color: "var(--adj-neg)", marginLeft: 3 }}>*</span>}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={fieldInputStyle}
        onFocus={focusOn}
        onBlur={focusOff}
      />
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        border: "2px solid var(--adj-hairline)", borderTopColor: "var(--adj-brand)",
        animation: "spin 1s linear infinite",
      }} />
    </div>
  );
}

/** Message d'erreur sous un bloc, dans la couleur negative du socle. */
export function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" style={{ margin: 0, fontSize: "var(--adj-t-sm)", color: "var(--adj-neg)" }}>
      {children}
    </p>
  );
}
