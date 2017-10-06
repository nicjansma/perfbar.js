// ==UserScript==
// @name         server-timing-plugin.js
// @version      0.1
// @grant        none
// @run-at       document-start
// @include      *
// @noframes
// ==/UserScript==

(function() {

  (function () {
    BOOMR = window.BOOMR || {};
    BOOMR.plugins = BOOMR.plugins || {};
    if (BOOMR.plugins.ServerTiming) {
      return;
    }

    var impl = {
      calculated: false
    };

    BOOMR.plugins.ServerTiming = {
      init: function (config) {
        return this;
      },

      is_complete: function () {
        if (!impl.calculated) {
          impl.calculated = true

          BOOMR.plugins.ServerTiming.edge = calculateEdgeTime(performance.getEntriesByType('navigation')[0])
          BOOMR.plugins.ServerTiming.edge_res = performance.getEntriesByType('resource').reduce(function (acc, entry) {
            acc += calculateEdgeTime(entry)
            return acc
          }, 0)

          let resourceCount = 0, browser_count = 0, edge_count = 0, origin_count = 0, offloadBytes = 0, im_bytes = 0
          performance.getEntriesByType('resource').forEach(function (entry) {
            resourceCount++
            if (cachedInBrowser(entry)) {
              browser_count++
            } else {
              const bytes = (entry.transferSize || entry.encodedBodySize)
              const disk = findEntry(entry.serverTiming, 'disk')
              if (disk) {
                const orig = Number(disk.description)
                if (orig > bytes) {
                  im_bytes += orig - bytes
                }
              }
              if (cachedAtEdge(entry)) {
                edge_count++
                offloadBytes += bytes
              } else {
                origin_count++
              }
            }
          })
          BOOMR.plugins.ServerTiming.from = {
            browser: browser_count / resourceCount,
            edge: edge_count / resourceCount,
            origin: origin_count / resourceCount,
          }

          if (origin_count) {
            BOOMR.plugins.ServerTiming.offload_percent = edge_count / (edge_count + origin_count)
          }
          BOOMR.plugins.ServerTiming.offload_bytes = offloadBytes

          BOOMR.plugins.ServerTiming.im_bytes = im_bytes

          console.warn('BOOMR.plugins.ServerTiming', BOOMR.plugins.ServerTiming)
        }
        return true
      }
    };

    function calculateEdgeTime({serverTiming}) {
      let duration = 0
      const cret = findEntry(serverTiming, 'cret')
      if (cret) duration += (cret.duration || cret.value)
      const ctt = findEntry(serverTiming, 'ctt')
      if (ctt) duration += (ctt.duration || ctt.value)
      return duration
    }

    function findEntry(serverTiming, entryName) {
      return serverTiming.find(function ({name, metric}) {
        return name === entryName || metric === entryName
      })
    }

    function hasPermissiveTAO(rt) {
      return rt.encodedBodySize > 0
    }

    function cachedInBrowser(rt) {
      return hasPermissiveTAO(rt)
          ? rt.transferSize === 0
          : rt.duration < 30
    }

    function cachedAtEdge(rt) {
      let origin
      const entry = findEntry(rt.serverTiming, 'origin')
      if (entry) {
        origin = entry.description === 'true'
      }
      return origin === false
    }

  }());

})()
