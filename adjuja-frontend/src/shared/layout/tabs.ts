/** Onglets de premier niveau de l'application. « accueil » est le tableau de
 *  bord depuis le 2026-09-15 ; « entreprise » porte les réglages.
 *  L'administration n'est pas un onglet : c'est une page à part (/admin),
 *  voir features/admin/AdminApp.tsx.
 *
 *  Déclaré ici une seule fois : il l'était à l'identique dans App, la barre
 *  latérale, la barre du haut et le panneau principal. */
export type AppTab = 'accueil' | 'offres' | 'marches' | 'taches' | 'outils' | 'veille' | 'entreprise';
