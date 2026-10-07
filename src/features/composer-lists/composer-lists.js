    /** The one marker shape list editing reads: 1 indent, 2 bullet, 3 number, 4 delimiter, 5 space, 6 content (D51). */
    const COMPOSER_LIST_LINE = /^([\t ]*)(?:([-+*•])|(\d{1,9})([.),，、]))([\t ]+)(.*)$/

    /** Markdown list editing uses the host's insertion actions so draft, chips and undo stay owned by the editor. */
    function installComposerLists(ctx, ui) {
      function inputFor(root) {
        if (!ui.composer?.isActive() || !root.isContentEditable) return null
        const resolver = ctx.get('conversation')?.input
        if (typeof resolver?.for !== 'function') return null
        const sessions = ctx.get('sessions')
        if (!sessions) return null
        const id = currentSessionId(ctx, sessions)
        const binding = typeof id === 'string' ? sessions.binding(id) : null
        const input = binding?.ctx ? resolver.for(binding.ctx) : null
        if (input?.editor?.getRootElement() !== root || typeof input.actions?.captureInsertion !== 'function') return null
        return input
      }

      function lineAt(text, offset) {
        const start = text.slice(0, offset).lastIndexOf('\n') + 1
        const next = text.indexOf('\n', offset)
        const end = next === -1 ? text.length : next
        const line = text.slice(start, end)
        const marker = COMPOSER_LIST_LINE.exec(line)
        return { start, end, line, marker }
      }

      // Enter inside a numbered item pushes the items below it down, and a deletion pulls them up,
      // so their numbers travel with the text. The run stops at the first line that is not the
      // plain successor of the line before it, which keeps restarts and deliberate gaps (D51).
      function shiftRun(text, start, indent, delimiter, expect, next) {
        const lines = []
        let at = start
        let end = start
        while (at < text.length) {
          const stop = text.indexOf('\n', at)
          const lineEnd = stop === -1 ? text.length : stop
          const marker = COMPOSER_LIST_LINE.exec(text.slice(at, lineEnd))
          if (!marker || marker[3] === undefined || marker[1] !== indent || marker[4] !== delimiter || Number(marker[3]) !== expect) break
          lines.push(`${marker[1]}${next}${marker[4]}${marker[5]}${marker[6]}`)
          expect += 1
          next += 1
          end = lineEnd
          at = stop === -1 ? text.length : stop + 1
        }
        return lines.length === 0 ? null : { end, text: lines.join('\n') }
      }

      // The items a removal took out of a numbered sequence: the first number it held and how many
      // it held. A removal of unrelated lines leaves a list alone, because those lines carry no
      // number at this level and the count never starts (D51).
      function removedRun(text, from, to, indent, delimiter) {
        let at = from
        let first = 0
        let count = 0
        while (at < to) {
          const stop = text.indexOf('\n', at)
          const lineEnd = stop === -1 ? text.length : stop
          if (lineEnd > to) break
          const marker = COMPOSER_LIST_LINE.exec(text.slice(at, lineEnd))
          if (!marker || marker[3] === undefined || marker[1] !== indent || marker[4] !== delimiter) break
          if (count === 0) first = Number(marker[3])
          else if (Number(marker[3]) !== first + count) break
          count += 1
          at = stop === -1 ? text.length : stop + 1
        }
        return count === 0 ? null : { first, count }
      }

      // The numbered run a whole-line removal left standing at the caret, with the first number it
      // must carry now. Only a removal that takes out exactly the numbers missing from that
      // sequence moves it, so a deletion above a differently numbered list changes nothing (D51).
      function runAfterRemoval(text, after, from, to) {
        if (from !== 0 && text[from - 1] !== '\n') return null
        if (to !== text.length && text[to - 1] !== '\n') return null
        const stop = after.indexOf('\n', from)
        const lineEnd = stop === -1 ? after.length : stop
        const first = COMPOSER_LIST_LINE.exec(after.slice(from, lineEnd))
        if (!first || first[3] === undefined) return null
        const removed = removedRun(text, from, to, first[1], first[4])
        if (!removed || removed.first + removed.count !== Number(first[3])) return null
        return { indent: first[1], delimiter: first[4], expect: Number(first[3]), next: removed.first }
      }

      function onKeyDown(event) {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || event.repeat) return
        const root = event.target instanceof Element ? event.target.closest(COMPOSER_INPUT_SELECTOR) : null
        if (!root || root.hasAttribute('data-composer-composing')) return
        const listShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && (event.code === 'Digit7' || event.code === 'Digit8')
        const removal = (event.key === 'Backspace' || event.key === 'Delete') && !event.ctrlKey && !event.metaKey
        const enter = event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey
        if (!listShortcut && !removal && !enter) return
        const input = inputFor(root)
        if (!input) return
        const span = input.actions.captureInsertion()
        const text = input.projection.detectText
        const current = lineAt(text, span.start)
        if (listShortcut) {
          const prefix = event.code === 'Digit7' ? '1. ' : '- '
          const markerLength = current.marker ? current.marker[0].length - current.marker[6].length : 0
          const sameKind = current.marker && (event.code === 'Digit7' ? current.marker[3] !== undefined : current.marker[2] !== undefined)
          const indentation = current.marker?.[1] ?? /^[\t ]*/.exec(current.line)[0]
          const append = !current.marker && current.line.trim() !== '' && span.start === current.end && span.start === span.end
          const replacement = append ? `\n${indentation}${prefix}` : sameKind ? indentation : indentation + prefix
          const start = append ? span.start : current.start
          const end = append ? span.end : current.start + (markerLength || indentation.length)
          if (!input.actions.insertText(replacement, { ...span, start, end })) return
        } else if (removal) {
          if (span.start !== span.end) {
            // The items below a removed line move up with it, so the numbers stay consecutive.
            let start = span.start
            let end = span.end
            const contentStart = current.marker ? current.end - current.marker[6].length : current.start
            // Selecting all of an item's body removes its marker with the item.
            if (current.marker && start === contentStart && (end === current.end || end === current.end + 1)) start = current.start
            if (start === current.start && end === current.end && text[end] === '\n') end += 1
            const after = text.slice(0, start) + text.slice(end)
            const run = runAfterRemoval(text, after, start, end)
            const shifted = run ? shiftRun(text, end, run.indent, run.delimiter, run.expect, run.next) : null
            if (!shifted) return
            // Removal and renumbering ride in one replacement, so one undo brings the lines back.
            if (!input.actions.insertText(shifted.text, { ...span, start, end: shifted.end })) return
            // That replacement leaves the caret after the run; an empty one at the removal point
            // only moves the caret, so a refusal never damages the text (D51).
            input.actions.insertText('', { start, end: start, draftRev: input.actions.captureInsertion().draftRev })
          } else if (event.key === 'Backspace') {
            if (!current.marker) return
            const [, indent, , , , , content] = current.marker
            const contentStart = current.start + current.line.length - content.length
            if (span.start !== contentStart) return
            // The marker leaves as one unit; the indentation stays, as it does when an empty item exits the list.
            if (!input.actions.insertText('', { ...span, start: current.start + indent.length, end: contentStart })) return
          } else {
            return
          }
        } else if (enter) {
          const emptyItem = span.start === span.end && current.marker && current.marker[6].trim() === ''
          if (emptyItem) {
            if (!input.actions.insertText(current.marker[1], { ...span, start: current.start, end: current.end })) return
          } else {
            if (!input.actions.insertText('\n', span)) return
          }
        }
        event.preventDefault()
        event.stopImmediatePropagation()
      }

      function handleKeyDown(event) {
        // D12: retire only list editing when its host insertion service fails.
        try {
          onKeyDown(event)
        } catch (error) {
          reportFeatureFailure('composerLists', error)
          ui.retire('composerLists')
        }
      }

      function syncListBlocks() {
        for (const root of document.querySelectorAll(COMPOSER_INPUT_SELECTOR)) {
          for (const block of root.children) {
            const list = block.textContent.split('\n').some(line => COMPOSER_LIST_LINE.test(line))
            block.toggleAttribute('data-dsh-composer-list', list)
          }
        }
      }

      const observer = new MutationObserver(syncListBlocks)
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      syncListBlocks()
      document.addEventListener('keydown', handleKeyDown, true)
      ui.composerLists = {}
      return () => {
        observer.disconnect()
        for (const block of document.querySelectorAll('[data-dsh-composer-list]')) block.removeAttribute('data-dsh-composer-list')
        document.removeEventListener('keydown', handleKeyDown, true)
        delete ui.composerLists
      }
    }
