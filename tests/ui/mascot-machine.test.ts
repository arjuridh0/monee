import { describe, expect, it } from 'vitest'
import { STATES } from '@mascots/core/mascot_canvas.js'
import {
  APP_EVENT_TO_STATE, MASCOT_EVENTS, createMascotMachine, reactionFor,
  type MascotEvent,
} from '@/features/mascot/mascot-machine'

const EXPECTED: Record<MascotEvent, string> = {
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

describe('mascot state machine', () => {
  it('maps every application event to the documented state', () => {
    expect(Object.keys(APP_EVENT_TO_STATE).sort()).toEqual(MASCOT_EVENTS.slice().sort())
    for (const event of MASCOT_EVENTS) {
      expect(APP_EVENT_TO_STATE[event], event).toBe(EXPECTED[event])
    }
  })

  it('covers all 14 engine states including idle as the resting state', () => {
    expect(new Set([...Object.values(EXPECTED), 'idle'])).toEqual(new Set(STATES))
    expect(STATES).toHaveLength(14)
  })

  it('gives every reaction a finite duration so the mascot recovers', () => {
    for (const event of MASCOT_EVENTS) {
      const reaction = reactionFor(event)
      expect(reaction.duration, event).toBeGreaterThan(0)
      expect(Number.isFinite(reaction.duration), event).toBe(true)
      expect(reaction.priority, event).toBeGreaterThan(0)
    }
  })

  it('shows a reaction, ignores a lower-priority event, then expires back to rest', () => {
    const machine = createMascotMachine()
    const first = machine.dispatch('transactionSaved', 1_000)
    expect(first?.state).toBe('happy')
    expect(machine.current(1_100)).toBe('happy')

    expect(machine.dispatch('openApp', 1_100)).toBeNull()
    expect(machine.current(1_100)).toBe('happy')

    expect(machine.current(1_000 + first!.duration)).toBeNull()
  })

  it('lets a higher-priority event interrupt and restarts equal-priority reactions', () => {
    const machine = createMascotMachine()
    machine.dispatch('budgetWarning', 0)
    const celebrate = machine.dispatch('milestoneReached', 100)
    expect(celebrate?.state).toBe('celebrate')

    expect(machine.current(100 + celebrate!.duration - 1)).toBe('celebrate')
    expect(machine.current(100 + celebrate!.duration)).toBeNull()

    const warning = machine.dispatch('budgetWarning', 10_000)
    const repeated = machine.dispatch('budgetWarning', 11_000)
    expect(warning).not.toBeNull()
    expect(repeated?.endsAt).toBe(11_000 + repeated!.duration)
    expect(repeated!.endsAt).toBeGreaterThan(warning!.endsAt)
  })

  it('resets to no overlay', () => {
    const machine = createMascotMachine()
    machine.dispatch('celebrate', 0)
    machine.reset()
    expect(machine.current(0)).toBeNull()
  })
})
