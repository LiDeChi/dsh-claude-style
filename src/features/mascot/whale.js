    /**
     * Deepy, the pixel whale the DeepSeek brand puts on the composer in the
     * crab's place (src/features/mascot/mascot.js decides which one is out).
     *
     * On the home page it stands on the composer card's top edge, near the
     * right end, like the crab. In a conversation it stands on top of the
     * whole input area — the card and the queue, todo and goal cards stacked
     * above it — and when an approval, a question or a plan review takes the
     * card's place, on top of that panel instead. Only the main conversation
     * carries it; the sidebar's subagent chats do not.
     *
     * What it plays follows the work (src/features/mascot/whale-signals.js),
     * the way Deepy's Clawd on Desk theme maps agent states to animations:
     * idle breathing; thinking while the model reasons or has not answered;
     * typing while it writes or runs tools, headphones when two sessions
     * work at once and a hard hat from three; headphones or conducting its
     * little clones while one or more subagents run; context compaction; the
     * notification bubble while the reader is asked for something; the error
     * shake after a failed tool call or turn; the celebration when a turn or
     * a compaction finishes. The home page reads the whole workspace. Between
     * jobs it looks around or spouts now and then, falls asleep after a quiet
     * minute — no work to show and no pointer move or key press — and wakes
     * up startled at the next pointer move or key press. A
     * click on its face or its tail pokes it, four quick clicks tickle it, and
     * pressing it and pulling lifts it for as long as the press lasts.
     *
     * Each animation is one sheet (DEEPY_SHEETS): the sprite's box and sheet
     * are custom properties on the whale's own node, and a frame change is a
     * translation of the strip inside the sprite's overflow-hidden window,
     * played by the browser's animation engine (WAAPI steps keyframes) — no
     * timer, no DOM mutation, so playing never wakes a pass. A
     * sheet loads the first time its animation is wanted — its pixels are
     * rebuilt as SVG, so the bitmap kept in memory is the size the whale is
     * drawn at and every display density gets a sharp one — and the animation
     * on screen keeps playing until the new sheet is ready, so a switch never
     * blinks. A reader who asks for reduced motion gets each state's still
     * frame, and the reactions only when they click.
     *
     * @param ctx - client context.
     * @param ui - shared handle table (`ui.composer`).
     * @returns `{ sync, release, onActivity, dispose }`.
     */
    function createMascotWhale(ctx, ui) {
      /** A level state that just took the stage holds it this long against an equal or lower one. */
      const MIN_SHOW_MS = 1000
      /** The quiet spell before the whale dozes off. */
      const SLEEP_AFTER_MS = 60000
      /** The quiet spell between two idle extras. */
      const EXTRA_MIN_MS = 20000
      const EXTRA_SPAN_MS = 20000
      const EXTRAS = ['idle-look', 'idle-spout']
      /** Moments hold for two rounds of their animation, as Clawd's auto-return does. */
      const MOMENTS = {
        error: { state: 'error', animation: 'error', priority: 8, holdMs: 4800 },
        attention: { state: 'attention', animation: 'happy', priority: 5, holdMs: 5200 },
      }
      /** A reaction outranks every state: it answers the reader's own hand. */
      const REACTION_PRIORITY = 10
      /** Clicks this close in a row are one tickle when four of them land. */
      const TICKLE_GAP_MS = 450
      const TICKLE_CLICKS = 4
      /** How far a press travels before it lifts the whale. */
      const LIFT_PX = 4
      /** A marker on the host element the whale stands on, which makes it the whale's containing block. */
      const ANCHOR_ATTR = 'data-dsh-claude-deepy-anchor'

      let root = null
      let sprite = null
      let strip = null
      let anchor = null
      let signals = null
      let alive = true
      /** The followed session id, or null on the home page. */
      let sessionId = null
      let level = null
      /** The moment on screen, and the lesser one that waits for it to end. */
      let moment = null
      let queued = null
      let reaction = null
      let extra = null
      let waking = false
      let asleep = false
      /** Where the quiet spell starts: the reader's last pointer move or key, or the whale's last work. */
      let quietSince = Date.now()
      let nextExtraAt = 0
      /** The animation on screen: `{ key, mode, priority, start, done? }`. */
      let current = null
      /** The WAAPI animation playing on the strip; null while a still frame is pinned. */
      let animation = null
      let timer = null
      /** Sheet key → 'loading' | 'ready' | 'failed'. */
      const sheets = new Map()
      let clicks = []
      let press = null

      function sheetUrl(key) {
        return `${DEEPY_ROUTE}${key}.png?v=${BUILD_ID}`
      }

      /**
       * The address the sprite paints a sheet from. Sheets ship as PNG (the
       * format compresses this art best), but a vector is rasterized at the
       * size it is drawn and only that small bitmap is kept — so the first
       * time an animation is wanted, its sheet's pixels are rebuilt here as
       * SVG (one path per color, a row's runs of one color merged) and the
       * SVG is what plays. The text is cached under the sheet's own
       * content stamp (DEEPY_STAMPS, built from the sheet's bytes), so a
       * sheet is re-converted only when its own pixels change; a sheet that
       * decodes yet does not convert plays as the PNG it came from.
       */

      /** Cache API store for the generated SVG texts; entries key on the sheet's content stamp. */
      const SHEET_CACHE = 'dsh-claude-style-deepy'
      /** Bumped when the conversion below changes: cached vectors key on it too. */
      const CONVERTER_VERSION = 1
      /** The address each loaded sheet plays from. */
      const sheetUrls = new Map()
      /** Blob addresses handed out, revoked on dispose. */
      const objectUrls = []
      let cacheUsable = typeof caches !== 'undefined'

      /** The cache address of a sheet's vector: its own stamp plus the converter's version. */
      function sheetCacheKey(key) {
        return `${location.origin}${DEEPY_ROUTE}${key}.svg?v=${DEEPY_STAMPS[key]}-${CONVERTER_VERSION}`
      }

      /** The cached SVG text for a sheet, or null on a miss. */
      async function sheetCacheRead(key) {
        if (!cacheUsable) return null
        try {
          const store = await caches.open(SHEET_CACHE)
          const hit = await store.match(sheetCacheKey(key))
          return hit === undefined ? null : hit.text()
        } catch (error) {
          // A cache that refuses is a cache that always misses: convert per load.
          cacheUsable = false
          console.warn("[dsh-claude-style] Deepy's sheet cache is unavailable; sheets convert once per page load instead.", error)
          return null
        }
      }

      function sheetCacheWrite(key, svg) {
        if (!cacheUsable) return
        caches.open(SHEET_CACHE).then(store => {
          // Stale stamps of this same sheet are dead weight: drop them on a write.
          store.keys().then(requests => {
            for (const request of requests) {
              if (request.url.includes(`${DEEPY_ROUTE}${key}.svg`) && request.url !== sheetCacheKey(key)) store.delete(request)
            }
          })
          store.put(sheetCacheKey(key), new Response(svg, { headers: { 'content-type': 'image/svg+xml' } }))
        }).catch(error => {
          // Same standing as a read refusal: the cache is a miss from here on.
          cacheUsable = false
          console.warn("[dsh-claude-style] Deepy's sheet cache refused a write; sheets convert once per page load instead.", error)
        })
      }

      /**
       * Rebuild a decoded sheet as SVG text: one path per color, each made of
       * a row's runs of that color. Transparent pixels are simply absent.
       */
      function vectorizeSheet(image) {
        const width = image.naturalWidth
        const height = image.naturalHeight
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const pen = canvas.getContext('2d')
        pen.drawImage(image, 0, 0)
        const data = pen.getImageData(0, 0, width, height).data
        /** Color string → the path chunks of its runs so far. */
        const paths = new Map()
        for (let y = 0; y < height; y++) {
          let x = 0
          while (x < width) {
            const at = (y * width + x) * 4
            const r = data[at]
            const g = data[at + 1]
            const b = data[at + 2]
            const a = data[at + 3]
            let end = x + 1
            while (end < width) {
              const next = (y * width + end) * 4
              if (data[next] !== r || data[next + 1] !== g || data[next + 2] !== b || data[next + 3] !== a) break
              end++
            }
            if (a !== 0) {
              const color = a === 255
                ? `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
                : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
              const chunk = `M${x} ${y}h${end - x}v1h${x - end}z`
              const known = paths.get(color)
              if (known === undefined) paths.set(color, [chunk])
              else known.push(chunk)
            }
            x = end
          }
        }
        const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`]
        for (const [color, chunks] of paths) parts.push(`<path fill="${color}" d="${chunks.join('')}"/>`)
        parts.push('</svg>')
        return parts.join('')
      }

      function sheetObjectUrl(text) {
        const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
        objectUrls.push(url)
        return url
      }

      /**
       * Resolve the address one sheet plays from: the cached vector text, a
       * fresh conversion of its pixels, or — when the sheet decodes but does
       * not convert — the PNG itself. Rejects only when the sheet does not
       * load at all.
       */
      async function prepareSheet(key) {
        const url = sheetUrl(key)
        const cached = await sheetCacheRead(key)
        if (cached !== null) return sheetObjectUrl(cached)
        const image = new Image()
        image.src = url
        await image.decode()
        try {
          const svg = vectorizeSheet(image)
          sheetCacheWrite(key, svg)
          return sheetObjectUrl(svg)
        } catch (error) {
          // The PNG fallback the reader asked for: the sheet plays as-is.
          console.warn(`[dsh-claude-style] Deepy's "${key}" sheet could not be vectorized; playing the PNG as-is.`, error)
          return url
        }
      }

      /**
       * Whether a sheet is ready to paint, starting its load the first time.
       * A sheet that does not load leaves its animation out and says so once:
       * the host half serves the sheets, and one that predates them answers 404.
       */
      function sheetReady(key) {
        const known = sheets.get(key)
        if (known !== undefined) return known === 'ready'
        sheets.set(key, 'loading')
        prepareSheet(key).then(url => {
          sheetUrls.set(key, url)
          sheets.set(key, 'ready')
          if (alive && root !== null) step()
        }, () => {
          // The host half did not serve the sheet: the animation stays out.
          sheets.set(key, 'failed')
          console.warn(`[dsh-claude-style] Deepy's "${key}" sheet did not load from ${sheetUrl(key)}; the host half serves it, so restart the host after an update.`)
        })
        return false
      }

      function build() {
        root = buildElement('span', 'dsh-claude-deepy')
        root.setAttribute('aria-hidden', 'true')
        sprite = buildElement('span', 'dsh-claude-deepy-sprite')
        strip = buildElement('span', 'dsh-claude-deepy-strip')
        sprite.appendChild(strip)
        root.appendChild(sprite)
        const hit = buildElement('span', 'dsh-claude-deepy-hit')
        hit.addEventListener('pointerdown', onPressStart)
        hit.addEventListener('pointermove', onPressMove)
        hit.addEventListener('pointerup', onPressEnd)
        hit.addEventListener('pointercancel', onPressCancel)
        // The card a whale stands on can be a button of its own (the home
        // page's "choose a workspace" card): a click on the whale stays here.
        hit.addEventListener('click', event => { event.stopPropagation() })
        root.appendChild(hit)
      }

      /**
       * Where the whale stands on the page shown: the home page's card, or the
       * main conversation's input area (its composer stack, or the panel that
       * takes the card's place). Null when neither is on screen.
       */
      function findStand() {
        const heroCard = ui.composer ? ui.composer.heroCard() : null
        if (heroCard !== null) return { element: heroCard, session: null, place: 'card' }
        if (document.body.hasAttribute('data-dsh-claude-composer-hidden')) return null
        const content = findConversationSession()
        const seat = content === null ? null : content.querySelector('[data-composer-seat]')
        if (seat === null) return null
        const session = conversationSessionId(content)
        // The composer chain's own wrapper (ui-renderer): the host hides it
        // inline when a panel is elected, and mounts that panel right after it.
        const fallback = seat.querySelector('[data-chain-overlay-fallback="conversation.composer"]')
        if (fallback !== null && fallback.style.display === 'none') {
          const panel = fallback.nextElementSibling
          return panel === null ? null : { element: panel, session, place: 'panel' }
        }
        const stack = seat.querySelector(COMPOSER_STACK)
        return stack === null ? null : { element: stack, session, place: 'stack' }
      }

      function setAnchor(element, place) {
        if (anchor !== null && anchor !== element) anchor.removeAttribute(ANCHOR_ATTR)
        anchor = element
        if (anchor !== null && anchor.getAttribute(ANCHOR_ATTR) !== place) anchor.setAttribute(ANCHOR_ATTR, place)
      }

      /** Each pass: stand where the page puts the whale, follow that page's session, read its state. */
      function sync() {
        const stand = findStand()
        if (stand === null) {
          release()
          return
        }
        if (root === null) build()
        if (signals === null) {
          quietSince = Date.now()
          signals = createMascotWhaleSignals(ctx, onMoment, refresh)
        }
        if (root.parentNode !== stand.element) stand.element.appendChild(root)
        setAnchor(stand.element, stand.place)
        if (stand.session !== sessionId) {
          sessionId = stand.session
          // A moment belongs to the page it happened on.
          moment = null
          queued = null
        }
        signals.follow(sessionId)
        refresh()
      }

      /** Read the state again and play what it asks for. */
      function refresh() {
        if (signals === null) return
        level = signals.read(sessionId)
        step()
      }

      /**
       * A moment happened. One that outranks the moment on screen (or equals
       * it) takes over now; a lesser one waits its turn — a turn that finishes
       * right after a tool failed still celebrates once the shake is over.
       */
      function onMoment(name) {
        const now = Date.now()
        if (moment !== null && now < moment.until && moment.priority > MOMENTS[name].priority) {
          queued = name
          return
        }
        startMoment(name, now)
        step()
      }

      function startMoment(name, now) {
        const next = MOMENTS[name]
        moment = { state: next.state, animation: next.animation, priority: next.priority, until: now + next.holdMs }
      }

      /** What should be on screen now: `{ key, mode, priority }`. */
      function decide(now) {
        if (moment !== null && now >= moment.until) {
          moment = null
          if (queued !== null) startMoment(queued, now)
          queued = null
        }
        if (reaction !== null) return { key: reaction.key, mode: reaction.mode, priority: REACTION_PRIORITY }
        const held = moment
        const pick = held !== null && held.priority >= level.priority ? held : level
        if (pick.state !== 'idle') {
          asleep = false
          waking = false
          extra = null
          nextExtraAt = 0
          // Work on screen is no quiet spell: the minute to sleep starts when it ends.
          quietSince = now
          return { key: pick.animation, mode: 'loop', priority: pick.priority }
        }
        if (!asleep && now - quietSince >= SLEEP_AFTER_MS) {
          asleep = true
          extra = null
        }
        if (asleep) return { key: 'sleeping', mode: 'loop', priority: 1 }
        if (waking) return { key: 'waking', mode: 'once', priority: 1 }
        if (extra === null && !motionReduced() && !document.hidden) {
          if (nextExtraAt === 0) nextExtraAt = now + EXTRA_MIN_MS + Math.random() * EXTRA_SPAN_MS
          else if (now >= nextExtraAt) extra = EXTRAS[Math.floor(Math.random() * EXTRAS.length)]
        }
        if (extra !== null) return { key: extra, mode: 'once', priority: 1 }
        return { key: 'idle', mode: 'loop', priority: 1 }
      }

      /** A once animation reached its last frame: whoever asked for it lets go. */
      function finish(key, now) {
        // A fresh reaction has not played yet: the one ending is its predecessor.
        if (reaction !== null && reaction.key === key && !reaction.fresh) reaction = null
        if (extra === key) {
          extra = null
          nextExtraAt = now + EXTRA_MIN_MS + Math.random() * EXTRA_SPAN_MS
        }
        if (key === 'waking') waking = false
      }

      /** Whether the animation choice holds what is on screen now still. */
      function still() {
        return motionReduced() && reaction === null
      }

      /** The strip translation that puts one frame of a sheet in the window. */
      function frameOffset(sheet, frame) {
        return `translate(${-(frame % 8) * sheet.box[2] * 2}px, ${-Math.floor(frame / 8) * sheet.box[3] * 2}px)`
      }

      /**
       * Put an animation on the strip: a WAAPI animation whose keyframes hold
       * each frame for DEEPY_FRAME_MS (steps(1) jumps at the slot's end), so a
       * loop runs entirely on the browser's animation engine with no tick of
       * the whale's own; or the state's still frame, pinned while the motion
       * choice says so. A once animation's end is reported by its `finished`;
       * the deadline schedule() arms is the backstop for a throttled tab.
       */
      function play(key, mode, now) {
        if (animation !== null) {
          animation.cancel()
          animation = null
        }
        const sheet = DEEPY_SHEETS[key]
        if (still()) {
          strip.style.transform = frameOffset(sheet, sheet.still)
          return
        }
        strip.style.transform = ''
        const keyframes = []
        for (let frame = 0; frame < sheet.frames; frame++) {
          keyframes.push({ offset: frame / sheet.frames, transform: frameOffset(sheet, frame), easing: 'steps(1)' })
        }
        keyframes.push({ offset: 1, transform: frameOffset(sheet, mode === 'loop' ? 0 : sheet.frames - 1) })
        const playing = strip.animate(keyframes, {
          duration: sheet.frames * DEEPY_FRAME_MS,
          iterations: mode === 'loop' ? Infinity : 1,
          fill: 'forwards',
        })
        animation = playing
        if (mode !== 'once') return
        playing.finished.then(() => {
          if (animation !== playing || current === null || current.key !== key || current.done === true) return
          current.done = true
          finish(key, Date.now())
          step()
        }, () => {
          // finished rejects on cancel(): a newer animation took the strip.
        })
      }

      /**
       * Advance the whale: settle what is on screen, then arm the one timer at
       * the next moment a time-based decision can flip. Runs on state reads,
       * sheet arrivals, reactions, the reader's hand and that timer — playing
       * itself needs no tick (play()).
       */
      function step() {
        if (root === null || level === null) return
        const now = Date.now()
        if (current !== null && current.mode === 'once' && current.done !== true && now - current.start >= DEEPY_SHEETS[current.key].frames * DEEPY_FRAME_MS) {
          current.done = true
          finish(current.key, now)
        }
        const next = decide(now)
        const switching = current === null || next.key !== current.key || (reaction !== null && reaction.fresh)
        // A state that just arrived is not pushed off by an equal or lower one
        // within MIN_SHOW_MS, so thinking and typing do not flicker. A reaction
        // gives way the moment it ends.
        const settled = current === null || current.mode !== 'loop' || current.priority === REACTION_PRIORITY ||
          next.priority > current.priority || now - current.start >= MIN_SHOW_MS
        if (switching && settled) {
          if (sheetReady(next.key)) show(next, now)
          // A once animation whose sheet never came counts as played, so the
          // whale does not wait on it for good.
          else if (next.mode === 'once' && sheets.get(next.key) === 'failed') {
            if (reaction !== null) reaction.fresh = false
            finish(next.key, now)
          }
        } else if (!switching && current !== null) {
          // The motion choice flipped under the animation on stage: pin its
          // still frame, or set it playing again from where it stands.
          if (still() && animation !== null) {
            animation.cancel()
            animation = null
            strip.style.transform = frameOffset(DEEPY_SHEETS[current.key], DEEPY_SHEETS[current.key].still)
          } else if (!still() && animation === null) {
            play(current.key, current.mode, now)
            if (animation !== null && current.mode === 'loop') {
              animation.currentTime = (now - current.start) % (DEEPY_SHEETS[current.key].frames * DEEPY_FRAME_MS)
            }
          }
        }
        schedule(now, switching && !settled)
      }

      function show(next, now) {
        const sheet = DEEPY_SHEETS[next.key]
        current = { key: next.key, mode: next.mode, priority: next.priority, start: now }
        if (reaction !== null && reaction.key === next.key) reaction.fresh = false
        const style = root.style
        style.setProperty('--dsh-claude-deepy-sheet', `url("${sheetUrls.get(next.key)}")`)
        style.setProperty('--dsh-claude-deepy-x', String(sheet.box[0]))
        style.setProperty('--dsh-claude-deepy-y', String(sheet.box[1]))
        style.setProperty('--dsh-claude-deepy-w', String(sheet.box[2]))
        style.setProperty('--dsh-claude-deepy-h', String(sheet.box[3]))
        style.setProperty('--dsh-claude-deepy-strip-h', String(sheet.box[3] * Math.ceil(sheet.frames / 8)))
        if (root.getAttribute('data-animation') !== next.key) root.setAttribute('data-animation', next.key)
        play(next.key, next.mode, now)
        if (!root.hasAttribute('data-ready')) root.setAttribute('data-ready', '')
      }

      /**
       * The one timer: the next moment a time-based decision can flip — a
       * moment's hold ending, a deferred switch settling, a once animation's
       * last frame (backstop for its `finished`), the quiet minute to sleep,
       * the next idle extra. Everything else arrives as an event.
       */
      function schedule(now, waitSettle) {
        if (timer !== null) clearTimeout(timer)
        timer = null
        let at = Infinity
        if (moment !== null) at = Math.min(at, moment.until)
        if (waitSettle && current !== null) at = Math.min(at, current.start + MIN_SHOW_MS)
        if (current !== null && current.mode === 'once' && current.done !== true) {
          at = Math.min(at, current.start + DEEPY_SHEETS[current.key].frames * DEEPY_FRAME_MS)
        }
        if (!asleep && level !== null && level.state === 'idle') at = Math.min(at, quietSince + SLEEP_AFTER_MS)
        if (extra === null && nextExtraAt > now) at = Math.min(at, nextExtraAt)
        if (at === Infinity) return
        timer = setTimeout(() => {
          timer = null
          step()
        }, Math.max(at - now, 0))
      }

      /**
       * The reader's hand on the whale. A reaction always starts from its
       * first frame (`fresh` until it is shown, even over the same reaction
       * still on screen); until its sheet is decoded, what is on screen keeps
       * playing.
       */
      function react(key, mode) {
        reaction = { key, mode, fresh: true }
        step()
      }

      function onPressStart(event) {
        if (event.button !== 0) return
        press = { id: event.pointerId, x: event.clientX, y: event.clientY, lifted: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }

      function onPressMove(event) {
        if (press === null || press.lifted || event.pointerId !== press.id) return
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < LIFT_PX) return
        press.lifted = true
        clicks = []
        react('drag', 'loop')
      }

      /** A press let go: a lift ends, a click pokes the side it landed on — or tickles, the fourth in a row. */
      function onPressEnd(event) {
        if (press === null || event.pointerId !== press.id) return
        const lifted = press.lifted
        press = null
        if (lifted) {
          reaction = null
          step()
          return
        }
        const now = Date.now()
        if (clicks.length > 0 && now - clicks[clicks.length - 1] > TICKLE_GAP_MS) clicks = []
        clicks.push(now)
        if (clicks.length >= TICKLE_CLICKS) {
          clicks = []
          react('tickle', 'once')
          return
        }
        const box = event.currentTarget.getBoundingClientRect()
        react(event.clientX - box.left < box.width / 2 ? 'poke-left' : 'poke-right', 'once')
      }

      function onPressCancel(event) {
        if (press === null || event.pointerId !== press.id) return
        const lifted = press.lifted
        press = null
        if (lifted) {
          reaction = null
          step()
        }
      }

      /**
       * The reader is at the page: a sleeping whale wakes up, startled unless
       * stillness was asked for. The hook fires once at the wake (a quiet
       * reader's pointer sweep only rewrites quietSince), so the scheduler's
       * pointer and key paths stay cheap.
       */
      function onActivity() {
        quietSince = Date.now()
        if (!asleep) return
        asleep = false
        waking = !motionReduced()
        step()
      }

      /** The page shows no stand: the whale leaves it, and its reading stops. */
      function release() {
        if (timer !== null) clearTimeout(timer)
        timer = null
        if (animation !== null) {
          animation.cancel()
          animation = null
        }
        if (root !== null && root.parentNode !== null) root.parentNode.removeChild(root)
        setAnchor(null, null)
        if (signals !== null) signals.dispose()
        signals = null
        sessionId = null
        level = null
        moment = null
        queued = null
        reaction = null
        extra = null
        waking = false
        asleep = false
        nextExtraAt = 0
        current = null
        press = null
        clicks = []
      }

      function dispose() {
        alive = false
        release()
        for (const url of objectUrls) URL.revokeObjectURL(url)
        objectUrls.length = 0
        sheetUrls.clear()
        root = null
        sprite = null
        strip = null
      }

      return { sync, release, onActivity, dispose }
    }
