import { useCallback, useRef, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquare, X, Send, Sparkles } from 'lucide-react';
import type { ChatMessage } from '../types';
import { sendChatMessage } from '../api';

interface Props {
  provider: string;
  model:    string;
}

// ── Animations ──────────────────────────────────────────────────────────────

const containerVariants = {
  hidden:  { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0,  scale: 1,
    transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit:    { opacity: 0, y: 20, scale: 0.95,
    transition: { duration: 0.2 } },
};

const messageVariants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0,
    transition: { type: 'spring', stiffness: 500, damping: 30 } },
};

// ── Composant principal ─────────────────────────────────────────────────────

export default function FloatingChat({ provider, model }: Props) {
  const [isOpen,   setIsOpen]   = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll automatique vers le dernier message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const toggleOpen = useCallback(() => setIsOpen(prev => !prev), []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const res = await sendChatMessage(nextMessages, provider, model);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: res.answer, sources: res.sources },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSend();
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-4">

      {/* ── Fenêtre de chat ───────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-window"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-[calc(100vw-2rem)] sm:w-[380px] overflow-hidden rounded-2xl border border-border/40 bg-background/95 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 flex flex-col"
            style={{ maxHeight: '75vh' }}
          >

            {/* En-tête */}
            <div className="relative border-b border-border/40 bg-primary/5 p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Assistant ADJUJA</h3>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-xs text-muted-foreground">En ligne · {provider}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {messages.length > 0 && (
                    <button
                      onClick={() => setMessages([])}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10"
                    >
                      Effacer
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="h-7 w-7 rounded-full hover:bg-muted/50 flex items-center justify-center transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            {/* Zone messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0" style={{ minHeight: '160px' }}>

              {/* Message de bienvenue */}
              {messages.length === 0 && !loading && (
                <motion.div variants={messageVariants} initial="hidden" animate="visible" className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex flex-col gap-1 max-w-[85%]">
                    <span className="text-xs font-medium text-muted-foreground">Assistant ADJUJA</span>
                    <div className="rounded-2xl rounded-tl-none bg-muted/50 px-4 py-2.5 text-sm border border-border/20">
                      <p>Bonjour ! Je peux vous aider sur vos appels d'offres et documents. Que souhaitez-vous savoir ?</p>
                    </div>
                    {/* Suggestions rapides */}
                    <div className="flex flex-col gap-1.5 mt-2">
                      {[
                        'Nos références en formation ?',
                        'Quelles certifications avons-nous ?',
                        'AOs similaires déjà répondus ?',
                      ].map(q => (
                        <button
                          key={q}
                          onClick={() => setInput(q)}
                          className="text-left text-xs px-3 py-1.5 rounded-lg border border-border/40 hover:bg-primary/5 hover:border-primary/30 transition-colors text-muted-foreground"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Messages */}
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {msg.role === 'user' ? 'Moi' : 'AI'}
                  </div>
                  <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                    <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-none shadow-md'
                        : 'bg-muted/50 text-foreground rounded-tl-none border border-border/20'
                    }`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                    {/* Sources RAG */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {msg.sources.map((s, j) => (
                          <span key={j} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Indicateur de frappe */}
              {loading && (
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="rounded-2xl rounded-tl-none bg-muted/50 px-4 py-3 border border-border/20 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/40 animate-bounce" />
                  </div>
                </div>
              )}

              {error && (
                <div className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Zone saisie */}
            <div className="border-t border-border/40 bg-background/60 p-3 flex-shrink-0">
              <form
                className="flex items-center gap-2"
                onSubmit={e => { e.preventDefault(); handleSend(); }}
              >
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Votre question... (Ctrl+Enter)"
                  className="flex-1 rounded-full border border-border/40 bg-background/50 px-4 py-2 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background focus:ring-2 focus:ring-primary/10"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg transition-all hover:scale-105 hover:shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex-shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bouton flottant ──────────────────────────────────────────── */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleOpen}
        className={`group relative flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all duration-300 cursor-pointer ${
          isOpen
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground hover:shadow-primary/30'
        }`}
      >
        {/* Halo animé */}
        <span className="absolute inset-0 -z-10 rounded-full bg-inherit opacity-20 blur-xl transition-opacity duration-300 group-hover:opacity-40" />
        {/* Badge non-lu */}
        {!isOpen && messages.length === 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-background" />
        )}
        {isOpen
          ? <X className="h-6 w-6" />
          : <MessageSquare className="h-6 w-6" />
        }
      </motion.button>

    </div>
  );
}