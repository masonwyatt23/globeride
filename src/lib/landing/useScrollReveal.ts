/**
 * useScrollReveal — adds `.is-visible` to observed elements when they cross
 * the 20 % threshold. One shared IntersectionObserver per call site (not per
 * element). Cleans up on unmount.
 *
 * Respects `prefers-reduced-motion: reduce` — when the user prefers reduced
 * motion the hook is a no-op and elements stay at full opacity immediately.
 *
 * Usage:
 *   const containerRef = useScrollReveal<HTMLDivElement>();
 *   <div ref={containerRef} className="landing-fade-in-up">…</div>
 *
 *   For staggered children, pass a CSS selector:
 *   const containerRef = useScrollReveal<HTMLDivElement>({ childSelector: '.reveal-child' });
 *   — each matching child gets observed individually with an index-based
 *     `--reveal-delay` CSS variable so you can drive stagger from CSS.
 */
import { useEffect, useRef } from 'react';

export interface ScrollRevealOptions {
  /** Root margin — default '0px 0px -80px 0px' (fires 80 px before bottom edge) */
  rootMargin?: string;
  /** Intersection threshold — default 0.12 */
  threshold?: number;
  /**
   * If provided, the hook observes all matching children of the ref element
   * rather than the element itself. Each child gets a `--reveal-delay` CSS
   * variable set to `index * delayStep` ms.
   */
  childSelector?: string;
  /** Delay step between staggered children in ms — default 60 */
  delayStep?: number;
}

export function useScrollReveal<T extends Element = Element>(
  options: ScrollRevealOptions = {},
): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  const {
    rootMargin = '0px 0px -80px 0px',
    threshold = 0.12,
    childSelector,
    delayStep = 60,
  } = options;

  useEffect(() => {
    // Respect user motion preference — skip entirely, elements render normally
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Make everything visible immediately without animation
      if (ref.current) {
        if (childSelector) {
          ref.current.querySelectorAll(childSelector).forEach(el => {
            el.classList.add('is-visible');
          });
        } else {
          ref.current.classList.add('is-visible');
        }
      }
      return;
    }

    if (!ref.current) return;

    const targets: Element[] = childSelector
      ? Array.from(ref.current.querySelectorAll(childSelector))
      : [ref.current];

    if (targets.length === 0) return;

    // Reduce stagger by 50% on mobile — content stacks compactly so full
    // delays feel sluggish. Breakpoint mirrors Tailwind's `md` (768px).
    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767px)').matches;
    const effectiveDelayStep = isMobile ? delayStep * 0.5 : delayStep;

    // Set stagger delay variables on children before observing
    if (childSelector) {
      targets.forEach((el, i) => {
        (el as HTMLElement).style.setProperty('--reveal-delay', `${i * effectiveDelayStep}ms`);
      });
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            // Unobserve after reveal — fire once only
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin, threshold },
    );

    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [rootMargin, threshold, childSelector, delayStep]);

  return ref;
}
