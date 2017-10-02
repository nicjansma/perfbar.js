// ==UserScript==
// @name         PerfBar
// @namespace    http://nicj.net
// @version      0.1
// @author       Nic Jansma, Charlie Vazac
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// @include      *
// @noframes
// ==/UserScript==

// alias unsafeWindow
var UW = unsafeWindow;

//
// Boomerang FPS pre-script
//
(function() {
    if (window.requestAnimationFrame) {
        UW.BOOMR = UW.BOOMR || {};
        UW.BOOMR.fpsLog = [];

        function frame() {
            if (!UW.BOOMR.version && UW.BOOMR.fpsLog) {
                UW.BOOMR.fpsLog.push(Math.round(window.performance.now()));

                // if we've added more than 30 seconds of data, stop
                if (UW.BOOMR.fpsLog.length > 30 * 60) {
                    return;
                }

                window.requestAnimationFrame(frame);
            }
        }

        window.requestAnimationFrame(frame);
    }
})();

(function() {
    //
    // Utility functions
    //
    function setState(name, value) {
        GM_setValue("perfbar-" + name, value);
    }

    function getState(name) {
        return GM_getValue("perfbar-" + name);
    }

    //
    // Local Members
    //
    var initialized = false;

    //
    // Constants
    //

    // toolbar dimensions
    var TOOLBAR_HEIGHT = 30;
    var TOOLBAR_HEIGHT_LOADING = 50;

    // how long event handlers will wait before being registered
    var DELAY_FRAMEWORK_HANDLER_MS = 10000;

    // Continuity: How long to wait after Onload to calculate TTI
    UW.CONTINUITY_WAIT_AFTER_ONLOAD = 30000;

    //
    // Toolbar
    //
    var toolBar = (function() {
        //
        // Local members
        //

        // toolbar div
        var toolBar$;

        // toolbar top
        var toolBarTop = 0;

        // each section
        var sections = [];

        var $ = UW.jQuery;

        /**
         * Initializes the graph
         */
        function init() {
            if (toolBar$) {
                return;
            }

            $ = UW.jQuery;

            cssobj({
                "#perfbar": {
                    color: "white",
                    "font-size": "12px",
                    "font-family": "Monaco,Menlo,Consolas,\"Courier New\",monospace",
                    "line-height": "18px",
                    margin: 0,
                    padding: 0,
                    position: 'fixed',
                    "z-index": Number.MAX_SAFE_INTEGER,
                    background: "#404040",
                    opacity: 0.9,
                    "box-shadow": "inset 0 0 10px 1px #000"
                },
                ".perfbar-section": {
                    display: "inline-block",
                    height: "100%",
                    padding: "5px 0 0 5px",
                    "margin-left": "5px",
                    "border-left": "solid 2px #ccc",
                    "&:first-child": {
                        "border-left": "none",
                        "margin-left": 0,
                    }
                },
                ".perfbar-section-title": {
                    display: "inline-block",
                    "font-weight": "bold"
                },
                ".perfbar-component": {
                    display: "inline-block",
                    padding: "0 5px 0 5px",
                    "border-right": "1px solid #aaa",
                    "&:last-child": {
                        "border-right": "none"
                    }
                },
                ".perfbar-component-title": {
                    display: "inline-block",
                    color: "#aaa",
                    padding: "0 5px 0 0"
                },
                ".perfbar-component-value": {
                    display: "inline-block",
                    "font-weight": "bold",
                    padding: "0 5px 0 0",
                    "transition": "all 0.3s ease"
                },
                "button.perfbar-button": {
                    display: "inline-block",
                    height: "22px",
                    margin: "0 5px 0 5px",
                    padding: "0 5px",
                    "font-size": "12px",
                    background: "#999",
                    border: "1px solid #666",
                    "&.active": {
                        background: "green",
                    },
                    "transition": "background 0.3s ease"
                },
                ".context-menu-input>label>input[type=checkbox], .context-menu-input>label>input[type=radio]": {
                    display: "inline-block"
                },
                ".context-menu-list > li.context-menu-item": {
                    "font-size": "12px",
                    "font-family": "Monaco,Menlo,Consolas,\"Courier New\",monospace",
                }
            });

            var initialHeight = document.readyState === "complete" ? TOOLBAR_HEIGHT : TOOLBAR_HEIGHT_LOADING;

            // graph template
            toolBar$ = $('<div id="perfbar">')
                .css({
                    height: initialHeight,
                    top: $(window).height() - initialHeight
                });

            // fill the screen width
            toolBar$.width(screen.width);

            // add our graph to the body
            $('body').prepend(toolBar$);

            // Make sure to update the height on resize
            $(window).resize(updateToolbarHeight);

            if (document.readyState !== "complete") {
                $(window).load(function() {
                    // resize to regular height
                    toolBar$.height(TOOLBAR_HEIGHT);

                    updateToolbarHeight();
                });
            }
        }

        function updateToolbarHeight() {
            if (!toolBar$) {
                return;
            }

            // recalculate the top to position it on layout change
            var top = $(window).height() - toolBar$.height();
            if (top != toolBarTop) {
                toolBarTop = top;
                toolBar$.css("top", toolBarTop + "px");
            }
        }

        function register(section, components, css) {
            if (!sections[section]) {
                // create the dom
                var section$ = $("<div>").addClass("perfbar-section").css(css || {});

                sections[section] = {
                    components: {},
                    $: section$
                };

                toolBar$.append(sections[section].$);

                (components || []).forEach(function(comp) {
                    var name = comp.name ? comp.name : comp;
                    var title = comp.title ? comp.title : name;

                    // create the dom
                    var div$ = $("<div>").addClass("perfbar-component");
                    div$.append($("<div>").addClass("perfbar-component-title").text(name).attr('title', title));
                    div$.append($("<div>").addClass("perfbar-component-value").text("--").attr('title', title));

                    sections[section].components[name] = {
                        $: div$
                    };

                    sections[section].$.append(sections[section].components[name].$);
                });
            }
        }

        function update(section, component, text, css) {
            var el$ = sections[section].components[component].$.find(".perfbar-component-value");

            // pop new values in first with a change of color
            if (el$.text() != text && !css) {
                el$.css("color", "#0d0");

                setTimeout(function() {
                    el$.css("color", "white");
                }, 1000);
            }

            el$.css("text-decoration", "underline");

            setTimeout(function() {
                el$.css("text-decoration", "none");
            }, 1000);

            if (css) {
                el$.css(css);
            }

            el$.text(text);
        }

        function addButton(name, callback) {
            // create the dom
            var div$ = $("<button>").addClass("perfbar-button").text(name);

            toolBar$.append(div$);

            if (callback) {
                div$.on("click", callback);
            }

            return div$;
        }

        function addContextMenu(section, component, callback) {
            if (!sections[section].components[component].$.contextMenu) {
                setTimeout(function() {
                    addContextMenu(section, component, callback);
                }, 100);

                return;
            }

            sections[section].components[component].$
                .contextMenu({
                    selector: "*",
                    trigger: 'hover',
                    build: callback
                });
        }

        return {
            init: init,
            register: register,
            update: update,
            addButton: addButton,
            addContextMenu: addContextMenu
        };
    })();

    //
    // Components
    //
    var components = [];

    //
    // Timings
    //
    components.push((function(tb) {
        var metricUpdated = {};

        function updateTiming(name, start, end) {
            if (metricUpdated[name]) {
                return;
            }

            if (start && end) {
                tb.update("Timings", name, end - start);

                metricUpdated[name] = true;
            }
        }
        function updateReq() {
            let edgeTime = 0
            for (const {name: url, serverTiming} of performance.getEntriesByType('navigation')) {
                for (const {name, metric, duration, value} of (serverTiming || [])) {
                    if (['cret', 'ctt'].indexOf(name || metric) !== -1) {
                        edgeTime += (typeof duration !== 'undefined' ? duration : value)
                    }
                }
            }

            if (!edgeTime) {
                updateTiming("Req", performance.timing.requestStart, performance.timing.responseStart);
            } else {
                tb.update("Timings", "Req", `${performance.timing.responseStart - performance.timing.requestStart} (${edgeTime})`)
            }
        }

        function init() {
            tb.register("Timings", [
                {name: "DNS", title: "Domain Name Loopup Duration"},
                {name: "TCP", title: "TCP Connection Duration"},
                {name: "Req", title: "HTTP Request Time (responseStart - requestStart)"},
                {name: "Res", title: "HTTP Response Time (responseEnd - responseStart)"}
            ]);

            // these should all be ready on startup
            updateTiming("DNS", performance.timing.domainLookupStart, performance.timing.domainLookupEnd);
            updateTiming("TCP", performance.timing.connectStart, performance.timing.connectEnd);
            updateReq()
            updateTiming("Res", performance.timing.responseStart, performance.timing.responseEnd);
        }

        return {
            init: init
        };
    })(toolBar));

    //
    // Events
    //
    components.push((function(tb) {
        var metricUpdated = {};

        function updateTiming(name, start, end) {
            if (metricUpdated[name]) {
                return;
            }

            if (start && end) {
                tb.update("Events", name, end - start);

                metricUpdated[name] = true;
            }
        }

        function updateTimings() {
            var tti = UW.BOOMR && UW.BOOMR.plugins && UW.BOOMR.plugins.Continuity && UW.BOOMR.plugins.Continuity.metrics.timeToInteractive && UW.BOOMR.plugins.Continuity.metrics.timeToInteractive();
            var ttvr = UW.BOOMR && UW.BOOMR.plugins && UW.BOOMR.plugins.Continuity && UW.BOOMR.plugins.Continuity.metrics.timeToVisuallyReady && UW.BOOMR.plugins.Continuity.metrics.timeToVisuallyReady();

            var firstPaint = UW.performance.getEntriesByType('paint').find(function({name}) { return name === 'first-paint' })
            firstPaint && updateTiming("FP", performance.timing.navigationStart, performance.timing.navigationStart + Math.round(firstPaint.startTime))

            var firstContentfulPaint = UW.performance.getEntriesByType('paint').find(function({name}) { return name === 'first-contentful-paint' })
            firstContentfulPaint && updateTiming("FCP", performance.timing.navigationStart, performance.timing.navigationStart + Math.round(firstContentfulPaint.startTime))

            updateTiming("DCL", performance.timing.navigationStart, performance.timing.domContentLoadedEventStart);
            updateTiming("Load", performance.timing.navigationStart, performance.timing.loadEventStart);

            if (ttvr) {
                updateTiming("TTVR", performance.timing.navigationStart, performance.timing.navigationStart + ttvr);
            }

            if (tti) {
                updateTiming("TTI", performance.timing.navigationStart, performance.timing.navigationStart + tti);
            }

            if (!performance.timing.loadEventStart || !tti) {
                setTimeout(updateTimings, 100);
            }
        }

        function init() {
            tb.register("Events", [
                {name: "FP", title: "First Paint"},
                {name: "FCP", title: "First Contentful Paint"},
                {name: "DCL", title: "DOMContentLoaded"},
                {name: "TTVR", title: "Time to Visually Ready"},
                {name: "Load", title: "Load Time"},
                {name: "TTI", title: "Time to Interactive"}
            ]);

            setTimeout(updateTimings, 100);
        }

        return {
            init: init
        };
    })(toolBar));

    //
    // Realtime
    //
    components.push((function(tb) {
        //
        // Local Members
        //
        var initialized = false;

        // total frames seen
        var totalFrames = 0;

        // time we started monitoring
        var frameStartTime = performance.now();

        // rage clicks
        var rageClicks = [];

        if (!BOOMR.longTasks) {
            BOOMR.longTasks = [];
        }
        var longTasks = BOOMR.longTasks;

        /**
         * requestAnimationFrame callback
         */
        function frame() {
            totalFrames++;

            // request the next frame
            window.requestAnimationFrame(frame);
        }

        function reportFps() {
            var seconds = (performance.now() - frameStartTime) / 1000;
            var fps = Math.round(totalFrames / seconds);

            tb.update("Realtime", "FPS", fps, {
                color: fps > 40 ? "#0d0" : (fps > 20 ? "#ffd400" : "#f00")
            });

            totalFrames = 0;
            frameStartTime = performance.now();
        }

        function onRageClick(e) {
            var path = "";
            var node = jQuery(e.target);
            var stop = false;

            while (node.length && !stop) {
                var realNode = node[0];
                var name = realNode.localName;

                if (!name) {
                    break;
                }

                name = name.toLowerCase();

                // if it has an ID, stop here
                if (node.attr('id')) {
                    name = name + "#" + node.attr('id');
                    stop = true;
                }

                if (node.attr('class')) {
                    name = name + "." + node.attr('class').trim().split(" ")[0].trim();;
                }

                var parent = node.parent();

                path = name + (path ? '>' + path : '');
                node = parent;
            }

            rageClicks.push({
                when: performance.now(),
                x: e.clientX,
                y: e.clientY,
                path: path
            });

            if (BOOMR.sendMetric) {
                BOOMR.sendMetric("Rage Clicks", 1);
            }

            tb.update("Realtime", "Rage Clicks", rageClicks.length, {
                color: "red"
            });
        }

        function onPerformanceObserver(list) {
			var entries = list.getEntries();
			Array.prototype.push.apply(longTasks, entries);

            if (BOOMR.sendMetric) {
                BOOMR.sendMetric("LongTasks", entries.length);
            }

            // add to the timeline
            if (initialized) {
                tb.update("Realtime", "LongTasks", longTasks.length, {
                    color: "red"
                });
            }
		}

        // PerformanceObserver
        var perfObserver = new UW.PerformanceObserver(onPerformanceObserver);
        perfObserver.observe({ entryTypes: ["longtask"] });

        // start out the first frame
        window.requestAnimationFrame(frame);

        function init() {
            initialized = true;
            tb.register("Realtime", [
                {name: "FPS", title: "Frames Per Second"},
                {name: "LongTasks", title: "Long Tasks"},
                {name: "Rage Clicks", title: "Rage Clicks"}
            ]);

            tb.addContextMenu("Realtime", "LongTasks", function(menuButton$) {
                var items = {
                    self: { name: "Self", items: {} },
                    "same-origin": { name: "Same-Origin", items: {} },
                    "cross-origin": { name: "Cross-Origin", items: {} },
                    "multiple-contexts": { name: "Multiple Contexts", items: {} },
                    "unknown": { name: "Unknown", items: {} },
                };

                var i = 0;
                longTasks.forEach(function(longTask) {
                    var which = longTask.name;
                    if (which.indexOf('cross-origin') !== -1) {
                        which = 'cross-origin';
                    } else if (which.indexOf('same-origin') !== -1) {
                        which = 'cross-origin';
                    }

                    var desc = "";
                    if (longTask && longTask.attribution && longTask.attribution.length) {
                        var attr = longTask.attribution[0];
                        desc = attr.containerType ? longTask.attribution[0].containerType : "";

                        if (attr.containerId) {
                            desc += " " + attr.containerId;
                        }

                        if (attr.containerName) {
                            desc += " " + attr.containerName;
                        }

                        if (attr.containerSrc) {
                            var src = attr.containerSrc.replace(/https?:\/\//, "");
                            desc += " " + src.substr(0, src.indexOf("/"));
                        }
                    }

                    if (!items[which]) {
                        return;
                    }

                    items[which].items["item" + (++i)] = {
                        name: longTask.duration + "ms (" + desc + ")"
                    };
                });

                for (var itemName in items) {
                    if (Object.keys(items[itemName].items).length === 0) {
                        delete items[itemName];
                    }
                }

                return {
                    items: items,
                    position: function(opt){
                        // Position using jQuery.ui.position
                        // http://api.jqueryui.com/position/
                        opt.$menu
                            .position({ my: "center bottom", at: "center top", of: menuButton$})
                            .css("position", "fixed");
                    }
                };
            });

            tb.addContextMenu("Realtime", "Rage Clicks", function(menuButton$) {
                var items = {};

                if (!rageClicks.length) {
                    return false;
                }

                var i = 0;
                rageClicks.forEach(function(rageClick) {
                    items["item" + (++i)] = {
                        name: rageClick.path + " @ " + Math.round(rageClick.when) + "ms"
                    };
                });

                return {
                    items: items,
                    position: function(opt){
                        // Position using jQuery.ui.position
                        // http://api.jqueryui.com/position/
                        opt.$menu
                            .position({ my: "center bottom", at: "center top", of: menuButton$})
                            .css("position", "fixed");
                    }
                };
            });

            if (UW.BOOMR && UW.BOOMR.subscribe) {
                UW.BOOMR.subscribe("rage_click", onRageClick);
            } else {
                document.addEventListener("onBoomerangLoaded", function() {
                    UW.BOOMR.subscribe("rage_click", onRageClick);
                });
            }

            setInterval(reportFps, 1000);
        }

        return {
            init: init
        };
    })(toolBar));

    //
    // Resources
    //
    components.push((function(tb) {
        var resLength = 0;

        function updateResources() {
            var resources = UW.BOOMR.plugins.ResourceTiming.getFilteredResourceTiming();

            if (resources.entries.length != resLength) {
                tb.update("Resources", "#", resources.entries.length);

                tb.update("Resources", "KB", Math.floor(resources.entries.reduce(function(sum, res) {
                    return sum + (res.transferSize ? res.transferSize : 0);
                }, 0) / 1024));

                tb.update("Resources", "TAO", Math.round(resources.entries.reduce(function(sum, res) {
                    return sum + (res.encodedBodySize > 0 ? 1 : 0);
                }, 0) / resources.entries.length * 100) + "%");

                tb.update("Resources", "Cached", Math.round(resources.entries.reduce(function(sum, res) {
                    // TODO: Should we only use TAO?
                    var cached = (res.encodedBodySize > 0 && res.transferSize === 0) || (res.duration < 30);

                    return sum + (cached ? 1 : 0);
                }, 0) / resources.entries.length * 100) + "%");

                resLength = resources.entries.length;
            }

            setTimeout(updateResources, 1000);
        }

        function init() {
            tb.register("Resources", [
                {name: "#", title: "Resource Count"},
                {name: "KB", title: "Transfer Size (KB)"},
                {name: "TAO", title: "Same-Origin or resources with Timing-Allow-Origin set"},
                {name: "Cached", title: "Same-Origin or TAO resources that are cached"},
                {name: "Offload %", title: "Edge Offload %"},
                {name: "Offload KB", title: "Edge Offload KB"},
                {name: "Edge", title: "Edge ???"}
            ]);

            document.addEventListener("onBoomerangLoaded", function({detail: {BOOMR}}) {
                BOOMR.subscribe("onbeacon", function({t_other, ...beacon}) {
                    if (beacon.hasOwnProperty('cmet.offload')) {
                      tb.update("Resources", "Offload KB", Math.round(beacon['cmet.offload'] / 1000))
                    }
                    t_other.split(',').find(function(section) {
                      var data = section.split('|')
                      if (data[0] === 'custom0') {
                        tb.update("Resources" ,"Edge", data[1])
                        return true
                      }
                    })
                })
            })

            updateResources();
        }

        return {
            init: init
        };
    })(toolBar));

    //
    // Controls
    //
    components.push((function(tb) {
        //
        // Jank
        //
        var jankInterval = false;

        function busy(ms) {
            var startTime = (new Date()).getTime();
            var now = startTime;
            var endTime = startTime + ms;
            var math = 1;

            while (now < endTime) {
                now = (new Date()).getTime();
                math *= 2;
                math *= 0.5;
            }
        }

        function jank() {
            busy(300);
        }

        function toggleJank() {
            var scrollJank = busy.bind(undefined, 25);
            if (jankInterval) {
                clearInterval(jankInterval);
                jankInterval = false;
                window.removeEventListener('scroll', scrollJank);

                // save state
                setState("jank", false);
            } else {
                jankInterval = setInterval(jank, 500);
                window.addEventListener('scroll', scrollJank);

                // save state
                setState("jank", true);
            }
        }

        function toggleDelayFrameworkHandlers() {
            setState("delayFrameworkHandlers", getState("delayFrameworkHandlers") ? false : true);
        }

        function toggleDisableEdgeCache() {
          const cookieName = 'AK_FORCE_ORIGIN'
          var force = readCookie(cookieName)
          if (force === 'true') {
            return createCookie(cookieName, '', -1);
          }
          createCookie(cookieName, 'true', 1)
        }

        function toggleShowCacheStatus() {
            setState("cacheStatus", getState("cacheStatus") ? false : true);
        }

        function readCookie(name) {
          var nameEQ = name + "=";
          var ca = document.cookie.split(';');
          for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) == ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
          }
          return null;
        }

      function createCookie(name,value,days) {
        var expires = "";
        if (days) {
          var date = new Date();
          date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
          expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + value + expires + "; path=/";
      }

      function init() {
            if (!UW.jQuery || !UW.jQuery.contextMenu) {
                setTimeout(init, 100);
                return;
            }

            var menuButton$ = tb.addButton("Menu");

            menuButton$.addClass("perfbar-context-menu")
                .parent().contextMenu({
                    selector: ".perfbar-context-menu",
                    trigger: 'left',
                    build: function(triggerElement$, e) {
                        return {
                            items: {
                                "jank": {
                                    name: "Add Jank",
                                    type: "checkbox",
                                    events: { click: toggleJank },
                                    selected: jankInterval
                                },
                                "delayFrameworks": {
                                    name: "Delay Framework Handlers During Load",
                                    type: "checkbox",
                                    events: { click: toggleDelayFrameworkHandlers },
                                    selected: getState("delayFrameworkHandlers"),
                                },
                                "disableEdgeCache": {
                                    name: "Disable Edge Cache",
                                    type: "checkbox",
                                    events: { click: toggleDisableEdgeCache },
                                    selected: readCookie('AK_FORCE_ORIGIN') === 'true'
                                },
                                "showCacheStatus": {
                                    name: "Show Cache Status",
                                    type: "checkbox",
                                    events: { click: toggleShowCacheStatus },
                                    selected: getState("cacheStatus"),
                                }
                            },
                            position: function(opt){
                                // Position using jQuery.ui.position
                                // http://api.jqueryui.com/position/
                                opt.$menu
                                    .position({ my: "right bottom", at: "right top-10", of: menuButton$})
                                    .css("position", "fixed");
                            }
                        };
                    }
                });
        }

        //
        // Initialize
        //
        if (getState("jank")) {
            toggleJank();
        }

        return {
            init: init
        };
    })(toolBar));

    //
    // General initialization
    //
    function init() {
        if (initialized) {
            return;
        }

        if (!UW.jQuery || !UW.cssobj) {
            // try again soon
            setTimeout(init, 100);
            return;
        }

        if (!UW.BOOMR || !UW.BOOMR.plugins) {
            initEmbeddedBoomerang();
        }

        toolBar.init();

        for (var i = 0; i < components.length; i++) {
            try {
                components[i].init();
            } catch (e) {
                console.error(e);
            }
        }

        initialized = true;
    }

    // check to see if we can initialize as soon as the readystate changes
    document.addEventListener('readystatechange', init, false);

    //
    // PerfBar Options
    //

    //
    // Shows Cache Status overlay
    //
    if (getState("cacheStatus")) {
      window.addEventListener("load", function () {
        Array.prototype.forEach.call(document.getElementsByTagName('img'), function (img) {
          var entry = performance.getEntriesByName(img.src)[0]
          if (!entry) return

          img.style.opacity = '0.5'
          if (cachedInBrowser(entry)) {
            img.style.border = 'solid 3px green'
          } else if (cachedAtEdge(entry)) {
            img.style.border = 'solid 3px blue'
          } else {
            img.style.border = 'solid 3px red'
          }
        })

        function cachedInBrowser({requestStart, responseStart, transferSize}) {
          return transferSize === 0 || (responseStart - requestStart < 20)
        }

        function cachedAtEdge({name, serverTiming}) {
          var origin
          (serverTiming || []).forEach(function (st) {
            if (st.name === 'origin' || st.metric === 'origin') {
              origin = st.description === 'true'
            }
          })
          return origin === false
        }
      })
    }

    //
    // Delays Framework initialization
    //
    if (getState("delayFrameworkHandlers")) {
        var ael = EventTarget.prototype.addEventListener;
        var delayedEvents = ['click'], delay = DELAY_FRAMEWORK_HANDLER_MS;

        EventTarget.prototype.addEventListener = function() {
            var _this = this, args = arguments;
            var eventName = arguments[0];

            function isAttached(elem) {
                if (!elem) return false
                if (typeof elem.nodeType === 'undefined') return true
                if (elem.nodeType === 9) return true
                return isAttached(elem.parentNode)
            }

            var perfbar = document.getElementById('perfbar')
            if (delayedEvents.indexOf(arguments[0]) === -1 ||
                (perfbar && perfbar.contains(this)) ||
                !isAttached(this)) {
                ael.apply(_this, args);
                return;
            }

            setTimeout(function() {
                ael.apply(_this, args);
                _this.removeEventListener(eventName, rage);
            }, delay)

            var rage = function(e) {
                e.stopPropagation();
                if (!_this.style) {
                    return;
                }

                var elem = _this;
                if (elem.tagName.toLowerCase() === 'a') {
                    elem = elem.parentNode;
                }

                elem['old-border'] = elem['old-border'] || elem.style.border;
                elem.style.border = 'solid 1px red';
                setTimeout(function() {
                    elem.style.border = elem['old-border'];
                }, 500);
            }

            ael.call(_this, eventName, rage);
        }
    }
})();

//
// ==================================================================
// External Dependencies:
// 1. jQuery
// 2. CSSOM
// 3. Boomerang plugins (ResTiming, Continuity)
// ==================================================================
//

// 1. jQuery - load after onload to ensure we don't overwrite the page's version
window.addEventListener("load", function(event) {
    if (typeof UW.jQuery === "undefined") {
        /*! jQuery v2.2.4 | (c) jQuery Foundation | jquery.org/license */
        !function(a,b){"object"==typeof module&&"object"==typeof module.exports?module.exports=a.document?b(a,!0):function(a){if(!a.document)throw new Error("jQuery requires a window with a document");return b(a)}:b(a)}("undefined"!=typeof UW?UW:this,function(a,b){var c=[],d=a.document,e=c.slice,f=c.concat,g=c.push,h=c.indexOf,i={},j=i.toString,k=i.hasOwnProperty,l={},m="2.2.4",n=function(a,b){return new n.fn.init(a,b)},o=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,p=/^-ms-/,q=/-([\da-z])/gi,r=function(a,b){return b.toUpperCase()};n.fn=n.prototype={jquery:m,constructor:n,selector:"",length:0,toArray:function(){return e.call(this)},get:function(a){return null!=a?0>a?this[a+this.length]:this[a]:e.call(this)},pushStack:function(a){var b=n.merge(this.constructor(),a);return b.prevObject=this,b.context=this.context,b},each:function(a){return n.each(this,a)},map:function(a){return this.pushStack(n.map(this,function(b,c){return a.call(b,c,b)}))},slice:function(){return this.pushStack(e.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(a){var b=this.length,c=+a+(0>a?b:0);return this.pushStack(c>=0&&b>c?[this[c]]:[])},end:function(){return this.prevObject||this.constructor()},push:g,sort:c.sort,splice:c.splice},n.extend=n.fn.extend=function(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=!1;for("boolean"==typeof g&&(j=g,g=arguments[h]||{},h++),"object"==typeof g||n.isFunction(g)||(g={}),h===i&&(g=this,h--);i>h;h++)if(null!=(a=arguments[h]))for(b in a)c=g[b],d=a[b],g!==d&&(j&&d&&(n.isPlainObject(d)||(e=n.isArray(d)))?(e?(e=!1,f=c&&n.isArray(c)?c:[]):f=c&&n.isPlainObject(c)?c:{},g[b]=n.extend(j,f,d)):void 0!==d&&(g[b]=d));return g},n.extend({expando:"jQuery"+(m+Math.random()).replace(/\D/g,""),isReady:!0,error:function(a){throw new Error(a)},noop:function(){},isFunction:function(a){return"function"===n.type(a)},isArray:Array.isArray,isWindow:function(a){return null!=a&&a===a.window},isNumeric:function(a){var b=a&&a.toString();return!n.isArray(a)&&b-parseFloat(b)+1>=0},isPlainObject:function(a){var b;if("object"!==n.type(a)||a.nodeType||n.isWindow(a))return!1;if(a.constructor&&!k.call(a,"constructor")&&!k.call(a.constructor.prototype||{},"isPrototypeOf"))return!1;for(b in a);return void 0===b||k.call(a,b)},isEmptyObject:function(a){var b;for(b in a)return!1;return!0},type:function(a){return null==a?a+"":"object"==typeof a||"function"==typeof a?i[j.call(a)]||"object":typeof a},globalEval:function(a){var b,c=eval;a=n.trim(a),a&&(1===a.indexOf("use strict")?(b=d.createElement("script"),b.text=a,d.head.appendChild(b).parentNode.removeChild(b)):c(a))},camelCase:function(a){return a.replace(p,"ms-").replace(q,r)},nodeName:function(a,b){return a.nodeName&&a.nodeName.toLowerCase()===b.toLowerCase()},each:function(a,b){var c,d=0;if(s(a)){for(c=a.length;c>d;d++)if(b.call(a[d],d,a[d])===!1)break}else for(d in a)if(b.call(a[d],d,a[d])===!1)break;return a},trim:function(a){return null==a?"":(a+"").replace(o,"")},makeArray:function(a,b){var c=b||[];return null!=a&&(s(Object(a))?n.merge(c,"string"==typeof a?[a]:a):g.call(c,a)),c},inArray:function(a,b,c){return null==b?-1:h.call(b,a,c)},merge:function(a,b){for(var c=+b.length,d=0,e=a.length;c>d;d++)a[e++]=b[d];return a.length=e,a},grep:function(a,b,c){for(var d,e=[],f=0,g=a.length,h=!c;g>f;f++)d=!b(a[f],f),d!==h&&e.push(a[f]);return e},map:function(a,b,c){var d,e,g=0,h=[];if(s(a))for(d=a.length;d>g;g++)e=b(a[g],g,c),null!=e&&h.push(e);else for(g in a)e=b(a[g],g,c),null!=e&&h.push(e);return f.apply([],h)},guid:1,proxy:function(a,b){var c,d,f;return"string"==typeof b&&(c=a[b],b=a,a=c),n.isFunction(a)?(d=e.call(arguments,2),f=function(){return a.apply(b||this,d.concat(e.call(arguments)))},f.guid=a.guid=a.guid||n.guid++,f):void 0},now:Date.now,support:l}),"function"==typeof Symbol&&(n.fn[Symbol.iterator]=c[Symbol.iterator]),n.each("Boolean Number String Function Array Date RegExp Object Error Symbol".split(" "),function(a,b){i["[object "+b+"]"]=b.toLowerCase()});function s(a){var b=!!a&&"length"in a&&a.length,c=n.type(a);return"function"===c||n.isWindow(a)?!1:"array"===c||0===b||"number"==typeof b&&b>0&&b-1 in a}var t=function(a){var b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u="sizzle"+1*new Date,v=a.document,w=0,x=0,y=ga(),z=ga(),A=ga(),B=function(a,b){return a===b&&(l=!0),0},C=1<<31,D={}.hasOwnProperty,E=[],F=E.pop,G=E.push,H=E.push,I=E.slice,J=function(a,b){for(var c=0,d=a.length;d>c;c++)if(a[c]===b)return c;return-1},K="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",L="[\\x20\\t\\r\\n\\f]",M="(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",N="\\["+L+"*("+M+")(?:"+L+"*([*^$|!~]?=)"+L+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+M+"))|)"+L+"*\\]",O=":("+M+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+N+")*)|.*)\\)|)",P=new RegExp(L+"+","g"),Q=new RegExp("^"+L+"+|((?:^|[^\\\\])(?:\\\\.)*)"+L+"+$","g"),R=new RegExp("^"+L+"*,"+L+"*"),S=new RegExp("^"+L+"*([>+~]|"+L+")"+L+"*"),T=new RegExp("="+L+"*([^\\]'\"]*?)"+L+"*\\]","g"),U=new RegExp(O),V=new RegExp("^"+M+"$"),W={ID:new RegExp("^#("+M+")"),CLASS:new RegExp("^\\.("+M+")"),TAG:new RegExp("^("+M+"|[*])"),ATTR:new RegExp("^"+N),PSEUDO:new RegExp("^"+O),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+L+"*(even|odd|(([+-]|)(\\d*)n|)"+L+"*(?:([+-]|)"+L+"*(\\d+)|))"+L+"*\\)|)","i"),bool:new RegExp("^(?:"+K+")$","i"),needsContext:new RegExp("^"+L+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+L+"*((?:-\\d)?\\d*)"+L+"*\\)|)(?=[^-]|$)","i")},X=/^(?:input|select|textarea|button)$/i,Y=/^h\d$/i,Z=/^[^{]+\{\s*\[native \w/,$=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,_=/[+~]/,aa=/'|\\/g,ba=new RegExp("\\\\([\\da-f]{1,6}"+L+"?|("+L+")|.)","ig"),ca=function(a,b,c){var d="0x"+b-65536;return d!==d||c?b:0>d?String.fromCharCode(d+65536):String.fromCharCode(d>>10|55296,1023&d|56320)},da=function(){m()};try{H.apply(E=I.call(v.childNodes),v.childNodes),E[v.childNodes.length].nodeType}catch(ea){H={apply:E.length?function(a,b){G.apply(a,I.call(b))}:function(a,b){var c=a.length,d=0;while(a[c++]=b[d++]);a.length=c-1}}}function fa(a,b,d,e){var f,h,j,k,l,o,r,s,w=b&&b.ownerDocument,x=b?b.nodeType:9;if(d=d||[],"string"!=typeof a||!a||1!==x&&9!==x&&11!==x)return d;if(!e&&((b?b.ownerDocument||b:v)!==n&&m(b),b=b||n,p)){if(11!==x&&(o=$.exec(a)))if(f=o[1]){if(9===x){if(!(j=b.getElementById(f)))return d;if(j.id===f)return d.push(j),d}else if(w&&(j=w.getElementById(f))&&t(b,j)&&j.id===f)return d.push(j),d}else{if(o[2])return H.apply(d,b.getElementsByTagName(a)),d;if((f=o[3])&&c.getElementsByClassName&&b.getElementsByClassName)return H.apply(d,b.getElementsByClassName(f)),d}if(c.qsa&&!A[a+" "]&&(!q||!q.test(a))){if(1!==x)w=b,s=a;else if("object"!==b.nodeName.toLowerCase()){(k=b.getAttribute("id"))?k=k.replace(aa,"\\$&"):b.setAttribute("id",k=u),r=g(a),h=r.length,l=V.test(k)?"#"+k:"[id='"+k+"']";while(h--)r[h]=l+" "+qa(r[h]);s=r.join(","),w=_.test(a)&&oa(b.parentNode)||b}if(s)try{return H.apply(d,w.querySelectorAll(s)),d}catch(y){}finally{k===u&&b.removeAttribute("id")}}}return i(a.replace(Q,"$1"),b,d,e)}function ga(){var a=[];function b(c,e){return a.push(c+" ")>d.cacheLength&&delete b[a.shift()],b[c+" "]=e}return b}function ha(a){return a[u]=!0,a}function ia(a){var b=n.createElement("div");try{return!!a(b)}catch(c){return!1}finally{b.parentNode&&b.parentNode.removeChild(b),b=null}}function ja(a,b){var c=a.split("|"),e=c.length;while(e--)d.attrHandle[c[e]]=b}function ka(a,b){var c=b&&a,d=c&&1===a.nodeType&&1===b.nodeType&&(~b.sourceIndex||C)-(~a.sourceIndex||C);if(d)return d;if(c)while(c=c.nextSibling)if(c===b)return-1;return a?1:-1}function la(a){return function(b){var c=b.nodeName.toLowerCase();return"input"===c&&b.type===a}}function ma(a){return function(b){var c=b.nodeName.toLowerCase();return("input"===c||"button"===c)&&b.type===a}}function na(a){return ha(function(b){return b=+b,ha(function(c,d){var e,f=a([],c.length,b),g=f.length;while(g--)c[e=f[g]]&&(c[e]=!(d[e]=c[e]))})})}function oa(a){return a&&"undefined"!=typeof a.getElementsByTagName&&a}c=fa.support={},f=fa.isXML=function(a){var b=a&&(a.ownerDocument||a).documentElement;return b?"HTML"!==b.nodeName:!1},m=fa.setDocument=function(a){var b,e,g=a?a.ownerDocument||a:v;return g!==n&&9===g.nodeType&&g.documentElement?(n=g,o=n.documentElement,p=!f(n),(e=n.defaultView)&&e.top!==e&&(e.addEventListener?e.addEventListener("unload",da,!1):e.attachEvent&&e.attachEvent("onunload",da)),c.attributes=ia(function(a){return a.className="i",!a.getAttribute("className")}),c.getElementsByTagName=ia(function(a){return a.appendChild(n.createComment("")),!a.getElementsByTagName("*").length}),c.getElementsByClassName=Z.test(n.getElementsByClassName),c.getById=ia(function(a){return o.appendChild(a).id=u,!n.getElementsByName||!n.getElementsByName(u).length}),c.getById?(d.find.ID=function(a,b){if("undefined"!=typeof b.getElementById&&p){var c=b.getElementById(a);return c?[c]:[]}},d.filter.ID=function(a){var b=a.replace(ba,ca);return function(a){return a.getAttribute("id")===b}}):(delete d.find.ID,d.filter.ID=function(a){var b=a.replace(ba,ca);return function(a){var c="undefined"!=typeof a.getAttributeNode&&a.getAttributeNode("id");return c&&c.value===b}}),d.find.TAG=c.getElementsByTagName?function(a,b){return"undefined"!=typeof b.getElementsByTagName?b.getElementsByTagName(a):c.qsa?b.querySelectorAll(a):void 0}:function(a,b){var c,d=[],e=0,f=b.getElementsByTagName(a);if("*"===a){while(c=f[e++])1===c.nodeType&&d.push(c);return d}return f},d.find.CLASS=c.getElementsByClassName&&function(a,b){return"undefined"!=typeof b.getElementsByClassName&&p?b.getElementsByClassName(a):void 0},r=[],q=[],(c.qsa=Z.test(n.querySelectorAll))&&(ia(function(a){o.appendChild(a).innerHTML="<a id='"+u+"'></a><select id='"+u+"-\r\\' msallowcapture=''><option selected=''></option></select>",a.querySelectorAll("[msallowcapture^='']").length&&q.push("[*^$]="+L+"*(?:''|\"\")"),a.querySelectorAll("[selected]").length||q.push("\\["+L+"*(?:value|"+K+")"),a.querySelectorAll("[id~="+u+"-]").length||q.push("~="),a.querySelectorAll(":checked").length||q.push(":checked"),a.querySelectorAll("a#"+u+"+*").length||q.push(".#.+[+~]")}),ia(function(a){var b=n.createElement("input");b.setAttribute("type","hidden"),a.appendChild(b).setAttribute("name","D"),a.querySelectorAll("[name=d]").length&&q.push("name"+L+"*[*^$|!~]?="),a.querySelectorAll(":enabled").length||q.push(":enabled",":disabled"),a.querySelectorAll("*,:x"),q.push(",.*:")})),(c.matchesSelector=Z.test(s=o.matches||o.webkitMatchesSelector||o.mozMatchesSelector||o.oMatchesSelector||o.msMatchesSelector))&&ia(function(a){c.disconnectedMatch=s.call(a,"div"),s.call(a,"[s!='']:x"),r.push("!=",O)}),q=q.length&&new RegExp(q.join("|")),r=r.length&&new RegExp(r.join("|")),b=Z.test(o.compareDocumentPosition),t=b||Z.test(o.contains)?function(a,b){var c=9===a.nodeType?a.documentElement:a,d=b&&b.parentNode;return a===d||!(!d||1!==d.nodeType||!(c.contains?c.contains(d):a.compareDocumentPosition&&16&a.compareDocumentPosition(d)))}:function(a,b){if(b)while(b=b.parentNode)if(b===a)return!0;return!1},B=b?function(a,b){if(a===b)return l=!0,0;var d=!a.compareDocumentPosition-!b.compareDocumentPosition;return d?d:(d=(a.ownerDocument||a)===(b.ownerDocument||b)?a.compareDocumentPosition(b):1,1&d||!c.sortDetached&&b.compareDocumentPosition(a)===d?a===n||a.ownerDocument===v&&t(v,a)?-1:b===n||b.ownerDocument===v&&t(v,b)?1:k?J(k,a)-J(k,b):0:4&d?-1:1)}:function(a,b){if(a===b)return l=!0,0;var c,d=0,e=a.parentNode,f=b.parentNode,g=[a],h=[b];if(!e||!f)return a===n?-1:b===n?1:e?-1:f?1:k?J(k,a)-J(k,b):0;if(e===f)return ka(a,b);c=a;while(c=c.parentNode)g.unshift(c);c=b;while(c=c.parentNode)h.unshift(c);while(g[d]===h[d])d++;return d?ka(g[d],h[d]):g[d]===v?-1:h[d]===v?1:0},n):n},fa.matches=function(a,b){return fa(a,null,null,b)},fa.matchesSelector=function(a,b){if((a.ownerDocument||a)!==n&&m(a),b=b.replace(T,"='$1']"),c.matchesSelector&&p&&!A[b+" "]&&(!r||!r.test(b))&&(!q||!q.test(b)))try{var d=s.call(a,b);if(d||c.disconnectedMatch||a.document&&11!==a.document.nodeType)return d}catch(e){}return fa(b,n,null,[a]).length>0},fa.contains=function(a,b){return(a.ownerDocument||a)!==n&&m(a),t(a,b)},fa.attr=function(a,b){(a.ownerDocument||a)!==n&&m(a);var e=d.attrHandle[b.toLowerCase()],f=e&&D.call(d.attrHandle,b.toLowerCase())?e(a,b,!p):void 0;return void 0!==f?f:c.attributes||!p?a.getAttribute(b):(f=a.getAttributeNode(b))&&f.specified?f.value:null},fa.error=function(a){throw new Error("Syntax error, unrecognized expression: "+a)},fa.uniqueSort=function(a){var b,d=[],e=0,f=0;if(l=!c.detectDuplicates,k=!c.sortStable&&a.slice(0),a.sort(B),l){while(b=a[f++])b===a[f]&&(e=d.push(f));while(e--)a.splice(d[e],1)}return k=null,a},e=fa.getText=function(a){var b,c="",d=0,f=a.nodeType;if(f){if(1===f||9===f||11===f){if("string"==typeof a.textContent)return a.textContent;for(a=a.firstChild;a;a=a.nextSibling)c+=e(a)}else if(3===f||4===f)return a.nodeValue}else while(b=a[d++])c+=e(b);return c},d=fa.selectors={cacheLength:50,createPseudo:ha,match:W,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(a){return a[1]=a[1].replace(ba,ca),a[3]=(a[3]||a[4]||a[5]||"").replace(ba,ca),"~="===a[2]&&(a[3]=" "+a[3]+" "),a.slice(0,4)},CHILD:function(a){return a[1]=a[1].toLowerCase(),"nth"===a[1].slice(0,3)?(a[3]||fa.error(a[0]),a[4]=+(a[4]?a[5]+(a[6]||1):2*("even"===a[3]||"odd"===a[3])),a[5]=+(a[7]+a[8]||"odd"===a[3])):a[3]&&fa.error(a[0]),a},PSEUDO:function(a){var b,c=!a[6]&&a[2];return W.CHILD.test(a[0])?null:(a[3]?a[2]=a[4]||a[5]||"":c&&U.test(c)&&(b=g(c,!0))&&(b=c.indexOf(")",c.length-b)-c.length)&&(a[0]=a[0].slice(0,b),a[2]=c.slice(0,b)),a.slice(0,3))}},filter:{TAG:function(a){var b=a.replace(ba,ca).toLowerCase();return"*"===a?function(){return!0}:function(a){return a.nodeName&&a.nodeName.toLowerCase()===b}},CLASS:function(a){var b=y[a+" "];return b||(b=new RegExp("(^|"+L+")"+a+"("+L+"|$)"))&&y(a,function(a){return b.test("string"==typeof a.className&&a.className||"undefined"!=typeof a.getAttribute&&a.getAttribute("class")||"")})},ATTR:function(a,b,c){return function(d){var e=fa.attr(d,a);return null==e?"!="===b:b?(e+="","="===b?e===c:"!="===b?e!==c:"^="===b?c&&0===e.indexOf(c):"*="===b?c&&e.indexOf(c)>-1:"$="===b?c&&e.slice(-c.length)===c:"~="===b?(" "+e.replace(P," ")+" ").indexOf(c)>-1:"|="===b?e===c||e.slice(0,c.length+1)===c+"-":!1):!0}},CHILD:function(a,b,c,d,e){var f="nth"!==a.slice(0,3),g="last"!==a.slice(-4),h="of-type"===b;return 1===d&&0===e?function(a){return!!a.parentNode}:function(b,c,i){var j,k,l,m,n,o,p=f!==g?"nextSibling":"previousSibling",q=b.parentNode,r=h&&b.nodeName.toLowerCase(),s=!i&&!h,t=!1;if(q){if(f){while(p){m=b;while(m=m[p])if(h?m.nodeName.toLowerCase()===r:1===m.nodeType)return!1;o=p="only"===a&&!o&&"nextSibling"}return!0}if(o=[g?q.firstChild:q.lastChild],g&&s){m=q,l=m[u]||(m[u]={}),k=l[m.uniqueID]||(l[m.uniqueID]={}),j=k[a]||[],n=j[0]===w&&j[1],t=n&&j[2],m=n&&q.childNodes[n];while(m=++n&&m&&m[p]||(t=n=0)||o.pop())if(1===m.nodeType&&++t&&m===b){k[a]=[w,n,t];break}}else if(s&&(m=b,l=m[u]||(m[u]={}),k=l[m.uniqueID]||(l[m.uniqueID]={}),j=k[a]||[],n=j[0]===w&&j[1],t=n),t===!1)while(m=++n&&m&&m[p]||(t=n=0)||o.pop())if((h?m.nodeName.toLowerCase()===r:1===m.nodeType)&&++t&&(s&&(l=m[u]||(m[u]={}),k=l[m.uniqueID]||(l[m.uniqueID]={}),k[a]=[w,t]),m===b))break;return t-=e,t===d||t%d===0&&t/d>=0}}},PSEUDO:function(a,b){var c,e=d.pseudos[a]||d.setFilters[a.toLowerCase()]||fa.error("unsupported pseudo: "+a);return e[u]?e(b):e.length>1?(c=[a,a,"",b],d.setFilters.hasOwnProperty(a.toLowerCase())?ha(function(a,c){var d,f=e(a,b),g=f.length;while(g--)d=J(a,f[g]),a[d]=!(c[d]=f[g])}):function(a){return e(a,0,c)}):e}},pseudos:{not:ha(function(a){var b=[],c=[],d=h(a.replace(Q,"$1"));return d[u]?ha(function(a,b,c,e){var f,g=d(a,null,e,[]),h=a.length;while(h--)(f=g[h])&&(a[h]=!(b[h]=f))}):function(a,e,f){return b[0]=a,d(b,null,f,c),b[0]=null,!c.pop()}}),has:ha(function(a){return function(b){return fa(a,b).length>0}}),contains:ha(function(a){return a=a.replace(ba,ca),function(b){return(b.textContent||b.innerText||e(b)).indexOf(a)>-1}}),lang:ha(function(a){return V.test(a||"")||fa.error("unsupported lang: "+a),a=a.replace(ba,ca).toLowerCase(),function(b){var c;do if(c=p?b.lang:b.getAttribute("xml:lang")||b.getAttribute("lang"))return c=c.toLowerCase(),c===a||0===c.indexOf(a+"-");while((b=b.parentNode)&&1===b.nodeType);return!1}}),target:function(b){var c=a.location&&a.location.hash;return c&&c.slice(1)===b.id},root:function(a){return a===o},focus:function(a){return a===n.activeElement&&(!n.hasFocus||n.hasFocus())&&!!(a.type||a.href||~a.tabIndex)},enabled:function(a){return a.disabled===!1},disabled:function(a){return a.disabled===!0},checked:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&!!a.checked||"option"===b&&!!a.selected},selected:function(a){return a.parentNode&&a.parentNode.selectedIndex,a.selected===!0},empty:function(a){for(a=a.firstChild;a;a=a.nextSibling)if(a.nodeType<6)return!1;return!0},parent:function(a){return!d.pseudos.empty(a)},header:function(a){return Y.test(a.nodeName)},input:function(a){return X.test(a.nodeName)},button:function(a){var b=a.nodeName.toLowerCase();return"input"===b&&"button"===a.type||"button"===b},text:function(a){var b;return"input"===a.nodeName.toLowerCase()&&"text"===a.type&&(null==(b=a.getAttribute("type"))||"text"===b.toLowerCase())},first:na(function(){return[0]}),last:na(function(a,b){return[b-1]}),eq:na(function(a,b,c){return[0>c?c+b:c]}),even:na(function(a,b){for(var c=0;b>c;c+=2)a.push(c);return a}),odd:na(function(a,b){for(var c=1;b>c;c+=2)a.push(c);return a}),lt:na(function(a,b,c){for(var d=0>c?c+b:c;--d>=0;)a.push(d);return a}),gt:na(function(a,b,c){for(var d=0>c?c+b:c;++d<b;)a.push(d);return a})}},d.pseudos.nth=d.pseudos.eq;for(b in{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})d.pseudos[b]=la(b);for(b in{submit:!0,reset:!0})d.pseudos[b]=ma(b);function pa(){}pa.prototype=d.filters=d.pseudos,d.setFilters=new pa,g=fa.tokenize=function(a,b){var c,e,f,g,h,i,j,k=z[a+" "];if(k)return b?0:k.slice(0);h=a,i=[],j=d.preFilter;while(h){c&&!(e=R.exec(h))||(e&&(h=h.slice(e[0].length)||h),i.push(f=[])),c=!1,(e=S.exec(h))&&(c=e.shift(),f.push({value:c,type:e[0].replace(Q," ")}),h=h.slice(c.length));for(g in d.filter)!(e=W[g].exec(h))||j[g]&&!(e=j[g](e))||(c=e.shift(),f.push({value:c,type:g,matches:e}),h=h.slice(c.length));if(!c)break}return b?h.length:h?fa.error(a):z(a,i).slice(0)};function qa(a){for(var b=0,c=a.length,d="";c>b;b++)d+=a[b].value;return d}function ra(a,b,c){var d=b.dir,e=c&&"parentNode"===d,f=x++;return b.first?function(b,c,f){while(b=b[d])if(1===b.nodeType||e)return a(b,c,f)}:function(b,c,g){var h,i,j,k=[w,f];if(g){while(b=b[d])if((1===b.nodeType||e)&&a(b,c,g))return!0}else while(b=b[d])if(1===b.nodeType||e){if(j=b[u]||(b[u]={}),i=j[b.uniqueID]||(j[b.uniqueID]={}),(h=i[d])&&h[0]===w&&h[1]===f)return k[2]=h[2];if(i[d]=k,k[2]=a(b,c,g))return!0}}}function sa(a){return a.length>1?function(b,c,d){var e=a.length;while(e--)if(!a[e](b,c,d))return!1;return!0}:a[0]}function ta(a,b,c){for(var d=0,e=b.length;e>d;d++)fa(a,b[d],c);return c}function ua(a,b,c,d,e){for(var f,g=[],h=0,i=a.length,j=null!=b;i>h;h++)(f=a[h])&&(c&&!c(f,d,e)||(g.push(f),j&&b.push(h)));return g}function va(a,b,c,d,e,f){return d&&!d[u]&&(d=va(d)),e&&!e[u]&&(e=va(e,f)),ha(function(f,g,h,i){var j,k,l,m=[],n=[],o=g.length,p=f||ta(b||"*",h.nodeType?[h]:h,[]),q=!a||!f&&b?p:ua(p,m,a,h,i),r=c?e||(f?a:o||d)?[]:g:q;if(c&&c(q,r,h,i),d){j=ua(r,n),d(j,[],h,i),k=j.length;while(k--)(l=j[k])&&(r[n[k]]=!(q[n[k]]=l))}if(f){if(e||a){if(e){j=[],k=r.length;while(k--)(l=r[k])&&j.push(q[k]=l);e(null,r=[],j,i)}k=r.length;while(k--)(l=r[k])&&(j=e?J(f,l):m[k])>-1&&(f[j]=!(g[j]=l))}}else r=ua(r===g?r.splice(o,r.length):r),e?e(null,g,r,i):H.apply(g,r)})}function wa(a){for(var b,c,e,f=a.length,g=d.relative[a[0].type],h=g||d.relative[" "],i=g?1:0,k=ra(function(a){return a===b},h,!0),l=ra(function(a){return J(b,a)>-1},h,!0),m=[function(a,c,d){var e=!g&&(d||c!==j)||((b=c).nodeType?k(a,c,d):l(a,c,d));return b=null,e}];f>i;i++)if(c=d.relative[a[i].type])m=[ra(sa(m),c)];else{if(c=d.filter[a[i].type].apply(null,a[i].matches),c[u]){for(e=++i;f>e;e++)if(d.relative[a[e].type])break;return va(i>1&&sa(m),i>1&&qa(a.slice(0,i-1).concat({value:" "===a[i-2].type?"*":""})).replace(Q,"$1"),c,e>i&&wa(a.slice(i,e)),f>e&&wa(a=a.slice(e)),f>e&&qa(a))}m.push(c)}return sa(m)}function xa(a,b){var c=b.length>0,e=a.length>0,f=function(f,g,h,i,k){var l,o,q,r=0,s="0",t=f&&[],u=[],v=j,x=f||e&&d.find.TAG("*",k),y=w+=null==v?1:Math.random()||.1,z=x.length;for(k&&(j=g===n||g||k);s!==z&&null!=(l=x[s]);s++){if(e&&l){o=0,g||l.ownerDocument===n||(m(l),h=!p);while(q=a[o++])if(q(l,g||n,h)){i.push(l);break}k&&(w=y)}c&&((l=!q&&l)&&r--,f&&t.push(l))}if(r+=s,c&&s!==r){o=0;while(q=b[o++])q(t,u,g,h);if(f){if(r>0)while(s--)t[s]||u[s]||(u[s]=F.call(i));u=ua(u)}H.apply(i,u),k&&!f&&u.length>0&&r+b.length>1&&fa.uniqueSort(i)}return k&&(w=y,j=v),t};return c?ha(f):f}return h=fa.compile=function(a,b){var c,d=[],e=[],f=A[a+" "];if(!f){b||(b=g(a)),c=b.length;while(c--)f=wa(b[c]),f[u]?d.push(f):e.push(f);f=A(a,xa(e,d)),f.selector=a}return f},i=fa.select=function(a,b,e,f){var i,j,k,l,m,n="function"==typeof a&&a,o=!f&&g(a=n.selector||a);if(e=e||[],1===o.length){if(j=o[0]=o[0].slice(0),j.length>2&&"ID"===(k=j[0]).type&&c.getById&&9===b.nodeType&&p&&d.relative[j[1].type]){if(b=(d.find.ID(k.matches[0].replace(ba,ca),b)||[])[0],!b)return e;n&&(b=b.parentNode),a=a.slice(j.shift().value.length)}i=W.needsContext.test(a)?0:j.length;while(i--){if(k=j[i],d.relative[l=k.type])break;if((m=d.find[l])&&(f=m(k.matches[0].replace(ba,ca),_.test(j[0].type)&&oa(b.parentNode)||b))){if(j.splice(i,1),a=f.length&&qa(j),!a)return H.apply(e,f),e;break}}}return(n||h(a,o))(f,b,!p,e,!b||_.test(a)&&oa(b.parentNode)||b),e},c.sortStable=u.split("").sort(B).join("")===u,c.detectDuplicates=!!l,m(),c.sortDetached=ia(function(a){return 1&a.compareDocumentPosition(n.createElement("div"))}),ia(function(a){return a.innerHTML="<a href='#'></a>","#"===a.firstChild.getAttribute("href")})||ja("type|href|height|width",function(a,b,c){return c?void 0:a.getAttribute(b,"type"===b.toLowerCase()?1:2)}),c.attributes&&ia(function(a){return a.innerHTML="<input/>",a.firstChild.setAttribute("value",""),""===a.firstChild.getAttribute("value")})||ja("value",function(a,b,c){return c||"input"!==a.nodeName.toLowerCase()?void 0:a.defaultValue}),ia(function(a){return null==a.getAttribute("disabled")})||ja(K,function(a,b,c){var d;return c?void 0:a[b]===!0?b.toLowerCase():(d=a.getAttributeNode(b))&&d.specified?d.value:null}),fa}(a);n.find=t,n.expr=t.selectors,n.expr[":"]=n.expr.pseudos,n.uniqueSort=n.unique=t.uniqueSort,n.text=t.getText,n.isXMLDoc=t.isXML,n.contains=t.contains;var u=function(a,b,c){var d=[],e=void 0!==c;while((a=a[b])&&9!==a.nodeType)if(1===a.nodeType){if(e&&n(a).is(c))break;d.push(a)}return d},v=function(a,b){for(var c=[];a;a=a.nextSibling)1===a.nodeType&&a!==b&&c.push(a);return c},w=n.expr.match.needsContext,x=/^<([\w-]+)\s*\/?>(?:<\/\1>|)$/,y=/^.[^:#\[\.,]*$/;function z(a,b,c){if(n.isFunction(b))return n.grep(a,function(a,d){return!!b.call(a,d,a)!==c});if(b.nodeType)return n.grep(a,function(a){return a===b!==c});if("string"==typeof b){if(y.test(b))return n.filter(b,a,c);b=n.filter(b,a)}return n.grep(a,function(a){return h.call(b,a)>-1!==c})}n.filter=function(a,b,c){var d=b[0];return c&&(a=":not("+a+")"),1===b.length&&1===d.nodeType?n.find.matchesSelector(d,a)?[d]:[]:n.find.matches(a,n.grep(b,function(a){return 1===a.nodeType}))},n.fn.extend({find:function(a){var b,c=this.length,d=[],e=this;if("string"!=typeof a)return this.pushStack(n(a).filter(function(){for(b=0;c>b;b++)if(n.contains(e[b],this))return!0}));for(b=0;c>b;b++)n.find(a,e[b],d);return d=this.pushStack(c>1?n.unique(d):d),d.selector=this.selector?this.selector+" "+a:a,d},filter:function(a){return this.pushStack(z(this,a||[],!1))},not:function(a){return this.pushStack(z(this,a||[],!0))},is:function(a){return!!z(this,"string"==typeof a&&w.test(a)?n(a):a||[],!1).length}});var A,B=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,C=n.fn.init=function(a,b,c){var e,f;if(!a)return this;if(c=c||A,"string"==typeof a){if(e="<"===a[0]&&">"===a[a.length-1]&&a.length>=3?[null,a,null]:B.exec(a),!e||!e[1]&&b)return!b||b.jquery?(b||c).find(a):this.constructor(b).find(a);if(e[1]){if(b=b instanceof n?b[0]:b,n.merge(this,n.parseHTML(e[1],b&&b.nodeType?b.ownerDocument||b:d,!0)),x.test(e[1])&&n.isPlainObject(b))for(e in b)n.isFunction(this[e])?this[e](b[e]):this.attr(e,b[e]);return this}return f=d.getElementById(e[2]),f&&f.parentNode&&(this.length=1,this[0]=f),this.context=d,this.selector=a,this}return a.nodeType?(this.context=this[0]=a,this.length=1,this):n.isFunction(a)?void 0!==c.ready?c.ready(a):a(n):(void 0!==a.selector&&(this.selector=a.selector,this.context=a.context),n.makeArray(a,this))};C.prototype=n.fn,A=n(d);var D=/^(?:parents|prev(?:Until|All))/,E={children:!0,contents:!0,next:!0,prev:!0};n.fn.extend({has:function(a){var b=n(a,this),c=b.length;return this.filter(function(){for(var a=0;c>a;a++)if(n.contains(this,b[a]))return!0})},closest:function(a,b){for(var c,d=0,e=this.length,f=[],g=w.test(a)||"string"!=typeof a?n(a,b||this.context):0;e>d;d++)for(c=this[d];c&&c!==b;c=c.parentNode)if(c.nodeType<11&&(g?g.index(c)>-1:1===c.nodeType&&n.find.matchesSelector(c,a))){f.push(c);break}return this.pushStack(f.length>1?n.uniqueSort(f):f)},index:function(a){return a?"string"==typeof a?h.call(n(a),this[0]):h.call(this,a.jquery?a[0]:a):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(a,b){return this.pushStack(n.uniqueSort(n.merge(this.get(),n(a,b))))},addBack:function(a){return this.add(null==a?this.prevObject:this.prevObject.filter(a))}});function F(a,b){while((a=a[b])&&1!==a.nodeType);return a}n.each({parent:function(a){var b=a.parentNode;return b&&11!==b.nodeType?b:null},parents:function(a){return u(a,"parentNode")},parentsUntil:function(a,b,c){return u(a,"parentNode",c)},next:function(a){return F(a,"nextSibling")},prev:function(a){return F(a,"previousSibling")},nextAll:function(a){return u(a,"nextSibling")},prevAll:function(a){return u(a,"previousSibling")},nextUntil:function(a,b,c){return u(a,"nextSibling",c)},prevUntil:function(a,b,c){return u(a,"previousSibling",c)},siblings:function(a){return v((a.parentNode||{}).firstChild,a)},children:function(a){return v(a.firstChild)},contents:function(a){return a.contentDocument||n.merge([],a.childNodes)}},function(a,b){n.fn[a]=function(c,d){var e=n.map(this,b,c);return"Until"!==a.slice(-5)&&(d=c),d&&"string"==typeof d&&(e=n.filter(d,e)),this.length>1&&(E[a]||n.uniqueSort(e),D.test(a)&&e.reverse()),this.pushStack(e)}});var G=/\S+/g;function H(a){var b={};return n.each(a.match(G)||[],function(a,c){b[c]=!0}),b}n.Callbacks=function(a){a="string"==typeof a?H(a):n.extend({},a);var b,c,d,e,f=[],g=[],h=-1,i=function(){for(e=a.once,d=b=!0;g.length;h=-1){c=g.shift();while(++h<f.length)f[h].apply(c[0],c[1])===!1&&a.stopOnFalse&&(h=f.length,c=!1)}a.memory||(c=!1),b=!1,e&&(f=c?[]:"")},j={add:function(){return f&&(c&&!b&&(h=f.length-1,g.push(c)),function d(b){n.each(b,function(b,c){n.isFunction(c)?a.unique&&j.has(c)||f.push(c):c&&c.length&&"string"!==n.type(c)&&d(c)})}(arguments),c&&!b&&i()),this},remove:function(){return n.each(arguments,function(a,b){var c;while((c=n.inArray(b,f,c))>-1)f.splice(c,1),h>=c&&h--}),this},has:function(a){return a?n.inArray(a,f)>-1:f.length>0},empty:function(){return f&&(f=[]),this},disable:function(){return e=g=[],f=c="",this},disabled:function(){return!f},lock:function(){return e=g=[],c||(f=c=""),this},locked:function(){return!!e},fireWith:function(a,c){return e||(c=c||[],c=[a,c.slice?c.slice():c],g.push(c),b||i()),this},fire:function(){return j.fireWith(this,arguments),this},fired:function(){return!!d}};return j},n.extend({Deferred:function(a){var b=[["resolve","done",n.Callbacks("once memory"),"resolved"],["reject","fail",n.Callbacks("once memory"),"rejected"],["notify","progress",n.Callbacks("memory")]],c="pending",d={state:function(){return c},always:function(){return e.done(arguments).fail(arguments),this},then:function(){var a=arguments;return n.Deferred(function(c){n.each(b,function(b,f){var g=n.isFunction(a[b])&&a[b];e[f[1]](function(){var a=g&&g.apply(this,arguments);a&&n.isFunction(a.promise)?a.promise().progress(c.notify).done(c.resolve).fail(c.reject):c[f[0]+"With"](this===d?c.promise():this,g?[a]:arguments)})}),a=null}).promise()},promise:function(a){return null!=a?n.extend(a,d):d}},e={};return d.pipe=d.then,n.each(b,function(a,f){var g=f[2],h=f[3];d[f[1]]=g.add,h&&g.add(function(){c=h},b[1^a][2].disable,b[2][2].lock),e[f[0]]=function(){return e[f[0]+"With"](this===e?d:this,arguments),this},e[f[0]+"With"]=g.fireWith}),d.promise(e),a&&a.call(e,e),e},when:function(a){var b=0,c=e.call(arguments),d=c.length,f=1!==d||a&&n.isFunction(a.promise)?d:0,g=1===f?a:n.Deferred(),h=function(a,b,c){return function(d){b[a]=this,c[a]=arguments.length>1?e.call(arguments):d,c===i?g.notifyWith(b,c):--f||g.resolveWith(b,c)}},i,j,k;if(d>1)for(i=new Array(d),j=new Array(d),k=new Array(d);d>b;b++)c[b]&&n.isFunction(c[b].promise)?c[b].promise().progress(h(b,j,i)).done(h(b,k,c)).fail(g.reject):--f;return f||g.resolveWith(k,c),g.promise()}});var I;n.fn.ready=function(a){return n.ready.promise().done(a),this},n.extend({isReady:!1,readyWait:1,holdReady:function(a){a?n.readyWait++:n.ready(!0)},ready:function(a){(a===!0?--n.readyWait:n.isReady)||(n.isReady=!0,a!==!0&&--n.readyWait>0||(I.resolveWith(d,[n]),n.fn.triggerHandler&&(n(d).triggerHandler("ready"),n(d).off("ready"))))}});function J(){d.removeEventListener("DOMContentLoaded",J),a.removeEventListener("load",J),n.ready()}n.ready.promise=function(b){return I||(I=n.Deferred(),"complete"===d.readyState||"loading"!==d.readyState&&!d.documentElement.doScroll?a.setTimeout(n.ready):(d.addEventListener("DOMContentLoaded",J),a.addEventListener("load",J))),I.promise(b)},n.ready.promise();var K=function(a,b,c,d,e,f,g){var h=0,i=a.length,j=null==c;if("object"===n.type(c)){e=!0;for(h in c)K(a,b,h,c[h],!0,f,g)}else if(void 0!==d&&(e=!0,n.isFunction(d)||(g=!0),j&&(g?(b.call(a,d),b=null):(j=b,b=function(a,b,c){return j.call(n(a),c)})),b))for(;i>h;h++)b(a[h],c,g?d:d.call(a[h],h,b(a[h],c)));return e?a:j?b.call(a):i?b(a[0],c):f},L=function(a){return 1===a.nodeType||9===a.nodeType||!+a.nodeType};function M(){this.expando=n.expando+M.uid++}M.uid=1,M.prototype={register:function(a,b){var c=b||{};return a.nodeType?a[this.expando]=c:Object.defineProperty(a,this.expando,{value:c,writable:!0,configurable:!0}),a[this.expando]},cache:function(a){if(!L(a))return{};var b=a[this.expando];return b||(b={},L(a)&&(a.nodeType?a[this.expando]=b:Object.defineProperty(a,this.expando,{value:b,configurable:!0}))),b},set:function(a,b,c){var d,e=this.cache(a);if("string"==typeof b)e[b]=c;else for(d in b)e[d]=b[d];return e},get:function(a,b){return void 0===b?this.cache(a):a[this.expando]&&a[this.expando][b]},access:function(a,b,c){var d;return void 0===b||b&&"string"==typeof b&&void 0===c?(d=this.get(a,b),void 0!==d?d:this.get(a,n.camelCase(b))):(this.set(a,b,c),void 0!==c?c:b)},remove:function(a,b){var c,d,e,f=a[this.expando];if(void 0!==f){if(void 0===b)this.register(a);else{n.isArray(b)?d=b.concat(b.map(n.camelCase)):(e=n.camelCase(b),b in f?d=[b,e]:(d=e,d=d in f?[d]:d.match(G)||[])),c=d.length;while(c--)delete f[d[c]]}(void 0===b||n.isEmptyObject(f))&&(a.nodeType?a[this.expando]=void 0:delete a[this.expando])}},hasData:function(a){var b=a[this.expando];return void 0!==b&&!n.isEmptyObject(b)}};var N=new M,O=new M,P=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,Q=/[A-Z]/g;function R(a,b,c){var d;if(void 0===c&&1===a.nodeType)if(d="data-"+b.replace(Q,"-$&").toLowerCase(),c=a.getAttribute(d),"string"==typeof c){try{c="true"===c?!0:"false"===c?!1:"null"===c?null:+c+""===c?+c:P.test(c)?n.parseJSON(c):c;
        }catch(e){}O.set(a,b,c)}else c=void 0;return c}n.extend({hasData:function(a){return O.hasData(a)||N.hasData(a)},data:function(a,b,c){return O.access(a,b,c)},removeData:function(a,b){O.remove(a,b)},_data:function(a,b,c){return N.access(a,b,c)},_removeData:function(a,b){N.remove(a,b)}}),n.fn.extend({data:function(a,b){var c,d,e,f=this[0],g=f&&f.attributes;if(void 0===a){if(this.length&&(e=O.get(f),1===f.nodeType&&!N.get(f,"hasDataAttrs"))){c=g.length;while(c--)g[c]&&(d=g[c].name,0===d.indexOf("data-")&&(d=n.camelCase(d.slice(5)),R(f,d,e[d])));N.set(f,"hasDataAttrs",!0)}return e}return"object"==typeof a?this.each(function(){O.set(this,a)}):K(this,function(b){var c,d;if(f&&void 0===b){if(c=O.get(f,a)||O.get(f,a.replace(Q,"-$&").toLowerCase()),void 0!==c)return c;if(d=n.camelCase(a),c=O.get(f,d),void 0!==c)return c;if(c=R(f,d,void 0),void 0!==c)return c}else d=n.camelCase(a),this.each(function(){var c=O.get(this,d);O.set(this,d,b),a.indexOf("-")>-1&&void 0!==c&&O.set(this,a,b)})},null,b,arguments.length>1,null,!0)},removeData:function(a){return this.each(function(){O.remove(this,a)})}}),n.extend({queue:function(a,b,c){var d;return a?(b=(b||"fx")+"queue",d=N.get(a,b),c&&(!d||n.isArray(c)?d=N.access(a,b,n.makeArray(c)):d.push(c)),d||[]):void 0},dequeue:function(a,b){b=b||"fx";var c=n.queue(a,b),d=c.length,e=c.shift(),f=n._queueHooks(a,b),g=function(){n.dequeue(a,b)};"inprogress"===e&&(e=c.shift(),d--),e&&("fx"===b&&c.unshift("inprogress"),delete f.stop,e.call(a,g,f)),!d&&f&&f.empty.fire()},_queueHooks:function(a,b){var c=b+"queueHooks";return N.get(a,c)||N.access(a,c,{empty:n.Callbacks("once memory").add(function(){N.remove(a,[b+"queue",c])})})}}),n.fn.extend({queue:function(a,b){var c=2;return"string"!=typeof a&&(b=a,a="fx",c--),arguments.length<c?n.queue(this[0],a):void 0===b?this:this.each(function(){var c=n.queue(this,a,b);n._queueHooks(this,a),"fx"===a&&"inprogress"!==c[0]&&n.dequeue(this,a)})},dequeue:function(a){return this.each(function(){n.dequeue(this,a)})},clearQueue:function(a){return this.queue(a||"fx",[])},promise:function(a,b){var c,d=1,e=n.Deferred(),f=this,g=this.length,h=function(){--d||e.resolveWith(f,[f])};"string"!=typeof a&&(b=a,a=void 0),a=a||"fx";while(g--)c=N.get(f[g],a+"queueHooks"),c&&c.empty&&(d++,c.empty.add(h));return h(),e.promise(b)}});var S=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,T=new RegExp("^(?:([+-])=|)("+S+")([a-z%]*)$","i"),U=["Top","Right","Bottom","Left"],V=function(a,b){return a=b||a,"none"===n.css(a,"display")||!n.contains(a.ownerDocument,a)};function W(a,b,c,d){var e,f=1,g=20,h=d?function(){return d.cur()}:function(){return n.css(a,b,"")},i=h(),j=c&&c[3]||(n.cssNumber[b]?"":"px"),k=(n.cssNumber[b]||"px"!==j&&+i)&&T.exec(n.css(a,b));if(k&&k[3]!==j){j=j||k[3],c=c||[],k=+i||1;do f=f||".5",k/=f,n.style(a,b,k+j);while(f!==(f=h()/i)&&1!==f&&--g)}return c&&(k=+k||+i||0,e=c[1]?k+(c[1]+1)*c[2]:+c[2],d&&(d.unit=j,d.start=k,d.end=e)),e}var X=/^(?:checkbox|radio)$/i,Y=/<([\w:-]+)/,Z=/^$|\/(?:java|ecma)script/i,$={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};$.optgroup=$.option,$.tbody=$.tfoot=$.colgroup=$.caption=$.thead,$.th=$.td;function _(a,b){var c="undefined"!=typeof a.getElementsByTagName?a.getElementsByTagName(b||"*"):"undefined"!=typeof a.querySelectorAll?a.querySelectorAll(b||"*"):[];return void 0===b||b&&n.nodeName(a,b)?n.merge([a],c):c}function aa(a,b){for(var c=0,d=a.length;d>c;c++)N.set(a[c],"globalEval",!b||N.get(b[c],"globalEval"))}var ba=/<|&#?\w+;/;function ca(a,b,c,d,e){for(var f,g,h,i,j,k,l=b.createDocumentFragment(),m=[],o=0,p=a.length;p>o;o++)if(f=a[o],f||0===f)if("object"===n.type(f))n.merge(m,f.nodeType?[f]:f);else if(ba.test(f)){g=g||l.appendChild(b.createElement("div")),h=(Y.exec(f)||["",""])[1].toLowerCase(),i=$[h]||$._default,g.innerHTML=i[1]+n.htmlPrefilter(f)+i[2],k=i[0];while(k--)g=g.lastChild;n.merge(m,g.childNodes),g=l.firstChild,g.textContent=""}else m.push(b.createTextNode(f));l.textContent="",o=0;while(f=m[o++])if(d&&n.inArray(f,d)>-1)e&&e.push(f);else if(j=n.contains(f.ownerDocument,f),g=_(l.appendChild(f),"script"),j&&aa(g),c){k=0;while(f=g[k++])Z.test(f.type||"")&&c.push(f)}return l}!function(){var a=d.createDocumentFragment(),b=a.appendChild(d.createElement("div")),c=d.createElement("input");c.setAttribute("type","radio"),c.setAttribute("checked","checked"),c.setAttribute("name","t"),b.appendChild(c),l.checkClone=b.cloneNode(!0).cloneNode(!0).lastChild.checked,b.innerHTML="<textarea>x</textarea>",l.noCloneChecked=!!b.cloneNode(!0).lastChild.defaultValue}();var da=/^key/,ea=/^(?:mouse|pointer|contextmenu|drag|drop)|click/,fa=/^([^.]*)(?:\.(.+)|)/;function ga(){return!0}function ha(){return!1}function ia(){try{return d.activeElement}catch(a){}}function ja(a,b,c,d,e,f){var g,h;if("object"==typeof b){"string"!=typeof c&&(d=d||c,c=void 0);for(h in b)ja(a,h,c,d,b[h],f);return a}if(null==d&&null==e?(e=c,d=c=void 0):null==e&&("string"==typeof c?(e=d,d=void 0):(e=d,d=c,c=void 0)),e===!1)e=ha;else if(!e)return a;return 1===f&&(g=e,e=function(a){return n().off(a),g.apply(this,arguments)},e.guid=g.guid||(g.guid=n.guid++)),a.each(function(){n.event.add(this,b,e,d,c)})}n.event={global:{},add:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=N.get(a);if(r){c.handler&&(f=c,c=f.handler,e=f.selector),c.guid||(c.guid=n.guid++),(i=r.events)||(i=r.events={}),(g=r.handle)||(g=r.handle=function(b){return"undefined"!=typeof n&&n.event.triggered!==b.type?n.event.dispatch.apply(a,arguments):void 0}),b=(b||"").match(G)||[""],j=b.length;while(j--)h=fa.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o&&(l=n.event.special[o]||{},o=(e?l.delegateType:l.bindType)||o,l=n.event.special[o]||{},k=n.extend({type:o,origType:q,data:d,handler:c,guid:c.guid,selector:e,needsContext:e&&n.expr.match.needsContext.test(e),namespace:p.join(".")},f),(m=i[o])||(m=i[o]=[],m.delegateCount=0,l.setup&&l.setup.call(a,d,p,g)!==!1||a.addEventListener&&a.addEventListener(o,g)),l.add&&(l.add.call(a,k),k.handler.guid||(k.handler.guid=c.guid)),e?m.splice(m.delegateCount++,0,k):m.push(k),n.event.global[o]=!0)}},remove:function(a,b,c,d,e){var f,g,h,i,j,k,l,m,o,p,q,r=N.hasData(a)&&N.get(a);if(r&&(i=r.events)){b=(b||"").match(G)||[""],j=b.length;while(j--)if(h=fa.exec(b[j])||[],o=q=h[1],p=(h[2]||"").split(".").sort(),o){l=n.event.special[o]||{},o=(d?l.delegateType:l.bindType)||o,m=i[o]||[],h=h[2]&&new RegExp("(^|\\.)"+p.join("\\.(?:.*\\.|)")+"(\\.|$)"),g=f=m.length;while(f--)k=m[f],!e&&q!==k.origType||c&&c.guid!==k.guid||h&&!h.test(k.namespace)||d&&d!==k.selector&&("**"!==d||!k.selector)||(m.splice(f,1),k.selector&&m.delegateCount--,l.remove&&l.remove.call(a,k));g&&!m.length&&(l.teardown&&l.teardown.call(a,p,r.handle)!==!1||n.removeEvent(a,o,r.handle),delete i[o])}else for(o in i)n.event.remove(a,o+b[j],c,d,!0);n.isEmptyObject(i)&&N.remove(a,"handle events")}},dispatch:function(a){a=n.event.fix(a);var b,c,d,f,g,h=[],i=e.call(arguments),j=(N.get(this,"events")||{})[a.type]||[],k=n.event.special[a.type]||{};if(i[0]=a,a.delegateTarget=this,!k.preDispatch||k.preDispatch.call(this,a)!==!1){h=n.event.handlers.call(this,a,j),b=0;while((f=h[b++])&&!a.isPropagationStopped()){a.currentTarget=f.elem,c=0;while((g=f.handlers[c++])&&!a.isImmediatePropagationStopped())a.rnamespace&&!a.rnamespace.test(g.namespace)||(a.handleObj=g,a.data=g.data,d=((n.event.special[g.origType]||{}).handle||g.handler).apply(f.elem,i),void 0!==d&&(a.result=d)===!1&&(a.preventDefault(),a.stopPropagation()))}return k.postDispatch&&k.postDispatch.call(this,a),a.result}},handlers:function(a,b){var c,d,e,f,g=[],h=b.delegateCount,i=a.target;if(h&&i.nodeType&&("click"!==a.type||isNaN(a.button)||a.button<1))for(;i!==this;i=i.parentNode||this)if(1===i.nodeType&&(i.disabled!==!0||"click"!==a.type)){for(d=[],c=0;h>c;c++)f=b[c],e=f.selector+" ",void 0===d[e]&&(d[e]=f.needsContext?n(e,this).index(i)>-1:n.find(e,this,null,[i]).length),d[e]&&d.push(f);d.length&&g.push({elem:i,handlers:d})}return h<b.length&&g.push({elem:this,handlers:b.slice(h)}),g},props:"altKey bubbles cancelable ctrlKey currentTarget detail eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),fixHooks:{},keyHooks:{props:"char charCode key keyCode".split(" "),filter:function(a,b){return null==a.which&&(a.which=null!=b.charCode?b.charCode:b.keyCode),a}},mouseHooks:{props:"button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),filter:function(a,b){var c,e,f,g=b.button;return null==a.pageX&&null!=b.clientX&&(c=a.target.ownerDocument||d,e=c.documentElement,f=c.body,a.pageX=b.clientX+(e&&e.scrollLeft||f&&f.scrollLeft||0)-(e&&e.clientLeft||f&&f.clientLeft||0),a.pageY=b.clientY+(e&&e.scrollTop||f&&f.scrollTop||0)-(e&&e.clientTop||f&&f.clientTop||0)),a.which||void 0===g||(a.which=1&g?1:2&g?3:4&g?2:0),a}},fix:function(a){if(a[n.expando])return a;var b,c,e,f=a.type,g=a,h=this.fixHooks[f];h||(this.fixHooks[f]=h=ea.test(f)?this.mouseHooks:da.test(f)?this.keyHooks:{}),e=h.props?this.props.concat(h.props):this.props,a=new n.Event(g),b=e.length;while(b--)c=e[b],a[c]=g[c];return a.target||(a.target=d),3===a.target.nodeType&&(a.target=a.target.parentNode),h.filter?h.filter(a,g):a},special:{load:{noBubble:!0},focus:{trigger:function(){return this!==ia()&&this.focus?(this.focus(),!1):void 0},delegateType:"focusin"},blur:{trigger:function(){return this===ia()&&this.blur?(this.blur(),!1):void 0},delegateType:"focusout"},click:{trigger:function(){return"checkbox"===this.type&&this.click&&n.nodeName(this,"input")?(this.click(),!1):void 0},_default:function(a){return n.nodeName(a.target,"a")}},beforeunload:{postDispatch:function(a){void 0!==a.result&&a.originalEvent&&(a.originalEvent.returnValue=a.result)}}}},n.removeEvent=function(a,b,c){a.removeEventListener&&a.removeEventListener(b,c)},n.Event=function(a,b){return this instanceof n.Event?(a&&a.type?(this.originalEvent=a,this.type=a.type,this.isDefaultPrevented=a.defaultPrevented||void 0===a.defaultPrevented&&a.returnValue===!1?ga:ha):this.type=a,b&&n.extend(this,b),this.timeStamp=a&&a.timeStamp||n.now(),void(this[n.expando]=!0)):new n.Event(a,b)},n.Event.prototype={constructor:n.Event,isDefaultPrevented:ha,isPropagationStopped:ha,isImmediatePropagationStopped:ha,isSimulated:!1,preventDefault:function(){var a=this.originalEvent;this.isDefaultPrevented=ga,a&&!this.isSimulated&&a.preventDefault()},stopPropagation:function(){var a=this.originalEvent;this.isPropagationStopped=ga,a&&!this.isSimulated&&a.stopPropagation()},stopImmediatePropagation:function(){var a=this.originalEvent;this.isImmediatePropagationStopped=ga,a&&!this.isSimulated&&a.stopImmediatePropagation(),this.stopPropagation()}},n.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(a,b){n.event.special[a]={delegateType:b,bindType:b,handle:function(a){var c,d=this,e=a.relatedTarget,f=a.handleObj;return e&&(e===d||n.contains(d,e))||(a.type=f.origType,c=f.handler.apply(this,arguments),a.type=b),c}}}),n.fn.extend({on:function(a,b,c,d){return ja(this,a,b,c,d)},one:function(a,b,c,d){return ja(this,a,b,c,d,1)},off:function(a,b,c){var d,e;if(a&&a.preventDefault&&a.handleObj)return d=a.handleObj,n(a.delegateTarget).off(d.namespace?d.origType+"."+d.namespace:d.origType,d.selector,d.handler),this;if("object"==typeof a){for(e in a)this.off(e,b,a[e]);return this}return b!==!1&&"function"!=typeof b||(c=b,b=void 0),c===!1&&(c=ha),this.each(function(){n.event.remove(this,a,c,b)})}});var ka=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:-]+)[^>]*)\/>/gi,la=/<script|<style|<link/i,ma=/checked\s*(?:[^=]|=\s*.checked.)/i,na=/^true\/(.*)/,oa=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;function pa(a,b){return n.nodeName(a,"table")&&n.nodeName(11!==b.nodeType?b:b.firstChild,"tr")?a.getElementsByTagName("tbody")[0]||a.appendChild(a.ownerDocument.createElement("tbody")):a}function qa(a){return a.type=(null!==a.getAttribute("type"))+"/"+a.type,a}function ra(a){var b=na.exec(a.type);return b?a.type=b[1]:a.removeAttribute("type"),a}function sa(a,b){var c,d,e,f,g,h,i,j;if(1===b.nodeType){if(N.hasData(a)&&(f=N.access(a),g=N.set(b,f),j=f.events)){delete g.handle,g.events={};for(e in j)for(c=0,d=j[e].length;d>c;c++)n.event.add(b,e,j[e][c])}O.hasData(a)&&(h=O.access(a),i=n.extend({},h),O.set(b,i))}}function ta(a,b){var c=b.nodeName.toLowerCase();"input"===c&&X.test(a.type)?b.checked=a.checked:"input"!==c&&"textarea"!==c||(b.defaultValue=a.defaultValue)}function ua(a,b,c,d){b=f.apply([],b);var e,g,h,i,j,k,m=0,o=a.length,p=o-1,q=b[0],r=n.isFunction(q);if(r||o>1&&"string"==typeof q&&!l.checkClone&&ma.test(q))return a.each(function(e){var f=a.eq(e);r&&(b[0]=q.call(this,e,f.html())),ua(f,b,c,d)});if(o&&(e=ca(b,a[0].ownerDocument,!1,a,d),g=e.firstChild,1===e.childNodes.length&&(e=g),g||d)){for(h=n.map(_(e,"script"),qa),i=h.length;o>m;m++)j=e,m!==p&&(j=n.clone(j,!0,!0),i&&n.merge(h,_(j,"script"))),c.call(a[m],j,m);if(i)for(k=h[h.length-1].ownerDocument,n.map(h,ra),m=0;i>m;m++)j=h[m],Z.test(j.type||"")&&!N.access(j,"globalEval")&&n.contains(k,j)&&(j.src?n._evalUrl&&n._evalUrl(j.src):n.globalEval(j.textContent.replace(oa,"")))}return a}function va(a,b,c){for(var d,e=b?n.filter(b,a):a,f=0;null!=(d=e[f]);f++)c||1!==d.nodeType||n.cleanData(_(d)),d.parentNode&&(c&&n.contains(d.ownerDocument,d)&&aa(_(d,"script")),d.parentNode.removeChild(d));return a}n.extend({htmlPrefilter:function(a){return a.replace(ka,"<$1></$2>")},clone:function(a,b,c){var d,e,f,g,h=a.cloneNode(!0),i=n.contains(a.ownerDocument,a);if(!(l.noCloneChecked||1!==a.nodeType&&11!==a.nodeType||n.isXMLDoc(a)))for(g=_(h),f=_(a),d=0,e=f.length;e>d;d++)ta(f[d],g[d]);if(b)if(c)for(f=f||_(a),g=g||_(h),d=0,e=f.length;e>d;d++)sa(f[d],g[d]);else sa(a,h);return g=_(h,"script"),g.length>0&&aa(g,!i&&_(a,"script")),h},cleanData:function(a){for(var b,c,d,e=n.event.special,f=0;void 0!==(c=a[f]);f++)if(L(c)){if(b=c[N.expando]){if(b.events)for(d in b.events)e[d]?n.event.remove(c,d):n.removeEvent(c,d,b.handle);c[N.expando]=void 0}c[O.expando]&&(c[O.expando]=void 0)}}}),n.fn.extend({domManip:ua,detach:function(a){return va(this,a,!0)},remove:function(a){return va(this,a)},text:function(a){return K(this,function(a){return void 0===a?n.text(this):this.empty().each(function(){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||(this.textContent=a)})},null,a,arguments.length)},append:function(){return ua(this,arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=pa(this,a);b.appendChild(a)}})},prepend:function(){return ua(this,arguments,function(a){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var b=pa(this,a);b.insertBefore(a,b.firstChild)}})},before:function(){return ua(this,arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this)})},after:function(){return ua(this,arguments,function(a){this.parentNode&&this.parentNode.insertBefore(a,this.nextSibling)})},empty:function(){for(var a,b=0;null!=(a=this[b]);b++)1===a.nodeType&&(n.cleanData(_(a,!1)),a.textContent="");return this},clone:function(a,b){return a=null==a?!1:a,b=null==b?a:b,this.map(function(){return n.clone(this,a,b)})},html:function(a){return K(this,function(a){var b=this[0]||{},c=0,d=this.length;if(void 0===a&&1===b.nodeType)return b.innerHTML;if("string"==typeof a&&!la.test(a)&&!$[(Y.exec(a)||["",""])[1].toLowerCase()]){a=n.htmlPrefilter(a);try{for(;d>c;c++)b=this[c]||{},1===b.nodeType&&(n.cleanData(_(b,!1)),b.innerHTML=a);b=0}catch(e){}}b&&this.empty().append(a)},null,a,arguments.length)},replaceWith:function(){var a=[];return ua(this,arguments,function(b){var c=this.parentNode;n.inArray(this,a)<0&&(n.cleanData(_(this)),c&&c.replaceChild(b,this))},a)}}),n.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(a,b){n.fn[a]=function(a){for(var c,d=[],e=n(a),f=e.length-1,h=0;f>=h;h++)c=h===f?this:this.clone(!0),n(e[h])[b](c),g.apply(d,c.get());return this.pushStack(d)}});var wa,xa={HTML:"block",BODY:"block"};function ya(a,b){var c=n(b.createElement(a)).appendTo(b.body),d=n.css(c[0],"display");return c.detach(),d}function za(a){var b=d,c=xa[a];return c||(c=ya(a,b),"none"!==c&&c||(wa=(wa||n("<iframe frameborder='0' width='0' height='0'/>")).appendTo(b.documentElement),b=wa[0].contentDocument,b.write(),b.close(),c=ya(a,b),wa.detach()),xa[a]=c),c}var Aa=/^margin/,Ba=new RegExp("^("+S+")(?!px)[a-z%]+$","i"),Ca=function(b){var c=b.ownerDocument.defaultView;return c&&c.opener||(c=a),c.getComputedStyle(b)},Da=function(a,b,c,d){var e,f,g={};for(f in b)g[f]=a.style[f],a.style[f]=b[f];e=c.apply(a,d||[]);for(f in b)a.style[f]=g[f];return e},Ea=d.documentElement;!function(){var b,c,e,f,g=d.createElement("div"),h=d.createElement("div");if(h.style){h.style.backgroundClip="content-box",h.cloneNode(!0).style.backgroundClip="",l.clearCloneStyle="content-box"===h.style.backgroundClip,g.style.cssText="border:0;width:8px;height:0;top:0;left:-9999px;padding:0;margin-top:1px;position:absolute",g.appendChild(h);function i(){h.style.cssText="-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;position:relative;display:block;margin:auto;border:1px;padding:1px;top:1%;width:50%",h.innerHTML="",Ea.appendChild(g);var d=a.getComputedStyle(h);b="1%"!==d.top,f="2px"===d.marginLeft,c="4px"===d.width,h.style.marginRight="50%",e="4px"===d.marginRight,Ea.removeChild(g)}n.extend(l,{pixelPosition:function(){return i(),b},boxSizingReliable:function(){return null==c&&i(),c},pixelMarginRight:function(){return null==c&&i(),e},reliableMarginLeft:function(){return null==c&&i(),f},reliableMarginRight:function(){var b,c=h.appendChild(d.createElement("div"));return c.style.cssText=h.style.cssText="-webkit-box-sizing:content-box;box-sizing:content-box;display:block;margin:0;border:0;padding:0",c.style.marginRight=c.style.width="0",h.style.width="1px",Ea.appendChild(g),b=!parseFloat(a.getComputedStyle(c).marginRight),Ea.removeChild(g),h.removeChild(c),b}})}}();function Fa(a,b,c){var d,e,f,g,h=a.style;return c=c||Ca(a),g=c?c.getPropertyValue(b)||c[b]:void 0,""!==g&&void 0!==g||n.contains(a.ownerDocument,a)||(g=n.style(a,b)),c&&!l.pixelMarginRight()&&Ba.test(g)&&Aa.test(b)&&(d=h.width,e=h.minWidth,f=h.maxWidth,h.minWidth=h.maxWidth=h.width=g,g=c.width,h.width=d,h.minWidth=e,h.maxWidth=f),void 0!==g?g+"":g}function Ga(a,b){return{get:function(){return a()?void delete this.get:(this.get=b).apply(this,arguments)}}}var Ha=/^(none|table(?!-c[ea]).+)/,Ia={position:"absolute",visibility:"hidden",display:"block"},Ja={letterSpacing:"0",fontWeight:"400"},Ka=["Webkit","O","Moz","ms"],La=d.createElement("div").style;function Ma(a){if(a in La)return a;var b=a[0].toUpperCase()+a.slice(1),c=Ka.length;while(c--)if(a=Ka[c]+b,a in La)return a}function Na(a,b,c){var d=T.exec(b);return d?Math.max(0,d[2]-(c||0))+(d[3]||"px"):b}function Oa(a,b,c,d,e){for(var f=c===(d?"border":"content")?4:"width"===b?1:0,g=0;4>f;f+=2)"margin"===c&&(g+=n.css(a,c+U[f],!0,e)),d?("content"===c&&(g-=n.css(a,"padding"+U[f],!0,e)),"margin"!==c&&(g-=n.css(a,"border"+U[f]+"Width",!0,e))):(g+=n.css(a,"padding"+U[f],!0,e),"padding"!==c&&(g+=n.css(a,"border"+U[f]+"Width",!0,e)));return g}function Pa(a,b,c){var d=!0,e="width"===b?a.offsetWidth:a.offsetHeight,f=Ca(a),g="border-box"===n.css(a,"boxSizing",!1,f);if(0>=e||null==e){if(e=Fa(a,b,f),(0>e||null==e)&&(e=a.style[b]),Ba.test(e))return e;d=g&&(l.boxSizingReliable()||e===a.style[b]),e=parseFloat(e)||0}return e+Oa(a,b,c||(g?"border":"content"),d,f)+"px"}function Qa(a,b){for(var c,d,e,f=[],g=0,h=a.length;h>g;g++)d=a[g],d.style&&(f[g]=N.get(d,"olddisplay"),c=d.style.display,b?(f[g]||"none"!==c||(d.style.display=""),""===d.style.display&&V(d)&&(f[g]=N.access(d,"olddisplay",za(d.nodeName)))):(e=V(d),"none"===c&&e||N.set(d,"olddisplay",e?c:n.css(d,"display"))));for(g=0;h>g;g++)d=a[g],d.style&&(b&&"none"!==d.style.display&&""!==d.style.display||(d.style.display=b?f[g]||"":"none"));return a}n.extend({cssHooks:{opacity:{get:function(a,b){if(b){var c=Fa(a,"opacity");return""===c?"1":c}}}},cssNumber:{animationIterationCount:!0,columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{"float":"cssFloat"},style:function(a,b,c,d){if(a&&3!==a.nodeType&&8!==a.nodeType&&a.style){var e,f,g,h=n.camelCase(b),i=a.style;return b=n.cssProps[h]||(n.cssProps[h]=Ma(h)||h),g=n.cssHooks[b]||n.cssHooks[h],void 0===c?g&&"get"in g&&void 0!==(e=g.get(a,!1,d))?e:i[b]:(f=typeof c,"string"===f&&(e=T.exec(c))&&e[1]&&(c=W(a,b,e),f="number"),null!=c&&c===c&&("number"===f&&(c+=e&&e[3]||(n.cssNumber[h]?"":"px")),l.clearCloneStyle||""!==c||0!==b.indexOf("background")||(i[b]="inherit"),g&&"set"in g&&void 0===(c=g.set(a,c,d))||(i[b]=c)),void 0)}},css:function(a,b,c,d){var e,f,g,h=n.camelCase(b);return b=n.cssProps[h]||(n.cssProps[h]=Ma(h)||h),g=n.cssHooks[b]||n.cssHooks[h],g&&"get"in g&&(e=g.get(a,!0,c)),void 0===e&&(e=Fa(a,b,d)),"normal"===e&&b in Ja&&(e=Ja[b]),""===c||c?(f=parseFloat(e),c===!0||isFinite(f)?f||0:e):e}}),n.each(["height","width"],function(a,b){n.cssHooks[b]={get:function(a,c,d){return c?Ha.test(n.css(a,"display"))&&0===a.offsetWidth?Da(a,Ia,function(){return Pa(a,b,d)}):Pa(a,b,d):void 0},set:function(a,c,d){var e,f=d&&Ca(a),g=d&&Oa(a,b,d,"border-box"===n.css(a,"boxSizing",!1,f),f);return g&&(e=T.exec(c))&&"px"!==(e[3]||"px")&&(a.style[b]=c,c=n.css(a,b)),Na(a,c,g)}}}),n.cssHooks.marginLeft=Ga(l.reliableMarginLeft,function(a,b){return b?(parseFloat(Fa(a,"marginLeft"))||a.getBoundingClientRect().left-Da(a,{marginLeft:0},function(){return a.getBoundingClientRect().left}))+"px":void 0}),n.cssHooks.marginRight=Ga(l.reliableMarginRight,function(a,b){return b?Da(a,{display:"inline-block"},Fa,[a,"marginRight"]):void 0}),n.each({margin:"",padding:"",border:"Width"},function(a,b){n.cssHooks[a+b]={expand:function(c){for(var d=0,e={},f="string"==typeof c?c.split(" "):[c];4>d;d++)e[a+U[d]+b]=f[d]||f[d-2]||f[0];return e}},Aa.test(a)||(n.cssHooks[a+b].set=Na)}),n.fn.extend({css:function(a,b){return K(this,function(a,b,c){var d,e,f={},g=0;if(n.isArray(b)){for(d=Ca(a),e=b.length;e>g;g++)f[b[g]]=n.css(a,b[g],!1,d);return f}return void 0!==c?n.style(a,b,c):n.css(a,b)},a,b,arguments.length>1)},show:function(){return Qa(this,!0)},hide:function(){return Qa(this)},toggle:function(a){return"boolean"==typeof a?a?this.show():this.hide():this.each(function(){V(this)?n(this).show():n(this).hide()})}});function Ra(a,b,c,d,e){return new Ra.prototype.init(a,b,c,d,e)}n.Tween=Ra,Ra.prototype={constructor:Ra,init:function(a,b,c,d,e,f){this.elem=a,this.prop=c,this.easing=e||n.easing._default,this.options=b,this.start=this.now=this.cur(),this.end=d,this.unit=f||(n.cssNumber[c]?"":"px")},cur:function(){var a=Ra.propHooks[this.prop];return a&&a.get?a.get(this):Ra.propHooks._default.get(this)},run:function(a){var b,c=Ra.propHooks[this.prop];return this.options.duration?this.pos=b=n.easing[this.easing](a,this.options.duration*a,0,1,this.options.duration):this.pos=b=a,this.now=(this.end-this.start)*b+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),c&&c.set?c.set(this):Ra.propHooks._default.set(this),this}},Ra.prototype.init.prototype=Ra.prototype,Ra.propHooks={_default:{get:function(a){var b;return 1!==a.elem.nodeType||null!=a.elem[a.prop]&&null==a.elem.style[a.prop]?a.elem[a.prop]:(b=n.css(a.elem,a.prop,""),b&&"auto"!==b?b:0)},set:function(a){n.fx.step[a.prop]?n.fx.step[a.prop](a):1!==a.elem.nodeType||null==a.elem.style[n.cssProps[a.prop]]&&!n.cssHooks[a.prop]?a.elem[a.prop]=a.now:n.style(a.elem,a.prop,a.now+a.unit)}}},Ra.propHooks.scrollTop=Ra.propHooks.scrollLeft={set:function(a){a.elem.nodeType&&a.elem.parentNode&&(a.elem[a.prop]=a.now)}},n.easing={linear:function(a){return a},swing:function(a){return.5-Math.cos(a*Math.PI)/2},_default:"swing"},n.fx=Ra.prototype.init,n.fx.step={};var Sa,Ta,Ua=/^(?:toggle|show|hide)$/,Va=/queueHooks$/;function Wa(){return a.setTimeout(function(){Sa=void 0}),Sa=n.now()}function Xa(a,b){var c,d=0,e={height:a};for(b=b?1:0;4>d;d+=2-b)c=U[d],e["margin"+c]=e["padding"+c]=a;return b&&(e.opacity=e.width=a),e}function Ya(a,b,c){for(var d,e=(_a.tweeners[b]||[]).concat(_a.tweeners["*"]),f=0,g=e.length;g>f;f++)if(d=e[f].call(c,b,a))return d}function Za(a,b,c){var d,e,f,g,h,i,j,k,l=this,m={},o=a.style,p=a.nodeType&&V(a),q=N.get(a,"fxshow");c.queue||(h=n._queueHooks(a,"fx"),null==h.unqueued&&(h.unqueued=0,i=h.empty.fire,h.empty.fire=function(){h.unqueued||i()}),h.unqueued++,l.always(function(){l.always(function(){h.unqueued--,n.queue(a,"fx").length||h.empty.fire()})})),1===a.nodeType&&("height"in b||"width"in b)&&(c.overflow=[o.overflow,o.overflowX,o.overflowY],j=n.css(a,"display"),k="none"===j?N.get(a,"olddisplay")||za(a.nodeName):j,"inline"===k&&"none"===n.css(a,"float")&&(o.display="inline-block")),c.overflow&&(o.overflow="hidden",l.always(function(){o.overflow=c.overflow[0],o.overflowX=c.overflow[1],o.overflowY=c.overflow[2]}));for(d in b)if(e=b[d],Ua.exec(e)){if(delete b[d],f=f||"toggle"===e,e===(p?"hide":"show")){if("show"!==e||!q||void 0===q[d])continue;p=!0}m[d]=q&&q[d]||n.style(a,d)}else j=void 0;if(n.isEmptyObject(m))"inline"===("none"===j?za(a.nodeName):j)&&(o.display=j);else{q?"hidden"in q&&(p=q.hidden):q=N.access(a,"fxshow",{}),f&&(q.hidden=!p),p?n(a).show():l.done(function(){n(a).hide()}),l.done(function(){var b;N.remove(a,"fxshow");for(b in m)n.style(a,b,m[b])});for(d in m)g=Ya(p?q[d]:0,d,l),d in q||(q[d]=g.start,p&&(g.end=g.start,g.start="width"===d||"height"===d?1:0))}}function $a(a,b){var c,d,e,f,g;for(c in a)if(d=n.camelCase(c),e=b[d],f=a[c],n.isArray(f)&&(e=f[1],f=a[c]=f[0]),c!==d&&(a[d]=f,delete a[c]),g=n.cssHooks[d],g&&"expand"in g){f=g.expand(f),delete a[d];for(c in f)c in a||(a[c]=f[c],b[c]=e)}else b[d]=e}function _a(a,b,c){var d,e,f=0,g=_a.prefilters.length,h=n.Deferred().always(function(){delete i.elem}),i=function(){if(e)return!1;for(var b=Sa||Wa(),c=Math.max(0,j.startTime+j.duration-b),d=c/j.duration||0,f=1-d,g=0,i=j.tweens.length;i>g;g++)j.tweens[g].run(f);return h.notifyWith(a,[j,f,c]),1>f&&i?c:(h.resolveWith(a,[j]),!1)},j=h.promise({elem:a,props:n.extend({},b),opts:n.extend(!0,{specialEasing:{},easing:n.easing._default},c),originalProperties:b,originalOptions:c,startTime:Sa||Wa(),duration:c.duration,tweens:[],createTween:function(b,c){var d=n.Tween(a,j.opts,b,c,j.opts.specialEasing[b]||j.opts.easing);return j.tweens.push(d),d},stop:function(b){var c=0,d=b?j.tweens.length:0;if(e)return this;for(e=!0;d>c;c++)j.tweens[c].run(1);return b?(h.notifyWith(a,[j,1,0]),h.resolveWith(a,[j,b])):h.rejectWith(a,[j,b]),this}}),k=j.props;for($a(k,j.opts.specialEasing);g>f;f++)if(d=_a.prefilters[f].call(j,a,k,j.opts))return n.isFunction(d.stop)&&(n._queueHooks(j.elem,j.opts.queue).stop=n.proxy(d.stop,d)),d;return n.map(k,Ya,j),n.isFunction(j.opts.start)&&j.opts.start.call(a,j),n.fx.timer(n.extend(i,{elem:a,anim:j,queue:j.opts.queue})),j.progress(j.opts.progress).done(j.opts.done,j.opts.complete).fail(j.opts.fail).always(j.opts.always)}n.Animation=n.extend(_a,{tweeners:{"*":[function(a,b){var c=this.createTween(a,b);return W(c.elem,a,T.exec(b),c),c}]},tweener:function(a,b){n.isFunction(a)?(b=a,a=["*"]):a=a.match(G);for(var c,d=0,e=a.length;e>d;d++)c=a[d],_a.tweeners[c]=_a.tweeners[c]||[],_a.tweeners[c].unshift(b)},prefilters:[Za],prefilter:function(a,b){b?_a.prefilters.unshift(a):_a.prefilters.push(a)}}),n.speed=function(a,b,c){var d=a&&"object"==typeof a?n.extend({},a):{complete:c||!c&&b||n.isFunction(a)&&a,duration:a,easing:c&&b||b&&!n.isFunction(b)&&b};return d.duration=n.fx.off?0:"number"==typeof d.duration?d.duration:d.duration in n.fx.speeds?n.fx.speeds[d.duration]:n.fx.speeds._default,null!=d.queue&&d.queue!==!0||(d.queue="fx"),d.old=d.complete,d.complete=function(){n.isFunction(d.old)&&d.old.call(this),d.queue&&n.dequeue(this,d.queue)},d},n.fn.extend({fadeTo:function(a,b,c,d){return this.filter(V).css("opacity",0).show().end().animate({opacity:b},a,c,d)},animate:function(a,b,c,d){var e=n.isEmptyObject(a),f=n.speed(b,c,d),g=function(){var b=_a(this,n.extend({},a),f);(e||N.get(this,"finish"))&&b.stop(!0)};return g.finish=g,e||f.queue===!1?this.each(g):this.queue(f.queue,g)},stop:function(a,b,c){var d=function(a){var b=a.stop;delete a.stop,b(c)};return"string"!=typeof a&&(c=b,b=a,a=void 0),b&&a!==!1&&this.queue(a||"fx",[]),this.each(function(){var b=!0,e=null!=a&&a+"queueHooks",f=n.timers,g=N.get(this);if(e)g[e]&&g[e].stop&&d(g[e]);else for(e in g)g[e]&&g[e].stop&&Va.test(e)&&d(g[e]);for(e=f.length;e--;)f[e].elem!==this||null!=a&&f[e].queue!==a||(f[e].anim.stop(c),b=!1,f.splice(e,1));!b&&c||n.dequeue(this,a)})},finish:function(a){return a!==!1&&(a=a||"fx"),this.each(function(){var b,c=N.get(this),d=c[a+"queue"],e=c[a+"queueHooks"],f=n.timers,g=d?d.length:0;for(c.finish=!0,n.queue(this,a,[]),e&&e.stop&&e.stop.call(this,!0),b=f.length;b--;)f[b].elem===this&&f[b].queue===a&&(f[b].anim.stop(!0),f.splice(b,1));for(b=0;g>b;b++)d[b]&&d[b].finish&&d[b].finish.call(this);delete c.finish})}}),n.each(["toggle","show","hide"],function(a,b){var c=n.fn[b];n.fn[b]=function(a,d,e){return null==a||"boolean"==typeof a?c.apply(this,arguments):this.animate(Xa(b,!0),a,d,e)}}),n.each({slideDown:Xa("show"),slideUp:Xa("hide"),slideToggle:Xa("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(a,b){n.fn[a]=function(a,c,d){return this.animate(b,a,c,d)}}),n.timers=[],n.fx.tick=function(){var a,b=0,c=n.timers;for(Sa=n.now();b<c.length;b++)a=c[b],a()||c[b]!==a||c.splice(b--,1);c.length||n.fx.stop(),Sa=void 0},n.fx.timer=function(a){n.timers.push(a),a()?n.fx.start():n.timers.pop()},n.fx.interval=13,n.fx.start=function(){Ta||(Ta=a.setInterval(n.fx.tick,n.fx.interval))},n.fx.stop=function(){a.clearInterval(Ta),Ta=null},n.fx.speeds={slow:600,fast:200,_default:400},n.fn.delay=function(b,c){return b=n.fx?n.fx.speeds[b]||b:b,c=c||"fx",this.queue(c,function(c,d){var e=a.setTimeout(c,b);d.stop=function(){a.clearTimeout(e)}})},function(){var a=d.createElement("input"),b=d.createElement("select"),c=b.appendChild(d.createElement("option"));a.type="checkbox",l.checkOn=""!==a.value,l.optSelected=c.selected,b.disabled=!0,l.optDisabled=!c.disabled,a=d.createElement("input"),a.value="t",a.type="radio",l.radioValue="t"===a.value}();var ab,bb=n.expr.attrHandle;n.fn.extend({attr:function(a,b){return K(this,n.attr,a,b,arguments.length>1)},removeAttr:function(a){return this.each(function(){n.removeAttr(this,a)})}}),n.extend({attr:function(a,b,c){var d,e,f=a.nodeType;if(3!==f&&8!==f&&2!==f)return"undefined"==typeof a.getAttribute?n.prop(a,b,c):(1===f&&n.isXMLDoc(a)||(b=b.toLowerCase(),e=n.attrHooks[b]||(n.expr.match.bool.test(b)?ab:void 0)),void 0!==c?null===c?void n.removeAttr(a,b):e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:(a.setAttribute(b,c+""),c):e&&"get"in e&&null!==(d=e.get(a,b))?d:(d=n.find.attr(a,b),null==d?void 0:d))},attrHooks:{type:{set:function(a,b){if(!l.radioValue&&"radio"===b&&n.nodeName(a,"input")){var c=a.value;return a.setAttribute("type",b),c&&(a.value=c),b}}}},removeAttr:function(a,b){var c,d,e=0,f=b&&b.match(G);if(f&&1===a.nodeType)while(c=f[e++])d=n.propFix[c]||c,n.expr.match.bool.test(c)&&(a[d]=!1),a.removeAttribute(c)}}),ab={set:function(a,b,c){return b===!1?n.removeAttr(a,c):a.setAttribute(c,c),c}},n.each(n.expr.match.bool.source.match(/\w+/g),function(a,b){var c=bb[b]||n.find.attr;bb[b]=function(a,b,d){var e,f;return d||(f=bb[b],bb[b]=e,e=null!=c(a,b,d)?b.toLowerCase():null,bb[b]=f),e}});var cb=/^(?:input|select|textarea|button)$/i,db=/^(?:a|area)$/i;n.fn.extend({prop:function(a,b){return K(this,n.prop,a,b,arguments.length>1)},removeProp:function(a){return this.each(function(){delete this[n.propFix[a]||a]})}}),n.extend({prop:function(a,b,c){var d,e,f=a.nodeType;if(3!==f&&8!==f&&2!==f)return 1===f&&n.isXMLDoc(a)||(b=n.propFix[b]||b,e=n.propHooks[b]),
        void 0!==c?e&&"set"in e&&void 0!==(d=e.set(a,c,b))?d:a[b]=c:e&&"get"in e&&null!==(d=e.get(a,b))?d:a[b]},propHooks:{tabIndex:{get:function(a){var b=n.find.attr(a,"tabindex");return b?parseInt(b,10):cb.test(a.nodeName)||db.test(a.nodeName)&&a.href?0:-1}}},propFix:{"for":"htmlFor","class":"className"}}),l.optSelected||(n.propHooks.selected={get:function(a){var b=a.parentNode;return b&&b.parentNode&&b.parentNode.selectedIndex,null},set:function(a){var b=a.parentNode;b&&(b.selectedIndex,b.parentNode&&b.parentNode.selectedIndex)}}),n.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){n.propFix[this.toLowerCase()]=this});var eb=/[\t\r\n\f]/g;function fb(a){return a.getAttribute&&a.getAttribute("class")||""}n.fn.extend({addClass:function(a){var b,c,d,e,f,g,h,i=0;if(n.isFunction(a))return this.each(function(b){n(this).addClass(a.call(this,b,fb(this)))});if("string"==typeof a&&a){b=a.match(G)||[];while(c=this[i++])if(e=fb(c),d=1===c.nodeType&&(" "+e+" ").replace(eb," ")){g=0;while(f=b[g++])d.indexOf(" "+f+" ")<0&&(d+=f+" ");h=n.trim(d),e!==h&&c.setAttribute("class",h)}}return this},removeClass:function(a){var b,c,d,e,f,g,h,i=0;if(n.isFunction(a))return this.each(function(b){n(this).removeClass(a.call(this,b,fb(this)))});if(!arguments.length)return this.attr("class","");if("string"==typeof a&&a){b=a.match(G)||[];while(c=this[i++])if(e=fb(c),d=1===c.nodeType&&(" "+e+" ").replace(eb," ")){g=0;while(f=b[g++])while(d.indexOf(" "+f+" ")>-1)d=d.replace(" "+f+" "," ");h=n.trim(d),e!==h&&c.setAttribute("class",h)}}return this},toggleClass:function(a,b){var c=typeof a;return"boolean"==typeof b&&"string"===c?b?this.addClass(a):this.removeClass(a):n.isFunction(a)?this.each(function(c){n(this).toggleClass(a.call(this,c,fb(this),b),b)}):this.each(function(){var b,d,e,f;if("string"===c){d=0,e=n(this),f=a.match(G)||[];while(b=f[d++])e.hasClass(b)?e.removeClass(b):e.addClass(b)}else void 0!==a&&"boolean"!==c||(b=fb(this),b&&N.set(this,"__className__",b),this.setAttribute&&this.setAttribute("class",b||a===!1?"":N.get(this,"__className__")||""))})},hasClass:function(a){var b,c,d=0;b=" "+a+" ";while(c=this[d++])if(1===c.nodeType&&(" "+fb(c)+" ").replace(eb," ").indexOf(b)>-1)return!0;return!1}});var gb=/\r/g,hb=/[\x20\t\r\n\f]+/g;n.fn.extend({val:function(a){var b,c,d,e=this[0];{if(arguments.length)return d=n.isFunction(a),this.each(function(c){var e;1===this.nodeType&&(e=d?a.call(this,c,n(this).val()):a,null==e?e="":"number"==typeof e?e+="":n.isArray(e)&&(e=n.map(e,function(a){return null==a?"":a+""})),b=n.valHooks[this.type]||n.valHooks[this.nodeName.toLowerCase()],b&&"set"in b&&void 0!==b.set(this,e,"value")||(this.value=e))});if(e)return b=n.valHooks[e.type]||n.valHooks[e.nodeName.toLowerCase()],b&&"get"in b&&void 0!==(c=b.get(e,"value"))?c:(c=e.value,"string"==typeof c?c.replace(gb,""):null==c?"":c)}}}),n.extend({valHooks:{option:{get:function(a){var b=n.find.attr(a,"value");return null!=b?b:n.trim(n.text(a)).replace(hb," ")}},select:{get:function(a){for(var b,c,d=a.options,e=a.selectedIndex,f="select-one"===a.type||0>e,g=f?null:[],h=f?e+1:d.length,i=0>e?h:f?e:0;h>i;i++)if(c=d[i],(c.selected||i===e)&&(l.optDisabled?!c.disabled:null===c.getAttribute("disabled"))&&(!c.parentNode.disabled||!n.nodeName(c.parentNode,"optgroup"))){if(b=n(c).val(),f)return b;g.push(b)}return g},set:function(a,b){var c,d,e=a.options,f=n.makeArray(b),g=e.length;while(g--)d=e[g],(d.selected=n.inArray(n.valHooks.option.get(d),f)>-1)&&(c=!0);return c||(a.selectedIndex=-1),f}}}}),n.each(["radio","checkbox"],function(){n.valHooks[this]={set:function(a,b){return n.isArray(b)?a.checked=n.inArray(n(a).val(),b)>-1:void 0}},l.checkOn||(n.valHooks[this].get=function(a){return null===a.getAttribute("value")?"on":a.value})});var ib=/^(?:focusinfocus|focusoutblur)$/;n.extend(n.event,{trigger:function(b,c,e,f){var g,h,i,j,l,m,o,p=[e||d],q=k.call(b,"type")?b.type:b,r=k.call(b,"namespace")?b.namespace.split("."):[];if(h=i=e=e||d,3!==e.nodeType&&8!==e.nodeType&&!ib.test(q+n.event.triggered)&&(q.indexOf(".")>-1&&(r=q.split("."),q=r.shift(),r.sort()),l=q.indexOf(":")<0&&"on"+q,b=b[n.expando]?b:new n.Event(q,"object"==typeof b&&b),b.isTrigger=f?2:3,b.namespace=r.join("."),b.rnamespace=b.namespace?new RegExp("(^|\\.)"+r.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,b.result=void 0,b.target||(b.target=e),c=null==c?[b]:n.makeArray(c,[b]),o=n.event.special[q]||{},f||!o.trigger||o.trigger.apply(e,c)!==!1)){if(!f&&!o.noBubble&&!n.isWindow(e)){for(j=o.delegateType||q,ib.test(j+q)||(h=h.parentNode);h;h=h.parentNode)p.push(h),i=h;i===(e.ownerDocument||d)&&p.push(i.defaultView||i.parentWindow||a)}g=0;while((h=p[g++])&&!b.isPropagationStopped())b.type=g>1?j:o.bindType||q,m=(N.get(h,"events")||{})[b.type]&&N.get(h,"handle"),m&&m.apply(h,c),m=l&&h[l],m&&m.apply&&L(h)&&(b.result=m.apply(h,c),b.result===!1&&b.preventDefault());return b.type=q,f||b.isDefaultPrevented()||o._default&&o._default.apply(p.pop(),c)!==!1||!L(e)||l&&n.isFunction(e[q])&&!n.isWindow(e)&&(i=e[l],i&&(e[l]=null),n.event.triggered=q,e[q](),n.event.triggered=void 0,i&&(e[l]=i)),b.result}},simulate:function(a,b,c){var d=n.extend(new n.Event,c,{type:a,isSimulated:!0});n.event.trigger(d,null,b)}}),n.fn.extend({trigger:function(a,b){return this.each(function(){n.event.trigger(a,b,this)})},triggerHandler:function(a,b){var c=this[0];return c?n.event.trigger(a,b,c,!0):void 0}}),n.each("blur focus focusin focusout load resize scroll unload click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup error contextmenu".split(" "),function(a,b){n.fn[b]=function(a,c){return arguments.length>0?this.on(b,null,a,c):this.trigger(b)}}),n.fn.extend({hover:function(a,b){return this.mouseenter(a).mouseleave(b||a)}}),l.focusin="onfocusin"in a,l.focusin||n.each({focus:"focusin",blur:"focusout"},function(a,b){var c=function(a){n.event.simulate(b,a.target,n.event.fix(a))};n.event.special[b]={setup:function(){var d=this.ownerDocument||this,e=N.access(d,b);e||d.addEventListener(a,c,!0),N.access(d,b,(e||0)+1)},teardown:function(){var d=this.ownerDocument||this,e=N.access(d,b)-1;e?N.access(d,b,e):(d.removeEventListener(a,c,!0),N.remove(d,b))}}});var jb=a.location,kb=n.now(),lb=/\?/;n.parseJSON=function(a){return JSON.parse(a+"")},n.parseXML=function(b){var c;if(!b||"string"!=typeof b)return null;try{c=(new a.DOMParser).parseFromString(b,"text/xml")}catch(d){c=void 0}return c&&!c.getElementsByTagName("parsererror").length||n.error("Invalid XML: "+b),c};var mb=/#.*$/,nb=/([?&])_=[^&]*/,ob=/^(.*?):[ \t]*([^\r\n]*)$/gm,pb=/^(?:about|app|app-storage|.+-extension|file|res|widget):$/,qb=/^(?:GET|HEAD)$/,rb=/^\/\//,sb={},tb={},ub="*/".concat("*"),vb=d.createElement("a");vb.href=jb.href;function wb(a){return function(b,c){"string"!=typeof b&&(c=b,b="*");var d,e=0,f=b.toLowerCase().match(G)||[];if(n.isFunction(c))while(d=f[e++])"+"===d[0]?(d=d.slice(1)||"*",(a[d]=a[d]||[]).unshift(c)):(a[d]=a[d]||[]).push(c)}}function xb(a,b,c,d){var e={},f=a===tb;function g(h){var i;return e[h]=!0,n.each(a[h]||[],function(a,h){var j=h(b,c,d);return"string"!=typeof j||f||e[j]?f?!(i=j):void 0:(b.dataTypes.unshift(j),g(j),!1)}),i}return g(b.dataTypes[0])||!e["*"]&&g("*")}function yb(a,b){var c,d,e=n.ajaxSettings.flatOptions||{};for(c in b)void 0!==b[c]&&((e[c]?a:d||(d={}))[c]=b[c]);return d&&n.extend(!0,a,d),a}function zb(a,b,c){var d,e,f,g,h=a.contents,i=a.dataTypes;while("*"===i[0])i.shift(),void 0===d&&(d=a.mimeType||b.getResponseHeader("Content-Type"));if(d)for(e in h)if(h[e]&&h[e].test(d)){i.unshift(e);break}if(i[0]in c)f=i[0];else{for(e in c){if(!i[0]||a.converters[e+" "+i[0]]){f=e;break}g||(g=e)}f=f||g}return f?(f!==i[0]&&i.unshift(f),c[f]):void 0}function Ab(a,b,c,d){var e,f,g,h,i,j={},k=a.dataTypes.slice();if(k[1])for(g in a.converters)j[g.toLowerCase()]=a.converters[g];f=k.shift();while(f)if(a.responseFields[f]&&(c[a.responseFields[f]]=b),!i&&d&&a.dataFilter&&(b=a.dataFilter(b,a.dataType)),i=f,f=k.shift())if("*"===f)f=i;else if("*"!==i&&i!==f){if(g=j[i+" "+f]||j["* "+f],!g)for(e in j)if(h=e.split(" "),h[1]===f&&(g=j[i+" "+h[0]]||j["* "+h[0]])){g===!0?g=j[e]:j[e]!==!0&&(f=h[0],k.unshift(h[1]));break}if(g!==!0)if(g&&a["throws"])b=g(b);else try{b=g(b)}catch(l){return{state:"parsererror",error:g?l:"No conversion from "+i+" to "+f}}}return{state:"success",data:b}}n.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:jb.href,type:"GET",isLocal:pb.test(jb.protocol),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":ub,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/\bxml\b/,html:/\bhtml/,json:/\bjson\b/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":n.parseJSON,"text xml":n.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(a,b){return b?yb(yb(a,n.ajaxSettings),b):yb(n.ajaxSettings,a)},ajaxPrefilter:wb(sb),ajaxTransport:wb(tb),ajax:function(b,c){"object"==typeof b&&(c=b,b=void 0),c=c||{};var e,f,g,h,i,j,k,l,m=n.ajaxSetup({},c),o=m.context||m,p=m.context&&(o.nodeType||o.jquery)?n(o):n.event,q=n.Deferred(),r=n.Callbacks("once memory"),s=m.statusCode||{},t={},u={},v=0,w="canceled",x={readyState:0,getResponseHeader:function(a){var b;if(2===v){if(!h){h={};while(b=ob.exec(g))h[b[1].toLowerCase()]=b[2]}b=h[a.toLowerCase()]}return null==b?null:b},getAllResponseHeaders:function(){return 2===v?g:null},setRequestHeader:function(a,b){var c=a.toLowerCase();return v||(a=u[c]=u[c]||a,t[a]=b),this},overrideMimeType:function(a){return v||(m.mimeType=a),this},statusCode:function(a){var b;if(a)if(2>v)for(b in a)s[b]=[s[b],a[b]];else x.always(a[x.status]);return this},abort:function(a){var b=a||w;return e&&e.abort(b),z(0,b),this}};if(q.promise(x).complete=r.add,x.success=x.done,x.error=x.fail,m.url=((b||m.url||jb.href)+"").replace(mb,"").replace(rb,jb.protocol+"//"),m.type=c.method||c.type||m.method||m.type,m.dataTypes=n.trim(m.dataType||"*").toLowerCase().match(G)||[""],null==m.crossDomain){j=d.createElement("a");try{j.href=m.url,j.href=j.href,m.crossDomain=vb.protocol+"//"+vb.host!=j.protocol+"//"+j.host}catch(y){m.crossDomain=!0}}if(m.data&&m.processData&&"string"!=typeof m.data&&(m.data=n.param(m.data,m.traditional)),xb(sb,m,c,x),2===v)return x;k=n.event&&m.global,k&&0===n.active++&&n.event.trigger("ajaxStart"),m.type=m.type.toUpperCase(),m.hasContent=!qb.test(m.type),f=m.url,m.hasContent||(m.data&&(f=m.url+=(lb.test(f)?"&":"?")+m.data,delete m.data),m.cache===!1&&(m.url=nb.test(f)?f.replace(nb,"$1_="+kb++):f+(lb.test(f)?"&":"?")+"_="+kb++)),m.ifModified&&(n.lastModified[f]&&x.setRequestHeader("If-Modified-Since",n.lastModified[f]),n.etag[f]&&x.setRequestHeader("If-None-Match",n.etag[f])),(m.data&&m.hasContent&&m.contentType!==!1||c.contentType)&&x.setRequestHeader("Content-Type",m.contentType),x.setRequestHeader("Accept",m.dataTypes[0]&&m.accepts[m.dataTypes[0]]?m.accepts[m.dataTypes[0]]+("*"!==m.dataTypes[0]?", "+ub+"; q=0.01":""):m.accepts["*"]);for(l in m.headers)x.setRequestHeader(l,m.headers[l]);if(m.beforeSend&&(m.beforeSend.call(o,x,m)===!1||2===v))return x.abort();w="abort";for(l in{success:1,error:1,complete:1})x[l](m[l]);if(e=xb(tb,m,c,x)){if(x.readyState=1,k&&p.trigger("ajaxSend",[x,m]),2===v)return x;m.async&&m.timeout>0&&(i=a.setTimeout(function(){x.abort("timeout")},m.timeout));try{v=1,e.send(t,z)}catch(y){if(!(2>v))throw y;z(-1,y)}}else z(-1,"No Transport");function z(b,c,d,h){var j,l,t,u,w,y=c;2!==v&&(v=2,i&&a.clearTimeout(i),e=void 0,g=h||"",x.readyState=b>0?4:0,j=b>=200&&300>b||304===b,d&&(u=zb(m,x,d)),u=Ab(m,u,x,j),j?(m.ifModified&&(w=x.getResponseHeader("Last-Modified"),w&&(n.lastModified[f]=w),w=x.getResponseHeader("etag"),w&&(n.etag[f]=w)),204===b||"HEAD"===m.type?y="nocontent":304===b?y="notmodified":(y=u.state,l=u.data,t=u.error,j=!t)):(t=y,!b&&y||(y="error",0>b&&(b=0))),x.status=b,x.statusText=(c||y)+"",j?q.resolveWith(o,[l,y,x]):q.rejectWith(o,[x,y,t]),x.statusCode(s),s=void 0,k&&p.trigger(j?"ajaxSuccess":"ajaxError",[x,m,j?l:t]),r.fireWith(o,[x,y]),k&&(p.trigger("ajaxComplete",[x,m]),--n.active||n.event.trigger("ajaxStop")))}return x},getJSON:function(a,b,c){return n.get(a,b,c,"json")},getScript:function(a,b){return n.get(a,void 0,b,"script")}}),n.each(["get","post"],function(a,b){n[b]=function(a,c,d,e){return n.isFunction(c)&&(e=e||d,d=c,c=void 0),n.ajax(n.extend({url:a,type:b,dataType:e,data:c,success:d},n.isPlainObject(a)&&a))}}),n._evalUrl=function(a){return n.ajax({url:a,type:"GET",dataType:"script",async:!1,global:!1,"throws":!0})},n.fn.extend({wrapAll:function(a){var b;return n.isFunction(a)?this.each(function(b){n(this).wrapAll(a.call(this,b))}):(this[0]&&(b=n(a,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&b.insertBefore(this[0]),b.map(function(){var a=this;while(a.firstElementChild)a=a.firstElementChild;return a}).append(this)),this)},wrapInner:function(a){return n.isFunction(a)?this.each(function(b){n(this).wrapInner(a.call(this,b))}):this.each(function(){var b=n(this),c=b.contents();c.length?c.wrapAll(a):b.append(a)})},wrap:function(a){var b=n.isFunction(a);return this.each(function(c){n(this).wrapAll(b?a.call(this,c):a)})},unwrap:function(){return this.parent().each(function(){n.nodeName(this,"body")||n(this).replaceWith(this.childNodes)}).end()}}),n.expr.filters.hidden=function(a){return!n.expr.filters.visible(a)},n.expr.filters.visible=function(a){return a.offsetWidth>0||a.offsetHeight>0||a.getClientRects().length>0};var Bb=/%20/g,Cb=/\[\]$/,Db=/\r?\n/g,Eb=/^(?:submit|button|image|reset|file)$/i,Fb=/^(?:input|select|textarea|keygen)/i;function Gb(a,b,c,d){var e;if(n.isArray(b))n.each(b,function(b,e){c||Cb.test(a)?d(a,e):Gb(a+"["+("object"==typeof e&&null!=e?b:"")+"]",e,c,d)});else if(c||"object"!==n.type(b))d(a,b);else for(e in b)Gb(a+"["+e+"]",b[e],c,d)}n.param=function(a,b){var c,d=[],e=function(a,b){b=n.isFunction(b)?b():null==b?"":b,d[d.length]=encodeURIComponent(a)+"="+encodeURIComponent(b)};if(void 0===b&&(b=n.ajaxSettings&&n.ajaxSettings.traditional),n.isArray(a)||a.jquery&&!n.isPlainObject(a))n.each(a,function(){e(this.name,this.value)});else for(c in a)Gb(c,a[c],b,e);return d.join("&").replace(Bb,"+")},n.fn.extend({serialize:function(){return n.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var a=n.prop(this,"elements");return a?n.makeArray(a):this}).filter(function(){var a=this.type;return this.name&&!n(this).is(":disabled")&&Fb.test(this.nodeName)&&!Eb.test(a)&&(this.checked||!X.test(a))}).map(function(a,b){var c=n(this).val();return null==c?null:n.isArray(c)?n.map(c,function(a){return{name:b.name,value:a.replace(Db,"\r\n")}}):{name:b.name,value:c.replace(Db,"\r\n")}}).get()}}),n.ajaxSettings.xhr=function(){try{return new a.XMLHttpRequest}catch(b){}};var Hb={0:200,1223:204},Ib=n.ajaxSettings.xhr();l.cors=!!Ib&&"withCredentials"in Ib,l.ajax=Ib=!!Ib,n.ajaxTransport(function(b){var c,d;return l.cors||Ib&&!b.crossDomain?{send:function(e,f){var g,h=b.xhr();if(h.open(b.type,b.url,b.async,b.username,b.password),b.xhrFields)for(g in b.xhrFields)h[g]=b.xhrFields[g];b.mimeType&&h.overrideMimeType&&h.overrideMimeType(b.mimeType),b.crossDomain||e["X-Requested-With"]||(e["X-Requested-With"]="XMLHttpRequest");for(g in e)h.setRequestHeader(g,e[g]);c=function(a){return function(){c&&(c=d=h.onload=h.onerror=h.onabort=h.onreadystatechange=null,"abort"===a?h.abort():"error"===a?"number"!=typeof h.status?f(0,"error"):f(h.status,h.statusText):f(Hb[h.status]||h.status,h.statusText,"text"!==(h.responseType||"text")||"string"!=typeof h.responseText?{binary:h.response}:{text:h.responseText},h.getAllResponseHeaders()))}},h.onload=c(),d=h.onerror=c("error"),void 0!==h.onabort?h.onabort=d:h.onreadystatechange=function(){4===h.readyState&&a.setTimeout(function(){c&&d()})},c=c("abort");try{h.send(b.hasContent&&b.data||null)}catch(i){if(c)throw i}},abort:function(){c&&c()}}:void 0}),n.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/\b(?:java|ecma)script\b/},converters:{"text script":function(a){return n.globalEval(a),a}}}),n.ajaxPrefilter("script",function(a){void 0===a.cache&&(a.cache=!1),a.crossDomain&&(a.type="GET")}),n.ajaxTransport("script",function(a){if(a.crossDomain){var b,c;return{send:function(e,f){b=n("<script>").prop({charset:a.scriptCharset,src:a.url}).on("load error",c=function(a){b.remove(),c=null,a&&f("error"===a.type?404:200,a.type)}),d.head.appendChild(b[0])},abort:function(){c&&c()}}}});var Jb=[],Kb=/(=)\?(?=&|$)|\?\?/;n.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var a=Jb.pop()||n.expando+"_"+kb++;return this[a]=!0,a}}),n.ajaxPrefilter("json jsonp",function(b,c,d){var e,f,g,h=b.jsonp!==!1&&(Kb.test(b.url)?"url":"string"==typeof b.data&&0===(b.contentType||"").indexOf("application/x-www-form-urlencoded")&&Kb.test(b.data)&&"data");return h||"jsonp"===b.dataTypes[0]?(e=b.jsonpCallback=n.isFunction(b.jsonpCallback)?b.jsonpCallback():b.jsonpCallback,h?b[h]=b[h].replace(Kb,"$1"+e):b.jsonp!==!1&&(b.url+=(lb.test(b.url)?"&":"?")+b.jsonp+"="+e),b.converters["script json"]=function(){return g||n.error(e+" was not called"),g[0]},b.dataTypes[0]="json",f=a[e],a[e]=function(){g=arguments},d.always(function(){void 0===f?n(a).removeProp(e):a[e]=f,b[e]&&(b.jsonpCallback=c.jsonpCallback,Jb.push(e)),g&&n.isFunction(f)&&f(g[0]),g=f=void 0}),"script"):void 0}),n.parseHTML=function(a,b,c){if(!a||"string"!=typeof a)return null;"boolean"==typeof b&&(c=b,b=!1),b=b||d;var e=x.exec(a),f=!c&&[];return e?[b.createElement(e[1])]:(e=ca([a],b,f),f&&f.length&&n(f).remove(),n.merge([],e.childNodes))};var Lb=n.fn.load;n.fn.load=function(a,b,c){if("string"!=typeof a&&Lb)return Lb.apply(this,arguments);var d,e,f,g=this,h=a.indexOf(" ");return h>-1&&(d=n.trim(a.slice(h)),a=a.slice(0,h)),n.isFunction(b)?(c=b,b=void 0):b&&"object"==typeof b&&(e="POST"),g.length>0&&n.ajax({url:a,type:e||"GET",dataType:"html",data:b}).done(function(a){f=arguments,g.html(d?n("<div>").append(n.parseHTML(a)).find(d):a)}).always(c&&function(a,b){g.each(function(){c.apply(this,f||[a.responseText,b,a])})}),this},n.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(a,b){n.fn[b]=function(a){return this.on(b,a)}}),n.expr.filters.animated=function(a){return n.grep(n.timers,function(b){return a===b.elem}).length};function Mb(a){return n.isWindow(a)?a:9===a.nodeType&&a.defaultView}n.offset={setOffset:function(a,b,c){var d,e,f,g,h,i,j,k=n.css(a,"position"),l=n(a),m={};"static"===k&&(a.style.position="relative"),h=l.offset(),f=n.css(a,"top"),i=n.css(a,"left"),j=("absolute"===k||"fixed"===k)&&(f+i).indexOf("auto")>-1,j?(d=l.position(),g=d.top,e=d.left):(g=parseFloat(f)||0,e=parseFloat(i)||0),n.isFunction(b)&&(b=b.call(a,c,n.extend({},h))),null!=b.top&&(m.top=b.top-h.top+g),null!=b.left&&(m.left=b.left-h.left+e),"using"in b?b.using.call(a,m):l.css(m)}},n.fn.extend({offset:function(a){if(arguments.length)return void 0===a?this:this.each(function(b){n.offset.setOffset(this,a,b)});var b,c,d=this[0],e={top:0,left:0},f=d&&d.ownerDocument;if(f)return b=f.documentElement,n.contains(b,d)?(e=d.getBoundingClientRect(),c=Mb(f),{top:e.top+c.pageYOffset-b.clientTop,left:e.left+c.pageXOffset-b.clientLeft}):e},position:function(){if(this[0]){var a,b,c=this[0],d={top:0,left:0};return"fixed"===n.css(c,"position")?b=c.getBoundingClientRect():(a=this.offsetParent(),b=this.offset(),n.nodeName(a[0],"html")||(d=a.offset()),d.top+=n.css(a[0],"borderTopWidth",!0),d.left+=n.css(a[0],"borderLeftWidth",!0)),{top:b.top-d.top-n.css(c,"marginTop",!0),left:b.left-d.left-n.css(c,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var a=this.offsetParent;while(a&&"static"===n.css(a,"position"))a=a.offsetParent;return a||Ea})}}),n.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(a,b){var c="pageYOffset"===b;n.fn[a]=function(d){return K(this,function(a,d,e){var f=Mb(a);return void 0===e?f?f[b]:a[d]:void(f?f.scrollTo(c?f.pageXOffset:e,c?e:f.pageYOffset):a[d]=e)},a,d,arguments.length)}}),n.each(["top","left"],function(a,b){n.cssHooks[b]=Ga(l.pixelPosition,function(a,c){return c?(c=Fa(a,b),Ba.test(c)?n(a).position()[b]+"px":c):void 0})}),n.each({Height:"height",Width:"width"},function(a,b){n.each({padding:"inner"+a,content:b,"":"outer"+a},function(c,d){n.fn[d]=function(d,e){var f=arguments.length&&(c||"boolean"!=typeof d),g=c||(d===!0||e===!0?"margin":"border");return K(this,function(b,c,d){var e;return n.isWindow(b)?b.document.documentElement["client"+a]:9===b.nodeType?(e=b.documentElement,Math.max(b.body["scroll"+a],e["scroll"+a],b.body["offset"+a],e["offset"+a],e["client"+a])):void 0===d?n.css(b,c,g):n.style(b,c,d,g)},b,f?d:void 0,f,null)}})}),n.fn.extend({bind:function(a,b,c){return this.on(a,null,b,c)},unbind:function(a,b){return this.off(a,null,b)},delegate:function(a,b,c,d){return this.on(b,a,c,d)},undelegate:function(a,b,c){return 1===arguments.length?this.off(a,"**"):this.off(b,a||"**",c)},size:function(){return this.length}}),n.fn.andSelf=n.fn.addBack,"function"==typeof define&&define.amd&&define("jquery",[],function(){return n});var Nb=a.jQuery,Ob=a.$;return n.noConflict=function(b){return a.$===n&&(a.$=Ob),b&&a.jQuery===n&&(a.jQuery=Nb),n},b||(a.jQuery=a.$=n),n});
    }

    // jQuery.contextMenu
    !function(e){"function"==typeof define&&define.amd?define(["jquery"],e):e("object"==typeof exports?require("jquery"):jQuery)}(function(e){"use strict";function t(e){for(var t,n=e.split(/\s+/),a=[],o=0;t=n[o];o++)t=t.charAt(0).toUpperCase(),a.push(t);return a}function n(t){return t.id&&e('label[for="'+t.id+'"]').val()||t.name}function a(t,o,s){return s||(s=0),o.each(function(){var o,i,c=e(this),l=this,r=this.nodeName.toLowerCase();switch("label"===r&&c.find("input, textarea, select").length&&(o=c.text(),r=(l=(c=c.children().first()).get(0)).nodeName.toLowerCase()),r){case"menu":i={name:c.attr("label"),items:{}},s=a(i.items,c.children(),s);break;case"a":case"button":i={name:c.text(),disabled:!!c.attr("disabled"),callback:function(){c.get(0).click()}};break;case"menuitem":case"command":switch(c.attr("type")){case void 0:case"command":case"menuitem":i={name:c.attr("label"),disabled:!!c.attr("disabled"),icon:c.attr("icon"),callback:function(){c.get(0).click()}};break;case"checkbox":i={type:"checkbox",disabled:!!c.attr("disabled"),name:c.attr("label"),selected:!!c.attr("checked")};break;case"radio":i={type:"radio",disabled:!!c.attr("disabled"),name:c.attr("label"),radio:c.attr("radiogroup"),value:c.attr("id"),selected:!!c.attr("checked")};break;default:i=void 0}break;case"hr":i="-------";break;case"input":switch(c.attr("type")){case"text":i={type:"text",name:o||n(l),disabled:!!c.attr("disabled"),value:c.val()};break;case"checkbox":i={type:"checkbox",name:o||n(l),disabled:!!c.attr("disabled"),selected:!!c.attr("checked")};break;case"radio":i={type:"radio",name:o||n(l),disabled:!!c.attr("disabled"),radio:!!c.attr("name"),value:c.val(),selected:!!c.attr("checked")};break;default:i=void 0}break;case"select":i={type:"select",name:o||n(l),disabled:!!c.attr("disabled"),selected:c.val(),options:{}},c.children().each(function(){i.options[this.value]=e(this).text()});break;case"textarea":i={type:"textarea",name:o||n(l),disabled:!!c.attr("disabled"),value:c.val()};break;case"label":break;default:i={type:"html",html:c.clone(!0)}}i&&(t["key"+ ++s]=i)}),s}e.support.htmlMenuitem="HTMLMenuItemElement"in window,e.support.htmlCommand="HTMLCommandElement"in window,e.support.eventSelectstart="onselectstart"in document.documentElement,e.ui&&e.widget||(e.cleanData=function(t){return function(n){var a,o,s;for(s=0;null!=n[s];s++){o=n[s];try{(a=e._data(o,"events"))&&a.remove&&e(o).triggerHandler("remove")}catch(e){}}t(n)}}(e.cleanData));var o=null,s=!1,i=e(UW),c=0,l={},r={},u={},d={selector:null,appendTo:null,trigger:"right",autoHide:!1,delay:200,reposition:!0,selectableSubMenu:!1,classNames:{hover:"context-menu-hover",disabled:"context-menu-disabled",visible:"context-menu-visible",notSelectable:"context-menu-not-selectable",icon:"context-menu-icon",iconEdit:"context-menu-icon-edit",iconCut:"context-menu-icon-cut",iconCopy:"context-menu-icon-copy",iconPaste:"context-menu-icon-paste",iconDelete:"context-menu-icon-delete",iconAdd:"context-menu-icon-add",iconQuit:"context-menu-icon-quit",iconLoadingClass:"context-menu-icon-loading"},determinePosition:function(t){if(e.ui&&e.ui.position)t.css("display","block").position({my:"center top",at:"center bottom",of:this,offset:"0 5",collision:"fit"}).css("display","none");else{var n=this.offset();n.top+=this.outerHeight(),n.left+=this.outerWidth()/2-t.outerWidth()/2,t.css(n)}},position:function(e,t,n){var a;if(t||n){if("maintain"===t&&"maintain"===n)a=e.$menu.position();else{var o=e.$menu.offsetParent().offset();a={top:n-o.top,left:t-o.left}}var s=i.scrollTop()+i.height(),c=i.scrollLeft()+i.width(),l=e.$menu.outerHeight(),r=e.$menu.outerWidth();a.top+l>s&&(a.top-=l),a.top<0&&(a.top=0),a.left+r>c&&(a.left-=r),a.left<0&&(a.left=0),e.$menu.css(a)}else e.determinePosition.call(this,e.$menu)},positionSubmenu:function(t){if(void 0!==t)if(e.ui&&e.ui.position)t.css("display","block").position({my:"left top-5",at:"right top",of:this,collision:"flipfit fit"}).css("display","");else{var n={top:-9,left:this.outerWidth()-5};t.css(n)}},zIndex:1,animation:{duration:50,show:"slideDown",hide:"slideUp"},events:{show:e.noop,hide:e.noop},callback:null,items:{}},m={timer:null,pageX:null,pageY:null},p=function(e){for(var t=0,n=e;;)if(t=Math.max(t,parseInt(n.css("z-index"),10)||0),!(n=n.parent())||!n.length||"html body".indexOf(n.prop("nodeName").toLowerCase())>-1)break;return t},f={abortevent:function(e){e.preventDefault(),e.stopImmediatePropagation()},contextmenu:function(t){var n=e(this);if("right"===t.data.trigger&&(t.preventDefault(),t.stopImmediatePropagation()),!("right"!==t.data.trigger&&"demand"!==t.data.trigger&&t.originalEvent||!(void 0===t.mouseButton||!t.data||"left"===t.data.trigger&&0===t.mouseButton||"right"===t.data.trigger&&2===t.mouseButton)||n.hasClass("context-menu-active")||n.hasClass("context-menu-disabled"))){if(o=n,t.data.build){var a=t.data.build(o,t);if(!1===a)return;if(t.data=e.extend(!0,{},d,t.data,a||{}),!t.data.items||e.isEmptyObject(t.data.items))throw window.console&&(console.error||console.log).call(console,"No items specified to show in contextMenu"),new Error("No Items specified");t.data.$trigger=o,h.create(t.data)}var s=!1;for(var i in t.data.items)if(t.data.items.hasOwnProperty(i)){(e.isFunction(t.data.items[i].visible)?t.data.items[i].visible.call(e(t.currentTarget),i,t.data):void 0===t.data.items[i]||!t.data.items[i].visible||!0===t.data.items[i].visible)&&(s=!0)}s&&h.show.call(n,t.data,t.pageX,t.pageY)}},click:function(t){t.preventDefault(),t.stopImmediatePropagation(),e(this).trigger(e.Event("contextmenu",{data:t.data,pageX:t.pageX,pageY:t.pageY}))},mousedown:function(t){var n=e(this);o&&o.length&&!o.is(n)&&o.data("contextMenu").$menu.trigger("contextmenu:hide"),2===t.button&&(o=n.data("contextMenuActive",!0))},mouseup:function(t){var n=e(this);n.data("contextMenuActive")&&o&&o.length&&o.is(n)&&!n.hasClass("context-menu-disabled")&&(t.preventDefault(),t.stopImmediatePropagation(),o=n,n.trigger(e.Event("contextmenu",{data:t.data,pageX:t.pageX,pageY:t.pageY}))),n.removeData("contextMenuActive")},mouseenter:function(t){var n=e(this),a=e(t.relatedTarget),s=e(document);a.is(".context-menu-list")||a.closest(".context-menu-list").length||o&&o.length||(m.pageX=t.pageX,m.pageY=t.pageY,m.data=t.data,s.on("mousemove.contextMenuShow",f.mousemove),m.timer=setTimeout(function(){m.timer=null,s.off("mousemove.contextMenuShow"),o=n,n.trigger(e.Event("contextmenu",{data:m.data,pageX:m.pageX,pageY:m.pageY}))},t.data.delay))},mousemove:function(e){m.pageX=e.pageX,m.pageY=e.pageY},mouseleave:function(t){var n=e(t.relatedTarget);if(!n.is(".context-menu-list")&&!n.closest(".context-menu-list").length){try{clearTimeout(m.timer)}catch(t){}m.timer=null}},layerClick:function(t){var n,a,o=e(this).data("contextMenuRoot"),s=t.button,c=t.pageX,l=t.pageY;t.preventDefault(),setTimeout(function(){var r,u="left"===o.trigger&&0===s||"right"===o.trigger&&2===s;if(document.elementFromPoint&&o.$layer){if(o.$layer.hide(),(n=document.elementFromPoint(c-i.scrollLeft(),l-i.scrollTop())).isContentEditable){var d=document.createRange(),m=UW.getSelection();d.selectNode(n),d.collapse(!0),m.removeAllRanges(),m.addRange(d)}e(n).trigger(t),o.$layer.show()}if(o.reposition&&u)if(document.elementFromPoint){if(o.$trigger.is(n))return void o.position.call(o.$trigger,o,c,l)}else if(a=o.$trigger.offset(),r=e(UW),a.top+=r.scrollTop(),a.top<=t.pageY&&(a.left+=r.scrollLeft(),a.left<=t.pageX&&(a.bottom=a.top+o.$trigger.outerHeight(),a.bottom>=t.pageY&&(a.right=a.left+o.$trigger.outerWidth(),a.right>=t.pageX))))return void o.position.call(o.$trigger,o,c,l);n&&u&&o.$trigger.one("contextmenu:hidden",function(){e(n).contextMenu({x:c,y:l,button:s})}),null!==o&&void 0!==o&&null!==o.$menu&&void 0!==o.$menu&&o.$menu.trigger("contextmenu:hide")},50)},keyStop:function(e,t){t.isInput||e.preventDefault(),e.stopPropagation()},key:function(e){var t={};o&&(t=o.data("contextMenu")||{}),void 0===t.zIndex&&(t.zIndex=0);var n=0,a=function(e){""!==e.style.zIndex?n=e.style.zIndex:null!==e.offsetParent&&void 0!==e.offsetParent?a(e.offsetParent):null!==e.parentElement&&void 0!==e.parentElement&&a(e.parentElement)};if(a(e.target),!(t.$menu&&parseInt(n,10)>parseInt(t.$menu.css("zIndex"),10))){switch(e.keyCode){case 9:case 38:if(f.keyStop(e,t),t.isInput){if(9===e.keyCode&&e.shiftKey)return e.preventDefault(),t.$selected&&t.$selected.find("input, textarea, select").blur(),void(null!==t.$menu&&void 0!==t.$menu&&t.$menu.trigger("prevcommand"));if(38===e.keyCode&&"checkbox"===t.$selected.find("input, textarea, select").prop("type"))return void e.preventDefault()}else if(9!==e.keyCode||e.shiftKey)return void(null!==t.$menu&&void 0!==t.$menu&&t.$menu.trigger("prevcommand"));break;case 40:if(f.keyStop(e,t),!t.isInput)return void(null!==t.$menu&&void 0!==t.$menu&&t.$menu.trigger("nextcommand"));if(9===e.keyCode)return e.preventDefault(),t.$selected&&t.$selected.find("input, textarea, select").blur(),void(null!==t.$menu&&void 0!==t.$menu&&t.$menu.trigger("nextcommand"));if(40===e.keyCode&&"checkbox"===t.$selected.find("input, textarea, select").prop("type"))return void e.preventDefault();break;case 37:if(f.keyStop(e,t),t.isInput||!t.$selected||!t.$selected.length)break;if(!t.$selected.parent().hasClass("context-menu-root")){var s=t.$selected.parent().parent();return t.$selected.trigger("contextmenu:blur"),void(t.$selected=s)}break;case 39:if(f.keyStop(e,t),t.isInput||!t.$selected||!t.$selected.length)break;var i=t.$selected.data("contextMenu")||{};if(i.$menu&&t.$selected.hasClass("context-menu-submenu"))return t.$selected=null,i.$selected=null,void i.$menu.trigger("nextcommand");break;case 35:case 36:return t.$selected&&t.$selected.find("input, textarea, select").length?void 0:((t.$selected&&t.$selected.parent()||t.$menu).children(":not(."+t.classNames.disabled+", ."+t.classNames.notSelectable+")")[36===e.keyCode?"first":"last"]().trigger("contextmenu:focus"),void e.preventDefault());case 13:if(f.keyStop(e,t),t.isInput){if(t.$selected&&!t.$selected.is("textarea, select"))return void e.preventDefault();break}return void(void 0!==t.$selected&&null!==t.$selected&&t.$selected.trigger("mouseup"));case 32:case 33:case 34:return void f.keyStop(e,t);case 27:return f.keyStop(e,t),void(null!==t.$menu&&void 0!==t.$menu&&t.$menu.trigger("contextmenu:hide"));default:var c=String.fromCharCode(e.keyCode).toUpperCase();if(t.accesskeys&&t.accesskeys[c])return void t.accesskeys[c].$node.trigger(t.accesskeys[c].$menu?"contextmenu:focus":"mouseup")}e.stopPropagation(),void 0!==t.$selected&&null!==t.$selected&&t.$selected.trigger(e)}},prevItem:function(t){t.stopPropagation();var n=e(this).data("contextMenu")||{},a=e(this).data("contextMenuRoot")||{};if(n.$selected){var o=n.$selected;(n=n.$selected.parent().data("contextMenu")||{}).$selected=o}for(var s=n.$menu.children(),i=n.$selected&&n.$selected.prev().length?n.$selected.prev():s.last(),c=i;i.hasClass(a.classNames.disabled)||i.hasClass(a.classNames.notSelectable)||i.is(":hidden");)if((i=i.prev().length?i.prev():s.last()).is(c))return;n.$selected&&f.itemMouseleave.call(n.$selected.get(0),t),f.itemMouseenter.call(i.get(0),t);var l=i.find("input, textarea, select");l.length&&l.focus()},nextItem:function(t){t.stopPropagation();var n=e(this).data("contextMenu")||{},a=e(this).data("contextMenuRoot")||{};if(n.$selected){var o=n.$selected;(n=n.$selected.parent().data("contextMenu")||{}).$selected=o}for(var s=n.$menu.children(),i=n.$selected&&n.$selected.next().length?n.$selected.next():s.first(),c=i;i.hasClass(a.classNames.disabled)||i.hasClass(a.classNames.notSelectable)||i.is(":hidden");)if((i=i.next().length?i.next():s.first()).is(c))return;n.$selected&&f.itemMouseleave.call(n.$selected.get(0),t),f.itemMouseenter.call(i.get(0),t);var l=i.find("input, textarea, select");l.length&&l.focus()},focusInput:function(){var t=e(this).closest(".context-menu-item"),n=t.data(),a=n.contextMenu,o=n.contextMenuRoot;o.$selected=a.$selected=t,o.isInput=a.isInput=!0},blurInput:function(){var t=e(this).closest(".context-menu-item").data(),n=t.contextMenu;t.contextMenuRoot.isInput=n.isInput=!1},menuMouseenter:function(){e(this).data().contextMenuRoot.hovering=!0},menuMouseleave:function(t){var n=e(this).data().contextMenuRoot;n.$layer&&n.$layer.is(t.relatedTarget)&&(n.hovering=!1)},itemMouseenter:function(t){var n=e(this),a=n.data(),o=a.contextMenu,s=a.contextMenuRoot;s.hovering=!0,t&&s.$layer&&s.$layer.is(t.relatedTarget)&&(t.preventDefault(),t.stopImmediatePropagation()),(o.$menu?o:s).$menu.children("."+s.classNames.hover).trigger("contextmenu:blur").children(".hover").trigger("contextmenu:blur"),n.hasClass(s.classNames.disabled)||n.hasClass(s.classNames.notSelectable)?o.$selected=null:n.trigger("contextmenu:focus")},itemMouseleave:function(t){var n=e(this),a=n.data(),o=a.contextMenu,s=a.contextMenuRoot;if(s!==o&&s.$layer&&s.$layer.is(t.relatedTarget))return void 0!==s.$selected&&null!==s.$selected&&s.$selected.trigger("contextmenu:blur"),t.preventDefault(),t.stopImmediatePropagation(),void(s.$selected=o.$selected=o.$node);o&&o.$menu&&o.$menu.hasClass("context-menu-visible")||n.trigger("contextmenu:blur")},itemClick:function(t){var n,a=e(this),o=a.data(),s=o.contextMenu,i=o.contextMenuRoot,c=o.contextMenuKey;if(!(!s.items[c]||a.is("."+i.classNames.disabled+", .context-menu-separator, ."+i.classNames.notSelectable)||a.is(".context-menu-submenu")&&!1===i.selectableSubMenu)){if(t.preventDefault(),t.stopImmediatePropagation(),e.isFunction(s.callbacks[c])&&Object.prototype.hasOwnProperty.call(s.callbacks,c))n=s.callbacks[c];else{if(!e.isFunction(i.callback))return;n=i.callback}!1!==n.call(i.$trigger,c,i,t)?i.$menu.trigger("contextmenu:hide"):i.$menu.parent().length&&h.update.call(i.$trigger,i)}},inputClick:function(e){e.stopImmediatePropagation()},hideMenu:function(t,n){var a=e(this).data("contextMenuRoot");h.hide.call(a.$trigger,a,n&&n.force)},focusItem:function(t){t.stopPropagation();var n=e(this),a=n.data(),o=a.contextMenu,s=a.contextMenuRoot;n.hasClass(s.classNames.disabled)||n.hasClass(s.classNames.notSelectable)||(n.addClass([s.classNames.hover,s.classNames.visible].join(" ")).parent().find(".context-menu-item").not(n).removeClass(s.classNames.visible).filter("."+s.classNames.hover).trigger("contextmenu:blur"),o.$selected=s.$selected=n,o&&o.$node&&o.$node.hasClass("context-menu-submenu")&&o.$node.addClass(s.classNames.hover),o.$node&&s.positionSubmenu.call(o.$node,o.$menu))},blurItem:function(t){t.stopPropagation();var n=e(this),a=n.data(),o=a.contextMenu,s=a.contextMenuRoot;o.autoHide&&n.removeClass(s.classNames.visible),n.removeClass(s.classNames.hover),o.$selected=null}},h={show:function(t,n,a){var s=e(this),i={};if(e("#context-menu-layer").trigger("mousedown"),t.$trigger=s,!1!==t.events.show.call(s,t)){if(h.update.call(s,t),t.position.call(s,t,n,a),t.zIndex){var c=t.zIndex;"function"==typeof t.zIndex&&(c=t.zIndex.call(s,t)),i.zIndex=p(s)+c}h.layer.call(t.$menu,t,i.zIndex),t.$menu.find("ul").css("zIndex",i.zIndex+1),t.$menu.css(i)[t.animation.show](t.animation.duration,function(){s.trigger("contextmenu:visible")}),s.data("contextMenu",t).addClass("context-menu-active"),e(document).off("keydown.contextMenu").on("keydown.contextMenu",f.key),t.autoHide&&e(document).on("mousemove.contextMenuAutoHide",function(e){var n=s.offset();n.right=n.left+s.outerWidth(),n.bottom=n.top+s.outerHeight(),!t.$layer||t.hovering||e.pageX>=n.left&&e.pageX<=n.right&&e.pageY>=n.top&&e.pageY<=n.bottom||setTimeout(function(){t.hovering||null===t.$menu||void 0===t.$menu||t.$menu.trigger("contextmenu:hide")},50)})}else o=null},hide:function(t,n){var a=e(this);if(t||(t=a.data("contextMenu")||{}),n||!t.events||!1!==t.events.hide.call(a,t)){if(a.removeData("contextMenu").removeClass("context-menu-active"),t.$layer){setTimeout(function(e){return function(){e.remove()}}(t.$layer),10);try{delete t.$layer}catch(e){t.$layer=null}}o=null,t.$menu.find("."+t.classNames.hover).trigger("contextmenu:blur"),t.$selected=null,t.$menu.find("."+t.classNames.visible).removeClass(t.classNames.visible),e(document).off(".contextMenuAutoHide").off("keydown.contextMenu"),t.$menu&&t.$menu[t.animation.hide](t.animation.duration,function(){t.build&&(t.$menu.remove(),e.each(t,function(e){switch(e){case"ns":case"selector":case"build":case"trigger":return!0;default:t[e]=void 0;try{delete t[e]}catch(e){}return!0}})),setTimeout(function(){a.trigger("contextmenu:hidden")},10)})}},create:function(n,a){function o(t){var n=e("<span></span>");if(t._accesskey)t._beforeAccesskey&&n.append(document.createTextNode(t._beforeAccesskey)),e("<span></span>").addClass("context-menu-accesskey").text(t._accesskey).appendTo(n),t._afterAccesskey&&n.append(document.createTextNode(t._afterAccesskey));else if(t.isHtmlName){if(void 0!==t.accesskey)throw new Error("accesskeys are not compatible with HTML names and cannot be used together in the same item");n.html(t.name)}else n.text(t.name);return n}void 0===a&&(a=n),n.$menu=e('<ul class="context-menu-list"></ul>').addClass(n.className||"").data({contextMenu:n,contextMenuRoot:a}),e.each(["callbacks","commands","inputs"],function(e,t){n[t]={},a[t]||(a[t]={})}),a.accesskeys||(a.accesskeys={}),e.each(n.items,function(s,i){var c=e('<li class="context-menu-item"></li>').addClass(i.className||""),l=null,r=null;if(c.on("click",e.noop),"string"!=typeof i&&"cm_separator"!==i.type||(i={type:"cm_seperator"}),i.$node=c.data({contextMenu:n,contextMenuRoot:a,contextMenuKey:s}),void 0!==i.accesskey)for(var d,m=t(i.accesskey),p=0;d=m[p];p++)if(!a.accesskeys[d]){a.accesskeys[d]=i;var x=i.name.match(new RegExp("^(.*?)("+d+")(.*)$","i"));x&&(i._beforeAccesskey=x[1],i._accesskey=x[2],i._afterAccesskey=x[3]);break}if(i.type&&u[i.type])u[i.type].call(c,i,n,a),e.each([n,a],function(t,a){a.commands[s]=i,!e.isFunction(i.callback)||void 0!==a.callbacks[s]&&void 0!==n.type||(a.callbacks[s]=i.callback)});else{switch("cm_seperator"===i.type?c.addClass("context-menu-separator "+a.classNames.notSelectable):"html"===i.type?c.addClass("context-menu-html "+a.classNames.notSelectable):"sub"===i.type||(i.type?(l=e("<label></label>").appendTo(c),o(i).appendTo(l),c.addClass("context-menu-input"),n.hasTypes=!0,e.each([n,a],function(e,t){t.commands[s]=i,t.inputs[s]=i})):i.items&&(i.type="sub")),i.type){case"cm_seperator":break;case"text":r=e('<input type="text" value="1" name="" />').attr("name","context-menu-input-"+s).val(i.value||"").appendTo(l);break;case"textarea":r=e('<textarea name=""></textarea>').attr("name","context-menu-input-"+s).val(i.value||"").appendTo(l),i.height&&r.height(i.height);break;case"checkbox":r=e('<input type="checkbox" value="1" name="" />').attr("name","context-menu-input-"+s).val(i.value||"").prop("checked",!!i.selected).prependTo(l);break;case"radio":r=e('<input type="radio" value="1" name="" />').attr("name","context-menu-input-"+i.radio).val(i.value||"").prop("checked",!!i.selected).prependTo(l);break;case"select":r=e('<select name=""></select>').attr("name","context-menu-input-"+s).appendTo(l),i.options&&(e.each(i.options,function(t,n){e("<option></option>").val(t).text(n).appendTo(r)}),r.val(i.selected));break;case"sub":o(i).appendTo(c),i.appendTo=i.$node,c.data("contextMenu",i).addClass("context-menu-submenu"),i.callback=null,"function"==typeof i.items.then?h.processPromises(i,a,i.items):h.create(i,a);break;case"html":e(i.html).appendTo(c);break;default:e.each([n,a],function(t,a){a.commands[s]=i,!e.isFunction(i.callback)||void 0!==a.callbacks[s]&&void 0!==n.type||(a.callbacks[s]=i.callback)}),o(i).appendTo(c)}i.type&&"sub"!==i.type&&"html"!==i.type&&"cm_seperator"!==i.type&&(r.on("focus",f.focusInput).on("blur",f.blurInput),i.events&&r.on(i.events,n)),i.icon&&(e.isFunction(i.icon)?i._icon=i.icon.call(this,this,c,s,i):"string"==typeof i.icon&&"fa-"===i.icon.substring(0,3)?i._icon=a.classNames.icon+" "+a.classNames.icon+"--fa fa "+i.icon:i._icon=a.classNames.icon+" "+a.classNames.icon+"-"+i.icon,c.addClass(i._icon))}i.$input=r,i.$label=l,c.appendTo(n.$menu),!n.hasTypes&&e.support.eventSelectstart&&c.on("selectstart.disableTextSelect",f.abortevent)}),n.$node||n.$menu.css("display","none").addClass("context-menu-root"),n.$menu.appendTo(n.appendTo||document.body)},resize:function(t,n){var a;t.css({position:"absolute",display:"block"}),t.data("width",(a=t.get(0)).getBoundingClientRect?Math.ceil(a.getBoundingClientRect().width):t.outerWidth()+1),t.css({position:"static",minWidth:"0px",maxWidth:"100000px"}),t.find("> li > ul").each(function(){h.resize(e(this),!0)}),n||t.find("ul").addBack().css({position:"",display:"",minWidth:"",maxWidth:""}).outerWidth(function(){return e(this).data("width")})},update:function(t,n){var a=this;void 0===n&&(n=t,h.resize(t.$menu)),t.$menu.children().each(function(){var o,s=e(this),i=s.data("contextMenuKey"),c=t.items[i],l=e.isFunction(c.disabled)&&c.disabled.call(a,i,n)||!0===c.disabled;if(o=e.isFunction(c.visible)?c.visible.call(a,i,n):void 0===c.visible||!0===c.visible,s[o?"show":"hide"](),s[l?"addClass":"removeClass"](n.classNames.disabled),e.isFunction(c.icon)&&(s.removeClass(c._icon),c._icon=c.icon.call(this,a,s,i,c),s.addClass(c._icon)),c.type)switch(s.find("input, select, textarea").prop("disabled",l),c.type){case"text":case"textarea":c.$input.val(c.value||"");break;case"checkbox":case"radio":c.$input.val(c.value||"").prop("checked",!!c.selected);break;case"select":c.$input.val((0===c.selected?"0":c.selected)||"")}c.$menu&&h.update.call(a,c,n)})},layer:function(t,n){var a=t.$layer=e('<div id="context-menu-layer"></div>').css({height:i.height(),width:i.width(),display:"block",position:"fixed","z-index":n,top:0,left:0,opacity:0,filter:"alpha(opacity=0)","background-color":"#000"}).data("contextMenuRoot",t).insertBefore(this).on("contextmenu",f.abortevent).on("mousedown",f.layerClick);return void 0===document.body.style.maxWidth&&a.css({position:"absolute",height:e(document).height()}),a},processPromises:function(e,t,n){function a(e,t,n){void 0===n?(n={error:{name:"No items and no error item",icon:"context-menu-icon context-menu-icon-quit"}},UW.console&&(console.error||console.log).call(console,'When you reject a promise, provide an "items" object, equal to normal sub-menu items')):"string"==typeof n&&(n={error:{name:n}}),o(e,t,n)}function o(e,t,n){void 0!==t.$menu&&t.$menu.is(":visible")&&(e.$node.removeClass(t.classNames.iconLoadingClass),e.items=n,h.create(e,t,!0),h.update(e,t),t.positionSubmenu.call(e.$node,e.$menu))}e.$node.addClass(t.classNames.iconLoadingClass),n.then(function(e,t,n){void 0===n&&a(void 0),o(e,t,n)}.bind(this,e,t),a.bind(this,e,t))}};e.fn.contextMenu=function(t){var n=this,a=t;if(this.length>0)if(void 0===t)this.first().trigger("contextmenu");else if(void 0!==t.x&&void 0!==t.y)this.first().trigger(e.Event("contextmenu",{pageX:t.x,pageY:t.y,mouseButton:t.button}));else if("hide"===t){var o=this.first().data("contextMenu")?this.first().data("contextMenu").$menu:null;o&&o.trigger("contextmenu:hide")}else"destroy"===t?e.contextMenu("destroy",{context:this}):e.isPlainObject(t)?(t.context=this,e.contextMenu("create",t)):t?this.removeClass("context-menu-disabled"):t||this.addClass("context-menu-disabled");else e.each(r,function(){this.selector===n.selector&&(a.data=this,e.extend(a.data,{trigger:"demand"}))}),f.contextmenu.call(a.target,a);return this},e.contextMenu=function(t,n){"string"!=typeof t&&(n=t,t="create"),"string"==typeof n?n={selector:n}:void 0===n&&(n={});var a=e.extend(!0,{},d,n||{}),o=e(document),i=o,u=!1;switch(a.context&&a.context.length?(i=e(a.context).first(),a.context=i.get(0),u=!e(a.context).is(document)):a.context=document,t){case"create":if(!a.selector)throw new Error("No selector specified");if(a.selector.match(/.context-menu-(list|item|input)($|\s)/))throw new Error('Cannot bind to selector "'+a.selector+'" as it contains a reserved className');if(!a.build&&(!a.items||e.isEmptyObject(a.items)))throw new Error("No Items specified");if(c++,a.ns=".contextMenu"+c,u||(l[a.selector]=a.ns),r[a.ns]=a,a.trigger||(a.trigger="right"),!s){var m="click"===a.itemClickEvent?"click.contextMenu":"mouseup.contextMenu",p={"contextmenu:focus.contextMenu":f.focusItem,"contextmenu:blur.contextMenu":f.blurItem,"contextmenu.contextMenu":f.abortevent,"mouseenter.contextMenu":f.itemMouseenter,"mouseleave.contextMenu":f.itemMouseleave};p[m]=f.itemClick,o.on({"contextmenu:hide.contextMenu":f.hideMenu,"prevcommand.contextMenu":f.prevItem,"nextcommand.contextMenu":f.nextItem,"contextmenu.contextMenu":f.abortevent,"mouseenter.contextMenu":f.menuMouseenter,"mouseleave.contextMenu":f.menuMouseleave},".context-menu-list").on("mouseup.contextMenu",".context-menu-input",f.inputClick).on(p,".context-menu-item"),s=!0}switch(i.on("contextmenu"+a.ns,a.selector,a,f.contextmenu),u&&i.on("remove"+a.ns,function(){e(this).contextMenu("destroy")}),a.trigger){case"hover":i.on("mouseenter"+a.ns,a.selector,a,f.mouseenter).on("mouseleave"+a.ns,a.selector,a,f.mouseleave);break;case"left":i.on("click"+a.ns,a.selector,a,f.click);break;case"touchstart":i.on("touchstart"+a.ns,a.selector,a,f.click)}a.build||h.create(a);break;case"destroy":var x;if(u){var v=a.context;e.each(r,function(t,n){if(!n)return!0;if(!e(v).is(n.selector))return!0;(x=e(".context-menu-list").filter(":visible")).length&&x.data().contextMenuRoot.$trigger.is(e(n.context).find(n.selector))&&x.trigger("contextmenu:hide",{force:!0});try{r[n.ns].$menu&&r[n.ns].$menu.remove(),delete r[n.ns]}catch(e){r[n.ns]=null}return e(n.context).off(n.ns),!0})}else if(a.selector){if(l[a.selector]){(x=e(".context-menu-list").filter(":visible")).length&&x.data().contextMenuRoot.$trigger.is(a.selector)&&x.trigger("contextmenu:hide",{force:!0});try{r[l[a.selector]].$menu&&r[l[a.selector]].$menu.remove(),delete r[l[a.selector]]}catch(e){r[l[a.selector]]=null}o.off(l[a.selector])}}else o.off(".contextMenu .contextMenuAutoHide"),e.each(r,function(t,n){e(n.context).off(n.ns)}),l={},r={},c=0,s=!1,e("#context-menu-layer, .context-menu-list").remove();break;case"html5":(!e.support.htmlCommand&&!e.support.htmlMenuitem||"boolean"==typeof n&&n)&&e('menu[type="context"]').each(function(){this.id&&e.contextMenu({selector:"[contextmenu="+this.id+"]",items:e.contextMenu.fromMenu(this)})}).css("display","none");break;default:throw new Error('Unknown operation "'+t+'"')}return this},e.contextMenu.setInputValues=function(t,n){void 0===n&&(n={}),e.each(t.inputs,function(e,t){switch(t.type){case"text":case"textarea":t.value=n[e]||"";break;case"checkbox":t.selected=!!n[e];break;case"radio":t.selected=(n[t.radio]||"")===t.value;break;case"select":t.selected=n[e]||""}})},e.contextMenu.getInputValues=function(t,n){return void 0===n&&(n={}),e.each(t.inputs,function(e,t){switch(t.type){case"text":case"textarea":case"select":n[e]=t.$input.val();break;case"checkbox":n[e]=t.$input.prop("checked");break;case"radio":t.$input.prop("checked")&&(n[t.radio]=t.value)}}),n},e.contextMenu.fromMenu=function(t){var n={};return a(n,e(t).children()),n},e.contextMenu.defaults=d,e.contextMenu.types=u,e.contextMenu.handle=f,e.contextMenu.op=h,e.contextMenu.menus=r});

    GM_addStyle('@-webkit-keyframes cm-spin{0%{-webkit-transform:translateY(-50%) rotate(0);transform:translateY(-50%) rotate(0)}100%{-webkit-transform:translateY(-50%) rotate(359deg);transform:translateY(-50%) rotate(359deg)}}@-o-keyframes cm-spin{0%{-webkit-transform:translateY(-50%) rotate(0);-o-transform:translateY(-50%) rotate(0);transform:translateY(-50%) rotate(0)}100%{-webkit-transform:translateY(-50%) rotate(359deg);-o-transform:translateY(-50%) rotate(359deg);transform:translateY(-50%) rotate(359deg)}}@keyframes cm-spin{0%{-webkit-transform:translateY(-50%) rotate(0);-o-transform:translateY(-50%) rotate(0);transform:translateY(-50%) rotate(0)}100%{-webkit-transform:translateY(-50%) rotate(359deg);-o-transform:translateY(-50%) rotate(359deg);transform:translateY(-50%) rotate(359deg)}}@font-face{font-family:context-menu-icons;font-style:normal;font-weight:400;src:url(font/context-menu-icons.eot?2u731);src:url(font/context-menu-icons.eot?2u731#iefix) format("embedded-opentype"),url(font/context-menu-icons.woff2?2u731) format("woff2"),url(font/context-menu-icons.woff?2u731) format("woff"),url(font/context-menu-icons.ttf?2u731) format("truetype")}.context-menu-icon-add:before{content:"\EA01"}.context-menu-icon-copy:before{content:"\EA02"}.context-menu-icon-cut:before{content:"\EA03"}.context-menu-icon-delete:before{content:"\EA04"}.context-menu-icon-edit:before{content:"\EA05"}.context-menu-icon-loading:before{content:"\EA06"}.context-menu-icon-paste:before{content:"\EA07"}.context-menu-icon-quit:before{content:"\EA08"}.context-menu-icon::before{position:absolute;top:50%;left:0;width:2em;font-family:context-menu-icons;font-size:1em;font-style:normal;font-weight:400;line-height:1;color:#2980b9;text-align:center;-webkit-transform:translateY(-50%);-ms-transform:translateY(-50%);-o-transform:translateY(-50%);transform:translateY(-50%);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.context-menu-icon.context-menu-hover:before{color:#fff}.context-menu-icon.context-menu-disabled::before{color:#bbb}.context-menu-icon.context-menu-icon-loading:before{-webkit-animation:cm-spin 2s infinite;-o-animation:cm-spin 2s infinite;animation:cm-spin 2s infinite}.context-menu-icon.context-menu-icon--fa{display:list-item;font-family:inherit}.context-menu-icon.context-menu-icon--fa::before{position:absolute;top:50%;left:0;width:2em;font-family:FontAwesome;font-size:1em;font-style:normal;font-weight:400;line-height:1;color:#2980b9;text-align:center;-webkit-transform:translateY(-50%);-ms-transform:translateY(-50%);-o-transform:translateY(-50%);transform:translateY(-50%);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.context-menu-icon.context-menu-icon--fa.context-menu-hover:before{color:#fff}.context-menu-icon.context-menu-icon--fa.context-menu-disabled::before{color:#bbb}.context-menu-list{position:absolute;display:inline-block;min-width:13em;max-width:26em;padding:.25em 0;margin:.3em;font-family:inherit;font-size:inherit;list-style-type:none;background:#fff;border:1px solid #bebebe;border-radius:.2em;-webkit-box-shadow:0 2px 5px rgba(0,0,0,.5);box-shadow:0 2px 5px rgba(0,0,0,.5)}.context-menu-item{position:relative;padding:.2em 2em;color:#2f2f2f;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;background-color:#fff}.context-menu-separator{padding:0;margin:.35em 0;border-bottom:1px solid #e6e6e6}.context-menu-item>label>input,.context-menu-item>label>textarea{-webkit-user-select:text;-moz-user-select:text;-ms-user-select:text;user-select:text}.context-menu-item.context-menu-hover{color:#fff;cursor:pointer;background-color:#2980b9}.context-menu-item.context-menu-disabled{color:#bbb;cursor:default;background-color:#fff}.context-menu-input.context-menu-hover{color:#2f2f2f;cursor:default}.context-menu-submenu:after{position:absolute;top:50%;right:.5em;z-index:1;width:0;height:0;content:"";border-color:transparent transparent transparent #2f2f2f;border-style:solid;border-width:.25em 0 .25em .25em;-webkit-transform:translateY(-50%);-ms-transform:translateY(-50%);-o-transform:translateY(-50%);transform:translateY(-50%)}.context-menu-item.context-menu-input{padding:.3em .6em}.context-menu-input>label>*{vertical-align:top}.context-menu-input>label>input[type=checkbox],.context-menu-input>label>input[type=radio]{position:relative;top:.12em;margin-right:.4em}.context-menu-input>label{margin:0}.context-menu-input>label,.context-menu-input>label>input[type=text],.context-menu-input>label>select,.context-menu-input>label>textarea{display:block;width:100%;-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box}.context-menu-input>label>textarea{height:7em}.context-menu-item>.context-menu-list{top:.3em;right:-.3em;display:none}.context-menu-item.context-menu-visible>.context-menu-list{display:block}.context-menu-accesskey{text-decoration:underline}');

    /*! jQuery UI + Position - v1.12.1 - 2016-09-16 */
    (function(t){"function"==typeof define&&define.amd?define(["jquery"],t):t(jQuery)})(function(t){t.ui=t.ui||{},t.ui.version="1.12.1",function(){function e(t,e,i){return[parseFloat(t[0])*(u.test(t[0])?e/100:1),parseFloat(t[1])*(u.test(t[1])?i/100:1)]}function i(e,i){return parseInt(t.css(e,i),10)||0}function s(e){var i=e[0];return 9===i.nodeType?{width:e.width(),height:e.height(),offset:{top:0,left:0}}:t.isWindow(i)?{width:e.width(),height:e.height(),offset:{top:e.scrollTop(),left:e.scrollLeft()}}:i.preventDefault?{width:0,height:0,offset:{top:i.pageY,left:i.pageX}}:{width:e.outerWidth(),height:e.outerHeight(),offset:e.offset()}}var n,o=Math.max,a=Math.abs,r=/left|center|right/,l=/top|center|bottom/,h=/[\+\-]\d+(\.[\d]+)?%?/,c=/^\w+/,u=/%$/,d=t.fn.position;t.position={scrollbarWidth:function(){if(void 0!==n)return n;var e,i,s=t("<div style='display:block;position:absolute;width:50px;height:50px;overflow:hidden;'><div style='height:100px;width:auto;'></div></div>"),o=s.children()[0];return t("body").append(s),e=o.offsetWidth,s.css("overflow","scroll"),i=o.offsetWidth,e===i&&(i=s[0].clientWidth),s.remove(),n=e-i},getScrollInfo:function(e){var i=e.isWindow||e.isDocument?"":e.element.css("overflow-x"),s=e.isWindow||e.isDocument?"":e.element.css("overflow-y"),n="scroll"===i||"auto"===i&&e.width<e.element[0].scrollWidth,o="scroll"===s||"auto"===s&&e.height<e.element[0].scrollHeight;return{width:o?t.position.scrollbarWidth():0,height:n?t.position.scrollbarWidth():0}},getWithinInfo:function(e){var i=t(e||UW),s=t.isWindow(i[0]),n=!!i[0]&&9===i[0].nodeType,o=!s&&!n;return{element:i,isWindow:s,isDocument:n,offset:o?t(e).offset():{left:0,top:0},scrollLeft:i.scrollLeft(),scrollTop:i.scrollTop(),width:i.outerWidth(),height:i.outerHeight()}}},t.fn.position=function(n){if(!n||!n.of)return d.apply(this,arguments);n=t.extend({},n);var u,p,f,g,m,_,v=t(n.of),b=t.position.getWithinInfo(n.within),y=t.position.getScrollInfo(b),w=(n.collision||"flip").split(" "),k={};return _=s(v),v[0].preventDefault&&(n.at="left top"),p=_.width,f=_.height,g=_.offset,m=t.extend({},g),t.each(["my","at"],function(){var t,e,i=(n[this]||"").split(" ");1===i.length&&(i=r.test(i[0])?i.concat(["center"]):l.test(i[0])?["center"].concat(i):["center","center"]),i[0]=r.test(i[0])?i[0]:"center",i[1]=l.test(i[1])?i[1]:"center",t=h.exec(i[0]),e=h.exec(i[1]),k[this]=[t?t[0]:0,e?e[0]:0],n[this]=[c.exec(i[0])[0],c.exec(i[1])[0]]}),1===w.length&&(w[1]=w[0]),"right"===n.at[0]?m.left+=p:"center"===n.at[0]&&(m.left+=p/2),"bottom"===n.at[1]?m.top+=f:"center"===n.at[1]&&(m.top+=f/2),u=e(k.at,p,f),m.left+=u[0],m.top+=u[1],this.each(function(){var s,r,l=t(this),h=l.outerWidth(),c=l.outerHeight(),d=i(this,"marginLeft"),_=i(this,"marginTop"),x=h+d+i(this,"marginRight")+y.width,C=c+_+i(this,"marginBottom")+y.height,D=t.extend({},m),T=e(k.my,l.outerWidth(),l.outerHeight());"right"===n.my[0]?D.left-=h:"center"===n.my[0]&&(D.left-=h/2),"bottom"===n.my[1]?D.top-=c:"center"===n.my[1]&&(D.top-=c/2),D.left+=T[0],D.top+=T[1],s={marginLeft:d,marginTop:_},t.each(["left","top"],function(e,i){t.ui.position[w[e]]&&t.ui.position[w[e]][i](D,{targetWidth:p,targetHeight:f,elemWidth:h,elemHeight:c,collisionPosition:s,collisionWidth:x,collisionHeight:C,offset:[u[0]+T[0],u[1]+T[1]],my:n.my,at:n.at,within:b,elem:l})}),n.using&&(r=function(t){var e=g.left-D.left,i=e+p-h,s=g.top-D.top,r=s+f-c,u={target:{element:v,left:g.left,top:g.top,width:p,height:f},element:{element:l,left:D.left,top:D.top,width:h,height:c},horizontal:0>i?"left":e>0?"right":"center",vertical:0>r?"top":s>0?"bottom":"middle"};h>p&&p>a(e+i)&&(u.horizontal="center"),c>f&&f>a(s+r)&&(u.vertical="middle"),u.important=o(a(e),a(i))>o(a(s),a(r))?"horizontal":"vertical",n.using.call(this,t,u)}),l.offset(t.extend(D,{using:r}))})},t.ui.position={fit:{left:function(t,e){var i,s=e.within,n=s.isWindow?s.scrollLeft:s.offset.left,a=s.width,r=t.left-e.collisionPosition.marginLeft,l=n-r,h=r+e.collisionWidth-a-n;e.collisionWidth>a?l>0&&0>=h?(i=t.left+l+e.collisionWidth-a-n,t.left+=l-i):t.left=h>0&&0>=l?n:l>h?n+a-e.collisionWidth:n:l>0?t.left+=l:h>0?t.left-=h:t.left=o(t.left-r,t.left)},top:function(t,e){var i,s=e.within,n=s.isWindow?s.scrollTop:s.offset.top,a=e.within.height,r=t.top-e.collisionPosition.marginTop,l=n-r,h=r+e.collisionHeight-a-n;e.collisionHeight>a?l>0&&0>=h?(i=t.top+l+e.collisionHeight-a-n,t.top+=l-i):t.top=h>0&&0>=l?n:l>h?n+a-e.collisionHeight:n:l>0?t.top+=l:h>0?t.top-=h:t.top=o(t.top-r,t.top)}},flip:{left:function(t,e){var i,s,n=e.within,o=n.offset.left+n.scrollLeft,r=n.width,l=n.isWindow?n.scrollLeft:n.offset.left,h=t.left-e.collisionPosition.marginLeft,c=h-l,u=h+e.collisionWidth-r-l,d="left"===e.my[0]?-e.elemWidth:"right"===e.my[0]?e.elemWidth:0,p="left"===e.at[0]?e.targetWidth:"right"===e.at[0]?-e.targetWidth:0,f=-2*e.offset[0];0>c?(i=t.left+d+p+f+e.collisionWidth-r-o,(0>i||a(c)>i)&&(t.left+=d+p+f)):u>0&&(s=t.left-e.collisionPosition.marginLeft+d+p+f-l,(s>0||u>a(s))&&(t.left+=d+p+f))},top:function(t,e){var i,s,n=e.within,o=n.offset.top+n.scrollTop,r=n.height,l=n.isWindow?n.scrollTop:n.offset.top,h=t.top-e.collisionPosition.marginTop,c=h-l,u=h+e.collisionHeight-r-l,d="top"===e.my[1],p=d?-e.elemHeight:"bottom"===e.my[1]?e.elemHeight:0,f="top"===e.at[1]?e.targetHeight:"bottom"===e.at[1]?-e.targetHeight:0,g=-2*e.offset[1];0>c?(s=t.top+p+f+g+e.collisionHeight-r-o,(0>s||a(c)>s)&&(t.top+=p+f+g)):u>0&&(i=t.top-e.collisionPosition.marginTop+p+f+g-l,(i>0||u>a(i))&&(t.top+=p+f+g))}},flipfit:{left:function(){t.ui.position.flip.left.apply(this,arguments),t.ui.position.fit.left.apply(this,arguments)},top:function(){t.ui.position.flip.top.apply(this,arguments),t.ui.position.fit.top.apply(this,arguments)}}}}(),t.ui.position});
});

// 2. CSSOM - Very likely it won't already be on the page
if (!UW.cssobj) {
    /* cssobj v1.2.1 */
    UW.cssobj = function(){"use strict";function e(e){return!isNaN(parseFloat(e))&&isFinite(e)}function t(e,t){return{}.hasOwnProperty.call(e,t)}function n(e,n){e=e||{};for(var r in n)!t(n,r)||r in e||(e[r]=n[r]);return e}function r(e){return e.replace(/[A-Z]/g,function(e){return"-"+e.toLowerCase()})}function o(e){return e.charAt(0).toUpperCase()+e.substr(1)}function a(e,n,r){e[n]=e[n]||{};for(var o=arguments,a=2;a<o.length;a++){r=o[a];for(var i in r)t(r,i)&&(e[n][i]=r[i])}return e[n]}function i(e,t,n,r,o){e[t]=t in e?[].concat(e[t]):[],o&&e[t].indexOf(n)>-1||(r?e[t].unshift(n):e[t].push(n))}function u(e,t,n,r,o){for(var a,u,c=e,f=[];c;){if(t(c)){if(r)for(a=0;a<f.length;a++)i(c,r,f[a],!1,!0);f[0]&&o&&(f[0][o]=c),f.unshift(c)}c=c.parent}for(a=0;a<f.length;a++)u=f[a],f[a]=n?u[n]:u;return f}function c(e,t){if(e.indexOf(t)<0)return[e];for(var n,r=0,o=0,a="",i=0,u=[];n=e.charAt(r);r++)a?n==a&&(a=""):('"'!=n&&"'"!=n||(a=n),"("!=n&&"["!=n||o++,")"!=n&&"]"!=n||o--,o||n!=t||(u.push(e.substring(i,r)),i=r+1));return u.concat(e.substring(i))}function f(e){return"string"==typeof e&&e||"number"==typeof e&&isFinite(e)}function l(e){return O.call(e)==_||O.call(e)==G}function s(e){return"function"==typeof e}function d(e,n,r,o){if(o&&(n.nodes=[],n.ref={},r&&(n.diff={})),r=r||{},r.obj=e,O.call(e)==G){var u=[];r.at=S.exec(r.key);for(var f=0;f<e.length;f++){var v=r[f],m=d(e[f],n,r[f]||{parent:r,src:e,parentNode:u,index:f});n.diff&&v!=m&&i(n.diff,m?"added":"removed",m||v),u.push(m)}return u}var g=r.prevVal=r.lastVal;if(N in e){var y=s(e[N])?e[N](!r.disabled,r,n):e[N];if(!y)return;r.test=y}var E=r.children=r.children||{};r.lastRaw=r.rawVal||{},r.lastVal={},r.rawVal={},r.prop={},r.diff={},e[k]&&(n.ref[e[k]]=r);var R=0|e[C],x=[],b=function(e,t,r){var o=t in E,u=a(E,t,r);u.selPart=u.selPart||c(t,",");var f=d(e,n,u);f&&(E[t]=f),g&&(o?!f&&i(n.diff,"removed",E[t]):f&&i(n.diff,"added",f)),f||delete r.parent.children[t]};"selText"in r||p(r,n);for(var T in e)if(t(e,T))if(!l(e[T])||O.call(e[T])==G&&!l(e[T][0])){if("@"==T[0]){b([].concat(e[T]).reduce(function(e,t){return e[t]=";",e},{}),T,{parent:r,src:e,key:T,inline:!0});continue}var w=function(t){t!=N&&h(r,e,t,n)};R?x.push([w,T]):w(T)}else b(e[T],T,{parent:r,src:e,key:T});if(g){for(T in E)T in e||(i(n.diff,"removed",E[T]),delete E[T]);var P=function(){var e=V(r.lastVal),t=V(g).filter(function(t){return e.indexOf(t)<0});t.length&&(r.diff.removed=t),V(r.diff).length&&i(n.diff,"changed",r)};R?x.push([P,null]):P()}return R&&i(n,"_order",{order:R,func:x}),n.nodes.push(r),r}function p(e,t){var n=t.config,r=u(e,function(e){return e.key}).pop();if(e.parentRule=u(e.parent,function(e){return e.type==$}).pop()||null,r){var o,a=r.key,i=a.match(F);i?(e.type=$,e.at=i.pop(),(o="media"==e.at)&&(e.selPart=c(a.replace(F,""),",")),e.groupText=o?"@"+e.at+v(u(e,function(e){return e.type==$},"selPart","selChild","selParent"),""," and"):a,e.selText=u(e,function(e){return e.selText&&!e.at},"selText").pop()||""):S.test(a)?(e.type="at",e.selText=a):e.selText=""+v(u(r,function(e){return e.selPart&&!e.at},"selPart","selChild","selParent"),""," ",!0),e.selText=m(n,"selector",e.selText,e,t),e.selText&&(e.selTextPart=c(e.selText,",")),e!==r&&(e.ruleNode=r)}}function h(n,r,o,a,u){var c=n.prevVal,d=n.lastVal,p=e(o)?u:o,v=n.lastRaw[p],g=c&&c[p],y={node:n,result:a};v&&(y.raw=v[0]),[].concat(r[o]).forEach(function(e){y.cooked=g,y.raw=v=s(e)?e(y):e;var r=m(a.config,"value",v,p,n,a,u);if(l(r))for(var o in r)t(r,o)&&h(n,r,o,a,p);else i(n.rawVal,p,v,!0),f(r)&&(i(n.prop,p,r,!0),g=d[p]=r)}),c&&(p in c?c[p]!=d[p]&&i(n.diff,"changed",p):i(n.diff,"added",p))}function v(e,t,n,r){return e.length?e[0].reduce(function(o,a){var i,u=t?t+n:t;return r?u=(i=c(a,"&")).length>1?i.join(t):u+a:u+=a,o.concat(v(e.slice(1),u,n,r))},[]):t}function m(e,t){var n=[].slice.call(arguments,2),r=e.plugins;return[].concat(r).reduce(function(e,r){return r[t]?r[t].apply(null,[e].concat(n)):e},n.shift())}function g(e){e._order&&(e._order.sort(function(e,t){return e.order-t.order}).forEach(function(e){e.func.forEach(function(e){e[0](e[1])})}),delete e._order)}function y(e){return e=n(e,{plugins:[],intros:[]}),function(t,n){var r=function(t,n){return arguments.length>1&&(o.state=n||{}),t&&(o.obj=s(t)?t():t),o.root=d(a({},"",o.intro,o.obj),o,o.root,!0),g(o),o=m(e,"post",o),s(e.onUpdate)&&e.onUpdate(o),o},o={intro:{},update:r,config:e};return[].concat(e.intros).forEach(function(e){a(o,"intro",s(e)?e(o):e)}),r(t,n||e.state),o}}function E(e,t,n){var r=e.getElementById(t),o=e.getElementsByTagName("head")[0];if(r){if(n.append)return r;r.parentNode&&r.parentNode.removeChild(r)}if(r=e.createElement("style"),o.appendChild(r),r.setAttribute("id",t),n.attrs)for(var a in n.attrs)r.setAttribute(a,n.attrs[a]);return r}function R(e){var t=e.prop;return Object.keys(t).map(function(n){if("$"==n[0])return"";for(var r,o="",a=t[n].length;a--;)r=t[n][a],o+=e.inline?n:b(n,!0)+":"+r+";";return o})}function x(e){if(!(e in z||"-"==e[0]))for(var t,n=o(e),r=M.length;r--;)if((t=M[r]+n)in z)return t}function b(e,t){if("$"==e[0])return"";var n=B[e]||(B[e]=x(e)||e);return t?r(U.test(n)?o(n):"float"==e&&e||n):n}function T(e,t,n){var r,o=/^(.*)!(important)\s*$/i.exec(n),a=b(t),i=b(t,!0);o?(r=o[1],o=o[2],e.setProperty?e.setProperty(i,r,o):(e[i.toUpperCase()]=n,e.cssText=e.cssText)):e[a]=n}function w(e){function t(e){var t=v.indexOf(e);t>-1&&(e.mediaEnabled=!1,g(e),v.splice(t,1)),[e.omGroup].concat(e.omRule).forEach(p)}(e=e||{}).vendors&&(M=e.vendors);var n=e.id||"cssobj"+A(),r=e.frame,o=r?r.contentDocument||r.contentWindow.document:document,a=E(o,n,e),i=a.sheet||a.styleSheet,u=/page/i,c=function(e){return!!e&&(u.test(e.at)||e.parentRule&&u.test(e.parentRule.at))},f=function(e){var t="omGroup"in e?e:e.parentRule;return t&&t.omGroup||i},l=function(e){return!e.parentRule||null!==e.parentRule.omGroup},s=function(e,t,n){return e.deleteRule?e.deleteRule(t.keyText||n):e.removeRule(n)},d=function(e){for(var t=e.cssRules||e.rules,n=t.length;n--;)s(e,t[n],n)},p=function(e){if(e){var t=e.parentRule||i,n=t.cssRules||t.rules;[].some.call(n,function(n,r){if(n===e)return s(t,e,r),!0})}},h=function(e,t,n){if(n){var r=f(e),o=e.parentRule;if(l(e))return e.omRule=L(r,t,n,e);if(o){if(o.mediaEnabled)return[].concat(e.omRule).forEach(p),e.omRule=L(r,t,n,e);e.omRule&&(e.omRule.forEach(p),delete e.omRule)}}},v=[],m=function(){v.forEach(function(e){e.mediaEnabled=e.mediaTest(o),g(e)})};window.attachEvent?window.attachEvent("onresize",m):window.addEventListener&&window.addEventListener("resize",m,!0);var g=function(t,n){if(t){if(t.constructor===Array)return t.map(function(e){g(e,n)});if((!t.key||"$"!=t.key[0])&&t.prop){if("media"==t.at&&t.selParent&&t.selParent.postArr)return t.selParent.postArr.push(t);t.postArr=[];var r=t.children,a="group"==t.type;if(c(t)&&(n=n||[]),a&&!c(t)){var u=t.obj.$groupTest,f="media"==t.at&&e.media;if(u||f){t.omGroup=null;var s=u||f&&function(n){var r=e.media;return!r||t.selPart.some(function(e){return new RegExp(r,"i").test(e.trim())})}||function(){return!0};try{var d=s(o);t.mediaTest=s,t.mediaEnabled=d,v.push(t)}catch(e){}}else[""].concat(M).some(function(e){return t.omGroup=L(i,"@"+(e?"-"+e.toLowerCase()+"-":e)+t.groupText.slice(1),[],t).pop()||null})}var p=t.selTextPart,m=R(t);m.join("")&&(c(t)||h(t,p,m),n&&n.push(p?p+" {"+m.join("")+"}":m));for(var y in r)""===y?t.postArr.push(r[y]):g(r[y],n);a&&c(t)&&l(t)&&(h(t,t.groupText,n),n=null);var E=t.postArr;delete t.postArr,E.map(function(e){g(e,n)})}}},y=e.media;return{post:function(n){var r=y!=e.media;if(y=e.media,m(),n.cssdom=a,!n.diff||r)r&&(v=[],d(i)),g(n.root);else{var o=n.diff;o.added&&o.added.forEach(function(e){g(e)}),o.removed&&o.removed.forEach(function(e){e.selChild&&e.selChild.forEach(t),t(e)}),o.changed&&o.changed.forEach(function(e){var t=e.omRule,n=e.diff;t||(t=h(e,e.selTextPart,R(e))),[].concat(n.added,n.changed).forEach(function(n){n&&t&&t.forEach(function(t){try{T(t.style,n,e.prop[n][0])}catch(e){}})}),n.removed&&n.removed.forEach(function(e){var n=b(e);n&&t&&t.forEach(function(e){try{e.style.removeProperty?e.style.removeProperty(n):e.style.removeAttribute(n)}catch(e){}})})})}return n}}}function P(e){var t=(e=e||{}).space="string"!=typeof e.space?"function"==typeof e.random?e.random():A():e.space,n=e.localNames=e.localNames||{},r=function(e){return"!"==e[0]?e.substr(1):e in n?n[e]:e+t},o=function(e){for(var t,n,o=c(e,"."),a=o[0],i=1,u=o.length;i<u;i++)(t=o[i])?a+="."+((n=t.search(I))<0?r(t):r(t.substr(0,n))+t.substr(n)):a+=".";return a},a=function(e){return o(e.replace(/\s+\.?/g,".").replace(/^([^:\s.])/i,".$1")).replace(/\./g," ")};return{selector:function(e,r,i){return r.at?e:(i.mapSel||(i.space=t,i.localNames=n,i.mapSel=o,i.mapClass=a),o(e))}}}function j(e,t,n){var r=(t=t||{}).local;return t.local=r?r&&"object"==typeof r?r:{}:{space:""},t.plugins=[].concat(t.plugins||[],P(t.local),w(t.cssom)),y(t)(e,n)}var A=function(){var e=0;return function(t){return e++,"_"+(t||"")+Math.floor(Math.random()*Math.pow(2,32)).toString(36)+e+"_"}}(),k="$id",C="$order",N="$test",$="group",V=Object.keys,O={}.toString,G=O.call([]),_=O.call({}),F=/^@(media|document|supports|page|[\w-]*keyframes)/i,S=/^\s*@/i,L=function(e,t,n,r){var o=/@import/i.test(r.selText),a=e.cssRules||e.rules,i=0,u=[];return(r.inline?n.map(function(e){return[r.selText," ",e]}):[[t,"{",n.join(""),"}"]]).forEach(function(n){if(e.cssRules)try{i=o?0:a.length,e.appendRule?e.appendRule(n.join("")):e.insertRule(n.join(""),i),u.push(a[i])}catch(e){}else e.addRule&&[].concat(t).forEach(function(t){try{o?(i=e.addImport(n[2]),u.push(e.imports[i])):/^\s*@/.test(t)||(e.addRule(t,n[2],a.length),u.push(a[a.length-1]))}catch(e){}})}),u},M=["Webkit","Moz","ms","O"],U=new RegExp("^(?:"+M.join("|")+")[A-Z]"),z=document.createElement("div").style,B={float:function(e){for(var t=e.length;t--;)if(e[t]in z)return e[t]}(["styleFloat","cssFloat","float"])},I=/[ \~\\@$%^&\*\(\)\+\=,/';\:"?><[\]\\{}|`]/;return j.version="1.2.1",j}();
}

// 3. Boomerang plugins
function initEmbeddedBoomerang() {
    //
    // Boomerang Config
    //
    UW.BOOMR_config = { Continuity: { waitAfterOnload: UW.CONTINUITY_WAIT_AFTER_ONLOAD }};

    //
    // Check if Boomerang is already on the page
    //
    if (UW.BOOMR && UW.BOOMR.version) {
        return;
    }

    //
    // Check if the Boomerang Async loader snippet is on the page
    //
    var foundBoomerang = false;

    try {
        var frms = document.getElementsByTagName("iframe");
        for (var i = 0; i < frms.length; i++) {
            try {
                if (frms[i].contentWindow.document.getElementById("boomr-if-as")) {
                    foundBoomerang = true;
                }
            } catch (e) {
                // NOP
            }
        }
    }
    catch (e) {
        // NOP
    }

    if (!foundBoomerang) {
        /* boomerang.js */
        function BOOMR_check_doc_domain(e){if(window){if(!e){if(window.parent===window||!document.getElementById("boomr-if-as"))return;if(window.BOOMR&&BOOMR.boomerang_frame&&BOOMR.window)try{BOOMR.boomerang_frame.document.domain!==BOOMR.window.document.domain&&(BOOMR.boomerang_frame.document.domain=BOOMR.window.document.domain)}catch(e){BOOMR.isCrossOriginError(e)||BOOMR.addError(e,"BOOMR_check_doc_domain.domainFix")}e=document.domain}if(-1!==e.indexOf(".")){try{return void window.parent.document}catch(n){document.domain=e}try{return void window.parent.document}catch(n){e=e.replace(/^[\w\-]+\./,"")}BOOMR_check_doc_domain(e)}}}BOOMR_start=(new Date).getTime(),BOOMR_check_doc_domain(),function(e){var n,t,r,o,i,a,s,u,l=e;if(e.parent!==e&&document.getElementById("boomr-if-as")&&"script"===document.getElementById("boomr-if-as").nodeName.toLowerCase()&&(e=e.parent,o=document.getElementById("boomr-if-as").src),r=e.document,e.BOOMR||(e.BOOMR={}),BOOMR=e.BOOMR,!BOOMR.version){BOOMR.version="%boomerang_version%",BOOMR.window=e,BOOMR.boomerang_frame=l,BOOMR.plugins||(BOOMR.plugins={}),function(){try{void 0!==new e.CustomEvent("CustomEvent")&&(i=function(n,t){return new e.CustomEvent(n,t)})}catch(e){}try{!i&&r.createEvent&&r.createEvent("CustomEvent")&&(i=function(e,n){var t=r.createEvent("CustomEvent");return n=n||{cancelable:!1,bubbles:!1},t.initCustomEvent(e,n.bubbles,n.cancelable,n.detail),t})}catch(e){}!i&&r.createEventObject&&(i=function(e,n){var t=r.createEventObject();return t.type=t.propertyName=e,t.detail=n.detail,t}),i||(i=function(){})}(),a=function(e,n,t){function o(){try{r.dispatchEvent?r.dispatchEvent(a):r.fireEvent&&r.fireEvent("onpropertychange",a)}catch(n){BOOMR.debug("Error when dispatching "+e)}}var a=i(e,{detail:n});a&&(t?BOOMR.setImmediate(o):o())},void 0!==document.hidden?(s="visibilityState",u="visibilitychange"):void 0!==document.mozHidden?(s="mozVisibilityState",u="mozvisibilitychange"):void 0!==document.msHidden?(s="msVisibilityState",u="msvisibilitychange"):void 0!==document.webkitHidden&&(s="webkitVisibilityState",u="webkitvisibilitychange"),n={beacon_url:"",beacon_type:"AUTO",beacon_auth_key:"Authorization",beacon_auth_token:void 0,site_domain:e.location.hostname.replace(/.*?([^.]+\.[^.]+)\.?$/,"$1").toLowerCase(),user_ip:"",autorun:!0,hasSentPageLoadBeacon:!1,r:void 0,r2:void 0,events:{page_ready:[],page_unload:[],before_unload:[],dom_loaded:[],visibility_changed:[],prerender_to_visible:[],before_beacon:[],onbeacon:[],page_load_beacon:[],xhr_load:[],click:[],form_submit:[],onconfig:[],xhr_init:[],spa_init:[],spa_navigation:[],xhr_send:[]},public_events:{before_beacon:"onBeforeBoomerangBeacon",onbeacon:"onBoomerangBeacon",onboomerangloaded:"onBoomerangLoaded"},listenerCallbacks:{},vars:{},varPriority:{"-1":{},1:{}},errors:{},disabled_plugins:{},xb_handler:function(t){return function(r){var o;r||(r=e.event),r.target?o=r.target:r.srcElement&&(o=r.srcElement),3===o.nodeType&&(o=o.parentNode),o&&"OBJECT"===o.nodeName.toUpperCase()&&"application/x-shockwave-flash"===o.type||n.fireEvent(t,o)}},clearEvents:function(){var e;for(e in this.events)this.events.hasOwnProperty(e)&&(this.events[e]=[])},clearListeners:function(){var e;for(e in n.listenerCallbacks)if(n.listenerCallbacks.hasOwnProperty(e))for(;n.listenerCallbacks[e].length;)BOOMR.utils.removeListener(n.listenerCallbacks[e][0].el,e,n.listenerCallbacks[e][0].fn);n.listenerCallbacks={}},fireEvent:function(e,n){var t,r,o,i;if(e=e.toLowerCase(),this.events.hasOwnProperty(e)){for(this.public_events.hasOwnProperty(e)&&a(this.public_events[e],n),o=this.events[e],"before_beacon"!==e&&"onbeacon"!==e&&BOOMR.real_sendBeacon(),i=o.length,t=0;t<i;t++)try{(r=o[t]).fn.call(r.scope,n,r.cb_data)}catch(n){BOOMR.addError(n,"fireEvent."+e+"<"+t+">")}for(t=0;t<i;t++)o[t].once&&(o.splice(t,1),i--,t--)}},spaNavigation:function(){n.onloadfired=!0}},t={t_start:BOOMR_start,url:o,config_url:null,constants:{BEACON_TYPE_SPAS:["spa","spa_hard"],MAX_GET_LENGTH:2e3},session:{domain:null,ID:Math.random().toString(36).replace(/^0\./,""),start:void 0,length:0},utils:{hasPostMessageSupport:function(){return!(!e.postMessage||"function"!=typeof e.postMessage&&"object"!=typeof e.postMessage)},objectToString:function(e,n,t){var r,o=[];if(!e||"object"!=typeof e)return e;if(void 0===n&&(n="\n\t"),t||(t=0),"[object Array]"===Object.prototype.toString.call(e)){for(r=0;r<e.length;r++)t>0&&null!==e[r]&&"object"==typeof e[r]?o.push(this.objectToString(e[r],n+("\n\t"===n?"\t":""),t-1)):"&"===n?o.push(encodeURIComponent(e[r])):o.push(e[r]);n=","}else for(r in e)Object.prototype.hasOwnProperty.call(e,r)&&(t>0&&null!==e[r]&&"object"==typeof e[r]?o.push(encodeURIComponent(r)+"="+this.objectToString(e[r],n+("\n\t"===n?"\t":""),t-1)):"&"===n?o.push(encodeURIComponent(r)+"="+encodeURIComponent(e[r])):o.push(r+"="+e[r]));return o.join(n)},getCookie:function(e){if(!e)return null;e=" "+e+"=";var n,t;return t=" "+r.cookie+";",(n=t.indexOf(e))>=0?(n+=e.length,t=t.substring(n,t.indexOf(";",n)).replace(/^"/,"").replace(/"$/,"")):void 0},setCookie:function(e,n,t){var o,i,a,s,u;if(!e||!BOOMR.session.domain)return BOOMR.debug("No cookie name or site domain: "+e+"/"+BOOMR.session.domain),null;if(o=this.objectToString(n,"&"),i=e+'="'+o+'"',s=[i,"path=/","domain="+BOOMR.session.domain],t&&((u=new Date).setTime(u.getTime()+1e3*t),u=u.toGMTString(),s.push("expires="+u)),i.length<500){if(r.cookie=s.join("; "),a=this.getCookie(e),o===a)return!0;BOOMR.warn("Saved cookie value doesn't match what we tried to set:\n"+o+"\n"+a)}else BOOMR.warn("Cookie too long: "+i.length+" "+i);return!1},getSubCookies:function(e){var n,t,r,o,i=!1,a={};if(!e)return null;if("string"!=typeof e)return BOOMR.debug("TypeError: cookie is not a string: "+typeof e),null;for(t=0,r=(n=e.split("&")).length;t<r;t++)(o=n[t].split("="))[0]&&(o.push(""),a[decodeURIComponent(o[0])]=decodeURIComponent(o[1]),i=!0);return i?a:null},removeCookie:function(e){return this.setCookie(e,{},-86400)},cleanupURL:function(e,t){if(!e||"[object Array]"===Object.prototype.toString.call(e))return"";if(n.strip_query_string&&(e=e.replace(/\?.*/,"?qs-redacted")),void 0!==t&&e&&e.length>t){var r=e.indexOf("?");e=-1!==r&&r<t?e.substr(0,r)+"?...":e.substr(0,t-3)+"..."}return e},hashQueryString:function(e,n){return e?e.match?(e.match(/^\/\//)&&(e=location.protocol+e),e.match(/^(https?|file):/)?(n&&(e=e.replace(/#.*/,"")),BOOMR.utils.MD5?e.replace(/\?([^#]*)/,function(e,n){return"?"+(n.length>10?BOOMR.utils.MD5(n):n)}):e):(BOOMR.error("Passed in URL is invalid: "+e),"")):(BOOMR.addError("TypeError: Not a string","hashQueryString",typeof e),""):e},pluginConfig:function(e,n,t,r){var o,i=0;if(!n||!n[t])return!1;for(o=0;o<r.length;o++)void 0!==n[t][r[o]]&&(e[r[o]]=n[t][r[o]],i++);return i>0},arrayFilter:function(e,n){var t=[];if("function"==typeof e.filter)t=e.filter(n);else for(var r,o=-1,i=e.length;++o<i;)n(r=e[o],o,e)&&(t[t.length]=r);return t},addObserver:function(e,n,t,r,o,i){function a(e){var n=!1;s.timer&&(clearTimeout(s.timer),s.timer=null),r&&((n=r.call(i,e,o))||(r=null)),!n&&s.observer&&(s.observer.disconnect(),s.observer=null),"number"==typeof n&&n>0&&(s.timer=setTimeout(a,n))}var s={observer:null,timer:null};return BOOMR.window&&BOOMR.window.MutationObserver&&r&&e?(s.observer=new BOOMR.window.MutationObserver(a),t&&(s.timer=setTimeout(a,s.timeout)),s.observer.observe(e,n),s):null},addListener:function(e,t,r){e.addEventListener?e.addEventListener(t,r,!1):e.attachEvent&&e.attachEvent("on"+t,r),n.listenerCallbacks[t]=n.listenerCallbacks[t]||[],n.listenerCallbacks[t].push({el:e,fn:r})},removeListener:function(e,t,r){if(e.removeEventListener?e.removeEventListener(t,r,!1):e.detachEvent&&e.detachEvent("on"+t,r),n.listenerCallbacks.hasOwnProperty(t))for(var o=0;o<n.listenerCallbacks[t].length;o++)if(r===n.listenerCallbacks[t][o].fn&&e===n.listenerCallbacks[t][o].el)return void n.listenerCallbacks[t].splice(o,1)},pushVars:function(e,n,t){var r,o,i,a=0;for(r in n)if(n.hasOwnProperty(r))if("[object Array]"===Object.prototype.toString.call(n[r]))for(o=0;o<n[r].length;++o)a+=BOOMR.utils.pushVars(e,n[r][o],r+"["+o+"]");else(i=document.createElement("input")).type="hidden",i.name=t?t+"["+r+"]":r,i.value=void 0===n[r]||null===n[r]?"":n[r],e.appendChild(i),a+=encodeURIComponent(i.name).length+encodeURIComponent(i.value).length+2;return a},isArray:function(e){return"[object Array]"===Object.prototype.toString.call(e)},inArray:function(e,n){var t;if(void 0===e||void 0===n||!n.length)return!1;for(t=0;t<n.length;t++)if(n[t]===e)return!0;return!1},getQueryParamValue:function(e,n){var t,r,o,i;if(!e)return null;for("string"==typeof n?(t=BOOMR.window.document.createElement("a")).href=n:t="object"==typeof n&&"string"==typeof n.search?n:BOOMR.window.location,r=t.search.slice(1).split(/&/),o=0;o<r.length;o++)if(r[o]&&(i=r[o].split("=")).length&&i[0]===e)return decodeURIComponent(i[1].replace(/\+/g," "));return null},generateUUID:function(){return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(e){var n=16*Math.random()|0;return("x"===e?n:3&n|8).toString(16)})},generateId:function(e){return"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".substr(0,e||40).replace(/x/g,function(e){return"0"===(e=(Math.random()||.01).toString(36))?"0":e.substr(2,1)})},serializeForUrl:function(e){return BOOMR.utils.Compression&&BOOMR.utils.Compression.jsUrl?BOOMR.utils.Compression.jsUrl(e):window.JSON?JSON.stringify(e):(BOOMR.debug("JSON is not supported"),"")},forEach:function(e,n,t){if(BOOMR.utils.isArray(e)&&"function"==typeof n)for(var r=e.length,o=0;o<r;o++)e.hasOwnProperty(o)&&n.call(t,e[o],o,e)}},init:function(t){var o,i,a=["beacon_url","beacon_type","beacon_auth_key","beacon_auth_token","site_domain","user_ip","strip_query_string","secondary_beacons","autorun","site_domain"];if(BOOMR_check_doc_domain(),t||(t={}),this.pageId||(this.pageId=BOOMR.utils.generateId(8)),t.primary&&n.handlers_attached)return this;void 0!==t.site_domain&&(this.session.domain=t.site_domain),void 0!==t.log&&(this.log=t.log),this.log||(this.log=function(){}),void 0!==t.autorun&&(n.autorun=t.autorun);for(i in this.plugins)if(this.plugins.hasOwnProperty(i)){if(t[i]&&t[i].hasOwnProperty("enabled")&&!1===t[i].enabled){n.disabled_plugins[i]=1,"function"==typeof this.plugins[i].disable&&this.plugins[i].disable();continue}if(n.disabled_plugins[i]){if(!t[i]||!t[i].hasOwnProperty("enabled")||!0!==t[i].enabled)continue;"function"==typeof this.plugins[i].enable&&this.plugins[i].enable(),delete n.disabled_plugins[i]}if("function"==typeof this.plugins[i].init)try{this.plugins[i].init(t)}catch(e){BOOMR.addError(e,i+".init")}}for(o=0;o<a.length;o++)void 0!==t[a[o]]&&(n[a[o]]=t[a[o]]);return n.handlers_attached?this:(n.onloadfired||void 0!==t.autorun&&!1===t.autorun||(r.readyState&&"complete"===r.readyState?(BOOMR.loadedLate=!0,this.setImmediate(BOOMR.page_ready_autorun,null,null,BOOMR)):e.onpagehide||null===e.onpagehide?BOOMR.utils.addListener(e,"pageshow",BOOMR.page_ready_autorun):BOOMR.utils.addListener(e,"load",BOOMR.page_ready_autorun)),BOOMR.utils.addListener(e,"DOMContentLoaded",function(){n.fireEvent("dom_loaded")}),BOOMR.fireEvent("onconfig",t),BOOMR.subscribe("onconfig",function(e){e.beacon_url&&(n.beacon_url=e.beacon_url)}),BOOMR.subscribe("spa_navigation",n.spaNavigation,null,n),function(){var t,o;for(void 0!==u&&(BOOMR.utils.addListener(r,u,function(){n.fireEvent("visibility_changed")}),n.lastVisibilityState=BOOMR.visibilityState(),BOOMR.subscribe("visibility_changed",function(){var e=BOOMR.visibilityState();BOOMR.lastVisibilityEvent[e]=BOOMR.now(),BOOMR.debug("Visibility changed from "+n.lastVisibilityState+" to "+e),"prerender"===n.lastVisibilityState&&"prerender"!==e&&(BOOMR.addVar("vis.pre","1"),n.fireEvent("prerender_to_visible")),n.lastVisibilityState=e})),BOOMR.utils.addListener(r,"mouseup",n.xb_handler("click")),t=r.getElementsByTagName("form"),o=0;o<t.length;o++)BOOMR.utils.addListener(t[o],"submit",n.xb_handler("form_submit"));e.onpagehide||null===e.onpagehide||BOOMR.utils.addListener(e,"unload",function(){BOOMR.window=e=null})}(),n.handlers_attached=!0,this)},attach_page_ready:function(n){r.readyState&&"complete"===r.readyState?this.setImmediate(n,null,null,BOOMR):e.onpagehide||null===e.onpagehide?BOOMR.utils.addListener(e,"pageshow",n):BOOMR.utils.addListener(e,"load",n)},page_ready_autorun:function(e){n.autorun&&BOOMR.page_ready(e)},page_ready:function(t){return t||(t=e.event),t||(t={name:"load"}),n.onloadfired?this:(n.fireEvent("page_ready",t),n.onloadfired=!0,this)},onloadFired:function(){return n.onloadfired},setImmediate:function(n,t,r,o){var i,a;"undefined"!=typeof Error&&(a=new Error,a=a.stack?a.stack.replace(/^Error/,"Called"):void 0),i=function(){n.call(o||null,t,r||{},a),i=null},e.requestIdleCallback?e.requestIdleCallback(i):e.setImmediate?e.setImmediate(i):setTimeout(i,10)},now:Date.now||function(){return(new Date).getTime()},getPerformance:function(){try{if(BOOMR.window)return"performance"in BOOMR.window&&BOOMR.window.performance?BOOMR.window.performance:BOOMR.window.msPerformance||BOOMR.window.webkitPerformance||BOOMR.window.mozPerformance}catch(e){}},visibilityState:void 0===s?function(){return"visible"}:function(){return r[s]},lastVisibilityEvent:{},registerEvent:function(e){return n.events.hasOwnProperty(e)?this:(n.events[e]=[],this)},disable:function(){n.clearEvents(),n.clearListeners()},fireEvent:function(e,t){return n.fireEvent(e,t)},subscribe:function(t,r,o,i,a){var s,u,l;for(t=t.toLowerCase(),n.events.hasOwnProperty(t)||(n.events[t]=[]),l=n.events[t],s=0;s<l.length;s++)if((u=l[s])&&u.fn===r&&u.cb_data===o&&u.scope===i)return this;return l.push({fn:r,cb_data:o||{},scope:i||null,once:a||!1}),"page_ready"===t&&n.onloadfired&&n.autorun&&this.setImmediate(r,null,o,i),"page_unload"!==t&&"before_unload"!==t||function(){var a,s=l.length;a=function(a){r&&r.call(i,a||e.event,o),"page_unload"===t&&s===n.events[t].length&&BOOMR.real_sendBeacon()},"page_unload"===t&&(e.onpagehide||null===e.onpagehide?BOOMR.utils.addListener(e,"pagehide",a):BOOMR.utils.addListener(e,"unload",a)),BOOMR.utils.addListener(e,"beforeunload",a)}(),this},addError:function(e,t,r){var o,i=BOOMR.plugins.Errors;i&&i.is_supported()?"string"==typeof e?i.send({message:e,extra:r,functionName:t,noStack:!0},i.VIA_APP,i.SOURCE_BOOMERANG):("string"==typeof t&&(e.functionName=t),void 0!==r&&(e.extra=r),i.send(e,i.VIA_APP,i.SOURCE_BOOMERANG)):("string"!=typeof e&&((o=String(e)).match(/^\[object/)&&(o=e.name+": "+(e.description||e.message).replace(/\r\n$/,"")),e=o),void 0!==t&&(e="["+t+":"+BOOMR.now()+"] "+e),r&&(e+=":: "+r),n.errors[e]?n.errors[e]++:n.errors[e]=1)},isCrossOriginError:function(e){return"SecurityError"===e.name||"TypeError"===e.name&&"Permission denied"===e.message||"Error"===e.name&&e.message&&e.message.match(/^(Permission|Access is) denied/)},addVar:function(e,t){if("string"==typeof e)n.vars[e]=t;else if("object"==typeof e){var r,o=e;for(r in o)o.hasOwnProperty(r)&&(n.vars[r]=o[r])}return this},removeVar:function(e){var t,r;if(!arguments.length)return this;for(r=1===arguments.length&&"[object Array]"===Object.prototype.toString.apply(e)?e:arguments,t=0;t<r.length;t++)n.vars.hasOwnProperty(r[t])&&delete n.vars[r[t]];return this},hasVar:function(e){return n.vars.hasOwnProperty(e)},getVar:function(e){return n.vars[e]},getVar:function(e){return n.vars[e]},setVarPriority:function(e,t){return"number"!=typeof t||1!==Math.abs(t)?this:(n.varPriority[t][e]=1,this)},setReferrer:function(e,t){n.r=e,n.r2=t&&e!==t?t:void 0},requestStart:function(e){var n=BOOMR.now();return BOOMR.plugins.RT.startTimer("xhr_"+e,n),{loaded:function(t){BOOMR.responseEnd(e,n,t)}}},readyToSend:function(){var e;for(e in this.plugins)if(this.plugins.hasOwnProperty(e)){if(n.disabled_plugins[e])continue;if("function"==typeof this.plugins[e].readyToSend&&!1===this.plugins[e].readyToSend())return BOOMR.debug("Plugin "+e+" is not ready to send"),!1}return!0},responseEnd:function(e,t,r,o){if(t="number"==typeof t?t:BOOMR.now(),o="number"==typeof o?o:BOOMR.now(),!BOOMR.readyToSend())return BOOMR.debug("Attempted to call responseEnd before all plugins were Ready to Send, trying again..."),void setTimeout(function(){BOOMR.responseEnd(e,t,r,o)},1e3);if(BOOMR.hasSentPageLoadBeacon()||BOOMR.utils.inArray(e.initiator,BOOMR.constants.BEACON_TYPE_SPAS))if("object"==typeof e){if(!e.url)return void BOOMR.debug("BOOMR.responseEnd: First argument must have a url property if it's an object");n.fireEvent("xhr_load",e)}else BOOMR.real_sendBeacon(),BOOMR.addVar("xhr.pg",e),BOOMR.plugins.RT.startTimer("xhr_"+e,t),n.fireEvent("xhr_load",{name:"xhr_"+e,data:r,timing:{loadEventEnd:o}});else BOOMR.subscribe("page_load_beacon",function(){BOOMR.responseEnd(e,t,r,o)},null,BOOMR,!0)},uninstrumentXHR:function(){},instrumentXHR:function(){},sendBeacon:function(e){return e&&(n.beacon_url_override=e),n.beaconQueued||(n.beaconQueued=!0,BOOMR.setImmediate(BOOMR.real_sendBeacon,null,null,BOOMR)),!0},real_sendBeacon:function(){var t,o=[],i={};if(!n.beaconQueued)return!1;n.beaconQueued=!1,BOOMR.debug("Checking if we can send beacon");for(t in this.plugins)if(this.plugins.hasOwnProperty(t)){if(n.disabled_plugins[t])continue;if(!this.plugins[t].is_complete(n.vars))return BOOMR.debug("Plugin "+t+" is not complete, deferring beacon send"),!1}if(!(window&&window.Image&&window.navigator&&BOOMR.window))return BOOMR.debug("DOM not fully available, not sending a beacon"),!1;var a=BOOMR.utils.inArray(n.vars["http.initiator"],BOOMR.constants.BEACON_TYPE_SPAS),s=void 0===n.vars["http.initiator"]||a;n.vars.pgu||(n.vars.pgu=a?r.URL:r.URL.replace(/#.*/,"")),n.vars.pgu=BOOMR.utils.cleanupURL(n.vars.pgu),n.vars.u&&!a||(n.vars.u=n.vars.pgu),n.vars.pgu===n.vars.u&&delete n.vars.pgu,n.r?n.vars.r=BOOMR.utils.cleanupURL(n.r):delete n.vars.r,n.r2?n.vars.r2=BOOMR.utils.cleanupURL(n.r2):delete n.vars.r2,n.vars.v=BOOMR.version,n.vars["rt.si"]=BOOMR.session.ID+"-"+Math.round(BOOMR.session.start/1e3).toString(36),n.vars["rt.ss"]=BOOMR.session.start,n.vars["rt.sl"]=BOOMR.session.length,BOOMR.visibilityState()&&(n.vars["vis.st"]=BOOMR.visibilityState(),BOOMR.lastVisibilityEvent.visible&&(n.vars["vis.lv"]=BOOMR.now()-BOOMR.lastVisibilityEvent.visible),BOOMR.lastVisibilityEvent.hidden&&(n.vars["vis.lh"]=BOOMR.now()-BOOMR.lastVisibilityEvent.hidden)),n.vars["ua.plt"]=navigator.platform,n.vars["ua.vnd"]=navigator.vendor,this.pageId&&(n.vars.pid=this.pageId),e!==window&&(n.vars.if="");for(t in n.errors)n.errors.hasOwnProperty(t)&&o.push(t+(n.errors[t]>1?" (*"+n.errors[t]+")":""));o.length>0&&(n.vars.errors=o.join("\n")),n.errors={},n.fireEvent("before_beacon",n.vars);for(t in n.vars)n.vars.hasOwnProperty(t)&&(i[t]=n.vars[t]);return BOOMR.removeVar("qt"),!n.hasSentPageLoadBeacon&&s&&(n.hasSentPageLoadBeacon=!0,BOOMR.setImmediate(function(){n.fireEvent("page_load_beacon",i)})),BOOMR.session.rate_limited?(BOOMR.debug("Skipping because we're rate limited"),!1):(BOOMR.sendBeaconData(i),!0)},hasSentPageLoadBeacon:function(){return n.hasSentPageLoadBeacon},sendBeaconData:function(t){var r,o,i,a,s,u=[],l=[],c=!0;if(BOOMR.debug("Ready to send beacon: "+BOOMR.utils.objectToString(t)),n.beacon_url=n.beacon_url_override||n.beacon_url,!n.beacon_url)return BOOMR.debug("No beacon URL, so skipping."),!1;if(0===t.length)return!1;if(n.fireEvent("onbeacon",t),u=this.getVarsOfPriority(t,-1),l=this.getVarsOfPriority(t,1),r=u.concat(this.getVarsOfPriority(t,0),l),o=r.join("&"),i=n.beacon_url+(n.beacon_url.indexOf("?")>-1?"&":"?")+o,("POST"===n.beacon_type||i.length>BOOMR.constants.MAX_GET_LENGTH)&&(c=!1),e&&e.navigator&&"function"==typeof e.navigator.sendBeacon&&"function"==typeof e.Blob){var d=new e.Blob([o+"&sb=1"],{type:"application/x-www-form-urlencoded"});if(e.navigator.sendBeacon(n.beacon_url,d))return!0}if(BOOMR.orig_XMLHttpRequest||e&&e.XMLHttpRequest||(c=!0),c){try{a=new Image}catch(e){return BOOMR.debug("Image is not a constructor, not sending a beacon"),!1}if(a.src=i,n.secondary_beacons)for(k=0;k<n.secondary_beacons.length;k++)i=n.secondary_beacons[k]+"?"+o,(a=new Image).src=i}else{s=new(BOOMR.window.orig_XMLHttpRequest||BOOMR.orig_XMLHttpRequest||BOOMR.window.XMLHttpRequest);try{this.sendXhrPostBeacon(s,o)}catch(e){s=new BOOMR.boomerang_frame.XMLHttpRequest,this.sendXhrPostBeacon(s,o)}}},sendXhrPostBeacon:function(e,t){e.open("POST",n.beacon_url),e.setRequestHeader("Content-type","application/x-www-form-urlencoded"),void 0!==n.beacon_auth_token&&(void 0===n.beacon_auth_key&&(n.beacon_auth_key="Authorization"),e.setRequestHeader(n.beacon_auth_key,n.beacon_auth_token)),e.send(t)},getVarsOfPriority:function(e,t){var r,o=[];if(0!==t)for(r in n.varPriority[t])n.varPriority[t].hasOwnProperty(r)&&e.hasOwnProperty(r)&&(o.push(this.getUriEncodedVar(r,e[r])),delete e[r]);else for(r in e)e.hasOwnProperty(r)&&o.push(this.getUriEncodedVar(r,e[r]));return o},getUriEncodedVar:function(e,n){return encodeURIComponent(e)+"="+(void 0===n||null===n?"":encodeURIComponent(n))},getResourceTiming:function(e,n){var t;try{if(BOOMR.getPerformance()&&"function"==typeof BOOMR.getPerformance().getEntriesByName&&(t=BOOMR.getPerformance().getEntriesByName(e))&&t.length)return"function"==typeof n&&t.sort(n),t[t.length-1]}catch(e){}}},delete BOOMR_start,"number"==typeof BOOMR_lstart?(t.t_lstart=BOOMR_lstart,delete BOOMR_lstart):"number"==typeof BOOMR.window.BOOMR_lstart&&(t.t_lstart=BOOMR.window.BOOMR_lstart),"number"==typeof BOOMR.window.BOOMR_onload&&(t.t_onload=BOOMR.window.BOOMR_onload),function(){var e;"object"==typeof console&&void 0!==console.log&&(t.log=function(e,n,t){console.log("("+BOOMR.now()+") {"+BOOMR.pageId+"}: "+t+": ["+n+"] "+e)}),e=function(e){return function(n,t){return this.log(n,e,"boomerang"+(t?"."+t:"")),this}},t.debug=e("debug"),t.info=e("info"),t.warn=e("warn"),t.error=e("error")}();try{var c=t.getPerformance();c&&"function"==typeof c.now&&/\[native code\]/.test(String(c.now))&&c.timing&&c.timing.navigationStart&&(t.now=function(){return Math.round(c.now()+c.timing.navigationStart)})}catch(e){}!function(){var e;for(e in t)t.hasOwnProperty(e)&&(BOOMR[e]=t[e]);BOOMR.xhr_excludes||(BOOMR.xhr_excludes={})}(),function(){if(BOOMR.checkWindowOverrides=function(e){function n(e){t(e)&&s.push(e)}function t(n){for(var t=n.split("."),r=e;r&&t.length;)try{r=r[t.shift()]}catch(e){return!1}return"function"==typeof r&&!o(r,n)}function o(e,n){return"console.assert"===n||"Function.prototype"===n||n.indexOf("onload")>=0||n.indexOf("onbeforeunload")>=0||n.indexOf("onerror")>=0||n.indexOf("onload")>=0||n.indexOf("NodeFilter")>=0||e.toString&&!e.hasOwnProperty("toString")&&/\[native code\]/.test(String(e))}var i,a,s=[];!function(){var e=r.createElement("iframe");e.style.display="none",e.src="javascript:false",r.getElementsByTagName("script")[0].parentNode.appendChild(e),i=e.contentWindow,a=Object.getOwnPropertyNames(i)}();for(var u=0;u<a.length;u++){var l=a[u];if("window"!==l&&"self"!==l&&"top"!==l&&"parent"!==l&&"frames"!==l&&(i[l]&&("object"==typeof i[l]||"function"==typeof i[l]))){n(l);var c=[];try{c=Object.getOwnPropertyNames(i[l])}catch(e){}for(d=0;d<c.length;d++)n([l,c[d]].join("."));if(i[l].prototype){c=Object.getOwnPropertyNames(i[l].prototype);for(var d=0;d<c.length;d++)n([l,"prototype",c[d]].join("."))}}}return s},BOOMR.checkDocumentOverrides=function(e){return BOOMR.utils.arrayFilter(["readyState","domain","hidden","URL","cookie"],function(n){return e.hasOwnProperty(n)})},"true"===BOOMR.utils.getQueryParamValue("overridden")&&e&&e.Object&&Object.getOwnPropertyNames){var n=[].concat(BOOMR.checkWindowOverrides(e)).concat(BOOMR.checkDocumentOverrides(r));n.length>0&&BOOMR.warn("overridden: "+n.sort())}}(),a("onBoomerangLoaded",{BOOMR:BOOMR},!0)}}(UW);
    }

    //
    // Add the Boomerang ResourceTiming and Continuity plugins
    //

    /**
    \file restiming.js
    Plugin to collect metrics from the W3C Resource Timing API.
    For more information about Resource Timing,
    see: http://www.w3.org/TR/resource-timing/
    */

    (function() {
        var impl;

        BOOMR = UW.BOOMR || {};
        BOOMR.plugins = BOOMR.plugins || {};

        if (BOOMR.plugins.ResourceTiming) {
            return;
        }

        //
        // Constants
        //
        var INITIATOR_TYPES = {
            "other": 0,
            "img": 1,
            "link": 2,
            "script": 3,
            "css": 4,
            "xmlhttprequest": 5,
            "html": 6,
            // IMAGE element inside a SVG
            "image": 7,
            // sendBeacon: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon
            "beacon": 8,
            // Fetch API: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
            "fetch": 9
        };

        // https://html.spec.whatwg.org/multipage/links.html#linkTypes
        // these are the only `rel` types that _might_ be reference-able from resource-timing
        var REL_TYPES = {
            "prefetch": 1,
            "preload": 2,
            "prerender": 3,
            "stylesheet": 4
        };

        // Words that will be broken (by ensuring the optimized trie doesn't contain
        // the whole string) in URLs, to ensure NoScript doesn't think this is an XSS attack
        var DEFAULT_XSS_BREAK_WORDS = [
            /(h)(ref)/gi,
            /(s)(rc)/gi,
            /(a)(ction)/gi
        ];

        // Delimiter to use to break a XSS word
        var XSS_BREAK_DELIM = "\n";

        // Maximum number of characters in a URL
        var DEFAULT_URL_LIMIT = 500;

        // Any ResourceTiming data time that starts with this character is not a time,
        // but something else (like dimension data)
        var SPECIAL_DATA_PREFIX = "*";

        // Dimension data special type
        var SPECIAL_DATA_DIMENSION_TYPE = "0";

        // Dimension data special type
        var SPECIAL_DATA_SIZE_TYPE = "1";

        // Script attributes
        var SPECIAL_DATA_SCRIPT_ATTR_TYPE = "2";
        // The following make up a bitmask
        var ASYNC_ATTR = 0x1;
        var DEFER_ATTR = 0x2;
        var LOCAT_ATTR = 0x4;	// 0 => HEAD, 1 => BODY

        // Dimension data special type
        var SPECIAL_DATA_SERVERTIMING_TYPE = "3";

        // Link attributes
        var SPECIAL_DATA_LINK_ATTR_TYPE = "4";

        /**
         * Converts entries to a Trie:
         * http://en.wikipedia.org/wiki/Trie
         *
         * Assumptions:
         * 1) All entries have unique keys
         * 2) Keys cannot have "|" in their name.
         * 3) All key's values are strings
         *
         * Leaf nodes in the tree are the key's values.
         *
         * If key A is a prefix to key B, key A will be suffixed with "|"
         *
         * @param [object] entries Performance entries
         * @return A trie
         */
        function convertToTrie(entries) {
            var trie = {}, url, urlFixed, i, value, letters, letter, cur, node;

            for (url in entries) {
                urlFixed = url;

                // find any strings to break
                for (i = 0; i < impl.xssBreakWords.length; i++) {
                    // Add a XSS_BREAK_DELIM character after the first letter.  optimizeTrie will
                    // ensure this sequence doesn't get combined.
                    urlFixed = urlFixed.replace(impl.xssBreakWords[i], "$1" + XSS_BREAK_DELIM + "$2");
                }

                if (!entries.hasOwnProperty(url)) {
                    continue;
                }

                value = entries[url];
                letters = urlFixed.split("");
                cur = trie;

                for (i = 0; i < letters.length; i++) {
                    letter = letters[i];
                    node = cur[letter];

                    if (typeof node === "undefined") {
                        // nothing exists yet, create either a leaf if this is the end of the word,
                        // or a branch if there are letters to go
                        cur = cur[letter] = (i === (letters.length - 1) ? value : {});
                    }
                    else if (typeof node === "string") {
                        // this is a leaf, but we need to go further, so convert it into a branch
                        cur = cur[letter] = { "|": node };
                    }
                    else {
                        if (i === (letters.length - 1)) {
                            // this is the end of our key, and we've hit an existing node.  Add our timings.
                            cur[letter]["|"] = value;
                        }
                        else {
                            // continue onwards
                            cur = cur[letter];
                        }
                    }
                }
            }

            return trie;
        }

        /**
         * Optimize the Trie by combining branches with no leaf
         *
         * @param [object] cur Current Trie branch
         * @param [boolean] top Whether or not this is the root node
         */
        function optimizeTrie(cur, top) {
            var num = 0, node, ret, topNode;

            // capture trie keys first as we'll be modifying it
            var keys = [];

            for (node in cur) {
                if (cur.hasOwnProperty(node)) {
                    keys.push(node);
                }
            }

            for (var i = 0; i < keys.length; i++) {
                node = keys[i];
                if (typeof cur[node] === "object") {
                    // optimize children
                    ret = optimizeTrie(cur[node], false);
                    if (ret) {
                        // swap the current leaf with compressed one
                        delete cur[node];

                        if (node === XSS_BREAK_DELIM) {
                            // If this node is a newline, which can't be in a regular URL,
                            // it's due to the XSS patch.  Remove the placeholder character,
                            // and make sure this node isn't compressed by incrementing
                            // num to be greater than one.
                            node = ret.name;
                            num++;
                        }
                        else {
                            node = node + ret.name;
                        }
                        cur[node] = ret.value;
                    }
                }
                num++;
            }

            if (num === 1) {
                // compress single leafs
                if (top) {
                    // top node gets special treatment so we're not left with a {node:,value:} at top
                    topNode = {};
                    topNode[node] = cur[node];
                    return topNode;
                }
                else {
                    // other nodes we return name and value separately
                    return { name: node, value: cur[node] };
                }
            }
            else if (top) {
                // top node with more than 1 child, return it as-is
                return cur;
            }
            else {
                // more than two nodes and not the top, we can't compress any more
                return false;
            }
        }

        /**
         * Trims the timing, returning an offset from the startTime in ms
         *
         * @param [number] time Time
         * @param [number] startTime Start time
         * @return [number] Number of ms from start time
         */
        function trimTiming(time, startTime) {
            if (typeof time !== "number") {
                time = 0;
            }

            if (typeof startTime !== "number") {
                startTime = 0;
            }

            // strip from microseconds to milliseconds only
            var timeMs = Math.round(time ? time : 0),
                startTimeMs = Math.round(startTime ? startTime : 0);

            return timeMs === 0 ? 0 : (timeMs - startTimeMs);
        }

        /**
         * Checks if the current execution context can access the specified frame.
         *
         * Note: In Safari, this will still produce a console error message, even
         * though the exception is caught.

         * @param {Window} frame The frame to check if access can haz
         * @return {boolean} true if true, false otherwise
         */
        function isFrameAccessible(frame) {
            var dummy;

            try {
                // Try to access location.href first to trigger any Cross-Origin
                // warnings.  There's also a bug in Chrome ~48 that might cause
                // the browser to crash if accessing X-O frame.performance.
                // https://code.google.com/p/chromium/issues/detail?id=585871
                // This variable is not otherwise used.
                dummy = frame.location && frame.location.href;

                // Try to access frame.document to trigger X-O exceptions with that
                dummy = frame.document;

                if (("performance" in frame) && frame.performance) {
                    return true;
                }
            }
            catch (e) {
                // empty
            }

            return false;
        }

        /**
         * Attempts to get the navigationStart time for a frame.
         * @returns navigationStart time, or 0 if not accessible
         */
        function getNavStartTime(frame) {
            var navStart = 0;

            if (isFrameAccessible(frame) && frame.performance.timing && frame.performance.timing.navigationStart) {
                navStart = frame.performance.timing.navigationStart;
            }

            return navStart;
        }

        /**
         * Gets all of the performance entries for a frame and its subframes
         *
         * @param {Frame} frame Frame
         * @param {boolean} top This is the top window
         * @param {string} offset Offset in timing from root IFRAME
         * @param {number} depth Recursion depth
         * @param {number[]} [frameDims] position and size of the frame if it is visible as returned by getVisibleEntries
         * @return {PerformanceEntry[]} Performance entries
         */
        function findPerformanceEntriesForFrame(frame, isTopWindow, offset, depth, frameDims) {
            var entries = [], i, navEntries, navStart, frameNavStart, frameOffset, subFrames, subFrameDims,
                navEntry, t, rtEntry, visibleEntries, scripts = {}, links = {}, a;

            if (typeof isTopWindow === "undefined") {
                isTopWindow = true;
            }

            if (typeof offset === "undefined") {
                offset = 0;
            }

            if (typeof depth === "undefined") {
                depth = 0;
            }

            if (depth > 10) {
                return entries;
            }

            try {
                if (!isFrameAccessible(frame)) {
                    return entries;
                }

                navStart = getNavStartTime(frame);

                // gather visible entries on the page
                visibleEntries = getVisibleEntries(frame, frameDims);

                a = frame.document.createElement("a");

                // get all scripts as an object keyed on script.src
                collectResources(a, scripts, "script");
                collectResources(a, links, "link");

                subFrames = frame.document.getElementsByTagName("iframe");

                // get sub-frames' entries first
                if (subFrames && subFrames.length) {
                    for (i = 0; i < subFrames.length; i++) {
                        frameNavStart = getNavStartTime(subFrames[i].contentWindow);
                        frameOffset = 0;
                        if (frameNavStart > navStart) {
                            frameOffset = offset + (frameNavStart - navStart);
                        }

                        a.href = subFrames[i].src;	// Get canonical URL

                        entries = entries.concat(findPerformanceEntriesForFrame(subFrames[i].contentWindow, false, frameOffset, depth + 1, visibleEntries[a.href]));
                    }
                }

                if (typeof frame.performance.getEntriesByType !== "function") {
                    return entries;
                }

                function readServerTiming(entry) {
                    return (impl.serverTiming && entry.serverTiming) || [];
                }

                // add an entry for the top page
                if (isTopWindow) {
                    navEntries = frame.performance.getEntriesByType("navigation");
                    if (navEntries && navEntries.length === 1) {
                        navEntry = navEntries[0];

                        // replace document with the actual URL
                        entries.push({
                            name: frame.location.href,
                            startTime: 0,
                            initiatorType: "html",
                            redirectStart: navEntry.redirectStart,
                            redirectEnd: navEntry.redirectEnd,
                            fetchStart: navEntry.fetchStart,
                            domainLookupStart: navEntry.domainLookupStart,
                            domainLookupEnd: navEntry.domainLookupEnd,
                            connectStart: navEntry.connectStart,
                            secureConnectionStart: navEntry.secureConnectionStart,
                            connectEnd: navEntry.connectEnd,
                            requestStart: navEntry.requestStart,
                            responseStart: navEntry.responseStart,
                            responseEnd: navEntry.responseEnd,
                            workerStart: navEntry.workerStart,
                            encodedBodySize: navEntry.encodedBodySize,
                            decodedBodySize: navEntry.decodedBodySize,
                            transferSize: navEntry.transferSize,
                            serverTiming: readServerTiming(navEntry)
                        });
                    }
                    else if (frame.performance.timing) {
                        // add a fake entry from the timing object
                        t = frame.performance.timing;

                        //
                        // Avoid browser bugs:
                        // 1. navigationStart being 0 in some cases
                        // 2. responseEnd being ~2x what navigationStart is
                        //    (ensure the end is within 60 minutes of start)
                        //
                        if (t.navigationStart !== 0 &&
                            t.responseEnd <= (t.navigationStart + (60 * 60 * 1000))) {
                            entries.push({
                                name: frame.location.href,
                                startTime: 0,
                                initiatorType: "html",
                                redirectStart: t.redirectStart ? (t.redirectStart - t.navigationStart) : 0,
                                redirectEnd: t.redirectEnd ? (t.redirectEnd - t.navigationStart) : 0,
                                fetchStart: t.fetchStart ? (t.fetchStart - t.navigationStart) : 0,
                                domainLookupStart: t.domainLookupStart ? (t.domainLookupStart - t.navigationStart) : 0,
                                domainLookupEnd: t.domainLookupEnd ? (t.domainLookupEnd - t.navigationStart) : 0,
                                connectStart: t.connectStart ? (t.connectStart - t.navigationStart) : 0,
                                secureConnectionStart: t.secureConnectionStart ? (t.secureConnectionStart - t.navigationStart) : 0,
                                connectEnd: t.connectEnd ? (t.connectEnd - t.navigationStart) : 0,
                                requestStart: t.requestStart ? (t.requestStart - t.navigationStart) : 0,
                                responseStart: t.responseStart ? (t.responseStart - t.navigationStart) : 0,
                                responseEnd: t.responseEnd ? (t.responseEnd - t.navigationStart) : 0
                            });
                        }
                    }
                }

                // offset all of the entries by the specified offset for this frame
                var frameEntries = frame.performance.getEntriesByType("resource"),
                    frameFixedEntries = [];

                for (i = 0; frameEntries && i < frameEntries.length; i++) {
                    t = frameEntries[i];
                    rtEntry = {
                        name: t.name,
                        initiatorType: t.initiatorType,
                        startTime: t.startTime + offset,
                        redirectStart: t.redirectStart ? (t.redirectStart + offset) : 0,
                        redirectEnd: t.redirectEnd ? (t.redirectEnd + offset) : 0,
                        fetchStart: t.fetchStart ? (t.fetchStart + offset) : 0,
                        domainLookupStart: t.domainLookupStart ? (t.domainLookupStart + offset) : 0,
                        domainLookupEnd: t.domainLookupEnd ? (t.domainLookupEnd + offset) : 0,
                        connectStart: t.connectStart ? (t.connectStart + offset) : 0,
                        secureConnectionStart: t.secureConnectionStart ? (t.secureConnectionStart + offset) : 0,
                        connectEnd: t.connectEnd ? (t.connectEnd + offset) : 0,
                        requestStart: t.requestStart ? (t.requestStart + offset) : 0,
                        responseStart: t.responseStart ? (t.responseStart + offset) : 0,
                        responseEnd: t.responseEnd ? (t.responseEnd + offset) : 0,
                        workerStart: t.workerStart ? (t.workerStart + offset) : 0,
                        encodedBodySize: t.encodedBodySize,
                        decodedBodySize: t.decodedBodySize,
                        transferSize: t.transferSize,
                        serverTiming: readServerTiming(t),
                        visibleDimensions: visibleEntries[t.name],
                        latestTime: getResourceLatestTime(t)
                    };

                    // If this is a script, set its flags
                    if ((t.initiatorType === "script" || t.initiatorType === "link") && scripts[t.name]) {
                        var s = scripts[t.name];

                        // Add async & defer based on attribute values
                        rtEntry.scriptAttrs = (s.async ? ASYNC_ATTR : 0) | (s.defer ? DEFER_ATTR : 0);

                        while (s.nodeType === 1 && s.nodeName !== "BODY") {
                            s = s.parentNode;
                        }

                        // Add location by traversing up the tree until we either hit BODY or document
                        rtEntry.scriptAttrs |= (s.nodeName === "BODY" ? LOCAT_ATTR : 0);
                    }

                    // If this is a link, set its flags
                    if (t.initiatorType === "link" && links[t.name]) {
                        // split on ASCII whitespace
                        links[t.name].rel.split(/[\u0009\u000A\u000C\u000D\u0020]+/).find(function(rel) { //eslint-disable-line no-loop-func
                            // `rel`s are case insensitive
                            rel = rel.toLowerCase();

                            // only report the `rel` if it's from the known list
                            if (REL_TYPES[rel]) {
                                rtEntry.linkAttrs = REL_TYPES[rel];
                                return true;
                            }
                        });
                    }

                    frameFixedEntries.push(rtEntry);
                }

                entries = entries.concat(frameFixedEntries);
            }
            catch (e) {
                return entries;
            }

            return entries;
        }

        /**
         * Collect external resources by tagName
         *
         * @param [Element] a an anchor element
         * @param [Object] obj object of resources where the key is the url
         * @param [string] tagName tag name to collect
         */
        function collectResources(a, obj, tagName) {
            Array.prototype
                .forEach
                .call(a.ownerDocument.getElementsByTagName(tagName), function(r) {
                    // Get canonical URL
                    a.href = r.src || r.href;

                    // only get external resource
                    if (a.href.match(/^https?:\/\//)) {
                        obj[a.href] = r;
                    }
                });
        }

        /**
         * Converts a number to base-36.
         *
         * If not a number or a string, or === 0, return "". This is to facilitate
         * compression in the timing array, where "blanks" or 0s show as a series
         * of trailing ",,,," that can be trimmed.
         *
         * If a string, return a string.
         *
         * @param [number] n Number
         * @return Base-36 number, empty string, or string
         */
        function toBase36(n) {
            return (typeof n === "number" && n !== 0) ?
                n.toString(36) :
                (typeof n === "string" ? n : "");
        }

        /**
         * Finds all remote resources in the selected window that are visible, and returns an object
         * keyed by the url with an array of height,width,top,left as the value
         *
         * @param {Window} win Window to search
         * @param {number[]} [winDims] position and size of the window if it is an embedded iframe in the format returned by this function
         * @return {Object} Object with URLs of visible assets as keys, and Array[height, width, top, left, naturalHeight, naturalWidth] as value
         */
        function getVisibleEntries(win, winDims) {
            // lower-case tag names should be used: https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
            var els = ["img", "iframe", "image"], entries = {}, x, y, doc = win.document, a = doc.createElement("A");

            winDims = winDims || [0, 0, 0, 0];

            // https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollX
            // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
            x = winDims[3] + (win.pageXOffset !== undefined) ? win.pageXOffset : (doc.documentElement || doc.body.parentNode || doc.body).scrollLeft;
            y = winDims[2] + (win.pageYOffset !== undefined) ? win.pageYOffset : (doc.documentElement || doc.body.parentNode || doc.body).scrollTop;

            // look at each IMG and IFRAME
            els.forEach(function(elname) {
                var elements = doc.getElementsByTagName(elname), el, i, rect, src;

                for (i = 0; i < elements.length; i++) {
                    el = elements[i];

                    // look at this element if it has a src attribute or xlink:href, and we haven't already looked at it
                    if (el) {
                        // src = IMG, IFRAME
                        // xlink:href = svg:IMAGE
                        src = el.src || el.getAttribute("src") || el.getAttribute("xlink:href");

                        // change src to be relative
                        a.href = src;
                        src = a.href;

                        if (src && !entries[src]) {
                            rect = el.getBoundingClientRect();

                            // Require both height & width to be non-zero
                            // IE <= 8 does not report rect.height/rect.width so we need offsetHeight & width
                            if ((rect.height || el.offsetHeight) && (rect.width || el.offsetWidth)) {
                                entries[src] = [
                                    rect.height || el.offsetHeight,
                                    rect.width || el.offsetWidth,
                                    Math.round(rect.top + y),
                                    Math.round(rect.left + x)
                                ];

                                // If this is an image, it has a naturalHeight & naturalWidth
                                // if these are different from its display height and width, we should report that
                                // because it indicates scaling in HTML
                                if ((el.naturalHeight || el.naturalWidth) && (entries[src][0] !== el.naturalHeight || entries[src][1] !== el.naturalWidth)) {
                                    entries[src].push(el.naturalHeight, el.naturalWidth);
                                }
                            }
                        }
                    }
                }
            });

            return entries;
        }

        /**
         * Gathers a filtered list of performance entries.
         * @param [number] from Only get timings from
         * @param [number] to Only get timings up to
         * @param [string[]] initiatorTypes Array of initiator types
         * @return [ResourceTiming[]] Matching ResourceTiming entries
         */
        function getFilteredResourceTiming(from, to, initiatorTypes) {
            var entries = findPerformanceEntriesForFrame(BOOMR.window, true, 0, 0),
                i, e, results = {}, initiatorType, url, data,
                navStart = getNavStartTime(BOOMR.window), countCollector = {};

            if (!entries || !entries.length) {
                return {
                    entries: []
                };
            }

            // sort entries by start time
            entries.sort(function(a, b) {
                return a.startTime - b.startTime;
            });

            var filteredEntries = [];
            for (i = 0; i < entries.length; i++) {
                e = entries[i];

                // skip non-resource URLs
                if (e.name.indexOf("about:") === 0 ||
                    e.name.indexOf("javascript:") === 0 ||
                    e.name.indexOf("res:") === 0) {
                    continue;
                }

                // skip boomerang.js and config URLs
                if (e.name.indexOf(BOOMR.url) > -1 ||
                    e.name.indexOf(BOOMR.config_url) > -1 ||
                    (typeof BOOMR.getBeaconURL === "function" && BOOMR.getBeaconURL() && e.name.indexOf(BOOMR.getBeaconURL()) > -1)) {
                    continue;
                }

                // if the user specified a "from" time, skip resources that started before then
                if (from && (navStart + e.startTime) < from) {
                    continue;
                }

                // if we were given a final timestamp, don't add any resources that started after it
                if (to && (navStart + e.startTime) > to) {
                    // We can also break at this point since the array is time sorted
                    break;
                }

                // if given an array of initiatorTypes to include, skip anything else
                if (typeof initiatorTypes !== "undefined" && initiatorTypes !== "*" && initiatorTypes.length) {
                    if (!e.initiatorType || !BOOMR.utils.inArray(e.initiatorType, initiatorTypes)) {
                        continue;
                    }
                }

                accumulateServerTimingEntries(countCollector, e.serverTiming);
                filteredEntries.push(e);
            }

            var lookup = compressServerTiming(countCollector);
            return {
                entries: filteredEntries,
                serverTiming: {
                    lookup: lookup,
                    indexed: indexServerTiming(lookup)
                }
            };
        }

        /**
         * Gets compressed content and transfer size information, if available
         *
         * @param [ResourceTiming] resource ResourceTiming object
         *
         * @returns [string] Compressed data (or empty string, if not available)
         */
        function compressSize(resource) {
            var sTrans, sEnc, sDec, sizes;

            // check to see if we can add content sizes
            if (resource.encodedBodySize ||
                resource.decodedBodySize ||
                resource.transferSize) {
                //
                // transferSize: how many bytes were over the wire. It can be 0 in the case of X-O,
                // or if it was fetched from a cache.
                //
                // encodedBodySize: the size after applying encoding (e.g. gzipped size).  It is 0 if X-O.
                //
                // decodedBodySize: the size after removing encoding (e.g. the original content size).  It is 0 if X-O.
                //
                // Here are the possible combinations of values: [encodedBodySize, transferSize, decodedBodySize]
                //
                // Cross-Origin resources w/out Timing-Allow-Origin set: [0, 0, 0] -> [0, 0, 0] -> [empty]
                // 204: [0, t, 0] -> [0, t, 0] -> [e, t-e] -> [, t]
                // 304: [e, t: t <=> e, d: d>=e] -> [e, t-e, d-e]
                // 200 non-gzipped: [e, t: t>=e, d: d=e] -> [e, t-e]
                // 200 gzipped: [e, t: t>=e, d: d>=e] -> [e, t-e, d-e]
                // retrieved from cache non-gzipped: [e, 0, d: d=e] -> [e]
                // retrieved from cache gzipped: [e, 0, d: d>=e] -> [e, _, d-e]
                //
                sTrans = resource.transferSize;
                sEnc = resource.encodedBodySize;
                sDec = resource.decodedBodySize;

                // convert to an array
                sizes = [sEnc, sTrans ? sTrans - sEnc : "_", sDec ? sDec - sEnc : 0];

                // change everything to base36 and remove any trailing ,s
                return sizes.map(toBase36).join(",").replace(/,+$/, "");
            }
            else {
                return "";
            }
        }

        /* BEGIN_DEBUG */
        /**
         * Decompresses size information back into the specified resource
         *
         * @param [string] compressed Compressed string
         * @param [ResourceTiming] resource ResourceTiming object
         */
        function decompressSize(compressed, resource) {
            var split, i;

            if (typeof resource === "undefined") {
                resource = {};
            }

            split = compressed.split(",");

            for (i = 0; i < split.length; i++) {
                if (split[i] === "_") {
                    // special non-delta value
                    split[i] = 0;
                }
                else {
                    // fill in missing numbers
                    if (split[i] === "") {
                        split[i] = 0;
                    }

                    // convert back from Base36
                    split[i] = parseInt(split[i], 36);

                    if (i > 0) {
                        // delta against first number
                        split[i] += split[0];
                    }
                }
            }

            // fill in missing
            if (split.length === 1) {
                // transferSize is a delta from encodedSize
                split.push(split[0]);
            }

            if (split.length === 2) {
                // decodedSize is a delta from encodedSize
                split.push(split[0]);
            }

            // re-add attributes to the resource
            resource.encodedBodySize = split[0];
            resource.transferSize = split[1];
            resource.decodedBodySize = split[2];

            return resource;
        }

        /**
         * Decompress compressed timepoints into a timepoint object with painted and finalized pixel counts
         * @param {string} comp The compressed timePoint object returned by getOptimizedTimepoints
         * @return {object} An object in the form { <timePoint>: [ <pixel count>, <finalized pixel count>], ... }
         */
        function decompressTimePoints(comp) {
            var result = {}, timePoints, i, split, prevs = [0, 0, 0];

            timePoints = comp.split("!");

            for (i = 0; i < timePoints.length; i++) {
                split = timePoints[i]
                    .replace(/^~/, "Infinity~")
                    .replace("-", "~0~")
                    .split("~")
                    .map(function(v, j) {
                        v = (v === "Infinity" ? Infinity : parseInt(v, 36));

                        if (j === 2) {
                            v = prevs[1] - v;
                        }
                        else {
                            v = v + prevs[j];
                        }

                        prevs[j] = v;

                        return v;
                    });

                result[split[0]] = [ split[1], split[2] || split[1] ];
            }

            return result;
        }
        /* END_DEBUG */

        /**
         * Trims the URL according to the specified URL trim patterns,
         * then applies a length limit.
         *
         * @param {string} url URL to trim
         * @param {string} urlsToTrim List of URLs (strings or regexs) to trim
         * @return {string} Trimmed URL
         */
        function trimUrl(url, urlsToTrim) {
            var i, urlIdx, trim;

            if (url && urlsToTrim) {
                // trim the payload from any of the specified URLs
                for (i = 0; i < urlsToTrim.length; i++) {
                    trim = urlsToTrim[i];

                    if (typeof trim === "string") {
                        urlIdx = url.indexOf(trim);
                        if (urlIdx !== -1) {
                            url = url.substr(0, urlIdx + trim.length) + "...";
                            break;
                        }
                    }
                    else if (trim instanceof RegExp) {
                        if (trim.test(url)) {
                            // replace the URL with the first capture group
                            url = url.replace(trim, "$1") + "...";
                        }
                    }
                }
            }

            // apply limits
            return BOOMR.utils.cleanupURL(url, impl.urlLimit);
        }

        /**
         * Get the latest timepoint for this resource from ResourceTiming. If the resource hasn't started downloading yet, return Infinity
         * @param {PerformanceResourceEntry} res The resource entry to get the latest time for
         * @return {number} latest timepoint for the resource or now if the resource is still in progress
         */
        function getResourceLatestTime(res) {
            // If responseEnd is non zero, return it
            if (res.responseEnd) {
                return res.responseEnd;
            }

            // If responseStart is non zero, assume it accounts for 80% of the load time, and bump it by 20%
            if (res.responseStart && res.startTime) {
                return res.responseStart + (res.responseStart - res.startTime) * 0.2;
            }

            // If the resource hasn't even started loading, assume it will come at some point in the distant future (after the beacon)
            // we'll let the server determine what to do
            return Infinity;
        }

        /**
         * Given a 2D array representing the screen and a list of rectangular dimension tuples, turn on the screen pixels that match the dimensions.
         * Previously set pixels that are also set with the current call will be overwritten with the new value of pixelValue
         * @param {number[][]} currentPixels A 2D sparse array of numbers representing set pixels or undefined if no pixels are currently set.
         * @param {number[][]} dimList A list of rectangular dimension tuples in the form [height, width, top, left] for resources to be painted on the virtual screen
         * @param {number} pixelValue The numeric value to set all new pixels to
         * @return {number[][]} An updated version of currentPixels.
         */
        function mergePixels(currentPixels, dimList, pixelValue) {
            var s = BOOMR.window.screen,
                h = s.height, w = s.width;

            return dimList.reduce(
                function(acc, val) {
                    var x_min, x_max,
                        y_min, y_max,
                        x, y;

                    x_min = Math.max(0, val[3]);
                    y_min = Math.max(0, val[2]);
                    x_max = Math.min(val[3] + val[1], w);
                    y_max = Math.min(val[2] + val[0], h);

                    // Object is off-screen
                    if (x_min >= x_max || y_min >= y_max) {
                        return acc;
                    }

                    // We fill all pixels of this resource with a true
                    // this is needed to correctly account for overlapping resources
                    for (y = y_min; y < y_max; y++) {
                        if (!acc[y]) {
                            acc[y] = [];
                        }

                        for (x = x_min; x < x_max; x++) {
                            acc[y][x] = pixelValue;
                        }
                    }

                    return acc;
                },
                currentPixels || []
            );
        }

        /**
         * Counts the number of pixels that are set in the given 2D array representing the screen
         * @param {number[][]} pixels A 2D boolean array representing the screen with painted pixels set to true
         * @param {number} [rangeMin] If included, will only count pixels >= this value
         * @param {number} [rangeMax] If included, will only count pixels <= this value
         * @return {number} The number of pixels set in the passed in array
         */
        function countPixels(pixels, rangeMin, rangeMax) {
            rangeMin = rangeMin || 0;
            rangeMax = rangeMax || Infinity;

            return pixels
                .reduce(function(acc, val) {
                    return acc +
                        val.filter(function(v) {
                            return rangeMin <= v && v <= rangeMax;
                        }).length;
                },
                0
            );
        }

        /**
         * Returns a compressed string representation of a hash of timepoints to painted pixel count and finalized pixel count.
         * - Timepoints are reduced to milliseconds relative to the previous timepoint while pixel count is reduced to pixels relative to the previous timepoint. Finalized pixels are reduced to be relative (negated) to full pixels for that timepoint
         * - The relative timepoint and relative pixels are then each Base36 encoded and combined with a ~
         * - Finally, the list of timepoints is merged, separated by ! and returned
         * @param {object} timePoints An object in the form { "<timePoint>" : [ <object dimensions>, <object dimensions>, ...], <timePoint>: [...], ...}, where <object dimensions> is [height, width, top, left]
         * @return {string} The serialized compressed timepoint object with ! separating individual triads and ~ separating timepoint and pixels within the triad. The elements of the triad are the timePoint, number of pixels painted at that point, and the number of pixels finalized at that point (ie, no further paints). If the third part of the triad is 0, it is omitted, if the second part of the triad is 0, it is omitted and the repeated ~~ is replaced with a -
         */
        function getOptimizedTimepoints(timePoints) {
            var i, roundedTimePoints = {}, timeSequence, tPixels,
                t_prev, t, p_prev, p, f_prev, f,
                comp, result = [];

            // Round timepoints to the nearest integral ms
            timeSequence = Object.keys(timePoints);

            for (i = 0; i < timeSequence.length; i++) {
                t = Math.round(Number(timeSequence[i]));
                if (typeof roundedTimePoints[t] === "undefined") {
                    roundedTimePoints[t] = [];
                }

                // Merge
                Array.prototype.push.apply(roundedTimePoints[t], timePoints[timeSequence[i]]);
            }

            // Get all unique timepoints nearest ms sorted in ascending order
            timeSequence = Object.keys(roundedTimePoints).map(Number).sort(function(a, b) { return a - b; });

            if (timeSequence.length === 0) {
                return {};
            }

            // First loop identifies pixel first paints
            for (i = 0; i < timeSequence.length; i++) {
                t = timeSequence[i];
                tPixels = mergePixels(tPixels, roundedTimePoints[t], t);

                p = countPixels(tPixels);
                timeSequence[i] = [t, p];
            }

            // We'll make all times and pixel counts relative to the previous ones
            t_prev = 0;
            p_prev = 0;
            f_prev = 0;

            // Second loop identifies pixel final paints
            for (i = 0; i < timeSequence.length; i++) {
                t = timeSequence[i][0];
                p = timeSequence[i][1];
                f = countPixels(tPixels, 0, t);

                if (p > p_prev || f > f_prev) {
                    comp = (t === Infinity ? "" : toBase36(Math.round(t - t_prev))) + "~" + toBase36(p - p_prev) + "~" + toBase36(p - f);

                    comp = comp.replace(/~~/, "-").replace(/~$/, "");

                    result.push(comp);

                    t_prev = t;
                    p_prev = p;
                    f_prev = f;
                }
            }

            return result.join("!").replace(/!+$/, "");
        }

        /**
         * Gathers performance entries and compresses the result.
         * @param [number] from Only get timings from
         * @param [number] to Only get timings up to
         * @return An object containing the optimized performance entries trie and the optimized server timing lookup
         */
        function getCompressedResourceTiming(from, to) {
            /*eslint no-script-url:0*/
            var i, e, results = {}, initiatorType, url, data, timePoints = {};
            var ret = getFilteredResourceTiming(from, to, impl.trackedResourceTypes);
            var entries = ret.entries, serverTiming = ret.serverTiming;

            if (!entries || !entries.length) {
                return {
                    restiming: {},
                    servertiming: []
                };
            }

            for (i = 0; i < entries.length; i++) {
                e = entries[i];

                //
                // Compress the RT data into a string:
                //
                // 1. Start with the initiator type, which is mapped to a number.
                // 2. Put the timestamps into an array in a set order (reverse chronological order),
                //    which pushes timestamps that are more likely to be zero (duration since
                //    startTime) towards the end of the array (eg redirect* and domainLookup*).
                // 3. Convert these timestamps to Base36, with empty or zero times being an empty string
                // 4. Join the array on commas
                // 5. Trim all trailing empty commas (eg ",,,")
                //

                // prefix initiatorType to the string
                initiatorType = INITIATOR_TYPES[e.initiatorType];
                if (typeof initiatorType === "undefined") {
                    initiatorType = 0;
                }

                data = initiatorType + [
                    trimTiming(e.startTime, 0),
                    trimTiming(e.responseEnd, e.startTime),
                    trimTiming(e.responseStart, e.startTime),
                    trimTiming(e.requestStart, e.startTime),
                    trimTiming(e.connectEnd, e.startTime),
                    trimTiming(e.secureConnectionStart, e.startTime),
                    trimTiming(e.connectStart, e.startTime),
                    trimTiming(e.domainLookupEnd, e.startTime),
                    trimTiming(e.domainLookupStart, e.startTime),
                    trimTiming(e.redirectEnd, e.startTime),
                    trimTiming(e.redirectStart, e.startTime)
                ].map(toBase36).join(",").replace(/,+$/, ""); // this `replace()` removes any trailing commas

                // add content and transfer size info
                var compSize = compressSize(e);
                if (compSize !== "") {
                    data += SPECIAL_DATA_PREFIX + SPECIAL_DATA_SIZE_TYPE + compSize;
                }

                if (e.hasOwnProperty("scriptAttrs")) {
                    data += SPECIAL_DATA_PREFIX + SPECIAL_DATA_SCRIPT_ATTR_TYPE + e.scriptAttrs;
                }

                if (e.serverTiming && e.serverTiming.length) {
                    data += SPECIAL_DATA_PREFIX + SPECIAL_DATA_SERVERTIMING_TYPE +
                        e.serverTiming.reduce(function(stData, entry, entryIndex) {
                            // The numeric of the entry is `value` for Chrome 61, `duration` after that
                            var duration = String(typeof entry.duration !== "undefined" ? entry.duration : entry.value);
                            if (duration.substring(0, 2) === "0.") {
                                // lop off the leading 0
                                duration = duration.substring(1);
                            }
                            // The name of the entry is `metric` for Chrome 61, `name` after that
                            var name = entry.name || entry.metric;
                            var lookupKey = identifyServerTimingEntry(serverTiming.indexed[name].index,
                                serverTiming.indexed[name].descriptions[entry.description]);
                            stData += (entryIndex > 0 ? "," : "") + duration + lookupKey;
                            return stData;
                        }, "");
                }


                if (e.hasOwnProperty("linkAttrs")) {
                    data += SPECIAL_DATA_PREFIX + SPECIAL_DATA_LINK_ATTR_TYPE + e.linkAttrs;
                }

                url = trimUrl(e.name, impl.trimUrls);

                // if this entry already exists, add a pipe as a separator
                if (results[url] !== undefined) {
                    results[url] += "|" + data;
                }
                else if (e.visibleDimensions) {
                    // We use * as an additional separator to indicate it is not a new resource entry
                    // The following characters will not be URL encoded:
                    // *!-.()~_ but - and . are special to number representation so we don't use them
                    // After the *, the type of special data (ResourceTiming = 0) is added
                    results[url] =
                        SPECIAL_DATA_PREFIX +
                        SPECIAL_DATA_DIMENSION_TYPE +
                        e.visibleDimensions.map(Math.round).map(toBase36).join(",").replace(/,+$/, "") +
                        "|" +
                        data;
                }
                else {
                    results[url] = data;
                }

                if (e.visibleDimensions) {
                    if (!timePoints[e.latestTime]) {
                        timePoints[e.latestTime] = [];
                    }
                    timePoints[e.latestTime].push(e.visibleDimensions);
                }
            }

            return {
                restiming: optimizeTrie(convertToTrie(results), true),
                servertiming: serverTiming.lookup
            };
        }

        /**
         * Compresses an array of ResourceTiming-like objects (those with a fetchStart
         * and a responseStart/responseEnd) by reducing multiple objects with the same
         * fetchStart down to a single object with the longest duration.
         *
         * Array must be pre-sorted by fetchStart, then by responseStart||responseEnd
         *
         * @param [ResourceTiming[]] resources ResourceTiming-like resources, with just
         *  a fetchStart and responseEnd
         *
         * @returns Duration, in milliseconds
         */
        function reduceFetchStarts(resources) {
            var times = [];

            if (!resources || !resources.length) {
                return times;
            }

            for (var i = 0; i < resources.length; i++) {
                var res = resources[i];

                // if there is a subsequent resource with the same fetchStart, use
                // its value instead (since pre-sort guarantee is that it's end
                // will be >= this one)
                if (i !== resources.length - 1 &&
                    res.fetchStart === resources[i + 1].fetchStart) {
                    continue;
                }

                // track just the minimum fetchStart and responseEnd
                times.push({
                    fetchStart: res.fetchStart,
                    responseEnd: res.responseStart || res.responseEnd
                });
            }

            return times;
        }

        /**
         * Calculates the union of durations of the specified resources.  If
         * any resources overlap, those timeslices are not double-counted.
         *
         * @param [ResourceTiming[]] resources Resources
         *
         * @returns Duration, in milliseconds
         */
        function calculateResourceTimingUnion(resources) {
            var i;

            if (!resources || !resources.length) {
                return 0;
            }

            // First, sort by start time, then end time
            resources.sort(function(a, b) {
                if (a.fetchStart !== b.fetchStart) {
                    return a.fetchStart - b.fetchStart;
                }
                else {
                    var ae = a.responseStart || a.responseEnd;
                    var be = b.responseStart || b.responseEnd;

                    return ae - be;
                }
            });

            // Next, find all resources with the same start time, and reduce
            // them to the largest end time.
            var times = reduceFetchStarts(resources);

            // Third, for every resource, if the start is less than the end of
            // any previous resource, change its start to the end.  If the new start
            // time is more than the end time, we can discard this one.
            var times2 = [];
            var furthestEnd = 0;

            for (i = 0; i < times.length; i++) {
                var res = times[i];

                if (res.fetchStart < furthestEnd) {
                    res.fetchStart = furthestEnd;
                }

                // as long as this resource has > 0 duration, add it to our next list
                if (res.fetchStart < res.responseEnd) {
                    times2.push(res);

                    // keep track of the furthest end point
                    furthestEnd = res.responseEnd;
                }
            }

            // Reduce down again to same start times again, and now we should
            // have no overlapping regions
            var times3 = reduceFetchStarts(times2);

            // Finally, calculate the overall time from our non-overlapping regions
            var totalTime = 0;
            for (i = 0; i < times3.length; i++) {
                totalTime += times3[i].responseEnd - times3[i].fetchStart;
            }

            return totalTime;
        }

        /**
         * Adds 'restiming' and 'servertiming' to the beacon
         *
         * @param [number] from Only get timings from
         * @param [number] to Only get timings up to
         */
        function addResourceTimingToBeacon(from, to) {
            var r;

            // Can't send if we don't support JSON
            if (typeof JSON === "undefined") {
                return;
            }

            BOOMR.removeVar("restiming");
            BOOMR.removeVar("servertiming");
            r = getCompressedResourceTiming(from, to);
            if (r) {
                BOOMR.info("Client supports Resource Timing API", "restiming");
                addToBeacon(r);
            }
        }

        /**
         * Given an array of server timing entries (from the resource timing entry),
         * [initialize and] increment our count collector of the following format: {
         *   "metric-one": {
         *     count: 3,
         *     counts: {
         *       "description-one": 2,
         *       "description-two": 1,
         *     }
         *   }
         * }
         *
         * @param {Object} countCollector Per-beacon collection of counts
         * @param {Array} serverTimingEntries Server Timing Entries from a Resource Timing Entry
         * @returns nothing
         */
        function accumulateServerTimingEntries(countCollector, serverTimingEntries) {
            (serverTimingEntries || []).forEach(function(entry) {
                var name = entry.name || entry.metric;
                if (typeof countCollector[name] === "undefined") {
                    countCollector[name] = {
                        count: 0,
                        counts: {}
                    };
                }
                var metric = countCollector[name];
                metric.counts[entry.description] = metric.counts[entry.description] || 0;
                metric.counts[entry.description]++;
                metric.count++;
            });
        }

        /**
         * Given our count collector of the format: {
         *   "metric-two": {
         *     count: 1,
         *     counts: {
         *       "description-three": 1,
         *     }
         *   },
         *   "metric-one": {
         *     count: 3,
         *     counts: {
         *       "description-one": 1,
         *       "description-two": 2,
         *     }
         *   }
         * }
         *
         * , return the lookup of the following format: [
         *   ["metric-one", "description-two", "description-one"],
         *   ["metric-two", "description-three"],
         * ]
         *
         * Note: The order of these arrays of arrays matters: there are more server timing entries with
         * name === "metric-one" than "metric-two", and more "metric-one"/"description-two" than
         * "metric-one"/"description-one".
         *
         * @param {Object} countCollector Per-beacon collection of counts
         * @returns {Array} compressed lookup array
         */
        function compressServerTiming(countCollector) {
            return Object.keys(countCollector).sort(function(metric1, metric2) {
                return countCollector[metric2].count - countCollector[metric1].count;
            }).reduce(function(array, name) {
                var sorted = Object.keys(countCollector[name].counts).sort(function(description1, description2) {
                    return countCollector[name].counts[description2] -
                        countCollector[name].counts[description1];
                });

                array.push(sorted.length === 1 && sorted[0] === "" ?
                    name : // special case: no non-empty descriptions
                    [name].concat(sorted));
                return array;
            }, []);
        }

        /**
         * Given our lookup of the format: [
         *   ["metric-one", "description-one", "description-two"],
         *   ["metric-two", "description-three"],
         * ]
         *
         * , create a O(1) name/description to index values lookup dictionary of the format: {
         *   metric-one: {
         *     index: 0,
         *     descriptions: {
         *       "description-one": 0,
         *       "description-two": 1,
         *     }
         *   }
         *   metric-two: {
         *     index: 1,
         *     descriptions: {
         *       "description-three": 0,
         *     }
         *   }
         * }
         *
         * @param {Array} lookup compressed lookup array
         * @returns {Object} indexed version of the compressed lookup array
         */
        function indexServerTiming(lookup) {
            return lookup.reduce(function(serverTimingIndex, compressedEntry, entryIndex) {
                var name, descriptions;
                if (Array.isArray(compressedEntry)) {
                    name = compressedEntry[0];
                    descriptions = compressedEntry.slice(1).reduce(function(descriptionCollector, description, descriptionIndex) {
                        descriptionCollector[description] = descriptionIndex;
                        return descriptionCollector;
                    }, {});
                }
                else {
                    name = compressedEntry;
                    descriptions = {
                        "": 0
                    };
                }

                serverTimingIndex[name] = {
                    index: entryIndex,
                    descriptions: descriptions
                };
                return serverTimingIndex;
            }, {});
        }

        /**
         * Given entryIndex and descriptionIndex, create the shorthand key into the lookup
         * response format is ":<entryIndex>.<descriptionIndex>"
         * either/both entryIndex or/and descriptionIndex can be omitted if equal to 0
         * the "." can be ommited if descriptionIndex is 0
         * the ":" can be ommited if entryIndex and descriptionIndex are 0
         *
         * @param {Integer} entryIndex index of the entry
         * @param {Integer} descriptionIndex index of the description
         * @returns {String} key into the compressed lookup
         */
        function identifyServerTimingEntry(entryIndex, descriptionIndex) {
            var s = "";
            if (entryIndex) {
                s += entryIndex;
            }
            if (descriptionIndex) {
                s += "." + descriptionIndex;
            }
            if (s.length) {
                s = ":" + s;
            }
            return s;
        }

        /**
         * Adds optimized performance entries trie and (conditionally) the optimized server timing lookup to the beacon
         *
         * @param {Object} r An object containing the optimized performance entries trie and the optimized server timing
         *  lookup
         */
        function addToBeacon(r) {
            BOOMR.addVar("restiming", JSON.stringify(r.restiming));
            if (r.servertiming.length) {
                BOOMR.addVar("servertiming", BOOMR.utils.serializeForUrl(r.servertiming));
            }
        }

        /**
         * Given our lookup of the format: [
         *   ["metric-one", "description-one", "description-two"],
         *   ["metric-two", "description-three"],
         * ]
         *
         * , and a key of the format: duration:entryIndex.descriptionIndex,
         * return the decompressed server timing entry (name, duration, description)
         *
         * Note: code only included as POC
         *
         * @param {Array} lookup compressed lookup array
         * @param {Integer} key key into the compressed lookup
         * @returns {Object} decompressed resource timing entry (name, duration, description)
         */
        /* BEGIN_DEBUG */
        function decompressServerTiming(lookup, key) {
            var split = key.split(":");
            var duration = Number(split[0]);
            var entryIndex = 0, descriptionIndex = 0;

            if (split.length > 1) {
                var identity = split[1].split(".");
                if (identity[0] !== "") {
                    entryIndex = Number(identity[0]);
                }
                if (identity.length > 1) {
                    descriptionIndex = Number(identity[1]);
                }
            }

            var name, description = "";
            if (Array.isArray(lookup[entryIndex])) {
                name = lookup[entryIndex][0];
                description = lookup[entryIndex][1 + descriptionIndex] || "";
            }
            else {
                name = lookup[entryIndex];
            }

            return {
                name: name,
                duration: duration,
                description: description
            };
        }
        /* END_DEBUG */

        impl = {
            complete: false,
            sentNavBeacon: false,
            initialized: false,
            supported: null,
            xhr_load: function() {
                if (this.complete) {
                    return;
                }

                // page load might not have happened, or will happen later, so
                // set us as complete so we don't hold the page load
                this.complete = true;
                BOOMR.sendBeacon();
            },
            xssBreakWords: DEFAULT_XSS_BREAK_WORDS,
            urlLimit: DEFAULT_URL_LIMIT,
            clearOnBeacon: false,
            trimUrls: [],
            /**
             * Array of resource types to track, or "*" for all.
             *  @type {string[]|string}
             */
            trackedResourceTypes: "*",
            serverTiming: true,
            done: function() {
                // Stop if we've already sent a nav beacon (both xhr and spa* beacons
                // add restiming manually).
                if (this.sentNavBeacon) {
                    return;
                }

                addResourceTimingToBeacon();

                this.complete = true;
                this.sentNavBeacon = true;

                BOOMR.sendBeacon();
            },

            onBeacon: function(vars) {
                var p = BOOMR.getPerformance();

                // clear metrics
                if (vars.hasOwnProperty("restiming")) {
                    BOOMR.removeVar("restiming");
                }
                if (vars.hasOwnProperty("servertiming")) {
                    BOOMR.removeVar("servertiming");
                }

                if (impl.clearOnBeacon && p) {
                    var clearResourceTimings = p.clearResourceTimings || p.webkitClearResourceTimings;
                    if (clearResourceTimings && typeof clearResourceTimings === "function") {
                        clearResourceTimings.call(p);
                    }
                }
            },

            prerenderToVisible: function() {
                // ensure we add our data to the beacon even if we had added it
                // during prerender (in case another beacon went out in between)
                this.sentNavBeacon = false;

                // add our data to the beacon
                this.done();
            }
        };

        BOOMR.plugins.ResourceTiming = {
            init: function(config) {
                BOOMR.utils.pluginConfig(impl, config, "ResourceTiming",
                    ["xssBreakWords", "clearOnBeacon", "urlLimit", "trimUrls", "trackedResourceTypes", "serverTiming"]);

                if (impl.initialized) {
                    return this;
                }

                if (this.is_supported()) {
                    BOOMR.subscribe("page_ready", impl.done, null, impl);
                    BOOMR.subscribe("prerender_to_visible", impl.prerenderToVisible, null, impl);
                    BOOMR.subscribe("xhr_load", impl.xhr_load, null, impl);
                    BOOMR.subscribe("onbeacon", impl.onBeacon, null, impl);
                    BOOMR.subscribe("before_unload", impl.done, null, impl);
                }
                else {
                    impl.complete = true;
                }

                impl.initialized = true;

                return this;
            },
            is_complete: function() {
                return true;
            },
            is_enabled: function() {
                return impl.initialized && this.is_supported();
            },
            is_supported: function() {
                var p;

                if (impl.supported !== null) {
                    return impl.supported;
                }

                // check for getEntriesByType and the entry type existing
                var p = BOOMR.getPerformance();
                impl.supported = p &&
                    typeof p.getEntriesByType === "function" &&
                    typeof window.PerformanceResourceTiming !== "undefined";

                return impl.supported;
            },
            //
            // Public Exports
            //
            getCompressedResourceTiming: getCompressedResourceTiming,
            getFilteredResourceTiming: getFilteredResourceTiming,
            calculateResourceTimingUnion: calculateResourceTimingUnion,
            addResourceTimingToBeacon: addResourceTimingToBeacon,
            addToBeacon: addToBeacon

            //
            // Test Exports (only for debug)
            //
            /* BEGIN_DEBUG */,
            trimTiming: trimTiming,
            convertToTrie: convertToTrie,
            optimizeTrie: optimizeTrie,
            findPerformanceEntriesForFrame: findPerformanceEntriesForFrame,
            toBase36: toBase36,
            getVisibleEntries: getVisibleEntries,
            reduceFetchStarts: reduceFetchStarts,
            compressSize: compressSize,
            decompressSize: decompressSize,
            trimUrl: trimUrl,
            getResourceLatestTime: getResourceLatestTime,
            mergePixels: mergePixels,
            countPixels: countPixels,
            getOptimizedTimepoints: getOptimizedTimepoints,
            decompressTimePoints: decompressTimePoints,
            accumulateServerTimingEntries: accumulateServerTimingEntries,
            compressServerTiming: compressServerTiming,
            indexServerTiming: indexServerTiming,
            identifyServerTimingEntry: identifyServerTimingEntry,
            decompressServerTiming: decompressServerTiming,
            SPECIAL_DATA_PREFIX: SPECIAL_DATA_PREFIX,
            SPECIAL_DATA_DIMENSION_TYPE: SPECIAL_DATA_DIMENSION_TYPE,
            SPECIAL_DATA_SIZE_TYPE: SPECIAL_DATA_SIZE_TYPE,
            SPECIAL_DATA_SCRIPT_ATTR_TYPE: SPECIAL_DATA_SCRIPT_ATTR_TYPE,
            SPECIAL_DATA_LINK_ATTR_TYPE: SPECIAL_DATA_LINK_ATTR_TYPE,
            ASYNC_ATTR: ASYNC_ATTR,
            DEFER_ATTR: DEFER_ATTR,
            LOCAT_ATTR: LOCAT_ATTR,
            INITIATOR_TYPES: INITIATOR_TYPES,
            REL_TYPES: REL_TYPES
            /* END_DEBUG */
        };

    }());

    /**
     * The Continuity plugin measures performance and user experience metrics beyond
     * the traditional Page Load timings.
     *
     * ## Approach
     *
     * The goal of the Continuity plugin is to capture the important aspects of your
     * visitor's overall _user experience_ during page load and beyond.  For example, the
     * plugin measures when the site appeared _Visually Ready_, and when it was _Interactive_.
     *
     * In addition, the Continuity plugin captures in-page interactions (such as keys,
     * clicks and scrolls), and monitors how the site performed when responding to
     * these inputs.
     *
     * Finally, the Continuity plugin is utilizing cutting-edge browser
     * performance APIs like [LongTasks](https://w3c.github.io/longtasks/) to get
     * important insights into how the browser is performing.
     *
     * Here is some of the data that the Continuity plugin captures:
     *
     * * Timers:
     *     * **Time to Visually Ready**: When did the user feel like they could interact
     *         with the site?  When did it look ready? (see below for details)
     *     * **Time to Interactive**: After the page was Visually Ready, when was the
     *         first time the user could have interacted with the site, and had a
     *         good (performant) experience? (see below for details)
     *     * **Time to First Interaction**: When was the first time the user tried to
     *         interact (key, click or scroll) with the site?
     * * Interaction metrics:
     *     * **Interactions**: keys, clicks, scrolls: counts and event log
     *     * **Delayed Interactions**: How often was the user's interaction delayed more than 50ms?
     *     * **Rage Clicks**: When the user repeatedly clicked on the same element/region
     * * Page performance metrics:
     *     * **Framerate data**: FPS during page load, minimum FPS, number of long frames
     *     * **LongTask data**: Number of LongTasks, how much time they took, attribution
     *         to what caused them
     *     * **Page Busy**: Measurement of the page's busyness
     *
     * This data is captured during the page load, as well as when the user is later
     * interacting with the site.  The data is reported on at regular intervals, so you
     * can see how it changes over time.
     *
     * If configured, the Continuity plugin can send additional beacons after a page
     * interaction happens.
     *
     * ## Configuration
     *
     * The `Continuity` plugin has a variety of options to configure what it does (and
     * what it doesn't do):
     *
     * ### Monitoring Long Tasks
     *
     * If `monitorLongTasks` is turned on, the Continuity plugin will monitor
     * [LongTasks](https://w3c.github.io/longtasks/) (if the browser supports it).
     *
     * LongTasks are tasks on the browser's UI thread that monopolize it and block other
     * critical tasks from being executed (e.g. reacting to user input).  LongTasks
     * can caused by anything from JavaScript execution to parsing to layout.  The browser
     * fires LongTask events (via the `PerformanceObserver`) when a task takes over 50
     * milliseconds to execute.
     *
     * LongTasks are important to measure as a LongTask will block all other user input
     * (e.g. clicks, keys and scrolls).
     *
     * LongTasks are powerful because they can give _attribution_ about what component
     * caused the task, i.e. the source JavaScript file.
     *
     * If `monitorLongTasks` is enabled:
     *
     * * A `PerformanceObserver` will be turned on to capture all LongTasks that happen
     *     on the page.
     * * LongTasks will be used to calculate _Time to Interactive_
     * * A log (`c.lt`), timeline (`c.t.lt`) and other LongTasks metrics (`c.lt.*`) will
     *     be added to the beacon (see details below)
     *
     * The log `c.lt` is a JSON (or JSURL) object of compressed LongTask data.  See
     * the source code for what each attribute maps to.
     *
     * LongTasks are currently a cutting-edge browser feature and will not be available
     * in older browsers.
     *
     * ### Monitoring Page Busy
     *
     * If `monitorPageBusy` is turned on, the Continuity plugin will measure Page Busy.
     *
     * Page Busy is a way of measuring how much work was being done on the page (how "busy"
     * it was).  Page Busy is calculated via `setTimout()` polling: a timeout is scheduled
     * on the page at a regular interval, and _busyness_ is detected if that timeout does
     * not fire at the time it was expected to.
     *
     * Page Busy is a percentage -- 100% means that the browser was entirely busy doing other
     * things, while 0% means the browser was idle.
     *
     * Page Busy is _just an estimate_, as it uses sampling.  As an example, if you have
     * a high number of small tasks that execute frequently, Page Busy might run at
     * a frequency that it either detects 100% (busy) or 0% (idle).
     *
     * Page Busy is not the most efficient way of measuring what the browser is doing,
     * but since it is calculated via `setTimeout()`, it is supported in all browsers.
     * The Continuity plugin currently measures Page Busy by polling every 25 milliseconds.
     *
     * Page Busy can be an indicator of how likely the user will have a good experience
     * when they interact with it. If Page Busy is 100%, the user may see the page lag
     * behind their input.
     *
     * If `monitorPageBusy` is enabled:
     *
     * * The Page Busy monitor will be active (polling every 25 milliseconds) (unless
     *     LongTasks is supported and enabled)
     * * Page Busy will be used to calculate _Time to Interactive_
     * * A timeline (`c.t.busy`) and the overall Page Busy % (`c.b`) will be added to the
     *     beacon (see details below)
     *
     * ### Monitoring Frame Rate
     *
     * If `monitorFrameRate` is turned on, the Continuity plugin will measure the Frame
     * Rate of the page via
     * [`requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame).
     *
     * `requestAnimationFrame` is a browser API that can be used to schedule animations
     * that run at the device's refresh rate.  It can also be used to measure how many
     * frames were actually delivered to the screen, which can be an indicator of how
     * good the user's experience is.
     *
     * `requestAnimationFrame` is available in
     * [all modern browsers](https://caniuse.com/#feat=requestanimationframe).
     *
     * If `monitorFrameRate` is enabled:
     *
     * * `requestAnimationFrame` will be used to measure Frame Rate
     * * Frame Rate will be used to calculate _Time to Interactive_
     * * A timeline (`c.t.fps`) and many Frame Rate metrics (`c.f.*`) will be added to the
     *     beacon (see details below)
     *
     * ### Monitoring Interactions`
     *
     * If `monitorInteractions` is turned on, the Continuity plugin will measure user
     * interactions during the page load and beyond.
     *
     * Interactions include:
     *
     * * Mouse Clicks
     *     * Rage Clicks: Clicks to the same area repeatedly
     * * Mouse Movement (will not send a beacon or be used for TTFI calculation)
     * * Keyboard Presses (individual key codes are not captured)
     * * Scrolls
     *     * Distinct Scrolls: Scrolls that happened over 2 seconds since the last scroll
     * * Page Visibility changes
     * * Orientation changes
     *
     * These interactions are monitored and instrumented throughout the page load.  By using
     * the event's `timeStamp`, we can detect how long it took for the physical event (e.g.
     * mouse click) to execute the JavaScript listening handler (in the Continuity plugin).
     * If there is a delay, this is tracked as an _Interaction Delay_.  Interaction Delays
     * can be an indicator that the user is having a degraded experience.
     *
     * In addition, if `afterOnload` is enabled, these interactions (except Mouse Movements)
     * can also trigger an `interaction` beacon after the Page Load.  `afterOnloadMaxLength`
     * can be used to control how many milliseconds after Page Load interactions will be
     * measured for.
     *
     * After a post-Load interaction occurs, the plugin will wait for `afterOnloadMinWait`
     * milliseconds before sending the `interaction` beacon.  If another interaction
     * happens within that timeframe, the plugin will wait another `afterOnloadMinWait`
     * milliseconds.  This is to ensure that groups of interactions will be batched
     * together.  The plugin will wait up to 60 seconds to batch groups of interactions
     * together, at which point a beacon will be sent immediately.
     *
     * If `monitorInteractions` is enabled:
     *
     * * Event handlers will be added to monitor clicks, keys, etc.
     * * A log and many interaction metrics (`c.f.*`) will be added to the
     *     beacon (see details below)
     *
     * For `interaction` beacons, the following will be set:
     *
     * * `rt.tstart` will be the timestamp of the first interaction
     * * `rt.end` will be the timestamp of the last interaction
     * * `rt.start = 'manual'`
     * * `http.initiator = 'interaction'`
     *
     * ### Monitoring Page Statistics
     *
     * If `monitorStats` is turned on, the Continuity plugin will measure statistics
     * about the page and browser over time.
     *
     * These statistics include:
     *
     * * Memory Usage: `usedJSHeapSize` (Chrome-only)
     * * [Battery Level](https://developer.mozilla.org/en-US/docs/Web/API/Battery_Status_API)
     * * DOM Size: Number of bytes of HTML in the root frame
     * * DOM Length: Number of DOM nodes in the root frame
     * * Mutations: How often and how much the page is changing
     *
     * If `monitorInteractions` is enabled:
     *
     * * Events and polls will be setup to monitor the above statistics
     * * A timeline (`c.t.*`) of these statistics will be added to the beacon (see
     *     details below)
     *
     * ## New Timers
     *
     * There are 3 new timers from the Continuity plugin that center around user
     * interactions:
     *
     * * **Time to Visually Ready** (VR)
     * * **Time to Interactive** (TTI)
     * * **Time to First Interaction** (TTFI)
     *
     * _Time to Interactive_ (TTI), at it's core, is a measurement (timestamp) of when the
     * page was interact-able. In other words, at what point does the user both believe
     * the page could be interacted with, and if they happened to try to interact with
     * it then, would they have a good experience?
     *
     * To calculate Time to Interactive, we need to figure out two things:
     *
     * * Does the page appear to the visitor to be interactable?
     *     * We'll use one or more Visually Ready Signals to determine this
     * * If so, what's the first time a user could interact with the page and have a good
     *     experience?
     *     * We'll use several Time to Interactive Signals to determine this
     *
     * ### Visually Ready
     *
     * For the first question, "does the page appear to be interactable?", we need to
     * determine when the page would _look_ to the user like they _could_ interact with it.
     *
     * It's only after this point that TTI could happen. Think of Visually Ready (VR) as
     * the anchor point of TTI -- it's the earliest possible timestamp in the page's
     * lifecycle that TTI could happen.
     *
     * We have a few signals that might be appropriate to use as Visually Ready:
     * * First Paint (if available)
     *     * We should wait at least for the first pain on the page
     *     * i.e. IE's [`msFirstPaint`](https://msdn.microsoft.com/en-us/library/ff974719)
     *         or Chrome's `firstPaintTime`
     *     * These might just be paints of white, so they're not the only signal we should use
     * * [domContentLoadedEventEnd](https://msdn.microsoft.com/en-us/library/ff974719)
     *     * "The DOMContentLoaded event is fired when the initial HTML document has been
     *         completely loaded and parsed, without waiting for stylesheets, images, and subframes to finish loading"
     *     * This happens after `domInteractive`
     *     * Available in NavigationTiming browsers via a timestamp and all other
     *         browser if we're on the page in time to listen for readyState change events
     * * Hero Images (if defined)
     *     * Instead of tracking all Above-the-Fold images, it could be useful to know
     *         which specific images are important to the site owner
     *     * Defined via a simple CSS selector (e.g. `.hero-images`)
     *     * Can be measured via ResourceTiming
     * * "My Framework is Ready" (if defined)
     *     * A catch-all for other things that we can't automatically track
     *     * This would be an event or callback from the page author saying their page is ready
     *     * They could fire this for whatever is important to them, i.e. when their page's
     *         click handlers have all registered
     *     * Once the last of all of the above have happened, Visually Ready has occurred.
     *
     * Visually Ready will add `c.tti.vr` to the beacon.
     *
     * #### Controlling Visually Ready via Framework Ready
     *
     * There are two additional options for controlling when Visually Ready happens: via Framework Ready or Hero Images.
     *
     * If you want to wait for your framework to be ready (e.g. your SPA has loaded or
     * a button has a click handler registered), you can add an option `ttiWaitForFrameworkReady`.
     *
     * Once enabled, TTI won't be calculated until the following is called:
     *
     * ```
     * // my framework is ready
     * if (BOOMR && BOOMR.plugins && BOOMR.plugins.Continuity) {
     *     BOOMR.plugins.Continuity.frameworkReady();
     * }
     * ```
     *
     * #### Controlling Visually Ready via Hero Images
     *
     * If you want to wait for your hero/main images to be loaded before Visually Ready
     * is measured, you can give the plugin a CSS selector via `ttiWaitForHeroImages`.
     * If set, Visually Ready will be delayed until all IMGs that match that selector
     * have loaded, e.g.:
     *
     * ```
     * window.BOOMR_config = {
     *   Continuity: {
     *     enabled: true,
     *     ttiWaitForHeroImages: ".hero-image"
     *   }
     * };
     * ```
     *
     * Note this only works in ResourceTiming-supported browsers (and won't be used in
     * older browsers).
     *
     * ### Time to Interactive
     *
     * After the page is Visually Ready for the user, if they were to try to interact
     * with the page (click, scroll, type), when would they have a good experience (i.e.
     * the page responded in a satisfactory amount of time)?
     *
     * We can use some of the signals below, when available:
     *
     * * FPS
     *     * Available in all modern browsers: by using `requestAnimationFrame` we can
     *         get a sense of the overall framerate (FPS)
     *     * To ensure a "smooth" page load experience, ideally the page should never drop
     *         below 20 FPS.
     *     * 20 FPS gives about 50ms of activity to block the main thread at any one time
     * * LongTasks
     *     * Via the PerformanceObserver, fires LongTasks events any time the main thread
     *         was blocked by a task that took over 50ms such as JavaScript, layout, etc
     *     * Great indicator both that the page would not have been interact-able and
     *         in some cases, attribution as to why
     * * Page Busy via `setTimeout`
     *     * By measuring how long it takes for a regularly-scheduled callback to fire,
     *         we can detect other tasks that got in the way
     *     * Can give an estimate for Page Busy Percentage (%)
     *     * Available in every browser
     *
     * The `waitAfterOnload` option will delay the beacon for up to that many milliseconds
     * if Time to Interactive doesn't happen by the browser's `load` event.  You shouldn't
     * set it too high, or the likelihood that the page load beacon will be lost increases.
     * If `waitAfterOnload` is reached and TTI hasn't happened yet, the beacon will be
     * sent immediately (missing the TTI timer).
     *
     * If you set `waitAfterOnload` to `0` (or it's not set), Boomerang will send the
     * beacon at the regular page load event.  If TTI didn't yet happen, it won't be reported.
     *
     * If you want to set `waitAfterOnload`, we'd recommend between `1000` and `5000`
     * (1 and 5 seconds).
     *
     * Time to Interaction will add `c.tti` to the beacon.
     *
     * #### Algorithm
     *
     * Putting these two timers together, here's how we measure Visually Ready and
     * Time to Interactive:
     *
     * 1. Determine the highest Visually Ready timestamp (VRTS):
     *     * First Paint (if available)
     *     * `domContentLoadedEventEnd`
     *     * Hero Images are loaded (if configured)
     *     * Framework Ready (if configured)
     *
     * 2. After VRTS, calculate Time to Interactive by finding the first period of
     *     500ms where all of the following are true:
     *     * There were no LongTasks
     *     * The FPS was always above 20 (if available)
     *     * Page Busy was less than 10% (if the above aren't available)
     *
     * ### Time to First Interaction
     *
     * Time to First Interaction (TTFI) is the first time a user interacted with the
     * page.  This may happen during or after the page's `load` event.
     *
     * Time to First Interaction will add `c.ttfi` to the beacon.
     *
     * ## Timelines
     *
     * If `sendTimeline` is enabled, many of the above options will add bucketed
     * "timelines" to the beacon.
     *
     * The Continuity plugin keeps track of statistics, interactions and metrics over time
     * by keeping track of these counts at a granularity of 100-millisecond intervals.
     *
     * As an example, if you are measuring LongTasks, its timeline will have entries
     * whenever a LongTask occurs.
     *
     * Not every timeline will have data for every interval.  As an example, the click
     * timeline will be sparse except for the periods where there was a click.  Statistics
     * like DOM Size are captured only once every second.  The Continuity plugin is
     * optimized to use as little memory as possible for these cases.
     *
     * ### Compressed Timeline Format
     *
     * If `sendTimeline` is enabled, the Continuity plugin will add several timelines
     * as `c.t.[name]` to the beacon in a compressed format.
     *
     * An example timeline may look like this:
     *
     * ```
     * c.t.fps      = 03*a*657576576566766507575*8*65
     * c.t.domsz    = 11o3,1o4
     * c.t.mousepct = 2*5*0053*4*00050718
     * ```
     *
     * The format of the compressed timeline is as follows:
     *
     * `[Compression Type - 1 character][Data - everything else]`
     *
     * * Compression Type is a single character that denotes how each timeline's bucket
     *     numbers are compressed:
     *     * `0` (for smaller numbers):
     *         * Each number takes a single character, encoded in Base-64
     *         * If a number is >= 64, the number is converted to Base-36 and wrapped in
     *             `.` characters
     *     * `1` (for larger numbers)
     *         * Each number is separated by `,`s
     *         * Each number is encoded in Base-36
     *     * `2` (for percentages)
     *         * Each number takes two characters, encoded in Base-10
     *         * If a number is <= 0, it is `00`
     *         * If a number is >= 100, it is `__`
     *
     * In addition, for repeated numbers, the format is as follows:
     *
     * `*[Repeat Count]*[Number]`
     *
     * Where:
     *
     * * Repeat Count is encoded Base-36
     * * Number is encoded per the rules above
     *
     * From the above example, the data would be decompressed to:
     *
     * ```
     * c.t.fps =
     *     [3, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 7, 5, 7, 6, 5, 7, 6, 5, 6, 6, 7, 6,
     *     6, 5, 0, 7, 5, 7, 5, 6, 6, 6, 6, 6, 6, 6, 6, 5];
     *
     * c.t.domsz = [2163, 2164];
     *
     * c.t.mousepct = [0, 0, 0, 0, 0, 53, 0, 5, 7, 18];
     * ```
     *
     * The timeline can be decompressed via `BOOMR.plugins.Continuity.decompressBucketLog`
     * (for debug builds).
     *
     * The Continuity Epoch (`c.e`) and Continuity Last Beacon (`c.lb`) are timestamps
     * (Base-36) that indicate what timestamp the first bucket represents.  If both are
     * given, the Last Beacon timestamp should be used.
     *
     * For example:
     *
     * ```
     * c.e=j5twmlbv       // 1501611350395
     * c.lb=j5twmlyk      // 1501611351212
     * c.t.domsz=11o3,1o4 // 2163, 2164 using method 1
     * ```
     *
     * In the above example, the first value of `2163` (`1o3` Base-36) happened
     * at `1501611351212`.  The second value of `2164` (`1o4` Base-36) happened
     * at `1501611351212 + 100 = 1501611351312`.
     *
     * For all of the available timelines, see the Beacon Parameters list below.
     *
     * ## Logs
     *
     * If `sendLog` is enabled, the Continuity plugin will add a log to the beacon as
     * `c.l`.
     *
     * The following events will generate a Log entry with the listed parameters:
     *
     * * Scrolls (type `0`):
     *     * `y`: Y pixels
     * * Clicks (type `1`):
     *     * `x`: X pixels
     *     * `y`: Y pixels
     * * Mouse Movement (type `2`):
     *     * Data is captured at minimum 10 pixel granularity
     *     * `x`: X pixels
     *     * `y`: Y pixels
     * * Keyboard presses (type `3`):
     *     * (no data is captured)
     * * Visibility Changes (type `4`):
     *     * `s`
     *         * `0`: `visible`
     *         * `1`: `hidden`
     *         * `2`: `prerender`
     *         * `3`: `unloaded`
     * * Orientation Changes (type `5`):
     *     * `a`: Angle
     *
     * The log is put on the beacon in a compressed format.  Here is an example log:
     *
     * ```
     * c.l=214y,xk9,y8p|142c,xk5,y8v|34kh
     * ```
     *
     * The format of the compressed timeline is as follows:
     *
     * ```
     * [Type][Timestamp],[Param1 type][Param 1 value],[... Param2 ...]|[... Event2 ...]
     * ```
     *
     * * Type is a single character indicating what type of event it is, per above
     * * Timestamp (`navigationStart` epoch) is Base-36 encoded
     * * Each parameter follows, separated by commas:
     *     * The first character indicates the type of parameter
     *     * The subsequent characters are the value of the parameter, Base-36 encoded
     *
     * From the above example, the data would be decompressed to:
     *
     * ```
     * [
     *     {
     *         "type": "mouse",
     *         "time": 1474,
     *         "x": 729,
     *         "y": 313
     *     },
     *     {
     *         "type": "click",
     *         "time": 5268,
     *         "x": 725,
     *         "y": 319
     *     },
     *     {
     *         "type": "key",
     *         "time": 5921,
     *     }
     * ]
     * ```
     *
     * The timeline can be decompressed via `BOOMR.plugins.Continuity.decompressLog`
     * (for debug builds).
     *
     * ## Beacon Parameters
     *
     * The following parameters will be added to the beacon:
     *
     * * `c.e`: Continuity Epoch timestamp (when everything started measuring) (Base-36)
     * * `c.l`: Log (compressed)
     * * `c.lt`: LongTask data (compressed)
     * * `c.lt.n`: Number of LongTasks (Base-10)
     * * `c.lt.tt`: Total duration of LongTasks (Base-10)
     * * `c.b`: Page Busy percentage (Base-10)
     * * `c.t.fps`: Frame Rate timeline (compressed)
     * * `c.t.inter`: Interactions timeline (compressed)
     * * `c.t.interdly`: Delayed Interactions timeline (compressed)
     * * `c.t.key`: Keyboard press timeline (compressed)
     * * `c.t.click`: Click timeline (compressed)
     * * `c.t.mouse`: Mouse movements timeline (compressed)
     * * `c.t.mousepct`: Mouse movement percentage (of full screen) timeline (compressed)
     * * `c.t.mem`: Memory usage timeline (compressed)
     * * `c.t.domsz`: DOM Size timeline (compressed)
     * * `c.t.domln`: DOM Length timeline (compressed)
     * * `c.t.mut`: DOM Mutations timeline (compressed)
     * * `c.tti.vr`: Visually Ready (Base-10)
     * * `c.tti`: Time to Interactive (Base-10)
     * * `c.f`: Average Frame Rate over the Frame Rate Duration (Base-10)
     * * `c.f.d`: Frame Rate duration (how long it has been measuring) (Base-10)
     * * `c.f.m`: Minimum Frame Rate (Base-10)
     * * `c.f.l`: Number of Long Frames (>= 50ms) (Base-10)
     * * `c.f.s`: Frame Rate measurement start time (Base-36)
     * * `c.k`: Keyboard event count (Base-10)
     * * `c.k.e`: Keyboard ESC count (Base-10)
     * * `c.c`: Click count (Base-10)
     * * `c.c.r`: Rage click count (Base-10)
     * * `c.m.p`: Mouse movement percentage (Base-10)
     * * `c.m.n`: Mouse movement pixels (Base-10)
     * * `c.ttfi`: Time to First Interactive (Base-10)
     * * `c.i.dc`: Delayed interaction count (Base-10)
     * * `c.i.dt`: Delayed interaction time (Base-10)
     * * `c.i.a`: Average Interaction delay (Base-10)
     * * `c.lb`: Last Beacon timestamp (Base-36)
     * * `c.s`: Scroll count (Base-10)
     * * `c.s.p`: Scroll percentage (Base-10)
     * * `c.s.y`: Scroll y (pixels) (Base-10)
     * * `c.s.d`: Distinct scrolls (scrolls that happen 2 seconds after the last) (Base-10)
     */
    // TODO: Limit max timeline and log?
    (function() {
        BOOMR = UW.BOOMR || {};

        BOOMR.plugins = BOOMR.plugins || {};

        if (BOOMR.plugins.Continuity) {
            return;
        }

        //
        // Constants available to all Continuity classes
        //
        /**
         * Timeline collection interval
         */
        var COLLECTION_INTERVAL = 100;

        /**
         * Maximum length (ms) that events will be recorded, if not
         * a SPA.
         */
        var DEFAULT_AFTER_ONLOAD_MAX_LENGTH = 60000;

        /**
         * Time to Interactive polling period (after onload, how often we'll
         * check to see if TTI fired yet)
         */
        var TIME_TO_INTERACTIVE_WAIT_POLL_PERIOD = 500;

        /**
         * Compression Modes
         */

        /**
         * Most numbers are expected to be 0-63, though larger numbers are
         * allowed.
         */
        var COMPRESS_MODE_SMALL_NUMBERS = 0;

        /**
         * Most numbers are expected to be larger than 63.
         */
        var COMPRESS_MODE_LARGE_NUMBERS = 1;

        /**
         * Numbers are from 0 to 100
         */
        var COMPRESS_MODE_PERCENT = 2;

        /**
         * Log types
         */
        var LOG_TYPE_SCROLL = 0;
        var LOG_TYPE_CLICK = 1;
        var LOG_TYPE_MOUSE = 2;
        var LOG_TYPE_KEY = 3;
        var LOG_TYPE_VIS = 4;
        var LOG_TYPE_ORIENTATION = 5;

        /**
         * Base64 number encoding
         */
        var BASE64_NUMBER = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";

        /**
         * Large number delimiter (.)
         *
         * For COMPRESS_MODE_SMALL_NUMBERS, numbers larger than 63 are wrapped in this
         * character.
         */
        var LARGE_NUMBER_WRAP = ".";

        // Performance object
        var p = window.performance;

        // Metrics that will be exported
        var externalMetrics = {};

        /**
         * Epoch - when to base all relative times from.
         *
         * If the browser supports NavigationTiming, this is navigationStart.
         *
         * If not, just use 'now'.
         */
        var epoch = p.timing.navigationStart;

        /**
         * Debug logging
         *
         * @param {string} msg Message
         */
        function debug(msg) {
            BOOMR.debug(msg, "Continuity");
        }

        /**
         * Compress JSON to a string for a URL parameter in the best way possible.
         *
         * If UserTimingCompression is available (which has JSURL), use that.  The
         * data will start with the character `~`
         *
         * Otherwise, use JSON.stringify.  The data will start with the character `{`.
         *
         * @param {object} obj Data
         *
         * @returns {string} Compressed data
         */
        function compressJson(data) {
            var utc = window.UserTimingCompression || BOOMR.window.UserTimingCompression;

            if (utc) {
                return utc.jsUrl(data);
            }
            else if (window.JSON) {
                return JSON.stringify(data);
            }
            else {
                // JSON isn't available
                return "";
            }
        }

        /**
         * Gets a compressed bucket log.
         *
         * Each bucket is represented by a single character (the value of the
         * bucket base 64), unless:
         *
         * 1. There are 4 or more duplicates in a row. Then the format is:
         *   *[count of dupes]*[number base 64]
         * 2. The value is greater than 63, then the format is:
         *   _[number base 36]_
         *
         * @param {number} type Compression type
         * @param {boolean} backfill Backfill
         * @param {object} dataSet Data
         * @param {number} sinceBucket Lowest bucket
         * @param {number} endBucket Highest bucket
         *
         * @returns {string} Compressed log
         */
        function compressBucketLog(type, backfill, dataSet, sinceBucket, endBucket) {
            var out = "", val = 0, i, j, dupes, valStr, nextVal, wroteSomething;

            if (!dataSet || !BOOMR.utils.Compression) {
                return "";
            }

            // if we know there's no data, return an empty string
            if (dataSet.length === 0) {
                return "";
            }

            if (backfill) {
                if (typeof dataSet[sinceBucket] === "undefined") {
                    dataSet[sinceBucket] = 0;
                }

                // pre-fill buckets
                for (i = sinceBucket + 1; i <= endBucket; i++) {
                    if (typeof dataSet[i] === "undefined") {
                        dataSet[i] = dataSet[i - 1];
                    }
                }
            }

            for (i = sinceBucket; i <= endBucket; i++) {
                val = typeof dataSet[i] === "number" ? dataSet[i] : 0;

                //
                // Compression modes
                //
                if (type === COMPRESS_MODE_SMALL_NUMBERS) {
                    // Small numbers can be max 63 for our single-digit encoding
                    if (val <= 63) {
                        valStr = BASE64_NUMBER[val];
                    }
                    else {
                        // large numbers get wrapped in .s
                        valStr = LARGE_NUMBER_WRAP + val.toString(36) + LARGE_NUMBER_WRAP;
                    }
                }
                else if (type === COMPRESS_MODE_LARGE_NUMBERS) {
                    // large numbers just get Base36 encoding by default
                    valStr = val.toString(36);
                }
                else if (type === COMPRESS_MODE_PERCENT) {
                    //
                    // Percentage characters take two digits always, with
                    // 100 = __
                    //
                    if (val < 99) {
                        // 0-pad
                        valStr = val <= 9 ? ("0" + Math.max(val, 0)) : val;
                    }
                    else {
                        // 100 or higher
                        valStr = "__";
                    }
                }

                // compress sequences of the same number 4 or more times
                if ((i + 3) <= endBucket &&
                    (dataSet[i + 1] === val || (val === 0 && dataSet[i + 1] === undefined)) &&
                    (dataSet[i + 2] === val || (val === 0 && dataSet[i + 2] === undefined)) &&
                    (dataSet[i + 3] === val || (val === 0 && dataSet[i + 3] === undefined))) {
                    dupes = 1;

                    // loop until we're past the end bucket or we find a non-dupe
                    while (i < endBucket) {
                        if (dataSet[i + 1] === val || (val === 0 && dataSet[i + 1] === undefined)) {
                            dupes++;
                        }
                        else {
                            break;
                        }

                        i++;
                    }

                    nextVal = "*" + dupes.toString(36) + "*" + valStr;
                }
                else {
                    nextVal = valStr;
                }

                // add this value if it isn't just 0s at the end
                if (val !== 0 || i !== endBucket) {
                    //
                    // Small numbers fit into a single character (or are delimited
                    // by _s), so can just be appended to each other.
                    //
                    // Percentage always takes two characters.
                    //
                    if (type === COMPRESS_MODE_LARGE_NUMBERS) {
                        //
                        // Large numbers need to be separated by commas
                        //
                        if (wroteSomething) {
                            out += ",";
                        }
                    }

                    wroteSomething = true;
                    out += nextVal;
                }
            }

            return wroteSomething ? (type.toString() + out) : "";
        }

        /* BEGIN_DEBUG */
        /**
         * Decompresses a compressed bucket log.
         *
         * See {@link compressBucketLog} for details
         *
         * @param {string} data Data
         * @param {number} [minBucket] Minimum bucket
         *
         * @returns {object} Decompressed log
         */
        function decompressBucketLog(data, minBucket) {
            var out = [], i, j, idx = minBucket || 0, endChar, repeat, num, type;

            if (!data || data.length === 0) {
                return [];
            }

            // strip the type out
            type = parseInt(data[0], 10);
            data = data.substring(1);

            // decompress string
            repeat = 1;

            for (i = 0; i < data.length; i++) {
                if (data[i] === "*") {
                    // this is a repeating number

                    // move past the "*"
                    i++;

                    // up to the next * is the repeating count (base 36)
                    endChar = data.indexOf("*", i);
                    repeat = parseInt(data.substring(i, endChar), 36);

                    // after is the number
                    i = endChar;
                    continue;
                }
                else if (data[i] === LARGE_NUMBER_WRAP) {
                    // this is a number larger than 63

                    // move past the wrap character
                    i++;

                    // up to the next wrap character is the number (base 36)
                    endChar = data.indexOf(LARGE_NUMBER_WRAP, i);
                    num = parseInt(data.substring(i, endChar), 36);

                    // move to this end char
                    i = endChar;
                }
                else {
                    if (type === COMPRESS_MODE_SMALL_NUMBERS) {
                        // this digit is a number from 0 to 63
                        num = decompressBucketLogNumber(data[i]);
                    }
                    else if (type === COMPRESS_MODE_LARGE_NUMBERS) {
                        // look for this digit to end at a comma

                        endChar = data.indexOf(",", i);

                        if (endChar !== -1) {
                            // another index exists later, read up to that
                            num = parseInt(data.substring(i, endChar), 36);

                            // move to this end char
                            i = endChar;
                        }
                        else {
                            // this is the last number
                            num = parseInt(data.substring(i), 36);

                            // we're done
                            i = data.length;
                        }
                    }
                    else if (type === COMPRESS_MODE_PERCENT) {
                        // check if this is 100
                        if (data.substr(i, 2) === "__") {
                            num = 100;
                        }
                        else {
                            num = parseInt(data.substr(i, 2), 10);
                        }

                        // take two characters
                        i++;
                    }
                }

                out[idx] = num;
                for (j = 1; j < repeat; j++) {
                    idx++;
                    out[idx] = num;
                }

                idx++;
                repeat = 1;
            }

            return out;
        }

        /**
         * Decompresses a bucket log Base64 number (0 - 63)
         *
         * @param {string} input Character
         *
         * @returns {number} Base64 number
         */
        function decompressBucketLogNumber(input) {
            if (!input || !input.charCodeAt) {
                return 0;
            }

            // convert to ASCII character code
            var chr = input.charCodeAt(0);

            if (chr >= 48 && chr <= 57) {
                // 0 - 9
                return chr - 48;
            }
            else if (chr >= 97 && chr <= 122) {
                // a - z
                return (chr - 97) + 10;
            }
            else if (chr >= 65 && chr <= 90) {
                // A - Z
                return (chr - 65) + 36;
            }
            else if (chr === 95) {
                // _
                return 62;
            }
            else if (chr === 45) {
                // -
                return 63;
            }
            else {
                // unknown
                return 0;
            }
        }

        /**
         * Decompresses the log into events
         *
         * @param {string} data Compressed log
         *
         * @returns {object} Decompressed log
         */
        function decompressLog(data) {
            var val = "", i, j, eventData, events, out = [], evt;

            // each event is separate by a |
            events = data.split("|");

            for (i = 0; i < events.length; i++) {
                eventData = events[i].split(",");

                evt = {
                    type: parseInt(eventData[0][0], 10),
                    time: parseInt(eventData[0].substring(1), 36)
                };

                // add all attributes
                for (j = 1; j < eventData.length; j++) {
                    evt[eventData[j][0]] = eventData[j].substring(1);
                }

                out.push(evt);
            }

            return out;
        }
        /* END_DEBUG */

        /**
         * Timeline data
         *
         * Responsible for:
         *
         * * Keeping track of counts of events that happen over time (in
         *   COLLECTION_INTERVAL intervals).
         * * Keeps a log of raw events.
         * * Calculates Time to Interactive (TTI) and Visually Ready.
         *
         * @class BOOMR.plugins.Continuity.Timeline
         */
        var Timeline = function(startTime) {
            //
            // Constants
            //
            /**
             * Number of "idle" intervals (of COLLECTION_INTERVAL ms) before
             * Time to Interactive is called.
             *
             * 5 * 100 = 500ms (of no long tasks > 50ms and FPS >= 20)
             */
            var TIME_TO_INTERACTIVE_IDLE_INTERVALS = 5;

            /**
             * For Time to Interactive, minimum FPS.
             *
             * ~20 FPS or max ~50ms blocked
             */
            var TIME_TO_INTERACTIVE_MIN_FPS = 20;

            /**
             * For Time to Interactive, minimum FPS per COLLECTION_INTERVAL.
             */
            var TIME_TO_INTERACTIVE_MIN_FPS_PER_INTERVAL =
                TIME_TO_INTERACTIVE_MIN_FPS / (1000 / COLLECTION_INTERVAL);

            //
            // Local Members
            //

            // timeline data
            var data = {};

            // timeline data options
            var dataOptions = {};

            // timeline log
            var dataLog = [];

            // time-to-interactive timestamp
            var tti = 0;

            // visually ready timestamp
            var visuallyReady = 0;

            // check for pre-Boomerang FPS log
            if (BOOMR.fpsLog && BOOMR.fpsLog.length) {
                // start at the first frame instead of now
                startTime = BOOMR.fpsLog[0] + epoch;

                // NOTE: FrameRateMonitor will remove fpsLog
            }

            //
            // Functions
            //
            /**
             * Registers a monitor
             *
             * @param {string} type Type
             * @param {number} [compressMode] Compression mode
             * @param {boolean} [backfillLast] Whether or not to backfill missing entries
             * with the most recent value.
             */
            function register(type, compressMode, backfillLast) {
                if (!data[type]) {
                    data[type] = [];
                }

                dataOptions[type] = {
                    compressMode: compressMode ? compressMode : COMPRESS_MODE_SMALL_NUMBERS,
                    backfillLast: backfillLast
                };
            }

            /**
             * Gets the current time bucket
             *
             * @returns {number} Current time bucket
             */
            function getTimeBucket() {
                return Math.floor((BOOMR.now() - startTime) / COLLECTION_INTERVAL);
            }

            /**
             * Sets data for the specified type.
             *
             * The type should be registered first via {@link register}.
             *
             * @param {string} type Type
             * @param {number} [value] Value
             * @param {number} [bucket] Time bucket
             */
            function set(type, value, bucket) {
                if (typeof bucket === "undefined") {
                    bucket = getTimeBucket();
                }

                if (!data[type]) {
                    return;
                }

                data[type][bucket] = value;
            }

            /**
             * Increments data for the specified type
             *
             * The type should be registered first via {@link register}.
             *
             * @param {string} type Type
             * @param {number} [value] Value
             * @param {number} [bucket] Time bucket
             */
            function increment(type, value, bucket) {
                if (typeof bucket === "undefined") {
                    bucket = getTimeBucket();
                }

                if (typeof value === "undefined") {
                    value = 1;
                }

                if (!data[type]) {
                    return;
                }

                if (!data[type][bucket]) {
                    data[type][bucket] = 0;
                }

                data[type][bucket] += value;
            }

            /**
             * Log an event
             *
             * @param {string} type Type
             * @param {number} [bucket] Time bucket
             * @param {array} [val] Event data
             */
            function log(type, bucket, val) {
                if (typeof bucket === "undefined") {
                    bucket = getTimeBucket();
                }

                dataLog.push({
                    type: type,
                    time: bucket,
                    val: val
                });
            }

            /**
             * Gets stats for a type since the specified start time.
             *
             * @param {string} type Type
             * @param {number} since Start time
             *
             * @returns {object} Stats for the type
             */
            function getStats(type, since) {
                var count = 0,
                    total = 0,
                    min = Infinity,
                    max = 0,
                    val,
                    sinceBucket = Math.floor((since - startTime) / COLLECTION_INTERVAL);

                if (!data[type]) {
                    return 0;
                }

                for (var bucket in data[type]) {
                    bucket = parseInt(bucket, 10);

                    if (data[type].hasOwnProperty(bucket)) {
                        if (bucket >= sinceBucket) {
                            val = data[type][bucket];

                            // calculate count, total and minimum
                            count++;
                            total += val;

                            min = Math.min(min, val);
                            max = Math.max(max, val);
                        }
                    }
                }

                // return the stats
                return {
                    total: total,
                    count: count,
                    min: min,
                    max: max
                };
            }

            /**
             * Given a CSS selector, determine the load time of any IMGs matching
             * that selector and/or IMGs underneath it.
             *
             * @param {string} selector CSS selector
             *
             * @returns {number} Last image load time
             */
            function determineImageLoadTime(selector) {
                var combinedSelector, elements, latestTs = 0, i, j, src, entries;

                // check to see if we have querySelectorAll available
                if (!BOOMR.window ||
                    !BOOMR.window.document ||
                    typeof BOOMR.window.document.querySelectorAll !== "function") {
                    // can't use querySelectorAll
                    return 0;
                }

                // check to see if we have ResourceTiming available
                if (!p ||
                    typeof p.getEntriesByType !== "function") {
                    // can't use ResourceTiming
                    return 0;
                }

                // find any images matching this selector or underneath this selector
                combinedSelector = selector + ", " + selector + " * img";

                // use QSA to find all matching
                elements = BOOMR.window.document.querySelectorAll(combinedSelector);
                if (elements && elements.length) {
                    for (i = 0; i < elements.length; i++) {
                        src = elements[i].src;
                        if (src) {
                            entries = p.getEntriesByName(src);
                            if (entries && entries.length) {
                                for (j = 0; j < entries.length; j++) {
                                    latestTs = Math.max(latestTs, entries[j].responseEnd);
                                }
                            }
                        }
                    }
                }

                return latestTs ? Math.floor(latestTs + epoch) : 0;
            }

            /**
             * Determine Visually Ready time.  This is the last of:
             * 1. First Paint (if available)
             * 2. domContentLoadedEventEnd
             * 3. Hero Images are loaded (if configured)
             * 4. Framework Ready (if configured)
             *
             * @returns {number|undefined} Timestamp, if everything is ready, or
             *    `undefined` if not
             */
            function determineVisuallyReady() {
                var latestTs = 0;

                // start with Framework Ready (if configured)
                if (impl.ttiWaitForFrameworkReady) {
                    if (!impl.frameworkReady) {
                        return;
                    }

                    latestTs = impl.frameworkReady;
                }

                // use IE's First Paint (if available) or
                // use Chrome's firstPaintTime (if available)
                if (p && p.timing && p.timing.msFirstPaint) {
                    latestTs = Math.max(latestTs, p.timing.msFirstPaint);
                }
                else if (BOOMR.window &&
                    BOOMR.window.chrome &&
                    typeof BOOMR.window.chrome.loadTimes === "function") {
                    var loadTimes = BOOMR.window.chrome.loadTimes();
                    if (loadTimes && loadTimes.firstPaintTime) {
                        latestTs = Math.max(latestTs, loadTimes.firstPaintTime * 1000);
                    }
                }

                // Use domContentLoadedEventEnd (if available)
                if (p && p.timing && p.timing.domContentLoadedEventEnd) {
                    latestTs = Math.max(latestTs, p.timing.domContentLoadedEventEnd);
                }

                // look up any Hero Images (if configured)
                if (impl.ttiWaitForHeroImages) {
                    var heroLoadTime = determineImageLoadTime(impl.ttiWaitForHeroImages);

                    if (heroLoadTime) {
                        latestTs = Math.max(latestTs, heroLoadTime);
                    }
                }

                return latestTs;
            }

            /**
             * Adds the compressed data log to the beacon
             */
            function addCompressedLogToBeacon() {
                var val = "";

                for (var i = 0; i < dataLog.length; i++) {
                    var evt = dataLog[i];

                    if (i !== 0) {
                        // add a separator between events
                        val += "|";
                    }

                    // add the type
                    val += evt.type;

                    // add the time: offset from epoch, base36
                    val += Math.round(evt.time - epoch).toString(36);

                    // add each parameter
                    for (var param in evt.val) {
                        if (evt.val.hasOwnProperty(param)) {
                            val += "," + param;

                            if (typeof evt.val[param] === "number") {
                                // base36
                                val += evt.val[param].toString(36);
                            }
                            else {
                                val += evt.val[param];
                            }
                        }
                    }
                }

                if (val !== "") {
                    impl.addToBeacon("c.l", val);
                }
            }

            /**
             * Gets the bucket log for our data
             *
             * @param {string} type Type
             * @param {number} sinceBucket Lowest bucket
             *
             * @returns {string} Compressed log of our data
             */
            function getCompressedBucketLogFor(type, since) {
                return compressBucketLog(
                    dataOptions[type].compressMode,
                    dataOptions[type].backfillLast,
                    data[type],
                    since !== 0 ? Math.floor((since - startTime) / COLLECTION_INTERVAL) : 0,
                    getTimeBucket());
            }

            /**
             * Adds the timeline to the beacon compressed.
             *
             * @param {number} [since] Since timestamp
             */
            function addCompressedTimelineToBeacon(since) {
                var type, compressedLog;

                for (type in data) {
                    if (data.hasOwnProperty((type))) {
                        // get the compressed data
                        compressedLog = getCompressedBucketLogFor(type, since);

                        // add to the beacon
                        if (compressedLog !== "") {
                            impl.addToBeacon("c.t." + type, compressedLog);
                        }
                    }
                }
            }

            /**
             * Analyzes metrics such as Time To Interactive
             *
             * @param {number} timeOfLastBeacon Time we last sent a beacon
             */
            function analyze(timeOfLastBeacon) {
                var endBucket = getTimeBucket(),
                    j = 0,
                    idleIntervals = 0;

                // add log
                if (impl.sendLog && typeof timeOfLastBeacon !== "undefined") {
                    addCompressedLogToBeacon();
                }

                // add timeline
                if (impl.sendTimeline && typeof timeOfLastBeacon !== "undefined") {
                    addCompressedTimelineToBeacon(timeOfLastBeacon);
                }

                if (tti) {
                    return;
                }

                // need to get Visually Ready first
                if (!visuallyReady) {
                    visuallyReady = determineVisuallyReady();
                    if (!visuallyReady) {
                        return;
                    }
                }

                // add Visually Ready to the beacon
                impl.addToBeacon("c.tti.vr", externalMetrics.timeToVisuallyReady());

                // Calculate TTI
                if (!data.longtask && !data.fps) {
                    // can't calculate TTI
                    return;
                }

                // determine the first bucket we'd use
                var startBucket = Math.floor((visuallyReady - startTime) / COLLECTION_INTERVAL);

                for (j = startBucket; j <= endBucket; j++) {
                    if (data.longtask && data.longtask[j]) {
                        // had a long task during this interval
                        idleIntervals = 0;
                        continue;
                    }

                    if (data.fps && (!data.fps[j] || data.fps[j] < TIME_TO_INTERACTIVE_MIN_FPS_PER_INTERVAL)) {
                        // No FPS or less than 20 FPS during this interval
                        idleIntervals = 0;
                        continue;
                    }

                    if (data.interdly && data.interdly[j]) {
                        // a delayed interaction happened
                        idleIntervals = 0;
                        continue;
                    }

                    // this was an idle interval
                    idleIntervals++;

                    // if we've found enough idle intervals, mark TTI as the beginning
                    // of this idle period
                    if (idleIntervals >= TIME_TO_INTERACTIVE_IDLE_INTERVALS) {
                        tti = startTime + ((j - TIME_TO_INTERACTIVE_IDLE_INTERVALS) * COLLECTION_INTERVAL);
                        break;
                    }
                }

                // we were able to calculate a TTI
                if (tti > 0) {
                    impl.addToBeacon("c.tti", externalMetrics.timeToInteractive());
                }
            }

            //
            // External metrics
            //

            /**
             * Time to Interactive
             */
            externalMetrics.timeToInteractive = function() {
                if (tti) {
                    // milliseconds since nav start
                    return tti - epoch;
                }

                // no data
                return;
            };

            /**
             * Time to Visually Ready
             */
            externalMetrics.timeToVisuallyReady = function() {
                if (visuallyReady) {
                    // milliseconds since nav start
                    return visuallyReady - epoch;
                }

                // no data
                return;
            };

            externalMetrics.log = function() {
                return dataLog;
            };

            /**
             * Disables the monitor
             */
            function stop() {
                data = {};
                dataLog = [];
            }

            /**
             * Resets on beacon
             */
            function onBeacon() {
                // clear the buckets
                for (var type in data) {
                    if (data.hasOwnProperty(type)) {
                        data[type] = [];
                    }
                }

                // reset the data log
                dataLog = [];
            }

            return {
                register: register,
                set: set,
                log: log,
                increment: increment,
                getTimeBucket: getTimeBucket,
                getStats: getStats,
                analyze: analyze,
                stop: stop,
                onBeacon: onBeacon
            };
        };

        /**
         * Monitors LongTasks
         *
         * @class BOOMR.plugins.Continuity.LongTaskMonitor
         */
        var LongTaskMonitor = function(w, t) {
            if (!w.PerformanceObserver || !w.PerformanceLongTaskTiming) {
                return;
            }

            //
            // Constants
            //
            /**
             * LongTask attribution types
             */
            var ATTRIBUTION_TYPES = {
                "unknown": 0,
                "self": 1,
                "same-origin-ancestor": 2,
                "same-origin-descendant": 3,
                "same-origin": 4,
                "cross-origin-ancestor": 5,
                "cross-origin-descendant": 6,
                "cross-origin-unreachable": 7,
                "multiple-contexts": 8
            };

            /**
             * LongTask culprit attribution names
             */
            var CULPRIT_ATTRIBUTION_NAMES = {
                "unknown": 0,
                "script": 1,
                "layout": 2
            };

            /**
             * LongTask culprit types
             */
            var CULPRIT_TYPES = {
                "unknown": 0,
                "iframe": 1,
                "embed": 2,
                "object": 3
            };

            //
            // Local Members
            //

            // PerformanceObserver
            var perfObserver = new w.PerformanceObserver(onPerformanceObserver);

            try {
                perfObserver.observe({ entryTypes: ["longtask"] });
            }
            catch (e) {
                // longtask not supported
                return;
            }

            // register this type
            t.register("longtask", COMPRESS_MODE_SMALL_NUMBERS);

            // Long Tasks array
            var longTasks = BOOMR.longTasks || [];

            // whether or not we're enabled
            var enabled = true;

            // total time of long tasks
            var longTasksTime = 0;

            /**
             * Callback for the PerformanceObserver
             */
            function onPerformanceObserver(list) {
                var entries, i;

                if (!enabled) {
                    return;
                }

                // just capture all of the data for now, we'll analyze at the beacon
                entries = list.getEntries();
                Array.prototype.push.apply(longTasks, entries);

                // add total time and count of long tasks
                for (i = 0; i < entries.length; i++) {
                    longTasksTime += entries[i].duration;
                }

                // add to the timeline
                t.increment("longtask", entries.length);
            }

            /**
             * Gets the current list of tasks
             *
             * @returns {PerformanceEntry[]} Tasks
             */
            function getTasks() {
                return longTasks;
            }

            /**
             * Clears the Long Tasks
             */
            function clearTasks() {
                longTasks = [];

                longTasksTime = 0;
            }

            /**
             * Analyzes LongTasks
             */
            function analyze(startTime) {
                var i, j, task, obj, objs = [], attrs = [], attr;

                if (longTasks.length === 0) {
                    return;
                }

                for (i = 0; i < longTasks.length; i++) {
                    task = longTasks[i];

                    // compress the object a bit
                    obj = {
                        s: Math.round(task.startTime).toString(36),
                        d: Math.round(task.duration).toString(36),
                        n: ATTRIBUTION_TYPES[task.name] ? ATTRIBUTION_TYPES[task.name] : 0
                    };

                    attrs = [];

                    for (j = 0; j < task.attribution.length; j++) {
                        attr = task.attribution[j];

                        // skip script/iframe with no attribution
                        if (attr.name === "script" &&
                            attr.containerType === "iframe" &&
                            !attr.containerName &&
                            !attr.containerId && !attr.containerSrc) {
                            continue;
                        }

                        // only use containerName if not the same as containerId
                        var containerName = attr.containerName ? attr.containerName : undefined;
                        var containerId = attr.containerId ? attr.containerId : undefined;
                        if (containerName === containerId) {
                            containerName = undefined;
                        }

                        // only use containerSrc if containerId is undefined
                        var containerSrc = containerId === undefined ? attr.containerSrc : undefined;

                        attrs.push({
                            a: CULPRIT_ATTRIBUTION_NAMES[attr.name] ? CULPRIT_ATTRIBUTION_NAMES[attr.name] : 0,
                            t: CULPRIT_TYPES[attr.containerType] ? CULPRIT_TYPES[attr.containerType] : 0,
                            n: containerName,
                            i: containerId,
                            s: containerSrc
                        });
                    }

                    if (attrs.length > 0) {
                        obj.a = attrs;
                    }

                    objs.push(obj);
                }

                // add data to beacon
                impl.addToBeacon("c.lt.n", externalMetrics.longTasksCount(), true);
                impl.addToBeacon("c.lt.tt", externalMetrics.longTasksTime());

                impl.addToBeacon("c.lt", compressJson(objs));
            }

            /**
             * Disables the monitor
             */
            function stop() {
                enabled = false;

                perfObserver.disconnect();

                clearTasks();
            }

            /**
             * Resets on beacon
             */
            function onBeacon() {
                clearTasks();
            }

            //
            // External metrics
            //

            /**
             * Total time of LongTasks (ms)
             */
            externalMetrics.longTasksTime = function() {
                return longTasksTime;
            };

            /**
             * Number of LongTasks
             */
            externalMetrics.longTasksCount = function() {
                return longTasks.length;
            };

            return {
                getTasks: getTasks,
                clearTasks: clearTasks,
                analyze: analyze,
                stop: stop,
                onBeacon: onBeacon
            };
        };

        /**
         * Monitors Page Busy if LongTasks isn't supported
         *
         * @class BOOMR.plugins.Continuity.PageBusyMonitor
         */
        var PageBusyMonitor = function(w, t) {
            // register this type
            t.register("busy", COMPRESS_MODE_PERCENT);

            //
            // Constants
            //

            /**
             * How frequently to poll (ms)
             */
            var POLLING_INTERVAL = 25;

            /**
             * How much deviation from the expected time to allow (ms)
             */
            var ALLOWED_DEVIATION_MS = 4;

            /**
             * How often to report on Page Busy (ms)
             */
            var REPORT_INTERVAL = 100;

            /**
             * How many polls there were per-report
             */
            var POLLS_PER_REPORT =
                REPORT_INTERVAL / POLLING_INTERVAL;

            //
            // Local Members
            //

            // last time we ran
            var last = BOOMR.now();

            // total callbacks
            var total = 0;

            // late callbacks
            var late = 0;

            // overall total and late callbacks (reset on beacon)
            var overallTotal = 0;
            var overallLate = 0;

            // whether or not we're enabled
            var enabled = true;

            // intervals
            var pollInterval = false;
            var reportInterval = false;

            /**
             * Polling interval
             */
            function onPoll() {
                var now = BOOMR.now();
                var delta = now - last;
                last = now;

                // if we're more than 2x the polling interval
                // + deviation, we missed one period completely
                while (delta > ((POLLING_INTERVAL * 2) + ALLOWED_DEVIATION_MS)) {
                    total++;
                    late++;

                    // adjust, try again
                    delta -= POLLING_INTERVAL;
                }

                // total intervals increased by one
                total++;

                // late intervals increased by one if we're more than the interval + deviation
                if (delta > (POLLING_INTERVAL + ALLOWED_DEVIATION_MS)) {
                    late++;
                }
            }

            /**
             * Each reporting interval, log page busy
             */
            function onReport() {
                var reportTime = t.getTimeBucket();
                var curTime = reportTime;

                // update the total stats
                overallTotal += total;
                overallLate += late;

                // if we had more polls than we expect in each
                // collection period, we must not have been able
                // to report, so assume those periods were 100%
                while (total > POLLS_PER_REPORT) {
                    t.set("busy", 100, --curTime);

                    // reset the period by one
                    total -= POLLS_PER_REPORT;
                    late -= Math.max(POLLS_PER_REPORT, 0);
                }

                t.set("busy", Math.round(late / total * 100), reportTime);

                // reset stats
                total = 0;
                late = 0;
            }

            /**
             * Analyzes Page Busy
             */
            function analyze(startTime) {
                // add data to beacon
                impl.addToBeacon("c.b", externalMetrics.pageBusy());
            }

            /**
             * Disables the monitor
             */
            function stop() {
                enabled = false;

                if (pollInterval) {
                    clearInterval(pollInterval);
                    pollInterval = false;
                }

                if (reportInterval) {
                    clearInterval(reportInterval);
                    reportInterval = false;
                }
            }

            /**
             * Resets on beacon
             */
            function onBeacon() {
                overallTotal = 0;
                overallLate = 0;
            }

            //
            // External metrics
            //

            /**
             * Total Page Busy time
             */
            externalMetrics.pageBusy = function() {
                if (overallTotal === 0) {
                    return 0;
                }

                return Math.round(overallLate / overallTotal * 100);
            };

            //
            // Setup
            //
            pollInterval = setInterval(onPoll, POLLING_INTERVAL);
            reportInterval = setInterval(onReport, REPORT_INTERVAL);

            return {
                analyze: analyze,
                stop: stop,
                onBeacon: onBeacon
            };
        };

        /**
         * Monitors framerate (FPS)
         *
         * @class BOOMR.plugins.Continuity.FrameRateMonitor
         */
        var FrameRateMonitor = function(w, t) {
            // register this type
            t.register("fps", COMPRESS_MODE_SMALL_NUMBERS);

            //
            // Constants
            //

            // long frame maximum milliseconds
            var LONG_FRAME_MAX = 50;

            //
            // Local Members
            //

            // total frames seen
            var totalFrames = 0;

            // long frames
            var longFrames = 0;

            // time we started monitoring
            var frameStartTime;

            // last frame we saw
            var lastFrame;

            // whether or not we're enabled
            var enabled = true;

            // check for pre-Boomerang FPS log
            if (BOOMR.fpsLog && BOOMR.fpsLog.length) {
                lastFrame = frameStartTime = BOOMR.fpsLog[0] + epoch;

                // transition any FPS log events to our timeline
                for (var i = 0; i < BOOMR.fpsLog.length; i++) {
                    var ts = epoch + BOOMR.fpsLog[i];

                    // update the frame count for this time interval
                    t.increment("fps", 1, Math.floor((ts - frameStartTime) / COLLECTION_INTERVAL));

                    // calculate how long this frame took
                    if (ts - lastFrame >= LONG_FRAME_MAX) {
                        longFrames++;
                    }

                    // last frame timestamp
                    lastFrame = ts;
                }

                totalFrames = BOOMR.fpsLog.length;

                delete BOOMR.fpsLog;
            }
            else {
                frameStartTime = BOOMR.now();
            }

            /**
             * requestAnimationFrame callback
             */
            function frame() {
                var now = BOOMR.now();

                if (!enabled) {
                    return;
                }

                // calculate how long this frame took
                if (now - lastFrame >= LONG_FRAME_MAX) {
                    longFrames++;
                }

                // last frame timestamp
                lastFrame = now;

                // keep track of total frames we've seen
                totalFrames++;

                // increment the FPS
                t.increment("fps");

                // request the next frame
                w.requestAnimationFrame(frame);
            }

            /**
             * Analyzes FPS
             */
            function analyze(startTime) {
                impl.addToBeacon("c.f", externalMetrics.fps());
                impl.addToBeacon("c.f.d", externalMetrics.fpsDuration());
                impl.addToBeacon("c.f.m", externalMetrics.fpsMinimum());
                impl.addToBeacon("c.f.l", externalMetrics.fpsLongFrames());
                impl.addToBeacon("c.f.s", externalMetrics.fpsStart());
            }

            /**
             * Disables the monitor
             */
            function stop() {
                enabled = false;
                frameStartTime = 0;
            }

            /**
             * Resets on beacon
             */
            function onBeacon() {
                if (enabled) {
                    // restart to now
                    frameStartTime = BOOMR.now();
                }

                totalFrames = 0;
                longFrames = 0;
            }

            // start the first frame
            w.requestAnimationFrame(frame);

            //
            // External metrics
            //

            /**
             * Framerate since fpsStart
             */
            externalMetrics.fps = function() {
                var dur = externalMetrics.fpsDuration();
                if (dur) {
                    return Math.floor(totalFrames / (dur / 1000));
                }
            };

            /**
             * How long FPS was being tracked for
             */
            externalMetrics.fpsDuration = function() {
                if (frameStartTime) {
                    return BOOMR.now() - frameStartTime;
                }
            };

            /**
             * Minimum FPS during the period
             */
            externalMetrics.fpsMinimum = function() {
                var dur = externalMetrics.fpsDuration();
                if (dur) {
                    var min = t.getStats("fps", frameStartTime).min;
                    return min !== Infinity ? min : undefined;
                }
            };

            /**
             * Number of long frames (over 18ms)
             */
            externalMetrics.fpsLongFrames = function() {
                return longFrames;
            };

            /**
             * When FPS tracking started (base 36)
             */
            externalMetrics.fpsStart = function() {
                return frameStartTime ? frameStartTime.toString(36) : 0;
            };

            return {
                analyze: analyze,
                stop: stop,
                onBeacon: onBeacon
            };
        };

        /**
         * Monitors scrolling
         *
         * @class BOOMR.plugins.Continuity.ScrollMonitor
         */
        var ScrollMonitor = function(w, t, i) {
            if (!w || !w.document || !w.document.body || !w.document.documentElement) {
                // something's wrong with the DOM, abort
                return;
            }

            //
            // Constants
            //

            // number of milliseconds between each distinct scroll
            var DISTINCT_SCROLL_SECONDS = 2000;

            //
            // Local Members
            //

            // last scroll Y
            var lastY = 0;

            // scroll % this period
            var intervalScrollPct = 0;

            // scroll % total
            var totalScrollPct = 0;

            // number of scroll events
            var scrollCount = 0;

            // total scroll pixels
            var scrollPixels = 0;

            // number of distinct scrolls (scroll which happened
            // over DISTINCT_SCROLL_SECONDS seconds apart)
            var distinctScrollCount = 0;

            // last time we scrolled
            var lastScroll = 0;

            // collection interval id
            var collectionInterval = false;

            // body and html element
            var body = w.document.body;
            var html = w.document.documentElement;

            // register this type
            t.register("scroll", COMPRESS_MODE_SMALL_NUMBERS);
            t.register("scrollpct", COMPRESS_MODE_PERCENT);

            /**
             * Fired when a scroll event happens
             *
             * @param {Event} e Scroll event
             */
            function onScroll(e) {
                var now = BOOMR.now();

                scrollCount++;

                // see if this is a unique scroll
                if (now - lastScroll > DISTINCT_SCROLL_SECONDS) {
                    distinctScrollCount++;
                }

                lastScroll = now;

                // height of the document
                var height = Math.max(
                    body.scrollHeight,
                    body.offsetHeight,
                    html.clientHeight,
                    html.scrollHeight,
                    html.offsetHeight) - w.innerHeight;

                // determine how many pixels were scrolled
                var curY = w.scrollY;
                var diffY = Math.abs(lastY - curY);

                scrollPixels += diffY;

                // update the timeline
                t.increment("scroll", diffY);

                // add to the log
                t.log(LOG_TYPE_SCROLL, now, {
                    y: curY
                });

                // update the interaction monitor
                i.interact("scroll", now, e);

                // calculate percentage of document scrolled
                intervalScrollPct += Math.round(diffY / height * 100);
                totalScrollPct += Math.round(diffY / height * 100);

                lastY = curY;
            }

            /**
             * Reports on the number of scrolls seen
             */
            function reportScroll() {
                var pct = Math.min(intervalScrollPct, 100);

                if (pct !== 0) {
                    t.set("scrollpct", pct);
                }

                // reset count
                intervalScrollPct = 0;
            }

            /**
             * Analyzes Scrolling events
             */
            function analyze(startTime) {
                impl.addToBeacon("c.s", externalMetrics.scrollCount());
                impl.addToBeacon("c.s.p", externalMetrics.scrollPct());
                impl.addToBeacon("c.s.y", externalMetrics.scrollPixels());
                impl.addToBeacon("c.s.d", externalMetrics.scrollDistinct());
            }

            /**
             * Disables the monitor
             */
            function stop() {
                if (collectionInterval) {
                    clearInterval(collectionInterval);

                    collectionInterval = false;
                }

                w.removeEventListener("scroll", onScroll);
            }

            /**
             * Resets on beacon
             */
            function onBeacon() {
                totalScrollPct = 0;
                scrollCount = 0;
                scrollPixels = 0;
                distinctScrollCount = 0;
            }

            //
            // External metrics
            //

            /**
             * Percentage of the screen that was scrolled.
             *
             * All the way to the bottom = 100%
             */
            externalMetrics.scrollPct = function() {
                return totalScrollPct;
            };

            /**
             * Number of scrolls
             */
            externalMetrics.scrollCount = function() {
                return scrollCount;
            };

            /**
             * Number of scrolls (more than two seconds apart)
             */
            externalMetrics.scrollDistinct = function() {
                return distinctScrollCount;
            };

            /**
             * Number of pixels scrolled
             */
            externalMetrics.scrollPixels = function() {
                return scrollPixels;
            };

            // startup
            w.addEventListener("scroll", onScroll, false);

            collectionInterval = setInterval(reportScroll, COLLECTION_INTERVAL);

            return {
                analyze: analyze,
                stop: stop,
                onBeacon: onBeacon
            };
        };

        /**
         * Monitors mouse clicks
         *
         * @class BOOMR.plugins.Continuity.ClickMonitor
         */
        var ClickMonitor = function(w, t, i) {
            // register this type
            t.register("click", COMPRESS_MODE_SMALL_NUMBERS);

            //
            // Constants
            //

            // number of pixels area for Rage Clicks
            var PIXEL_AREA = 10;

            // number of clicks in the same area to trigger a Rage Click
            var RAGE_CLICK_THRESHOLD = 3;

            //
            // Local Members
            //

            // number of click events
            var clickCount = 0;

            // number of clicks in the same PIXEL_AREA area
            var sameClicks = 0;

            // number of Rage Clicks
            var rageClicks = 0;

            // last coordinates
            var x = 0;
            var y = 0;

            // last click target
            var lastTarget = null;

            /**
             * Fired when a `click` event happens.
             *
             * @param {Event} e Event
             */
            function onClick(e) {
                var now = BOOMR.now();

                var newX = e.clientX;
                var newY = e.clientY;

                // track total number of clicks
                clickCount++;

                // calculate number of pixels moved
                var pixels = Math.round(
                    Math.sqrt(Math.pow(y - newY, 2) +
                    Math.pow(x - newX, 2)));

                // track Rage Clicks
                if (lastTarget === e.target || pixels <= PIXEL_AREA) {
                    sameClicks++;

                    if ((sameClicks + 1) >= RAGE_CLICK_THRESHOLD) {
                        rageClicks++;
                        BOOMR.fireEvent("rage_click", e);
                    }
                }
                else {
                    sameClicks = 0;
                }

                // track last click coordinates and element
                x = newX;
                y = newY;
                lastTarget = e.target;

                // update the timeline
                t.increment("click");

                // add to the log
                t.log(LOG_TYPE_CLICK, now, {
                    x: newX,
                    y: newY
                });

                // update the interaction monitor
                i.interact("click", now, e);
            }

            /**
             * Analyzes Click events
             */
            function analyze(startTime) {
                impl.addToBeacon("c.c", externalMetrics.clicksCount());
                impl.addToBeacon("c.c.r", externalMetrics.clicksRage());
            }

            /**
             * Disables the monitor
             */
            function stop() {
                w.document.removeEventListener("click", onClick);
            }

            /**
             * Resets on beacon
             */
            function onBeacon() {
                clickCount = 0;
                sameClicks = 0;
                rageClicks = 0;
            }

            //
            // External metrics
            //
            externalMetrics.clicksCount = function() {
                return clickCount;
            };

            externalMetrics.clicksRage = function() {
                return rageClicks;
            };

            //
            // Startup
            //
            w.document.addEventListener("click", onClick, false);

            return {
                analyze: analyze,
                stop: stop,
                onBeacon: onBeacon
            };
        };

        /**
         * Monitors keyboard events
         *
         * @class BOOMR.plugins.Continuity.KeyMonitor
         */
        var KeyMonitor = function(w, t, i) {
            // register this type
            t.register("key", COMPRESS_MODE_SMALL_NUMBERS);

            //
            // Local members
            //

            // key presses
            var keyCount = 0;

            // esc key presses
            var escKeyCount = 0;

            /**
             * Fired on key down
             *
             * @param {Event} e keydown event
             */
            function onKeyDown(e) {
                var now = BOOMR.now();

                keyCount++;

                if (e.keyCode === 27) {
                    escKeyCount++;
                }

                // update the timeline
                t.increment("key");

                // add to the log (don't track the actual keys)
                t.log(LOG_TYPE_KEY, now);

                // update the interaction monitor
                i.interact("key", now, e);
            }

            /**
             * Analyzes Key events
             */
            function analyze(startTime) {
                impl.addToBeacon("c.k", externalMetrics.keyCount());
                impl.addToBeacon("c.k.e", externalMetrics.keyEscapes());
            }

            /**
             * Disables the monitor
             */
            function stop() {
                w.document.removeEventListener("keydown", onKeyDown);
            }

            /**
             * Resets on beacon
             */
            function onBeacon() {
                keyCount = 0;
                escKeyCount = 0;
            }

            //
            // External metrics
            //
            externalMetrics.keyCount = function() {
                return keyCount;
            };

            externalMetrics.keyEscapes = function() {
                return escKeyCount;
            };

            // start
            w.document.addEventListener("keydown", onKeyDown, false);

            return {
                analyze: analyze,
                stop: stop,
                onBeacon: onBeacon
            };
        };

        /**
         * Monitors mouse movement
         *
         * @class BOOMR.plugins.Continuity.MouseMonitor
         */
        var MouseMonitor = function(w, t, i) {
            // register the mouse movements and overall percentage moved
            t.register("mouse", COMPRESS_MODE_SMALL_NUMBERS);
            t.register("mousepct", COMPRESS_MODE_PERCENT);

            //
            // Constants
            //

            /**
             * Minimum number of pixels that change from last before logging
             */
            var MIN_LOG_PIXEL_CHANGE = 10;

            /**
             * Mouse log interval
             */
            var REPORT_LOG_INTERVAL = 250;

            //
            // Local members
            //

            // last movement coordinates
            var lastX = 0;
            var lastY = 0;

            // last reported X/Y
            var lastLogX = 0;
            var lastLogY = 0;

            // mouse move screen percent this interval
            var intervalMousePct = 0;

            // total mouse move percent
            var totalMousePct = 0;

            // total mouse move pixels
            var totalMousePixels = 0;

            // interval ids
            var reportMousePctInterval = false;
            var reportMouseLogInterval = false;

            // screen pixel count
            var screenPixels = Math.round(Math.sqrt(
                Math.pow(w.innerHeight, 2) +
                Math.pow(w.innerWidth, 2)));

            /**
             * Fired when a `mousemove` event happens.
             *
             * @param {Event} e Event
             */
            function onMouseMove(e) {
                var now = BOOMR.now();

                var newX = e.clientX;
                var newY = e.clientY;

                // calculate number of pixels moved
                var pixels = Math.round(Math.sqrt(Math.pow(lastY - newY, 2) +
                                        Math.pow(lastX - newX, 2)));

                // calculate percentage of screen moved (upper-left to lower-right = 100%)
                var newPct = Math.round(pixels / screenPixels * 100);
                intervalMousePct += newPct;
                totalMousePct += newPct;
                totalMousePixels += pixels;

                lastX = newX;
                lastY = newY;

                // Note: don't mark a mouse movement as an interaction (i.interact)

                t.increment("mouse", pixels);
            }

            /**
             * Reports on the mouse percentage change
             */
            function reportMousePct() {
                var pct = Math.min(intervalMousePct, 100);

                if (pct !== 0) {
                    t.set("mousepct", pct);
                }

                // reset count
                intervalMousePct = 0;
            }

            /**
             * Updates the log if the mouse has moved enough
             */
            function reportMouseLog() {
                // Only log if X,Y have changed and have changed over the specified
                // minimum theshold.
                if (lastLogX !== lastX ||
                    lastLogY !== lastY) {
                    var pixels = Math.round(Math.sqrt(Math.pow(lastLogY - lastY, 2) +
                                            Math.pow(lastLogX - lastX, 2)));

                    if (pixels >= MIN_LOG_PIXEL_CHANGE) {
                        // add to the log
                        t.log(LOG_TYPE_MOUSE, BOOMR.now(), {
                            x: lastX,
                            y: lastY
                        });

                        lastLogX = lastX;
                        lastLogY = lastY;
                    }
                }
            }

            /**
             * Analyzes Mouse events
             */
            function analyze(startTime) {
                impl.addToBeacon("c.m.p", externalMetrics.mousePct());
                impl.addToBeacon("c.m.n", externalMetrics.mousePixels());
            }

            /**
             * Disables the monitor
             */
            function stop() {
                if (reportMousePctInterval) {
                    clearInterval(reportMousePctInterval);

                    reportMousePctInterval = false;
                }

                if (reportMouseLogInterval) {
                    clearInterval(reportMouseLogInterval);

                    reportMouseLogInterval = false;
                }

                w.document.removeEventListener("mousemove", onMouseMove);
            }

            /**
             * Resets on beacon
             */
            function onBeacon() {
                totalMousePct = 0;
                totalMousePixels = 0;
            }

            //
            // External metrics
            //

            /**
             * Percentage the mouse moved
             */
            externalMetrics.mousePct = function() {
                return totalMousePct;
            };

            /**
             * Pixels the mouse moved
             */
            externalMetrics.mousePixels = function() {
                return totalMousePixels;
            };

            reportMousePctInterval = setInterval(reportMousePct, COLLECTION_INTERVAL);
            reportMouseLogInterval = setInterval(reportMouseLog, REPORT_LOG_INTERVAL);

            // start
            w.document.addEventListener("mousemove", onMouseMove, false);

            return {
                analyze: analyze,
                stop: stop,
                onBeacon: onBeacon
            };
        };

        /**
         * Interaction monitor
         *
         * @class BOOMR.plugins.Continuity.InteractionMonitor
         */
        var InteractionMonitor = function(w, t, afterOnloadMinWait) {
            // register this type
            t.register("inter", COMPRESS_MODE_SMALL_NUMBERS);
            t.register("interdly", COMPRESS_MODE_SMALL_NUMBERS);

            //
            // Constants
            //

            /**
             * Interaction maximum delay (ms)
             */
            var INTERACTION_MAX_DELAY = 50;

            /**
             * How long after an interaction to wait before sending a beacon (ms).
             */
            var INTERACTION_MIN_WAIT_FOR_BEACON = afterOnloadMinWait;

            /**
             * Maximum amount of time after the first interaction before sending
             * a beacon (ms).
             */
            var INTERACTION_MAX_WAIT_FOR_BEACON = 30000;

            //
            // Local Members
            //

            // Time of first interaction
            var timeToFirstInteraction = 0;

            // Interaction count
            var interactions = 0;

            // Interaction delay total
            var interactionsDelay = 0;

            // Delayed interactions
            var delayedInteractions = 0;

            // Delayed interaction time
            var delayedInteractionTime = 0;

            // whether or not we're enabled
            var enabled = true;

            // interaction beacon start time
            var beaconStartTime = 0;

            // interaction beacon end time
            var beaconEndTime = 0;

            // interaction beacon timers
            var beaconMinTimeout = false;
            var beaconMaxTimeout = false;

            // whether or not a SPA nav is happening
            var isSpaNav = false;

            /**
             * Logs an interaction
             *
             * @param {string} type Interaction type
             * @param {number} now Time of callback
             * @param {Event} e Event
             */
            function interact(type, now, e) {
                now = now || BOOMR.now();

                if (!enabled) {
                    return;
                }

                interactions++;

                if (!timeToFirstInteraction) {
                    timeToFirstInteraction = now;
                }

                // check for interaction delay
                var delay = 0;
                if (e && e.timeStamp) {
                    if (e.timeStamp > 1400000000000) {
                        delay = now - e.timeStamp;
                    }
                    else {
                        // if timeStamp is a DOMHighResTimeStamp, convert BOOMR.now() to same
                        delay = (now - epoch) - e.timeStamp;
                    }

                    interactionsDelay += delay;

                    // log as a delayed interaction
                    if (delay > INTERACTION_MAX_DELAY) {
                        t.increment("interdly");

                        delayedInteractions++;
                        delayedInteractionTime += delay;
                    }
                }

                // increment the FPS
                t.increment("inter");

                //
                // If we're doing after-page-load monitoring, start a timer to report
                // on this interaction.  We will wait up to INTERACTION_MIN_WAIT_FOR_BEACON
                // ms before sending the beacon, sliding the window if there are
                // more interactions, up to a max of INTERACTION_MAX_WAIT_FOR_BEACON ms.
                //
                if (!isSpaNav && impl.afterOnloadMonitoring) {
                    // mark now as the latest interaction
                    beaconEndTime = BOOMR.now();

                    if (!beaconStartTime) {
                        debug("Interaction detected, sending a beacon after " +
                            INTERACTION_MIN_WAIT_FOR_BEACON + " ms");

                        // first interaction for this beacon
                        beaconStartTime = beaconEndTime;

                        // set a timer for the max timeout
                        beaconMaxTimeout = setTimeout(sendInteractionBeacon,
                            INTERACTION_MAX_WAIT_FOR_BEACON);
                    }

                    // if there was a timer for the min timeout, clear it first
                    if (beaconMinTimeout) {
                        debug("Clearing previous interaction timeout");

                        clearTimeout(beaconMinTimeout);
                        beaconMinTimeout = false;
                    }

                    // set a timer for the min timeout
                    beaconMinTimeout = setTimeout(sendInteractionBeacon,
                        INTERACTION_MIN_WAIT_FOR_BEACON);
                }
            }

            /**
             * Fired on spa_init
             */
            function onSpaInit() {
                // note we're in a SPA nav right now
                isSpaNav = true;

                // clear any interaction beacon timers
                clearBeaconTimers();
            }

            /**
             * Clears interaction beacon timers.
             */
            function clearBeaconTimers() {
                if (beaconMinTimeout) {
                    clearTimeout(beaconMinTimeout);
                    beaconMinTimeout = false;
                }

                if (beaconMaxTimeout) {
                    clearTimeout(beaconMaxTimeout);
                    beaconMaxTimeout = false;
                }
            }

            /**
             * Fired when an interaction beacon timed-out
             */
            function sendInteractionBeacon() {
                debug("Sending interaction beacon");

                clearBeaconTimers();

                // notify anyone listening for an interaction event
                BOOMR.fireEvent("interaction");

                // add data to the beacon
                impl.addToBeacon("rt.tstart", beaconStartTime);
                impl.addToBeacon("rt.end", beaconEndTime);
                impl.addToBeacon("rt.start", "manual");
                impl.addToBeacon("http.initiator", "interaction");

                BOOMR.sendBeacon();
            }

            /**
             * Analyzes Interactions
             */
            function analyze(startTime) {
                impl.addToBeacon("c.ttfi", externalMetrics.timeToFirstInteraction());
                impl.addToBeacon("c.i.dc", externalMetrics.interactionDelayed());
                impl.addToBeacon("c.i.dt", externalMetrics.interactionDelayedTime());
                impl.addToBeacon("c.i.a", externalMetrics.interactionAvgDelay());
            }

            /**
             * Disables the monitor
             */
            function stop() {
                enabled = false;
            }

            /**
             * Resets on beacon
             */
            function onBeacon() {
                delayedInteractionTime = 0;
                delayedInteractions = 0;
                interactions = 0;
                interactionsDelay = 0;

                beaconStartTime = 0;
                beaconEndTime = 0;

                // no longer in a SPA nav
                isSpaNav = false;

                // if we had queued an interaction beacon, but something else is
                // firing instead, use that data
                clearBeaconTimers();
            }

            //
            // External metrics
            //
            externalMetrics.interactionDelayed = function() {
                return delayedInteractions;
            };

            externalMetrics.interactionDelayedTime = function() {
                return Math.round(delayedInteractionTime);
            };

            externalMetrics.interactionAvgDelay = function() {
                if (interactions > 0) {
                    return Math.round(interactionsDelay / interactions);
                }
            };

            externalMetrics.timeToFirstInteraction = function() {
                if (timeToFirstInteraction) {
                    // milliseconds since nav start
                    return timeToFirstInteraction - epoch;
                }

                // no data
                return;
            };

            //
            // Setup
            //

            // clear interaction beacon timer if a SPA is starting
            BOOMR.subscribe("spa_init", onSpaInit, null, impl);

            return {
                interact: interact,
                analyze: analyze,
                stop: stop,
                onBeacon: onBeacon
            };
        };

        /**
         * Monitors for visibility state changes
         *
         * @class BOOMR.plugins.Continuity.VisibilityMonitor
         */
        var VisibilityMonitor = function(w, t, i) {
            // register this type
            t.register("vis", COMPRESS_MODE_SMALL_NUMBERS);

            //
            // Constants
            //

            /**
             * Maps visibilityState from a string to a number
             */
            var VIS_MAP = {
                "visible": 0,
                "hidden": 1,
                "prerender": 2,
                "unloaded": 3
            };

            //
            // Locals
            //
            var enabled = true;

            BOOMR.subscribe("visibility_changed", function(e) {
                var now = BOOMR.now();

                if (!enabled) {
                    return;
                }

                // update the timeline
                t.increment("vis");

                // add to the log (don't track the actual keys)
                t.log(LOG_TYPE_VIS, now, {
                    s: VIS_MAP[BOOMR.visibilityState()]
                });

                // update the interaction monitor
                i.interact("vis", now, e);
            });

            /**
             * Stops this monitor
             */
            function stop() {
                enabled = false;
            }

            return {
                stop: stop
            };
        };

        /**
         * Monitors for orientation changes
         *
         * @class BOOMR.plugins.Continuity.OrientationMonitor
         */
        var OrientationMonitor = function(w, t, i) {
            // register this type
            t.register("orn", COMPRESS_MODE_SMALL_NUMBERS);

            //
            // Locals
            //
            var enabled = true;

            /**
             * Fired when the orientation changes
             *
             * @param {Event} e Event
             */
            function onOrientationChange(e) {
                var now = BOOMR.now();

                if (!enabled) {
                    return;
                }

                // update the timeline
                t.increment("orn");

                // add to the log (don't track the actual keys)
                t.log(LOG_TYPE_ORIENTATION, now, {
                    a: screen.orientation.angle
                });

                // update the interaction monitor
                i.interact("orn", now, e);
            }

            /**
             * Stops this monitor
             */
            function stop() {
                enabled = false;

                BOOMR.utils.removeListener(w, "orientationchange", onOrientationChange);
            }

            //
            // Setup
            //
            BOOMR.utils.addListener(w, "orientationchange", onOrientationChange);

            return {
                stop: stop
            };
        };

        /**
         * Monitors for misc stats such as memory usage, battery levle, etc.
         *
         * Note: Not reporting on ResourceTiming entries or Errors since those
         * will be captured by the respective plugins.
         *
         * @class BOOMR.plugins.Continuity.StatsMonitor
         */
        var StatsMonitor = function(w, t) {
            // register types
            t.register("mem", COMPRESS_MODE_LARGE_NUMBERS, true);
            t.register("bat", COMPRESS_MODE_PERCENT, true);
            t.register("domsz", COMPRESS_MODE_LARGE_NUMBERS, true);
            t.register("domln", COMPRESS_MODE_LARGE_NUMBERS, true);
            t.register("mut", COMPRESS_MODE_SMALL_NUMBERS);

            //
            // Constants
            //

            /**
             * Report stats every second
             */
            var REPORT_INTERVAL = 1000;

            //
            // Locals
            //
            var d = w.document;

            /**
             * Whether or not we're enabled
             */
            var enabled = true;

            /**
             * Report interval ID
             */
            var reportInterval = false;

            /**
             * navigator.getBattery() object
             */
            var battery = null;

            /**
             * Number of mutations since last reset
             */
            var mutationCount = 0;

            /**
             * DOM length
             */
            var domLength = 0;

            /**
             * MutationObserver
             */
            var observer;

            /**
             * Fired on an interval to report stats such as memory usage
             */
            function reportStats() {
                //
                // Memory
                //
                var mem = p &&
                    p.memory &&
                    p.memory.usedJSHeapSize;

                if (mem) {
                    t.set("mem", mem);
                }

                //
                // DOM sizes (bytes) and length (node count)
                //
                domLength = d.getElementsByTagName("*").length;

                t.set("domsz", d.documentElement.innerHTML.length);
                t.set("domln", domLength);

                //
                // DOM mutations
                //
                if (mutationCount > 0) {
                    // report as % of DOM size
                    var deltaPct = Math.min(Math.round(mutationCount / domLength * 100), 100);

                    t.set("mut", deltaPct);

                    mutationCount = 0;
                }
            }

            /**
             * Fired when the battery level changes
             */
            function onBatteryLevelChange() {
                if (!enabled || !battery) {
                    return;
                }

                t.set("bat", battery.level);
            }

            /**
             * Fired on MutationObserver callback
             */
            function onMutationObserver(mutations) {
                mutations.forEach(function(mutation) {
                    // only listen for childList changes
                    if (mutation.type !== "childList") {
                        return;
                    }

                    for (var i = 0; i < mutation.addedNodes.length; i++) {
                        var node = mutation.addedNodes[i];

                        // add mutations for this node and all sub-nodes
                        mutationCount++;
                        mutationCount += node.getElementsByTagName ?
                            node.getElementsByTagName("*").length : 0;
                    }
                });
            }

            /**
             * Stops this monitor
             */
            function stop() {
                enabled = false;

                // stop reporting on metrics
                if (reportInterval) {
                    clearInterval(reportInterval);
                    reportInterval = false;
                }

                // disconnect MO
                if (observer) {
                    observer.disconnect();
                }

                // stop listening for battery info
                if (battery) {
                    battery.onlevelchange = null;
                }
            }

            //
            // Setup
            //

            // misc stats
            reportInterval = setInterval(reportStats, REPORT_INTERVAL);

            // Battery
            if (w.navigator && typeof w.navigator.getBattery === "function") {
                w.navigator.getBattery().then(function(b) {
                    battery = b;

                    battery.onlevelchange = onBatteryLevelChange;
                });
            }

            // MutationObserver
            if (typeof w.MutationObserver === "function") {
                observer = new w.MutationObserver(onMutationObserver);

                // configure the observer
                observer.observe(d, { childList: true, subtree: true });
            }

            return {
                stop: stop
            };
        };

        //
        // Continuity implementation
        //
        impl = {
            //
            // Config
            //
            /**
             * Whether or not to monitor longTasks
             */
            monitorLongTasks: true,

            /**
             * Whether or not to monitor Page Busy
             */
            monitorPageBusy: true,

            /**
             * Whether or not to monitor FPS
             */
            monitorFrameRate: true,

            /**
             * Whether or not to monitor interactions
             */
            monitorInteractions: true,

            /**
             * Whether or not to monitor page stats
             */
            monitorStats: true,

            /**
             * Whether to monitor for interactions after onload
             */
            afterOnload: true,

            /**
             * Max recording length after onload (if not a SPA) (ms)
             */
            afterOnloadMaxLength: DEFAULT_AFTER_ONLOAD_MAX_LENGTH,

            /**
             * Minium number of ms after an interaction to wait before sending
             * an interaction beacon
             */
            afterOnloadMinWait: 5000,

            /**
             * Number of milliseconds after onload to wait for TTI, or,
             * false if not configured.
             */
            waitAfterOnload: false,

            /**
             * Whether or not to wait for a call to
             * frameworkReady() before starting TTI calculations
             */
            ttiWaitForFrameworkReady: false,

            /**
             * If set, wait for the specified CSS selector of hero images to have
             * loaded before starting TTI calculations
             */
            ttiWaitForHeroImages: false,

            /**
             * Whether or not to send a detailed log of all events.
             */
            sendLog: true,

            /**
             * Whether or not to send a compressed timeline of events
             */
            sendTimeline: true,

            //
            // State
            //
            /**
             * Whether or not we're initialized
             */
            initialized: false,

            /**
             * Whether we're ready to send a beacon
             */
            complete: false,

            /**
             * Whether or not this is an SPA app
             */
            isSpa: false,

            /**
             * Whether Page Ready has fired or not
             */
            firedPageReady: false,

            /**
             * Whether or not we're currently monitoring for interactions
             * after the Page Load beacon
             */
            afterOnloadMonitoring: false,

            /**
             * Framework Ready time, if configured
             */
            frameworkReady: null,

            /**
             * Timeline
             */
            timeline: null,

            /**
             * LongTaskMonitor
             */
            longTaskMonitor: null,

            /**
             * PageBusyMonitor
             */
            pageBusyMonitor: null,

            /**
             * FrameRateMonitor
             */
            frameRateMonitor: null,

            /**
             * InteractionMonitor
             */
            interactionMonitor: null,

            /**
             * ScrollMontior
             */
            scrollMonitor: null,

            /**
             * ClickMonitor
             */
            clickMonitor: null,

            /**
             * KeyMonitor
             */
            keyMonitor: null,

            /**
             * MouseMonitor
             */
            mouseMonitor: null,

            /**
             * VisibilityMonitor
             */
            visibilityMonitor: null,

            /**
             * OrientationMonitor
             */
            orientationMonitor: null,

            /**
             * StatsMonitor
             */
            statsMonitor: null,

            /**
             * Vars we added to the beacon
             */
            addedVars: [],

            /**
             * All possible monitors
             */
            monitors: [
                "timeline",
                "longTaskMonitor",
                "pageBusyMonitor",
                "frameRateMonitor",
                "scrollMonitor",
                "keyMonitor",
                "clickMonitor",
                "mouseMonitor",
                "interactionMonitor",
                "visibilityMonitor",
                "orientationMonitor",
                "statsMonitor"
            ],

            /**
             * When we last sent a beacon
             */
            timeOfLastBeacon: 0,

            /**
             * Whether or not we've added data to this beacon
             */
            hasAddedDataToBeacon: false,

            //
            // Callbacks
            //
            /**
             * Callback before the beacon is going to be sent
             */
            onBeforeBeacon: function() {
                impl.runAllAnalyzers();
            },

            /**
             * Runs all analyzers
             */
            runAllAnalyzers: function() {
                var i, mon;

                if (impl.hasAddedDataToBeacon) {
                    // don't add data twice
                    return;
                }

                for (i = 0; i < impl.monitors.length; i++) {
                    mon = impl[impl.monitors[i]];

                    if (mon && typeof mon.analyze === "function") {
                        mon.analyze(impl.timeOfLastBeacon);
                    }
                }

                // add last time the data was reset, if ever
                impl.addToBeacon("c.lb", impl.timeOfLastBeacon ? impl.timeOfLastBeacon.toString(36) : 0);

                // keep track of when we last added data
                impl.timeOfLastBeacon = BOOMR.now();

                // note we've added data
                impl.hasAddedDataToBeacon = true;
            },

            /**
             * Callback after the beacon is ready to send, so we can clear
             * our added vars and do other cleanup.
             */
            onBeacon: function() {
                var i;

                // remove added vars
                if (impl.addedVars && impl.addedVars.length > 0) {
                    BOOMR.removeVar(impl.addedVars);

                    impl.addedVars = [];
                }

                // let any other monitors know that a beacon was sent
                for (i = 0; i < impl.monitors.length; i++) {
                    var monitor = impl[impl.monitors[i]];

                    if (monitor) {
                        // disable ourselves if we're not doing anything after the first beacon
                        if (!impl.afterOnload) {
                            if (typeof monitor.stop === "function") {
                                monitor.stop();
                            }
                        }

                        // notify all plugins that there's been a beacon
                        if (typeof monitor.onBeacon === "function") {
                            monitor.onBeacon();
                        }
                    }
                }

                // we haven't added data any more
                impl.hasAddedDataToBeacon = false;
            },

            /**
             * Callback when an XHR load happens
             */
            onXhrLoad: function(data) {
                // note this is an SPA for later
                if (data && BOOMR.utils.inArray(data.initiator, BOOMR.constants.BEACON_TYPE_SPAS)) {
                    impl.isSpa = true;
                }

                if (data && data.initiator === "spa_hard") {
                    impl.onPageReady();
                }
            },

            /**
             * Callback when the page is ready
             */
            onPageReady: function() {
                impl.firedPageReady = true;

                //
                // If we're monitoring interactions after onload, set a timer to
                // disable them if configured
                //
                if (impl.afterOnload &&
                    impl.monitorInteractions) {
                    impl.afterOnloadMonitoring = true;

                    // disable after the specified amount if not a SPA
                    if (!impl.isSpa && typeof impl.afterOnloadMaxLength === "number") {
                        setTimeout(function() {
                            impl.afterOnloadMonitoring = false;
                        }, impl.afterOnloadMaxLength);
                    }
                }

                if (impl.waitAfterOnload) {
                    var start = BOOMR.now();

                    setTimeout(function checkTti() {
                        // wait for up to the defined time after onload
                        if (BOOMR.now() - start > impl.waitAfterOnload) {
                            // couldn't calculate TTI, send the beacon anyways
                            impl.complete = true;
                            BOOMR.sendBeacon();
                        }
                        else {
                            // run the TTI calculation
                            impl.timeline.analyze();

                            // if we got something, mark as complete and send
                            if (externalMetrics.timeToInteractive()) {
                                impl.complete = true;
                                BOOMR.sendBeacon();
                            }
                            else {
                                // poll again
                                setTimeout(checkTti, TIME_TO_INTERACTIVE_WAIT_POLL_PERIOD);
                            }
                        }
                    }, TIME_TO_INTERACTIVE_WAIT_POLL_PERIOD);
                }
                else {
                    impl.complete = true;
                }
            },

            //
            // Misc
            //
            /**
             * Adds a variable to the beacon, tracking the names so we can
             * remove them later.
             *
             * @param {string} name Name
             * @param {string} val Value.  If 0 or undefined, the value is removed from the beacon.
             * @param {number} force Force adding the variable, even if 0
             */
            addToBeacon: function(name, val, force) {
                if ((val === 0 || typeof val === "undefined") && !force) {
                    BOOMR.removeVar(name);
                    return;
                }

                BOOMR.addVar(name, val);

                impl.addedVars.push(name);
            }
        };

        //
        // External Plugin
        //
        BOOMR.plugins.Continuity = {
            init: function(config) {
                // HACK: Since override for Continuity might not be in page's boomerang.
                config.Continuity = UW.BOOMR_config.Continuity;

                BOOMR.utils.pluginConfig(impl, config, "Continuity",
                    ["monitorLongTasks", "monitorPageBusy", "monitorFrameRate", "monitorInteractions",
                        "afterOnload", "afterOnloadMaxLength", "afterOnloadMinWait",
                        "waitAfterOnload", "ttiWaitForFrameworkReady", "ttiWaitForHeroImages",
                        "sendLog", "sendTimeline"]);

                if (impl.initialized) {
                    return this;
                }

                impl.initialized = true;

                // create the timeline
                impl.timeline = new Timeline(BOOMR.now());

                //
                // Setup
                //
                if (BOOMR.window) {
                    //
                    // LongTasks
                    //
                    if (impl.monitorLongTasks &&
                        typeof BOOMR.window.PerformanceObserver === "function" &&
                        BOOMR.window.PerformanceLongTaskTiming) {
                        impl.longTaskMonitor = new LongTaskMonitor(BOOMR.window, impl.timeline);
                    }

                    //
                    // Page Busy (if LongTasks aren't supported or aren't enabled)
                    //
                    if (impl.monitorPageBusy &&
                        (!BOOMR.window.PerformanceObserver || !BOOMR.window.PerformanceLongTaskTiming || !impl.monitorLongTasks)) {
                        impl.pageBusyMonitor = new PageBusyMonitor(BOOMR.window, impl.timeline);
                    }

                    //
                    // FPS
                    //
                    if (impl.monitorFrameRate && typeof BOOMR.window.requestAnimationFrame === "function") {
                        impl.frameRateMonitor = new FrameRateMonitor(BOOMR.window, impl.timeline);
                    }

                    //
                    // Interactions
                    //
                    if (impl.monitorInteractions) {
                        impl.interactionMonitor = new InteractionMonitor(BOOMR.window, impl.timeline, impl.afterOnloadMinWait);
                        impl.scrollMonitor = new ScrollMonitor(BOOMR.window, impl.timeline, impl.interactionMonitor);
                        impl.keyMonitor = new KeyMonitor(BOOMR.window, impl.timeline, impl.interactionMonitor);
                        impl.clickMonitor = new ClickMonitor(BOOMR.window, impl.timeline, impl.interactionMonitor);
                        impl.mouseMonitor = new MouseMonitor(BOOMR.window, impl.timeline, impl.interactionMonitor);
                        impl.visibilityMonitor = new VisibilityMonitor(BOOMR.window, impl.timeline, impl.interactionMonitor);
                        impl.orientationMonitor = new OrientationMonitor(BOOMR.window, impl.timeline, impl.interactionMonitor);
                    }

                    //
                    // Stats
                    //
                    if (impl.monitorStats) {
                        impl.statsMonitor = new StatsMonitor(BOOMR.window, impl.timeline, impl.interactionMonitor);
                    }
                }

                // add epoch to every beacon
                BOOMR.addVar("c.e", epoch.toString(36));

                // event handlers
                BOOMR.subscribe("before_beacon", impl.onBeforeBeacon, null, impl);
                BOOMR.subscribe("onbeacon", impl.onBeacon, null, impl);
                BOOMR.subscribe("page_ready", impl.onPageReady, null, impl);
                BOOMR.subscribe("xhr_load", impl.onXhrLoad, null, impl);

                return this;
            },

            is_complete: function() {
                return impl.complete;
            },

            /**
             * Signal that the framework is ready
             */
            frameworkReady: function() {
                impl.frameworkReady = BOOMR.now();
            },

            // external metrics
            metrics: externalMetrics

            /* BEGIN_DEBUG */,
            compressBucketLog: compressBucketLog,
            decompressBucketLog: decompressBucketLog,
            decompressBucketLogNumber: decompressBucketLogNumber,
            decompressLog: decompressLog
            /* END_DEBUG */
        };
    }());

    if (!foundBoomerang) {
        BOOMR.init();
    }
}