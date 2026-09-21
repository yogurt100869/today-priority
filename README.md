# 今日优先 PWA

无需 macOS 的提醒与打卡应用。可在 Windows 上开发和运行，也可通过 iPhone
Safari 添加到主屏幕。项目同时包含使用
`com.yogurt100869.habitpriority` 的 Capacitor iOS 原生容器。

## Windows 本地运行

```powershell
npm install
npm run dev
```

浏览器打开终端显示的本地地址。

## 生产构建

```powershell
npm test
npm run lint
npm run build
npm run preview
```

构建结果在 `dist` 目录。部署到任意支持 HTTPS 的静态网站服务后，即可安装完整
PWA 并离线使用。

## iPhone 安装

1. 将 `dist` 部署到 HTTPS 网站。
2. 用 iPhone Safari 打开网址。
3. 点击 Safari 的“分享”按钮。
4. 选择“添加到主屏幕”。

开发服务器可以使用 `npm run dev -- --host` 供同一局域网中的手机预览，但完整的
Service Worker 离线能力需要 HTTPS。

## 数据与提醒

- 数据使用 IndexedDB 保存在当前浏览器中。
- 每个项目可以选择多个受益方面，并按主要受益方面分类展示。
- “我的”页面可以将数据导出为 JSON。
- 清除网站数据会删除本地记录。
- 浏览器通知会在应用打开或驻留期间检查并显示。
- iPhone 完全关闭 PWA 后的定时后台推送需要额外的 Web Push 服务端，当前 MVP
  不包含服务器。

## iOS 原生版本

原生版本位于 `ios/`，提供：

- Capacitor Preferences 应用私有存储
- App 关闭后仍可触发的本地通知
- 打卡成功和部分进度的触觉反馈
- 使用系统分享菜单导出 JSON 备份
- App Store 图标与启动画面
- App 内隐私政策和健康免责声明

修改 React 代码后，在 Windows 运行：

```powershell
npm run native:sync
```

该命令构建 Web 资源并同步到 Xcode 工程。Windows 不能运行 Xcode，iOS 编译由
GitHub Actions 的 macOS runner 完成。

## GitHub Actions iOS 构建

`.github/workflows/ios-build.yml` 会在每次相关提交后执行：

1. 单元测试
2. lint
3. React 生产构建
4. Capacitor iOS 同步
5. 无签名的 iOS Simulator 编译

这个流程不需要 Apple 证书，用于尽早发现 iOS 编译错误。

## TestFlight 上传准备

先加入 Apple Developer Program，并在 Apple Developer/App Store Connect 中：

1. 注册 Bundle ID：`com.yogurt100869.habitpriority`
2. 创建 App Store Distribution 证书并导出为 `.p12`
3. 为该 Bundle ID 创建 App Store provisioning profile
4. 在 App Store Connect 创建同 Bundle ID 的 App
5. 创建具有上传权限的 App Store Connect API Key

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加：

| Secret | 内容 |
|---|---|
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | `.p12` 文件的 Base64 内容 |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | 导出 `.p12` 时设置的密码 |
| `APPLE_PROVISIONING_PROFILE_BASE64` | `.mobileprovision` 文件的 Base64 内容 |
| `APP_STORE_CONNECT_API_KEY_ID` | API Key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | API Issuer ID |
| `APP_STORE_CONNECT_PRIVATE_KEY_BASE64` | `AuthKey_*.p8` 的 Base64 内容 |

这些内容属于机密，不能提交到 Git。配置完成后，在 GitHub Actions 中手动运行
**Habit Priority TestFlight**，输入版本号和递增的构建号。工作流会签名、导出
IPA、上传 TestFlight，并将 IPA 保存为私有 workflow artifact。

## App Store 必需页面

- `public/privacy.html`：隐私政策
- `public/support.html`：用户支持

正式提交前需要将这两个页面部署到公开 HTTPS 地址，并把 URL 填入 App Store
Connect。当前应用不上传用户数据；如果以后加入云同步、分析或广告，必须同步更新
隐私政策和 App Privacy 回答。

## GitHub Pages HTTPS 部署

`.github/workflows/pages.yml` 会在 `main` 分支相关文件更新后自动部署
PWA。首次使用时，在 GitHub 仓库中打开：

**Settings → Pages → Build and deployment → Source → GitHub Actions**

部署成功后的地址为：

- App：`https://yogurt100869.github.io/today-priority/`
- 隐私政策：`https://yogurt100869.github.io/today-priority/privacy.html`
- 用户支持：`https://yogurt100869.github.io/today-priority/support.html`

这些地址可分别用于 iPhone Safari 安装以及 App Store Connect 的 Privacy Policy
URL 和 Support URL。
