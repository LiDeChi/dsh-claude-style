# 优化路线图

2026-10 代码评审确定的优化项,本轮已全部执行。每项都过了 `npm run build` 与 `npm run smoke`,浏览器侧另在运行中的实例上逐项核对。保留本文件是为了记下「哪些统一已经做过」,以及「为什么有两件事不做」。

## 一、正确性风险

- **会话删除的存活判定**(host/routes.js):读取在运行集合抛错时视为在运行并拒绝删除,与注释一致;服务缺席(宿主没有会话服务)才算没有在运行的会话。
- **不再按文字识别宿主元素**。四处各自找到了结构判据:侧栏工作区区块认标签自身的 CSS 模块前缀(前缀即所在区块根节点的前缀,且该根节点含会话列表区);账户触发器认宿主自己写的 `data-signed-out`,打开中的账户菜单由该触发器的 `aria-expanded` 判定,设置行认 `aria-keyshortcuts`;用户头像行的退出项认宿主 LogoutIcon 的 13.664×13.571 几何;设置对话框的导航格按本插件在 `settings.section` 槽位条目里的位置取同序号格子。认不出来时功能不挂载、行不镜像,不再退回「第一个候选」。
- **吉祥物信号的服务时序**(src/features/mascot/mascot-signals.js):状态来源每次读取,晚挂载的 `uiSession` 会得到订阅,换源时替换旧订阅。

## 二、弹层共享件

- **`buildPopoverItem`**(src/shared/popover.js):图标、文本(可两行)、徽章、勾选四个槽位。权限行、账户镜像行、快捷服务商行、模型行都经由它组装。
- **`resolveAnchoredPosition` 增加 `above-left`**(src/shared/popover.js):权限菜单改用共享定位几何,顺带获得边距钳制与空间不足时翻到下方。
- **菜单语义走 `setMenuPopoverOpen`**:快捷服务商卡片不再手写 `role="menu"`,宿主键盘仲裁看到的角色与开合状态一致。
- **权限行的行内样式收进 `shared/popover.css`**:两行文本列、说明行、勾选(`[hidden]`)各有共享规则。

## 三、样板与残渣

- **`closestFrom`**(src/shared/dom.js):宿主访问器、调度器焦点路径、英雄菜单三处共用。
- **`textOf` 与 `pad2`**(src/shared/format.js):收掉八处空值归一化与日期/时长补零的两份实现。
- **勾选图标字符串**(`POPOVER_CHECK_SVG`):模型行与快捷服务商行共用一份。
- **删除死代码**:三处不可达的内层分支、`view-tabs.js` 的死常量、账户档案模块五个无人调用的返回成员、首页数据六个无人读取的返回字段;`copy.js` 的「是否宿主自带提示」判定收成一个函数。能力探测统一用可选链(`typeof ui.model?.X === 'function'`)。

## 四、结构性瘦身

- **吉祥物播放器的状态收成一个对象**(src/features/mascot/mascot-player.js):`freshStage()` 一处定义全部初始值,离开页面时整体替换,不再逐字段重置。
- **宿主半的样板与路径解析**:`register(label, route)`、`methodRefused`、`fenceRefused` 三个本地助手收掉七段重复的注册与方法守卫;新增 host/harness-home.js 的 `harnessPath`,删除路由与用量两处各自的家目录解析;服务读取风格统一为直接读取并在缺席时按各模块的既有语义处理。
- **scripts/build.mjs**:`src/constants.js` 从四次求值改为一处求值、一份命名空间;产物先全部校验再落盘,任一校验失败不会留下半个新构建。

## 明确不做

- **`!important` 的总量**。这是纯覆写路线(D2)的固有代价,宿主提供主题 API 或插槽之前没有真解法;现有的门控加回归测试是正确处置。
- **没有结构判据可用的宿主元素**。现行做法是认不出来就不接管,而不是猜一个;若某处最终确认无判据,把代价写进 docs/architecture.md 的相应条目即为终点。
