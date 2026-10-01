// ==UserScript==
// @name         Entry EAPI Core
// @namespace    http://tampermonkey.net/
// @version      1.3.5
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
    var didRender = false;

    function injectModules() {
        if (!window.EAPI || !window.EAPI.modules) return;
        window.EAPI.modules.forEach(function (module) {
            if (typeof module.init === "function" && !module.injected) {
                try {
                    module.init(targetWindow, Entry, EntryStatic, jq);
                    module.injected = true;
                } catch (e) {
                    console.error("[EAPI Core] module init error:", module.name || "unknown", e);
                }
            }
        });
    }

    function renderEAPI() {
        // 재진입/중복 생성 차단 (module.init이 render를 다시 호출하는 경우)
        if (didRender) return;

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

        var CATEGORY_ORDER = ["WebGL", "WASM", "WebAudio", "Worker", "Storage"];

        uniqueCustomCategories.sort(function (a, b) {
            var ai = CATEGORY_ORDER.indexOf(a.category);
            var bi = CATEGORY_ORDER.indexOf(b.category);
            if (ai < 0) ai = 999;
            if (bi < 0) bi = 999;
            return ai - bi;
        });

        if (!Entry.playground || !Entry.playground.mainWorkspace || !Entry.playground.blockMenu) {
            return;
        }

        // 생성 직전에 true → init 도중 재호출돼도 두 번 안 그림
        didRender = true;

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

        // 카테고리별 블록 이름 중복 제거
        if (Entry.playground.blockMenu._categoryData) {
            Entry.playground.blockMenu._categoryData.forEach(function (c) {
                if (c.blocks && c.blocks.length) {
                    c.blocks = c.blocks.filter(function (name, i, arr) {
                        return arr.indexOf(name) === i;
                    });
                }
            });
        }

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

    var lastModCount = -1;
    var stableMs = 0;

    var timer = setInterval(function () {
        var isIframe = false;
        var iframe = document.querySelector("iframe.project_iframe") || document.querySelector("iframe");
        if (iframe && iframe.contentWindow && iframe.contentWindow.Entry) {
            targetWindow = iframe.contentWindow;
            isIframe = true;
        }

        Entry = targetWindow.Entry;
        EntryStatic = targetWindow.EntryStatic;
        if (!Entry || !Entry.block) return;

        jq = targetWindow.$;

        // 불러오기 유지: 정의만 조기 등록
        injectModules();

        if (!isIframe && (!Entry.playground || !Entry.playground.mainWorkspace || !Entry.playground.blockMenu)) {
            return;
        }

        // 모듈 개수가 잠시 안 변할 때까지 대기 (카테고리 순서 안정화)
        var modCount = (window.EAPI.modules || []).length;
        if (modCount !== lastModCount) {
            lastModCount = modCount;
            stableMs = Date.now();
            return;
        }
        if (Date.now() - stableMs < 200) {
            return;
        }

        clearInterval(timer);
        console.log("[EAPI Core] Entry ready");

        window.EAPI.render = renderEAPI;
        renderEAPI();
    }, 50);
})();