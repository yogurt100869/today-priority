import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  deleteCheckIn,
  deleteHabitData,
  getAllData,
  replaceAllData,
  saveCheckIn,
  saveHabit,
} from './db'
import { evaluateHabit, sortedPriorities } from './priority'
import { createStarterHabits } from './starterData'
import {
  cancelHabitReminder,
  exportAndShareData,
  isNativeApp,
  provideCheckInFeedback,
  requestNativeNotificationPermission,
  updateHabitReminder,
} from './native'
import {
  benefitAreas,
  importanceLevels,
  scheduleUnits,
  trackingTypes,
  type CheckIn,
  type Habit,
  type PriorityResult,
} from './types'
import './App.css'

type Tab = 'today' | 'plans' | 'insights' | 'settings'
type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const benefitIcons: Record<Habit['benefitAreas'][number], string> = {
  身体健康: '♥',
  心理健康: '☼',
  营养与代谢: '◒',
  运动与体能: '◆',
  睡眠与恢复: '☾',
  眼部健康: '◉',
  疾病管理与预防: '✚',
  社交关系: '♧',
  生活环境: '⌂',
}

function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [habits, setHabits] = useState<Habit[]>([])
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [editingHabit, setEditingHabit] = useState<Habit | null | undefined>()
  const [valueHabit, setValueHabit] = useState<Habit>()
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt>()

  const refresh = async () => {
    const data = await getAllData()
    setHabits(data.habits)
    setCheckIns(data.checkIns)
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        const data = await getAllData()
        if (data.habits.length === 0) {
          await replaceAllData(createStarterHabits())
        }
        await refresh()
      } catch (cause) {
        setError(`无法读取本地数据：${messageFrom(cause)}`)
      } finally {
        setLoading(false)
      }
    }
    void initialize()
  }, [])

  useEffect(() => {
    const listener = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPrompt)
    }
    window.addEventListener('beforeinstallprompt', listener)
    return () => window.removeEventListener('beforeinstallprompt', listener)
  }, [])

  const priorities = useMemo(() => sortedPriorities(habits, checkIns), [habits, checkIns])

  useEffect(() => {
    const checkReminders = async () => {
      if (isNativeApp) return
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const now = new Date()
      const currentTime = now.toTimeString().slice(0, 5)
      const dayKey = now.toISOString().slice(0, 10)
      const pendingIds = new Set(priorities.filter((item) => !item.isComplete).map((item) => item.habit.id))
      const due = habits.filter((habit) =>
        habit.reminderEnabled &&
        !habit.isPaused &&
        pendingIds.has(habit.id) &&
        habit.reminderTime <= currentTime &&
        localStorage.getItem(`reminded:${habit.id}`) !== dayKey
      )
      if (!due.length) return
      try {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification('今日优先', {
          body: due.length === 1 ? `该完成“${due[0].title}”了` : `还有 ${due.length} 项计划等待完成`,
          icon: '/app-icon.svg',
          tag: 'habit-priority-daily',
        })
        due.forEach((habit) => localStorage.setItem(`reminded:${habit.id}`, dayKey))
      } catch (cause) {
        setError(`无法发送提醒：${messageFrom(cause)}`)
      }
    }
    void checkReminders()
    const timer = window.setInterval(() => void checkReminders(), 60_000)
    return () => window.clearInterval(timer)
  }, [habits, priorities])

  const run = async (operation: () => Promise<unknown>) => {
    try {
      await operation()
      await refresh()
      return true
    } catch (cause) {
      setError(messageFrom(cause))
      return false
    }
  }

  const addCheckIn = async (habit: Habit, value?: number, status: CheckIn['status'] = 'completed') => {
    const saved = await run(() => saveCheckIn({
      id: crypto.randomUUID(),
      habitId: habit.id,
      timestamp: new Date().toISOString(),
      value,
      status,
    }))
    if (saved) await provideCheckInFeedback(status === 'completed')
  }

  const checkIn = (habit: Habit) => {
    if (habit.trackingType === '数值' || habit.trackingType === '时长') {
      setValueHabit(habit)
    } else {
      void addCheckIn(habit)
    }
  }

  const undo = (habit: Habit) => {
    const latest = checkIns
      .filter((item) => item.habitId === habit.id && item.status !== 'skipped')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
    if (latest) void run(() => deleteCheckIn(latest.id))
  }

  const saveHabitAndClose = async (habit: Habit) => {
    if (!await run(() => saveHabit(habit))) return
    try {
      await updateHabitReminder(habit)
      setEditingHabit(undefined)
    } catch (cause) {
      setError(messageFrom(cause))
    }
  }

  const updateHabit = async (habit: Habit) => {
    if (!await run(() => saveHabit(habit))) return
    try {
      await updateHabitReminder(habit)
    } catch (cause) {
      setError(messageFrom(cause))
    }
  }

  const deleteHabit = async (habit: Habit) => {
    try {
      await cancelHabitReminder(habit.id)
      await run(() => deleteHabitData(habit.id))
    } catch (cause) {
      setError(messageFrom(cause))
    }
  }

  if (loading) {
    return <main className="loading"><div className="spinner" /><p>正在准备今日清单…</p></main>
  }

  return (
    <div className="app-shell">
      <main className="page">
        {tab === 'today' && (
          <TodayPage
            results={priorities}
            onCheckIn={checkIn}
            onSkip={(habit) => void addCheckIn(habit, undefined, 'skipped')}
            onUndo={undo}
          />
        )}
        {tab === 'plans' && (
          <PlansPage
            habits={habits}
            onAdd={() => setEditingHabit(null)}
            onEdit={setEditingHabit}
            onUpdate={(habit) => void updateHabit(habit)}
            onDelete={(habit) => {
              if (window.confirm(`永久删除“${habit.title}”及其打卡记录？`)) {
                void deleteHabit(habit)
              }
            }}
          />
        )}
        {tab === 'insights' && <InsightsPage habits={habits} checkIns={checkIns} />}
        {tab === 'settings' && (
          <SettingsPage
            habits={habits}
            checkIns={checkIns}
            installPrompt={installPrompt}
            onInstalled={() => setInstallPrompt(undefined)}
            onReset={() => void run(() => replaceAllData(createStarterHabits()))}
            onError={(cause) => setError(messageFrom(cause))}
          />
        )}
      </main>

      <nav className="tab-bar" aria-label="主导航">
        <TabButton active={tab === 'today'} icon="✓" label="今天" onClick={() => setTab('today')} />
        <TabButton active={tab === 'plans'} icon="▤" label="计划" onClick={() => setTab('plans')} />
        <TabButton active={tab === 'insights'} icon="▥" label="数据" onClick={() => setTab('insights')} />
        <TabButton active={tab === 'settings'} icon="●" label="我的" onClick={() => setTab('settings')} />
      </nav>

      {editingHabit !== undefined && (
        <HabitForm
          habit={editingHabit}
          onClose={() => setEditingHabit(undefined)}
          onSave={saveHabitAndClose}
        />
      )}
      {valueHabit && (
        <ValueDialog
          habit={valueHabit}
          currentValue={evaluateHabit(valueHabit, checkIns).recordedValue}
          onClose={() => setValueHabit(undefined)}
          onSave={(value) => {
            const current = evaluateHabit(valueHabit, checkIns).recordedValue
            const status = current + value >= (valueHabit.targetValue ?? 1) ? 'completed' : 'partial'
            void addCheckIn(valueHabit, value, status)
            setValueHabit(undefined)
          }}
        />
      )}
      {error && <Toast message={error} onClose={() => setError(undefined)} />}
    </div>
  )
}

function TodayPage({
  results,
  onCheckIn,
  onSkip,
  onUndo,
}: {
  results: PriorityResult[]
  onCheckIn: (habit: Habit) => void
  onSkip: (habit: Habit) => void
  onUndo: (habit: Habit) => void
}) {
  const completed = results.filter((item) => item.isComplete)
  const priorities = results.filter((item) => !item.isComplete && item.score >= 70).slice(0, 3)
  const remaining = results.filter((item) => !item.isComplete && !priorities.includes(item))
  const percent = results.length ? Math.round((completed.length / results.length) * 100) : 0
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">{date}</p><h1>今日清单</h1></div>
        <div className="progress-ring" style={{ '--progress': `${percent * 3.6}deg` } as React.CSSProperties}>
          <span>{percent}%</span>
        </div>
      </header>
      <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
      <p className="progress-caption">已完成 {completed.length}/{results.length}</p>

      {priorities.length > 0 && (
        <TaskSection title="需要优先完成" tone="priority">
          {priorities.map((result) => (
            <TaskCard key={result.habit.id} result={result} onCheckIn={onCheckIn} onSkip={onSkip} onUndo={onUndo} />
          ))}
        </TaskSection>
      )}
      {remaining.length > 0 && (
        <TaskSection title="今天">
          {remaining.map((result) => (
            <TaskCard key={result.habit.id} result={result} onCheckIn={onCheckIn} onSkip={onSkip} onUndo={onUndo} />
          ))}
        </TaskSection>
      )}
      {completed.length > 0 && (
        <TaskSection title="已完成">
          {completed.map((result) => (
            <TaskCard key={result.habit.id} result={result} onCheckIn={onCheckIn} onSkip={onSkip} onUndo={onUndo} />
          ))}
        </TaskSection>
      )}
      {results.length === 0 && <Empty icon="✓" title="今天没有待办" text="可以在“计划”中添加新的打卡项目" />}
    </>
  )
}

function TaskSection({ title, tone, children }: { title: string; tone?: string; children: ReactNode }) {
  return <section className={`task-section ${tone ?? ''}`}><h2>{title}</h2><div className="card-stack">{children}</div></section>
}

function TaskCard({
  result,
  onCheckIn,
  onSkip,
  onUndo,
}: {
  result: PriorityResult
  onCheckIn: (habit: Habit) => void
  onSkip: (habit: Habit) => void
  onUndo: (habit: Habit) => void
}) {
  const { habit } = result
  const valueProgress = habit.trackingType === '数值' || habit.trackingType === '时长'
  const progress = valueProgress
    ? `${formatNumber(result.recordedValue)}/${formatNumber(habit.targetValue ?? 1)} ${habit.valueUnit}`
    : habit.targetCount > 1
      ? `${result.completedCount}/${habit.targetCount} 次`
      : habit.suggestion
  return (
    <article className={`task-card ${result.isComplete ? 'complete' : ''}`}>
      <button className="check-button" onClick={() => result.isComplete ? onUndo(habit) : onCheckIn(habit)} aria-label={result.isComplete ? '撤销' : '打卡'}>
        {result.isComplete ? '✓' : ''}
      </button>
      <div className="task-main">
        <div className="task-title-line">
          <h3>{habit.title}</h3>
          {result.score >= 70 && !result.isComplete && <span className="priority-pill">优先</span>}
        </div>
        <p>{progress}</p>
        <BenefitTags areas={habit.benefitAreas} compact />
        {!result.isComplete && <small className={result.score >= 70 ? 'urgent' : ''}>{result.reason}</small>}
      </div>
      {!result.isComplete && <button className="more-button" onClick={() => onSkip(habit)} title="本周期跳过">跳过</button>}
    </article>
  )
}

function PlansPage({
  habits,
  onAdd,
  onEdit,
  onUpdate,
  onDelete,
}: {
  habits: Habit[]
  onAdd: () => void
  onEdit: (habit: Habit) => void
  onUpdate: (habit: Habit) => void
  onDelete: (habit: Habit) => void
}) {
  const [showArchived, setShowArchived] = useState(false)
  const visible = habits.filter((habit) => habit.isArchived === showArchived)
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">管理内容与频次</p><h1>{showArchived ? '已归档' : '我的计划'}</h1></div>
        <button className="primary-icon" onClick={onAdd}>＋</button>
      </header>
      <div className="segmented">
        <button className={!showArchived ? 'active' : ''} onClick={() => setShowArchived(false)}>进行中</button>
        <button className={showArchived ? 'active' : ''} onClick={() => setShowArchived(true)}>已归档</button>
      </div>
      {benefitAreas.map((area) => {
        const items = visible.filter((habit) => habit.benefitAreas[0] === area)
        if (!items.length) return null
        return (
          <section className="plan-section" key={area}>
            <h2>{benefitIcons[area]} {area}</h2>
            <div className="plan-list">
              {items.map((habit) => (
                <article className="plan-row" key={habit.id}>
                  <button className="plan-edit" onClick={() => onEdit(habit)}>
                    <span className="category-icon">{benefitIcons[area]}</span>
                    <span>
                      <strong>{habit.title}</strong>
                      <small>{habit.scheduleUnit}{habit.targetCount > 1 ? ` · ${habit.targetCount}次` : ''}</small>
                      <BenefitTags areas={habit.benefitAreas} compact />
                    </span>
                  </button>
                  <div className="row-actions">
                    <button onClick={() => onUpdate({ ...habit, isPaused: showArchived ? false : !habit.isPaused, isArchived: showArchived ? false : habit.isArchived })}>
                      {showArchived ? '恢复' : habit.isPaused ? '继续' : '暂停'}
                    </button>
                    {!showArchived && <button onClick={() => onUpdate({ ...habit, isArchived: true })}>归档</button>}
                    <button className="danger" onClick={() => onDelete(habit)}>删除</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )
      })}
      {!visible.length && <Empty icon="▤" title={showArchived ? '没有归档项目' : '还没有计划'} text="点击右上角加号创建项目" />}
    </>
  )
}

function HabitForm({ habit, onClose, onSave }: { habit: Habit | null; onClose: () => void; onSave: (habit: Habit) => Promise<void> }) {
  const [draft, setDraft] = useState<Habit>(() => habit ?? {
    id: crypto.randomUUID(),
    title: '',
    benefitAreas: ['身体健康'],
    trackingType: '完成状态',
    scheduleUnit: '每天',
    importance: '普通',
    targetCount: 1,
    targetValue: 1,
    valueUnit: '',
    intervalDays: 1,
    suggestion: '',
    notes: '',
    reminderEnabled: false,
    reminderTime: '09:00',
    isPaused: false,
    isArchived: false,
    createdAt: new Date().toISOString(),
  })

  const update = <K extends keyof Habit>(key: K, value: Habit[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void onSave({ ...draft, title: draft.title.trim() })
  }

  return (
    <Modal title={habit ? '编辑项目' : '新增项目'} onClose={onClose}>
      <form className="habit-form" onSubmit={submit}>
        <label>名称<input required value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="例如：冥想" /></label>
        <fieldset className="benefit-picker">
          <legend>受益方面（可多选，第一项为主要分类）</legend>
          <div>
            {benefitAreas.map((area) => {
              const selected = draft.benefitAreas.includes(area)
              return <button type="button" className={selected ? 'selected' : ''} key={area} onClick={() => {
                if (selected && draft.benefitAreas.length === 1) return
                update('benefitAreas', selected ? draft.benefitAreas.filter((item) => item !== area) : [...draft.benefitAreas, area])
              }}>{benefitIcons[area]} {area}</button>
            })}
          </div>
        </fieldset>
        <div className="form-grid">
          <label>重要性<select value={draft.importance} onChange={(event) => update('importance', event.target.value as Habit['importance'])}>{importanceLevels.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>记录方式<select value={draft.trackingType} onChange={(event) => update('trackingType', event.target.value as Habit['trackingType'])}>{trackingTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>频次<select value={draft.scheduleUnit} onChange={(event) => update('scheduleUnit', event.target.value as Habit['scheduleUnit'])}>{scheduleUnits.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        {(draft.trackingType === '数值' || draft.trackingType === '时长') ? (
          <div className="form-grid">
            <label>目标值<input type="number" min="0.1" step="any" value={draft.targetValue} onChange={(event) => update('targetValue', Number(event.target.value))} /></label>
            <label>单位<input value={draft.valueUnit} onChange={(event) => update('valueUnit', event.target.value)} placeholder="ml、分钟…" /></label>
          </div>
        ) : (
          <label>每周期次数<input type="number" min="1" max="30" value={draft.targetCount} onChange={(event) => update('targetCount', Number(event.target.value))} /></label>
        )}
        {draft.scheduleUnit === '自定义间隔' && <label>间隔天数<input type="number" min="1" max="365" value={draft.intervalDays} onChange={(event) => update('intervalDays', Number(event.target.value))} /></label>}
        {(draft.scheduleUnit === '每半年' || draft.scheduleUnit === '每年') && <label>下次到期<input type="date" value={draft.nextDueDate ?? ''} onChange={(event) => update('nextDueDate', event.target.value)} /></label>}
        <label className="toggle-row"><span>启用提醒时间</span><input type="checkbox" checked={draft.reminderEnabled} onChange={(event) => update('reminderEnabled', event.target.checked)} /></label>
        {draft.reminderEnabled && <label>提醒时间<input type="time" value={draft.reminderTime} onChange={(event) => update('reminderTime', event.target.value)} /></label>}
        <label>具体建议<textarea value={draft.suggestion} onChange={(event) => update('suggestion', event.target.value)} rows={2} /></label>
        <label>备注<textarea value={draft.notes} onChange={(event) => update('notes', event.target.value)} rows={2} /></label>
        <button className="primary-button" type="submit">保存项目</button>
      </form>
    </Modal>
  )
}

function ValueDialog({ habit, currentValue, onClose, onSave }: { habit: Habit; currentValue: number; onClose: () => void; onSave: (value: number) => void }) {
  const [value, setValue] = useState(habit.targetValue ?? 1)
  return (
    <Modal title={`记录${habit.title}`} onClose={onClose} compact>
      <p className="dialog-hint">当前已记录 {formatNumber(currentValue)} {habit.valueUnit}</p>
      <div className="value-input"><input autoFocus type="number" min="0.1" step="any" value={value} onChange={(event) => setValue(Number(event.target.value))} /><span>{habit.valueUnit}</span></div>
      <button className="primary-button" disabled={value <= 0} onClick={() => onSave(value)}>保存进度</button>
    </Modal>
  )
}

function InsightsPage({ habits, checkIns }: { habits: Habit[]; checkIns: CheckIn[] }) {
  const [now] = useState(() => Date.now())
  const active = habits.filter((habit) => !habit.isArchived)
  const rate = (days: number) => {
    const start = now - days * 86_400_000
    const completed = checkIns.filter((item) => item.status === 'completed' && new Date(item.timestamp).getTime() >= start).length
    const expected = active.reduce((total, habit) => total + (
      habit.scheduleUnit === '每天' ? habit.targetCount * days :
      habit.scheduleUnit === '每周' ? habit.targetCount * Math.max(1, Math.floor(days / 7)) :
      habit.scheduleUnit === '每月' ? habit.targetCount * Math.max(1, Math.floor(days / 30)) :
      habit.scheduleUnit === '自定义间隔' ? Math.max(1, Math.floor(days / habit.intervalDays)) : 0
    ), 0)
    return expected ? Math.min(100, Math.round((completed / expected) * 100)) : 0
  }
  const recentCount = (habit: Habit) => {
    const start = now - 30 * 86_400_000
    return checkIns.filter((item) => item.habitId === habit.id && item.status === 'completed' && new Date(item.timestamp).getTime() >= start).length
  }
  return (
    <>
      <header className="page-header"><div><p className="eyebrow">习惯趋势</p><h1>数据回顾</h1></div></header>
      <section className="metric-card">
        <Metric value={rate(7)} label="近7天完成率" />
        <div className="metric-divider" />
        <Metric value={rate(30)} label="近30天完成率" />
      </section>
      <section className="plan-section"><h2>受益方面</h2><div className="benefit-summary">
        {benefitAreas.map((area) => {
          const areaHabits = active.filter((habit) => habit.benefitAreas.includes(area))
          if (!areaHabits.length) return null
          const completed = areaHabits.reduce((total, habit) => total + recentCount(habit), 0)
          return <div className="benefit-summary-row" key={area}><span className="category-icon">{benefitIcons[area]}</span><span><strong>{area}</strong><small>{areaHabits.length} 个计划</small></span><b>{completed} 次</b></div>
        })}
      </div></section>
      <section className="plan-section"><h2>项目表现</h2><div className="plan-list">
        {active.map((habit) => <div className="insight-row" key={habit.id}><span><strong>{habit.title}</strong><BenefitTags areas={habit.benefitAreas} compact /></span><b>近30天 {recentCount(habit)} 次</b></div>)}
      </div></section>
    </>
  )
}

function SettingsPage({
  habits,
  checkIns,
  installPrompt,
  onInstalled,
  onReset,
  onError,
}: {
  habits: Habit[]
  checkIns: CheckIn[]
  installPrompt?: InstallPrompt
  onInstalled: () => void
  onReset: () => void
  onError: (cause: unknown) => void
}) {
  const [showGuide, setShowGuide] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [notificationStatus, setNotificationStatus] = useState<string>(
    isNativeApp ? 'prompt' : 'Notification' in window ? Notification.permission : 'unsupported',
  )
  const install = async () => {
    if (installPrompt) {
      await installPrompt.prompt()
      await installPrompt.userChoice
      onInstalled()
    }
  }
  const exportData = async () => {
    try {
      await exportAndShareData(habits, checkIns)
    } catch (cause) {
      onError(cause)
    }
  }
  return (
    <>
      <header className="page-header"><div><p className="eyebrow">设置与隐私</p><h1>我的</h1></div></header>
      {!isNativeApp && <section className="settings-card">
          <h2>安装到手机</h2>
          {installPrompt ? <button className="settings-row" onClick={() => void install()}><span>安装“今日优先”</span><b>安装</b></button> : (
            <div className="instruction"><b>iPhone 安装方法</b><ol><li>用 Safari 打开本应用网址</li><li>点击底部“分享”按钮</li><li>选择“添加到主屏幕”</li></ol></div>
          )}
        </section>}
      <section className="settings-card">
        <h2>提醒</h2>
        <button className="settings-row" onClick={async () => {
          try {
            if (isNativeApp) {
              setNotificationStatus(await requestNativeNotificationPermission())
            } else if ('Notification' in window) {
              setNotificationStatus(await Notification.requestPermission())
            }
          } catch (cause) {
            onError(cause)
          }
        }}>
          <span>{isNativeApp ? 'iPhone 通知权限' : '浏览器通知权限'}</span>
          <b>{notificationStatus === 'granted' ? '已开启' : notificationStatus === 'denied' ? '已拒绝' : '开启'}</b>
        </button>
        <div className="instruction">{isNativeApp ? '原生本地通知在 App 关闭后仍可按计划提醒，不需要连接服务器。' : 'PWA 会在打开或驻留期间检查到期提醒。'}</div>
      </section>
      <section className="settings-card">
        <h2>内容与数据</h2>
        <button className="settings-row" onClick={() => setShowGuide(!showGuide)}><span>每日饮食与健康指南</span><b>{showGuide ? '收起' : '查看'}</b></button>
        <button className="settings-row" onClick={() => setShowPrivacy(!showPrivacy)}><span>隐私政策</span><b>{showPrivacy ? '收起' : '查看'}</b></button>
        <button className="settings-row" onClick={() => void exportData()}><span>导出个人数据</span><b>{isNativeApp ? '分享' : 'JSON'}</b></button>
        <button className="settings-row danger-text" onClick={() => { if (window.confirm('恢复示例数据将清除当前所有记录，是否继续？')) onReset() }}><span>恢复示例数据</span><b>重置</b></button>
      </section>
      {showGuide && <Guidance />}
      {showPrivacy && <PrivacyPolicy />}
      <section className="privacy-card"><b>本地优先</b><p>{isNativeApp ? '数据保存在此 iPhone 的应用私有空间，不会上传服务器。删除 App 会删除本地记录，请定期导出备份。' : '数据保存在此浏览器的 IndexedDB 中，不会上传服务器。清除网站数据会删除记录，请定期导出备份。'}</p></section>
      <section className="health-note"><b>健康提示</b><p>本应用仅用于习惯提醒和个人记录，不提供诊断或治疗建议。检查频率、药物和补充剂使用请以医生建议为准。</p></section>
    </>
  )
}

const guidance = [
  ['饮食多样', '优先选择多种天然食物，合理搭配蔬菜、水果、蛋白质和主食。'],
  ['进食规律', '三餐尽量规律，避免暴饮暴食或长时间空腹。'],
  ['减少加工食品', '适量减少精制糖、油炸食品和过度加工食品。'],
  ['关注个人耐受', '记录食物与身体感受；有持续不适时咨询医生或营养师。'],
]

function Guidance() {
  return <section className="guide-card"><h2>健康指南</h2>{guidance.map(([title, detail]) => <div key={title}><b>{title}</b><p>{detail}</p></div>)}</section>
}

function PrivacyPolicy() {
  return <section className="guide-card">
    <h2>隐私政策</h2>
    <div><b>数据收集</b><p>今日优先不要求账户，不收集姓名、邮箱、设备标识符、位置或广告数据。</p></div>
    <div><b>健康与打卡数据</b><p>计划、打卡和备注仅保存在设备的应用私有空间，不会上传至开发者或第三方服务器。</p></div>
    <div><b>通知</b><p>通知仅在用户授权后由设备本地调度，不会将打卡内容发送给推送服务器。</p></div>
    <div><b>导出与删除</b><p>数据仅在用户主动导出时通过系统分享菜单交给用户选择的目标。删除 App 会删除其本地数据。</p></div>
    <div><b>医疗声明</b><p>本应用只提供提醒和个人记录，不提供医疗诊断、处方或治疗建议。</p></div>
  </section>
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="metric"><strong>{value}%</strong><span>{label}</span></div>
}

function BenefitTags({ areas, compact = false }: { areas: Habit['benefitAreas']; compact?: boolean }) {
  return <span className={`benefit-tags ${compact ? 'compact' : ''}`}>
    {areas.map((area) => <span key={area}>{area}</span>)}
  </span>
}

function Modal({ title, onClose, compact, children }: { title: string; onClose: () => void; compact?: boolean; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`modal ${compact ? 'compact' : ''}`} role="dialog" aria-modal="true">
      <header><button onClick={onClose}>取消</button><h2>{title}</h2><span /></header>
      {children}
    </section>
  </div>
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button className={active ? 'active' : ''} onClick={onClick}><span>{icon}</span><small>{label}</small></button>
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="empty"><span>{icon}</span><h2>{title}</h2><p>{text}</p></div>
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="toast" role="alert"><span>{message}</span><button onClick={onClose}>关闭</button></div>
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value)
}

function messageFrom(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

export default App
