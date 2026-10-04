    const POPOVER_MARGIN = 8

    /**
     * The viewport coordinates of a popover anchored to a trigger's box.
     *
     * `side: 'right'` opens to the trigger's right and bottom-aligns it (the
     * account popover in the rail). The default `side: 'above'` right-aligns
     * the popover with the trigger and opens above it with `gap` spacing (the
     * model picker); `side: 'above-left'` opens above with the left edges
     * aligned (the permission menu). The hero menu resolves through this too, but writes the
     * answer into custom properties — the host re-places that card from its own
     * geometry every frame, and an inline left/top would live only until the
     * host's next frame.
     *
     * @param rect - the trigger's bounding box.
     * @param width - the popover's laid-out width.
     * @param height - the popover's laid-out height.
     * @param opts - `{ side, gap, margin }`.
     * @returns the chosen `{ x, y }` in viewport coordinates.
     */
    function resolveAnchoredPosition(rect, width, height, opts) {
      opts = opts || {}
      const margin = opts.margin || POPOVER_MARGIN
      if (opts.side === 'right') {
        let x = rect.right + margin
        if (x + width > window.innerWidth - margin) {
          x = Math.max(margin, rect.left - margin - width)
        }
        const y = Math.min(Math.max(margin, rect.bottom - height), Math.max(margin, window.innerHeight - height - margin))
        return { x, y }
      }
      if (opts.side === 'above-left') {
        const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
        let top = rect.top - (opts.gap || 0) - height
        if (top < margin) top = Math.min(rect.bottom + (opts.gap || 0), Math.max(margin, window.innerHeight - height - margin))
        return { x: left, y: top }
      }
      const x = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin))
      let y = rect.top - (opts.gap || 0) - height
      if (y < margin) y = Math.min(rect.bottom + (opts.gap || 0), Math.max(margin, window.innerHeight - height - margin))
      return { x, y }
    }

    /**
     * Position a fixed-position popover relative to its trigger. `important`
     * switches to `style.setProperty(..., 'important')`, as the account
     * popover requires.
     *
     * @param trigger - element the popover is anchored to.
     * @param pop - the fixed-position popover element.
     * @param opts - `{ side, gap, important }`.
     * @returns the chosen `{ x, y }` in viewport coordinates.
     */
    function positionAnchoredPopover(trigger, pop, opts) {
      opts = opts || {}
      const rect = trigger.getBoundingClientRect()
      const { x, y } = resolveAnchoredPosition(rect, pop.offsetWidth, pop.offsetHeight, opts)
      // Same-value guard: this runs on every scheduler pass while a popover is
      // open, and an identical write still dirties layout — the next geometry
      // read (the drag paths read rect/offset every frame) would then force a
      // synchronous recalc. Skip the write when the anchor did not move.
      const leftValue = `${Math.round(x)}px`
      const topValue = `${Math.round(y)}px`
      if (opts.important) {
        if (pop.style.left !== leftValue) pop.style.setProperty('left', leftValue, 'important')
        if (pop.style.top !== topValue) pop.style.setProperty('top', topValue, 'important')
      } else {
        if (pop.style.left !== leftValue) pop.style.left = leftValue
        if (pop.style.top !== topValue) pop.style.top = topValue
      }
      return { x, y }
    }

    /**
     * The check mark a chosen row draws. Every picker's choice row carries the
     * same shared slot (`dsh-claude-popover-check`), so its mark is shared
     * markup: a tick drawn from one string, not one copy per picker.
     */
    const POPOVER_CHECK_SVG = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 5"/></svg>'

    /**
     * Hover dwell before a popover unfolds, and grace before it closes.
     *
     * The dwell exists to swallow a pointer that merely CROSSES a trigger on its
     * way somewhere else, not to make the user wait for the card: 100ms is what a
     * pointer travelling at an ordinary pace needs to clear a 28px trigger, so a
     * pass-through no longer unfolds anything while a pointer the user parked
     * there still opens at once. The grace is what lets the pointer travel the
     * gap between a trigger and its card without the card vanishing underneath
     * it.
     */
    const POPOVER_OPEN_DELAY = 100
    const POPOVER_CLOSE_DELAY = 100

    /**
     * Hover-intent helper shared by the model picker, the effort and
     * permission popovers, the account popover and the hero row's host menus.
     *
     * BOTH sides are scheduled: `scheduleOpen` waits out the dwell (so a pointer
     * crossing the trigger never unfolds anything) and `scheduleClose` waits out
     * the grace. `cancel` clears whichever side is pending — entering the card
     * cancels a close, and leaving the trigger before the dwell cancels the open
     * (`scheduleClose` drops a pending open as well, so a leave needs only the
     * one call).
     */
    function createHoverIntent(open, close, openDelay, closeDelay) {
      let openTimer = null
      let closeTimer = null
      return {
        cancel() {
          if (openTimer) {
            clearTimeout(openTimer)
            openTimer = null
          }
          if (closeTimer) {
            clearTimeout(closeTimer)
            closeTimer = null
          }
        },
        scheduleOpen() {
          if (openTimer) clearTimeout(openTimer)
          openTimer = setTimeout(() => {
            openTimer = null
            open()
          }, openDelay)
        },
        scheduleClose() {
          if (openTimer) {
            clearTimeout(openTimer)
            openTimer = null
          }
          if (closeTimer) clearTimeout(closeTimer)
          closeTimer = setTimeout(() => {
            closeTimer = null
            close()
          }, closeDelay)
        },
      }
    }

    /**
     * The skin's popovers, one entry per popover.
     *
     * A picker whose second level is a card of its own registers ONCE: opening
     * that second level must not fold the first, and both levels answer the same
     * choice. A host menu is registered by the feature that drives its trigger,
     * so it takes part on the same terms as the skin's own cards.
     *
     * An entry carries the feature's close path and nothing else. Every closer is
     * a no-op while its popover is down, so the registry never holds "who is
     * open": a card the user dismissed with Escape or an outside press leaves no
     * stale entry behind.
     */
    const popoverRegistry = []

    /**
     * Register (or replace) one popover's closer. Replacing by name is what makes
     * a client reload safe: the previous generation's disposals never ran, so its
     * closer is still registered and points at a scope that is gone.
     */
    function registerPopover(name, close) {
      for (let i = 0; i < popoverRegistry.length; i++) {
        if (popoverRegistry[i].name === name) {
          popoverRegistry[i].close = close
          return
        }
      }
      popoverRegistry.push({ name, close })
    }

    /** Drop one popover's entry when its feature is torn down. */
    function unregisterPopover(name) {
      for (let i = 0; i < popoverRegistry.length; i++) {
        if (popoverRegistry[i].name === name) {
          popoverRegistry.splice(i, 1)
          return
        }
      }
    }

    /**
     * Close every registered popover except the one named. Called on the way
     * open, so two cards never share the screen.
     */
    function closeOtherPopovers(name) {
      for (let i = 0; i < popoverRegistry.length; i++) {
        if (popoverRegistry[i].name === name) continue
        popoverRegistry[i].close()
      }
    }

    /**
     * Write one menu popover card's open state, together with the role that
     * says the same thing to the host: the host's keyboard arbitration reads
     * every `[role="menu"]` in the document as a menu that owns the foreground
     * (ui-primitives' modalSelector, which the shortcut dispatchers and
     * closeTopModal query; ui-dockkit's tab menu and the fixed Esc-Esc stop
     * read it the same way). A card this skin keeps mounted for measurement is
     * only hidden while closed, and a hidden card answers those document
     * queries exactly like an open one — so the role rides the open state:
     * present while the card is up, gone the moment it folds. Only a card that
     * IS a menu goes through here; the account drawer and the stats card keep
     * writing `data-open` by hand.
     */
    function setMenuPopoverOpen(card, open) {
      if (open) {
        card.setAttribute('data-open', 'true')
        card.setAttribute('role', 'menu')
      } else {
        card.setAttribute('data-open', 'false')
        card.removeAttribute('role')
      }
    }

    /**
     * One row of a popover card: the shared skeleton every picker's rows draw —
     * an optional icon, the text block that takes the slack, an optional badge
     * and an optional trailing mark. The look belongs to shared/popover.css, so
     * a feature adds only its own classes and content.
     *
     * @param opts - `{ className, role, textClass, icon, badge, check, lines }`.
     *   `lines: 2` splits the text block into a title and a quieter second
     *   line; `textClass` replaces the shared text class for a feature whose
     *   text block carries its own markup (the model rows' brand lockup).
     * @returns `{ row, icon, text, desc, badge, check }`; a slot the options
     *   did not ask for is null.
     */
    function buildPopoverItem(opts) {
      opts = opts || {}
      const row = buildElement('button', opts.className ? `dsh-claude-popover-item ${opts.className}` : 'dsh-claude-popover-item')
      row.type = 'button'
      if (opts.role) row.setAttribute('role', opts.role)
      const icon = opts.icon ? buildElement('span', 'dsh-claude-popover-item-icon') : null
      if (icon !== null) row.appendChild(icon)
      let text = null
      let desc = null
      if (opts.lines === 2) {
        const col = buildElement('div', 'dsh-claude-popover-item-col')
        text = buildElement('span', 'dsh-claude-popover-item-text')
        desc = buildElement('span', 'dsh-claude-popover-item-desc')
        col.appendChild(text)
        col.appendChild(desc)
        row.appendChild(col)
      } else {
        text = buildElement('span', opts.textClass || 'dsh-claude-popover-item-text')
        row.appendChild(text)
      }
      const badge = opts.badge ? buildElement('span', 'dsh-claude-popover-item-badge') : null
      if (badge !== null) row.appendChild(badge)
      const check = opts.check ? buildElement('span', 'dsh-claude-popover-check') : null
      if (check !== null) row.appendChild(check)
      return { row, icon, text, desc, badge, check }
    }

    /**
     * Remove the skin's own nodes that no live reference holds.
     *
     * Client HMR drops the previous generation's disposals instead of running
     * them, so its triggers, cards and lists are still in the document while a
     * fresh scope starts from null; a host re-render can also strand a copy in
     * a container React replaced. Every node matching `selector` under `scope`
     * goes, except the ones in `keep` — an empty `keep` removes them all.
     *
     * @param scope - the element or document to search.
     * @param selector - the nodes to sweep.
     * @param keep - the live nodes this generation holds (null entries match nothing).
     */
    function removeStrayNodes(scope, selector, keep) {
      const nodes = scope.querySelectorAll(selector)
      for (let i = 0; i < nodes.length; i++) {
        if (keep.includes(nodes[i])) continue
        if (nodes[i].parentElement !== null) nodes[i].parentElement.removeChild(nodes[i])
      }
    }
