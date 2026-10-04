/**
 * The settings surface: the preferences schema the host's settings domain
 * derives its form from, and the registration that hands it over.
 *
 * 0.1.7+ derives every settings form from the profile entry's Config and
 * exposes only the fields marked `.volatile()`; the schema resolution is
 * defensive because a `link:`-installed plugin resolves its realpath outside
 * the profile tree (see resolveSchemaFactory). A host that cannot resolve the
 * package still loads the skin — it just loses the settings form.
 */

/** The namespace an older host knows this plugin's preferences by. */
const LEGACY_SETTINGS_NAMESPACE = 'claude-style'
/** The id `cordis.patch.yml` inserts; the fallback when the loader entry cannot be read. */
const ENTRY_ID_FALLBACK = 'ui-skin-claude-style'

/**
 * The namespace the preferences are read and written under.
 *
 * A namespace IS a profile entry id and its schema IS that entry's Config, so
 * the id is read off this plugin's own loader entry; a host that still owns the
 * imperative registry gets `claude-style` instead. Resolved during apply.
 */
let settingsNamespace = LEGACY_SETTINGS_NAMESPACE

/** This plugin's loader entry id, or the id the patch declares when it cannot be read. */
function entryIdOf(ctx) {
  try {
    const id = ctx?.fiber?.entry?.id
    if (typeof id === 'string' && id !== '') {
      // 0.1.7 reports the entry as "<kind>:<id>" — the profile carries the skin as
      // an `include` entry, so this reads "include:ui-skin-claude-style" — while
      // the settings service keys its namespaces by the BARE id (it lists
      // "ui-skin-claude-style"). Writing under the qualified name is what made
      // every save come back 409 `No configurable plugin entry`. Send the id the
      // service knows; on a host whose id has no kind prefix this is a no-op.
      const colon = id.lastIndexOf(':')
      return colon === -1 ? id : id.slice(colon + 1)
    }
  } catch { /* no loader entry: fall back to the id the patch declares */ }
  return ENTRY_ID_FALLBACK
}

/** Defaults, mirrored by the browser half's constants. */
const PREFS_DEFAULT = Object.freeze({
  brand: 'claude',
  motion: 'system',
  collapseFooter: true,
  autoPopover: 'all',
  composerScope: 'all',
  modelPicker: true,
  quickProviders: [],
  username: '',
  banLocale: 'en',
  homeLayout: 'studio',
  palette: 'claude',
  typeface: 'claude',
  mascot: 'brand',
  mascotScope: 'all',
  permissionsControl: true,
  workspaceView: true,
  sidebarSearch: true,
  turnStatus: true,
  viewTabs: true,
})

/**
 * The schemastery instance the HARNESS itself resolves.
 *
 * A plugin installed by link (`link:D:/…`) resolves its realpath outside the
 * profile tree, so Node never walks the profile's `node_modules` and the plain
 * import fails outright — and the copy the profile's interception layer would
 * offer can belong to a DIFFERENT installation (on this machine the layer
 * points at the Desktop bundle, whose 3.18.2 has no `.volatile()`). The harness
 * always carries schemastery beside its own bin, and that copy is the instance
 * the settings domain validates forms against, so it is asked for first;
 * normal resolution stays as the fallback for a plainly installed plugin.
 *
 * @returns the schema factory, or null when neither path resolves.
 */
async function resolveSchemaFactory() {
  try {
    const { createRequire } = await import('node:module')
    const anchor = typeof process.argv[1] === 'string' && process.argv[1] !== '' ? process.argv[1] : process.execPath
    const factory = createRequire(anchor)('@deepseek-ai/schemastery')
    if (factory !== null && factory !== undefined && typeof factory.object === 'function') return factory
  } catch { /* the anchor carries no schemastery: try normal resolution */ }
  try {
    const module = await import('@deepseek-ai/schemastery')
    return module?.default ?? module?.Schema ?? null
  } catch {
    return null
  }
}

/**
 * The declared Config.
 *
 * 0.1.7+ derives every settings form from the profile entry's Config and
 * exposes only the fields marked `.volatile()`, so the preferences have to be
 * declared here — there is no imperative namespace registration any more.
 * schemastery only grew `volatile()` in 3.18.3 and the desktop bundle still
 * ships 3.18.2, so the marker is applied only when the installed factory
 * provides it; on the older host this same schema is handed to
 * `settings.register()` instead.
 *
 * The import is guarded and top-level-awaited for the same reason the rest of
 * this half is defensive: a host that cannot resolve schemastery must still
 * load the skin — it just loses the settings form.
 *
 * Field types stay permissive (plain string / boolean / array) on purpose: a
 * union resolves by rejection, so one stale value left in the profile patch by
 * an older build would fail resolution for the whole entry. The accepted sets
 * are enforced where they are consumed — the write route drops unknown keys and
 * the browser half clamps everything it reads.
 */
let SchemaFactory = await resolveSchemaFactory()

/** Mark one field editable by the settings page, where the factory supports it. */
function volatileField(field) {
  return typeof field?.volatile === 'function' ? field.volatile() : field
}

export const Config = SchemaFactory === null
  ? undefined
  : SchemaFactory.object({
      brand: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.brand)),
      motion: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.motion)),
      collapseFooter: volatileField(SchemaFactory.boolean().default(PREFS_DEFAULT.collapseFooter)),
      autoPopover: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.autoPopover)),
      composerScope: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.composerScope)),
      modelPicker: volatileField(SchemaFactory.boolean().default(PREFS_DEFAULT.modelPicker)),
      quickProviders: volatileField(SchemaFactory.array(SchemaFactory.string()).default([])),
      username: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.username)),
      banLocale: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.banLocale)),
      homeLayout: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.homeLayout)),
      palette: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.palette)),
      typeface: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.typeface)),
      mascot: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.mascot)),
      mascotScope: volatileField(SchemaFactory.string().default(PREFS_DEFAULT.mascotScope)),
      permissionsControl: volatileField(SchemaFactory.boolean().default(PREFS_DEFAULT.permissionsControl)),
      workspaceView: volatileField(SchemaFactory.boolean().default(PREFS_DEFAULT.workspaceView)),
      sidebarSearch: volatileField(SchemaFactory.boolean().default(PREFS_DEFAULT.sidebarSearch)),
      turnStatus: volatileField(SchemaFactory.boolean().default(PREFS_DEFAULT.turnStatus)),
      viewTabs: volatileField(SchemaFactory.boolean().default(PREFS_DEFAULT.viewTabs)),
    })

/**
 * Resolve the schema package once, for the legacy register path.
 *
 * A settings namespace needs a real schema: the settings service serialises it
 * (`schema.toJSON()`) for configuration surfaces and walks it to redact
 * secrets, so a hand-rolled stand-in would break `describe` for every
 * namespace, not just this one. Resolution goes through
 * {@link resolveSchemaFactory}, and it stays lazy so a host that cannot provide
 * the package loses the settings page rather than the whole skin.
 *
 * @returns the schema factory, or null when it cannot be resolved.
 */
async function loadSchema() {
  return await resolveSchemaFactory()
}

/**
 * Build the namespace schema.
 *
 * Every field is `any` with a default rather than a union of the accepted
 * values. A union resolves by rejection: one hand-edited or stale value in the
 * user settings document would throw during namespace resolution, which fails
 * registration and takes the whole settings surface down. The accepted set is
 * enforced where it is consumed instead — the write route drops unknown keys
 * and the browser half clamps what it reads.
 *
 * @param Schema - schema factory from `@deepseek-ai/schemastery`.
 * @returns the namespace schema.
 */
function buildPrefsSchema(Schema) {
  return Schema.object({
    brand: Schema.any().default(PREFS_DEFAULT.brand),
    motion: Schema.any().default(PREFS_DEFAULT.motion),
    collapseFooter: Schema.any().default(PREFS_DEFAULT.collapseFooter),
    autoPopover: Schema.any().default(PREFS_DEFAULT.autoPopover),
    composerScope: Schema.any().default(PREFS_DEFAULT.composerScope),
    modelPicker: Schema.any().default(PREFS_DEFAULT.modelPicker),
    quickProviders: Schema.any().default(PREFS_DEFAULT.quickProviders),
    username: Schema.any().default(PREFS_DEFAULT.username),
    banLocale: Schema.any().default(PREFS_DEFAULT.banLocale),
    homeLayout: Schema.any().default(PREFS_DEFAULT.homeLayout),
    palette: Schema.any().default(PREFS_DEFAULT.palette),
    typeface: Schema.any().default(PREFS_DEFAULT.typeface),
    mascot: Schema.any().default(PREFS_DEFAULT.mascot),
    mascotScope: Schema.any().default(PREFS_DEFAULT.mascotScope),
    permissionsControl: Schema.any().default(PREFS_DEFAULT.permissionsControl),
    workspaceView: Schema.any().default(PREFS_DEFAULT.workspaceView),
    sidebarSearch: Schema.any().default(PREFS_DEFAULT.sidebarSearch),
    turnStatus: Schema.any().default(PREFS_DEFAULT.turnStatus),
    viewTabs: Schema.any().default(PREFS_DEFAULT.viewTabs),
  })
}

/**
 * Register the settings surface.
 * @param ctx - host plugin context.
 */
export function registerSettings(ctx) {
  // Settings integration.
  //
  // A host that owns the imperative registry registers a schema under its own
  // namespace name; 0.1.7 dropped `settings.register()` — a namespace IS this
  // entry's id and its schema IS the exported Config — so the only thing left
  // to declare is that the skin ships its own settings page, which is what
  // `configure({ auto: false })` says: without it a client that projects pages
  // from the schema would grow a second page beside ours.
  //
  // The wait is declarative (`ctx.inject`) because `settings` may mount after
  // this plugin. The inject callback deliberately returns nothing — a plain
  // object throws "Invalid effect" and would take the whole plugin down.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (scope) => {
      const settings = scope.settings
      if (settings === undefined || settings === null) return
      if (typeof settings.register !== 'function') {
        settingsNamespace = entryIdOf(ctx)
        if (typeof settings.configure !== 'function') return
        try {
          scope.effect(
            () => settings.configure({ auto: false }, ctx.fiber),
            'dsh-claude-style: settings presentation',
          )
        } catch (error) {
          ctx.logger?.warn?.(`dsh-claude-style: settings presentation unavailable: ${error?.message ?? error}`)
        }
        return
      }
      loadSchema().then((Schema) => {
        if (Schema === null) {
          ctx.logger?.warn?.('dsh-claude-style: @deepseek-ai/schemastery did not resolve; preferences fall back to defaults')
          return
        }
        try {
          settings.register(LEGACY_SETTINGS_NAMESPACE, buildPrefsSchema(Schema))
          settingsNamespace = LEGACY_SETTINGS_NAMESPACE
        } catch (error) {
          ctx.logger?.warn?.(`dsh-claude-style: settings namespace unavailable: ${error?.message ?? error}`)
        }
      }).catch((error) => {
        ctx.logger?.warn?.(`dsh-claude-style: settings schema import failed: ${error?.message ?? error}`)
      })
    })
  }
}
