import { useState } from "react";
import {
  Upload,
  FileText,
  Cpu,
  Building2,
  ChevronDown,
  ChevronRight,
  Phone,
  Briefcase,
  Award,
  Globe,
  Sparkles,
  Download,
  UploadCloud,
  Bot,
  Brain,
  Wind,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CollapsibleSection = ({
  icon: Icon,
  title,
  children,
  defaultOpen = false,
}: {
  icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted/60 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{title}</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-0" : "-rotate-90"
          }`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-3 pb-3 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const inputClasses =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all";

const DashboardSidebar = ({ onClose }: { onClose?: () => void }) => {
  const [selectedModel, setSelectedModel] = useState<string>("claude");
  const [language, setLanguage] = useState<string>("FR");

  const models = [
    { id: "gpt4", label: "GPT-4", icon: Bot, color: "text-emerald-600" },
    { id: "claude", label: "Claude", icon: Brain, color: "text-amber-600" },
    { id: "mistral", label: "Mistral", icon: Wind, color: "text-sky-600" },
  ];

  return (
    <aside className="w-[320px] min-w-[320px] h-screen border-r border-border bg-card flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">O</span>
        </div>
        <span className="font-semibold text-foreground text-lg tracking-tight">
          Offr<span className="text-primary">IA</span>
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {/* Upload Section */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Appel d'offres
          </p>
          <div className="border-2 border-dashed border-border rounded-xl p-5 text-center hover:border-primary/40 hover:bg-accent/30 transition-all cursor-pointer group">
            <div className="h-10 w-10 rounded-full bg-accent mx-auto mb-2.5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Upload className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm text-foreground font-medium">
              Déposez un fichier ou{" "}
              <span className="text-primary cursor-pointer">parcourir</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              .txt · .pdf · .doc
            </p>
          </div>
          <input
            type="text"
            placeholder="Objet : Marché de prestations informatiques..."
            className={inputClasses}
          />
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Modèle IA
          </p>
          <div className="grid grid-cols-3 gap-2">
            {models.map((model) => {
              const isSelected = selectedModel === model.id;
              return (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.id)}
                  className={`relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium transition-all border ${
                    isSelected
                      ? "border-primary bg-accent text-foreground shadow-sm ring-1 ring-primary/20"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-accent/50"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                  <model.icon className={`h-4 w-4 ${isSelected ? model.color : ""}`} />
                  <span>{model.label}</span>
                </button>
              );
            })}
          </div>
          <select className={`${inputClasses} text-muted-foreground`}>
            <option>claude-opus-4-6 — Modèle le plus puissant</option>
          </select>
        </div>

        {/* Company Profile */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Profil Entreprise
            </p>
            <div className="flex gap-1.5">
              <button className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border bg-card hover:bg-muted/60 transition-all">
                <UploadCloud className="h-3 w-3" />
                Export
              </button>
              <button className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border bg-card hover:bg-muted/60 transition-all">
                <Download className="h-3 w-3" />
                Import
              </button>
            </div>
          </div>

          <div className="border border-border rounded-xl bg-card overflow-hidden divide-y divide-border">
            <CollapsibleSection
              icon={Building2}
              title="Identité & Légal"
              defaultOpen={false}
            >
              <div className="space-y-2">
                <input
                  type="text"
                  defaultValue="Votre Entreprise SARL"
                  className={inputClasses}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select className={inputClasses}>
                    <option>SARL</option>
                  </select>
                  <input
                    type="text"
                    defaultValue="2010"
                    className={inputClasses}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" defaultValue="12345" className={inputClasses} />
                  <input type="text" defaultValue="00123456" className={inputClasses} />
                  <input type="text" defaultValue="1234567" className={inputClasses} />
                </div>
                <input
                  type="text"
                  defaultValue="12345678"
                  className={inputClasses}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection icon={Phone} title="Contact" />
            <CollapsibleSection icon={Briefcase} title="Activité & Expertises" />
            <CollapsibleSection icon={Award} title="Capacités & Références" />
          </div>
        </div>

        {/* Parameters */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Paramètres
          </p>
          <div className="border border-border rounded-xl bg-card px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">Langue de réponse</span>
              </div>
              <div className="flex bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => setLanguage("FR")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    language === "FR"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🇫🇷 FR
                </button>
                <button
                  onClick={() => setLanguage("EN")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    language === "EN"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🇬🇧 EN
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <div className="px-3 py-4 border-t border-border">
        <button className="w-full gradient-cta text-primary-foreground font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-md">
          <Sparkles className="h-4 w-4" />
          Générer la réponse
        </button>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Ajoutez un appel d'offres pour continuer
        </p>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
