import type { BenefitArea, Habit, ScheduleUnit, TrackingType } from './types'

type Overrides = Partial<Pick<Habit, 'importance' | 'targetCount' | 'targetValue' | 'valueUnit' | 'notes'>>
type LegacyCategory = '健康习惯' | '补充剂' | '运动' | '眼部保护' | '心理与生活' | '检查'
type Template = [string, LegacyCategory, TrackingType, ScheduleUnit, string, Overrides]

const templates: Template[] = [
  ['饮水', '健康习惯', '数值', '每天', '1.5–2升，少量多次', { importance: '重要', targetValue: 1800, valueUnit: 'ml', notes: '早起一杯温水' }],
  ['蔬菜水果', '健康习惯', '完成状态', '每天', '深色蔬菜300–500克，低糖水果200–350克', {}],
  ['维生素', '补充剂', '完成状态', '每天', '按说明书或医嘱服用', { notes: '建议随餐' }],
  ['坚果', '健康习惯', '数值', '每天', '一小把，约20–30克', { targetValue: 25, valueUnit: '克' }],
  ['牛奶', '健康习惯', '数值', '每天', '300–400毫升', { targetValue: 350, valueUnit: 'ml' }],
  ['玫瑰花水', '健康习惯', '完成状态', '每天', '温水冲泡1杯，上午或下午饮用', {}],
  ['晒太阳', '健康习惯', '时长', '每天', '避开正午强光，晒15–30分钟', { targetValue: 15, valueUnit: '分钟' }],
  ['冥想', '心理与生活', '时长', '每天', '早晨或睡前进行10–15分钟', { importance: '重要', targetValue: 10, valueUnit: '分钟' }],
  ['拉筋', '运动', '时长', '每天', '起床后或睡前进行', { targetValue: 10, valueUnit: '分钟' }],
  ['面部瑜伽', '健康习惯', '时长', '每天', '早晚均可', { targetValue: 5, valueUnit: '分钟' }],
  ['步数', '运动', '数值', '每天', '日常累积6000–8000步', { importance: '重要', targetValue: 6000, valueUnit: '步' }],
  ['久坐中断', '健康习惯', '次数', '每天', '每45–60分钟起身活动3–5分钟', { targetCount: 6 }],
  ['用眼休息', '眼部保护', '次数', '每天', '使用20-20-20法则', { targetCount: 6 }],
  ['睡眠', '健康习惯', '时长', '每天', '保持7–8小时固定作息', { importance: '重要', targetValue: 7, valueUnit: '小时' }],
  ['护眼环境', '眼部保护', '完成状态', '每天', '避免在晃动或昏暗环境看屏幕', {}],
  ['避免揉眼', '眼部保护', '复盘', '每天', '出现眼部不适时咨询专业人士', {}],
  ['有氧运动', '运动', '次数', '每周', '每次30–45分钟', { importance: '重要', targetCount: 3 }],
  ['抗阻训练', '运动', '次数', '每周', '每次20–40分钟，避免憋气', { targetCount: 2 }],
  ['俯卧撑', '运动', '次数', '每周', '每次3–5组', { targetCount: 3 }],
  ['练背', '运动', '次数', '每周', '每次15–20分钟', { targetCount: 2 }],
  ['深度交流', '心理与生活', '次数', '每周', '与亲友交流30分钟以上', {}],
  ['兴趣时间', '心理与生活', '时长', '每周', '留出1–2小时给爱好', { targetValue: 1, valueUnit: '小时' }],
  ['体重/腰围记录', '健康习惯', '完成状态', '每周', '固定时间测量并记录', {}],
  ['情绪释放', '心理与生活', '完成状态', '每周', '散步、写日记或听音乐', {}],
  ['情绪复盘', '心理与生活', '复盘', '每月', '回顾情绪波动和压力来源', {}],
  ['环境整理', '健康习惯', '完成状态', '每月', '清洁空间并保持通风', {}],
  ['数据回顾', '健康习惯', '复盘', '每月', '查看体重、腰围和睡眠趋势', {}],
  ['全面体检', '检查', '完成状态', '每年', '按个人情况和医生建议体检', { importance: '重要' }],
]

export function createStarterHabits(now = new Date()): Habit[] {
  return templates.map(([title, category, trackingType, scheduleUnit, suggestion, overrides], index) => {
    const dueMonths = scheduleUnit === '每半年' ? 6 : scheduleUnit === '每年' ? 12 : 0
    const due = dueMonths
      ? new Date(now.getFullYear(), now.getMonth() + dueMonths, now.getDate()).toISOString().slice(0, 10)
      : undefined
    return {
      id: crypto.randomUUID(),
      title,
      benefitAreas: benefitsFor(title, category),
      benefitSchemaVersion: 2,
      trackingType,
      scheduleUnit,
      importance: overrides.importance ?? '普通',
      targetCount: overrides.targetCount ?? 1,
      targetValue: overrides.targetValue,
      valueUnit: overrides.valueUnit ?? '',
      intervalDays: 1,
      suggestion,
      notes: overrides.notes ?? '',
      reminderEnabled: false,
      reminderTime: index < 8 ? '09:00' : '21:00',
      nextDueDate: due,
      isPaused: false,
      isArchived: false,
      createdAt: now.toISOString(),
    }
  })
}

function benefitsFor(title: string, category: LegacyCategory): BenefitArea[] {
  if (title === '睡眠') return ['睡眠与恢复', '身体健康', '心理健康']
  if (title === '晒太阳') return ['身体健康', '心理健康', '睡眠与恢复']
  if (title === '深度交流') return ['社交关系', '心理健康']
  if (title === '兴趣时间') return ['心理健康', '社交关系']
  if (title === '环境整理') return ['生活环境', '心理健康']
  if (title === '数据回顾' || title === '体重/腰围记录') return ['疾病管理与预防', '身体健康']
  if (title.includes('眼') || title.includes('视力')) return ['眼部健康', '疾病管理与预防']
  switch (category) {
    case '健康习惯':
      return ['营养与代谢', '身体健康']
    case '补充剂':
      return ['营养与代谢', '身体健康']
    case '运动':
      return ['运动与体能', '身体健康']
    case '眼部保护':
      return ['眼部健康', '疾病管理与预防']
    case '心理与生活':
      return ['心理健康']
    case '检查':
      return ['疾病管理与预防', '身体健康']
  }
}
