// Filtres de la veille des bons de commande -- repris sur le socle le
// 2026-09-27 (cadre commun ./FilterPanel, liste deroulante `Select` du socle).

import { useTranslation } from 'react-i18next';
import { DateField } from '../../../shared/ui/DateField';
import { Select } from '../../../shared/ui/Select';
import type { AoCategorie, WatcherBdcFilters } from '../../../types';
import NaturePrestationPicker from './NaturePrestationPicker';
import { FilterPanel, FilterSearch, FilterSection, FilterText } from './FilterPanel';

const CATEGORIES: AoCategorie[] = ['Travaux', 'Fournitures', 'Services'];

type Props = {
  filters: WatcherBdcFilters;
  onChange: (patch: Partial<WatcherBdcFilters>) => void;
  onReset: () => void;
  onClose?: () => void;
};

export default function BdcFilters({ filters, onChange, onReset, onClose }: Props) {
  const { t } = useTranslation();

  const hasActiveFilters = !!(
    filters.search || filters.categorie || filters.nature_prestations.length > 0
    || filters.region || filters.date_limite_from
  );

  return (
    <FilterPanel hasActiveFilters={hasActiveFilters} onReset={onReset} onClose={onClose}>
      <FilterSearch
        value={filters.search}
        onChange={search => onChange({ search, page: 1 })}
        placeholder={t('bdc.filters.search')}
      />

      <FilterSection label={t('veille.filters.categorie')} htmlFor="bdc-categorie">
        <Select
          id="bdc-categorie"
          value={filters.categorie}
          onChange={cat => onChange({
            categorie: cat as AoCategorie | '',
            nature_prestations: [],
            page: 1,
          })}
          options={[
            { value: '', label: t('veille.filters.categorieAll') },
            ...CATEGORIES.map(cat => ({ value: cat, label: t(`veille.categories.${cat}`) })),
          ]}
        />
      </FilterSection>

      {/* Nature de prestation : narrowee par la categorie choisie ci-dessus */}
      <FilterSection label={t('bdc.filters.naturePrestation')}>
        <NaturePrestationPicker
          value={filters.nature_prestations}
          onChange={labels => onChange({ nature_prestations: labels, page: 1 })}
          categorieFilter={filters.categorie as AoCategorie | ''}
        />
      </FilterSection>

      <FilterSection label={t('veille.filters.region')} htmlFor="bdc-region">
        <FilterText
          id="bdc-region"
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
