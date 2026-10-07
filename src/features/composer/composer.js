    /**
     * The composer's own layout: one feature for the whole input area.
     *
     * Each pass starts here. It reads the page's composer state once — whether
     * the host shows the hero composer, and whether the restyle applies to it —
     * and every other feature reads that answer through `ui.composer` for the
     * rest of the pass. From the same reading it writes what the stylesheet
     * keys on: the hero/inline variant on the cards and their stack, the
     * composer gate on <body>, the attachment state and tiles, the context
     * meter's stamp and room, and whether the chat tab (the composer's only
     * view) is up. The scheduler triggers its two behaviours through hooks: a
     * press on the inline card focuses the editor, and the transcript follows
     * the card when it changes height.
     */
    function installComposer(ctx, ui) {
      /** Whether the page shows the hero composer, as of the last reading. */
      let hero = false
      /** Whether the composer restyle applies to the page shown, as of the last reading. */
      let active = false
      /** Whether the studio home layout owns the hero page, as of the last reading. */
      let studioHome = false
      /** The hero page's composer card, or null off the hero page, as of the last pass. */
      let heroCard = null

      /**
       * Read the page's composer state. The host marks the conversation root
       * `data-phase="hero"` exactly when it renders the hero composer (no
       * session yet, or a blank one), so that marker is the whole test; the
       * composer-scope preference then decides whether the restyle covers the
       * page.
       */
      function readState() {
        hero = document.querySelector('[data-phase="hero"]') !== null
        const scope = readPrefs().composerScope
        active = !composerRestyleRetired && (scope === 'all' || (hero ? scope === 'hero' : scope === 'conversation'))
        studioHome = hero && readPrefs().homeLayout === HOME_LAYOUT_STUDIO
      }

      /**
       * Mirror the variant onto every card and its composerStack ancestor, so
       * stack-scoped rules read an attribute instead of re-deriving hero/inline
       * through :has() on every DOM mutation. Write only when the value differs
       * (re-setting the same value still invalidates the element's styles), and
       * once per stack even when several cards share one.
       *
       * The studio home layout draws its composer in the conversation's
       * single-line form, so a studio hero page stamps `inline`, not `hero`.
       */
      function syncVariant(cards) {
        const value = hero && !studioHome ? 'hero' : 'inline'
        const stacks = new Set()
        for (const card of cards) {
          setAttributeIfChanged(card, 'data-composer-variant', value)
          const stack = card.closest(COMPOSER_STACK)
          if (stack !== null) stacks.add(stack)
        }
        for (const stack of stacks) setAttributeIfChanged(stack, 'data-composer-variant', value)
      }

      /**
       * The attachment rails inside a card (ui-attachment): the shell rail and
       * its scrolling inner rail, both `_rail`.
       */
      const ATTACHMENT_RAIL = '[class*="_rail"]'
      /**
       * Anything in a card that means it carries attachments: an image tile
       * (`_imageItem`, `_thumbnail`), or any item, image or file card
       * (FileCard's `_card`) on a rail.
       */
      const ATTACHMENT_PRESENT = `[class*="_imageItem"], [class*="_thumbnail"], ${ATTACHMENT_RAIL} :is([class*="_item"], img, [class*="_card"])`
      /**
       * The attachment tiles the stylesheet reshapes into thumbnails. They are
       * found here once per pass and marked, so the rules read one attribute
       * instead of re-running this list, with its structural :has(img), on
       * every DOM change.
       */
      const ATTACHMENT_TILES = `${ATTACHMENT_RAIL} :is([class*="_imageItem"], [class*="_thumbnail"], [class*="_item"]:has(img), [class*="_card"]:has(img))`
      const ATTACHMENT_TILE_ATTR = 'data-dsh-claude-attachment'

      /** Mark the cards that carry attachments, and the tiles inside them. */
      function syncAttachments(cards) {
        const tiles = new Set()
        for (const card of cards) {
          const carries = active && card.querySelector(ATTACHMENT_PRESENT) !== null
          if (carries) {
            setAttributeIfChanged(card, 'data-has-attachments', 'true')
            for (const tile of card.querySelectorAll(ATTACHMENT_TILES)) tiles.add(tile)
          } else {
            card.removeAttribute('data-has-attachments')
          }
        }
        for (const marked of document.querySelectorAll(`[${ATTACHMENT_TILE_ATTR}]`)) {
          if (!tiles.has(marked)) marked.removeAttribute(ATTACHMENT_TILE_ATTR)
        }
        for (const tile of tiles) tile.toggleAttribute(ATTACHMENT_TILE_ATTR, true)
      }

      const CONTROL_ATTR = 'data-dsh-claude-control'

      /**
       * Mark each host control on the composer with what it is, so the
       * stylesheets key on `data-dsh-claude-control` instead of the host's
       * button text — text that changes with the shell language and with each
       * host release. Read from the host's structure (InputBar):
       *   commands — the tools row's `+`, the one button that opens a listbox;
       *   stop / send — the trailing row's primary buttons, told apart by their
       *     glyph: stop draws a rect, the submit arrow a path (queue and steer
       *     are the same submit button under another label);
       *   access — the button the permission slot renders (host.js).
       */
      function syncControls(cards) {
        for (const card of cards) {
          const commands = card.querySelector('[class*="_tools"] button[aria-haspopup="listbox"]')
          if (commands !== null) setAttributeIfChanged(commands, CONTROL_ATTR, 'commands')
          for (const button of card.querySelectorAll('[class*="_trailing"] button[class*="_primary"]')) {
            setAttributeIfChanged(button, CONTROL_ATTR, button.querySelector('svg rect') !== null ? 'stop' : 'send')
          }
        }
        const access = findAccessTrigger()
        if (access !== null) setAttributeIfChanged(access, CONTROL_ATTR, 'access')
      }

      const DRAFT_EMPTY_ATTR = 'data-dsh-claude-draft-empty'

      /**
       * Mark the cards whose draft is empty. The host's editor shows its
       * placeholder exactly then (DraftEditor's `data-composer-placeholder`),
       * and the send button's ghost and ready looks key on this mark — as a
       * stylesheet test (`card:has(placeholder) button`) it made every DOM
       * change re-match the whole document. The placeholder comes and goes as a
       * DOM change, so the pass that follows it moves the mark in the same frame.
       */
      function syncDraftState(cards) {
        for (const card of cards) card.toggleAttribute(DRAFT_EMPTY_ATTR, findComposerPlaceholder(card) !== null)
      }

      /**
       * The composer's dock line, which the host renders right after the card
       * (a notice line, when there is one, sits before it).
       */
      function composerDock(card) {
        return card.nextElementSibling
      }

      /**
       * The meter the host parks in that dock, or null when it is not there.
       * Its trigger is told apart by its glyph (ui-conversation ContextMeter):
       * the dialog trigger that draws a ring of `<circle>`s; the stats pills
       * draw none.
       */
      function dockedContextMeter(dock) {
        if (dock === null) return null
        for (const trigger of dock.querySelectorAll('button[aria-haspopup="dialog"]')) {
          if (trigger.querySelector(':scope > svg > circle') === null) continue
          let node = trigger
          while (node.parentElement !== null && node.parentElement !== dock) node = node.parentElement
          return node
        }
        return null
      }

      /** The room the meter takes at the toolbar row's right end, as the row carries it. */
      let meterRoom = ''
      /** The meter node the room was measured from, and the reading and scope it had then. */
      let meterNode = null
      let meterReading = ''
      let meterMeasuredActive = false
      let meterWidth = 0

      /**
       * Stamp the context-occupancy meter and keep its room on the toolbar row.
       *
       * The meter stays in the host's dock line, its native React parent: moving
       * it out crashed React's unmount (Node.removeChild). The stylesheet lays
       * the dock over the toolbar row and puts the meter at the row's right end,
       * after the model and effort triggers; the trailing cluster keeps that
       * room free through --dsh-claude-meter-room — the meter's width plus the
       * cluster's own 8px gap.
       *
       * The meter is re-resolved only when the cached node left the tree, and
       * its width is re-read only when its reading moved (the trigger IS the
       * percentage text, whose width follows the text): a pass with an unmoved
       * meter reads no layout, which during streaming would otherwise force one.
       * A reading taken with no box — the composer's seat is display: none while
       * another conversation tab is up — is no reading: it stays unrecorded, the
       * row keeps the room it has, and the next pass measures again.
       *
       * The write is decided against the value the document carries: a variable
       * another generation or feature cleared has to come back, and the
       * declaration is the cheapest thing to ask.
       */
      function stampContextMeter(card) {
        if (meterNode !== null && !meterNode.isConnected) {
          meterNode = null
          meterReading = ''
          meterWidth = 0
        }
        let meter = meterNode
        if (card === undefined) meter = null
        else if (meter === null) meter = dockedContextMeter(composerDock(card))
        let room = ''
        if (meter !== null) {
          meter.toggleAttribute('data-dsh-claude-context-meter', true)
          const reading = meter.textContent || ''
          // Re-measure when the reading moved or the restyle scope flipped:
          // either can change what the room should be.
          if (reading !== meterReading || active !== meterMeasuredActive) {
            const width = active ? meter.offsetWidth : 0
            // A zero width with the restyle on is the composer having no box
            // right now, never a meter that takes no room.
            if (!active || width > 0) {
              meterReading = reading
              meterMeasuredActive = active
              meterWidth = width
            }
          }
          if (active) room = meterWidth > 0 ? `${meterWidth + 8}px` : meterRoom
        }
        meterNode = meter
        const written = document.body.style.getPropertyValue('--dsh-claude-meter-room')
        if (room === written) {
          meterRoom = room
          return
        }
        meterRoom = room
        if (room === '') document.body.style.removeProperty('--dsh-claude-meter-room')
        else document.body.style.setProperty('--dsh-claude-meter-room', room)
      }

      /**
       * The cost line the cost-meter plugin contributes to the dock, next to the
       * host's own (hidden) stats row. It is the only thing down there that can
       * be wider than the card, so it is the line that pans: the stylesheet keeps
       * it on one line with `overflow-x: auto`, this pass says where its scroll
       * sits and what its ends hide, and a drag on it pulls the wanted numbers
       * into view.
       *
       * The line is the plugin's own element (`.cm-root`) and stays where React
       * put it — the skin marks it, never moves it.
       */
      const DOCK_PAN_ATTR = 'data-dsh-claude-dock-pan'
      const DOCK_PAN_DRAG_ATTR = 'data-dsh-claude-dock-dragging'
      /** The line the pan is set up on, and the reading it was last measured at. */
      let panLine = null
      let panText = ''
      /** The line's own tooltip, kept while the skin's (the whole line) is the one written. */
      let panOwnTitle = ''
      /** The live drag on that line — `{id, x, left, moved}` — or null. */
      let panDrag = null

      /** Which end of the line is out of sight, for the faded ends the CSS draws. */
      function dockPanHint(line) {
        const hidden = line.scrollWidth - line.clientWidth
        if (hidden <= 1) return 'none'
        if (line.scrollLeft <= 1) return 'start'
        if (line.scrollLeft >= hidden - 1) return 'end'
        return 'middle'
      }

      /**
       * Mark the line with the end it hides, and with a tooltip that carries the
       * whole line once the line is clipped: the plugin's own tooltip (the
       * per-model split) follows it, and comes back on its own when the line fits
       * again. A tooltip the plugin replaces while the line is clipped is picked
       * up on the next measure, since ours never reads as its own.
       *
       * Only a new line, a moved reading or a resized box reaches this: the
       * scroll width read here forces a layout, and a pass that read it would
       * force one on every DOM change, mid-stream included.
       */
      function measureDockPan() {
        const line = panLine
        if (line === null) return
        const text = (line.textContent || '').trim()
        /* The box reads from its start unless it hides something: a stale
         * scrollLeft — a narrower window, a drag past a line that has since grown,
         * a redrawn reading — would otherwise keep the front of the sentence out of
         * view for good, so it is dropped whenever nothing is hidden or the text
         * itself moved. */
        if (line.scrollLeft !== 0 && ((panText !== '' && text !== panText) || line.scrollWidth <= line.clientWidth + 1)) line.scrollLeft = 0
        const hint = dockPanHint(line)
        if (line.getAttribute(DOCK_PAN_ATTR) !== hint) line.setAttribute(DOCK_PAN_ATTR, hint)
        const own = line.getAttribute('title') || ''
        if (text !== '' && own !== '' && !own.includes(text)) panOwnTitle = own
        const whole = hint === 'none' ? panOwnTitle : panOwnTitle === '' ? text : `${text} — ${panOwnTitle}`
        if (whole === '') {
          if (own !== '') line.removeAttribute('title')
        } else if (own !== whole) line.setAttribute('title', whole)
        panText = text
      }

      /**
       * The line's box moved (the sidebar opened, the window resized) without any
       * DOM change the pass would see, so its own observer measures again.
       */
      const panObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measureDockPan()) : null

      /** Point the pan at `line`, or null: the line left behind loses its marks. */
      function adoptDockPanLine(line) {
        if (line === panLine) return
        if (panLine !== null) {
          panLine.removeAttribute(DOCK_PAN_ATTR)
          panLine.removeAttribute(DOCK_PAN_DRAG_ATTR)
          if (panObserver !== null) panObserver.unobserve(panLine)
        }
        panLine = line
        panText = ''
        panOwnTitle = ''
        panDrag = null
        if (line !== null && panObserver !== null) panObserver.observe(line)
      }

      /**
       * The cost line `target` sits in, when that line is in the composer's own
       * dock. The plugin mounts the line when usage arrives, which is not a pass:
       * a press or a hover reads it here instead of waiting for the next pass.
       */
      function dockPanLineFrom(target) {
        if (!(target instanceof Element)) return null
        const line = target.closest('.cm-root')
        if (line === null) return null
        return line.closest('[data-slot="conversation.composer.dock"]') === null ? null : line
      }

      /** Point the pan at the dock's cost line, as this pass has the dock. */
      function stampDockPan(card) {
        const dock = card === undefined ? null : composerDock(card)
        const slot = dock === null ? null : dock.querySelector('[data-slot="conversation.composer.dock"]')
        const line = slot === null ? null : slot.querySelector('.cm-root')
        adoptDockPanLine(line)
        // A moved reading re-measures; a moved box is the observer's business, so
        // nothing here reads the line's layout unless its text changed.
        if (line !== null && (line.textContent || '').trim() !== panText) measureDockPan()
      }

      /** Mark the pan on a line the pass has not adopted, measuring it once. */
      function adoptReachedDockPanLine(line) {
        if (line === null || line === panLine) return line
        adoptDockPanLine(line)
        measureDockPan()
        return line
      }

      /**
       * The stretch of the toolbar's own line the extension content shares, and
       * the room below which it takes its own row again.
       */
      const DOCK_BAND_ATTR = 'data-dsh-claude-dock-band'
      const DOCK_BAND_MIN = 220
      let bandNode = null
      let bandCard = null
      let bandBox = ''

      /** The dock's box can move with no DOM change: its own observer stamps again. */
      const bandObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (bandCard !== null) stampDockBand(bandCard) }) : null

      /**
       * Put the dock's extension content on the toolbar's own line while the row
       * leaves it a gap, and on its own row when the row is too narrow for one.
       *
       * The gap is measured from the row's own clusters — the leading controls
       * and the trailing cluster that already keeps the meter's room — so the
       * content sits between them by construction: it can neither cover them nor
       * be covered, and the line inside it pans instead of pushing anything. The
       * row's line gives the dock its height and its bottom, so a stack that
       * places its dock elsewhere still lands on its controls' line.
       */
      function stampDockBand(card) {
        const dock = card === undefined ? null : composerDock(card)
        if (dock !== bandNode) {
          if (bandNode !== null) bandNode.removeAttribute(DOCK_BAND_ATTR)
          bandNode = dock
          bandBox = ''
          if (bandObserver !== null) {
            bandObserver.disconnect()
            if (dock !== null) bandObserver.observe(dock)
          }
        }
        bandCard = card === undefined ? null : card
        if (dock === null || !active) return
        const row = card.querySelector('[class*="_row"]')
        const tools = row === null ? null : row.querySelector('[class*="_tools"]')
        const trailing = row === null ? null : row.querySelector('[class*="_trailing"]')
        const box = dock.getBoundingClientRect()
        const line = trailing === null ? null : trailing.getBoundingClientRect()
        const stack = dock.parentElement
        if (line === null || box.width === 0 || stack === null) {
          bandBox = 'off'
          dock.removeAttribute(DOCK_BAND_ATTR)
          return
        }
        const lead = tools === null ? box.left : tools.getBoundingClientRect().right
        const left = Math.round(lead - box.left) + 12
        const right = Math.round(box.right - line.left) + 12
        const room = Math.round(box.width) - left - right
        const height = Math.round(line.height)
        const bottom = Math.round(stack.getBoundingClientRect().bottom - line.bottom)
        const on = room >= DOCK_BAND_MIN && height >= 24
        const next = on ? `${left}:${right}:${bottom}:${height}` : 'off'
        if (next === bandBox) return
        bandBox = next
        if (!on) {
          dock.removeAttribute(DOCK_BAND_ATTR)
          return
        }
        dock.style.setProperty('--dsh-claude-band-left', `${left}px`)
        dock.style.setProperty('--dsh-claude-band-right', `${right}px`)
        dock.style.setProperty('--dsh-claude-band-bottom', `${bottom}px`)
        dock.style.setProperty('--dsh-claude-band-height', `${height}px`)
        dock.setAttribute(DOCK_BAND_ATTR, 'on')
      }

      /**
       * A scroll of the line — the drag, a trackpad sweep — moves which end is
       * hidden. Scroll events do not bubble, so this is heard on the document in
       * the capture phase; the tooltip is not rewritten here (it does not change
       * with the scroll) so a scroll reads no more layout than it must.
       */
      function onDockPanScroll(event) {
        const line = adoptReachedDockPanLine(dockPanLineFrom(event.target))
        if (line === null) return
        const hint = dockPanHint(line)
        if (line.getAttribute(DOCK_PAN_ATTR) !== hint) line.setAttribute(DOCK_PAN_ATTR, hint)
      }

      /**
       * The reader's pointer arrives at the line: what the pass would have marked,
       * marked now, so the faded end and the whole-line tooltip are right at the
       * moment they are read. Only a line the pan is not on reaches a measurement.
       */
      function onDockPanOver(event) {
        adoptReachedDockPanLine(dockPanLineFrom(event.target))
      }

      /**
       * A press on the clipped cost line pans it by the drag's travel. The press
       * is only claimed while the line hides something: otherwise the very same
       * press selects the numbers, as it would anywhere else.
       */
      function onDockPanDown(event) {
        if (event.button !== 0 || panDrag !== null) return
        const line = adoptReachedDockPanLine(dockPanLineFrom(event.target))
        if (line === null) return
        if (line.scrollWidth - line.clientWidth <= 1) return
        event.preventDefault()
        line.toggleAttribute(DOCK_PAN_DRAG_ATTR, true)
        line.setPointerCapture(event.pointerId)
        panDrag = {id: event.pointerId, x: event.clientX, left: line.scrollLeft, moved: false}
        document.addEventListener('pointermove', onDockPanMove, true)
        document.addEventListener('pointerup', onDockPanUp, true)
        document.addEventListener('pointercancel', onDockPanUp, true)
      }

      function onDockPanMove(event) {
        const drag = panDrag
        if (drag === null || event.pointerId !== drag.id || panLine === null) return
        const travel = event.clientX - drag.x
        // A press that never travels stays a press: panning from the first pixel
        // would make a plain click jump the line.
        if (!drag.moved && Math.abs(travel) < 4) return
        drag.moved = true
        panLine.scrollLeft = drag.left - travel
      }

      function onDockPanUp(event) {
        const drag = panDrag
        if (drag === null || event.pointerId !== drag.id) return
        endDockPan()
      }

      function endDockPan() {
        const drag = panDrag
        if (drag === null) return
        panDrag = null
        document.removeEventListener('pointermove', onDockPanMove, true)
        document.removeEventListener('pointerup', onDockPanUp, true)
        document.removeEventListener('pointercancel', onDockPanUp, true)
        if (panLine === null) return
        panLine.removeAttribute(DOCK_PAN_DRAG_ATTR)
        if (panLine.hasPointerCapture(drag.id)) panLine.releasePointerCapture(drag.id)
      }

      /**
       * The composer is chat-view-only. The host mounts the seat inside the
       * conversation root on every tab (轨迹 / 上下文 even reserve room for
       * it), so the skin reflects the active view on <body> and CSS drops the
       * whole bottom area unless the chat tab is selected.
       *
       * Scope: the conversation tablist lives in the panel header, which is
       * the root's first child — any other tablist (the trajectory detail
       * panel, say) renders later inside the ledger. The chat view registers
       * at order 0, so it is always the tablist's FIRST tab; reading that
       * tab's aria-selected is locale-independent. No tab bar at all (hero /
       * single view) means the chat surface is all there is.
       */
      function syncChatTabComposer() {
        const root = closestFrom(document.querySelector('[data-composer-seat]'), '[data-phase]')
        const list = root === null ? null : root.querySelector('[role="tablist"]')
        const first = list === null ? null : list.querySelector('[role="tab"]')
        const chatActive = first === null || first.getAttribute('aria-selected') === 'true'
        document.body.toggleAttribute(COMPOSER_HIDDEN_ATTR, active && !chatActive)
      }

      function syncComposer() {
        readState()
        const cards = findComposerCards()
        heroCard = hero && cards.length > 0 ? cards[0] : null
        syncVariant(cards)
        document.body.toggleAttribute(COMPOSER_ATTR, active)
        syncAttachments(cards)
        syncDraftState(cards)
        syncControls(cards)
        stampContextMeter(cards[0])
        stampDockPan(cards[0])
        stampDockBand(cards[0])
        syncChatTabComposer()
      }

      /**
       * A press on the inline card lands in its editor: the card's padding and
       * toolbar row surround a one-line field, and a press on the card that is
       * not one of its controls means the field.
       */
      function focusEditorOnPress(target) {
        if (!active || !(target instanceof Element)) return
        const card = target.closest('[data-composer-card]')
        if (!card) return
        if (target.closest('button, a, [role="button"], [role="menu"], [role="radiogroup"], input, select, textarea')) return
        const input = card.querySelector('[data-composer-input][contenteditable="true"]')
        if (input && document.activeElement !== input) {
          input.focus({ preventScroll: true })
        }
      }

      function focusEditorOnHover(event) {
        if (event.pointerType !== 'mouse' || event.buttons !== 0 || !document.hasFocus()) return
        const target = event.target
        if (!(target instanceof Element) || getComputedStyle(target).cursor !== 'text') return
        const selection = window.getSelection()
        if (selection && !selection.isCollapsed) return
        const focused = document.activeElement
        if (focused instanceof Element && focused.matches('input, textarea, [contenteditable="true"]') && !focused.hasAttribute('data-composer-input')) return
        focusEditorOnPress(target)
      }

      /**
       * Keep a reader who was at the transcript's end there while the card
       * changes height: the card growing with a multi-line draft (or shrinking
       * back) moves the transcript's bottom edge without any scroll. Within
       * 150px of the end counts as at the end.
       */
      function followTranscript() {
        // ui-conversation marks its transcript scroller with this attribute.
        const scroller = document.querySelector('[data-conversation-scroll]')
        if (scroller === null) return
        const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
        if (distance < 150) scroller.scrollTop = scroller.scrollHeight
      }

      ui.composer = {
        sync: syncComposer,
        /** Whether the page shows the hero composer, as of this pass. */
        isHero() { return hero },
        /** The hero page's composer card as of this pass, or null off the hero page. */
        heroCard() { return heroCard },
        /** Whether the composer restyle applies to the page shown, as of this pass. */
        isActive() { return active },
        /** A copy source changed, the composer-scope preference among them: read again now. */
        onCopyChange: readState,
        onPointerDown: focusEditorOnPress,
        /** The composer card changed size: the transcript follows it. */
        reposition(reason) {
          if (reason === 'composer') followTranscript()
        }
      }
      readState()
      document.addEventListener('pointerdown', onDockPanDown, true)
      document.addEventListener('pointerover', onDockPanOver, true)
      document.addEventListener('pointerover', focusEditorOnHover, true)
      document.addEventListener('scroll', onDockPanScroll, true)

      return () => {
        active = false
        heroCard = null
        document.body.removeAttribute(COMPOSER_ATTR)
        document.body.removeAttribute(COMPOSER_HIDDEN_ATTR)
        const marks = ['data-composer-variant', 'data-has-attachments', ATTACHMENT_TILE_ATTR, DRAFT_EMPTY_ATTR, CONTROL_ATTR, 'data-dsh-claude-context-meter', DOCK_PAN_ATTR, DOCK_PAN_DRAG_ATTR, DOCK_BAND_ATTR]
        for (const mark of marks) {
          for (const marked of document.querySelectorAll(`[${mark}]`)) marked.removeAttribute(mark)
        }
        if (meterRoom !== '') {
          meterRoom = ''
          document.body.style.removeProperty('--dsh-claude-meter-room')
        }
        meterNode = null
        meterReading = ''
        meterMeasuredActive = false
        meterWidth = 0
        document.removeEventListener('pointerdown', onDockPanDown, true)
        document.removeEventListener('pointerover', onDockPanOver, true)
        document.removeEventListener('pointerover', focusEditorOnHover, true)
        document.removeEventListener('scroll', onDockPanScroll, true)
        endDockPan()
        if (panObserver !== null) panObserver.disconnect()
        panLine = null
        panText = ''
        panOwnTitle = ''
        if (bandNode !== null) {
          for (const name of ['--dsh-claude-band-left', '--dsh-claude-band-right', '--dsh-claude-band-bottom', '--dsh-claude-band-height']) {
            bandNode.style.removeProperty(name)
          }
        }
        if (bandObserver !== null) bandObserver.disconnect()
        bandNode = null
        bandCard = null
        bandBox = ''
      }
    }
