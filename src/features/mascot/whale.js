    /**
     * Deepy, the DeepSeek brand's pixel whale, as a mascot character
     * (src/features/mascot/mascot-player.js plays it; src/features/mascot/
     * mascot.js decides which mascot is out).
     *
     * Its animations are Deepy's Clawd on Desk theme (DEEPY_SHEETS): between
     * jobs it looks around or spouts now and then. The sheets are too large to
     * ride the bundle, so each loads from the host half the first time its
     * animation is wanted, rebuilt as a vector and cached (whale-sheets.js).
     *
     * @param ctx - client context.
     * @param ui - shared handle table (`ui.composer`).
     * @returns `{ sync, release, onActivity, dispose }`.
     */
    function createMascotWhale(ctx, ui) {
      return createMascotPlayer(ctx, ui, {
        name: 'deepy',
        sheets: DEEPY_SHEETS,
        frameMs: DEEPY_FRAME_MS,
        extras: ['idle-look', 'idle-spout'],
        createSheets(onReady) {
          const sheets = createMascotWhaleSheets(onReady)
          return {
            ready: sheets.ready,
            failed: sheets.failed,
            paint(style, key) {
              style.setProperty('--dsh-claude-deepy-sheet', `url("${sheets.url(key)}")`)
            },
            dispose: sheets.dispose,
          }
        },
      })
    }
