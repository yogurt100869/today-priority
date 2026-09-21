import type { CheckIn, Habit, PriorityResult, ScheduleUnit } from './types'

const DAY = 86_400_000

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function periodRange(habit: Habit, now: Date): [Date, Date] {
  const day = startOfDay(now)
  switch (habit.scheduleUnit) {
    case '每天':
      return [day, new Date(day.getTime() + DAY)]
    case '每周': {
      const offset = (day.getDay() + 6) % 7
      const start = new Date(day.getTime() - offset * DAY)
      return [start, new Date(start.getTime() + 7 * DAY)]
    }
    case '每月':
      return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)]
    case '每半年': {
      const month = now.getMonth() < 6 ? 0 : 6
      return [new Date(now.getFullYear(), month, 1), new Date(now.getFullYear(), month + 6, 1)]
    }
    case '每年':
      return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)]
    case '自定义间隔':
      return [new Date(day.getTime() - (habit.intervalDays - 1) * DAY), new Date(day.getTime() + DAY)]
  }
}

function approximateDays(unit: ScheduleUnit, intervalDays: number) {
  return { 每天: 1, 每周: 7, 每月: 30, 每半年: 183, 每年: 365, 自定义间隔: intervalDays }[unit]
}

function actionability(habit: Habit, now: Date, periodEnd: Date) {
  if (habit.scheduleUnit === '每月') {
    return periodEnd.getTime() - now.getTime() <= 7 * DAY
  }
  if (habit.scheduleUnit === '每半年' || habit.scheduleUnit === '每年') {
    return !habit.nextDueDate || new Date(habit.nextDueDate).getTime() - now.getTime() <= 30 * DAY
  }
  return true
}

export function evaluateHabit(habit: Habit, checkIns: CheckIn[], now = new Date()): PriorityResult {
  const [periodStart, periodEnd] = periodRange(habit, now)
  const periodItems = checkIns.filter((item) => {
    const date = new Date(item.timestamp)
    return item.habitId === habit.id && date >= periodStart && date < periodEnd
  })
  const matching = periodItems.filter((item) => item.status !== 'skipped')
  const completedCount = matching.filter((item) => item.status === 'completed').length
  const recordedValue = matching.reduce((sum, item) => sum + (item.value ?? 0), 0)
  const usesValue = habit.trackingType === '数值' || habit.trackingType === '时长'
  const isComplete = usesValue
    ? recordedValue >= (habit.targetValue ?? 1)
    : completedCount >= habit.targetCount

  if (isComplete) {
    return { habit, score: 0, reason: `${habit.scheduleUnit}目标已完成`, completedCount, recordedValue, isComplete: true, isActionable: true }
  }

  const latest = checkIns
    .filter((item) => item.habitId === habit.id && item.status === 'completed')
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  const referenceDate = latest ? new Date(latest.timestamp) : new Date(habit.createdAt)
  const elapsedDays = Math.max(0, Math.floor((startOfDay(now).getTime() - startOfDay(referenceDate).getTime()) / DAY))
  const periodDays = approximateDays(habit.scheduleUnit, habit.intervalDays)
  const missedPeriods = latest
    ? Math.max(0, Math.floor(elapsedDays / periodDays) - 1)
    : Math.max(0, Math.floor(elapsedDays / periodDays))
  const remainingCount = Math.max(1, habit.targetCount - completedCount)
  const daysRemaining = Math.max(1, Math.ceil((periodEnd.getTime() - now.getTime()) / DAY))
  const baseScore = habit.importance === '重要' ? 20 : habit.importance === '普通' ? 10 : 0
  const score = Math.min(
    100,
    baseScore +
      (habit.scheduleUnit === '每天' ? 15 : 0) +
      Math.min(20, Math.floor((remainingCount / daysRemaining) * 10)) +
      Math.min(30, missedPeriods * 10) +
      Math.min(20, missedPeriods * 5),
  )

  let reason = `${habit.scheduleUnit}尚未完成`
  if (missedPeriods > 0) reason = `已错过 ${missedPeriods} 个周期`
  else if (remainingCount > daysRemaining) reason = `本周期还差 ${remainingCount} 次，仅剩 ${daysRemaining} 天`
  else if (habit.scheduleUnit !== '每天') reason = `本周期已完成 ${completedCount}/${habit.targetCount}`

  return {
    habit,
    score,
    reason,
    completedCount,
    recordedValue,
    isComplete: false,
    isActionable: !periodItems.some((item) => item.status === 'skipped') && actionability(habit, now, periodEnd),
  }
}

export function sortedPriorities(habits: Habit[], checkIns: CheckIn[], now = new Date()) {
  return habits
    .filter((habit) => !habit.isPaused && !habit.isArchived)
    .map((habit) => evaluateHabit(habit, checkIns, now))
    .filter((result) => result.isActionable)
    .sort((a, b) => Number(a.isComplete) - Number(b.isComplete) || b.score - a.score || a.habit.title.localeCompare(b.habit.title))
}
