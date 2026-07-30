import type { Config } from 'tailwindcss';
import { ultisproPreset } from '../../packages/config/tailwind-preset';

const config: Config = {
  presets: [ultisproPreset],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: 'class',
};

export default config;
