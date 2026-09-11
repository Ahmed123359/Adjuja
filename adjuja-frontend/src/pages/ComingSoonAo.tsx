import { DotLottieReact } from '@lottiefiles/dotlottie-react';

export default function ComingSoonAo() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center gap-6"
      style={{ height: '100%', background: 'var(--l-bg)' }}
    >
      <DotLottieReact
        src="/coming-soon.json"
        loop
        autoplay
        style={{ width: 160, height: 64 }}
      />

      <h2
        className="text-center font-bold"
        style={{
          fontSize: 24,
          color: 'var(--l-text)',
          letterSpacing: '-0.025em',
          lineHeight: 1.3,
          margin: 0,
        }}
      >
        Votre dossier AO complet,<br />en quelques clics.
      </h2>

      <p
        className="text-center"
        style={{
          fontSize: 14,
          color: 'var(--l-sub)',
          maxWidth: 300,
          margin: 0,
          lineHeight: 1.6,
        }}
      >
        Upload CPS &amp; RC. ADJUJA génère, signe et compile.
        <br />
        <span style={{ color: 'var(--l-blue)', fontWeight: 600 }}>Bientôt disponible.</span>
      </p>
    </div>
  );
}
