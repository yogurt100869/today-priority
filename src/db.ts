import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { openDB } from 'idb'
import type { BenefitArea, CheckIn, Habit } from './types'

interface AppData {
  habits: Habit[]
  checkIns: CheckIn[]
}

const nativeDataKey = 'habit-priority-data-v1'
const deprecatedStarterHashes = new Set([
  21_947_730,
  631_291_826,
  680_783_359,
  933_467_070,
  1_303_142_544,
  2_384_895_003,
  2_502_184_217,
  2_822_979_630,
  2_845_426_673,
  2_845_514_945,
])

const legacyBenefits: Record<string, BenefitArea[]> = {
  健康习惯: ['身体健康'],
  补充剂: ['营养与代谢', '身体健康'],
  运动: ['运动与体能', '身体健康'],
  眼部保护: ['眼部健康', '疾病管理与预防'],
  心理与生活: ['心理健康'],
  检查: ['疾病管理与预防', '身体健康'],
}

function inferLegacyBenefits(habit: Habit): BenefitArea[] {
  if (habit.title === '睡眠') return ['睡眠与恢复', '身体健康', '心理健康']
  if (habit.title === '晒太阳') return ['身体健康', '心理健康', '睡眠与恢复']
  if (habit.title === '深度交流') return ['社交关系', '心理健康']
  if (habit.title === '兴趣时间') return ['心理健康', '社交关系']
  if (habit.title === '环境整理') return ['生活环境', '心理健康']
  if (habit.title === '数据回顾' || habit.title === '体重/腰围记录') return ['疾病管理与预防', '身体健康']
  if (habit.title.includes('眼') || habit.title.includes('视力')) return ['眼部健康', '疾病管理与预防']
  return legacyBenefits[habit.category ?? ''] ?? habit.benefitAreas ?? ['身体健康']
}

const database = openDB('habit-priority', 1, {
  upgrade(db) {
    const habits = db.createObjectStore('habits', { keyPath: 'id' })
    habits.createIndex('createdAt', 'createdAt')
    const checkIns = db.createObjectStore('checkIns', { keyPath: 'id' })
    checkIns.createIndex('habitId', 'habitId')
  },
})

export async function getAllData() {
  if (Capacitor.isNativePlatform()) {
    return readNativeData()
  }
  const db = await database
  const [storedHabits, checkIns] = await Promise.all([
    db.getAll('habits') as Promise<Habit[]>,
    db.getAll('checkIns') as Promise<CheckIn[]>,
  ])
  const migratedHabits = storedHabits.map((habit) => ({
    ...habit,
    benefitAreas:
      habit.benefitSchemaVersion === 2 || (!habit.category && habit.benefitAreas?.length)
        ? habit.benefitAreas
        : inferLegacyBenefits(habit),
    benefitSchemaVersion: 2,
  }))
  const usedHabitIds = new Set(checkIns.map((checkIn) => checkIn.habitId))
  const habits = migratedHabits.filter((habit) =>
    usedHabitIds.has(habit.id) || !deprecatedStarterHashes.has(stableHash(habit.title))
  )
  const removed = migratedHabits.filter((habit) => !habits.includes(habit))
  const storedById = new Map(storedHabits.map((habit) => [habit.id, habit]))
  const migrated = habits.filter((habit) => storedById.get(habit.id)?.benefitSchemaVersion !== 2)
  await Promise.all(migrated.map((habit) => db.put('habits', habit)))
  await Promise.all(removed.map((habit) => db.delete('habits', habit.id)))
  return { habits, checkIns }
}

export async function saveHabit(habit: Habit) {
  if (Capacitor.isNativePlatform()) {
    const data = await readNativeData()
    const saved = { ...habit, benefitSchemaVersion: 2 }
    const index = data.habits.findIndex((item) => item.id === saved.id)
    if (index >= 0) data.habits[index] = saved
    else data.habits.push(saved)
    await writeNativeData(data)
    return saved.id
  }
  return (await database).put('habits', { ...habit, benefitSchemaVersion: 2 })
}

export async function saveCheckIn(checkIn: CheckIn) {
  if (Capacitor.isNativePlatform()) {
    const data = await readNativeData()
    const index = data.checkIns.findIndex((item) => item.id === checkIn.id)
    if (index >= 0) data.checkIns[index] = checkIn
    else data.checkIns.push(checkIn)
    await writeNativeData(data)
    return checkIn.id
  }
  return (await database).put('checkIns', checkIn)
}

export async function deleteHabitData(habitId: string) {
  if (Capacitor.isNativePlatform()) {
    const data = await readNativeData()
    await writeNativeData({
      habits: data.habits.filter((habit) => habit.id !== habitId),
      checkIns: data.checkIns.filter((checkIn) => checkIn.habitId !== habitId),
    })
    return
  }
  const db = await database
  const transaction = db.transaction(['habits', 'checkIns'], 'readwrite')
  await transaction.objectStore('habits').delete(habitId)
  const checkInStore = transaction.objectStore('checkIns')
  for (const key of await checkInStore.index('habitId').getAllKeys(habitId)) {
    await checkInStore.delete(key)
  }
  await transaction.done
}

export async function deleteCheckIn(id: string) {
  if (Capacitor.isNativePlatform()) {
    const data = await readNativeData()
    data.checkIns = data.checkIns.filter((checkIn) => checkIn.id !== id)
    await writeNativeData(data)
    return
  }
  return (await database).delete('checkIns', id)
}

export async function replaceAllData(habits: Habit[], checkIns: CheckIn[] = []) {
  if (Capacitor.isNativePlatform()) {
    await writeNativeData({ habits, checkIns })
    return
  }
  const db = await database
  const transaction = db.transaction(['habits', 'checkIns'], 'readwrite')
  await transaction.objectStore('habits').clear()
  await transaction.objectStore('checkIns').clear()
  for (const habit of habits) await transaction.objectStore('habits').put(habit)
  for (const checkIn of checkIns) await transaction.objectStore('checkIns').put(checkIn)
  await transaction.done
}

async function readNativeData(): Promise<AppData> {
  const { value } = await Preferences.get({ key: nativeDataKey })
  if (!value) return { habits: [], checkIns: [] }
  const parsed: unknown = JSON.parse(value)
  if (!isAppData(parsed)) {
    throw new Error('本地数据格式无效，请恢复备份或重置示例数据')
  }
  const sanitized = removeDeprecatedUnusedStarters(parsed)
  if (sanitized.habits.length !== parsed.habits.length) {
    await writeNativeData(sanitized)
  }
  return sanitized
}

async function writeNativeData(data: AppData) {
  await Preferences.set({ key: nativeDataKey, value: JSON.stringify(data) })
}

function isAppData(value: unknown): value is AppData {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AppData>
  return Array.isArray(candidate.habits) && Array.isArray(candidate.checkIns)
}

function removeDeprecatedUnusedStarters(data: AppData): AppData {
  const usedHabitIds = new Set(data.checkIns.map((checkIn) => checkIn.habitId))
  return {
    habits: data.habits.filter((habit) =>
      usedHabitIds.has(habit.id) || !deprecatedStarterHashes.has(stableHash(habit.title))
    ),
    checkIns: data.checkIns,
  }
}

function stableHash(value: string) {
  let hash = 0
  for (const character of value) {
    hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0
  }
  return hash >>> 0
}
