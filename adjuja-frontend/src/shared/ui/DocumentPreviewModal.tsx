// Aperçu d'un document, en fenêtre modale -- 2026-09-27.
//
// Emballage d'une ligne autour de `DocumentPreview`, pour que n'importe quel
// écran listant un PDF puisse l'ouvrir sans réécrire la modale, le titre et la
// gestion d'ouverture. C'est ce qui permet d'avoir le MÊME aperçu partout
// plutôt qu'une variante par écran.

import { useCallback, useEffect, useRef, useState } from 'react';
import { DocumentPreview } from './DocumentPreview';
import { Modal } from './Modal';

export function DocumentPreviewModal({
  open, onClose, url, nomFichier, titre,
}: {
  open: boolean;
  onClose: () => void;
  /** URL du document. Null tant qu'elle n'est pas obtenue : l'aperçu affiche
   *  alors son état de chargement. */
  url: string | null;
  nomFichier: string;
  /** Titre affiché ; à défaut, le nom du fichier. */
  titre?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titre || nomFichier}
      subtitle={titre ? nomFichier : undefined}
      width={1120}
    >
      <DocumentPreview url={url} nomFichier={nomFichier} />
    </Modal>
  );
}

/** Aperçu ouvert, avec le mode d'obtention de son URL. */
type Apercu = { url: string; nom: string; local: boolean };

/**
 * État d'aperçu prêt à brancher : un écran appelle `ouvrirFichier` pour un PDF
 * choisi par l'utilisateur (pas encore envoyé), `ouvrirUrl` pour un résultat
 * servi par le backend, et rend `modale`.
 *
 * Un fichier local passe par une URL `blob:` : elle retient le fichier en
 * mémoire tant qu'elle n'est pas révoquée, d'où la révocation à la fermeture
 * et au démontage.
 */
export function useApercuDocument() {
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const courant = useRef<Apercu | null>(null);

  const liberer = useCallback(() => {
    if (courant.current?.local) URL.revokeObjectURL(courant.current.url);
    courant.current = null;
  }, []);

  const ouvrir = useCallback((a: Apercu) => {
    liberer();
    courant.current = a;
    setApercu(a);
  }, [liberer]);

  const ouvrirFichier = useCallback((fichier: File) => {
    ouvrir({ url: URL.createObjectURL(fichier), nom: fichier.name, local: true });
  }, [ouvrir]);

  const ouvrirUrl = useCallback((url: string, nom: string) => {
    ouvrir({ url, nom, local: false });
  }, [ouvrir]);

  const fermer = useCallback(() => {
    liberer();
    setApercu(null);
  }, [liberer]);

  useEffect(() => liberer, [liberer]);

  const modale = (
    <DocumentPreviewModal
      open={apercu !== null}
      onClose={fermer}
      url={apercu?.url ?? null}
      nomFichier={apercu?.nom ?? 'document.pdf'}
    />
  );

  return { ouvrirFichier, ouvrirUrl, modale };
}
