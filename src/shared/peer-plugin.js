    /**
     * The other chat-behaviour plugin, when this page runs it.
     *
     * dsh-chat-ux implements the same chat-area interactions this skin ports
     * (docs/architecture.md D32): the same fold doors over the same clicks, the
     * same two seat keys at the same priority, the same token fade, the same
     * drawn caret. Two implementations of one behaviour on one page do not
     * merge — the fold doors both intercept the click and replay it at each
     * other, and the second seat registration at one priority throws. So while
     * that plugin is on the page the ported features stand down whole, and the
     * settings page says who took them over.
     *
     * Two signals, either one is enough:
     *
     *   boot    the host's own entry list (`window.__DSH_BOOT__.entries`), which
     *           names every installed client entry before any of them runs, so
     *           the answer holds from the first frame whichever plugin's bundle
     *           the loader evaluates first.
     *   style   the stylesheet that plugin keeps in the head while its browser
     *           half is live. Its own half mounts and removes it, so a plugin
     *           hot reload in either direction shows up here — which the boot
     *           list, fixed at load, cannot report.
     *
     * The boot list is read once, since it does not change after load. The
     * stylesheet is asked on every call, and while anybody is subscribed its
     * arrival or departure is noticed: an observer on the head's child list (the
     * element is mounted there) re-asks the question and, when the answer
     * changed, re-runs the environment — the preferences' own listeners for the
     * features that stand down by reading a preference, and this module's
     * subscribers for the one that claims host seat keys, which no preference
     * read can hand back (features/chat-files/).
     *
     * The observer lives only while something is subscribed, and it is the third
     * exception to the single-scheduler rule (docs/architecture.md D6): the head
     * is outside the scheduler's `<body>` subtree, and what it waits for is one
     * element appearing or going.
     */
    /** The other plugin's id, as its entry appears in the boot list. */
    const PEER_ENTRY_ID = 'dsh-chat-ux'
    /** The `<style>` its browser half mounts while it is live. */
    const PEER_STYLE_ID = 'dsh-chat-ux-style'

    /** The boot list's answer, and whether it has been read. */
    let peerEntrySeen = false
    let peerEntryRead = false
    /** The answer the last announcement carried; null before the first one. */
    let peerAnnounced = null
    /** Who hears about the answer changing. */
    const peerListeners = []
    /** The head observer, while at least one listener is subscribed. */
    let peerObserver = null

    /**
     * Whether dsh-chat-ux is installed on this page right now.
     * @returns true while the ported chat features must stand down.
     */
    function dshChatUxPresent() {
      if (document.getElementById(PEER_STYLE_ID) !== null) return true
      if (peerEntryRead) return peerEntrySeen
      peerEntryRead = true
      const entries = window.__DSH_BOOT__?.entries
      peerEntrySeen = Array.isArray(entries)
        && entries.some(entry => typeof entry?.id === 'string' && entry.id.includes(PEER_ENTRY_ID))
      return peerEntrySeen
    }

    /**
     * Ask the question again and, when the answer moved, say so.
     *
     * What is compared is the answer last announced, not a snapshot of the head:
     * the head changes for many reasons (a stylesheet of anybody's), and only
     * this plugin's own presence is news.
     */
    function checkPeerPresence() {
      const present = dshChatUxPresent()
      if (present === peerAnnounced) return
      peerAnnounced = present
      notifyAll(peerListeners, present)
      // The features that stand down by reading a preference hear about it
      // through the stream they already subscribe to; the one that claims seat
      // keys registers again on its own subscription above.
      notifyEnvironmentChange()
    }

    /**
     * Hear about dsh-chat-ux arriving on or leaving the page.
     *
     * @param listener - called with the new answer, only when it changes.
     * @returns unsubscribe.
     */
    function subscribePeerPresence(listener) {
      peerListeners.push(listener)
      if (peerObserver === null) {
        peerObserver = new MutationObserver(checkPeerPresence)
        peerObserver.observe(document.head, { childList: true })
        peerAnnounced = dshChatUxPresent()
      }
      return () => {
        const at = peerListeners.indexOf(listener)
        if (at >= 0) peerListeners.splice(at, 1)
        if (peerListeners.length > 0 || peerObserver === null) return
        peerObserver.disconnect()
        peerObserver = null
      }
    }
