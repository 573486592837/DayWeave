# DayWeave

DayWeave 是一个可部署在个人笔记本上的、内网可访问的日程表 Web 应用。桌面浏览器拥有完整的日程规划与界面自由拼装能力，手机浏览器可登录查看并增删日程；登录后还能一键进入展示模式，用于全屏常驻显示。界面支持中文与英文双语。

当前版本：v1.1.0（Apache-2.0）

## 功能一览

- 日程：日 / 周 / 月三种视图，新建、编辑、删除、拖拽移动、拖拽改时长、全天事件（支持跨天）、分类与颜色、完成状态、备注
- 重复日程：每周指定星期、工作日两种规则，支持截止日期；编辑 / 删除 / 拖拽时可选择「仅此一次」或「所有重复」
- 布局：12 列栅格编辑模式，8 种 Widget（时钟、日历、日程列表、待办、便签、倒计时、进度条、图片）可拖拽、缩放、锁定、复制、调整层级，支持撤销 / 重做
- 布局方案：多套方案一键切换，可新建、重命名、复制、删除
- 外观：6 套主题；背景支持纯色、线性渐变、单图、多图轮播（间隔 / 顺序 / 淡入），可上传图片并设置蒙层与模糊
- 展示模式：隐藏全部编辑入口，`Esc` 退出，可一键全屏
- 双语：中文 / English / 跟随系统，全站即时切换；日期、星期、月份、相对时间与数字均按语言格式化
- 提醒：日程开始前 N 分钟页面内 Toast + 合成提示音
- 数据：JSON 文件存储、原子写入、启动自动备份、乐观锁防覆盖、SSE 多设备实时同步
- 安全：scrypt 密码哈希、HttpOnly 会话 Cookie、登录限速、上传类型与大小校验

## 环境要求

- Node.js >= 18（推荐 20 或 22 LTS）
- npm
- 桌面浏览器：Chrome / Edge >= 100、Firefox >= 100、Safari >= 15.4
- 内网访问时，手机与笔记本需连接同一 WiFi

## 快速开始（Windows PowerShell）

```powershell
git clone https://github.com/573486592837/DayWeave.git
cd DayWeave
npm install
node server/index.js
```

启动后终端会打印本机与内网访问地址。浏览器打开：

```text
http://localhost:8080
```

首次访问会进入「设置访问密码」页面，设置后自动登录。之后同一内网的其他设备使用终端打印的 `http://<笔记本IP>:8080` 登录即可。

也可以使用 npm 脚本：

```powershell
npm start
# 开发模式（文件变更自动重启服务端）
npm run dev
```

## 内网访问

1. 查询笔记本内网 IP：

   ```powershell
   ipconfig
   ```

   找到当前 WiFi / 以太网适配器的 IPv4 地址，例如 `192.168.1.23`。

2. 手机连接同一 WiFi，浏览器打开：

   ```text
   http://192.168.1.23:8080
   ```

3. 如果打不开，先检查 Windows 防火墙是否放行 8080 端口（需管理员 PowerShell）：

   ```powershell
   New-NetFirewallRule -DisplayName "DayWeave 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
   ```

4. 建议在路由器中为笔记本绑定静态 DHCP 地址，避免内网 IP 变化导致收藏的地址失效。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8080` | HTTP / HTTPS 端口 |
| `HOST` | `0.0.0.0` | 监听地址；只允许本机访问可设为 `127.0.0.1` |
| `DAYWEAVE_DATA` | `./data` | 数据目录（db.json、auth.json、uploads） |
| `DAYWEAVE_LOG` | `./dayweave.log` | 访问与错误日志路径 |
| `SSL_KEY` | 空 | 可选，HTTPS 私钥路径；与 `SSL_CERT` 同时提供才启用 HTTPS |
| `SSL_CERT` | 空 | 可选，HTTPS 证书路径 |

PowerShell 临时指定端口与数据目录：

```powershell
$env:PORT = "9000"
$env:DAYWEAVE_DATA = "D:\DayWeaveData"
node server/index.js
```

bash / zsh：

```bash
PORT=9000 DAYWEAVE_DATA=/srv/dayweave node server/index.js
```

## 数据与备份

首次启动会自动创建：

```text
data/
├── db.json          全部日程、待办、便签、布局、主题、图片元数据
├── db.json.bak      每次服务启动时由上一份 db.json 自动生成
├── auth.json        密码哈希与会话（POSIX 下权限 600）
└── uploads/         上传的背景图与 Widget 图片
```

- 所有数据都在 `data/` 下，迁移机器 = 停止服务后拷贝整个目录。
- `db.json` 采用「写临时文件再 rename」的原子写入，所有写操作串行化。
- 服务启动时会把当前 `db.json` 复制为 `db.json.bak`（首次启动也会生成）。
- 本应用不提供自动恢复逻辑。若 `db.json` 损坏，请停止服务，手工把 `db.json.bak` 覆盖为 `db.json`，再启动。
- `data/` 已在 `.gitignore` 中排除，不会被提交到 Git。

手工恢复示例（PowerShell）：

```powershell
# 先停止正在运行的服务
Copy-Item data\db.json.bak data\db.json -Force
node server/index.js
```

## 常驻运行与开机自启

### 方式一：pm2（跨平台推荐）

```powershell
npm install -g pm2
pm2 start server/index.js --name dayweave
pm2 save
```

macOS / Linux 设置开机自启：

```bash
pm2 startup
# 按提示执行输出的命令
pm2 save
```

Windows 可使用 pm2 的 Windows 启动器：

```powershell
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

### 方式二：Windows 任务计划程序

在「任务计划程序」中新建任务：

- 触发器：登录时（或开机时）
- 操作：启动程序 `C:\Program Files\nodejs\node.exe`
- 参数：`D:\prog\DayWeave\server\index.js`
- 起始于：`D:\prog\DayWeave`

也可用管理员 PowerShell 创建：

```powershell
schtasks /Create /TN "DayWeave" /TR "\"C:\Program Files\nodejs\node.exe\" \"D:\prog\DayWeave\server\index.js\"" /SC ONLOGON /RL HIGHEST /F
```

### 方式三：nohup（macOS / Linux）

```bash
nohup node server/index.js > dayweave.log 2>&1 &
```

Windows 隐藏窗口后台启动：

```powershell
Start-Process -WindowStyle Hidden node -ArgumentList "server/index.js" -WorkingDirectory "D:\prog\DayWeave"
```

### 关闭休眠

笔记本合盖 / 休眠会导致服务不可用。作为常驻服务时，请在系统电源设置中关闭自动休眠，并保持电源连接。

## 可选：HTTPS（自签证书）

默认使用 HTTP，适合可信内网。若希望加密传输，可以生成自签证书并以 HTTPS 启动。

1. 先启动一次应用，确保 `data/` 目录已创建。

2. 使用 Git Bash / OpenSSL 生成证书（365 天有效）：

   ```bash
   MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes \
     -keyout data/key.pem -out data/cert.pem -days 365 \
     -subj "/CN=dayweave.local"
   ```

   Git Bash 会改写以 `/` 开头的参数，`MSYS_NO_PATHCONV=1` 用于避免把 `/CN=...` 误当成路径。也可以使用 PowerShell 的 OpenSSL 或任意证书工具。

3. 以 HTTPS 启动：

   ```powershell
   $env:SSL_KEY = "data/key.pem"
   $env:SSL_CERT = "data/cert.pem"
   node server/index.js
   ```

4. 访问 `https://<笔记本IP>:8080`。浏览器会提示自签证书不受信任，需要在每台设备上手动信任；手机系统可能还需要安装证书。

启用 HTTPS 后，会话 Cookie 会自动加上 `Secure` 标记。也可以改用 Caddy / nginx 做 TLS 反向代理；反向代理需关闭 SSE 缓冲（`/api/stream`）。

## 使用说明

### 日程

- 在时间轴空白处拖拽可创建日程；点击空白处创建默认 1 小时日程；日历右上角 `+` 打开新建表单。
- 拖动日程块可移动时间，跨列可移动到其他天；拖动上下边缘可调整起止时间（15 分钟吸附）。
- 点击日程块打开编辑面板：标题、起止时间、全天、分类、备注、完成状态、提醒、重复规则。
- 日程块右上角小圆点可勾选完成；也可在编辑面板中勾选。
- 全天事件位于时间轴上方独立区域，日期可跨天。
- 重复日程支持「每周」（多选星期）与「工作日」，可设置截止日期。编辑、删除、拖拽重复实例时会询问「仅此一次 / 所有重复」。
- 分类可在编辑面板的「管理分类…」中新增、改名、改色、删除。

### 布局编辑

- 点击工具栏「编辑布局」或按 `Ctrl+E` 进入（仅桌面端，宽度 >= 1024px）。
- 拖拽移动、右下角缩放，自动吸附网格；与其他模块冲突时红色高亮，松手回弹。
- 添加模块、锁定、层级上移 / 下移、复制、删除。
- 右侧属性面板可调整背景色、透明度、毛玻璃、圆角、内边距、文字颜色、字号，以及各 Widget 的专属配置。
- 撤销 / 重做支持至少 30 步；`Ctrl+Z` / `Ctrl+Shift+Z`。
- 「保存」写入服务端；「恢复默认」重置当前方案的模块布局；「退出编辑」在有未保存修改时二次确认。
- 布局方案下拉可切换、新建、重命名、复制、删除（至少保留一套）。

### 展示模式

- 工具栏「展示」或 `Ctrl+Shift+F` 进入，自动请求浏览器全屏。
- 隐藏工具栏、添加 / 编辑入口，日程不可拖拽；按 `Esc` 或右上角「退出展示」退出。

### 语言与时间格式

- 设置页可切换「跟随系统 / 中文 / English」，立即全站生效并保存到服务端，所有设备共享。
- 「跟随系统」时，浏览器语言以 `zh` 开头显示中文，否则显示英文。
- 24h / 12h 时间格式由设置独立控制，不随语言强制变化。
- 日程标题、备注、便签、自定义分类名与布局方案名属于用户内容，不随语言翻译。

### 提醒

- 设置页可开启提醒、设置提前分钟数（默认 10 分钟）、开关提示音。
- 提醒仅在页面打开时生效。浏览器要求用户与页面交互过才允许播放声音；标签页在后台时定时器可能被节流，提醒会延迟。
- 页面关闭或设备休眠后不会提醒。

## 移动端

- 手机浏览器打开 `http://<笔记本IP>:8080`，登录后可查看日 / 周 / 月视图、新建 / 编辑 / 删除日程、勾选完成。
- 手机端周视图自动变为「7 天折叠列表」，今天默认展开。
- 手机 / 平板（宽度 < 1024px）不提供布局编辑，工具栏收纳为菜单。
- 布局编辑、属性面板、Widget 拖拽缩放仅在桌面端可用。

## 安全说明

- 密码使用 Node 内置 `crypto.scrypt` 加盐哈希，比较使用 `timingSafeEqual`。
- 会话 Cookie：`dw_sid`，`HttpOnly`、`SameSite=Lax`、30 天有效；HTTPS 下自动加 `Secure`。
- 登录失败限速：同一 IP 每分钟最多 5 次失败，超出返回 `429` 并延迟响应。
- 上传：5MB 上限、扩展名与 magic bytes 双校验、随机文件名；`uploads` 目录不执行脚本；访问需登录。
- `data/` 不在静态资源目录内，仅通过受保护的 API / 上传路由暴露。
- 未登录访问任意页面会跳转登录页，API 返回 `401`，无法获取任何数据。
- 本应用为单用户设计，不含多人协作与权限体系。

### 忘记密码

停止服务后删除 `data/auth.json`（不会删除日程数据），重新启动并访问页面，即可重新设置访问密码：

```powershell
# 先停止正在运行的服务
Remove-Item data\auth.json
node server/index.js
```

## 项目结构

```text
DayWeave/
├── server/
│   ├── index.js          Express 入口、静态资源、路由挂载
│   ├── config.js         端口、数据目录、上传与 SSL 配置
│   ├── auth.js           登录、登出、密码、会话、限速
│   ├── store.js          db.json 读写、原子写、归一化、.bak
│   ├── routes-state.js   GET/PUT /api/state、清空数据
│   ├── routes-assets.js  图片上传 / 删除
│   ├── sse.js            SSE 推送
│   └── logger.js         访问与错误日志
├── public/
│   ├── index.html        主应用
│   ├── login.html        登录 / 首次设置密码
│   ├── manifest.webmanifest
│   └── assets/
│       ├── css/          base / themes / widgets / editor / mobile / login
│       ├── i18n/         zh-CN.json、en-US.json
│       ├── img/          logo.svg
│       └── js/
│           ├── app.js
│           ├── core/     store、api、schema、theme、undo、style、dom
│           ├── i18n/     i18n.js、locales.js、format.js
│           ├── widgets/  registry + 8 种 Widget
│           ├── events/   repeat.js、event-view.js、event-editor.js
│           ├── editor/   layout-editor.js
│           └── ui/       toolbar、modal、toast、settings、背景、主题、属性面板等
├── data/                 运行时数据（自动创建，已 gitignore）
├── package.json
├── README.md
└── LICENSE
```

前端无构建步骤：修改 `public/` 下文件后刷新浏览器即可生效。服务端修改后重启进程。

## API 摘要

除 `/api/auth/*` 外均需有效会话，未登录返回 `401`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/setup` | 首次设置密码（已设置则 `409`） |
| POST | `/api/auth/login` | 登录；失败 `401`，限速 `429` |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前会话状态与是否需要初始化密码 |
| POST | `/api/auth/password` | 修改密码，旧会话全部失效 |
| GET | `/api/state` | 拉取全量数据 `{rev, data}` |
| PUT | `/api/state` | 保存全量数据；`rev` 不符返回 `409` 与最新数据 |
| POST | `/api/state/reset` | 清空全部数据（需再次输入密码） |
| GET | `/api/stream` | SSE，推送 `{type:"state", rev}` |
| POST | `/api/assets` | 上传图片（multipart，字段名 `file`，<= 5MB） |
| DELETE | `/api/assets/:id` | 删除图片（被引用时 `409`） |
| GET | `/uploads/:filename` | 受保护的图片访问 |
| GET | `/healthz` | 健康检查（无需登录） |

## 常见问题

**端口被占用**：设置 `PORT` 环境变量换端口，例如 `$env:PORT="9000"`。

**手机打不开**：确认同一 WiFi、IP 正确、防火墙放行端口、笔记本未休眠；服务是否仍在终端运行。

**提醒不准时**：保持页面在前台；浏览器会节流后台标签页的定时器，页面关闭后不会提醒。

**上传失败**：仅支持 JPG / PNG / WebP / GIF，单张不超过 5MB；前端会先压缩再上传。

**大屏掉帧**：在主题面板或设置中开启「性能模式」，关闭全部毛玻璃与模糊。

**数据损坏**：停止服务，用 `data/db.json.bak` 手工覆盖 `data/db.json` 后重启。应用刻意不做自动恢复，以免覆盖仍可挽救的数据。

**反向代理下 SSE 不推送**：为 `/api/stream` 关闭缓冲（nginx 使用 `proxy_buffering off;`，Caddy 默认支持 SSE）。

## 开发约定

- 前端使用原生 ES Module，无打包、无框架、无构建步骤。
- 所有界面文案必须同时添加 `public/assets/i18n/zh-CN.json` 与 `en-US.json` 中键一致的词条；缺失 key 会在控制台警告并回退到中文。
- 数据模型变更需同时更新 `server/store.js` 的归一化逻辑与前端 `core/schema.js`。
- 项目文档 `guidance.md` 为本地参考资料，已加入 `.gitignore`，不随仓库发布。

## License

Apache License 2.0，详见 [LICENSE](LICENSE)。
