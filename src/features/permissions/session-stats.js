    /**
     * The session's numbers, read from the host's own projections and shown in
     * the context popover.
     *
     * The composer's stats row is hidden (features/composer/inline-bar.css) and
     * the numbers move into the popover the context meter owns, which opens on
     * hover. They are read as DATA: the host computes `sessionStats` and
     * `tokenUsage` as durable whole-log session projections, and the session
     * face carries their key-addressed read faces (`session.projections.faceOf`)
     * — the same seat the host's own `useProjection` resolves. The host's two
     * stat dialogs are never opened, so nothing is rendered twice, and the block
     * is filled the moment the popover appears (and again on every projection
     * frame while it is open).
     *
     * The WORDS come from the host's own `chat` locale namespace, the one its
     * pills read, so the two surfaces agree letter for letter and follow the
     * shell language together. Three small formatting rules live on top of the
     * raw values (the host applies them in ui-chat before it paints): each is
     * mirrored here and named after its source — formatDuration,
     * formatTokensPerSecond, formatExactTokens and formatCacheHitPercent.
     *
     * Split out of installPermissions (src/features/permissions/permissions.js).
     *
     * @param ctx - client context: the session binding and the locale seat.
     * @returns { sync, close, teardown }.
     */
    function createSessionStats(ctx) {
        // The popover card this feature used to own. A client hot reload drops
        // the previous generation's disposals without running them, so its card
        // would otherwise sit in <body> for good, frozen at whatever it last
        // showed. Nothing creates that node any more; the sweep is for the
        // generation that did.
        removeStrayNodes(document, 'body > .dsh-claude-stats-popover', [])

        /** The mark on the block this feature appends to the host's panel. */
        const CONTEXT_STATS_ATTR = 'data-dsh-claude-context-stats'
        /** The mark on the host's panel itself, which is what takes the entrance. */
        const CONTEXT_PANEL_ATTR = 'data-dsh-claude-context-panel'
        /** The mark on the block while it holds the numbers' place. */
        const CONTEXT_SKELETON_ATTR = 'data-dsh-claude-context-skeleton'
        /** The projections the block reads, in the order its sections appear. */
        const STATS_KEYS = ['sessionStats', 'tokenUsage']
        /** Identity of the bindings THIS generation installed (a hot reload reuses the host's nodes). */
        const statsBindingToken = {}
        /**
         * How long the block may hold the numbers' place.
         *
         * A projection that has not answered yet is what this covers: the block
         * reserves the height it will need, so the panel opens whole. A host that
         * serves no such projection never answers, and the place is given up at
         * this deadline rather than standing there as a lie.
         */
        const STATS_SKELETON_MS = 2000
        /** Rows of each section the placeholder reserves (a session's usual count). */
        const STATS_SKELETON_ROWS = 4

        /** The projection keys this page is following, and how to stop. */
        let watch = null
        /** The block's last written content, so an unchanged pass writes nothing. */
        let blockSignature = ''
        /** Whether the block is holding the numbers' place, and since when. */
        let skeleton = false
        let skeletonSince = 0
        /** The timer that gives the place up at the deadline, while one runs. */
        let skeletonTimer = null

        /**
         * The shown conversation's host session id.
         *
         * Read off the active conversation's own column (features/turn-status
         * does the same): the id names the conversation on screen, which is the
         * composer whose meter opened the popover.
         */
        function shownSessionId() {
          const host = document.querySelector('[data-phase="active"] [data-conversation-session]')
          if (host === null) return ''
          const id = host.getAttribute('data-conversation-session')
          return typeof id === 'string' ? id : ''
        }

        /**
         * The host's key-addressed read faces for one session, or null while the
         * session or its projections cannot be reached.
         */
        function statsFaces(sessionId) {
          const sessions = ctx.get('sessions')
          const binding = typeof sessions?.binding === 'function' ? sessions.binding(sessionId) : undefined
          const projections = binding?.session?.projections
          if (typeof projections?.faceOf !== 'function') return null
          const faces = {}
          for (let i = 0; i < STATS_KEYS.length; i++) faces[STATS_KEYS[i]] = projections.faceOf(STATS_KEYS[i])
          return faces
        }

        /** One projection's current whole value, or undefined while it is absent. */
        function statsValue(key) {
          const face = watch === null ? undefined : watch.faces[key]
          return typeof face?.getSnapshot === 'function' ? face.getSnapshot() : undefined
        }

        /** Stop following the projections (a different session, or the teardown). */
        function releaseWatch() {
          if (watch === null) return
          for (let i = 0; i < watch.off.length; i++) watch.off[i]()
          watch = null
          stopSkeleton()
        }

        /** Give up the numbers' place, if the block is holding it. */
        function stopSkeleton() {
          skeleton = false
          skeletonSince = 0
          if (skeletonTimer !== null) {
            clearTimeout(skeletonTimer)
            skeletonTimer = null
          }
        }

        /**
         * A projection frame landed. The block is the skin's own node inside the
         * host's panel, so it is rewritten here rather than through a pass.
         */
        function onStatsFrame() {
          renderContextStats()
        }

        /**
         * Follow the shown conversation's projections, one subscription per
         * session: a switch releases the old faces and binds the new ones.
         */
        function syncWatch() {
          const sessionId = shownSessionId()
          if (watch !== null && watch.sessionId === sessionId) return
          releaseWatch()
          blockSignature = ''
          if (sessionId === '') return
          const faces = statsFaces(sessionId)
          if (faces === null) return
          const off = []
          for (let i = 0; i < STATS_KEYS.length; i++) {
            const face = faces[STATS_KEYS[i]]
            if (typeof face?.subscribe === 'function') off.push(face.subscribe(onStatsFrame))
          }
          watch = { sessionId, faces, off }
        }

        /** The host's `chat` namespace translate seat, or null when it is absent. */
        function chatText() {
          const locale = ctx.get('locale')
          return typeof locale?.bind === 'function' ? locale.bind('chat') : null
        }

        /* ---------- the numbers, in the host's own words ---------- */

        /**
         * Compact duration, mirroring ui-chat's `formatDuration`: tenths of a
         * second under a minute, whole minutes and seconds from there on,
         * through the namespace's own templates.
         */
        function sessionStatsDuration(ms, chat) {
          const seconds = ms / 1_000
          if (seconds < 60) return chat('duration.compactSeconds', { seconds: Math.round(seconds * 10) / 10 })
          const whole = Math.round(seconds)
          return chat('duration.compactMinutes', { minutes: Math.floor(whole / 60), seconds: whole % 60 })
        }

        /** Decode throughput, mirroring ui-chat's `formatTokensPerSecond`. */
        function sessionStatsSpeed(tps) {
          const clamped = Math.max(0, tps)
          return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
        }

        /** Exact token count with the locale's group separator, mirroring ui-chat's `formatExactTokens`. */
        function sessionStatsGrouped(value, chat) {
          const digits = String(value)
          const groups = []
          for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end))
          return groups.join(chat('number.groupSeparator'))
        }

        /** One usage row's reading, as the host writes it: the count template around the grouped number. */
        function sessionStatsTokens(value, chat) {
          return chat('message.turnUsage.count', { count: sessionStatsGrouped(value, chat) })
        }

        /**
         * The largest whole-percent unit a ratio reaches, ties rounded up —
         * ui-chat's `roundedPercentUnits` at its ordinary precision.
         */
        function sessionStatsPercentUnits(cacheReadTokens, denominator) {
          const scale = 100
          const doubled = scale * 2
          const quotient = Math.floor(denominator / doubled)
          const remainder = denominator % doubled
          let lower = 0
          let upper = scale
          while (lower < upper) {
            const candidate = Math.floor((lower + upper + 1) / 2)
            const factor = candidate * 2 - 1
            const threshold = factor * quotient + Math.ceil(factor * remainder / doubled)
            if (cacheReadTokens >= threshold) lower = candidate
            else upper = candidate - 1
          }
          return lower
        }

        /**
         * Cache-hit share of the prompt side, mirroring ui-chat's
         * `formatCacheHitPercent`: a partial hit never rounds up to 100 — the
         * ordinary precision is one whole percent, and a ratio that would round
         * to 100 takes exactly enough extra decimals to stay below it. Null when
         * nothing was billed.
         */
        function sessionStatsCacheHit(cacheReadTokens, promptTokens) {
          if (promptTokens === 0) return null
          const missed = promptTokens - cacheReadTokens
          if (missed === 0) return '100'
          const units = sessionStatsPercentUnits(cacheReadTokens, promptTokens)
          if (units < 100) return String(units)
          let places = 1
          let gap = missed * 200
          const tens = Math.floor(promptTokens / 10)
          while (gap <= tens) {
            gap *= 10
            places += 1
          }
          const ones = promptTokens % 10
          let loss = 5
          for (let candidate = 1; candidate < 5; candidate += 1) {
            const factor = candidate * 2 + 1
            if (gap <= factor * tens + Math.floor(factor * ones / 10)) {
              loss = candidate
              break
            }
          }
          return `99.${'9'.repeat(places - 1)}${10 - loss}`
        }

        /**
         * The block's sections, with the host's own row rules: a row appears
         * only when its input exists, so a session without tool time or without
         * a recorded first token shows fewer rows rather than zeros, and a
         * session that never billed shows no usage section.
         */
        function sessionStatsSections(chat) {
          const sections = []
          const stats = statsValue('sessionStats')
          if (stats !== undefined && stats !== null) {
            const rows = []
            if (stats.llmMs > 0) rows.push({ label: chat('stats.dialog.llmTime'), value: sessionStatsDuration(stats.llmMs, chat) })
            if (stats.toolMs > 0) rows.push({ label: chat('stats.dialog.toolTime'), value: sessionStatsDuration(stats.toolMs, chat) })
            if (stats.ttftSteps > 0) rows.push({ label: chat('stats.dialog.ttft'), value: sessionStatsDuration(stats.ttftMs / stats.ttftSteps, chat) })
            if (stats.decodeMs > 0) {
              rows.push({
                label: chat('stats.dialog.speed'),
                value: chat('message.tokensPerSecond', { tps: sessionStatsSpeed(stats.decodeTokens / (stats.decodeMs / 1_000)) }),
              })
            }
            if (rows.length > 0) sections.push({ title: chat('stats.dialog.title'), rows })
          }
          const usage = statsValue('tokenUsage')
          if (usage !== undefined && usage !== null) {
            const billed = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
            if (billed > 0 || usage.outputTokens > 0) {
              const rows = []
              const hit = sessionStatsCacheHit(usage.cacheReadTokens, billed)
              if (hit !== null) rows.push({ label: chat('message.turnUsage.cacheHit'), value: `${hit}%` })
              rows.push({ label: chat('message.turnUsage.input'), value: sessionStatsTokens(usage.uncachedInputTokens, chat) })
              rows.push({ label: chat('message.turnUsage.cacheRead'), value: sessionStatsTokens(usage.cacheReadTokens, chat) })
              if (usage.cacheWriteTokens !== 0) {
                rows.push({ label: chat('message.turnUsage.cacheWrite'), value: sessionStatsTokens(usage.cacheWriteTokens, chat) })
              }
              rows.push({ label: chat('message.turnUsage.output'), value: sessionStatsTokens(usage.outputTokens, chat) })
              sections.push({ title: chat('stats.dialog.usageTitle'), rows })
            }
          }
          return sections
        }

        /* ---------- the context popover: what the numbers go into ---------- */

        /**
         * The meter's trigger: the host's own button, whose click opens and
         * closes the context panel. The meter itself is stamped by the composer
         * pass (features/composer/composer.js), which is also what tells this
         * feature the composer restyle covers the page.
         */
        function contextTrigger() {
          const meter = document.querySelector('[data-dsh-claude-context-meter]')
          return meter === null ? null : meter.querySelector('button')
        }

        /**
         * The host's context panel: the dialog it portals to <body>, told apart
         * from the host's other dialogs by shape rather than by its own copy —
         * it is the one that is not a modal and that lists its rows in a <dl>.
         */
        function contextPanel() {
          const dialogs = document.querySelectorAll('[role="dialog"]')
          for (let i = 0; i < dialogs.length; i++) {
            const dialog = dialogs[i]
            if (dialog.getAttribute('aria-modal') === 'true') continue
            if (dialog.querySelector('dl') === null) continue
            return dialog
          }
          return null
        }

        /**
         * Whether the host rendered its DETAILED statistics row, which is the
         * host's own answer to whether it wants these numbers shown at all.
         *
         * The host keeps the performanceUsage mode in React state and puts no
         * marker on the DOM, so the two structures have to be told apart by
         * shape. Detailed wraps each pill in an anchor span and makes the
         * dialog-carrying ones buttons; compact renders bare span pills with no
         * trigger and no dialog. The wrapper check catches the detailed pill
         * whose dialog has no rows yet — a static span, not a button. The row is
         * HIDDEN by the stylesheet but still rendered, which is what makes this
         * readable.
         */
        function hostStatsDetailed(root) {
          if (root.querySelector('button[aria-haspopup="dialog"]') !== null) return true
          const children = root.children
          for (let i = 0; i < children.length; i++) {
            if (children[i].querySelector('button, span') !== null) return true
          }
          return false
        }

        /** The block this feature keeps at the panel's end, created on first sight. */
        function ensureContextBlock(panel) {
          let block = panel.querySelector(`[${CONTEXT_STATS_ATTR}]`)
          if (block === null) {
            block = document.createElement('div')
            block.className = 'dsh-claude-context-stats'
            block.setAttribute(CONTEXT_STATS_ATTR, '')
            panel.appendChild(block)
          }
          return block
        }

        /** Take the block out of the panel (nothing to show, or the place given up). */
        function removeContextBlock(panel) {
          const block = panel.querySelector(`[${CONTEXT_STATS_ATTR}]`)
          if (block !== null && block.parentElement !== null) block.parentElement.removeChild(block)
          blockSignature = ''
        }

        /**
         * Hold the numbers' place while the projections have answered nothing:
         * the two real headings over bars at a row's own size, so the panel
         * opens at the height the numbers will take. The place is given up at
         * STATS_SKELETON_MS — a host that serves no such projection never
         * answers, and the block then leaves rather than standing there as
         * placeholder bars.
         */
        function renderContextSkeleton(panel, chat) {
          if (!skeleton) {
            skeleton = true
            skeletonSince = Date.now()
          }
          const held = Date.now() - skeletonSince
          if (held >= STATS_SKELETON_MS) {
            stopSkeleton()
            removeContextBlock(panel)
            return
          }
          if (skeletonTimer === null) {
            skeletonTimer = setTimeout(() => {
              skeletonTimer = null
              stopSkeleton()
              renderContextStats()
            }, STATS_SKELETON_MS - held)
          }
          const titles = [chat('stats.dialog.title'), chat('stats.dialog.usageTitle')]
          let signature = 'skeleton'
          let html = ''
          for (let i = 0; i < titles.length; i++) {
            signature += `\u0001${titles[i]}`
            html += `<div class="dsh-claude-context-stats-section">${statsEscape(titles[i])}</div><div class="dsh-claude-context-stats-grid">`
            for (let r = 0; r < STATS_SKELETON_ROWS; r++) {
              html += '<div class="dsh-claude-context-stats-item"><span class="dsh-claude-context-stats-skeleton-label"></span><span class="dsh-claude-context-stats-skeleton-value"></span></div>'
            }
            html += '</div>'
          }
          const block = ensureContextBlock(panel)
          if (signature === blockSignature && block.childElementCount > 0) return
          blockSignature = signature
          block.setAttribute(CONTEXT_SKELETON_ATTR, '')
          block.innerHTML = html
        }

        /**
         * Write the numbers into the open panel, or keep the panel as the host
         * drew it while there is nothing to show. A block whose content has not
         * changed is left alone; a block with no sections at all is taken out,
         * so no hairline is left standing over nothing.
         */
        function renderContextStats() {
          const panel = contextPanel()
          if (panel === null) return
          const root = document.querySelector('[data-composer-stats]')
          if (root === null || !hostStatsDetailed(root)) return
          const chat = chatText()
          if (chat === null) return
          const waiting = statsValue('sessionStats') === undefined && statsValue('tokenUsage') === undefined
          const sections = waiting ? [] : sessionStatsSections(chat)
          if (sections.length === 0) {
            if (waiting) renderContextSkeleton(panel, chat)
            else removeContextBlock(panel)
            return
          }
          stopSkeleton()
          let html = ''
          let signature = ''
          for (let sIndex = 0; sIndex < sections.length; sIndex++) {
            const section = sections[sIndex]
            signature += `\u0001${section.title}`
            html += `<div class="dsh-claude-context-stats-section">${statsEscape(section.title)}</div><div class="dsh-claude-context-stats-grid">`
            for (let r = 0; r < section.rows.length; r++) {
              const row = section.rows[r]
              signature += `\u0001${row.label}\u0002${row.value}`
              html += `<div class="dsh-claude-context-stats-item"><div class="dsh-claude-context-stats-label">${statsEscape(row.label)}</div><div class="dsh-claude-context-stats-value">${statsEscape(row.value)}</div></div>`
            }
            html += '</div>'
          }
          const block = ensureContextBlock(panel)
          block.removeAttribute(CONTEXT_SKELETON_ATTR)
          if (signature === blockSignature && block.childElementCount > 0) return
          blockSignature = signature
          block.innerHTML = html
        }

        /**
         * One value as markup. Every string above is either a locale template
         * (numbers substituted in) or a formatted number, and both reach the
         * block as text.
         */
        function statsEscape(value) {
          return String(value === void 0 || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
        }

        /* ---------- hover opens the host's own popover ---------- */

        /**
         * Open the context panel by pressing the host's trigger: the panel, its
         * placement, its dismissal and its keyboard handling all stay the
         * host's. Only the trigger is driven, and only when it is closed.
         */
        function openContextPanel() {
          const trigger = contextTrigger()
          if (trigger === null || trigger.getAttribute('aria-expanded') === 'true') return
          trigger.click()
        }

        /**
         * Close it again, the same way. The panel's own mouseenter cancels this
         * first (hover intent); the `:hover` test is the second net for the
         * frame in which the pointer is already inside a panel the leave event
         * still saw as left.
         */
        function closeContextPanel() {
          const trigger = contextTrigger()
          if (trigger === null || trigger.getAttribute('aria-expanded') !== 'true') return
          const panel = contextPanel()
          if (panel !== null && panel.matches(':hover')) return
          trigger.click()
        }

        const hoverIntent = createHoverIntent(openContextPanel, closeContextPanel, POPOVER_OPEN_DELAY, POPOVER_CLOSE_DELAY)

        /** The hover preference gates both directions, as it does for the skin's other popovers. */
        function hoverEnabled() {
          return readPrefs().autoPopover === AUTO_POPOVER_ALL
        }

        function bindContextMeter(meter) {
          if (meter.__dshContextMeterToken === statsBindingToken) return
          meter.__dshContextMeterToken = statsBindingToken
          meter.addEventListener('mouseenter', () => {
            if (hoverEnabled()) hoverIntent.scheduleOpen()
          })
          meter.addEventListener('mouseleave', () => {
            if (hoverEnabled()) hoverIntent.scheduleClose()
          })
        }

        function bindContextPanel(panel) {
          if (!panel.hasAttribute(CONTEXT_PANEL_ATTR)) panel.setAttribute(CONTEXT_PANEL_ATTR, '')
          if (panel.__dshContextPanelToken === statsBindingToken) return
          panel.__dshContextPanelToken = statsBindingToken
          panel.addEventListener('mouseenter', () => {
            hoverIntent.cancel()
          })
          panel.addEventListener('mouseleave', () => {
            if (hoverEnabled()) hoverIntent.scheduleClose()
          })
        }

        /**
         * A pass over the context popover: follow the shown conversation's
         * projections, then keep the panel's block current while it is open.
         */
        function syncContextPopover() {
          syncWatch()
          const meter = document.querySelector('[data-dsh-claude-context-meter]')
          if (meter !== null) bindContextMeter(meter)
          const panel = contextPanel()
          if (panel === null) return
          bindContextPanel(panel)
          renderContextStats()
        }

        return {
            /** One pass: keep the panel filled while it is open. */
            sync() {
                syncContextPopover()
            },
            /** Composer focus closes the panel the host's trigger opened. */
            close() {
                hoverIntent.cancel()
                const trigger = contextTrigger()
                if (trigger === null || trigger.getAttribute('aria-expanded') !== 'true') return
                trigger.click()
            },
            /** Drop the appends, the projection subscriptions and the hover timers. */
            teardown() {
                hoverIntent.cancel()
                releaseWatch()
                const blocks = document.querySelectorAll(`[${CONTEXT_STATS_ATTR}]`)
                for (let i = 0; i < blocks.length; i++) {
                    if (blocks[i].parentElement !== null) blocks[i].parentElement.removeChild(blocks[i])
                }
                const panels = document.querySelectorAll(`[${CONTEXT_PANEL_ATTR}]`)
                for (let i = 0; i < panels.length; i++) panels[i].removeAttribute(CONTEXT_PANEL_ATTR)
                blockSignature = ''
            }
        }
    }
