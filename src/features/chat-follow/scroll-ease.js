    /**
     * Ease a scroll container toward its end instead of writing the end position
     * in one frame.
     *
     * A capped process body is followed by the host with a native smooth scroll,
     * and the catch-up past that scroll's lag (process-follow.js) used to write
     * the end position outright: while text streams, that lands as a jump of
     * forty-odd pixels several times a second — the paragraph above the last
     * line is pushed up in one frame, which reads as the text snapping. So the
     * position is walked there instead, on a curve.
     *
     * The curve is a critically damped spring, integrated a frame at a time:
     *
     *     acceleration = ω² × gap − 2ω × velocity
     *
     * A spring is what this target needs, because the target moves. The earlier
     * curve here — shrink the gap by a fixed share every frame, capped at a top
     * speed — reached its speed in the very first frame: a forty-pixel
     * catch-up opened at six hundred-odd pixels a second, and a stream crosses
     * the catch-up threshold several times a second, so the motion read as a
     * series of darts. The spring's velocity is continuous instead: every
     * catch-up leaves from rest, peaks early (a forty-pixel gap tops out under
     * three hundred pixels a second) and arrives without overshoot, and a
     * target that grows mid-flight is just a wider gap on the next frame — no
     * restart, no stutter between restarts.
     *
     * The top speed stays: a burst of several hundred pixels would otherwise
     * peak at several thousand pixels a second, past what an eye follows.
     * Clamped, the burst accelerates into one steady glide (about the browser's
     * own smooth scroll), and the spring takes the deceleration back once the
     * remaining gap is short: the clamp comes off at a gap of e × cap / ω, and
     * from there on the spring carries less speed than ω × gap — exactly the
     * condition under which a critically damped spring cannot overshoot.
     *
     * The frame's own interval drives the integration, so a dropped frame
     * covers more ground rather than arriving late, and the loop exists only
     * while something is easing — the last arrival cancels it.
     */
    /**
     * The spring's angular frequency, a critical damping of 1 being implied.
     * Twenty a second covers 95% of the distance in about a quarter of a second
     * (the cover is 4.74/ω), and a forty-pixel catch-up peaks at ω × gap / e —
     * under three hundred pixels a second.
     */
    const SCROLL_EASE_OMEGA = 20
    /**
     * The fastest the position moves, in pixels a second: about what the
     * browser's own smooth scroll uses, which is the pace a reader already reads
     * a long jump at. Past it the motion reads as a blur.
     */
    const SCROLL_EASE_MAX_SPEED_PX_S = 1800
    /**
     * Beyond this the position is not catching up with text but going somewhere
     * else — a session switch, a page of history being restored — and is put
     * there at once: gliding a screenful would only make the reader wait.
     */
    const SCROLL_EASE_JUMP_PX = 1200
    /**
     * Under this the position is put exactly on the end and the ease ends.
     *
     * A spring's tail never quite arrives, so arrival is declared: two pixels
     * of scroll position is nothing an eye catches, and without it the last
     * stretch of every catch-up would crawl for another tenth of a second and
     * the loop would keep waking for it.
     */
    const SCROLL_EASE_DONE_PX = 2
    /** The longest frame interval the curve counts; past it the page was hidden or held up. */
    const SCROLL_EASE_MAX_FRAME_MS = 64
    /** One frame at 60 Hz, for the first frame of a run, which has no interval yet. */
    const SCROLL_EASE_NOMINAL_FRAME_MS = 16.7

    /** The elements easing now, each with the test that says whether it still should and the speed it is carrying. */
    const scrollEasing = new Map()
    /** The shared frame; 0 when nothing is easing. */
    let scrollEaseFrame = 0
    /** The previous frame's timestamp, for the interval. */
    let scrollEaseLastAt = 0

    /**
     * Start (or keep) easing this element's position to its end.
     *
     * @param element - the scroll container.
     * @param wanted - asked every frame; false ends this element's ease where it is.
     */
    function easeScrollToEnd(element, wanted) {
      // A run already in flight keeps the speed it is carrying: the re-arm is
      // for re-reading the test, and zeroing the speed would re-do the take-off
      // the spring exists to avoid.
      const active = scrollEasing.get(element)
      scrollEasing.set(element, {
        wanted,
        velocity: active === undefined ? 0 : active.velocity,
        // Carried across a re-arm, like the velocity: it is a reading of where
        // this run has the position, and a fresh 0 would read as one written
        // long ago (see scrollEasePosition).
        lastWritten: active === undefined ? null : active.lastWritten,
      })
      if (scrollEaseFrame !== 0) return
      scrollEaseLastAt = 0
      scrollEaseFrame = requestAnimationFrame(stepScrollEase)
    }

    /** End this element's ease, leaving the position where it is. */
    function stopScrollEase(element) {
      scrollEasing.delete(element)
    }

    /**
     * Whether this element is being eased right now.
     * @param element - the scroll container.
     */
    function isScrollEasing(element) {
      return scrollEasing.has(element)
    }

    /**
     * The position the ease last wrote on this element, or null while it is not
     * easing on it.
     *
     * The stream glide (chat-follow.js) reads it to tell the host's pin apart
     * from the spring's own step inside one frame: the host writes the end
     * outright the moment content grows, and the distance that write added has
     * to go back to the spring instead of painting.
     * @param element - the scroll container.
     */
    function scrollEasePosition(element) {
      const ease = scrollEasing.get(element)
      return ease === undefined ? null : ease.lastWritten
    }

    /**
     * One frame of every ease in flight.
     * @param now - this frame's timestamp.
     */
    function stepScrollEase(now) {
      scrollEaseFrame = 0
      const interval = scrollEaseLastAt === 0
        ? SCROLL_EASE_NOMINAL_FRAME_MS
        : Math.min(SCROLL_EASE_MAX_FRAME_MS, Math.max(0, now - scrollEaseLastAt))
      scrollEaseLastAt = now
      const seconds = interval / 1000
      for (const [element, ease] of scrollEasing) {
        // A container that left the document, or one the reader has taken over,
        // is done here: the loop never scrolls what nobody is following.
        if (!element.isConnected || !ease.wanted()) {
          scrollEasing.delete(element)
          continue
        }
        const target = element.scrollHeight - element.clientHeight
        const gap = target - element.scrollTop
        if (Math.abs(gap) <= SCROLL_EASE_DONE_PX) {
          element.scrollTop = target
          ease.lastWritten = element.scrollTop
          scrollEasing.delete(element)
          continue
        }
        // Somewhere else entirely, not a catch-up: at once, and no glide.
        if (Math.abs(gap) > SCROLL_EASE_JUMP_PX) {
          element.scrollTop = target
          ease.lastWritten = element.scrollTop
          scrollEasing.delete(element)
          continue
        }
        // Semi-implicit Euler: the velocity steps first and the position follows
        // it — the order that keeps a stiff spring stable across a long frame.
        let velocity = ease.velocity
          + (SCROLL_EASE_OMEGA * SCROLL_EASE_OMEGA * gap - 2 * SCROLL_EASE_OMEGA * ease.velocity) * seconds
        velocity = Math.max(-SCROLL_EASE_MAX_SPEED_PX_S, Math.min(SCROLL_EASE_MAX_SPEED_PX_S, velocity))
        const step = velocity * seconds
        const before = element.scrollTop
        // A step that would cross the end lands on it instead: the asymptotic
        // tail is not worth another wake, and a spiked interval must not carry
        // the position past the target.
        if (Math.abs(step) >= Math.abs(gap)) {
          element.scrollTop = target
          ease.lastWritten = element.scrollTop
          scrollEasing.delete(element)
          continue
        }
        ease.velocity = velocity
        element.scrollTop = before + step
        ease.lastWritten = element.scrollTop
        // The container's real end can sit a few pixels inside the arithmetic
        // one — a child's clipped overflow, a scrollbar's rounding — and the
        // write is then clamped: a frame that moved nothing has arrived, whatever
        // the sum says, and the loop must not keep waking for it.
        if (element.scrollTop === before) scrollEasing.delete(element)
      }
      if (scrollEasing.size === 0) return
      scrollEaseFrame = requestAnimationFrame(stepScrollEase)
    }
