    /**
     * The send flight's capture, ported from dsh-chat-ux: everything taken off the
     * composer card before React clears the draft — its geometry, its looks, and a
     * whole clone of it.
     *
     * The flight hands the clone to the compositor; send-morph.js builds it and
     * send-shape.js holds the curve. Nothing here touches the page: it reads
     * layout the browser has already resolved, plus one cloneNode.
     */
    /** Marks the stand-in while it is on the page. A handle for looking things up; no rule hangs off it. */
    const CHAT_SEND_GHOST_ATTR = 'data-dsh-claude-send-ghost'
    // The mark put on the real row while the stand-in flies is constants.js's
    // CHAT_FLYING_ATTR; the stylesheet hides it (send-flight.css). The composer
    // card, its scroll area and the echo bubble are the host's own attributes,
    // read from the one contract table (src/shared/chat-dom.js).

    /**
     * How many ancestors the stand-in's imitation chain may carry.
     *
     * Past this the chain is dropped whole rather than cut short: the chain is
     * counted outwards from the card, so the outer links are what a rule like
     * `.hero .input` matches, and half a chain matches the wrong elements.
     *
     * Measured, not guessed: the composer card sits fifteen levels below body,
     * seven of them wordless `div`s and `[data-slot]` seats. 24 leaves room for
     * a few more containers while still refusing a pathological depth — at that
     * scale some plugin has wrapped the whole tree, and copying that chain would
     * drag its own layout in.
     */
    const CHAT_MAX_ANCESTOR_LINKS = 24

    /**
     * The ordinary properties the clone has to carry over from the card's
     * ancestors.
     *
     * font-size and line-height have to be in: the host sets the composer's type
     * on an ancestor selector, and a clone that leaves that chain drops straight
     * to body's 16px — measured, 26 of 37 compared elements disagreed on type
     * size, on every single flight.
     *
     * Writing them on the shell does not steal any type a clone sets for itself:
     * a rule that matches directly beats inheritance, so only the elements that
     * expect to inherit are caught, which is the point.
     */
    const CHAT_INHERITED_PROPERTIES = [
      'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-feature-settings',
      'font-variation-settings', 'font-kerning', 'line-height', 'letter-spacing', 'word-spacing', 'text-rendering',
      '-webkit-font-smoothing', 'direction',
    ]

    /**
     * The marks scrubbed out of a clone: the ones the host and this skin use to
     * find a composer. The stand-in must not be found as one, and it must not be
     * focusable.
     *
     * The style hooks stay: attribute selectors match an exact name, so a rule
     * like `[data-composer-card]` either finds the attribute or does not. What
     * keeping them costs is measured — document.querySelector takes the first in
     * document order and the stand-in is always appended last, and the host's own
     * card lookups walk up with closest; the stand-in lives 400 ms and carries
     * `inert`, so nothing inside it can be focused or read out. What it buys is
     * that the host's and other plugins' rules written on those attributes still
     * match the clone. So the three style hooks — `data-composer-card`,
     * `data-composer-input`, `data-input-scroll` — are not in this list. `id` is,
     * because a second node with the same id breaks getElementById, label[for] and
     * in-page anchors for everyone.
     */
    const CHAT_IDENTITY_ATTRIBUTES = [
      'id', 'contenteditable', 'data-lexical-editor', 'data-dsh-claude-caret', 'tabindex', 'autofocus',
    ]

    /**
     * Read a length. Anything unreadable counts as 0: a flight displaced by a
     * little is lighter than no flight at all.
     */
    function chatSendPixel(value) {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 0
    }

    /** Split the numbers out of an `rgb()` / `rgba()` colour; null when it does not read as one. */
    function chatSendColorParts(color) {
      const match = /^rgba?\(([^)]+)\)$/.exec(color.trim())
      if (match === null) return null
      const raw = match[1]
      if (raw === undefined) return null
      const parts = raw.split(',').map(part => Number.parseFloat(part))
      if (parts.length < 3 || parts.some(part => !Number.isFinite(part))) return null
      return parts
    }

    /** How opaque a computed colour is. An unreadable one counts as 0: skipping the flight beats painting an unknown colour. */
    function chatSendAlpha(color) {
      const parts = chatSendColorParts(color)
      if (parts === null) return 0
      return parts[3] ?? 1
    }

    /**
     * Pin declarations inline with `!important`.
     *
     * Two things inside the stand-in are matched by other people's rules: the
     * clone (which keeps the card's classes and data hooks on purpose) and the
     * imitation ancestor chain around it. Those rules may carry `!important` —
     * measured, a colour plugin on the same page uses it against
     * `[data-composer-card]` — and a plain inline style loses to that: one
     * centring rule is enough to fly the clone to the middle of the screen and
     * drop it back. Inline plus `!important` is the top of the style order (only
     * animations beat it), pinning the position and size to what was measured at
     * take-off.
     */
    function chatSendPin(element, declarations) {
      for (const [name, value] of declarations) element.style.setProperty(name, value, 'important')
    }

    /**
     * Strip every identity mark out of a cloned tree: the stand-in must not be
     * found as a composer and must not take focus. Which marks and why the style
     * hooks stay: see CHAT_IDENTITY_ATTRIBUTES.
     */
    function chatSendScrub(root) {
      const all = [root, ...root.querySelectorAll('*')]
      for (const element of all) {
        for (const name of CHAT_IDENTITY_ATTRIBUTES) element.removeAttribute(name)
      }
      for (const layer of root.querySelectorAll('[data-dsh-claude-caret-layer]')) layer.remove()
    }

    /**
     * Where the stand-in hangs, and what it inherits from.
     *
     * One place with two uses on purpose: snapshotComposer takes it as the
     * baseline for custom properties (what the stand-in inherits), startMorph as
     * the mount point. Writing `document.body` in both would leave the coupling
     * alive only in a comment — the day the mount point moves (into a portal
     * container, say) and the baseline is missed, the symptom is a few variables
     * quietly carrying the wrong value, which is nearly impossible to trace back
     * to a mount point.
     *
     * The mount point also has to be the document's last child: see startMorph.
     */
    function chatSendGhostHost() {
      return document.body
    }

    /**
     * Take one reading of the composer card: geometry, looks, and the whole clone.
     *
     * Call this in the capture phase of a submission, while the draft is still
     * there. Everything read is already laid out and the clone is one
     * cloneNode, so the reader's Enter press does not wait on it.
     *
     * @param input - the draft's editable surface.
     * @param card - the composer card.
     * @returns the snapshot, or null when the card has no box or the draft area is not in the card.
     */
    function snapshotComposer(input, card) {
      const box = card.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return null
      const scroll = input.closest(COMPOSER_SCROLL_SELECTOR)
      if (scroll === null || scroll.parentElement !== card) return null
      const cardStyle = window.getComputedStyle(card)
      const inputStyle = window.getComputedStyle(input)
      const inputBox = input.getBoundingClientRect()
      const text = {
        left: inputBox.left - box.left + input.clientLeft + chatSendPixel(inputStyle.paddingLeft),
        top: inputBox.top - box.top + input.clientTop + chatSendPixel(inputStyle.paddingTop),
        right: box.right - (inputBox.right - chatSendPixel(inputStyle.borderRightWidth) - chatSendPixel(inputStyle.paddingRight)),
        lineHeight: chatSendPixel(inputStyle.lineHeight),
      }

      // Which pieces of the card are taken away: anything with area that is not
      // the draft area. A piece spanning the whole card and split into several
      // groups is the toolbar, and it is split by group — the left and right
      // groups each drive into the corner nearest them. A `display: contents`
      // seat has no box of its own, so the walk goes through it.
      const paths = []
      const rectOf = (element) => {
        const r = element.getBoundingClientRect()
        return [r.left - box.left, r.top - box.top, r.width, r.height]
      }
      const collect = (element, path) => {
        const width = rectOf(element)[2]
        const height = rectOf(element)[3]
        if (width * height === 0) {
          if (window.getComputedStyle(element).display !== 'contents') return
          Array.from(element.children).forEach((child, index) => {
            collect(child, [...path, index])
          })
          return
        }
        const groups = Array.from(element.children).filter((child) => {
          const rect = rectOf(child)
          return rect[2] * rect[3] > 0
        })
        if (width >= box.width * 0.9 && groups.length >= 2) {
          Array.from(element.children).forEach((child, index) => {
            const rect = rectOf(child)
            if (rect[2] * rect[3] > 0) paths.push({ path: [...path, index], rect })
          })
          return
        }
        paths.push({ path, rect: rectOf(element) })
      }
      Array.from(card.children).forEach((child, index) => {
        if (child !== scroll) collect(child, [index])
      })

      // The inherited environment: custom properties are taken only where they
      // differ from the mount point (the stand-in hangs there, so an equal value
      // already reaches it).
      //
      // The baseline is the mount point, checked against all three cases:
      //   a variable defined only on an ancestor in between (not on the mount
      //     point) reads as an empty string there, the two differ, and it is
      //     copied; without that the stand-in would not have the variable at all
      //     and `var(--x)` would fall into its fallback while the real card has it.
      //   the mount point and the card agree → not copied; the stand-in inherits
      //     the same value.
      //   an ancestor overrides the mount point's value and the card follows —
      //     the two differ, and what is copied is the ancestor's, which is also
      //     what the card reads right now, so the stand-in agrees with the card.
      // The one edge is a variable defined only on the mount point: the stand-in
      // inherits it anyway, and not copying is still right.
      const hostStyle = window.getComputedStyle(chatSendGhostHost())
      const context = []
      for (let index = 0; index < cardStyle.length; index += 1) {
        const name = cardStyle[index]
        if (name === undefined || !name.startsWith('--')) continue
        const value = cardStyle.getPropertyValue(name)
        if (value !== hostStyle.getPropertyValue(name)) context.push([name, value])
      }
      for (const name of CHAT_INHERITED_PROPERTIES) context.push([name, cardStyle.getPropertyValue(name)])

      // The ancestor chain: once the clone leaves its parent chain, descendant
      // selectors like `.hero .input` match nothing on it, and the host's hero
      // state sets its minimum height exactly that way. So the chain is recorded
      // and put back at take-off (see startMorph). Tag and class only: what the
      // stand-in needs is selector matching, while `data-*` is somebody else's
      // state handle and would be read as a stale phase if copied, and `id` would
      // only make people pick the wrong node.
      // This runs on the reader's Enter frame, so it reads attributes only: that
      // does not touch layout and will not drag a style resolution into the frame.
      const ancestors = []
      let interrupted = false
      for (let node = card.parentElement; node !== null && node !== document.body; node = node.parentElement) {
        // The stand-in's own parts must not join the chain. The real card never
        // has them among its ancestors; this defends against a second reading of
        // the origin before the last one settled. A chain broken here is dropped
        // whole: with a level missing, an outer selector would match an inner link.
        if (node.hasAttribute(CHAT_SEND_GHOST_ATTR)) {
          interrupted = true
          break
        }
        ancestors.push({
          tag: node.tagName.toLowerCase(),
          className: node.getAttribute('class') ?? '',
        })
      }
      ancestors.reverse()

      const clone = card.cloneNode(true)
      chatSendScrub(clone)
      // These have to carry `!important`, not as a precaution: the clone keeps the
      // card's classes and data hooks — which is what lets the host's and other
      // plugins' rules match it (see CHAT_IDENTITY_ATTRIBUTES) — and some of those
      // rules are themselves `!important`. Plain inline styles lose to those: one
      // `position: fixed` centring rule would fly the clone to the middle of the
      // screen and drop it back, which reads as the composer jumping up and
      // flashing down. Inline plus `!important` pins the position and size to what
      // was measured at take-off.
      chatSendPin(clone, [
        ['position', 'absolute'],
        ['left', '0px'],
        ['top', '0px'],
        ['right', 'auto'],
        ['bottom', 'auto'],
        ['margin', '0px'],
        ['width', box.width + 'px'],
        ['max-width', 'none'],
        ['height', box.height + 'px'],
        ['box-sizing', 'border-box'],
        ['transform', 'none'],
        ['float', 'none'],
        ['background', 'transparent'],
        ['box-shadow', 'none'],
      ])
      const draft = clone.children[Array.from(card.children).indexOf(scroll)]
      // The draft area's height is pinned: the hero state's minimum height hangs
      // off `.hero .input`, so the clone would collapse once it leaves `.hero`
      // and the toolbar would ride up with it.
      const scrollBox = scroll.getBoundingClientRect()
      draft.style.height = scrollBox.height + 'px'
      draft.style.minHeight = '0px'
      draft.style.maxHeight = 'none'
      const chrome = []
      for (const { path, rect } of paths) {
        let element = clone
        for (const index of path) element = element?.children[index]
        if (element instanceof HTMLElement) chrome.push({ element, rect })
      }
      return {
        box,
        background: cardStyle.backgroundColor,
        radius: chatSendPixel(cardStyle.borderTopLeftRadius),
        shadow: cardStyle.boxShadow,
        clone,
        draft,
        draftScrollTop: scroll.scrollTop,
        chrome,
        text,
        context,
        // Too deep, or broken midway, and the whole chain is void (see
        // CHAT_MAX_ANCESTOR_LINKS): null means "not imitated", not "this chain is empty".
        ancestors: interrupted || ancestors.length > CHAT_MAX_ANCESTOR_LINKS ? null : ancestors,
      }
    }
