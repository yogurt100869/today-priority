export const benefitAreas = [
  '身体健康',
  '心理健康',
  '营养与代谢',
  '运动与体能',
  '睡眠与恢复',
  '眼部健康',
  '疾病管理与预防',
  '社交关系',
  '生活环境',
] as const
export const trackingTypes = ['完成状态', '数值', '时长', '次数', '复盘'] as const
export const scheduleUnits = ['每天', '每周', '每月', '每半年', '每年', '自定义间隔'] as const
export const importanceLevels = ['重要', '普通', '可选'] as const

export type BenefitArea = (typeof benefitAreas)[number]
export type TrackingType = (typeof trackingTypes)[number]
export type ScheduleUnit = (typeof scheduleUnits)[number]
export type Importance = (typeof importanceLevels)[number]
export type CheckInStatus = 'completed' | 'partial' | 'skipped'

export interface Habit {
  id: string
  title: string
  benefitAreas: BenefitArea[]
  benefitSchemaVersion?: number
  category?: string
  trackingType: TrackingType
  scheduleUnit: ScheduleUnit
  importance: Importance
  targetCount: number
  targetValue?: number
  valueUnit: string
  intervalDays: number
  suggestion: string
  notes: string
  reminderEnabled: boolean
  reminderTime: string
  nextDueDate?: string
  isPaused: boolean
  isArchived: boolean
  createdAt: string
}

export interface CheckIn {
  id: string
  habitId: string
  timestamp: string
  value?: number
  status: CheckInStatus
}

export interface PriorityResult {
  habit: Habit
  score: number
  reason: string
  completedCount: number
  recordedValue: number
  isComplete: boolean
  isActionable: boolean
}
