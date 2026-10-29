export const CATEGORY_ICONS = [
  'utensils', 'coffee', 'car', 'smartphone', 'shopping-bag', 'party-popper',
  'hand-heart', 'piggy-bank', 'graduation-cap', 'shapes', 'briefcase',
  'sparkles', 'laptop', 'gift', 'home', 'shield', 'plane', 'umbrella', 'target',
] as const

export type CategoryIconName = typeof CATEGORY_ICONS[number]

export const CATEGORY_COLORS = [
  '#E6EFDB', '#F3E3D3', '#FBE3CE', '#E4DFF5', '#F7DCD6',
  '#F8E9CE', '#DCEEE0', '#DDE9F7', '#ECE6DC', '#DCE7EB',
] as const
