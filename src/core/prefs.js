    /**
     * Skin preferences: the host settings namespace is the store, and every
     * value is mirrored onto the document as an attribute so the stylesheet
     * decides what it means (D10, D11). Until the first read settles — and if
     * it fails — PREF_DEFAULTS holds.
     */
    let prefs = normalizePrefs({})
    const prefsListeners = []

    /** The official settings form; null until the service serves the namespace. */
    let prefsForm = null
    /** Disposer for the bound form's own change subscription. */
    let prefsFormUnsubscribe = null
    /** Disposer for the served-namespace directory watch, while one is open. */
    let prefsWatchOff = null
    /** Whether the served-namespace directory is already being watched. */
    let prefsBinding = false

    /** Namespaces to try, best first: loader entry id, package name, inserted id. */
    function settingsNamespaceCandidates(ctx) {
      // The dynamic façade can hide the fiber; the other two candidates remain.
      const id = ctx?.fiber?.entry?.id
      const entryId = typeof id === 'string' && id !== '' ? id.slice(id.lastIndexOf(':') + 1) : null
      return [entryId, PACKAGE_NAME, SETTINGS_ENTRY_FALLBACK]
    }

    /**
     * The namespace the host actually serves, picked from the candidates.
     *
     * The loader mints a random id for each boot entry, so asking for our own
     * entry id hands back a controller for nobody's namespace: reads stay at the
     * defaults and every write is refused. The served list is the truth.
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

    /** Bind one namespace the host already serves; the controller waits for its own snapshot. */
    function bindServedForm(forms, ctx) {
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
     * Watch the served-namespace directory until this plugin's namespace lands:
     * on a cold page the directory can answer after this plugin has applied.
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
     * Bind the official form. Called once per install, before the first read, and
     * again when the settings page installs — the service may mount after this
     * plugin. A namespace the host does not serve yet leaves `prefsForm` null and
     * the defaults in place, so this never blocks or fails the skin.
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
     * Runtime overrides that outrank the stored preferences: a feature retired
     * after failing hands its surface back to the host, because both of these
     * HIDE host controls and a takeover whose replacement is gone would leave
     * nothing in their place.
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

    /** Adopt a preference set: mirror it onto the document, then notify. */
    function adoptPrefs(next) {
      prefs = next
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
     * Resolve the animation choice onto the document. Only the two answers the
     * rest of the plugin acts on reach the attribute: a stylesheet cannot rewrite
     * its own media queries, so "always play" has to be a value the rules test.
     */
    function writeMotionAttribute(mode) {
      const reduced = mode === MOTION_REDUCED || (mode !== MOTION_FULL && systemPrefersReducedMotion())
      document.body.setAttribute(MOTION_ATTR, reduced ? MOTION_REDUCED : MOTION_FULL)
    }

    /**
     * Re-resolve the current choice when the system's own setting flips. The
     * listeners hear about it only when the resolved answer really moved, because
     * features act on that answer rather than reading it lazily (D26).
     */
    function refreshMotionAttribute() {
      const before = document.body.getAttribute(MOTION_ATTR)
      writeMotionAttribute(prefs.motion)
      if (document.body.getAttribute(MOTION_ATTR) !== before) notifyAll(prefsListeners, prefs)
    }

    /**
     * Re-run everything that asked to hear about the environment without the
     * stored preferences having changed: the other chat plugin appearing or
     * leaving (src/shared/peer-plugin.js, D32).
     */
    function notifyEnvironmentChange() {
      notifyAll(prefsListeners, prefs)
    }

    /**
     * Whether the skin must hold its animations still, right now. The mascots ask
     * this instead of the media query, which cannot express "always play".
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

    /** Clamp the hover-open preference; the earlier boolean shape still lands. */
    function normalizeAutoPopover(value) {
      if (value === true) return AUTO_POPOVER_ALL
      if (value === false) return AUTO_POPOVER_OFF
      return AUTO_POPOVER_SCOPES.includes(value) ? value : PREF_DEFAULTS.autoPopover
    }

    /**
     * The provider ids the picker's first level carries: ids rather than names, so
     * a catalog rename does not lose the stored selection. The official service is
     * the picker's default rather than a choice, so a stored id for it is dropped.
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

    /** Clamp the brand; values stored by earlier builds under older names land on their choice. */
    function normalizeBrand(value) {
      if (value === BRAND_DEEPSEEK) return value
      return value === BRAND_DEEPSEEK_LEGACY ? BRAND_DEEPSEEK : BRAND_CLAUDE
    }

    /** The mascot actually on the page: `brand` resolves through the brand. */
    function resolveMascot(current) {
      if (current.mascot !== MASCOT_BRAND) return current.mascot
      return current.brand === BRAND_DEEPSEEK ? MASCOT_DEEPY : MASCOT_CRAB
    }

    /**
     * Clamp one host value into the preference shape, field by field off
     * PREF_DEFAULTS: a boolean stays on unless stored as `false`, a choice outside
     * its set reads as its default, and the four fields with a shape of their own
     * have their own clamps.
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
     * Values an earlier build kept in this browser's local storage, by preference:
     * the first time the form carries values, each field the form does not hold
     * yet is written through the form and the local copy dropped.
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
     * Write a partial preference change through the official form: one `set()` per
     * field, chained, because the controller owns the write queue and takes its
     * revision fence from the last settlement.
     *
     * @returns a promise for the resolved preferences, or null when the form does
     *          not carry values yet or refused the change.
     */
    function savePrefs(patch) {
      if (readFormValue() === null) return Promise.resolve(null)
      const step = name => accepted => {
        if (accepted === false) return false
        let pending
        try {
          pending = prefsForm.set(name, patch[name])
        } catch (error) {
          // set() refuses a field path this Config does not carry by throwing
          // before anything crosses the wire: a refusal, answered with a re-read
          // (D12).
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
