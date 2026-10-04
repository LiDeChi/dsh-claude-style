    /**
     * A one-shot JSON resource the host half serves (the model copy document,
     * the OS user, the HDSL contract): one GET per arming, the answer adopted
     * into the caller's own state, and a listener list told once that happens.
     *
     * The fetch is armed by load(); a failure means the host half did not
     * answer, and the caller's defaults simply stay (docs/architecture.md D12
     * — a Promise rejection that says "the host half did not answer"). reset()
     * re-arms the resource: a new host context is a new machine, so the next
     * load() fetches again.
     *
     * @param route - the host route to GET.
     * @param adopt - `adopt(data)` stores what the answer carries and returns
     *   the value listeners are called with, or undefined when the answer is
     *   not usable (nothing is adopted, no listener hears anything).
     * @returns `{ load, onLoaded, reset }`.
     */
    function createHostResource(route, adopt) {
      let requested = false
      const listeners = []

      function load() {
        if (requested) return
        requested = true
        fetch(route, { credentials: 'same-origin' })
          .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.json()
          })
          .then(data => {
            const value = adopt(data)
            if (value !== undefined) notifyAll(listeners, value)
          }, () => { /* the host half did not answer: the caller's defaults stay */ })
      }

      /** Register a listener for the adoption; the returned call removes it. */
      function onLoaded(listener) {
        listeners.push(listener)
        return () => {
          const index = listeners.indexOf(listener)
          if (index !== -1) listeners.splice(index, 1)
        }
      }

      /** Re-arm: the next load() fetches again (a new host context). */
      function reset() {
        requested = false
      }

      return { load, onLoaded, reset }
    }
