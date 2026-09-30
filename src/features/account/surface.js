    /**
     * The account surface: one row model, two mount points.
     *
     * A host with an account area (Desktop 0.1.7+) owns the entry — its own
     * account row, restyled by the stylesheet, opens its own account menu. The
     * host renders that menu's list itself and unmounts it on close, so this
     * surface re-identifies the list every pass and injects our container at its
     * head: the first child INSIDE the list, never a sibling of the host's rows.
     * The list is content-matched (account/host-menu.js), so the permission
     * control's menu and the model picker's submenu are never touched.
     *
     * A host without one (Web) gets a self-built trigger and popover
     * (account-footer.js); that popover's body is the container.
     *
     * A closed list leaves no reference behind: the next open builds a fresh
     * container. A host re-render that merely empties the list is healed by
     * re-inserting the node we still hold, so our rows survive it unchanged.
     */
    function createAccountSurface(options) {
      let mode = null
      let hostContainer = null
      /** The open account menu, marked for the stylesheet. */
      const menuStamp = createStamp(ACCOUNT_MENU_ATTR)

      function detect() {
        return options.hostTrigger() !== null ? 'host' : 'synthetic'
      }

      function container() {
        return mode === 'host' ? hostContainer : options.syntheticContainer()
      }

      /**
       * Stamp the open account menu so the stylesheet can tell the host's
       * hashed card from its other menus, and clear the stamp when it is gone.
       * Value-change only: the attribute is written on the transition, never
       * once per pass. The transition is also reported to the caller, which
       * binds its hover behaviour on the menu the host has just mounted.
       */
      function markMenu(menu) {
        if (menuStamp.current() === menu) return
        menuStamp.mark(menu)
        if (options.onMenu) options.onMenu(menu)
      }

      /**
       * Reveal the host's card once it is the card the reader will see.
       *
       * The host mounts its card with its own rows and places it from that
       * geometry; our container lands a frame later, the card grows, and the host
       * re-places it on the frame after the list changed. Revealing on the mount
       * frame would fade the card in at the height and the place it is about to
       * leave, so the stylesheet holds it (the armed window, constants.js) until
       * our rows are in the list AND its placement has stopped moving — a
       * placement read twice with the same value, after the rows landed. A card
       * that carries no inline placement has nothing to wait for and is revealed
       * as soon as the rows are in; one that never settles is revealed at the
       * bound rather than staying unpainted. The watch stops with the card.
       */
      function revealMenu(menu) {
        if (menu.hasAttribute(ACCOUNT_READY_ATTR)) return
        let lastTop = null
        let stable = 0
        let tries = 0
        const look = () => {
          if (!menu.isConnected || menu.hasAttribute(ACCOUNT_READY_ATTR)) return
          const rows = hostContainer !== null && hostContainer.isConnected && hostContainer.childElementCount > 0
          const top = menu.style.top
          stable = rows && top !== '' && top === lastTop ? stable + 1 : 0
          lastTop = top
          if (stable >= 1 || (rows && top === '') || tries >= 10) {
            menu.setAttribute(ACCOUNT_READY_ATTR, '')
            return
          }
          tries += 1
          requestAnimationFrame(look)
        }
        requestAnimationFrame(look)
      }

      function syncHost() {
        const menu = options.findMenu()
        if (menu === null) {
          // Closed: the host unmounted the list, and our node is dead to us.
          markMenu(null)
          hostContainer = null
          return
        }
        markMenu(menu)
        const viewport = options.menuViewport(menu)
        if (viewport === null) {
          hostContainer = null
          revealMenu(menu)
          return
        }
        if (hostContainer === null) hostContainer = options.buildContainer()
        // Re-insert whenever the host has moved or dropped us. This is the
        // self-heal, and it is also what keeps our container first.
        if (viewport.firstChild !== hostContainer) viewport.insertBefore(hostContainer, viewport.firstChild)
        revealMenu(menu)
      }

      function sync() {
        const next = detect()
        if (next !== mode) {
          mode = next
          hostContainer = null
          options.onMode(mode)
        }
        if (mode === 'host') syncHost()
      }

      return {
        mode() { return mode },
        container,
        clearMenu() { markMenu(null) },
        sync
      }
    }
