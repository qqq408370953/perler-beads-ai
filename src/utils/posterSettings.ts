import type { PosterLayoutMode } from './posterLayout';
import type { BackgroundRemovalMode } from './posterProcessing';

export interface PosterSettings {
  title: string;
  subtitle: string;
  bottomTitle: string;
  fixedText: string;
  backgroundStart: string;
  backgroundEnd: string;
  useGradientBackground: boolean;
  layoutMode: PosterLayoutMode;
  backgroundRemovalMode: BackgroundRemovalMode;
  pixelate: boolean;
  addOutline: boolean;
  primaryText: string;
  secondaryText: string;
  outlineColor: string;
}

export function createDefaultPosterSettings(): PosterSettings {
  return {
    title: '',
    subtitle: '',
    bottomTitle: '',
    fixedText: '图纸在粉丝群',
    backgroundStart: '#58C7C2',
    backgroundEnd: '#F4F7F5',
    useGradientBackground: true,
    layoutMode: 'auto',
    backgroundRemovalMode: 'local',
    pixelate: false,
    addOutline: false,
    primaryText: '#FFFFFF',
    secondaryText: '#342217',
    outlineColor: '#24160F',
  };
}
