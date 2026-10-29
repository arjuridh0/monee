import type { MascotState } from '@mascots/core/mascot_canvas.js'

export type MascotEvent =
  | 'openApp'
  | 'idleTimeout'
  | 'tapMascot'
  | 'petMascot'
  | 'transactionSaved'
  | 'incomeSaved'
  | 'savingsDeposit'
  | 'refundSaved'
  | 'salaryIn'
  | 'budgetWarning'
  | 'budgetBlocked'
  | 'balanceShort'
  | 'periodLocked'
  | 'rapidTap'
  | 'suddenExpense'
  | 'milestoneReached'
  | 'aiListening'
  | 'aiProcessing'
  | 'nightTime'

export const MASCOT_EVENTS: readonly MascotEvent[] = [
  'openApp', 'idleTimeout', 'tapMascot', 'petMascot',
  'transactionSaved', 'incomeSaved', 'savingsDeposit', 'refundSaved', 'salaryIn',
  'budgetWarning', 'budgetBlocked', 'balanceShort', 'periodLocked',
  'rapidTap', 'suddenExpense', 'milestoneReached',
  'aiListening', 'aiProcessing', 'nightTime',
]

/** Kontrak event aplikasi → state (dok 11 §5.2, dok 03). */
export const APP_EVENT_TO_STATE: Record<MascotEvent, MascotState> = {
  openApp: 'greeting',
  idleTimeout: 'gabut',
  tapMascot: 'tap',
  petMascot: 'pet',
  transactionSaved: 'happy',
  incomeSaved: 'happy',
  savingsDeposit: 'happy',
  refundSaved: 'surprised',
  salaryIn: 'happy',
  budgetWarning: 'annoyed',
  budgetBlocked: 'annoyed',
  balanceShort: 'sad',
  periodLocked: 'thinking',
  rapidTap: 'angry',
  suddenExpense: 'surprised',
  milestoneReached: 'celebrate',
  aiListening: 'listening',
  aiProcessing: 'thinking',
  nightTime: 'sleepy',
}

const DURATION: Record<MascotState, number> = {
  idle: 0,
  tap: 900,
  pet: 1200,
  greeting: 2600,
  happy: 1800,
  angry: 2500,
  sad: 2600,
  surprised: 1500,
  listening: 8000,
  thinking: 2500,
  annoyed: 2600,
  celebrate: 3000,
  gabut: 8000,
  sleepy: 8000,
}

const PRIORITY: Record<MascotEvent, number> = {
  rapidTap: 100,
  tapMascot: 95,
  petMascot: 94,
  milestoneReached: 90,
  balanceShort: 85,
  budgetBlocked: 80,
  budgetWarning: 75,
  suddenExpense: 70,
  refundSaved: 65,
  transactionSaved: 60,
  incomeSaved: 60,
  savingsDeposit: 60,
  salaryIn: 60,
  aiListening: 58,
  periodLocked: 56,
  aiProcessing: 54,
  openApp: 40,
  idleTimeout: 10,
  nightTime: 5,
}

export interface MascotReaction {
  state: MascotState
  priority: number
  duration: number
}

export interface ActiveReaction extends MascotReaction {
  startedAt: number
  endsAt: number
}

export function reactionFor(event: MascotEvent): MascotReaction {
  const state = APP_EVENT_TO_STATE[event]
  return { state, priority: PRIORITY[event], duration: DURATION[state] }
}

export interface MascotMachine {
  /** Returns the accepted reaction, or null when a higher-priority one is still active. */
  dispatch(event: MascotEvent, now?: number): ActiveReaction | null
  /** Current overlay state at `now`, or null when nothing is active. */
  current(now?: number): MascotState | null
  reset(): void
}

export function createMascotMachine(): MascotMachine {
  let active: ActiveReaction | null = null
  const expire = (now: number) => {
    if (active && now >= active.endsAt) active = null
  }
  return {
    dispatch(event, now = performance.now()) {
      if (!(event in APP_EVENT_TO_STATE)) return null
      expire(now)
      const next = reactionFor(event)
      if (active && next.priority < active.priority) return null
      active = { ...next, startedAt: now, endsAt: now + next.duration }
      return active
    },
    current(now = performance.now()) {
      expire(now)
      return active?.state ?? null
    },
    reset() {
      active = null
    },
  }
}
