#!/usr/bin/env node
/**
 * shoot.cjs — capture the README screenshots, light and dark, for one brand and
 * one scene: `docs/<brand>-<scene>-light.png` and `-dark.png`.
 *
 * Drives a headless Chrome over CDP against a running DSH web GUI with this
 * theme loaded, replaces personal data in the DOM (workspace / session titles,
 * inferred username, absolute paths, quota amounts) with neutral stand-ins,
 * then captures the page in light and dark. Dark mode is produced by setting
 * `body[data-ds-dark-theme]` — the same DOM state the host's theme presenter
 * produces for the dark palette — instead of writing the shared theme
 * preference or relying on emulation, which the durable light preference would
 * ignore. The visible text must pass a leak sweep before anything is written,
 * so a miss fails the run instead of shipping a screenshot with real workspace
 * names in it.
 *
 * Scenes:
 *   home          the new-conversation page, as the instance's home layout draws
 *                 it. A page showing conversation turns is refused.
 *   conversation  one conversation, opened from the sidebar by its title
 *                 (`--session`, default DEMO_TITLE). Only a conversation whose
 *                 every user message is DEMO_PROMPT is captured, and its title
 *                 must be a stand-in: send DEMO_PROMPT in a scratch instance
 *                 to make one.
 *
 * The brand is the instance's own (the settings page's Brand mark); `--brand`
 * names the one expected, and a page carrying another fails the run.
 *
 * Usage:
 *   node scripts/shoot.cjs --token <launch-token> [--url http://127.0.0.1:3080]
 *     [--brand claude|deepseek] [--scene home|conversation] [--session <title>]
 *
 * The launch token comes from the `dsh web` banner (GUI URL `/?token=…`) or
 * the DSH_WEB_TOKEN env var. Chrome is launched headless with a throwaway
 * profile (scripts/chrome.cjs) and stopped when the run ends.
 *
 * `shoot(options)` is exported for scripts that stage more of the page first:
 * its `prepare(conn)` hook runs after the page is up and before the sanitize.
 */
const fs = require('fs')
const path = require('path')
const { findChrome, launchChrome, connectTab } = require('./chrome.cjs')

const WIDTH = 1440
/** The home page fits the classic frame; a conversation turn needs the taller one. */
const HEIGHTS = { home: 900, conversation: 1240 }

/** Neutral stand-ins for the sidebar workspace rows and the session titles. */
const PROJECT_NAMES = ['demo-project', 'sample-app', 'docs-site', 'theme-lab', 'notes-app', 'e-comm-demo']
const SESSION_NAMES = [
  'Fix flaky onboarding test',
  'Add CSV export',
  'Refactor auth flow',
  'Polish settings page',
  'Update README screenshots',
  'Investigate scroll jitter',
  'Migrate build script',
  'Trim bundle size',
  'Markdown rendering tour',
]
const USERNAME = 'Ada'

/** The conversation scene's only admissible user message, and its session's default title. */
const DEMO_PROMPT = '用一段简短的示例，展示你支持的 Markdown 格式。'
const DEMO_TITLE = 'Markdown rendering tour'

/**
 * Canvas colors that identify the resolved palette, per brand. Host builtin
 * themes carry empty token maps, so every color comes from the stylesheets
 * branching on `data-ds-dark-theme`: dark tokens are the base, light overrides
 * sit under `:not([data-ds-dark-theme])`, and the DeepSeek brand rewrites both.
 */
const CANVAS = {
  claude: { light: 'rgb(252, 252, 251)', dark: 'rgb(20, 20, 19)' },
  deepseek: { light: 'rgb(247, 250, 255)', dark: 'rgb(19, 22, 29)' },
}

/**
 * Personal-data regex sources, kept as strings so the page sweep and the
 * final assertion rebuild from one copy. LEAK covers the local username,
 * drive paths and quota amounts; PATH and BALANCE cover the two rewrites.
 */
const USERNAME_RE_SOURCE = 'Nwflower'
const PATH_RE_SOURCE = '[A-Z]:[\\\\/][^\\\\s"\']*'
const BALANCE_RE_SOURCE = '\u00a5\\s?[0-9][0-9.,]*'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Replace sidebar titles with stand-ins; swap the username nodes for static
 * ones under a different class — the theme's footer sync re-writes any node
 * still carrying `.dsh-claude-account-user` with the inferred real name, so
 * the stand-in must be invisible to that query. The name the account row
 * shows is replaced everywhere else too (the studio greeting says it).
 *
 * A title that already is a stand-in — bare, or after a source label such as
 * "Claude · " — stays, and so does a blank session's, which is the host's own
 * label for one (the same words as its New session button); the others take
 * the stand-ins no row uses yet.
 */
const SANITIZE_JS = `(() => {
  const blank = ((document.querySelector('button[class*="newSession"]') || {}).innerText || '').trim().split('\\n')[0]
  const swap = (elements, names) => {
    const standIn = (text) => names.find((name) => text === name || text.endsWith(' · ' + name))
    const used = new Set(elements.map((el) => standIn((el.textContent || '').trim())).filter(Boolean))
    const spare = names.filter((name) => !used.has(name))
    let swapped = 0
    elements.forEach((el, i) => {
      const text = (el.textContent || '').trim()
      if (!text || text === blank || standIn(text)) return
      el.textContent = spare.length > 0 ? spare.shift() : names[i % names.length]
      swapped++
    })
    return swapped
  }
  let swapped = 0
  swapped += swap([...document.querySelectorAll('[class*="projectRow"] [class*="projectText"]')], ${JSON.stringify(PROJECT_NAMES)})
  swapped += swap([...document.querySelectorAll('[class*="sessionRow"] [class*="title"]')], ${JSON.stringify(SESSION_NAMES)})
  const shown = ((document.querySelector('.dsh-claude-account-user') || {}).textContent || '').trim()
  if (shown.length >= 2 && shown !== ${JSON.stringify(USERNAME)}) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if ((node.nodeValue || '').includes(shown) && !node.parentElement.closest('.dsh-claude-account-user')) {
        node.nodeValue = node.nodeValue.split(shown).join(${JSON.stringify(USERNAME)})
        swapped++
      }
    }
  }
  document.querySelectorAll('.dsh-claude-account-user').forEach((el) => {
    const rep = document.createElement('span')
    rep.className = 'dsh-claude-account-you'
    rep.style.cssText = 'font-weight:500;color:var(--dsw-alias-label-primary);'
    rep.textContent = ${JSON.stringify(USERNAME)}
    el.replaceWith(rep)
    swapped++
  })
  document.querySelectorAll('.dsh-claude-account-popover-name').forEach((el) => {
    const rep = document.createElement('div')
    rep.className = 'dsh-claude-account-popover-name-static'
    rep.style.cssText = 'font-size:14px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-primary);'
    rep.textContent = ${JSON.stringify(USERNAME)}
    el.replaceWith(rep)
    swapped++
  })
  return swapped
})()`

/** Rewrite any surviving username / drive-path / quota text; report what was caught. */
const SWEEP_JS = `(() => {
  const userRe = new RegExp(${JSON.stringify(USERNAME_RE_SOURCE)}, 'gi')
  const pathRe = new RegExp(${JSON.stringify(PATH_RE_SOURCE)}, 'g')
  const balRe = new RegExp(${JSON.stringify(BALANCE_RE_SOURCE)}, 'g')
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const caught = []
  while (walker.nextNode()) {
    const node = walker.currentNode
    const text = node.nodeValue || ''
    userRe.lastIndex = 0; pathRe.lastIndex = 0; balRe.lastIndex = 0
    if (userRe.test(text) || pathRe.test(text) || balRe.test(text)) {
      caught.push(text.trim().slice(0, 80))
      node.nodeValue = text
        .replace(userRe, ${JSON.stringify(USERNAME)})
        .replace(pathRe, '…')
        .replace(balRe, '\u00a5\u2022\u2022')
    }
  }
  return caught
})()`

/** The palette must not contain personal data anywhere in its visible text. */
function assertClean(visibleText) {
  const leak = new RegExp(`${USERNAME_RE_SOURCE}|${PATH_RE_SOURCE}|${BALANCE_RE_SOURCE}`, 'i')
  if (leak.test(visibleText)) throw new Error('sensitive text still visible after sanitize')
}

/**
 * Open the conversation titled `title` from the sidebar, and prove it is the
 * demo: a stand-in title and nothing but DEMO_PROMPT from the user.
 */
async function openDemoConversation({ send, evalJs }, title) {
  if (!SESSION_NAMES.includes(title)) throw new Error(`"${title}" is not a stand-in title — refusing to open it`)
  const opened = await evalJs(`(() => {
    const row = [...document.querySelectorAll('[class*="sessionRow"]')]
      .find((el) => { const t = el.querySelector('[class*="title"]'); return t && t.textContent.trim() === ${JSON.stringify(title)} })
    if (!row) return false
    row.click()
    return true
  })()`)
  if (!opened) throw new Error(`no sidebar row titled "${title}" — expand its workspace in this instance first`)
  // The pointer never rests on the sidebar: a row's hover card shows its path.
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: WIDTH - 8, y: 400 })
  await sleep(4000)
  const prompts = await evalJs(`[...document.querySelectorAll('[data-chat-flow-kind="user"]')].map((el) => el.innerText.trim().split('\\n')[0])`)
  if (!Array.isArray(prompts) || prompts.length === 0) throw new Error('the conversation shows no user message — is it the demo?')
  const foreign = prompts.filter((text) => text !== DEMO_PROMPT)
  if (foreign.length > 0) throw new Error(`the conversation holds user messages other than the demo prompt — refusing to screenshot it: ${JSON.stringify(foreign.map((t) => t.slice(0, 40)))}`)
  await evalJs(`document.querySelectorAll('[class*="_scrollBody"]').forEach((el) => { el.scrollTop = 0 })`)
  await sleep(500)
}

async function captureOnce(conn, options, scheme, outFile) {
  const { send, evalJs } = conn
  const { scene, brand, startUrl } = options
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHTS[scene], deviceScaleFactor: 1, mobile: false })
  await send('Page.enable')
  await send('Page.navigate', { url: startUrl })
  await sleep(12000)

  if (!(await evalJs(`!!document.body.hasAttribute('data-dsh-claude-style')`))) {
    throw new Error('theme not applied — is the plugin active in this profile?')
  }
  const pageBrand = await evalJs(`document.body.getAttribute('data-dsh-claude-brand')`)
  if (pageBrand !== brand) throw new Error(`the page carries brand "${pageBrand}", expected "${brand}" — switch the Brand mark in settings`)

  if (scene === 'conversation') {
    await openDemoConversation(conn, options.session)
  } else {
    // The host's chat renderer marks every row of a conversation with its flow kind.
    const turns = await evalJs(`document.querySelectorAll('[data-chat-flow-kind]').length`)
    if (turns > 0) throw new Error(`landing view shows ${turns} conversation rows — refusing to screenshot session content`)
  }
  if (options.prepare) await options.prepare(conn)

  if (scheme === 'dark') {
    // The same DOM flip the theme service's presenter produces for the dark
    // snapshot; no durable preference is read or written.
    await evalJs(`document.body.setAttribute('data-ds-dark-theme', '')`)
  }
  const wantBg = CANVAS[brand][scheme]
  const bg = await evalJs(`getComputedStyle(document.body).backgroundColor`)
  if (bg !== wantBg) {
    throw new Error(`${scheme} palette did not take effect (body bg ${bg}, expected ${wantBg})`)
  }

  const swapped = await evalJs(SANITIZE_JS)
  const caught = await evalJs(SWEEP_JS)
  const visibleText = await evalJs(`document.body.innerText`)
  assertClean(visibleText)

  // Presenter re-applies can race the flip; re-assert the palette at the last
  // moment so a wiped attribute fails the run instead of shipping a light
  // dark-mode screenshot.
  if (scheme === 'dark') {
    await evalJs(`document.body.setAttribute('data-ds-dark-theme', '')`)
    const bgAgain = await evalJs(`getComputedStyle(document.body).backgroundColor`)
    if (bgAgain !== wantBg) throw new Error(`dark palette was reverted before capture (${bgAgain})`)
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const buf = Buffer.from(shot.result.data, 'base64')
  fs.writeFileSync(outFile, buf)
  console.log(`captured ${outFile} (${buf.length} bytes, brand=${brand}, scene=${scene}, scheme=${scheme}, sanitized ${swapped} nodes, sweep caught ${caught.length})`)
  console.log('--- visible text ---')
  console.log(visibleText.replace(/\n{2,}/g, '\n').slice(0, 1200))
  console.log('--- end text ---')
}

/**
 * Capture one brand and scene in light and dark.
 *
 * @param options - `{ token, url, out, brand, scene, session, name, prepare }`:
 *   `name` is the file stem (default `<brand>-<scene>`), `prepare(conn)` an
 *   optional hook that stages the page before the sanitize.
 * @returns the two files written.
 */
async function shoot(options) {
  if (!new RegExp(`${USERNAME_RE_SOURCE}|${PATH_RE_SOURCE}`, 'i').test('C:\\Users\\Nwflower\\tmp')) {
    throw new Error('leak regex failed self-test')
  }
  const brand = options.brand || 'claude'
  const scene = options.scene || 'home'
  if (!CANVAS[brand]) throw new Error(`unknown brand "${brand}" (claude or deepseek)`)
  if (!HEIGHTS[scene]) throw new Error(`unknown scene "${scene}" (home or conversation)`)
  const browser = findChrome()
  if (!browser) throw new Error('no Chrome/Edge found; set CHROME_PATH')
  const base = (options.url || 'http://127.0.0.1:3080').replace(/\/+$/, '')
  const out = path.resolve(options.out || path.join(__dirname, '..', 'docs'))
  const name = options.name || `${brand}-${scene}`
  const run = {
    brand,
    scene,
    session: options.session || DEMO_TITLE,
    prepare: options.prepare,
    startUrl: `${base}/?token=${encodeURIComponent(options.token)}`,
  }
  fs.mkdirSync(out, { recursive: true })
  const files = [path.join(out, `${name}-light.png`), path.join(out, `${name}-dark.png`)]
  const chrome = await launchChrome(browser, { name: 'shoot', width: WIDTH, height: HEIGHTS[scene] })
  try {
    const conn = await connectTab(chrome.port)
    await captureOnce(conn, run, 'light', files[0])
    await captureOnce(conn, run, 'dark', files[1])
  } finally {
    await chrome.close()
  }
  return files
}

module.exports = { shoot, DEMO_PROMPT, DEMO_TITLE }

if (require.main === module) {
  const args = process.argv.slice(2)
  const argOf = (name) => {
    const i = args.indexOf('--' + name)
    return i === -1 ? undefined : args[i + 1]
  }
  const token = argOf('token') || process.env.DSH_WEB_TOKEN
  if (!token) {
    console.error('usage: node scripts/shoot.cjs --token <launch-token> [--url <base>] [--brand claude|deepseek] [--scene home|conversation] [--session <title>]')
    process.exit(2)
  }
  shoot({ token, url: argOf('url'), out: argOf('out'), brand: argOf('brand'), scene: argOf('scene'), session: argOf('session') })
    .then(() => console.log('\nSCREENSHOTS CAPTURED'))
    .catch((e) => { console.error(e.message || e); process.exitCode = 1 })
}
