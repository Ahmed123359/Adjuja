import { useEffect } from 'react';

export function useScrollAnimation(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const elements = container.querySelectorAll<HTMLElement>('.animate-on-scroll');

    // Apply staggered transition delay
    elements.forEach((el, i) => {
      const stagger = el.dataset.stagger !== undefined ? +el.dataset.stagger : i;
      el.style.transitionDelay = `${stagger * 80}ms`;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ref]);
}
