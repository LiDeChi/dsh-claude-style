    /**
     * Deepy's sheet pipeline, split out of whale.js (D18): which address a
     * sheet plays from, and the cache the converted text lives in.
     *
     * Sheets ship as PNG (the format compresses this art best), but a vector is
     * rasterized at the size it is drawn and only that small bitmap is kept —
     * so the first time an animation is wanted, its sheet's pixels are rebuilt
     * here as SVG (one path per color, a row's runs of one color merged) and
     * the SVG is what plays. The text is cached under the sheet's own content
     * stamp (DEEPY_STAMPS, built from the sheet's bytes), so a sheet is
     * re-converted only when its own pixels change; a sheet that decodes yet
     * does not convert plays as the PNG it came from. A sheet that does not
     * load leaves its animation out and says so once: the host half serves the
     * sheets, and one that predates them answers 404.
     *
     * @param onReady - `onReady(key)`: a sheet became playable; the caller
     *     reads the state again and plays what it asks for.
     * @returns `{ ready, failed, url, dispose }`.
     */
    function createMascotWhaleSheets(onReady) {
      /** Cache API store for the generated SVG texts; entries key on the sheet's content stamp. */
      const SHEET_CACHE = 'dsh-claude-style-deepy'
      /** Bumped when the conversion below changes: cached vectors key on it too. */
      const CONVERTER_VERSION = 1
      /** The address each loaded sheet plays from. */
      const sheetUrls = new Map()
      /** Blob addresses handed out, revoked on dispose. */
      const objectUrls = []
      /** Sheet key → 'loading' | 'ready' | 'failed'. */
      const sheets = new Map()
      /** False once disposed: a conversion landing after the whale left is dropped. */
      let alive = true
      let cacheUsable = typeof caches !== 'undefined'

      function sheetUrl(key) {
        return `${DEEPY_ROUTE}${key}.png?v=${BUILD_ID}`
      }

      /** The cache address of a sheet's vector: its own stamp plus the converter's version. */
      function sheetCacheKey(key) {
        return `${location.origin}${DEEPY_ROUTE}${key}.svg?v=${DEEPY_STAMPS[key]}-${CONVERTER_VERSION}`
      }

      /** The cached SVG text for a sheet, or null on a miss. */
      async function sheetCacheRead(key) {
        if (!cacheUsable) return null
        try {
          const store = await caches.open(SHEET_CACHE)
          const hit = await store.match(sheetCacheKey(key))
          return hit === undefined ? null : hit.text()
        } catch (error) {
          // A cache that refuses is a cache that always misses: convert per load.
          cacheUsable = false
          console.warn("[dsh-claude-style] Deepy's sheet cache is unavailable; sheets convert once per page load instead.", error)
          return null
        }
      }

      function sheetCacheWrite(key, svg) {
        if (!cacheUsable) return
        caches.open(SHEET_CACHE).then(store => {
          // Stale stamps of this same sheet are dead weight: drop them on a write.
          store.keys().then(requests => {
            for (const request of requests) {
              if (request.url.includes(`${DEEPY_ROUTE}${key}.svg`) && request.url !== sheetCacheKey(key)) store.delete(request)
            }
          })
          store.put(sheetCacheKey(key), new Response(svg, { headers: { 'content-type': 'image/svg+xml' } }))
        }).catch(error => {
          // Same standing as a read refusal: the cache is a miss from here on.
          cacheUsable = false
          console.warn("[dsh-claude-style] Deepy's sheet cache refused a write; sheets convert once per page load instead.", error)
        })
      }

      /**
       * Rebuild a decoded sheet as SVG text: one path per color, each made of
       * a row's runs of that color. Transparent pixels are simply absent.
       */
      function vectorizeSheet(image) {
        const width = image.naturalWidth
        const height = image.naturalHeight
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const pen = canvas.getContext('2d')
        pen.drawImage(image, 0, 0)
        const data = pen.getImageData(0, 0, width, height).data
        /** Color string → the path chunks of its runs so far. */
        const paths = new Map()
        for (let y = 0; y < height; y++) {
          let x = 0
          while (x < width) {
            const at = (y * width + x) * 4
            const r = data[at]
            const g = data[at + 1]
            const b = data[at + 2]
            const a = data[at + 3]
            let end = x + 1
            while (end < width) {
              const next = (y * width + end) * 4
              if (data[next] !== r || data[next + 1] !== g || data[next + 2] !== b || data[next + 3] !== a) break
              end++
            }
            if (a !== 0) {
              const color = a === 255
                ? `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
                : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
              const chunk = `M${x} ${y}h${end - x}v1h${x - end}z`
              const known = paths.get(color)
              if (known === undefined) paths.set(color, [chunk])
              else known.push(chunk)
            }
            x = end
          }
        }
        const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`]
        for (const [color, chunks] of paths) parts.push(`<path fill="${color}" d="${chunks.join('')}"/>`)
        parts.push('</svg>')
        return parts.join('')
      }

      function sheetObjectUrl(text) {
        const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
        objectUrls.push(url)
        return url
      }

      /**
       * Resolve the address one sheet plays from: the cached vector text, a
       * fresh conversion of its pixels, or — when the sheet decodes but does
       * not convert — the PNG itself. Rejects only when the sheet does not
       * load at all.
       */
      async function prepareSheet(key) {
        const url = sheetUrl(key)
        const cached = await sheetCacheRead(key)
        if (cached !== null) return sheetObjectUrl(cached)
        const image = new Image()
        image.src = url
        await image.decode()
        try {
          const svg = vectorizeSheet(image)
          sheetCacheWrite(key, svg)
          return sheetObjectUrl(svg)
        } catch (error) {
          // The PNG fallback the reader asked for: the sheet plays as-is.
          console.warn(`[dsh-claude-style] Deepy's "${key}" sheet could not be vectorized; playing the PNG as-is.`, error)
          return url
        }
      }

      /**
       * Whether a sheet is ready to paint, starting its load the first time.
       * A sheet that does not load leaves its animation out and says so once:
       * the host half serves the sheets, and one that predates them answers 404.
       */
      function ready(key) {
        const known = sheets.get(key)
        if (known !== undefined) return known === 'ready'
        sheets.set(key, 'loading')
        prepareSheet(key).then(url => {
          sheetUrls.set(key, url)
          sheets.set(key, 'ready')
          if (alive) onReady(key)
        }, () => {
          // The host half did not serve the sheet: the animation stays out.
          sheets.set(key, 'failed')
          console.warn(`[dsh-claude-style] Deepy's "${key}" sheet did not load from ${sheetUrl(key)}; the host half serves it, so restart the host after an update.`)
        })
        return false
      }

      /** Whether a sheet's load already failed: an animation that will never come. */
      function failed(key) {
        return sheets.get(key) === 'failed'
      }

      /** The address a ready sheet plays from. */
      function url(key) {
        return sheetUrls.get(key)
      }

      function dispose() {
        alive = false
        for (const address of objectUrls) URL.revokeObjectURL(address)
        objectUrls.length = 0
        sheetUrls.clear()
      }

      return { ready, failed, url, dispose }
    }
