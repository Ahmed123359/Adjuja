import { useTranslation } from "react-i18next";
import LegalPageLayout from "../components/legal/LegalPageLayout";

type Section = { heading: string; paragraphs: string[]; list?: string[] };

export default function MentionsLegalesPage() {
  const { t } = useTranslation();
  const data = t("legal.mentions", { returnObjects: true }) as { title: string; updated: string; sections: Section[] };

  return <LegalPageLayout title={data.title} updated={data.updated} sections={data.sections} />;
}
