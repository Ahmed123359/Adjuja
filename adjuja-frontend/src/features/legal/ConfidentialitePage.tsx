import { useTranslation } from "react-i18next";
import LegalPageLayout from "./components/LegalPageLayout";

type Section = { heading: string; paragraphs: string[]; list?: string[]; anchor?: string };

export default function ConfidentialitePage() {
  const { t } = useTranslation();
  const data = t("legal.confidentialite", { returnObjects: true }) as { title: string; updated: string; sections: Section[] };

  return <LegalPageLayout title={data.title} updated={data.updated} sections={data.sections} />;
}
