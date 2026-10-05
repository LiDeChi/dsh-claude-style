    /**
     * A feature's handle on the shared `ui` registry. The scheduler calls the
     * hooks; every hook is optional, and a feature that does not implement one
     * is simply skipped for that trigger.
     *
     * @typedef {Object} FeatureHandle
     * @property {Function} [sync] Every scheduler pass, in FEATURES order.
     * @property {Function} [owns] `owns(target) → boolean`: whether the press
     *     landed inside the feature's own DOM. A press the feature does not own
     *     closes it through `close('outside')`.
     * @property {Function} [onPointerDown] `onPointerDown(target)`: every
     *     pointer press, owned or not. The composer focuses its editor from
     *     here; settingsNav uses it because its class changes are outside the
     *     observer's attributeFilter, so no pass fires.
     * @property {Function} [close] `close(reason)`: `'outside'` (press
     *     outside), `'escape'` (Esc), or `'composer'` (focus moved into the
     *     composer). Features ignore the reasons they do not act on, so each
     *     keeps its own dismiss routes.
     * @property {Function} [onInput] `onInput(target)`: an input or
     *     compositionend event whose target is inside the composer input.
     * @property {Function} [onFocusIn] `onFocusIn(target)`: every focusin,
     *     after the composer route. The search palette takes over when the
     *     host's own sidebar search input receives focus (its Ctrl+K).
     * @property {Function} [reposition] `reposition(reason)`: `'viewport'` (a
     *     viewport scroll or resize) or `'composer'` (the composer card changed
     *     size). A popover checks whether it is open; the composer keeps the
     *     transcript at its end on a card change.
     * @property {Function} [onCopyChange] `onCopyChange()`: the locale, the
     *     preferences or the model copy changed.
     * @property {Function} [onKey] `onKey(event)`: every keydown the reader
     *     makes, after the Esc route. A feature that takes the key calls
     *     `event.preventDefault()` itself.
     * @property {Function} [onActivity] `onActivity()`: the reader moved the
     *     pointer, pressed it or pressed a key (the skin's own synthetic Esc
     *     aside). Deepy falls asleep after a quiet minute and wakes on the next
     *     one; the hook only records the moment, so a pointer sweep costs no
     *     pass.
     *
     * Cross-feature reads outside the scheduler stay direct handle reads:
     *   copy, permissions → composer.{isHero, isActive}
     *   heroMenu → composer.isActive
     *   mascot → composer.heroCard
     *   effort → model.{seat, trigger, effort, named, settled, pickEffort, close}
     *   model → effort.close, composer.isActive
     *   quickProviders → model.{providers, onProviders}
     *   footer → ban.open
     */
    /**
     * Say once, loudly, that a feature was switched off. The skin keeps running
     * without it, so the console line is the only trace — it names the feature.
     */
    function reportFeatureFailure(name, error) {
      console.error(`[dsh-claude-style] "${name}" failed and was switched off:`, error)
    }

    /**
     * @param ctx - client context.
     * @param ui - the shared handle table.
     * @param features - every feature's `ui` handle name, in FEATURES order: a
     *     switched feature comes and goes during the generation, so each use
     *     checks whether the handle exists.
     */
    function installScheduler(ctx, ui, features) {
      // The pass state comes first: subscribing to the preferences below can
      // call schedule() before this function returns (a settings form that is
      // already served answers synchronously — a hot reload does exactly that).
      // Chat streaming mutates the tree constantly; coalesce to one pass a frame.
      let scheduled = false
      /** The frame the pending pass waits on, so the teardown can cancel it. */
      let pendingFrame = 0
      /** Set by the teardown: no pass may be scheduled, or run, after it. */
      let stopped = false

      /** Call one hook on every feature that implements it, in FEATURES order. */
      function dispatch(hook, ...args) {
        for (const name of features) {
          const handle = ui[name]
          if (handle && typeof handle[hook] === 'function') handle[hook](...args)
        }
      }

      /** The reader is at the page: every feature with an `onActivity` hears it. */
      function onGlobalActivity() {
        dispatch('onActivity')
      }

      function onGlobalPointerDown(e) {
        onGlobalActivity()
        const target = e.target
        // A press a feature does not own closes it: the model picker and the
        // effort card are hover-driven popovers, the account drawer a click one.
        // Features without an `owns` keep their own dismiss route — permissions
        // runs its own outside-press listener, and quickProviders closes only on
        // composer focus.
        for (const name of features) {
          const handle = ui[name]
          if (!handle || typeof handle.owns !== 'function' || typeof handle.close !== 'function') continue
          if (target && !handle.owns(target)) handle.close('outside')
        }
        // A press also drives hooks that are not about closing: settingsNav's
        // class changes are outside the observer's attributeFilter, so its sync
        // runs on the press itself.
        dispatch('onPointerDown', target)
      }

      function onGlobalKeyDown(e) {
        // The account footer dismisses the host's account menu with a synthetic
        // Escape it dispatches itself (account-footer.js), addressed to the
        // host's Menu alone. Taking it for a user's Esc here would run every
        // feature's Esc route — and close the account-hold page the reader had
        // just entered, because the footer's hover close fires behind that
        // overlay the moment it covers the pointer.
        if (e.__dshHostMenuEscape === true) return
        onGlobalActivity()
        // Every feature's own Esc route, in feature order. The account-hold
        // overlay is the one layer that does NOT close on a window blur (it is
        // meant to be read, and reading it may mean switching windows), so Esc
        // is its keyboard way out.
        if (e.key === 'Escape') dispatch('close', 'escape')
        dispatch('onKey', e)
        // Enter is deliberately NOT handled here. The host's composer keymap
        // already sends on Enter, and first picks the highlighted item of an
        // open `/` or `@` menu, holds back for IME (including Safari's late
        // keydown) and ignores key repeat; this listener runs in the capture
        // phase, before the editor, so taking Enter here would skip all of that.
      }

      // Focus moving into the composer means the user is about to type: every
      // popover the skin keeps open around the card is in the way there, so each
      // feature's composer route runs, in feature order. `focusin` bubbles
      // (unlike focus), so one listener covers the card and everything inside
      // it; the observer's attributeFilter does not watch focus events, so this
      // cannot feed itself another pass. The hero menu has no close of its own —
      // it lives and dies with the host's hover state, and syncHeroMenu notices
      // when it is gone — so it has no hook and is simply skipped.
      // Every focus move is then offered to the features that take one (the
      // search palette answers the host's own sidebar search taking focus).
      function onGlobalFocusIn(e) {
        // Every handler below reads `tagName` and `closest` off the target, so
        // a non-element focus target (a text node) is turned away here.
        const target = closestFrom(e.target, '*')
        if (target === null) return
        if (closestComposerCard(target) !== null) dispatch('close', 'composer')
        dispatch('onFocusIn', target)
      }

      function onComposerInput(e) {
        // The [data-composer-input] filter stays in this event pipe; a feature
        // is only told that a composer-input event happened.
        const input = closestFrom(e.target, '[data-composer-input]')
        if (input !== null) dispatch('onInput', e.target)
      }

      document.addEventListener('pointerdown', onGlobalPointerDown)
      document.addEventListener('pointermove', onGlobalActivity, { passive: true })
      document.addEventListener('keydown', onGlobalKeyDown, true)
      document.addEventListener('input', onComposerInput, true)
      document.addEventListener('compositionend', onComposerInput, true)
      document.addEventListener('focusin', onGlobalFocusIn, true)

      // Fixed popovers are anchored to their trigger; scroll of the page (not
      // the conversation's own auto-stick) and resizes move the anchor, so
      // whichever is open must re-resolve it in the same frame as the reflow.
      function onFixedPopoverViewportChange() {
        dispatch('reposition', 'viewport')
      }
      window.addEventListener('resize', onFixedPopoverViewportChange)
      window.addEventListener('scroll', onFixedPopoverViewportChange, true)

      // A copy source changed — the locale, the preferences or the model copy
      // document. Each feature that paints copy rebuilds its render signatures
      // through onCopyChange, then one pass repaints. The picker's copy follows
      // the shell language, so a locale switch has to rebuild the rows it already
      // painted; subscribing here (rather than reading the locale at render time
      // only) is what makes the change land while a popover is open.
      function onCopyChange() {
        dispatch('onCopyChange')
        schedule()
      }
      // Without a locale service the picker keeps the fallback language.
      const localeService = ctx.get('locale')
      const localeUnsubscribe = typeof localeService?.subscribe === 'function' ? localeService.subscribe(onCopyChange) : null

      // Preferences gate the stylesheet and this scheduler both — the footer
      // takeover adds or removes the account row, and the composer scope flips
      // an attribute the stylesheet reads — so a change re-runs the pass. The
      // first read also arrives through here, which is what replaces the
      // defaults with the stored values.
      const prefsUnsubscribe = subscribePrefs(onCopyChange)
      loadPrefs()

      // The system's own reduced-motion setting can flip while the page runs.
      // Under "follow the system" that is a preference change like any other: it
      // is re-resolved onto <body> here and one pass repaints what reads it.
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      function onSystemMotionChange() {
        refreshMotionAttribute()
        schedule()
      }
      motionQuery.addEventListener('change', onSystemMotionChange)

      const modelCopyUnsubscribe = onModelCopyLoaded(onCopyChange)

      const usernameUnsubscribe = onUsernameLoaded(() => {
        schedule()
      })

      // The HDSL contract lands after the first pass too, and it can carry both
      // the nickname and the picture, so its arrival repaints the same way.
      const hdslUnsubscribe = onHdslLoaded(() => {
        schedule()
      })

      let observedCard = null
      const composerCardObserver = new ResizeObserver(() => {
        // The card resizing moves the anchors pinned to it (the rail toggle,
        // a container width change) with no window resize: re-pin in the same
        // frame, or a JS-pinned control trails the ones CSS just reflowed.
        dispatch('reposition', 'composer')
      })

      /** Failed passes in a row after which a feature's sync is switched off. */
      const SYNC_FAILURE_LIMIT = 3
      const syncFailures = {}

      /**
       * Run one feature's sync in isolation. A sync that throws is retried on the
       * next pass; after SYNC_FAILURE_LIMIT failures in a row the feature is
       * reported once and retired (src/entry.js: its teardown runs and the host
       * gets back what it had taken over), and the rest of the pass carries on
       * without it.
       */
      function runSync(name) {
        const feature = ui[name]
        if (!feature || typeof feature.sync !== 'function') return
        const failures = syncFailures[name] || 0
        if (failures >= SYNC_FAILURE_LIMIT) return
        try {
          feature.sync()
          syncFailures[name] = 0
        } catch (error) {
          syncFailures[name] = failures + 1
          if (failures + 1 < SYNC_FAILURE_LIMIT) return
          reportFeatureFailure(name, error)
          ui.retire(name)
        }
      }

      function schedule() {
        if (scheduled || stopped) return
        scheduled = true
        pendingFrame = requestAnimationFrame(() => {
          scheduled = false
          if (stopped) return
          for (const name of features) runSync(name)
          const currentCard = findComposerCard()
          if (currentCard !== observedCard) {
            if (observedCard) composerCardObserver.unobserve(observedCard)
            observedCard = currentCard
            if (observedCard) composerCardObserver.observe(observedCard)
          }
        })
      }
      ui.schedule = schedule

      const observer = new MutationObserver(schedule)
      observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        // The shipped trigger carries the current preset in its aria-label;
        // the conversation tabs carry the active view in aria-selected.
        attributeFilter: ['aria-label', 'aria-selected'],
      })
      schedule()

      // Copy that follows the clock (the hero greeting rolls over on the hour)
      // has no DOM change to wake a pass, so the clock runs one every minute
      // while the app stays open. The syncs skip identical writes, so this
      // cannot feed the observer.
      let clockTimer = setInterval(schedule, 60000)

      return () => {
        // A pass already requested would run against torn-down features and
        // build their DOM again after the teardown. Cancel it, and refuse every
        // later schedule() — a feature's pending promise (the account profile,
        // a preset switch) may still call it.
        stopped = true
        if (scheduled) cancelAnimationFrame(pendingFrame)
        scheduled = false
        clearInterval(clockTimer)
        clockTimer = null
        window.removeEventListener('resize', onFixedPopoverViewportChange)
        window.removeEventListener('scroll', onFixedPopoverViewportChange, true)
        if (localeUnsubscribe !== null) localeUnsubscribe()
        prefsUnsubscribe()
        motionQuery.removeEventListener('change', onSystemMotionChange)
        modelCopyUnsubscribe()
        usernameUnsubscribe()
        hdslUnsubscribe()
        observer.disconnect()
        composerCardObserver.disconnect()
        observedCard = null
        document.removeEventListener('pointerdown', onGlobalPointerDown)
        document.removeEventListener('pointermove', onGlobalActivity, { passive: true })
        document.removeEventListener('keydown', onGlobalKeyDown, true)
        document.removeEventListener('input', onComposerInput, true)
        document.removeEventListener('compositionend', onComposerInput, true)
        document.removeEventListener('focusin', onGlobalFocusIn, true)
      }
    }
