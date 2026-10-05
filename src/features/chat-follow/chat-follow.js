    /**
     * Enhanced follow and the capped process group's follow, ported from
     * dsh-chat-ux. Both ride one preference, as they do upstream: they are the
     * two halves of the same hand-back.
     *
     * The moments that lose the host's follow, the guard that watches for them,
     * and the hand-back itself are in follow-guard.js and chat-tail.js; the
     * catch-up inside a capped body is in process-follow.js.
     *
     * @param ctx - client context.
     * @param ui - shared handle table; a fold glide running elsewhere
     *     (src/features/chat-fold/) owns the position until it lands, so the
     *     hand-back waits it out when that feature is installed.
     * @returns teardown.
     */
    /** One tool call's row, and one flow block, in one selector: a new node either way. */
    const FOLLOW_STRUCTURE_SELECTOR = FLOW_BLOCK_SELECTOR + ', ' + CHAT_CALL_SELECTOR
    /** Content is streaming: the host writes both marks, and only then is there a follow to lose. */
    const FOLLOW_RUNNING_SELECTOR = STREAMING_SELECTOR + ', ' + SHIMMER_SELECTOR
    /** The intent events the guard reads; the same family as the host's own reading intents. */
    const FOLLOW_INTENT_TYPES = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'beforematch']
    /** Two hand-backs never land closer than this, so a run of tool calls cannot pin the position. */
    const FOLLOW_MIN_INTERVAL_MS = 200
    /**
     * A structural change this recent still counts as work in progress. The
     * guard watches data-chat-following-tail going away, and it also goes away
     * on a session switch or a restored reading position — moments with no
     * streaming content and no fresh structure. The grace lets a freshly
     * inserted tool row count as work in progress too.
     */
    const FOLLOW_ACTIVITY_GRACE_MS = 2000
    /** A fold glide in flight is waited out; after this many waits the round is dropped. */
    const FOLLOW_FOLD_WAIT_MS = 150
    const FOLLOW_FOLD_WAIT_ATTEMPTS = 4

    /**
     * Watch the whole page for the moments that lose the host's follow, and hand
     * the position back at each of them.
     *
     * @param readEnabled - reads the preference in force now; while it is off
     *     nothing here acts at all.
     * @param foldBusy - whether a fold glide is animating a height right now.
     * @returns teardown: the observer and the intent listeners go away.
     */
    function createChatFollowGuard(readEnabled, foldBusy) {
      /** Whether the reader has taken the scroll over and not come back to the end. */
      let readerTookOver = false
      /**
       * The scroller read last time. A session switch replaces the whole frame,
       * so it is checked before every use.
       */
      let scrollerCache = null
      /** When the last hand-back really landed, for the throttle. */
      let lastEnsureAt = 0
      /** When structure last changed, for the grace above. */
      let lastActivityAt = 0
      let scanQueued = false
      /** This batch of mutations held a structural moment / the follow being turned off. */
      let structureSeen = false
      let guardSeen = false

      /**
       * Whether the reader is reading up there right now.
       *
       * He sets it once, and the position clears it: back within the line means
       * he is done (or pressed the host's own button). That needs no "no
       * movement for this long" timer, which would drag him back while he
       * reads slowly.
       */
      const readerAway = () => {
        if (!readerTookOver) return false
        const scroller = conversationScroller()
        // Without a scroller, assume he is still up there and leave this round alone.
        if (scroller === null) return true
        if (!isAtBottom(scroller)) return true
        readerTookOver = false
        return false
      }

      /** Whether work counts as in progress right now. */
      const running = () => document.querySelector(FOLLOW_RUNNING_SELECTOR) !== null
        || performance.now() - lastActivityAt <= FOLLOW_ACTIVITY_GRACE_MS

      /**
       * Hand this round's follow back. Three gates have to open: the position,
       * the reader's intent and a fold glide in flight.
       * @param attempt - how many times this round has been put off by a fold glide.
       */
      const ensure = (attempt) => {
        if (!readEnabled()) return
        if (readerAway()) return
        const scroller = conversationScroller()
        if (scroller === null) return
        // More than a screen off the end is the reader reading higher up, not a follow that fell one step behind.
        if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > scroller.clientHeight) return
        // A fold glide is moving the height, and the position is its business until it lands.
        if (typeof foldBusy === 'function' && foldBusy()) {
          if (typeof attempt !== 'number') attempt = 0
          if (attempt >= FOLLOW_FOLD_WAIT_ATTEMPTS) return
          window.setTimeout(() => ensure(attempt + 1), FOLLOW_FOLD_WAIT_MS)
          return
        }
        const now = performance.now()
        if (now - lastEnsureAt < FOLLOW_MIN_INTERVAL_MS) return
        lastEnsureAt = now
        ensureFollowTail({ stillWanted: () => !readerAway() })
      }

      /** A batch of mutations is settled: decide whether to act. */
      const settle = () => {
        const structure = structureSeen
        const guarded = guardSeen
        structureSeen = false
        guardSeen = false
        // The guard side needs the extra "work in progress" test: the attribute
        // going away can also be a session switch or history being restored.
        if (!structure && !(guarded && running())) return
        ensure(0)
      }

      const queue = () => {
        if (scanQueued) return
        scanQueued = true
        requestAnimationFrame(() => {
          scanQueued = false
          settle()
        })
      }

      /** Whether a newly added node holds a flow block or a tool call row. */
      const marksStructure = (node) => {
        if (!(node instanceof Element)) return false
        return node.matches(FOLLOW_STRUCTURE_SELECTOR) || node.querySelector(FOLLOW_STRUCTURE_SELECTOR) !== null
      }

      /**
       * Note that the reader took the scroll over.
       *
       * Only once the content has really grown a scrollbar: before that there
       * is nothing to scroll, and setting the flag would make the guard wait a
       * round for nothing. What counts as his intent is isReaderScrollIntent's
       * call: inside the composer and keys that cannot scroll do not count.
       */
      const noteReaderIntent = (event) => {
        // Once taken over there is nothing to judge: this function only sets the
        // flag, and the dozens of events behind one gesture cannot change it.
        if (readerTookOver) return
        if (!isReaderScrollIntent(event)) return
        // The container is cached: a trackpad sends hundreds of these a second,
        // and each read is a document query plus two geometry values landing
        // exactly while the reader scrolls and new content dirties the layout.
        if (scrollerCache === null || !scrollerCache.isConnected) scrollerCache = conversationScroller()
        const scroller = scrollerCache
        if (scroller === null || scroller.scrollHeight - scroller.clientHeight <= 0) return
        readerTookOver = true
      }

      const observer = new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes') {
            // The follow went from present to absent: the host just turned it off.
            if (record.attributeName === FOLLOWING_TAIL_ATTRIBUTE) {
              if (record.target instanceof Element && !record.target.hasAttribute(FOLLOWING_TAIL_ATTRIBUTE)) guardSeen = true
              continue
            }
            // A thinking row leaving "running": the boundary of that piece of work.
            if (record.oldValue === RUNNING_STATE
              && record.target instanceof Element
              && record.target.matches(THINK_ROW_SELECTOR)
              && record.target.getAttribute('data-state') !== RUNNING_STATE) {
              lastActivityAt = performance.now()
              structureSeen = true
            }
            continue
          }
          for (const node of record.addedNodes) {
            if (!marksStructure(node)) continue
            lastActivityAt = performance.now()
            structureSeen = true
          }
        }
        if (structureSeen || guardSeen) queue()
      })

      for (const type of FOLLOW_INTENT_TYPES) {
        document.addEventListener(type, noteReaderIntent, { capture: true, passive: true })
      }
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-state', FOLLOWING_TAIL_ATTRIBUTE],
        attributeOldValue: true,
      })

      return () => {
        observer.disconnect()
        for (const type of FOLLOW_INTENT_TYPES) document.removeEventListener(type, noteReaderIntent, true)
      }
    }

    /**
     * Install both halves of the follow behaviour and mark the page for its
     * stylesheet (the capped body's vertical-only scroll).
     *
     * @param ctx - client context.
     * @param ui - shared handle table.
     * @returns teardown.
     */
    function installChatFollow(ctx, ui) {
      // dsh-chat-ux drives the same moments and writes the same scroll
      // positions; two guards clicking the host's own button at once is not a
      // merged behaviour (src/shared/peer-plugin.js).
      const readEnabled = () => !dshChatUxPresent() && readPrefs().enhancedFollow !== false
      const foldBusy = () => ui.chatFold !== undefined && ui.chatFold !== null && ui.chatFold.isBusy()
      const stopGuard = createChatFollowGuard(readEnabled, foldBusy)
      const stopProcess = createChatProcessFollow(readEnabled)
      // The stylesheet's one rule rides this mark, so the mark follows the
      // preference rather than the install: switching the feature off hands the
      // chat area back whole, with no reload and with no pass of its own.
      const applyMark = () => {
        if (readEnabled()) document.body.setAttribute(CHAT_FOLLOW_ATTR, '')
        else document.body.removeAttribute(CHAT_FOLLOW_ATTR)
      }
      applyMark()
      const stopPrefs = subscribePrefs(applyMark)
      return () => {
        stopPrefs()
        document.body.removeAttribute(CHAT_FOLLOW_ATTR)
        stopGuard()
        stopProcess()
      }
    }
