    /**
     * The chat area's folding, ported from dsh-chat-ux: a thinking row stays open
     * while the model reasons and folds back once it stops (reasoning-fold.js), a
     * process group opens while its section runs and folds back when it ends
     * (process-fold.js), and a reader's own press on a row rolls the body down or
     * up instead of snapping it (fold-glide.js). All three ride the one
     * preference: it means "the skin may fold the chat area", so off leaves the
     * automatic folding and the door to the host.
     *
     * @param ctx - client context.
     * @param ui - shared handle table.
     * @returns teardown.
     */
    function installChatFold(ctx, ui) {
      /** The mounted pair and the glide, or null while the preference is off. */
      let stopFolds = null

      /**
       * Bring the whole feature in line with the preference: off, neither fold
       * module is mounted, the door answers no click and the page is not scanned
       * at all; on, all of it is. A flip needs no reload and no pass of its own.
       *
       * The door rides this same switch: it takes over the reader's clicks on a
       * folding row, which is a takeover of the host's interface like any other
       * (D29), so "off" has to leave the clicks alone as well. The follow guard
       * asks whether a door is rolling through `ui.chatFold`, which exists only
       * while the feature is mounted.
       *
       * dsh-chat-ux folds the same rows and intercepts the same clicks; while it
       * is on the page this stands down whole (src/shared/peer-plugin.js).
       */
      const syncFolds = () => {
        const wanted = !dshChatUxPresent() && readPrefs().chatAnimations !== false
        if (!wanted) {
          if (stopFolds !== null) {
            stopFolds()
            stopFolds = null
          }
          document.body.removeAttribute(CHAT_FOLD_ATTR)
          delete ui.chatFold
          return
        }
        document.body.setAttribute(CHAT_FOLD_ATTR, '')
        if (stopFolds !== null) return
        const stopReasoning = createReasoningFold()
        const stopProcess = createProcessFold()
        const stopGlide = installChatFoldGlide()
        ui.chatFold = { isBusy: isChatFoldBusy }
        stopFolds = () => {
          stopReasoning()
          stopProcess()
          stopGlide()
        }
      }
      syncFolds()
      const stopPrefs = subscribePrefs(syncFolds)
      return () => {
        stopPrefs()
        delete ui.chatFold
        if (stopFolds !== null) {
          stopFolds()
          stopFolds = null
        }
        document.body.removeAttribute(CHAT_FOLD_ATTR)
      }
    }
