    /**
     * The mascot on the composer: Claude Code's pixel crab
     * (src/features/mascot/crab.js) or Deepy, the DeepSeek brand's pixel whale
     * (src/features/mascot/whale.js), both played by the agent's state
     * (src/features/mascot/mascot-player.js).
     *
     * Which one is out is the mascot preference, resolved onto <body> as
     * MASCOT_ATTR: "follow the brand" puts the crab under Claude and Deepy
     * under DeepSeek, and the reader may pick either, or none. Where it stands
     * is the "where it appears" preference: the home page alone, or the home
     * page and the conversation. The other character is released, so only one
     * mascot is ever on the page.
     *
     * @param ctx - client context.
     * @param ui - shared handle table.
     * @returns teardown.
     */
    function installMascot(ctx, ui) {
      const crab = createMascotCrab(ctx, ui)
      const whale = createMascotWhale(ctx, ui)

      function sync() {
        const prefs = readPrefs()
        const mascot = resolveMascot(prefs)
        const conversation = prefs.mascotScope === MASCOT_SCOPE_ALL
        if (mascot === MASCOT_CRAB) crab.sync(conversation)
        else crab.release()
        if (mascot === MASCOT_DEEPY) whale.sync(conversation)
        else whale.release()
      }

      function onActivity() {
        crab.onActivity()
        whale.onActivity()
      }

      ui.mascot = { sync, onActivity }

      return () => {
        crab.dispose()
        whale.dispose()
        delete ui.mascot
      }
    }
