// Administration : journal des actions -- 2026-10-01.

import { useTranslation } from 'react-i18next';
import { JournalActions } from '../components/JournalActions';
import { PageAdmin } from '../components/ui';

export default function JournalPage() {
  const { t } = useTranslation();
  return (
    <PageAdmin titre={t('admin.journal.titre')} sousTitre={t('admin.pages.journal')}>
      <JournalActions />
    </PageAdmin>
  );
}
