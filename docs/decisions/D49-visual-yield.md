# D49. 让路：宿主另有属主时收掉整套视觉，留下设置页

- **状态**：已实施
- **关联**：D12、D29、D30、D32、D33、D40
- **迁移**：无

## 决定

- 两个属性回答「这一页现在归谁」：`html[data-dsh-skin]`（皮肤中心在皮肤作画时盖上，值是皮肤 id）与 `body[data-we-wallpaper]`（壁纸插件渲染壁纸期间盖上）。任一存在即让路。`src/shared/visual-owner.js` 读它们，`apply()` 开头同步读一次，之后由一个 MutationObserver 跟随真实翻转；判定每次重算，不跨翻转缓存。
- 让路时：保留 `setHostContext`、`adoptSettingsForm` 与 `ctx.inject(['configForms'])`、`loadModelCopy` / `loadUsername` / `loadHdsl`、`adoptPrefs`，只安装 `settings` 一个功能；不盖 `data-dsh-claude-style`、不挂样式表、不跑调度器。模块作用域的 `parkForeignSheets()` 照常运行（兄弟包的样式表不能等本皮肤）。
- 抢回页面时（`own()`）：盖上 `data-dsh-claude-style` 与 `data-dsh-claude-style-handoff`、重新 `adoptPrefs`、挂样式表、装齐功能、装调度器；已在装的功能不重复安装。交还页面时（`release(keep)`）：跑完每个功能的 teardown、撤掉本包在 body 上的全部属性与样式表，`keep` 名单里的功能留下。
- 宿主运行时收到 teardown 仍是唯一的一次性拆卸器：`teardown()` 先停归属观察，再 `release()`，再停对话插件观察与偏好绑定。
- `data-dsh-claude-style-handoff` 是能力标记：它在 `body` 上与存活标记同时出现，表示这一版能让路。皮肤中心据此才把本主题当作可选皮肤列出来；没有它的旧版本不会被选用。

## 理由

- 皮肤中心把它注入服务端 HTML，所以第一帧就有答案；而 D32 已经用同样的「两路信号 + 观察者」形状处理过另一个插件，重复发明一套形状不如沿用。
- 让路的粒度是整页而不是单个功能：只关掉功能表会漏掉样式表、无开关的功能、`adoptPrefs` 打在 body 上的属性，以及独立安装的调度器与座位键（D12 的隔离不等于整页交还）。
- 收掉视觉不是卸载：读者的设置页与偏好必须继续在，别人的皮肤不该顺手删掉本包的东西。

## 代价

- 在 D40 落地前多一个常驻观察者（D40 只豁免了 head 的 childList 那一个）。
- 让路期间整页惰性：设置页以宿主样式渲染，页面上的其他本包行为全部停摆。
- 翻转会带来一次可见的重新挂载；判定在观察者回调里重算，不缓存。

## 重审条件

- 宿主提供主题层接口时改接宿主的（D30 已带着这一条）。
- 皮肤中心提供可注入的主题服务时，判定改走服务，属性只留作第一帧的先验。
