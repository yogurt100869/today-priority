import { describe, expect, it } from 'vitest'
import { evaluateHabit } from './priority'
import { createStarterHabits } from './starterData'
import type { CheckIn, Habit } from './types'

const habit = (overrides: Partial<Habit> = {}): Habit => ({
  id: 'habit-1',
  title: '冥想',
  benefitAreas: ['心理健康'],
  trackingType: '完成状态',
  scheduleUnit: '每天',
  importance: '重要',
  targetCount: 1,
  valueUnit: '',
  intervalDays: 1,
  suggestion: '10分钟',
  notes: '',
  reminderEnabled: false,
  reminderTime: '21:00',
  isPaused: false,
  isArchived: false,
  createdAt: '2026-09-15T04:00:00.000Z',
  ...overrides,
})

describe('evaluateHabit', () => {
  it('raises missed important daily habits to high priority', () => {
    const checkIn: CheckIn = { id: 'check-1', habitId: 'habit-1', timestamp: '2026-09-16T04:00:00.000Z', status: 'completed' }
    const result = evaluateHabit(habit(), [checkIn], new Date('2026-09-21T04:00:00.000Z'))
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.reason).toContain('错过')
  })

  it('sets completed period priority to zero', () => {
    const now = new Date('2026-09-21T04:00:00.000Z')
    const result = evaluateHabit(habit(), [{ id: 'check-1', habitId: 'habit-1', timestamp: now.toISOString(), status: 'completed' }], now)
    expect(result.isComplete).toBe(true)
    expect(result.score).toBe(0)
  })

  it('hides a skipped item for its current period', () => {
    const now = new Date('2026-09-21T04:00:00.000Z')
    const result = evaluateHabit(habit(), [{ id: 'skip-1', habitId: 'habit-1', timestamp: now.toISOString(), status: 'skipped' }], now)
    expect(result.isActionable).toBe(false)
  })

  it('assigns multiple benefit areas to starter habits', () => {
    const habits = createStarterHabits(new Date('2026-09-21T04:00:00.000Z'))
    expect(habits).toHaveLength(28)
    expect(habits.find((item) => item.title === '睡眠')?.benefitAreas)
      .toEqual(['睡眠与恢复', '身体健康', '心理健康'])
    expect(habits.find((item) => item.title === '深度交流')?.benefitAreas)
      .toEqual(['社交关系', '心理健康'])
  })
})
