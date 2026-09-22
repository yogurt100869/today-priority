import {
  benefitAreas,
  importanceLevels,
  scheduleUnits,
  trackingTypes,
  type CheckIn,
  type CheckInStatus,
  type Habit,
} from './types'

export interface AppData {
  habits: Habit[]
  checkIns: CheckIn[]
}

export interface BackupPayload extends AppData {
  formatVersion: 1
  exportedAt: string
  appId: 'com.yogurt100869.habitpriority'
}

const statuses: CheckInStatus[] = ['completed', 'partial', 'skipped']

export function createBackupPayload(data: AppData, now = new Date()): BackupPayload {
  return {
    formatVersion: 1,
    exportedAt: now.toISOString(),
    appId: 'com.yogurt100869.habitpriority',
    habits: data.habits,
    checkIns: data.checkIns,
  }
}

export function parseBackup(text: string): BackupPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('无法读取备份：文件不是有效的 JSON')
  }
  if (!isRecord(parsed) || parsed.appId !== 'com.yogurt100869.habitpriority') {
    throw new Error('无法读取备份：这不是“今日优先”的数据文件')
  }
  if (parsed.formatVersion !== undefined && parsed.formatVersion !== 1) {
    throw new Error('无法读取备份：文件版本过新，请先更新 App')
  }
  if (!isIsoDate(parsed.exportedAt) || !Array.isArray(parsed.habits) || !Array.isArray(parsed.checkIns)) {
    throw new Error('无法读取备份：缺少必要的数据')
  }

  const habits = parsed.habits.map(parseHabit)
  const habitIds = new Set<string>()
  for (const habit of habits) {
    if (habitIds.has(habit.id)) throw new Error(`无法读取备份：项目 ID 重复（${habit.title}）`)
    habitIds.add(habit.id)
  }

  const checkIns = parsed.checkIns.map(parseCheckIn)
  const checkInIds = new Set<string>()
  for (const checkIn of checkIns) {
    if (checkInIds.has(checkIn.id)) throw new Error('无法读取备份：存在重复的打卡记录')
    if (!habitIds.has(checkIn.habitId)) throw new Error('无法读取备份：打卡记录关联的项目不存在')
    checkInIds.add(checkIn.id)
  }

  return {
    formatVersion: 1,
    exportedAt: parsed.exportedAt,
    appId: 'com.yogurt100869.habitpriority',
    habits,
    checkIns,
  }
}

export function mergeAppData(current: AppData, imported: AppData): AppData {
  const habits = new Map(current.habits.map((habit) => [habit.id, habit]))
  const checkIns = new Map(current.checkIns.map((checkIn) => [checkIn.id, checkIn]))
  imported.habits.forEach((habit) => habits.set(habit.id, habit))
  imported.checkIns.forEach((checkIn) => checkIns.set(checkIn.id, checkIn))
  return { habits: [...habits.values()], checkIns: [...checkIns.values()] }
}

function parseHabit(value: unknown, index: number): Habit {
  if (!isRecord(value)) throw invalidHabit(index)
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const areas = value.benefitAreas
  if (
    !requiredString(value.id) ||
    !title ||
    !Array.isArray(areas) ||
    areas.length === 0 ||
    !areas.every((area) => typeof area === 'string' && benefitAreas.includes(area as Habit['benefitAreas'][number])) ||
    !trackingTypes.includes(value.trackingType as Habit['trackingType']) ||
    !scheduleUnits.includes(value.scheduleUnit as Habit['scheduleUnit']) ||
    !importanceLevels.includes(value.importance as Habit['importance']) ||
    !positiveNumber(value.targetCount) ||
    (value.targetValue !== undefined && !positiveNumber(value.targetValue)) ||
    !requiredString(value.valueUnit, true) ||
    !positiveNumber(value.intervalDays) ||
    !requiredString(value.suggestion, true) ||
    !requiredString(value.notes, true) ||
    typeof value.reminderEnabled !== 'boolean' ||
    !isTime(value.reminderTime) ||
    (value.nextDueDate !== undefined && !isDate(value.nextDueDate)) ||
    typeof value.isPaused !== 'boolean' ||
    typeof value.isArchived !== 'boolean' ||
    !isIsoDate(value.createdAt)
  ) {
    throw invalidHabit(index, title)
  }
  return {
    id: value.id as string,
    title,
    benefitAreas: [...areas] as Habit['benefitAreas'],
    benefitSchemaVersion: 2,
    trackingType: value.trackingType as Habit['trackingType'],
    scheduleUnit: value.scheduleUnit as Habit['scheduleUnit'],
    importance: value.importance as Habit['importance'],
    targetCount: value.targetCount as number,
    targetValue: value.targetValue as number | undefined,
    valueUnit: value.valueUnit as string,
    intervalDays: value.intervalDays as number,
    suggestion: value.suggestion as string,
    notes: value.notes as string,
    reminderEnabled: value.reminderEnabled,
    reminderTime: value.reminderTime as string,
    nextDueDate: value.nextDueDate as string | undefined,
    isPaused: value.isPaused,
    isArchived: value.isArchived,
    createdAt: value.createdAt as string,
  }
}

function parseCheckIn(value: unknown, index: number): CheckIn {
  if (
    !isRecord(value) ||
    !requiredString(value.id) ||
    !requiredString(value.habitId) ||
    !isIsoDate(value.timestamp) ||
    (value.value !== undefined && !Number.isFinite(value.value)) ||
    !statuses.includes(value.status as CheckInStatus)
  ) {
    throw new Error(`无法读取备份：第 ${index + 1} 条打卡记录格式无效`)
  }
  return {
    id: value.id as string,
    habitId: value.habitId as string,
    timestamp: value.timestamp as string,
    value: value.value as number | undefined,
    status: value.status as CheckInStatus,
  }
}

function invalidHabit(index: number, title?: string) {
  return new Error(`无法读取备份：第 ${index + 1} 个项目${title ? `“${title}”` : ''}格式无效`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || value.trim().length > 0)
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}
