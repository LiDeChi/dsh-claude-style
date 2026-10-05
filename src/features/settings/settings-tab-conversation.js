    /**
     * The settings page's Conversation tab: the turn status line, the ported
     * chat-area interactions and the Chat / Trajectory tab strip.
     *
     * The ported rows are shown as off and greyed out while dsh-chat-ux is on
     * the page: that plugin implements the same interactions, and these features
     * stand down whole for as long as it is there (src/shared/peer-plugin.js,
     * docs/architecture.md D32). Nothing is written to the stored preference —
     * the reader's own answers come back the moment that plugin goes away.
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
        /** One row's description, with the hand-over said where the switch is. */
        const desc = (key, fallback) => {
          const text = settingsCopy(key, fallback)
          if (!takenOver) return text
          return text + ' ' + settingsCopy('chatUxTakenOver', 'dsh-chat-ux is installed, so it provides this and the switch stays off until that plugin is removed.')
        }
        /** A switch: off and refusing while the other plugin owns the behaviour. */
        const peerToggle = (on, onPick) => controls.toggle(takenOver ? false : on, onPick, takenOver)
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
            desc('chatFollowDesc', 'At the structural moments (a thinking row folding, a tool call arriving) hand a reader at the bottom back to the host\'s follow, and keep thinking and tool output from falling behind inside a capped process group. Off leaves the host\'s follow as it is.'),
            peerToggle(prefs.enhancedFollow, value => { write({ enhancedFollow: value }) }),
          ),
          controls.row(
            'autoFold',
            settingsCopy('autoFoldTitle', 'Automatic folding'),
            desc('autoFoldDesc', 'Open a thinking row while the model is reasoning and fold it back when it stops; open a running process group and fold it back once that piece of work ends (the Detailed and Fully expanded tiers do not cap a body and are never touched), and roll a body open or shut when the reader presses its row. A row or group the reader has pressed himself keeps what he chose for that phase. Off leaves the chat area to the host.'),
            peerToggle(prefs.autoFold, value => { write({ autoFold: value }) }),
          ),
          controls.row(
            'tokenFade',
            settingsCopy('tokenFadeTitle', 'Fade in new text'),
            desc('tokenFadeDesc', 'Characters arriving in a streaming answer appear faint and settle to their own colour over about a tenth of a second, staggered slightly. A burst of thousands of characters at once, a page-loading block of history and a text that just reflowed from a fold all stay solid. Off shows every character at full strength.'),
            peerToggle(prefs.tokenFade, value => { write({ tokenFade: value }) }),
          ),
          controls.row(
            'fileMutationRow',
            settingsCopy('fileRowTitle', 'File change rows'),
            desc('fileRowDesc', 'A write or edit dispatched from inside a run_code program is shown like the host shows a directly called one: the row carries the +n -m tail and expands into the diff card. A call whose changed text cannot be derived keeps the host\'s IN/OUT card.'),
            peerToggle(prefs.fileMutationRow, value => { write({ fileMutationRow: value }) }),
          ),
          controls.row(
            'sendFlight',
            settingsCopy('sendTitle', 'Send flight'),
            desc('sendDesc', 'When a message is submitted, the composer card lifts as it is and narrows into the bubble as it travels, carrying the words in the draft, then lands on the message row. Nothing is flown when the animation choice is Reduced, when the two ends are not on one screen, or when the origin cannot be read (a shortcut or a programmatic submission).'),
            peerToggle(prefs.sendFlight, value => { write({ sendFlight: value }) }),
          ),
          controls.row(
            'caretMotion',
            settingsCopy('caretTitle', 'Composer caret motion'),
            desc('caretDesc', 'Draw the composer\'s text caret in place of the browser\'s, so moving it can glide: every move transitions typing too, explicit moves only transitions an arrow key or a click (typing lands instantly), and off leaves the browser\'s own caret alone. A question card\'s answer box and a queued message\'s inline editor are covered as well.'),
            takenOver
              ? controls.segment(caretOptions, CARET_MOTION_OFF, value => { write({ caretMotion: value }) }, true)
              : controls.segment(caretOptions, prefs.caretMotion, value => { write({ caretMotion: value }) }),
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
