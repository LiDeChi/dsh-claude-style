    /**
     * The chat area's host contract, as the ported chat interactions read it
     * (docs/architecture.md D32).
     *
     * Everything here is an attribute or selector the host itself writes. Its
     * class names carry a build-time hash and change with every release, so the
     * ported modules key on these instead. The whole table lives here however
     * many features read an entry — one host contract in one place, so reading
     * the two implementations side by side shows what the host offers without
     * walking six directories — and no feature keeps a second copy of anything
     * in it. What each feature writes itself stays in that feature's directory
     * (its own marks, class names, highlight and keyframe names).
     */
    /** One per flow block: a new block means this piece of the stream moved on. */
    const FLOW_BLOCK_SELECTOR = '[data-chat-flow-key]'
    /** The chat column. */
    const CHAT_FLOW_SELECTOR = '[data-chat-flow]'
    /**
     * One tool call's row. It lives inside the assistant block, so it does not
     * have to arrive as a new flow block of its own.
     */
    const CHAT_CALL_SELECTOR = '[data-chat-call-id]'
    /** One thinking row; its phase is its data-state attribute. */
    const THINK_ROW_SELECTOR = '[data-variant="think"]'
    /** The phase value while the model is still thinking. */
    const RUNNING_STATE = 'running'
    /** The markdown layer marks the container with this while an assistant message streams. */
    const STREAMING_SELECTOR = '[data-streaming]'
    /** The same contract as an attribute name: the reveal watches it appearing and going. */
    const STREAMING_ATTRIBUTE = 'data-streaming'
    /**
     * TextShimmer's swept element: while it is attached, that piece of content
     * is still moving. The host renamed the attribute (data-text-shimmer to
     * data-shimmer) in its 2026-09 update, so both names are read.
     */
    const SHIMMER_SELECTOR = '[data-shimmer], [data-text-shimmer]'
    /** The chat column's scroller; the host hangs its own follow off it. */
    const CONVERSATION_SCROLL_SELECTOR = '[data-conversation-scroll]'
    /** Present while the host's follow is on; its absence is how the follow reads as off. */
    const FOLLOWING_TAIL_ATTRIBUTE = 'data-chat-following-tail'
    /** The same contract in selector form. */
    const FOLLOWING_TAIL_SELECTOR = '[data-chat-following-tail]'
    /** How close to the end counts as reading the tail: the host's own threshold. */
    const FOLLOW_THRESHOLD_PX = 25
    /** The composer area: a pointer or key inside it is the reader typing, not taking the scroll over. */
    const COMPOSER_SELECTOR = '[data-composer-seat]'
    /** The composer's editable surface (contenteditable); the caret motion is drawn for it. */
    const COMPOSER_INPUT_SELECTOR = '[data-composer-input]'
    /** The card the input sits in; the send flight lifts a copy of the whole card. */
    const COMPOSER_CARD_SELECTOR = '[data-composer-card]'
    /** The draft's own scroll area inside that card. */
    const COMPOSER_SCROLL_SELECTOR = '[data-input-scroll]'
    /** The echo bubble the host mounts the moment a submission goes through. */
    const SUBMISSION_ECHO_SELECTOR = '[data-submission-echo]'
    /**
     * A plain text box inside the composer seat: a question card's answer box
     * (under [data-question-key]) and a queued message's inline editor (under
     * [data-queue-dock]). Both are textareas, in the main session and in the
     * sidebar's subagent sessions alike.
     */
    const COMPOSER_TEXTAREA_SELECTOR = '[data-composer-seat] textarea'
    /** The keys that scroll the viewport; the same set the host reads. */
    const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])
    /** The host puts this on every process group. */
    const PROCESS_GROUP_SELECTOR = '[data-step-process]'
    /** The host puts this on every process group's body. */
    const PROCESS_BODY_SELECTOR = '[data-step-process-body]'
    /** The content layer inside a process group's body; that layer is the one that scrolls. */
    const PROCESS_CONTENT_SELECTOR = '[data-step-process-content]'
    /** On a process group's root while this tier does not cap the body (detailed, fully expanded). */
    const PROCESS_EXPANDED_MODE_ATTRIBUTE = 'data-group-expanded-mode'
