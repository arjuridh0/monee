import { Utensils, Coffee, Car, Smartphone, ShoppingBag, PartyPopper, HandHeart, PiggyBank, GraduationCap, Shapes, Briefcase, Sparkles, Laptop, Gift, Home, Shield, Plane, Umbrella, Target, type LucideIcon, type LucideProps } from 'lucide-react'
import type { CategoryIconName } from '@/core/finance/category-options'

const icons: Record<CategoryIconName, LucideIcon> = {
  utensils: Utensils, coffee: Coffee, car: Car, smartphone: Smartphone,
  'shopping-bag': ShoppingBag, 'party-popper': PartyPopper, 'hand-heart': HandHeart,
  'piggy-bank': PiggyBank, 'graduation-cap': GraduationCap, shapes: Shapes,
  briefcase: Briefcase, sparkles: Sparkles, laptop: Laptop, gift: Gift,
  home: Home, shield: Shield, plane: Plane, umbrella: Umbrella, target: Target,
}

export function CategoryIcon({ name, ...props }: LucideProps & { name?: string }) {
  const Icon = icons[name as keyof typeof icons] ?? Target
  return <Icon size={18} aria-hidden="true" {...props} />
}
