// ==UserScript==
// @name         Entry EAPI Core
// @namespace    http://tampermonkey.net/
// @version      1.3.1
// @description  Entry loader, EAPI module init, category render
// @match        *://playentry.org/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    window.EAPI = window.EAPI || {
        modules: [],
        categories: [],
        render: null
    };

    var baseCategories = [
        { category: "start", visible: true },
        { category: "flow", visible: true },
        { category: "moving", visible: true },
        { category: "looks", visible: true },
        { category: "brush", visible: true },
        { category: "text", visible: true },
        { category: "sound", visible: true },
        { category: "judgement", visible: true },
        { category: "calc", visible: true },
        { category: "variable", visible: true },
        { category: "func", visible: true },
        { category: "analysis", visible: true },
        { category: "ai_utilize", visible: true },
        { category: "expansion", visible: true },
        { category: "arduino", visible: false }
    ];

    var targetWindow = window;
    var Entry;
    var EntryStatic;
    var jq;
    var modulesInjected = false;

    function injectModules() {
        if (modulesInjected || !window.EAPI || !window.EAPI.modules) {
            return;
        }
        var allOk = true;
        window.EAPI.modules.forEach(function (module) {
            if (typeof module.init === "function" && !module.injected) {
                try {
                    module.init(targetWindow, Entry, EntryStatic, jq);
                    module.injected = true;
                } catch (e) {
                    allOk = false;
                    console.error("[EAPI Core] module init error:", module.name || "unknown", e);
                }
            }
        });
        if (allOk) {
            modulesInjected = true;
            console.log("[EAPI Core] modules injected (early)");
        }
    }

    function renderEAPI() {
        injectModules();

        var uniqueCustomCategories = [];
        var seenCategoryKeys = new Set();
        (window.EAPI.categories || []).forEach(function (cat) {
            if (!seenCategoryKeys.has(cat.category)) {
                seenCategoryKeys.add(cat.category);
                uniqueCustomCategories.push(cat);
            }
        });
        window.EAPI.categories = uniqueCustomCategories;

        if (!Entry.playground || !Entry.playground.mainWorkspace || !Entry.playground.blockMenu) {
            return;
        }

        var finalCategories = baseCategories.slice();
        uniqueCustomCategories.forEach(function (cat) {
            var exists = finalCategories.some(function (c) {
                return c.category === cat.category;
            });
            if (!exists) {
                finalCategories.push(cat);
            }
        });

        Entry.playground.blockMenu._generateCategoryView(finalCategories);

        if (jq) {
            jq(".entryCategoryElementWorkspace")
                .not("#entryCategorytext")
                .attr("class", "entryCategoryElementWorkspace");
        }

        Entry.playground.blockMenu._categoryData = EntryStatic.getAllBlocks();

        uniqueCustomCategories.forEach(function (cat) {
            Entry.playground.blockMenu._generateCategoryCode(cat.category);
            if (jq) {
                var elem = jq("#entryCategory" + cat.category);
                if (elem.length) {
                    elem.text(cat.displayName || cat.category);
                    elem.css({
                        "background-color": cat.color || "#8E44AD",
                        "color": cat.fontColor || "#ffffff",
                        "width": "50",
                        "box-sizing": "border-box"
                    });
                }
            }
        });
    }

    var timer = setInterval(function () {
        var isIframe = false;
        var iframe = document.querySelector("iframe.project_iframe") || document.querySelector("iframe");
        if (iframe && iframe.contentWindow && iframe.contentWindow.Entry) {
            targetWindow = iframe.contentWindow;
            isIframe = true;
        }

        Entry = targetWindow.Entry;
        EntryStatic = targetWindow.EntryStatic;
        if (!Entry || !Entry.block) {
            return;
        }

        jq = targetWindow.$;

        injectModules();

        if (!isIframe && (!Entry.playground || !Entry.playground.mainWorkspace || !Entry.playground.blockMenu)) {
            return;
        }

        clearInterval(timer);
        console.log("[EAPI Core] Entry ready");

        window.EAPI.render = renderEAPI;
        renderEAPI();

        if (typeof Entry.addEventListener === "function") {
            Entry.addEventListener("loadComplete", function () {
                console.log("[EAPI Core] loadComplete re-render");
                renderEAPI();
            });
        }
    }, 50);
})();