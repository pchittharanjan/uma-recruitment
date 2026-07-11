'use client';

import confetti from 'canvas-confetti';

/** Confetti palette: 3 blues + 3 oranges. */
const RECRUITMENT_CONFETTI_COLORS = [
  '#003665', // navy
  '#1a5a8a', // mid blue
  '#5C59B6', // indigo
  '#EF9251', // soft orange
  '#FF6038', // bright orange
  '#DD6A56', // coral orange
];

/** Fireworks-style confetti burst (canvas-confetti). */
export function fireRecruitmentConfetti(durationMs = 4000) {
  if (typeof window === 'undefined') return;

  const animationEnd = Date.now() + durationMs;
  const defaults = {
    startVelocity: 30,
    spread: 360,
    ticks: 60,
    zIndex: 100,
    colors: RECRUITMENT_CONFETTI_COLORS,
  };

  const randomInRange = (min: number, max: number) =>
    Math.random() * (max - min) + min;

  const interval = window.setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) {
      clearInterval(interval);
      return;
    }

    const particleCount = 50 * (timeLeft / durationMs);
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
    });
  }, 250);
}
