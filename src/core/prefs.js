    /**
     * Skin preferences.
     *
     * The authoritative store is the host settings namespace, reached through
     * `ctx.configForms`: it serves every registered namespace to the browser,
     * and its per-entry controller carries the values, the write queue and the
     * revision fence. The namespace is this plugin's profile entry id and its
     * schema is the Config `host/settings.js` exports.
     *
     * Every value is mirrored onto the document as an attribute, so the
     * stylesheet — not this module — decides what a preference means visually.
     * Until the first read settles (and if it fails) PREF_DEFAULTS holds, which
     * is exactly the shipped behaviour.
     */
    let prefs = normalizePrefs({})
    const prefsListeners = []

    /**
     * The official settings form.
     *
     * `ctx.configForms.get(entryId)` hands back a controller carrying the
     * values, a write queue and a revision fence, and the namespace is this
     * plugin's profile entry id. It stays null until the service serves that
     * namespace; until then the defaults hold.
     */
    let prefsForm = null
    /** Disposer for the bound form's own change subscription. */
    let prefsFormUnsubscribe = null
    /** Disposer for the served-namespace directory watch, while one is open. */
    let prefsWatchOff = null
    /** Whether the served-namespace directory is already being watched. */
    let prefsBinding = false

    /**
     * Candidate namespaces, best first: the running loader entry id (host
     * halves report "<kind>:<id>", so the kind prefix is stripped), the package
     * name (the `plugins.bundle.config` key), and the id `cordis.patch.yml`
     * inserts — which is what the host half actually registers the namespace
     * as.
     */
    function settingsNamespaceCandidates(ctx) {
      // The dynamic façade can hide the fiber; the other two candidates remain.
      const id = ctx?.fiber?.entry?.id
      const entryId = typeof id === 'string' && id !== '' ? id.slice(id.lastIndexOf(':') + 1) : null
      return [entryId, PACKAGE_NAME, SETTINGS_ENTRY_FALLBACK]
    }

    /**
     * The namespace the host actually serves, picked from the candidates.
     *
     * The browser cannot trust its own loader entry id: `dsh-client-modules`
     * creates each boot entry with only `name`, so the loader mints a RANDOM
     * id. Asking `configForms.get()` for that id hands back a controller for a
     * namespace no one owns — reads stay at the defaults and every write is
     * refused ("No configurable plugin entry"). The served list is the truth.
     *
     * @param forms - the `configForms` service.
     * @param candidates - namespace ids, best first.
     * @returns the first served candidate, or null when none is served yet.
     */
    function servedNamespace(forms, candidates) {
      const namespaces = forms.describe?.()?.getSnapshot?.()?.view?.namespaces
      if (!namespaces) return null
      for (const candidate of candidates) {
        if (typeof candidate !== 'string' || candidate === '') continue
        if (namespaces.some(served => served?.ns === candidate)) return candidate
      }
      return null
    }

    /** Whether the host serves namespaces to the browser. */
    function hostConfigForms(ctx) {
      const forms = ctx?.get('configForms')
      return typeof forms?.get === 'function' ? forms : null
    }

    /** The form's current field values, or null while it is not ready. */
    function readFormValue() {
      const snapshot = prefsForm?.getSnapshot()
      if (snapshot?.status !== 'ready') return null
      return snapshot.value && typeof snapshot.value === 'object' ? snapshot.value : null
    }

    /**
     * Bind one namespace the host already serves.
     *
     * The controller waits for its own snapshot, so binding is the only step
     * here; the value is read once the controller carries it.
     *
     * @param forms - the `configForms` service.
     * @param ctx - the owning context, for the namespace candidates.
     * @returns whether the form was bound.
     */
    function bindServedForm(forms, ctx) {
      // Only bind a namespace the host actually serves; a generated loader id
      // would yield a controller for nobody's namespace (reads stuck at the
      // defaults, every write refused).
      const namespace = servedNamespace(forms, settingsNamespaceCandidates(ctx))
      if (namespace === null) return false
      const form = forms.get(namespace)
      if (typeof form?.getSnapshot !== 'function') return false
      prefsForm = form
      // A form without a subscribe face leaves the reads on demand.
      if (typeof form.subscribe === 'function') prefsFormUnsubscribe = form.subscribe(loadPrefs)
      return true
    }

    /**
     * Watch the served-namespace directory until this plugin's namespace lands.
     *
     * The directory is a wire read: on a cold page it can answer after this
     * plugin has applied, so the mirror is subscribed and asked for its first
     * read, and the form binds whenever the answer arrives.
     *
     * @param forms - the `configForms` service.
     * @param ctx - the owning context, for the namespace candidates.
     */
    function watchNamespace(forms, ctx) {
      if (prefsBinding) return
      const mirror = forms.describe?.()
      if (!mirror) return
      prefsBinding = true
      const attempt = () => {
        if (prefsForm === null && !bindServedForm(forms, ctx)) return
        if (prefsWatchOff !== null) {
          prefsWatchOff()
          prefsWatchOff = null
        }
        loadPrefs()
      }
      if (typeof mirror.subscribe === 'function') prefsWatchOff = mirror.subscribe(attempt)
      if (typeof mirror.ensure === 'function') mirror.ensure()
      attempt()
    }

    /**
     * Bind the official form.
     *
     * Called once per install, before the first read, and again when the
     * settings page installs — the service may mount after this plugin. A
     * namespace the host does not serve yet leaves `prefsForm` null and the
     * defaults in place, so this never blocks or fails the skin.
     */
    function adoptSettingsForm(ctx) {
      if (prefsForm === null) {
        const forms = hostConfigForms(ctx)
        if (forms === null) return false
        if (!bindServedForm(forms, ctx)) watchNamespace(forms, ctx)
      }
      if (prefsForm === null) return false
      loadPrefs()
      return true
    }

    /** Release the form and directory subscriptions this module opened. */
    function disposePrefsBinding() {
      if (prefsFormUnsubscribe !== null) {
        prefsFormUnsubscribe()
        prefsFormUnsubscribe = null
      }
      if (prefsWatchOff !== null) {
        prefsWatchOff()
        prefsWatchOff = null
      }
      prefsBinding = false
      prefsForm = null
    }

    /**
     * Runtime overrides that outrank the stored preferences. A feature that is
     * switched off after failing (src/entry.js) hands its surface back to the
     * host whatever the preference says: the footer takeover and the composer
     * restyle both HIDE host controls, and a takeover whose replacement is gone
     * would leave nothing in their place.
     */
    let footerTakeoverRetired = false
    let composerRestyleRetired = false

    /** Give the sidebar footer back to the host for the rest of this generation. */
    function retireFooterTakeover() {
      footerTakeoverRetired = true
      document.body.removeAttribute(FOOTER_ATTR)
    }

    /** Give the composer back to the host for the rest of this generation. */
    function retireComposerRestyle() {
      composerRestyleRetired = true
      document.body.removeAttribute(COMPOSER_ATTR)
    }

    /** The current preferences (live object; treat as read-only). */
    function readPrefs() {
      return prefs
    }

    /** Observe preference changes; returns the unsubscriber. */
    function subscribePrefs(listener) {
      prefsListeners.push(listener)
      return () => {
        const index = prefsListeners.indexOf(listener)
        if (index !== -1) prefsListeners.splice(index, 1)
      }
    }

    /**
     * Adopt a preference set: mirror it onto the document, then notify.
     * @param next - resolved preferences from the host.
     */
    function adoptPrefs(next) {
      prefs = next
      // The brand is one attribute write; the other preferences gate rules the
      // stylesheet and the scheduler read directly.
      document.body.setAttribute(BRAND_ATTR, next.brand)
      document.body.setAttribute(PALETTE_ATTR, next.palette)
      document.body.setAttribute(TYPEFACE_ATTR, next.typeface)
      document.body.setAttribute(MASCOT_ATTR, resolveMascot(next))
      writeMotionAttribute(next.motion)
      document.body.toggleAttribute(FOOTER_ATTR, next.collapseFooter && !footerTakeoverRetired)
      notifyAll(prefsListeners, next)
    }

    /** Whether the operating system asks for reduced motion right now. */
    function systemPrefersReducedMotion() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }

    /**
     * Resolve the animation choice onto the document.
     *
     * Only the two answers the rest of the plugin acts on reach the attribute:
     * a stylesheet cannot rewrite its own media queries, so "always play" has to
     * be expressible as a value the rules can test.
     *
     * @param mode - one of MOTION_MODES.
     */
    function writeMotionAttribute(mode) {
      const reduced = mode === MOTION_REDUCED || (mode !== MOTION_FULL && systemPrefersReducedMotion())
      document.body.setAttribute(MOTION_ATTR, reduced ? MOTION_REDUCED : MOTION_FULL)
    }

    /**
     * Re-resolve the current choice. The scheduler calls this when the system's
     * own setting flips, which "follow the system" has to pick up mid-session.
     */
    function refreshMotionAttribute() {
      writeMotionAttribute(prefs.motion)
    }

    /**
     * Whether the skin must hold its animations still, right now.
     *
     * The mascots ask this instead of the media query: the query cannot express
     * "always play" while the system asks for reduced motion, and the resolved
     * attribute can. Before the first adoption (or with no settings store at
     * all) the shipped answer is the system's, which is what the attribute is
     * written with at install.
     */
    function motionReduced() {
      const resolved = document.body.getAttribute(MOTION_ATTR)
      if (resolved === MOTION_REDUCED) return true
      if (resolved === MOTION_FULL) return false
      return systemPrefersReducedMotion()
    }

    /**
     * Read the preferences from the form, once it carries values. The form's
     * subscription calls this on every host change; the binding calls it for
     * values that were ready before the subscription settled.
     */
    function loadPrefs() {
      const value = readFormValue()
      if (value === null) return
      adoptPrefs(normalizePrefs(value))
      moveLocalPrefs(value)
    }

    /**
     * Clamp the hover-open preference. It used to be a boolean, and a value
     * stored in that shape still has to land on a scope: `true` meant every
     * popover, `false` meant click-only.
     */
    function normalizeAutoPopover(value) {
      if (value === true) return AUTO_POPOVER_ALL
      if (value === false) return AUTO_POPOVER_OFF
      return AUTO_POPOVER_SCOPES.includes(value) ? value : PREF_DEFAULTS.autoPopover
    }

    /**
     * The provider ids the picker's first level carries. Ids rather than names:
     * a provider can be renamed by the catalog at any time, and the stored
     * selection has to survive that. Order is the caller's, duplicates dropped.
     * The official service is the picker's default, not a choice, so a stored
     * id for it is dropped: the first level shows it whenever nothing else is
     * picked, which is what "default" means.
     */
    function normalizeQuickProviders(value) {
      if (!Array.isArray(value)) return []
      const out = []
      for (let i = 0; i < value.length && out.length < QUICK_PROVIDERS_MAX; i++) {
        const id = value[i]
        if (typeof id !== 'string' || id === '' || id.length > PROVIDER_ID_MAX) continue
        if (id === MODEL_OFFICIAL_GROUP || out.includes(id)) continue
        out.push(id)
      }
      return out
    }

    /**
     * Clamp the brand: DeepSeek, or Claude. A value stored by an earlier build
     * under the DeepSeek choice's old name reads as that choice, and the retired
     * third choice (`anthropic`) reads as Claude, whose marks and palette it
     * shared.
     */
    function normalizeBrand(value) {
      if (value === BRAND_DEEPSEEK) return value
      return value === BRAND_DEEPSEEK_LEGACY ? BRAND_DEEPSEEK : BRAND_CLAUDE
    }

    /**
     * The mascot actually on the page: `brand` resolves through the brand (the
     * crab under Claude, Deepy under DeepSeek); the other choices stand as
     * they are.
     * @returns MASCOT_CRAB, MASCOT_DEEPY or MASCOT_OFF.
     */
    function resolveMascot(current) {
      if (current.mascot !== MASCOT_BRAND) return current.mascot
      return current.brand === BRAND_DEEPSEEK ? MASCOT_DEEPY : MASCOT_CRAB
    }

    /**
     * Clamp one host value into the preference shape, field by field off
     * PREF_DEFAULTS: a boolean stays on unless stored as `false`, a choice
     * outside its set reads as its default, and the four fields with a shape
     * of their own have their own clamps.
     */
    function normalizePrefs(value) {
      const section = value && typeof value === 'object' ? value : {}
      const out = {}
      for (const key in PREF_DEFAULTS) {
        const fallback = PREF_DEFAULTS[key]
        if (typeof fallback === 'boolean') out[key] = section[key] !== false
        else if (key in PREF_CHOICES) out[key] = PREF_CHOICES[key].includes(section[key]) ? section[key] : fallback
      }
      out.brand = normalizeBrand(section.brand)
      out.autoPopover = normalizeAutoPopover(section.autoPopover)
      out.quickProviders = normalizeQuickProviders(section.quickProviders)
      out.username = typeof section.username === 'string' ? section.username.trim().slice(0, USERNAME_MAX) : ''
      return out
    }

    /**
     * Values an earlier build kept in this browser's local storage, by
     * preference: it stored them there while the running host half refused the
     * field. The first time the form carries values, each one the form does not
     * hold yet is written through the form; the local copy is dropped once the
     * form holds a value of its own.
     */
    const LOCAL_PREF_KEYS = {
      username: 'dsh-claude-style.username',
      banLocale: 'dsh-claude-style.banLocale',
    }
    let localPrefsMoved = false

    function moveLocalPrefs(formValue) {
      if (localPrefsMoved) return
      localPrefsMoved = true
      for (const key in LOCAL_PREF_KEYS) {
        const stored = localStorage.getItem(LOCAL_PREF_KEYS[key])
        if (stored === null) continue
        const held = formValue[key] !== undefined && formValue[key] !== PREF_DEFAULTS[key]
        const unusable = stored === '' || stored === PREF_DEFAULTS[key] || (key in PREF_CHOICES && !PREF_CHOICES[key].includes(stored))
        if (held || unusable) {
          localStorage.removeItem(LOCAL_PREF_KEYS[key])
          continue
        }
        savePrefs({ [key]: stored }).then(saved => {
          if (saved !== null && saved[key] === stored) localStorage.removeItem(LOCAL_PREF_KEYS[key])
        })
      }
    }

    /**
     * Write a partial preference change through the official form.
     *
     * One `set()` per field, chained: the controller owns the write queue and
     * takes its revision fence from the last settlement, so a burst of toggles
     * cannot interleave or lose a field. `set()` also validates the field path
     * against the entry's Config before anything crosses the wire.
     *
     * @param patch - preference keys to change.
     * @returns a promise for the resolved preferences, or null when the form
     *          does not carry values yet or refused the change.
     */
    function savePrefs(patch) {
      if (readFormValue() === null) return Promise.resolve(null)
      const step = name => accepted => {
        if (accepted === false) return false
        let pending
        try {
          pending = prefsForm.set(name, patch[name])
        } catch (error) {
          // set() refuses a field path the entry's Config does not carry by
          // throwing before anything crosses the wire: that is a refusal, which
          // the caller answers with a re-read and the page's notice.
          return false
        }
        return pending && typeof pending.then === 'function'
          ? pending.then(ok => ok === true)
          : true
      }
      let run = Promise.resolve(true)
      for (const key of Object.keys(patch)) run = run.then(step(key))
      return run.then(accepted => {
        // Refused (a stale revision, or a field this Config does not carry):
        // re-read rather than guess.
        loadPrefs()
        return accepted === false ? null : prefs
      })
    }
