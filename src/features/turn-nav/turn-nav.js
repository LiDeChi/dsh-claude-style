    /**
     * The conversation navigator (docs/architecture.md D34): the turn rail at
     * the conversation's right edge, drawn by the skin at the pitch of the list
     * it opens into.
     *
     * The host draws its own rail (ui-chat's TurnNavigator, read through
     * turn-nav-host.js): one short mark per turn, ten pixels apart, following
     * the reading position, a mark's click jumping to its turn. The skin draws
     * its rail in the same seat, one mark per turn at the card's row pitch, and
     * keeps the host's rail laid out but unseen: the host's marks are what a
     * jump presses, and its current mark is the reading position the skin's
     * rail follows. On top of that rail:
     *
     *   list     the pointer reaching the rail opens a card over it, one row per
     *            turn with the prompt that opened it. Each row sits exactly
     *            where its mark was — the turn being read stays where its mark
     *            stood, under the hand stays the turn that was under it — and
     *            the card's wheel scrolls rail and rows together. A press jumps.
     *   keys     Alt+↑ / Alt+↓ jump to the previous or the next turn.
     *   landing  the turn a jump lands on shows a short line over its first row.
     *
     * The skin's rail sits in the host's own slot beside the host's rail and
     * takes its seat from the same rules the host's stylesheet places its rail
     * with (turn-nav.css), so placing it reads no layout. Layout is read when
     * the card opens, and when the reading position moved the current mark.
     *
     * @param ctx - client context.
     * @param ui - the shared handle table.
     * @returns teardown.
     */
    function installTurnNav(ctx, ui) {
      /** On the host's rail while the skin's rail stands in for it: the stylesheet hides it, keeping its layout. */
      const TURN_NAV_REPLACED_ATTR = 'data-dsh-claude-turn-nav-replaced'
      /** On the skin's rail while the card is open over it: its marks step back. */
      const TURN_NAV_OPEN_ATTR = 'data-dsh-claude-turn-nav-open'
      /** On the first row of the turn a jump landed on, while its line shows. */
      const TURN_NAV_LANDED_ATTR = 'data-dsh-claude-turn-nav-landed'
      /** The card's name in the popover registry (D16). */
      const TURN_NAV_POPOVER = 'turnNav'
      /** One turn's height on the rail and in the card: the two have to match for a row to sit on its mark. */
      const TURN_NAV_PITCH = 24
      /** How long the landing line stays: its animation (turn-nav.css) plus a frame. */
      const LANDED_MS = 1500
      /** How long a jump to a turn outside the loaded window may take to bring its rows in. */
      const LANDING_WAIT_MS = 10000
      /**
       * A key pressed again within this window steps on from the turn the last
       * key went to: the reading position is still on its way there, and
       * reading it would send a held key back to the turn it just left.
       */
      const KEY_REPEAT_MS = 1200
      /** dsh-plugin-msg-nav's stylesheet, in the head while its browser half is live. */
      const MSG_NAV_STYLE_SELECTOR = 'style[data-plugin-css="dsh-plugin-msg-nav/style.css"]'
      /** A layer that holds the foreground: the host arbitrates its own keys by the same query. */
      const FOREGROUND_SELECTOR = '[role="dialog"][aria-modal="true"], [role="menu"]'

      const host = createTurnNavHost(ctx)

      /** The skin's rail, the track its marks ride on, and the host rail it stands over. */
      let rail = null
      let track = null
      let hostRail = null
      /** The turns the rail's marks show, mark for mark, and how far the track is scrolled. */
      let drawnItems = null
      let offset = 0
      /** The host's current mark last read, and the place it gave; -1 when there is none. */
      let currentMark = null
      let current = -1
      /** The card, its scrolling list, and the turns its rows show (null when the rows must be rebuilt). */
      let card = null
      let list = null
      let rowItems = null
      let open = false
      /** The frame a coalesced refresh waits on. */
      let refreshFrame = 0
      /** The turn the last key went to, and when. */
      let keyJump = null
      /** The turn whose first row should show the landing line once it is in the window. */
      let landing = null
      let landedRow = null
      let landedTimer = null

      /* ---------- the rail ---------- */

      function ensureRail() {
        if (rail !== null) return
        rail = buildElement('div', 'dsh-claude-turn-rail')
        rail.setAttribute('aria-hidden', 'true')
        // The marks change with the reading position; none of that is news to a pass.
        rail.setAttribute(QUIET_ATTR, '')
        track = buildElement('div', 'dsh-claude-turn-rail-track')
        rail.appendChild(track)
        rail.addEventListener('pointerenter', openCard)
      }

      /** Stand the skin's rail beside the host's, in the host's slot, and hide the host's. */
      function mountRail(found) {
        ensureRail()
        if (hostRail !== found) {
          if (hostRail !== null) hostRail.removeAttribute(TURN_NAV_REPLACED_ATTR)
          hostRail = found
          found.setAttribute(TURN_NAV_REPLACED_ATTR, '')
          currentMark = null
          current = -1
        }
        if (rail.parentElement !== found.parentElement) found.parentElement.appendChild(rail)
      }

      /** Take the skin's rail away and give the host's back. */
      function unmountRail() {
        closeCard()
        if (hostRail !== null) hostRail.removeAttribute(TURN_NAV_REPLACED_ATTR)
        hostRail = null
        if (rail !== null && rail.parentElement !== null) rail.remove()
        drawnItems = null
        currentMark = null
        current = -1
      }

      /** One mark per turn; a turn outside the loaded window is drawn fainter, as the host draws it. */
      function drawMarks(items) {
        if (drawnItems === items) return
        drawnItems = items
        const marks = document.createDocumentFragment()
        for (let i = 0; i < items.length; i++) {
          const mark = buildElement('span', 'dsh-claude-turn-rail-mark')
          mark.style.top = `${i * TURN_NAV_PITCH}px`
          if (!items[i].loaded) mark.setAttribute('data-unloaded', '')
          marks.appendChild(mark)
        }
        track.replaceChildren(marks)
        track.style.height = `${items.length * TURN_NAV_PITCH}px`
        rail.style.setProperty('--dsh-claude-turn-rail-height', `${items.length * TURN_NAV_PITCH}px`)
        current = -1
        currentMark = null
      }

      /** Scroll the track, kept within its turns, and say which ends have more. */
      function setOffset(value) {
        const height = rail.clientHeight
        const most = Math.max(0, drawnItems.length * TURN_NAV_PITCH - height)
        offset = Math.round(Math.min(Math.max(value, 0), most))
        track.style.transform = `translateY(${-offset}px)`
        rail.toggleAttribute('data-fade-top', offset > 0)
        rail.toggleAttribute('data-fade-bottom', offset < most)
      }

      /** Bring the current mark into view, centred, when it is not well inside it. */
      function follow() {
        if (current < 0 || open) return
        const height = rail.clientHeight
        const top = current * TURN_NAV_PITCH
        if (top >= offset + TURN_NAV_PITCH && top + 2 * TURN_NAV_PITCH <= offset + height) return
        setOffset(top - (height - TURN_NAV_PITCH) / 2)
      }

      /**
       * Read the reading position off the host's current mark and mark it on
       * the rail and the open card. The host's mark element and its place are
       * compared first, so a pass that finds them as they were reads no layout.
       */
      function markCurrent() {
        const mark = hostRail.querySelector(TURN_RAIL_CURRENT_SELECTOR)
        if (mark === currentMark && (mark === null || Number(mark.dataset.index) === current)) return
        currentMark = mark
        const next = host.currentIndex(hostRail, drawnItems)
        if (next === current) return
        setCurrentRow(track, current, next)
        if (open) setCurrentRow(list, current, next)
        current = next
        follow()
      }

      function setCurrentRow(parent, from, to) {
        const previous = from < 0 ? undefined : parent.children[from]
        if (previous !== undefined) previous.removeAttribute('data-current')
        const next = to < 0 ? undefined : parent.children[to]
        if (next !== undefined) next.setAttribute('data-current', '')
      }

      /** Re-read the reading position once per frame while the conversation scrolls. */
      function scheduleRefresh() {
        if (refreshFrame !== 0) return
        refreshFrame = requestAnimationFrame(() => {
          refreshFrame = 0
          if (hostRail === null || drawnItems === null) return
          markCurrent()
          if (open) placeCard()
        })
      }

      /* ---------- the card ---------- */

      function ensureCard() {
        if (card !== null) return
        card = buildElement('div', 'dsh-claude-popover-card dsh-claude-turn-nav')
        card.setAttribute('data-open', 'false')
        // Rows are rebuilt while the card is open; none of that is news to a pass.
        card.setAttribute(QUIET_ATTR, '')
        list = buildElement('div', 'dsh-claude-turn-nav-list')
        card.appendChild(list)
        card.addEventListener('mouseenter', () => { hoverIntent.cancel() })
        card.addEventListener('mouseleave', () => { hoverIntent.scheduleClose() })
        list.addEventListener('click', onRowClick)
        list.addEventListener('scroll', () => { if (open) setOffset(list.scrollTop) }, { passive: true })
        document.body.appendChild(card)
      }

      /**
       * Build the rows when the turns changed. A turn without a prompt (one
       * opened by something other than a message) reads as the host's own
       * 「第 N 轮」, the words its rail preview gives it.
       */
      function renderRows(items, chat) {
        if (rowItems === items) return
        rowItems = items
        const rows = document.createDocumentFragment()
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const row = buildElement('button', 'dsh-claude-turn-nav-row')
          row.type = 'button'
          row.dataset.index = String(i)
          row.setAttribute('aria-label', chat('chat.turnNavigation.jump', { turn: item.turn }))
          if (!item.loaded) row.setAttribute('data-unloaded', '')
          if (i === current) row.setAttribute('data-current', '')
          row.appendChild(buildElement('span', 'dsh-claude-turn-nav-text', item.prompt !== '' ? item.prompt : chat('chat.turnNavigation.turn', { turn: item.turn })))
          row.appendChild(buildElement('span', 'dsh-claude-turn-nav-dash'))
          rows.appendChild(row)
        }
        list.replaceChildren(rows)
      }

      /**
       * Lay the card over the rail row for mark: the list's box on the rail's
       * box and scrolled as far as the rail's track, each row's dash on its
       * mark — a mark is drawn against the rail's right edge, a row's dash
       * against the row's right padding inside the card's padding and border.
       */
      function placeCard() {
        const box = rail.getBoundingClientRect()
        const cardStyle = getComputedStyle(card)
        const row = list.firstElementChild
        const rowInset = row === null ? 0 : parseFloat(getComputedStyle(row).paddingRight)
        // Unrounded: the rail sits on a half pixel whenever the band's height is odd.
        const right = `${window.innerWidth - box.right - parseFloat(cardStyle.borderRightWidth) - parseFloat(cardStyle.paddingRight) - rowInset}px`
        const top = `${box.top - parseFloat(cardStyle.borderTopWidth) - parseFloat(cardStyle.paddingTop)}px`
        const height = `${box.height}px`
        if (card.style.right !== right) card.style.right = right
        if (card.style.top !== top) card.style.top = top
        if (list.style.height !== height) list.style.height = height
        if (list.scrollTop !== offset) list.scrollTop = offset
      }

      function openCard() {
        hoverIntent.cancel()
        if (open || hostRail === null || drawnItems === null) return
        const chat = host.chatText()
        if (chat === null) return
        closeOtherPopovers(TURN_NAV_POPOVER)
        ensureCard()
        renderRows(drawnItems, chat)
        open = true
        rail.setAttribute(TURN_NAV_OPEN_ATTR, '')
        card.setAttribute('data-open', 'true')
        placeCard()
      }

      function closeCard() {
        hoverIntent.cancel()
        if (!open) return
        open = false
        card.setAttribute('data-open', 'false')
        if (rail !== null) {
          rail.removeAttribute(TURN_NAV_OPEN_ATTR)
          follow()
        }
      }

      /** Only the close is delayed: the grace that lets the pointer come back to the card. */
      const hoverIntent = createHoverIntent(openCard, closeCard, 0, POPOVER_CLOSE_DELAY)

      function onRowClick(event) {
        const row = closestFrom(event.target, '.dsh-claude-turn-nav-row')
        if (row === null || rowItems === null) return
        const item = rowItems[Number(row.dataset.index)]
        if (item !== undefined) jumpTo(item.turn)
      }

      /* ---------- the jump and its landing ---------- */

      /** Press the host's mark for one turn, then line the landed turn. */
      function jumpTo(turn) {
        host.jumpToTurn(turn, () => {
          landing = { turn, since: Date.now() }
          // A loaded turn has landed by now; one outside the window lands when
          // its rows arrive, which a pass sees.
          stampLanding()
          scheduleRefresh()
        })
      }

      /** Take the landing line off its row. */
      function clearLanded() {
        if (landedTimer !== null) {
          clearTimeout(landedTimer)
          landedTimer = null
        }
        if (landedRow !== null) {
          landedRow.removeAttribute(TURN_NAV_LANDED_ATTR)
          landedRow = null
        }
      }

      /** Put the landing line on the landed turn's first row, once that row is in the window. */
      function stampLanding() {
        if (landing === null) return
        if (Date.now() - landing.since > LANDING_WAIT_MS) {
          landing = null
          return
        }
        const session = findConversationSession()
        const row = session === null ? null : session.querySelector(`[${CHAT_TURN_ATTRIBUTE}="${landing.turn}"]:not([hidden]):not([hidden] *)`)
        if (row === null) return
        landing = null
        clearLanded()
        row.setAttribute(TURN_NAV_LANDED_ATTR, '')
        landedRow = row
        landedTimer = setTimeout(clearLanded, LANDED_MS)
      }

      /* ---------- the keys ---------- */

      /**
       * Whether the key went to a field holding a draft: the arrow moves the
       * caret there, and taking it would pull the view away from what is being
       * written. An empty field (the composer right after sending) is no draft.
       */
      function holdsDraft(target) {
        if (!(target instanceof Element)) return false
        if (target.tagName === 'SELECT') return true
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return target.value !== ''
        if (target.isContentEditable) return (target.textContent || '').trim() !== ''
        return false
      }

      /** Alt+↑ / Alt+↓: the previous or the next turn, from the one being read. */
      function onKey(event) {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return
        // dsh-plugin-msg-nav answers the same keys with its own jump; two jumps
        // from one key fight over the view, so the keys stay with it.
        if (document.head.querySelector(MSG_NAV_STYLE_SELECTOR) !== null) return
        if (holdsDraft(event.target) || document.querySelector(FOREGROUND_SELECTOR) !== null) return
        const found = host.findRail()
        const sessionId = conversationSessionId(findConversationSession())
        if (found === null || sessionId === null || !host.railShown(found)) return
        const items = host.turnItems(sessionId)
        const now = Date.now()
        const from = keyJump !== null && keyJump.sessionId === sessionId && now - keyJump.at < KEY_REPEAT_MS
          ? items.findIndex(item => item.turn === keyJump.turn)
          : host.currentIndex(found, items)
        const to = event.key === 'ArrowDown' ? (from < 0 ? 0 : from + 1) : from - 1
        if (to < 0 || to >= items.length) return
        event.preventDefault()
        keyJump = { sessionId, turn: items[to].turn, at: now }
        jumpTo(items[to].turn)
      }

      registerPopover(TURN_NAV_POPOVER, closeCard)

      ui.turnNav = {
        sync() {
          const found = host.findRail()
          const sessionId = conversationSessionId(findConversationSession())
          const chat = host.chatText()
          if (found === null || sessionId === null || chat === null) {
            unmountRail()
          } else {
            const items = host.turnItems(sessionId)
            mountRail(found)
            const redrawn = drawnItems !== items
            drawMarks(items)
            if (redrawn) setOffset(offset)
            markCurrent()
            if (open && redrawn) {
              // A turn arrived under the open card: its rows, and its seat with the rail's new height.
              renderRows(items, chat)
              scheduleRefresh()
            }
          }
          stampLanding()
        },
        owns(target) {
          return (card !== null && card.contains(target)) || (rail !== null && rail.contains(target))
        },
        close() {
          closeCard()
        },
        onKey,
        /** The shell language changed: the rows' words are rebuilt the next time they show. */
        onCopyChange() {
          rowItems = null
        },
        /** A scroll or a resize: the reading position may have moved, and the card's seat with the rail. */
        reposition() {
          if (hostRail !== null) scheduleRefresh()
        },
      }

      return () => {
        host.stop()
        if (refreshFrame !== 0) cancelAnimationFrame(refreshFrame)
        refreshFrame = 0
        unmountRail()
        rail = null
        track = null
        clearLanded()
        landing = null
        if (card !== null) card.remove()
        card = null
        list = null
        rowItems = null
        unregisterPopover(TURN_NAV_POPOVER)
        delete ui.turnNav
      }
    }
