    /**
     * The other owner of this page, and whether it is on it right now.
     *
     * Two documented attributes answer it, and either one is enough:
     *
     *   html[data-dsh-skin]      the skin center stamps it while a skin is
     *                             painting. The skin center injects it into
     *                             the served document, so the answer holds
     *                             from the first frame (D49).
     *   body[data-we-wallpaper]  the delegated wallpaper plugin stamps it while
     *                             a wallpaper renders (D49).
     *
     * The skin center does not stamp its attribute for this theme's own row:
     * selecting this theme means the page has no skin on it, which is what
     * leaves the page free for the theme to take.
     */
    function externalOwnerActive() {
        const doc = document
        if (doc.documentElement?.hasAttribute(SKIN_STAMP_ATTR) === true) return true
        return doc.body?.hasAttribute(WALLPAPER_ACTIVE_ATTR) === true
    }

    /**
     * Watch the other owner, and hear when it arrives or leaves.
     *
     * Both attributes are read; nothing is written. The callback fires once
     * immediately with the current answer, so a page that boots while a skin
     * or a wallpaper already owns it never paints a frame of this theme first,
     * then only on a real flip. The observer is the third exception to the
     * single-scheduler rule (D40): it waits on two attributes of the
     * document, outside this package's own subtree.
     *
     * @param {function(boolean): void} listener called with the new answer
     * @returns {function(): void} unsubscribe
     */
    function subscribeExternalOwner(listener) {
        let last = externalOwnerActive()
        const observer = new MutationObserver(() => {
            const next = externalOwnerActive()
            if (next === last) return
            last = next
            listener(next)
        })
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: [SKIN_STAMP_ATTR],
        })
        if (document.body !== null) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: [WALLPAPER_ACTIVE_ATTR],
            })
        }
        return () => observer.disconnect()
    }
