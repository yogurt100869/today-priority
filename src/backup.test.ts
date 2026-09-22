import { describe, expect, it } from 'vitest'
import { createBackupPayload, mergeAppData, parseBackup, type AppData } from './backup'
import type { CheckIn, Habit } from './types'

const habit = (id: string, title = '冥想'): Habit => ({
  id,
  title,
  benefitAreas: ['心理健康'],
  benefitSchemaVersion: 2,
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
  createdAt: '2026-09-21T04:00:00.000Z',
})

const checkIn = (id: string, habitId: string): CheckIn => ({
  id,
  habitId,
  timestamp: '2026-09-21T04:30:00.000Z',
  status: 'completed',
})

describe('backup data', () => {
  it('round-trips a versioned backup', () => {
    const data: AppData = { habits: [habit('habit-1')], checkIns: [checkIn('check-1', 'habit-1')] }
    const payload = createBackupPayload(data, new Date('2026-09-22T02:00:00.000Z'))

    expect(parseBackup(JSON.stringify(payload))).toEqual(payload)
  })

  it('accepts backups exported before format versions were added', () => {
    const oldBackup = {
      exportedAt: '2026-09-22T02:00:00.000Z',
      appId: 'com.yogurt100869.habitpriority',
      habits: [habit('habit-1')],
      checkIns: [],
    }

    expect(parseBackup(JSON.stringify(oldBackup)).formatVersion).toBe(1)
  })

  it('rejects orphaned check-ins without changing current data', () => {
    const payload = createBackupPayload({
      habits: [habit('habit-1')],
      checkIns: [checkIn('check-1', 'missing-habit')],
    })

    expect(() => parseBackup(JSON.stringify(payload))).toThrow('关联的项目不存在')
  })

  it('merges by stable IDs and lets imported records win', () => {
    const current = {
      habits: [habit('habit-1', '旧名称'), habit('habit-2')],
      checkIns: [checkIn('check-1', 'habit-1')],
    }
    const imported = {
      habits: [habit('habit-1', '备份名称'), habit('habit-3')],
      checkIns: [{ ...checkIn('check-1', 'habit-1'), status: 'partial' as const }],
    }

    const merged = mergeAppData(current, imported)

    expect(merged.habits).toHaveLength(3)
    expect(merged.habits.find((item) => item.id === 'habit-1')?.title).toBe('备份名称')
    expect(merged.checkIns).toEqual(imported.checkIns)
  })
})
