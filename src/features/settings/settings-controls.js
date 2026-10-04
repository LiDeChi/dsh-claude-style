    /**
     * The settings page's controls: the segmented control, the switch, the row
     * shell and the indented sub-row. Every tab builds its rows from these, so
     * the page reads as one control set whichever tab is open.
     *
     * The segmented controls reuse the shared `.dsh-claude-segments` /
     * `.dsh-claude-segment` classes and sliding highlight — the same control the
     * composer's permission picker uses — so the two read as one design instead
     * of two lookalikes.
     */
    /**
     * One segmented control on the page, carrying the shared sliding highlight
     * (src/shared/sliding-pill.js). The group is React's, so the pill is
     * placed from a layout effect after every render — before the frame is
     * painted — and taken off when the group unmounts. `role` defaults to a
     * plain group; the tab strip passes `tablist`.
     */
    function ClaudeStyleSegmentGroup(props) {
      const group = React.useRef(null)
      const pill = React.useRef(null)
      React.useLayoutEffect(() => {
        pill.current = createSlidingPill('[data-active]')
        return () => {
          pill.current.release()
          pill.current = null
        }
      }, [])
      React.useLayoutEffect(() => {
        pill.current.sync(group.current)
      })
      const className = props.className ? `${SEGMENTS_CLASS} ${props.className}` : SEGMENTS_CLASS
      return React.createElement('div', { ref: group, className, role: props.role || 'group' }, props.children)
    }

    /**
     * The control builders. They hold no state of their own: every value and
     * every write arrives through the arguments, so one set serves every tab.
     * @returns { segment, toggle, row, subRow }.
     */
    function createSettingsControls() {
      /**
       * A segmented control. `disabled` greys the whole group out and stops it
       * answering (a sub-row whose parent is off).
       */
      function segment(options, active, onPick, disabled) {
        const buttons = []
        for (let i = 0; i < options.length; i++) {
          buttons.push(React.createElement(
            'button',
            {
              key: options[i].value,
              type: 'button',
              className: SEGMENT_CLASS,
              disabled: disabled === true,
              'data-active': options[i].value === active ? '' : undefined,
              'aria-pressed': options[i].value === active ? 'true' : 'false',
              onClick: (value => () => {
                if (value !== active) onPick(value)
              })(options[i].value),
            },
            options[i].label,
          ))
        }
        return React.createElement(ClaudeStyleSegmentGroup, null, buttons)
      }

      /** An on/off switch. */
      function toggle(on, onPick, disabled) {
        return React.createElement(
          'button',
          {
            type: 'button',
            className: 'dsh-claude-settings-switch',
            role: 'switch',
            disabled: disabled === true,
            'aria-checked': on ? 'true' : 'false',
            'data-on': on ? '' : undefined,
            onClick() { onPick(!on) },
          },
          React.createElement('span', { className: 'dsh-claude-settings-switch-knob' }),
        )
      }

      /**
       * One row: title and description on the left, the control on the right.
       * A block row stacks its control under the text across the row's full
       * width.
       */
      function row(key, title, description, control, block) {
        return React.createElement(
          'div',
          { className: block ? 'dsh-claude-settings-row dsh-claude-settings-row-block' : 'dsh-claude-settings-row', key },
          React.createElement(
            'div',
            { className: 'dsh-claude-settings-row-text' },
            React.createElement('div', { className: 'dsh-claude-settings-row-title' }, title),
            React.createElement('div', { className: 'dsh-claude-settings-row-desc' }, description),
          ),
          control,
        )
      }

      /**
       * A row that belongs to the row above it: indented under its parent, and
       * disabled while the parent is off. The control is built by the caller
       * with the same `disabled` flag, so it also refuses the keyboard.
       */
      function subRow(key, title, description, control, enabled) {
        return React.createElement(
          'div',
          {
            className: 'dsh-claude-settings-row dsh-claude-settings-row-sub',
            key,
            'aria-disabled': enabled ? undefined : 'true',
            'data-disabled': enabled ? undefined : '',
          },
          React.createElement(
            'div',
            { className: 'dsh-claude-settings-row-text' },
            React.createElement('div', { className: 'dsh-claude-settings-row-title' }, title),
            React.createElement('div', { className: 'dsh-claude-settings-row-desc' }, description),
          ),
          control,
        )
      }

      return { segment, toggle, row, subRow }
    }
