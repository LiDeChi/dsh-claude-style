    /**
     * One token count the way Claude Code writes it: one decimal at most, a
     * whole number without its ".0", and a lowercase k — "109M", "4.4M",
     * "963.6k". The unit is picked on the rounded value, so a count just under
     * a million reads "1M", never "1000k". The turn status line, the usage
     * panel's stat cells and its model chart all print through this.
     */
    function formatCompactTokens(count) {
      const value = Number(count) || 0
      const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']]
      for (let u = 0; u < units.length; u++) {
        const scaled = Math.round(value / units[u][0] * 10) / 10
        if (scaled >= 1) return String(scaled) + units[u][1]
      }
      return String(Math.round(value))
    }
