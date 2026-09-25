// Création et modification d'une tâche.
//
// Le même formulaire sert aux deux : une tâche se corrige bien plus souvent
// qu'elle ne se crée (une échéance qui bouge, un transfert à un collègue), et
// deux formulaires pour les mêmes cinq champs finiraient par diverger.
//
// Ouvert dans une fenêtre modale depuis le 2026-09-25 : en ligne, il poussait
// la liste des tâches vers le bas et faisait sauter la page sous le curseur.
//
// Les listes déroulantes passent par `Select`, et l'échéance par `DateField` :
// ni le `<select>` ni le `<input type="date">` natifs n'étaient dessinés. Tous
// deux se rendaient avec le style du système -- gris, angles vifs, calendrier en
// anglais, indifférents au thème sombre.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui/Button';
import { DateField } from '../../../shared/ui/DateField';
import { Select } from '../../../shared/ui/Select';
import { useRessource } from '../../../shared/lib/cache';
import { fetchAos } from '../../ao/api';
import { listOrgMembers } from '../../org/api';
import type { AoSummary } from '../../ao/types';
import type { User } from '../../../types';
import type { Task, TaskForm as TaskFormData, TaskStatut } from '../types';

// Même gabarit que `Select` : hauteur 42, rayon moyen. Sans cela un champ texte
// et une liste déroulante côte à côte ne s'alignent pas.
const champ: React.CSSProperties = {
  width: '100%',
  height: 42,
  padding: '0 12px',
  borderRadius: 'var(--adj-round-m)',
  border: '1px solid var(--adj-edge)',
  background: 'var(--adj-panel)',
  color: 'var(--adj-ink)',
  fontSize: 'var(--adj-t-sm)',
  fontFamily: 'inherit',
};

const etiquette: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 'var(--adj-t-xs)',
  fontWeight: 'var(--adj-w-semi)' as never,
  color: 'var(--adj-ink-3)',
};

const STATUTS: TaskStatut[] = ['a_faire', 'en_cours', 'faite'];

export function TaskForm({
  initial, onSubmit, onCancel, saving, error,
}: {
  /** Tâche à modifier ; absent pour une création. */
  initial?: Task | null;
  onSubmit: (data: TaskFormData) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [titre, setTitre] = useState(initial?.titre ?? '');
  const [echeance, setEcheance] = useState(initial?.echeance?.slice(0, 10) ?? '');
  const [assignee, setAssignee] = useState(initial?.assignee_id ?? '');
  const [aoId, setAoId] = useState(initial?.ao_id ?? '');
  const [statut, setStatut] = useState<TaskStatut>(initial?.statut ?? 'a_faire');
  // Ces deux listes ne servent qu'a proposer des choix : leur echec ne doit pas
  // empecher d'enregistrer une tache simple, d'ou le repli sur [].
  const { data: membres = [] } = useRessource<User[]>('org:members', listOrgMembers);
  const { data: aos = [] } = useRessource<AoSummary[]>('ao:list', fetchAos);

  const envoyer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim()) return;
    onSubmit({
      titre: titre.trim(),
      echeance: echeance || null,
      assignee_id: assignee || null,
      ao_id: aoId || null,
      statut,
    });
  };

  return (
    <form
      onSubmit={envoyer}
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--adj-4)',
      }}
    >
      <div>
        <label style={etiquette} htmlFor="task-titre">{t('dashboard.home.task.titleLabel')}</label>
        <input
          id="task-titre"
          style={champ}
          value={titre}
          onChange={e => setTitre(e.target.value)}
          placeholder={t('dashboard.home.task.titlePlaceholder')}
          maxLength={255}
          autoFocus
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--adj-4)' }}>
        <div>
          <label style={etiquette} htmlFor="task-echeance">{t('dashboard.home.task.dueLabel')}</label>
          <DateField id="task-echeance" value={echeance} onChange={setEcheance} />
        </div>
        <div>
          <label style={etiquette} htmlFor="task-assignee">{t('dashboard.home.task.assigneeLabel')}</label>
          <Select
            id="task-assignee"
            value={assignee}
            onChange={setAssignee}
            placeholder={t('dashboard.home.task.unassigned')}
            options={[
              { value: '', label: t('dashboard.home.task.unassigned') },
              ...membres.map(m => ({ value: m.id, label: `${m.prenom} ${m.nom}`.trim() })),
            ]}
          />
        </div>
        <div>
          <label style={etiquette} htmlFor="task-ao">{t('dashboard.home.task.aoLabel')}</label>
          <Select
            id="task-ao"
            value={aoId}
            onChange={setAoId}
            placeholder={t('dashboard.home.task.noAo')}
            options={[
              { value: '', label: t('dashboard.home.task.noAo') },
              ...aos.map(a => ({ value: a.id, label: a.reference || a.objet || a.id.slice(0, 8) })),
            ]}
          />
        </div>
        <div>
          <label style={etiquette} htmlFor="task-statut">{t('dashboard.home.task.statusLabel')}</label>
          <Select
            id="task-statut"
            value={statut}
            onChange={v => setStatut(v as TaskStatut)}
            options={STATUTS.map(v => ({ value: v, label: t(`dashboard.home.task.status.${v}`) }))}
          />
        </div>
      </div>

      {error && <p style={{ margin: 0, fontSize: 'var(--adj-t-sm)', color: 'var(--adj-neg)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 'var(--adj-2)' }}>
        <Button type="submit" variant="primary" size="md" loading={saving} disabled={!titre.trim()}>
          {initial ? t('dashboard.home.task.save') : t('dashboard.home.task.create')}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onCancel}>
          {t('dashboard.home.task.cancel')}
        </Button>
      </div>
    </form>
  );
}
