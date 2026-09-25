// Ecran des appels d'offres : liste, creation, detail.
//
// Reecrit le 2026-09-25. Ce qui a change, et pourquoi :
//
//   - la liste devient un tableau (voir AoList) : sept colonnes alignees, donc
//     des dossiers comparables. Les cartes empilees precedentes ne portaient ni
//     echeance, ni avancement, ni filtre ;
//   - la creation passe en fenetre modale au lieu d'une TROISIEME vue plein
//     ecran. Trois champs ne justifient pas de quitter la liste, et revenir en
//     arriere rechargeait tout ;
//   - la suppression demande confirmation dans la meme modale que le reste du
//     produit, au lieu d'un panneau maison ;
//   - l'ecran porte les anciens tokens `--l-*` nulle part : tout est sur le
//     socle `--adj-*`.
//
// La vue detail (AoDetailView) est inchangee par cette passe.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { invalider, useRessource } from '../../shared/lib/cache';
import { createAo, deleteAo, fetchAos } from './api';
import type { AoSummary } from './types';
import { AoList } from './components/AoList';
import { AoDetailView } from './components/AoDetailView';

const champ: React.CSSProperties = {
  width: '100%', height: 42, padding: '0 12px',
  borderRadius: 'var(--adj-round-m)', border: '1px solid var(--adj-edge)',
  background: 'var(--adj-panel)', color: 'var(--adj-ink)',
  fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)', outline: 'none',
};

const etiquette: React.CSSProperties = {
  display: 'block', marginBottom: 6,
  fontSize: 'var(--adj-t-xs)', fontWeight: 600, color: 'var(--adj-ink-3)',
};

export default function AoPipelinePage() {
  const { t } = useTranslation();

  // Meme cle que le tableau de bord et la palette de recherche : revenir ici
  // depuis un autre onglet reaffiche la liste sans la recharger.
  const { data: aos = [], loading, refresh } = useRessource<AoSummary[]>('ao:list', fetchAos);

  const [ouvert, setOuvert] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [aSupprimer, setASupprimer] = useState<AoSummary | null>(null);
  const [form, setForm] = useState({ reference: '', acheteur: '', objet: '' });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

  /** Toute ecriture invalide la liste ET le tableau de bord, qui compte les
   *  dossiers par statut : sans cela le nombre affiche ailleurs serait faux. */
  const rafraichir = useCallback(() => {
    invalider('ao');
    invalider('dashboard');
    refresh();
  }, [refresh]);

  // La barre du haut porte aussi « Nouvel AO ». Elle previent par evenement
  // plutot que par une prop remontee jusqu'a App : les deux composants sont
  // dans deux branches distinctes de l'arbre.
  useEffect(() => {
    const ouvrir = () => { setOuvert(null); setCreation(true); };
    window.addEventListener('adjuja:new-ao', ouvrir);
    return () => window.removeEventListener('adjuja:new-ao', ouvrir);
  }, []);

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reference.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      const ao = await createAo({
        reference: form.reference.trim(),
        acheteur: form.acheteur.trim(),
        objet: form.objet.trim(),
      });
      setForm({ reference: '', acheteur: '', objet: '' });
      setCreation(false);
      rafraichir();
      // On enchaine sur le dossier cree : c'est la suite du geste, personne ne
      // cree un AO pour revenir a la liste.
      setOuvert(ao.id);
    } catch (e2) {
      setErreur(message(e2));
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async () => {
    if (!aSupprimer) return;
    setEnCours(true);
    setErreur(null);
    try {
      await deleteAo(aSupprimer.id);
      setASupprimer(null);
      rafraichir();
    } catch (e) {
      setErreur(message(e));
    } finally {
      setEnCours(false);
    }
  };

  if (ouvert) {
    return (
      <AoDetailView
        aoId={ouvert}
        onBack={() => { setOuvert(null); rafraichir(); }}
      />
    );
  }

  return (
    <div className="adj-app-bg adj-scroll adj-pad-x" style={{
      flex: 1, minHeight: 0, overflowY: 'auto',
      padding: 'var(--adj-5) var(--adj-6) var(--adj-10)',
    }}>
      <div style={{ maxWidth: 'var(--adj-max)', margin: '0 auto' }}>
        {erreur && !creation && !aSupprimer && (
          <div role="alert" style={{
            marginBottom: 'var(--adj-4)',
            padding: 'var(--adj-3) var(--adj-4)', borderRadius: 'var(--adj-round-m)',
            background: 'var(--adj-neg-tint)', color: 'var(--adj-neg)', fontSize: 'var(--adj-t-sm)',
          }}>
            {erreur}
          </div>
        )}

        <AoList
          aos={aos}
          loading={loading}
          onOpen={setOuvert}
          onCreate={() => { setErreur(null); setCreation(true); }}
          onDelete={setASupprimer}
        />
      </div>

      <Modal
        open={creation}
        onClose={() => { setCreation(false); setErreur(null); }}
        title={t('pipeline.newForm.title')}
        subtitle={t('pipeline.subtitle')}
      >
        <form onSubmit={creer} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)' }}>
          <div>
            <label style={etiquette} htmlFor="ao-reference">{t('pipeline.newForm.reference')}</label>
            <input
              id="ao-reference"
              style={champ}
              value={form.reference}
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              placeholder={t('pipeline.newForm.referencePlaceholder')}
              maxLength={255}
              autoFocus
            />
          </div>
          <div>
            <label style={etiquette} htmlFor="ao-acheteur">{t('pipeline.newForm.buyer')}</label>
            <input
              id="ao-acheteur"
              style={champ}
              value={form.acheteur}
              onChange={e => setForm(f => ({ ...f, acheteur: e.target.value }))}
              placeholder={t('pipeline.newForm.buyerPlaceholder')}
              maxLength={255}
            />
          </div>
          <div>
            <label style={etiquette} htmlFor="ao-objet">{t('pipeline.newForm.subject')}</label>
            <textarea
              id="ao-objet"
              rows={3}
              style={{ ...champ, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
              value={form.objet}
              onChange={e => setForm(f => ({ ...f, objet: e.target.value }))}
              placeholder={t('pipeline.newForm.subjectPlaceholder')}
            />
          </div>

          {erreur && (
            <p role="alert" style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-neg)' }}>
              {erreur}
            </p>
          )}

          <div style={{ display: 'flex', gap: 'var(--adj-2)' }}>
            <Button type="submit" variant="primary" size="md" loading={enCours} disabled={!form.reference.trim()}>
              {t('pipeline.create')}
            </Button>
            <Button type="button" variant="ghost" size="md" onClick={() => { setCreation(false); setErreur(null); }}>
              {t('dashboard.home.task.cancel')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={aSupprimer !== null}
        onClose={() => { setASupprimer(null); setErreur(null); }}
        title={t('pipeline.list.delete')}
        subtitle={aSupprimer?.reference ?? undefined}
        width={460}
      >
        <p style={{ margin: '0 0 var(--adj-5)', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-2)', lineHeight: 1.6 }}>
          {t('pipeline.deleteConfirm')}
        </p>
        {erreur && (
          <p role="alert" style={{ margin: '0 0 var(--adj-4)', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-neg)' }}>
            {erreur}
          </p>
        )}
        <div style={{ display: 'flex', gap: 'var(--adj-2)' }}>
          <Button variant="danger" size="md" loading={enCours} onClick={supprimer}>
            {t('pipeline.list.delete')}
          </Button>
          <Button variant="ghost" size="md" onClick={() => { setASupprimer(null); setErreur(null); }}>
            {t('dashboard.home.task.cancel')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
