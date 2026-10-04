/**
 * One path under the harness home, resolved the host's own way.
 *
 * The harness publishes its home directory through the `dshHomePath` service,
 * which joins the segments it is handed; when that service is absent or throws,
 * `$DSH_HOME` stands in, with `~/.dsh` behind it. Every host-half module that
 * touches stored sessions resolves through here, so the delete route, the usage
 * roll-up and the search index all read the same directory.
 *
 * @param ctx - host plugin context.
 * @param segments - path segments under the harness home.
 * @returns the resolved path.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

export function harnessPath(ctx, ...segments) {
  try {
    const resolvePath = ctx.get('dshHomePath')
    if (typeof resolvePath === 'function') {
      const value = resolvePath(...segments)
      if (typeof value === 'string' && value !== '') return value
    }
  } catch { /* no home-path service: the environment */ }
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), ...segments)
}
