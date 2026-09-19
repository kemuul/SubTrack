import type { CategoryName } from './types';

export const colors = {
  rose: '#C78997',
  peach: '#F5B297',
  apricot: '#F5D6A2',
  cream: '#F5E4C4',
  slate: '#8A99B1',
  ink: '#2E3342',
  muted: '#6F7482',
  surface: '#FFFDF8',
  white: '#FFFFFF',
  success: '#6E9A80',
  danger: '#B9636D',
  line: '#E9DFD3',
};

export const categoryMeta: Record<
  CategoryName,
  { color: string; icon: string }
> = {
  Entertainment: { color: colors.rose, icon: 'movie-open-outline' },
  Music: { color: colors.slate, icon: 'music-note' },
  Productivity: { color: colors.peach, icon: 'briefcase-outline' },
  Utilities: { color: colors.apricot, icon: 'flash-outline' },
  Health: { color: '#A9BFA8', icon: 'heart-pulse' },
  Education: { color: '#A9A5C7', icon: 'school-outline' },
  Other: { color: '#B5ACA6', icon: 'shape-outline' },
};

export const categories = Object.keys(categoryMeta) as CategoryName[];

export const shadows = {
  card: {
    shadowColor: '#66544C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 4,
  },
};
