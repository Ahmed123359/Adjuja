// Filtres de la veille des AO -- repris sur le socle le 2026-09-27 (cadre
// commun ./FilterPanel, listes deroulantes `Select` du socle).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DateField } from '../../../shared/ui/DateField';
import { Select } from '../../../shared/ui/Select';
import type { AoCategorie, ModePassation, WatcherFilters } from '../../../types';
import { fetchModesPassation } from '../../../api';
import SecteurPicker from './SecteurPicker';
import { FilterPanel, FilterSearch, FilterSection, FilterText } from './FilterPanel';

const CATEGORIES: AoCategorie[] = ['Travaux', 'Fournitures', 'Services'];

type Props = {
  filters: WatcherFilters;
  onChange: (patch: Partial<WatcherFilters>) => void;
  onReset: () => void;
  onClose?: () => void;
};

export default function VeilleFilters({ filters, onChange, onReset, onClose }: Props) {
  const { t } = useTranslation();
  const [modesPassation, setModesPassation] = useState<ModePassation[]>([]);

  useEffect(() => {
    fetchModesPassation().then(setModesPassation).catch(() => { /* non-fatal: select reste vide */ });
  }, []);

  const hasActiveFilters = !!(
    filters.search || filters.categorie || filters.mode_passation || filters.region || filters.date_limite_from
    || filters.secteur_codes.length > 0
  );

  return (
    <FilterPanel hasActiveFilters={hasActiveFilters} onReset={onReset} onClose={onClose}>
      <FilterSearch
        value={filters.search}
        onChange={search => onChange({ search, page: 1 })}
        placeholder={t('veille.filters.search')}
      />

      {/* Mode de passation : nomenclature officielle marchespublics.gov.ma */}
      <FilterSection label={t('veille.filters.modePassation')} htmlFor="veille-mode">
        <Select
          id="veille-mode"
          value={filters.mode_passation}
          onChange={mode => onChange({ mode_passation: mode, page: 1 })}
          options={[
            { value: '', label: t('veille.filters.modePassationAll') },
            ...modesPassation.map(m => ({ value: m.label, label: m.label })),
          ]}
        />
      </FilterSection>

      {/* Categorie principale : choisie en premier, cadre la liste d'activites ci-dessous */}
      <FilterSection label={t('veille.filters.categorie')} htmlFor="veille-categorie">
        <Select
          id="veille-categorie"
          value={filters.categorie}
          onChange={cat => onChange({
            categorie: cat as AoCategorie | '',
            secteur_codes: [], // les activites selectionnees ne s'appliquent plus forcement a la nouvelle categorie
            page: 1,
          })}
          options={[
            { value: '', label: t('veille.filters.categorieAll') },
            ...CATEGORIES.map(cat => ({ value: cat, label: t(`veille.categories.${cat}`) })),
          ]}
        />
      </FilterSection>

      {/* Activites (secteurs) : narrowees par la categorie choisie ci-dessus */}
      <FilterSection label={t('veille.filters.activites')}>
        <SecteurPicker
          selected={filters.secteur_codes}
          onChange={codes => onChange({ secteur_codes: codes, page: 1 })}
          categorieFilter={filters.categorie as AoCategorie | ''}
        />
      </FilterSection>

      <FilterSection label={t('veille.filters.region')} htmlFor="veille-region">
        <FilterText
          id="veille-region"
          value={filters.region}
          onChange={region => onChange({ region, page: 1 })}
          placeholder={t('veille.filters.regionPh')}
        />
      </FilterSection>

      <FilterSection label={t('veille.filters.dateLimite')}>
        <DateField
          value={filters.date_limite_from}
          onChange={v => onChange({ date_limite_from: v, page: 1 })}
        />
      </FilterSection>
    </FilterPanel>
  );
}
