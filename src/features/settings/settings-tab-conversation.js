    /**
     * The settings page's Conversation tab: the turn status line, the ported
     * chat-area interactions and the Chat / Trajectory tab strip.
     *
     * While dsh-chat-ux is on the page the ported rows show the reader's own
     * answer with the control disabled and a line saying who owns the behaviour
     * right now: that plugin implements the same interactions, and these
     * features stand down whole for as long as it is there
     * (src/shared/peer-plugin.js, docs/architecture.md D32). Nothing is written
     * to the stored preference, so the switch already says what will happen the
     * moment that plugin goes away.
     */
    function createSettingsConversationTab() {
      function rows(view) {
        const prefs = view.prefs
        const write = view.write
        const controls = view.controls
        const caretOptions = [
          { value: CARET_MOTION_TYPING, label: settingsCopy('caretTyping', 'Every move') },
          { value: CARET_MOTION_MOVE, label: settingsCopy('caretMove', 'Explicit moves') },
          { value: CARET_MOTION_OFF, label: settingsCopy('caretOff', 'Off') },
        ]
        /** dsh-chat-ux on the page: its own copy of these interactions is the live one. */
        const takenOver = dshChatUxPresent()
        /**
         * One row's description. The reader's own text stays as it is; the line
         * naming the owner is added below it, in the accent colour, so a row
         * that refuses input says why where the eye already is.
         */
        const desc = (key, fallback) => {
          const text = settingsCopy(key, fallback)
          if (!takenOver) return text
          return [
            text,
            React.createElement('span', { key: 'managed', className: 'dsh-claude-settings-row-managed' },
              settingsCopy('chatUxManaged', 'Managed by dsh-chat-ux')),
          ]
        }
        /** A switch: the reader's own answer, refusing input while the other plugin owns the behaviour. */
        const peerToggle = (on, onPick) => controls.toggle(on, onPick, takenOver)
        return [
          controls.row(
            'turnStatus',
            settingsCopy('turnStatusTitle', 'Turn status line'),
            settingsCopy('turnStatusDesc', 'Move the status of a running, stopped or failed turn to the end of the turn\'s work, with the elapsed time, the output tokens and what the model is doing. Off restores the host\'s turn status.'),
            controls.toggle(prefs.turnStatus, value => { write({ turnStatus: value }) }),
          ),
          controls.row(
            'chatFollow',
            settingsCopy('chatFollowTitle', 'Chat-area follow'),
            desc('chatFollowDesc', 'Keeps the conversation following its newest line as an answer grows, instead of stopping just short of the bottom, and catches up the same way inside a scrolling work log. It glides there rather than jumping. Off keeps the host\'s own scrolling.'),
            peerToggle(prefs.enhancedFollow, value => { write({ enhancedFollow: value }) }),
          ),
          controls.row(
            'autoFold',
            settingsCopy('autoFoldTitle', 'Automatic folding'),
            desc('autoFoldDesc', 'Opens the thinking row while the model reasons and folds it back when it stops, opens a piece of work while it runs and folds it back when that step ends, and rolls a row open or shut when you press it. A row you pressed yourself keeps what you chose. Off snaps rows open and shut the way the host does.'),
            peerToggle(prefs.autoFold, value => { write({ autoFold: value }) }),
          ),
          controls.row(
            'tokenFade',
            settingsCopy('tokenFadeTitle', 'Fade in new text'),
            desc('tokenFadeDesc', 'New text appears few characters at a time, faint first and settling to its own colour, as if it were being written. A block that appears whole does not replay the fade. Off shows every character at full strength.'),
            peerToggle(prefs.tokenFade, value => { write({ tokenFade: value }) }),
          ),
          controls.row(
            'fileMutationRow',
            settingsCopy('fileRowTitle', 'File change rows'),
            desc('fileRowDesc', 'A write or edit run from inside a program is shown like a directly called one: the row carries the +n -m count and opens into the changed lines. When the change cannot be read from the call, the host\'s IN/OUT card stays.'),
            peerToggle(prefs.fileMutationRow, value => { write({ fileMutationRow: value }) }),
          ),
          controls.row(
            'sendFlight',
            settingsCopy('sendTitle', 'Send flight'),
            desc('sendDesc', 'On send, the composer lifts and narrows into the message bubble as it travels, landing where that message sits. With Animation set to Reduced it does not fly.'),
            peerToggle(prefs.sendFlight, value => { write({ sendFlight: value }) }),
          ),
          controls.row(
            'caretMotion',
            settingsCopy('caretTitle', 'Composer caret motion'),
            desc('caretDesc', 'The composer\'s caret is drawn by the plugin and glides between positions instead of jumping. Explicit moves glides only on an arrow key or a click, and lands instantly while typing.'),
            controls.segment(caretOptions, prefs.caretMotion, value => { write({ caretMotion: value }) }, takenOver),
          ),
          controls.row(
            'viewTabs',
            settingsCopy('viewTabsTitle', 'Chat / Trajectory tabs'),
            settingsCopy('viewTabsDesc', 'Redraw the Chat / Trajectory tab strip at the top of the conversation, lifted onto the title\'s line when it fits. Off restores the host\'s tab strip.'),
            controls.toggle(prefs.viewTabs, value => { write({ viewTabs: value }) }),
          ),
        ]
      }
      return { id: 'conversation', label: () => settingsCopy('tabConversation', 'Conversation'), rows }
    }
