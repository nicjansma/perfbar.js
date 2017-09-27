// ==UserScript==
// @name         DebugBar
// @namespace    http://nicj.net
// @version      0.1
// @author       Nic Jansma
// @grant        none
// @run-at       document-start
// @include      *
// @noframes
// ==/UserScript==

(function() {
    //
    // Utility functions
    //
    /**
     * Adds a SCRIPT to the current page
     *
     * @param {string} src Script source
     * @param {function} callback Callback function
     */
    function addScript(src, callback) {
        var s = document.createElement('script');
        s.setAttribute('src', src);

        if (callback) {
            s.onload = callback;
        }

        document.head.appendChild(s);
    }

    function addScriptUnless(src, unless, callback) {
        if (unless) {
            if (callback) {
                returncallback();
            }
        } else {
            addScript(src, callback);
        }
    }

    /**
     * Adds a CSS to the current page
     *
     * @param {string} src CSS source
     */
    function addCss(src) {
        var s = document.createElement('link');
        s.setAttribute('href', src);
        s.setAttribute('rel', 'stylesheet');
        document.head.appendChild(s);
    }

    //
    // Local Members
    //

    //
    // Constants
    //

    // dimensions
    var TOOLBAR_HEIGHT = 30;

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

        /**
         * Initializes the graph
         */
        function init() {
            if (toolBar$) {
                return;
            }

            cssobj({
                "#debugbar": {
                    color: "white"
                },
                ".debugbar-section": {
                    display: "inline-block",
                    height: "25px",
                    padding: "5px 0 0 5px",
                    "margin-left": "20px",
                    "border-left": "solid 2px #ccc",
                    "&:first-child": {
                        "border-left": "none",
                        "margin-left": 0,
                    }
                },
                ".debugbar-section-title": {
                    display: "inline-block",
                    "font-weight": "bold"
                },
                ".debugbar-component": {
                    display: "inline-block",
                    padding: "0 5px 0 5px",
                    "border-right": "1px solid #aaa",
                    // width: "80px",
                    "&:last-child": {
                        "border-right": "none"
                    }
                },
                ".debugbar-component-title": {
                    display: "inline-block",
                    color: "#aaa",
                    padding: "0 5px 0 0"
                },
                ".debugbar-component-value": {
                    display: "inline-block",
                    "font-weight": "bold",
                    padding: "0 5px 0 0"
                },
                "button.debugbar-button": {
                    display: "inline-block",
                    height: "22px",
                    margin: "0 5px 0 5px",
                    padding: "0 5px",
                    "font-size": "12px",
                    background: "#999",
                    border: "1px solid #666",
                    "&.active": {
                        background: "green",
                    }
                },
            });

            // dynamic CSS
            // $("<style>").prop("type", "text/css").html(".rickshaw_legend .line { display: inline-block }").appendTo("head");

            // graph template
            toolBar$ = $('<div id="debugbar">')
                .css({
                    height: TOOLBAR_HEIGHT,
                    position: 'fixed',
                    "z-index": 100,
                    top: $(window).height() - TOOLBAR_HEIGHT,
                    background: "#404040",
                    opacity: 0.9,
                    "box-shadow": "inset 0 0 10px 1px #000"
                });

            // fill the screen width
            toolBar$.width(screen.width);


            // add our graph to the body
            $('body').prepend(toolBar$);

            // Make sure to update the height on resize
            $(window).resize(updateToolbarHeight);
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
                var section$ = $("<div>").addClass("debugbar-section").css(css || {});
                section$.append($("<div>").addClass("debugbar-section-title").text(section));

                sections[section] = {
                    components: {},
                    $: section$
                };

                toolBar$.append(sections[section].$);

                (components || []).forEach(function(comp) {
                    // create the dom
                    var div$ = $("<div>").addClass("debugbar-component");
                    div$.append($("<div>").addClass("debugbar-component-title").text(comp));
                    div$.append($("<div>").addClass("debugbar-component-value").text("--"));

                    sections[section].components[comp] = {
                        $: div$
                    };

                    sections[section].$.append(sections[section].components[comp].$);
                });
            }
        }

        function update(section, component, text) {
            sections[section].components[component].$.find(".debugbar-component-value").text(text);
        }

        function addButton(section, name, callback) {
            // create the dom
            var div$ = $("<button>").addClass("debugbar-button").text(name);

            sections[section].components[name] = {
                $: div$
            };

            div$.on("click", callback);

            sections[section].$.append(sections[section].components[name].$);
        }

        return {
            init: init,
            register: register,
            update: update,
            addButton: addButton
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
        function updateTiming(name, start, end) {
            if (start && end) {
                tb.update("Timings", name, end - start);
            }
        }

        function updateTimings() {
            var tti = window.BOOMR && BOOMR.plugins && BOOMR.plugins.Continuity && BOOMR.plugins.Continuity.tti;

            updateTiming("DNS", performance.timing.domainLookupStart, performance.timing.domainLookupEnd);
            updateTiming("TCP", performance.timing.connectStart, performance.timing.connectEnd);
            updateTiming("Req", performance.timing.requestStart, performance.timing.responseStart);
            updateTiming("Res", performance.timing.responseStart, performance.timing.responseEnd);
            updateTiming("DOM", performance.timing.navigationStart, performance.timing.domContentLoadedEventStart);
            updateTiming("Load", performance.timing.navigationStart, performance.timing.loadEventStart);
            updateTiming("TTI", performance.timing.navigationStart, tti);

            if (!performance.timing.loadEventStart || !tti) {
                setTimeout(updateTimings, 100);
            }
        }

        function init() {
            tb.register("Timings", ["DNS", "TCP", "Req", "Res", "DOM", "Load", "TTI"]);

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

        // total frames seen
        var totalFrames = 0;

        // time we started monitoring
        var frameStartTime = performance.now();

        /**
         * requestAnimationFrame callback
         */
        function frame() {
            totalFrames++;

            // request the next frame
            window.requestAnimationFrame(frame);
        }

        function reportFps() {
            tb.update("Realtime", "FPS", totalFrames);

            totalFrames = 0;
            frameStartTime = performance.now();
        }

        // start out the first frame
        window.requestAnimationFrame(frame);

        function init() {
            tb.register("Realtime", ["FPS"]);

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
        function updateResources() {
            if (!BOOMR || !BOOMR.plugins) {
                // TODO
                setTimeout(updateResources, 500);
                return;
            }

            var resources = BOOMR.plugins.ResourceTiming.getFilteredResourceTiming();

            tb.update("Resources", "#", resources.length);
            tb.update("Resources", "KB", Math.floor(resources.reduce(function(sum, res) {
                return sum + (res.transferSize ? res.transferSize : 0);
            }, 0) / 1024));
        }

        function init() {
            tb.register("Resources", ["#", "KB", "Offload %", "Offload KB", "Edge"]);

            $(window).load(updateResources);
        }

        return {
            init: init
        };
    })(toolBar));

    //
    // Controls
    //
    components.push((function(tb) {
        var jankInterval;

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

        function toggleJank(e) {
            var el$ = $(e.target);

            if (el$.hasClass("active")) {
                el$.removeClass("active");

                clearInterval(jankInterval);
                jankInterval = false;
            } else {
                el$.addClass("active");

                jankInterval = setInterval(jank, 500);
            }
        }

        function init() {
            tb.register("Controls", [], {
                float: "right",
                "margin-right": "20px"
            });

            tb.addButton("Controls", "Jank", toggleJank);
        }

        return {
            init: init
        };
    })(toolBar));

    //
    // General initialization
    //
    function init() {
        toolBar.init();

        for (var i = 0; i < components.length; i++) {
            components[i].init();
        }
    }

    //
    // CSS dependencies
    //
    // addCss('//cdnjs.cloudflare.com/ajax/libs/rickshaw/1.5.1/rickshaw.min.css');

    //
    // load dependencies
    //
    addScriptUnless("//cdnjs.cloudflare.com/ajax/libs/jquery/2.2.4/jquery.min.js", window.$, function() {
        addScriptUnless("//cdnjs.cloudflare.com/ajax/libs/cssobj/1.2.1/cssobj.iife.js", window.cssobj, init);
    });
})();