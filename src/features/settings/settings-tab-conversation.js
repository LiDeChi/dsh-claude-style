    /**
     * The settings page's Conversation tab: the turn status line and the
     * Chat / Trajectory tab strip.
     */
    function createSettingsConversationTab() {
      function rows(view) {
        const prefs = view.prefs
        const write = view.write
        const controls = view.controls
        return [
          controls.row(
            'turnStatus',
            settingsCopy('turnStatusTitle', 'Turn status line'),
            settingsCopy('turnStatusDesc', 'Move the status of a running, stopped or failed turn to the end of the turn\'s work, with the elapsed time, the output tokens and what the model is doing. Off restores the host\'s turn status.'),
            controls.toggle(prefs.turnStatus, value => { write({ turnStatus: value }) }),
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
