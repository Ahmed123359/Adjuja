import {
  FileText,
  Coins,
  Database,
  Sparkles,
  Upload,
  Cpu,
  Building2,
  Zap,
  ArrowRight,
  Clock,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";

const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    className="border border-border rounded-xl bg-card p-5 shadow-card hover:shadow-card-hover transition-shadow"
  >
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
        <Icon className="h-4 w-4 text-accent-foreground" />
      </div>
    </div>
    <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
    <p className="text-xs text-muted-foreground mt-1">{sub}</p>
  </motion.div>
);

const StepCard = ({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) => (
  <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:shadow-card-hover hover:border-primary/20 transition-all group">
    <div className="h-8 w-8 min-w-[2rem] rounded-lg gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
      {String(step).padStart(2, "0")}
    </div>
    <div>
      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
        {title}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </div>
  </div>
);

const historyItems = [
  {
    title: "Construction d'un établissement scolaire primaire 1. Objet du marché ...",
    company: "Votre Entreprise SARL",
    provider: "anthropic",
    tokens: "31 232",
    date: "06 mars, 16:08",
  },
  {
    title: "Construction d'un établissement scolaire primaire 1. Objet du marché ...",
    company: "Votre Entreprise SARL",
    provider: "anthropic",
    tokens: "31 096",
    date: "06 mars, 15:48",
  },
  {
    title: "Construction d'un établissement scolaire primaire 1. Objet du marché ...",
    company: "Votre Entreprise SARL",
    provider: "openai",
    tokens: "26 168",
    date: "06 mars, 14:33",
  },
  {
    title: "Construction d'un établissement scolaire primaire 1. Objet du marché ...",
    company: "Votre Entreprise SARL",
    provider: "openai",
    tokens: "25 701",
    date: "06 mars, 14:22",
  },
  {
    title: "Construction d'un établissement scolaire primaire 1. Objet du marché ...",
    company: "Votre Entreprise SARL",
    provider: "openai",
    tokens: "25 450",
    date: "06 mars, 14:15",
  },
];

const MainContent = () => {
  return (
    <div className="flex-1 h-screen overflow-y-auto">
      {/* Top Bar */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border font-mono">
              <Coins className="h-3 w-3" />
              tokens <strong className="text-foreground">0 / 100 000</strong>
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-card border border-border font-mono">
              <Zap className="h-3 w-3" />
              appels <strong className="text-foreground">0 / 50</strong>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all flex items-center gap-1.5">
              <Database className="h-3 w-3" />
              RAG
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-border">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-foreground">Connecté</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-border">
              <div className="h-6 w-6 rounded-full gradient-primary flex items-center justify-center">
                <span className="text-[10px] text-primary-foreground font-bold">ME</span>
              </div>
              <span className="text-xs font-medium text-foreground">Mohamed Echarif</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-8 py-10 space-y-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-2"
        >
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Prêt à remporter votre prochain marché ?
          </h1>
          <p className="text-base text-muted-foreground max-w-xl">
            Remplissez le formulaire à gauche et générez une réponse professionnelle en quelques secondes.
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            icon={FileText}
            label="Réponses générées"
            value="0"
            sub="sur 50 disponibles"
          />
          <StatCard
            icon={Coins}
            label="Tokens utilisés"
            value="0"
            sub="sur 100k max"
          />
          <StatCard
            icon={Database}
            label="Base documentaire"
            value="—"
            sub="RAG non configuré"
          />
        </div>

        {/* CTA Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="gradient-cta rounded-2xl p-8 shadow-elevated relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,hsl(280_60%_65%_/_0.3),transparent_60%)]" />
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary-foreground/15 text-primary-foreground text-xs font-semibold uppercase tracking-wider mb-4">
              <Sparkles className="h-3 w-3" />
              Démarrer
            </span>
            <h2 className="text-2xl font-bold text-primary-foreground mb-2">
              Commencer une réponse AO
            </h2>
            <p className="text-sm text-primary-foreground/80 max-w-lg mb-5">
              Déposez votre appel d'offres dans le panneau gauche, sélectionnez votre LLM et cliquez sur{" "}
              <strong className="text-primary-foreground">Générer la réponse</strong>.
            </p>
            <div className="flex items-center gap-6 text-xs text-primary-foreground/70">
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                9 sections générées en parallèle
              </span>
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Format Word éditable
              </span>
              <span className="flex items-center gap-1.5">
                <ArrowRight className="h-3.5 w-3.5" />
                Entrée pour lancer
              </span>
            </div>
          </div>
        </motion.div>

        {/* How it works */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Comment ça fonctionne
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <StepCard
              step={1}
              title="Déposez votre AO"
              description="Fichier .txt, .pdf ou texte libre"
            />
            <StepCard
              step={2}
              title="Choisissez le modèle"
              description="Claude, GPT-4 ou Mistral"
            />
            <StepCard
              step={3}
              title="Profil entreprise"
              description="Vos références et expertises"
            />
            <StepCard
              step={4}
              title="Générez"
              description="9 appels LLM spécialisés en parallèle"
            />
          </div>
        </div>

        {/* History */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Historique des générations
            </h3>
            <button className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
              <Trash2 className="h-3 w-3" />
              Vider
            </button>
          </div>
          <div className="space-y-2">
            {historyItems.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group border border-border rounded-xl bg-card p-4 hover:shadow-card-hover hover:border-primary/20 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate pr-4">
                      <span className="text-primary font-bold">APPEL D'OFFRE FICTIF</span>{" "}
                      {item.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {item.company}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Cpu className="h-3 w-3" />
                        {item.provider}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Coins className="h-3 w-3" />
                        {item.tokens} tokens
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {item.date}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainContent;
