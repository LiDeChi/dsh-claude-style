    /**
     * Ease a scroll container toward its end instead of writing the end position
     * in one frame.
     *
     * A capped process body is followed by the host with a native smooth scroll,
     * and the catch-up past that scroll's lag (process-follow.js) used to write
     * the end position outright: while text streams, that lands as a jump of
     * forty-odd pixels several times a second — the paragraph above the last
     * line is pushed up in one frame, which reads as the text snapping. So the
     * position is walked there instead, on a curve: every frame the distance
     * still to go shrinks by the same share.
     *
     * That share is why this is a curve and not a fixed-duration tween. The
     * target keeps moving while the answer grows: a tween restarted on every
     * change would stutter between restarts, and one that is not restarted falls
     * further behind with every line. A share per frame eases out, keeps up with
     * a moving target, and lands exactly on it.
     *
     * The frame's own interval drives the share, so a dropped frame covers more
     * ground rather than arriving late, and the loop exists only while something
     * is easing — the last arrival cancels it.
     */
    /** The time constant: about three of these cover 95% of the distance. */
    const SCROLL_EASE_TAU_MS = 55
    /**
     * Under this the position is put exactly on the end and the ease ends.
     *
     * A share-per-frame curve never quite arrives, so arrival is declared: two
     * pixels of scroll position is nothing an eye catches, and without it the
     * last stretch of every catch-up would crawl for another tenth of a second
     * and the loop would keep waking for it.
     */
    const SCROLL_EASE_DONE_PX = 2
    /** The longest frame interval the curve counts; past it the page was hidden or held up. */
    const SCROLL_EASE_MAX_FRAME_MS = 64
    /** One frame at 60 Hz, for the first frame of a run, which has no interval yet. */
    const SCROLL_EASE_NOMINAL_FRAME_MS = 16.7

    /** The elements easing now, each with the test that says whether it still should. */
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
      scrollEasing.set(element, wanted)
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
     * One frame of every ease in flight.
     * @param now - this frame's timestamp.
     */
    function stepScrollEase(now) {
      scrollEaseFrame = 0
      const interval = scrollEaseLastAt === 0
        ? SCROLL_EASE_NOMINAL_FRAME_MS
        : Math.min(SCROLL_EASE_MAX_FRAME_MS, Math.max(0, now - scrollEaseLastAt))
      scrollEaseLastAt = now
      const share = 1 - Math.exp(-interval / SCROLL_EASE_TAU_MS)
      for (const [element, wanted] of scrollEasing) {
        // A container that left the document, or one the reader has taken over,
        // is done here: the loop never scrolls what nobody is following.
        if (!element.isConnected || !wanted()) {
          scrollEasing.delete(element)
          continue
        }
        const target = element.scrollHeight - element.clientHeight
        const gap = target - element.scrollTop
        if (Math.abs(gap) <= SCROLL_EASE_DONE_PX) {
          element.scrollTop = target
          scrollEasing.delete(element)
          continue
        }
        const before = element.scrollTop
        element.scrollTop = before + gap * share
        // The container's real end can sit a few pixels inside the arithmetic
        // one — a child's clipped overflow, a scrollbar's rounding — and the
        // write is then clamped: a frame that moved nothing has arrived, whatever
        // the sum says, and the loop must not keep waking for it.
        if (element.scrollTop === before) scrollEasing.delete(element)
      }
      if (scrollEasing.size === 0) return
      scrollEaseFrame = requestAnimationFrame(stepScrollEase)
    }
