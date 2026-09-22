import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { LocalNotifications, type Schedule } from '@capacitor/local-notifications'
import { Share } from '@capacitor/share'
import { createBackupPayload } from './backup'
import type { CheckIn, Habit } from './types'

export const isNativeApp = Capacitor.isNativePlatform()

export async function provideCheckInFeedback(completed = true) {
  if (!isNativeApp) return
  if (completed) {
    await Haptics.notification({ type: NotificationType.Success })
  } else {
    await Haptics.impact({ style: ImpactStyle.Light })
  }
}

export async function updateHabitReminder(habit: Habit) {
  if (!isNativeApp) return
  const id = notificationId(habit.id)
  await LocalNotifications.cancel({ notifications: [{ id }] })
  if (!habit.reminderEnabled || habit.isPaused || habit.isArchived) return

  const permission = await LocalNotifications.checkPermissions()
  const status = permission.display === 'prompt'
    ? await LocalNotifications.requestPermissions()
    : permission
  if (status.display !== 'granted') {
    throw new Error('通知权限未开启，请在 iPhone“设置”中允许今日优先发送通知')
  }

  await LocalNotifications.schedule({
    notifications: [{
      id,
      title: habit.title,
      body: habit.suggestion || '现在完成一个小目标吧',
      schedule: reminderSchedule(habit),
      sound: 'default',
      extra: { habitId: habit.id },
    }],
  })
}

export async function cancelHabitReminder(habitId: string) {
  if (!isNativeApp) return
  await LocalNotifications.cancel({ notifications: [{ id: notificationId(habitId) }] })
}

export async function requestNativeNotificationPermission() {
  if (!isNativeApp) return 'unsupported'
  const status = await LocalNotifications.requestPermissions()
  return status.display
}

export async function exportAndShareData(habits: Habit[], checkIns: CheckIn[]) {
  const payload = JSON.stringify(createBackupPayload({ habits, checkIns }), null, 2)

  if (!isNativeApp) {
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = exportFileName()
    anchor.click()
    URL.revokeObjectURL(url)
    return
  }

  const result = await Filesystem.writeFile({
    path: `exports/${exportFileName()}`,
    data: payload,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  })
  await Share.share({
    title: '导出“今日优先”数据',
    text: '这是你的提醒与打卡数据备份。',
    url: result.uri,
    dialogTitle: '保存或分享数据备份',
  })
}

function reminderSchedule(habit: Habit): Schedule {
  const [hour, minute] = habit.reminderTime.split(':').map(Number)
  switch (habit.scheduleUnit) {
    case '每天':
      return { on: { hour, minute }, repeats: true }
    case '每周':
      return { on: { weekday: 2, hour, minute }, repeats: true }
    case '每月':
      return { on: { day: 1, hour, minute }, repeats: true }
    case '每半年':
    case '每年': {
      const due = habit.nextDueDate ? new Date(`${habit.nextDueDate}T${habit.reminderTime}:00`) : nextReminderDate(hour, minute)
      return { at: due }
    }
    case '自定义间隔':
      return {
        at: new Date(Date.now() + habit.intervalDays * 86_400_000),
        repeats: true,
      }
  }
}

function nextReminderDate(hour: number, minute: number) {
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  if (date <= new Date()) date.setDate(date.getDate() + 1)
  return date
}

function notificationId(id: string) {
  let hash = 0
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0
  }
  return Math.abs(hash) || 1
}

function exportFileName() {
  return `今日优先-${new Date().toISOString().slice(0, 10)}.json`
}
