// Écran des tâches d'équipe -- 2026-09-25.
//
// Deux colonnes, chacune sur toute la hauteur de l'écran :
//
//   à gauche   la liste des tâches, groupée par échéance, une ligne par tâche ;
//   à droite   la discussion, du haut au bas de l'écran.
//
// La sélection relie les deux : cliquer une tâche ouvre SON fil dans la colonne
// de droite ; sans sélection, c'est le canal général de l'équipe. C'est ce lien
// qui fait de l'écran un poste de travail plutôt que deux panneaux côte à côte.
//
// Les tâches sont groupées par échéance -- en retard, aujourd'hui, cette
// semaine, plus tard, sans date -- et non par date de création : c'est l'ordre
// dans lequel on traite une liste de tâches.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { Select } from '../../shared/ui/Select';
import { invalider, useRessource } from '../../shared/lib/cache';
import { listOrgMembers } from '../org/api';
import { fetchAos } from '../ao/api';
import type { AoSummary } from '../ao/types';
import type { User } from '../../types';
import {
  createTask, deleteTask, fetchTasks, setTaskStatut, updateTask,
} from '../dashboard/api';
import { TaskForm } from '../dashboard/components/TaskForm';
import { isoDay } from '../dashboard/components/MonthCalendar';
import type { Task, TaskForm as TaskFormData } from '../dashboard/types';
import { TeamChat } from './components/TeamChat';

type Bucket = 'retard' | 'aujourdhui' | 'semaine' | 'plus_tard' | 'sans_date';
const ORDRE: Bucket[] = ['retard', 'aujourdhui', 'semaine', 'plus_tard', 'sans_date'];

const TEINTE: Record<Bucket, string> = {
  retard:     'var(--adj-neg)',
  aujourdhui: 'var(--adj-hold)',
  semaine:    'var(--adj-brand)',
  plus_tard:  'var(--adj-ink-4)',
  sans_date:  'var(--adj-ink-4)',
};

function bucket(tache: Task, aujourdhui: string, finSemaine: string): Bucket {
  const jour = tache.echeance?.slice(0, 10);
  if (!jour) return 'sans_date';
  if (jour < aujourdhui) return 'retard';
  if (jour === aujourdhui) return 'aujourdhui';
  return jour <= finSemaine ? 'semaine' : 'plus_tard';
}

export default function TasksPage({ moi }: { moi?: User }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  // Sous 900px les deux panneaux ne tiennent pas cote a cote. Les empiler
  // obligerait a faire defiler toute la liste des taches pour atteindre la
  // discussion : avec cent taches, elle devient inatteignable. Un selecteur
  // affiche donc l'un OU l'autre, chacun sur toute la hauteur.
  const etroit = useIsMobile(900);
  const [vue, setVue] = useState<'taches' | 'discussion'>('taches');

  const [tasks, setTasks] = useState<Task[]>([]);
  // Memes cles que partout ailleurs : la liste des membres et celle des AO sont
  // deja en cache si un autre ecran les a demandees.
  const { data: membres = [] } = useRessource<User[]>('org:members', listOrgMembers);
  const { data: aos = [] } = useRessource<AoSummary[]>('ao:list', fetchAos);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [qui, setQui] = useState('me');
  const [statut, setStatut] = useState('ouvertes');
  const [choisie, setChoisie] = useState<Task | null>(null);

  const [formOuvert, setFormOuvert] = useState(false);
  const [enEdition, setEnEdition] = useState<Task | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);

  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

  const charger = useCallback(() => {
    setChargement(true);
    // Les deux filtres partent au serveur : filtrer 200 tâches dans le
    // navigateur obligerait à toutes les télécharger pour en afficher cinq.
    fetchTasks({
      assignee: qui === 'tous' ? undefined : qui,
      statut: statut === 'tous' ? undefined : statut,
      limit: 200,
    })
      .then(r => setTasks(r.items))
      .catch(e => setErreur(message(e)))
      .finally(() => setChargement(false));
  }, [qui, statut]);

  useEffect(() => { charger(); }, [charger]);

  // Une tâche qui sort du filtre ne doit pas rester sélectionnée : la
  // discussion afficherait le fil d'une tâche absente de la liste.
  useEffect(() => {
    if (choisie && !tasks.some(x => x.id === choisie.id)) setChoisie(null);
  }, [tasks, choisie]);

  const fermerForm = () => { setFormOuvert(false); setEnEdition(null); setErreurForm(null); };

  const soumettre = async (data: TaskFormData) => {
    setEnregistrement(true);
    setErreurForm(null);
    try {
      if (enEdition) await updateTask(enEdition.id, data);
      else await createTask(data);
      fermerForm();
      invalider('dashboard');
      charger();
    } catch (e) {
      setErreurForm(message(e));
    } finally {
      setEnregistrement(false);
    }
  };

  const basculerFait = async (tache: Task) => {
    try {
      await setTaskStatut(tache.id, tache.statut === 'faite' ? 'a_faire' : 'faite');
      invalider('dashboard');
      charger();
    } catch (e) { setErreur(message(e)); }
  };

  const supprimer = async (tache: Task) => {
    try {
      await deleteTask(tache.id);
      if (choisie?.id === tache.id) setChoisie(null);
      invalider('dashboard');
      charger();
    } catch (e) { setErreur(message(e)); }
  };

  /* ------------------------------------------------------------ regroupement */

  const aujourdhui = isoDay(new Date());
  const finSemaine = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return isoDay(d);
  }, []);

  const paquets = useMemo(() => {
    const map = new Map<Bucket, Task[]>();
    for (const tache of tasks) {
      const b = tache.statut === 'faite' ? 'plus_tard' : bucket(tache, aujourdhui, finSemaine);
      map.set(b, [...(map.get(b) ?? []), tache]);
    }
    return map;
  }, [tasks, aujourdhui, finSemaine]);

  const nomMembre = (id: string | null) => {
    if (!id) return t('dashboard.home.task.unassigned');
    const m = membres.find(x => x.id === id);
    return m ? `${m.prenom} ${m.nom}`.trim() : t('dashboard.home.task.unassigned');
  };

  const dateCourte = (iso: string | null) =>
    iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '';

  return (
    <div className="adj-app-bg adj-scroll adj-pad-x" style={{
      flex: 1, minHeight: 0,
      // Sans defilement ici, les deux panneaux empiles sur mobile depassent la
      // fenetre sans que rien ne puisse defiler : la page etait bloquee.
      overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
      padding: 'var(--adj-5) var(--adj-6)',
      gap: 'var(--adj-4)',
    }}>
      {/* Barre d'outils : filtres à gauche, création à droite. */}
      <div className="adj-toolbar" style={{
        display: 'flex', alignItems: 'center', gap: 'var(--adj-3)', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <div style={{ width: 210 }}>
          <Select
            value={qui}
            onChange={setQui}
            options={[
              { value: 'me', label: t('dashboard.home.task.mineShort') },
              { value: 'tous', label: t('dashboard.home.task.teamShort') },
              { value: 'unassigned', label: t('dashboard.home.task.unassigned') },
              ...membres.map(m => ({ value: m.id, label: `${m.prenom} ${m.nom}`.trim() })),
            ]}
          />
        </div>
        <div style={{ width: 185 }}>
          <Select
            value={statut}
            onChange={setStatut}
            options={[
              { value: 'ouvertes', label: t('tasks.filter.open') },
              { value: 'tous', label: t('tasks.filter.all') },
              { value: 'a_faire', label: t('dashboard.home.task.status.a_faire') },
              { value: 'en_cours', label: t('dashboard.home.task.status.en_cours') },
              { value: 'faite', label: t('dashboard.home.task.status.faite') },
            ]}
          />
        </div>

        <span className="adj-toolbar-spacer" style={{ flex: 1 }} />

        <span className="adj-toolbar-action">
          <Button
            variant="primary" size="md"
            icon={<Plus size={17} strokeWidth={2.4} />}
            onClick={() => { setEnEdition(null); setFormOuvert(true); setErreurForm(null); }}
          >
            {t('dashboard.home.task.new')}
          </Button>
        </span>
      </div>

      {erreur && (
        <div role="alert" style={{
          flexShrink: 0,
          padding: 'var(--adj-3) var(--adj-4)', borderRadius: 'var(--adj-round-m)',
          background: 'var(--adj-neg-tint)', color: 'var(--adj-neg)', fontSize: 'var(--adj-t-sm)',
        }}>
          {erreur}
        </div>
      )}

      {etroit && (
        <div role="tablist" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, flexShrink: 0,
          padding: 4, borderRadius: 'var(--adj-round-m)',
          background: 'var(--adj-panel-2)', border: '1px solid var(--adj-hairline)',
        }}>
          {(['taches', 'discussion'] as const).map(v => (
            <button
              key={v}
              role="tab"
              aria-selected={vue === v}
              onClick={() => setVue(v)}
              className="adj-focusable adj-anim"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                height: 38, border: 'none', borderRadius: 'var(--adj-round-s)',
                background: vue === v ? 'var(--adj-panel)' : 'transparent',
                boxShadow: vue === v ? 'var(--adj-lift-1)' : 'none',
                color: vue === v ? 'var(--adj-ink)' : 'var(--adj-ink-3)',
                fontFamily: 'inherit', fontSize: 'var(--adj-t-sm)',
                fontWeight: (vue === v ? 'var(--adj-w-semi)' : 'var(--adj-w-normal)') as never,
                cursor: 'pointer',
              }}
            >
              {v === 'taches'
                ? <><Check size={15} strokeWidth={2} />{t('tasks.view.list')}</>
                : <><MessageSquare size={15} strokeWidth={2} />{t('tasks.view.chat')}</>}
              {v === 'taches' && tasks.length > 0 && (
                <span className="adj-fig" style={{ color: 'var(--adj-ink-4)' }}>{tasks.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Les deux colonnes occupent toute la hauteur restante : la discussion
          doit aller du haut au bas de l'écran, pas tenir dans une carte. */}
      <div className="adj-tasks-split" style={{ flex: 1, minHeight: 0 }}>
        <section className="adj-scroll" style={{
          display: etroit && vue !== 'taches' ? 'none' : 'block',
          minHeight: 0, overflowY: 'auto',
          background: 'var(--adj-panel)',
          border: '1px solid var(--adj-hairline)',
          borderRadius: 'var(--adj-round-l)',
        }}>
          {chargement && (
            <p style={{ margin: 0, padding: 'var(--adj-pad)', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
              {t('dashboard.home.loading')}
            </p>
          )}

          {!chargement && tasks.length === 0 && (
            <p style={{ margin: 0, padding: 'var(--adj-pad)', fontSize: 'var(--adj-t-sm)', color: 'var(--adj-ink-3)' }}>
              {t('dashboard.home.task.emptyAll')}
            </p>
          )}

          {!chargement && ORDRE.map(b => {
            const lot = paquets.get(b);
            if (!lot?.length) return null;
            return (
              <div key={b}>
                {/* En-tête de groupe collant : en défilant une longue liste on
                    doit toujours savoir dans quel paquet on se trouve. */}
                <div style={{
                  position: 'sticky', top: 0, zIndex: 1,
                  display: 'flex', alignItems: 'center', gap: 'var(--adj-2)',
                  padding: '10px var(--adj-pad)',
                  background: 'var(--adj-panel-2)',
                  borderBottom: '1px solid var(--adj-hairline)',
                }}>
                  <span aria-hidden style={{
                    width: 7, height: 7, borderRadius: '50%', background: TEINTE[b], flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 'var(--adj-t-xs)', fontWeight: 'var(--adj-w-semi)' as never,
                    color: 'var(--adj-ink-2)',
                  }}>
                    {t(`tasks.bucket.${b}`)}
                  </span>
                  <span className="adj-fig" style={{ fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-4)' }}>
                    {lot.length}
                  </span>
                </div>

                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {lot.map(tache => {
                    const faite = tache.statut === 'faite';
                    const active = choisie?.id === tache.id;
                    return (
                      <li
                        key={tache.id}
                        className="adj-row"
                        onClick={() => {
                          const suivante = active ? null : tache;
                          setChoisie(suivante);
                          if (etroit && suivante) setVue('discussion');
                        }}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 'var(--adj-3)',
                          padding: '12px var(--adj-pad)',
                          borderBottom: '1px solid var(--adj-hairline)',
                          cursor: 'pointer', minWidth: 0,
                          background: active ? 'var(--adj-brand-tint)' : 'transparent',
                          // Le liseré dit laquelle est ouverte dans la discussion.
                          boxShadow: active ? 'inset 3px 0 0 var(--adj-brand)' : 'none',
                        }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--adj-panel-3)'; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); basculerFait(tache); }}
                          aria-label={t('dashboard.home.task.markDone')}
                          title={t('dashboard.home.task.markDone')}
                          className="adj-focusable"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            width: 20, height: 20, marginTop: 1,
                            borderRadius: 'var(--adj-round-s)',
                            border: `1.5px solid ${faite ? 'var(--adj-pos)' : 'var(--adj-edge)'}`,
                            background: faite ? 'var(--adj-pos)' : 'transparent',
                            color: '#fff', cursor: 'pointer', padding: 0,
                          }}
                        >
                          {faite && <Check size={13} strokeWidth={3} />}
                        </button>

                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{
                            fontSize: 'var(--adj-t-sm)',
                            color: faite ? 'var(--adj-ink-4)' : 'var(--adj-ink)',
                            textDecoration: faite ? 'line-through' : 'none',
                            lineHeight: 1.4,
                          }}>
                            {tache.titre}
                          </span>
                          <span style={{
                            display: 'flex', flexWrap: 'wrap', gap: '2px 10px',
                            fontSize: 'var(--adj-t-xs)', color: 'var(--adj-ink-3)',
                          }}>
                            <span style={{ color: b === 'retard' && !faite ? 'var(--adj-neg)' : undefined }}>
                              {tache.echeance ? dateCourte(tache.echeance) : t('tasks.bucket.sans_date')}
                            </span>
                            <span>{nomMembre(tache.assignee_id)}</span>
                            {tache.ao_reference && <span>{tache.ao_reference}</span>}
                          </span>
                        </span>

                        <span className="adj-row-actions" style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setEnEdition(tache); setFormOuvert(false); setErreurForm(null); }}
                            aria-label={t('dashboard.home.task.edit')}
                            title={t('dashboard.home.task.edit')}
                            className="adj-focusable"
                            style={{
                              display: 'flex', padding: 5, border: 'none', background: 'transparent',
                              borderRadius: 'var(--adj-round-s)', color: 'var(--adj-ink-4)', cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--adj-ink)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--adj-ink-4)'; }}
                          >
                            <Pencil size={14} strokeWidth={1.9} />
                          </button>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); supprimer(tache); }}
                            aria-label={t('dashboard.home.task.delete')}
                            title={t('dashboard.home.task.delete')}
                            className="adj-focusable"
                            style={{
                              display: 'flex', padding: 5, border: 'none', background: 'transparent',
                              borderRadius: 'var(--adj-round-s)', color: 'var(--adj-ink-4)', cursor: 'pointer',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--adj-neg)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--adj-ink-4)'; }}
                          >
                            <Trash2 size={14} strokeWidth={1.9} />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>

        <div style={{
          display: etroit && vue !== 'discussion' ? 'none' : 'flex',
          flexDirection: 'column', minHeight: 0,
        }}>
        <TeamChat
          tache={choisie}
          membres={membres}
          aos={aos}
          moi={moi ?? null}
        />
        </div>
      </div>

      <Modal
        open={formOuvert || enEdition !== null}
        onClose={fermerForm}
        title={enEdition ? t('dashboard.home.task.edit') : t('dashboard.home.task.new')}
        subtitle={enEdition?.ao_reference ?? undefined}
      >
        <TaskForm
          key={enEdition?.id ?? 'nouvelle'}
          initial={enEdition}
          onSubmit={soumettre}
          onCancel={fermerForm}
          saving={enregistrement}
          error={erreurForm}
        />
      </Modal>
    </div>
  );
}
