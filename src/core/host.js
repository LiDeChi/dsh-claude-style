    /**
     * The host's access-mode trigger: the button its permission slot renders.
     * Every slot render site carries a `[data-slot="<key>"]` wrapper — the
     * host renderer's anchor contract for outside styles (ui-renderer
     * scoped-slots) — so this reads the same in every shell language. The
     * permission control inserts its own buttons beside the host's inside
     * that wrapper, so the skin's are skipped.
     */
    function findAccessTrigger() {
      return document.querySelector('[data-slot="conversation.input.permission"] button:not([class*="dsh-claude"])')
    }

    /** The sidebar footer, where the account row and the plugin footer entries live. */
    function findFootArea() {
      return document.querySelector('[class*="footArea"]')
    }

    /**
     * The host's composer card — the element the skin's composer rules hang on
     * — and the placeholder its editor draws while the draft is empty. The
     * card's variant is the skin's own marking (D9); the rest is the host's
     * markup. Every reader goes through these, so the selectors live once.
     */
    const COMPOSER_CARD = '[data-composer-card]'
    const COMPOSER_PLACEHOLDER = '[data-composer-placeholder]'

    function findComposerCards() {
      return document.querySelectorAll(COMPOSER_CARD)
    }

    function findComposerCard() {
      return document.querySelector(COMPOSER_CARD)
    }

    /** The composer card `node` sits in, or null; `variant` narrows it to one variant. */
    function closestComposerCard(node, variant) {
      if (variant === undefined) return closestFrom(node, COMPOSER_CARD)
      return closestFrom(node, `${COMPOSER_CARD}[data-composer-variant="${variant}"]`)
    }

    function findComposerPlaceholders() {
      return document.querySelectorAll(COMPOSER_PLACEHOLDER)
    }

    function findComposerPlaceholder(card) {
      return card.querySelector(COMPOSER_PLACEHOLDER)
    }

    /**
     * The shown conversation: the element carrying its session id (the active
     * conversation area's own wrapper) and the id itself. The whale's stand,
     * the turn status line and the context meter's stats all name the
     * conversation on screen through these.
     */
    const CONVERSATION_SESSION_ATTR = 'data-conversation-session'
    const CONVERSATION_SESSION = `[${CONVERSATION_SESSION_ATTR}]`

    function findConversationSession() {
      return document.querySelector(`[data-phase="active"] ${CONVERSATION_SESSION}`)
    }

    function closestConversationSession(node) {
      return closestFrom(node, CONVERSATION_SESSION)
    }

    /** The session id `host` carries, or null when it carries none. */
    function conversationSessionId(host) {
      if (host === null || host === undefined) return null
      const id = host.getAttribute(CONVERSATION_SESSION_ATTR)
      return typeof id === 'string' ? id : null
    }

    /**
     * The host's composer stack (ui-conversation's `.composerStack`): the
     * composer card with the cards stacked above it, and on the new-session
     * page the hero around them (`_composerHero` beside it there).
     */
    const COMPOSER_STACK = '[class*="_composerStack"]'

    /**
     * The current-session selection left the Session Controller in dsh 0.2:
     * the list snapshot no longer carries `current`, and the main-view
     * selection is projected by the `uiSession` service as a binding source
     * whose `value.key` is the selected session id (`undefined` when no
     * session is materialized). Read the new source first and fall back to
     * the legacy `list.current` so older hosts keep working.
     */
    function currentSessionId(ctx, sessions) {
      const uiSession = ctx.get('uiSession')
      const value = uiSession?.current?.value
      if (typeof value?.key === 'string') return value.key
      return sessions.list.getSnapshot().current
    }

    function currentSession(ctx) {
      const sessions = ctx.get('sessions')
      if (sessions === undefined || sessions === null) return null
      const id = currentSessionId(ctx, sessions)
      if (id === undefined || id === null) return null
      const binding = sessions.binding(id)
      if (binding === undefined || binding === null) return null
      return binding.session === undefined ? null : binding.session
    }

    /**
     * What an open turn is doing, read off the host's chat snapshot (ui-chat's
     * `chat` target of uiConversation): its newest step's assistant output
     * while that streams — `{ kind: 'assistant', assistant, newest }`, with
     * `newest` the kind of its newest block, null before the first — else
     * `{ kind: 'tools' }` while one of the turn's tool calls runs, else null:
     * the turn waits on the model.
     */
    function readTurnActivity(snapshot, turn) {
      const step = turn.steps.length === 0 ? undefined : turn.steps[turn.steps.length - 1]
      const assistant = step === undefined ? undefined : step.data.get('assistant-step')
      if (assistant !== undefined && assistant.status === 'running') {
        const blocks = assistant.blocks
        return { kind: 'assistant', assistant, newest: blocks.length === 0 ? null : blocks[blocks.length - 1].kind }
      }
      const calls = snapshot.legacy.runningCalls
      for (let i = 0; i < calls.length; i++) {
        if (calls[i].turn === turn.turn) return { kind: 'tools' }
      }
      return null
    }

    function currentPreset(session) {
      const snapshot = session.projections.faceOf('permissions').getSnapshot()
      if (snapshot === undefined || snapshot === null) return null
      // dsh 0.2+ projection faces hand back the bare value (e.g. the preset
      // id string); older hosts wrapped it as `{ currentValue }`.
      if (typeof snapshot === 'object' && 'currentValue' in snapshot) return snapshot.currentValue
      return snapshot
    }

    /**
     * Who the skin shows: one nickname and one picture, each resolved down a
     * fixed order.
     *
     * Nickname: the custom nickname (settings), the signed-in account's name,
     * the HDSL launcher's account name, the cached OS-user probe, the fresh
     * probe, then `User`. Picture: the signed-in account's avatar, the HDSL
     * launcher's avatar, then the brand mark the stylesheet draws underneath.
     *
     * Only the probe is resolved here. The account profile
     * (features/account/profile.js) and the HDSL contract push their values in
     * through the setters below, so the greeting, the account row and the hold
     * screen all read this one place.
     */
    let accountName = ''
    let accountAvatar = ''

    /** The account profile's contribution; called when its read answers. */
    function setAccountIdentity(name, avatar) {
      accountName = typeof name === 'string' ? name.trim() : ''
      accountAvatar = typeof avatar === 'string' ? avatar : ''
    }

    /**
     * Host-resolved username.
     *
     * The host half owns the OS user (`os.userInfo().username`); this side
     * fetches it once and caches it, and mirrors the answer into local storage
     * so a reload shows the name from the first frame instead of `User`. No
     * workspace parsing, no polling.
     */
    let usernameFromHost = ''

    /** Last OS-user probe this browser saw; the cache that outlives the page. */
    const PROBED_USERNAME_KEY = 'dsh-claude-style.probed-username'
    let probedUsername = readStoredProbeUsername()

    function readStoredProbeUsername() {
      return localStorage.getItem(PROBED_USERNAME_KEY) || ''
    }

    function storeProbeUsername(value) {
      if (value) localStorage.setItem(PROBED_USERNAME_KEY, value)
    }

    /**
     * The host half's OS user. An answer the contract does not carry is not
     * adopted: the cached probe or 'User' stays.
     */
    const usernameResource = createHostResource(USERNAME_ROUTE, (data) => {
      if (!data || data.ok !== true || typeof data.username !== 'string') return undefined
      usernameFromHost = data.username.trim().slice(0, USERNAME_MAX)
      if (usernameFromHost) {
        probedUsername = usernameFromHost
        storeProbeUsername(usernameFromHost)
      }
      return usernameFromHost
    })

    function onUsernameLoaded(listener) {
      return usernameResource.onLoaded(listener)
    }

    function loadUsername() {
      usernameResource.load()
    }

    let hdslContract = false
    let hdslName = ''
    let hdslAvatar = false

    /**
     * The HDSL launcher's account contract, when this instance was launched by
     * it. An answer that is no contract is not adopted: the chain skips the
     * launcher.
     */
    const hdslResource = createHostResource(HDSL_ROUTE, (data) => {
      if (!data || data.ok !== true || data.contract !== true) return undefined
      hdslContract = true
      hdslName = typeof data.name === 'string' ? data.name.trim().slice(0, USERNAME_MAX) : ''
      hdslAvatar = data.hasSkinImage === true
      return true
    })

    function onHdslLoaded(listener) {
      return hdslResource.onLoaded(listener)
    }

    function loadHdsl() {
      hdslResource.load()
    }

    /**
     * The nickname every skin surface shows, or '' when nothing resolved.
     * @returns the winning name, without the `User` default.
     */
    function resolveDisplayName() {
      const custom = readPrefs().username
      if (custom) return custom
      if (accountName) return accountName
      if (hdslName) return hdslName
      if (probedUsername) return probedUsername
      return usernameFromHost
    }

    function getUsername() {
      return resolveDisplayName() || 'User'
    }

    /**
     * The picture every skin surface shows, or '' to let the brand mark show.
     * @returns the winning avatar address.
     */
    function resolveAvatarUrl() {
      if (accountAvatar) return accountAvatar
      if (hdslContract && hdslAvatar) return HDSL_SKIN_ROUTE
      return ''
    }

    /**
     * Host context reference for services that need to read host state
     * (e.g. locale) outside of apply(ctx)'s direct call stack.
     */
    let hostCtx = null
    function setHostContext(ctx) {
      hostCtx = ctx
      // A new host context means a new OS user and a new launcher: the next
      // apply resolves once again rather than reusing the previous host's
      // answers. The probe cache survives on purpose — it is the same machine
      // until something says otherwise.
      usernameResource.reset()
      usernameFromHost = ''
      hdslResource.reset()
      hdslContract = false
      hdslName = ''
      hdslAvatar = false
      accountName = ''
      accountAvatar = ''
    }
