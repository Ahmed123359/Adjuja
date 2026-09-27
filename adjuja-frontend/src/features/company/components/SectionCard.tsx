// Panneau de section des reglages d'entreprise.
//
// Repris le 2026-09-27 : n'est plus qu'un alias du `Card` du socle. Il reste
// importe par les sections de notifications, de membres et d'abonnement ; les
// faire passer par ici leur donne le titre a 20px, le filet et le rayon du
// socle sans toucher a leur contenu.

import { Card } from "../../../shared/ui/Card";

export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return <Card title={title}>{children}</Card>;
}
