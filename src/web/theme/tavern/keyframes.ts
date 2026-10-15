import { defineKeyframes } from '@pandacss/dev'

const gemGlow = (outer: number, spread: number, alpha: number) => `0 0 ${outer}px hsl(45 100% 55% / ${alpha === 0.4 ? 0.8 : 1}), 0 0 ${spread}px hsl(45 100% 50% / ${alpha}), inset 0 -1px 2px hsl(30 80% 30% / 0.4), inset 0 1px 1px hsl(50 100% 85% / 0.5)`

const spinnerGlow = (blur: number, near: number, nearAlpha: number, far: number, farAlpha: number, rgb: string) => `blur(${blur}px) drop-shadow(0 0 ${near}px rgb(${rgb} / ${nearAlpha})) drop-shadow(0 0 ${far}px rgb(${rgb} / ${farAlpha}))`

export const keyframes = defineKeyframes({
  wcShimmer: {
    '0%': { transform: 'translateX(-100%) skewX(-15deg)' },
    '100%': { transform: 'translateX(200%) skewX(-15deg)' },
  },
  wcIconPulse: {
    '0%, 100%': { opacity: 0.03 },
    '50%': { opacity: 0.08 },
  },
  wcSpinnerFlicker: {
    '0%, 100%': { transform: 'translateY(0) scale(1)' },
    '50%': { transform: 'translateY(-0.03px) scale(1.0007)' },
  },
  wcSpinnerCore: {
    '0%, 100%': { opacity: 0.2, color: 'rgb(102 255 153 / 0.2)' },
    '25%': { opacity: 0.62, color: 'rgb(110 255 159 / 0.62)' },
    '50%': { opacity: 0.98, color: 'rgb(136 255 176 / 0.98)' },
    '75%': { opacity: 0.64, color: 'rgb(112 255 161 / 0.64)' },
  },
  wcSpinnerGlow: {
    '0%, 100%': { opacity: 0.08, filter: spinnerGlow(1.2, 2, 0.12, 5, 0.06, '102 255 153') },
    '25%': { opacity: 0.24, filter: spinnerGlow(1.6, 6, 0.28, 14, 0.14, '110 255 159') },
    '50%': { opacity: 0.52, filter: spinnerGlow(2.2, 10, 0.42, 20, 0.2, '130 255 172') },
    '75%': { opacity: 0.26, filter: spinnerGlow(1.7, 7, 0.3, 15, 0.14, '112 255 161') },
  },
  wcGemPulse: {
    '0%, 100%': { boxShadow: gemGlow(4, 10, 0.4) },
    '50%': { boxShadow: gemGlow(6, 16, 0.55) },
  },
  wcLightSweep: {
    from: { transform: 'translateX(-100%)', opacity: 1 },
    to: { transform: 'translateX(100%)', opacity: 0 },
  },
})
