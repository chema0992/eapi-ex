// ==UserScript==
// @name         엔트리 WebWorker 비공식 블록 확장
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  엔트리에 WebWorker API 기능을 연결하기 위한 확장 유저스크립트
// @match        *://playentry.org/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 커스텀 보안 동의 및 코드 보기 모달 생성 함수
    function requestWorkerConsent(workerName, code) {
        return new Promise((resolve) => {
            // 기존 모달이 존재하면 제거
            const existing = document.getElementById('entry-worker-modal');
            if (existing) existing.remove();

            const modalHtml = `
            <div id="entry-worker-modal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.6); z-index:999999; display:flex; align-items:center; justify-content:center; font-family:sans-serif;">
                <div style="background:#fff; width:480px; max-width:90%; padding:24px; border-radius:12px; box-shadow:0 10px 25px rgba(0,0,0,0.3); text-align:left;">
                    <h3 style="margin-top:0; color:#d9534f; font-size:18px;">⚠️ [WebWorker 보안 경고]</h3>
                    <p style="font-size:14px; color:#333; line-height:1.5;">
                        작품에서 커스텀 자바스크립트 Worker (<b>${workerName}</b>) 실행을 요청했습니다.<br>
                        신뢰할 수 없는 작품이라면 실행을 취소하세요.
                    </p>

                    <button id="worker-modal-toggle-btn" style="background:#f0f0f0; border:1px solid #ccc; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:13px; margin-bottom:12px;">
                        📄 코드 보기 / 숨기기
                    </button>

                    <div id="worker-modal-code-view" style="display:none; max-height:200px; overflow-y:auto; background:#1e1e1e; color:#d4d4d4; padding:12px; border-radius:6px; font-family:monospace; font-size:12px; white-space:pre-wrap; word-break:break-all; margin-bottom:16px;">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

                    <div style="display:flex; justify-height:flex-end; gap:8px; margin-top:16px;">
                        <button id="worker-modal-cancel-btn" style="flex:1; background:#e0e0e0; border:none; padding:10px; border-radius:6px; cursor:pointer; font-weight:bold;">취소 (실행 안함)</button>
                        <button id="worker-modal-approve-btn" style="flex:1; background:#5b59a7; color:#fff; border:none; padding:10px; border-radius:6px; cursor:pointer; font-weight:bold;">허용 및 실행</button>
                    </div>
                </div>
            </div>
        `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            const modal = document.getElementById('entry-worker-modal');
            const toggleBtn = document.getElementById('worker-modal-toggle-btn');
            const codeView = document.getElementById('worker-modal-code-view');
            const cancelBtn = document.getElementById('worker-modal-cancel-btn');
            const approveBtn = document.getElementById('worker-modal-approve-btn');

            // 코드 토글
            toggleBtn.onclick = () => {
                codeView.style.display = codeView.style.display === 'none' ? 'block' : 'none';
            };

            // 거부
            cancelBtn.onclick = () => {
                modal.remove();
                resolve(false);
            };

            // 승인
            approveBtn.onclick = () => {
                modal.remove();
                resolve(true);
            };
        });
    }

    window.EAPI = window.EAPI || { modules: [], categories: [] };

    // 1. EAPI 카테고리 등록 (WebWorker - 테마 색상: 보라/남색 계열)
    if (!window.EAPI.categories.some(c => c.category === 'WebWorker')) {
        window.EAPI.categories.push({
            category: 'WebWorker',
            displayName: 'Worker',
            color: '#5b59a7',
            fontColor: '#ffffff',
            visible: true
        });
    }

    // WebWorker 카테고리에 등록할 블록 ID 목록
    const webWorkerBlocks = [
        'worker_create_preset',
        'worker_create_custom_js',
        'worker_post_message',
        'worker_get_latest_message',
        'worker_has_new_message',
        'worker_terminate',
        'worker_terminate_all',
        'worker_list_to_json',
        'worker_fill_result_to_list',
        'worker_is_running',
        'worker_get_latest_error',
    ];

    // 워커 내부 실행 소스코드 프리셋 정의 (추가된 부분)
    const WORKER_PRESETS = {
        sort: `
            self.onmessage = function(e) {
                const arr = Array.isArray(e.data) ? e.data : [];
                arr.sort((a, b) => a - b);
                self.postMessage({ result: arr });
            };
        `,
        prime: `
            self.onmessage = function(e) {
                const max = Number(e.data) || 100;
                const primes = [];
                for (let i = 2; i <= max; i++) {
                    let isPrime = true;
                    for (let j = 2; j * j <= i; j++) {
                        if (i % j === 0) { isPrime = false; break; }
                    }
                    if (isPrime) primes.push(i);
                }
                self.postMessage({ result: primes });
            };
        `,
        fibonacci: `
            self.onmessage = function(e) {
                const n = Number(e.data) || 10;
                function fib(num) {
                    if (num <= 1) return num;
                    return fib(num - 1) + fib(num - 2);
                }
                self.postMessage({ result: fib(n) });
            };
        `
    };

    // 2. EAPI 모듈 등록
    window.EAPI.modules.push({
        name: 'WebWorker Extension',
        init: function(targetWindow, Entry, EntryStatic, $) {
            console.log('[WebWorker Extension] 모듈 주입 시작');

            // WebWorker 기본 컬러 테마
            const defaultColor = { color: '#5b59a7', outerline: '#403e7a', fontColor: '#ffffff' };

            // 블록 추가용 헬퍼 함수
            const addBlock = (blockname, template, color = defaultColor, params = { params: [], def: [], map: {} }, _class = 'default', func, skeleton = 'basic') => {
                Entry.block[blockname] = {
                    color: color.color,
                    outerLine: color.outerline,
                    fontColor: color.fontColor || '#ffffff',
                    skeleton: skeleton,
                    statement: [],
                    params: params.params,
                    events: {},
                    def: {
                        params: params.def,
                        type: blockname
                    },
                    paramsKeyMap: params.map,
                    class: _class ? _class : 'default',
                    func: func,
                    template: template
                };
            };

            // WebWorker 상태 및 워커 인스턴스 관리 객체 초기화
            if (!targetWindow.__ENTRY_WEBWORKER__) {
                targetWindow.__ENTRY_WEBWORKER__ = {
                    workers: {},     // 생성된 Worker 인스턴스 관리
                    messages: {}     // 수신된 최신 메시지/결과 저장용
                };
            }

            addBlock(
                'worker_create_preset',
                '워커 %1 생성하기 (유형: %2) %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        {
                            type: 'Dropdown',
                            options: [
                                [' 대용량 정렬 ', 'sort'],
                                [' 소수(Prime) 탐색 ', 'prime'],
                                [' 피보나치 연산 ', 'fibonacci']
                            ],
                            fontSize: 11,
                            arrowColor: '#5b59a7',
                            value: 'sort'
                        },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['worker_0'] },
                        null,
                        null
                    ],
                    map: { WORKER_NAME: 0, PRESET_TYPE: 1 }
                },
                'text',
                (sprite, script) => {
                    const workerName = script.getStringValue('WORKER_NAME', script);
                    const presetType = script.getField('PRESET_TYPE', script) || script.getStringValue('PRESET_TYPE', script) || 'sort';

                    const state = targetWindow.__ENTRY_WEBWORKER__;
                    if (!state) return script.callReturn();

                    // 동일한 이름의 워커가 이미 존재하면 종료 후 재생성
                    if (state.workers && state.workers[workerName]) {
                        try { state.workers[workerName].terminate(); } catch (e) {}
                    }

                    const code = WORKER_PRESETS[presetType];
                    if (!code) {
                        console.error(`[WebWorker Extension] 존재하지 않는 프리셋 유형입니다: ${presetType}`);
                        return script.callReturn();
                    }

                    try {
                        const blob = new Blob([code], { type: 'application/javascript' });
                        const blobUrl = URL.createObjectURL(blob);
                        const worker = new Worker(blobUrl);

                        if (!state.messages) state.messages = {};
                        state.messages[workerName] = {
                            latest: '',
                            raw: null,
                            lastError: '',
                            hasNew: false
                        };

                        worker.onmessage = function(e) {
                            const response = e.data;
                            const resultVal = (response && response.result !== undefined) ? response.result : response;

                            state.messages[workerName] = {
                                latest: typeof resultVal === 'object' ? JSON.stringify(resultVal) : String(resultVal),
                                raw: resultVal,
                                hasNew: true,
                                timestamp: Date.now()
                            };
                            console.log(`[WebWorker Extension] '${workerName}' 메시지 수신 완료:`, resultVal);
                        };

                        worker.onerror = function(err) {
                            if (state.messages[workerName]) {
                                state.messages[workerName].lastError = err.message || '알 수 없는 에러가 발생했습니다.';
                            }
                            console.error(`[WebWorker Extension] '${workerName}' 오류 발생:`, err.message);
                        };

                        state.workers[workerName] = worker;
                        console.log(`[WebWorker Extension] 워커 '${workerName}' 생성 완료 (유형: ${presetType})`);
                    } catch (e) {
                        console.error(`[WebWorker Extension] 프리셋 워커 생성 실패:`, e);
                    }

                    return script.callReturn();
                }
            );

            // 1. 워커에게 메시지 전송 블록
            addBlock(
                'worker_post_message',
                '워커 %1 에게 메시지 %2 보내기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['worker_0'] },
                        { type: 'text', params: ['[10, 5, 2, 8]'] },
                        null
                    ],
                    map: { WORKER_NAME: 0, MSG: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBWORKER__;
                    if (!state || !state.workers) return script.callReturn();

                    const workerName = script.getStringValue('WORKER_NAME', script);
                    const rawMsg = script.getStringValue('MSG', script);

                    const worker = state.workers[workerName];
                    if (!worker) {
                        console.warn(`[WebWorker Extension] '${workerName}' 워커를 찾을 수 없습니다.`);
                        return script.callReturn();
                    }

                    let dataToSend = rawMsg;
                    try { dataToSend = JSON.parse(rawMsg); } catch (e) {}

                    if (state.messages && state.messages[workerName]) {
                        state.messages[workerName].hasNew = false;

                        // 기존 타이머가 남아있으면 초기화
                        if (state.messages[workerName].watchdogTimer) {
                            clearTimeout(state.messages[workerName].watchdogTimer);
                        }

                        // [Watchdog] 메시지 전송 시 5초 응답 타이머 작동
                        state.messages[workerName].watchdogTimer = setTimeout(() => {
                            if (state.workers && state.workers[workerName]) {
                                console.warn(`[WebWorker Watchdog] '${workerName}' 워커가 5초 동안 응답하지 않아 무한 루프/다운 방지를 위해 강제 종료(terminate)되었습니다.`);
                                try { state.workers[workerName].terminate(); } catch (e) {}
                                delete state.workers[workerName];
                            }
                        }, 5000);
                    }

                    worker.postMessage(dataToSend);
                    console.log(`[WebWorker Extension] '${workerName}' 로 데이터 전송 완료:`, dataToSend);

                    return script.callReturn();
                }
            );

            // 2. 최근 수신 메시지 가져오기 (값 블록)
            addBlock(
                'worker_get_latest_message',
                '워커 %1 (으)로부터 받은 최근 메시지',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['worker_0'] }
                    ],
                    map: { WORKER_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBWORKER__;
                    if (!state || !state.messages) return '';

                    const workerName = script.getStringValue('WORKER_NAME', script);
                    const msgObj = state.messages[workerName];

                    return msgObj ? (msgObj.latest || '') : '';
                },
                'basic_string_field'
            );

            // 3. 새 메시지 수신 여부 확인 (판단 블록)
            addBlock(
                'worker_has_new_message',
                '워커 %1 (으)로부터 새 메시지를 받았는가?',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['worker_0'] }
                    ],
                    map: { WORKER_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBWORKER__;
                    if (!state || !state.messages) return false;

                    const workerName = script.getStringValue('WORKER_NAME', script);
                    const msgObj = state.messages[workerName];

                    if (msgObj && msgObj.hasNew) {
                        msgObj.hasNew = false; // 플래그를 1회성으로 소비
                        return true;
                    }

                    return false;
                },
                'basic_boolean_field'
            );

            // 1. 특정 워커 종료 (Terminate) 블록
            addBlock(
                'worker_terminate',
                '워커 %1 종료하기 %2',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['worker_0'] },
                        null
                    ],
                    map: { WORKER_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBWORKER__;
                    if (!state || !state.workers) return script.callReturn();

                    const workerName = script.getStringValue('WORKER_NAME', script);
                    const worker = state.workers[workerName];

                    if (worker) {
                        try {
                            worker.terminate();
                            delete state.workers[workerName];
                            if (state.messages) delete state.messages[workerName];
                            console.log(`[WebWorker Extension] 워커 '${workerName}' 종료 완료`);
                        } catch (e) {
                            console.error(`[WebWorker Extension] 워커 '${workerName}' 종료 중 오류 발생:`, e);
                        }
                    }

                    return script.callReturn();
                }
            );

            // 2. 모든 워커 종료 블록
            addBlock(
                'worker_terminate_all',
                '모든 워커 종료하기 %1',
                defaultColor,
                {
                    params: [
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        null
                    ],
                    map: {}
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBWORKER__;
                    if (!state || !state.workers) return script.callReturn();

                    Object.keys(state.workers).forEach((workerName) => {
                        try {
                            state.workers[workerName].terminate();
                        } catch (e) {}
                    });

                    state.workers = {};
                    state.messages = {};

                    console.log('[WebWorker Extension] 모든 워커 종료 및 정리 완료');
                    return script.callReturn();
                }
            );

            // 1. 엔트리 리스트의 데이터를 JSON 문자열로 변환하기 (값 블록)
            addBlock(
                'worker_list_to_json',
                '엔트리 리스트 %1 의 데이터를 JSON 문자열로 변환하기',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['리스트이름'] }
                    ],
                    map: { LIST_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const Entry = targetWindow.Entry;
                    if (!Entry || !Entry.variableContainer) return '[]';

                    const listName = script.getStringValue('LIST_NAME', script);
                    const list = Entry.variableContainer.getListByName
                    ? Entry.variableContainer.getListByName(listName)
                    : (Entry.variableContainer.lists_ || []).find(l => l.name === listName);

                    if (!list) {
                        console.warn(`[WebWorker Extension] 엔트리 리스트 '${listName}'를 찾을 수 없습니다.`);
                        return '[]';
                    }

                    let arr = [];
                    if (typeof list.getArray === 'function') {
                        arr = list.getArray().map(item => (item && item.data !== undefined) ? item.data : item);
                    } else if (list.array_) {
                        arr = list.array_.map(item => (item && item.data !== undefined) ? item.data : item);
                    }

                    return JSON.stringify(arr);
                },
                'basic_string_field'
            );

            // 워커의 수신 결과를 엔트리 리스트에 채우기 (오류 수정본)
            addBlock(
                'worker_fill_result_to_list',
                '워커 %1 의 수신 결과를 엔트리 리스트 %2 에 채우기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['worker_0'] },
                        { type: 'text', params: ['리스트이름'] },
                        null
                    ],
                    map: { WORKER_NAME: 0, LIST_NAME: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBWORKER__;
                    if (!state || !state.messages) return script.callReturn();

                    const workerName = script.getStringValue('WORKER_NAME', script);
                    const listName = script.getStringValue('LIST_NAME', script);

                    const msgObj = state.messages[workerName];
                    if (!msgObj || msgObj.raw === null || msgObj.raw === undefined) {
                        console.warn(`[WebWorker Extension] '${workerName}'의 수신 데이터가 없습니다.`);
                        return script.callReturn();
                    }

                    const Entry = targetWindow.Entry;
                    if (!Entry || !Entry.variableContainer) return script.callReturn();

                    const list = Entry.variableContainer.getListByName
                    ? Entry.variableContainer.getListByName(listName)
                    : (Entry.variableContainer.lists_ || []).find(l => l.name === listName);

                    if (list) {
                        let dataArray = msgObj.raw;
                        if (typeof dataArray === 'string') {
                            try { dataArray = JSON.parse(dataArray); } catch (e) {}
                        }
                        if (!Array.isArray(dataArray)) {
                            dataArray = [dataArray];
                        }

                        // 1. 기존 리스트 항목 초기화
                        if (typeof list.clear === 'function') {
                            list.clear();
                        } else if (typeof list.removeAll === 'function') {
                            list.removeAll();
                        } else {
                            list.array_ = [];
                        }

                        // 2. 엔트리 표준 appendValue API로 값 세팅 (UI 바인딩 유지)
                        dataArray.forEach((item) => {
                            const val = typeof item === 'object' ? JSON.stringify(item) : item;
                            if (typeof list.appendValue === 'function') {
                                list.appendValue(val);
                            } else if (list.array_) {
                                list.array_.push({ data: val });
                            }
                        });

                        // 3. 리스트 UI 갱신
                        if (typeof list.updateView === 'function') {
                            list.updateView();
                        }

                        console.log(`[WebWorker Extension] 엔트리 리스트 '${listName}'에 ${dataArray.length}개 항목 채우기 완료`);
                    } else {
                        console.warn(`[WebWorker Extension] 엔트리 리스트 '${listName}'를 찾을 수 없습니다.`);
                    }

                    return script.callReturn();
                }
            );

            // 3. 워커 동작 상태 확인 (판단 블록)
            addBlock(
                'worker_is_running',
                '워커 %1 이(가) 생성되어 동작 중인가?',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['worker_0'] }
                    ],
                    map: { WORKER_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBWORKER__;
                    if (!state || !state.workers) return false;

                    const workerName = script.getStringValue('WORKER_NAME', script);
                    const worker = state.workers[workerName];

                    return Boolean(worker);
                },
                'basic_boolean_field'
            );

            addBlock(
                'worker_create_custom_js',
                '워커 %1 생성하기 (JS 코드: %2) %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['worker_0'] },
                        { type: 'text', params: ['self.onmessage = (e) => { self.postMessage("수신됨: " + e.data); };'] },
                        null
                    ],
                    map: { WORKER_NAME: 0, CODE: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBWORKER__;
                    if (!state) return script.callReturn();

                    const workerName = script.getStringValue('WORKER_NAME', script);
                    const code = script.getStringValue('CODE', script);

                    // 1. Sanitizer 검증
                    const DANGEROUS_PATTERN = /\b(importScripts|fetch|XMLHttpRequest|WebSocket|eval|Function|Worker|indexedDB|location|navigator)\b/i;
                    if (DANGEROUS_PATTERN.test(code)) {
                        const matched = code.match(DANGEROUS_PATTERN)[0];
                        console.error(`[WebWorker Security Error] 금지된 키워드('${matched}')가 발견되어 실행이 차단되었습니다.`);
                        return script.callReturn();
                    }

                    // 2. 비블로킹(Non-blocking) 커스텀 모달 사용자 동의 처리
                    if (!state.userConsented) {
                        if (!state.modalStatus) {
                            state.modalStatus = 'PENDING';

                            // 개발자 도구 콘솔 선출력
                            console.group(`[WebWorker Extension] 커스텀 워커 '${workerName}' 소스코드`);
                            console.log(code);
                            console.groupEnd();

                            requestWorkerConsent(workerName, code).then((approved) => {
                                state.modalStatus = approved ? 'APPROVED' : 'DENIED';
                            });
                        }

                        // 사용자가 버튼을 누를 때까지 callReturn()을 호출하지 않고 script를 반환하여 블록 대기 상태 유지
                        if (state.modalStatus === 'PENDING') {
                            return script;
                        }

                        if (state.modalStatus === 'DENIED') {
                            state.modalStatus = null;
                            console.warn(`[WebWorker Extension] 사용자가 커스텀 워커 실행을 거부했습니다.`);
                            return script.callReturn();
                        }

                        if (state.modalStatus === 'APPROVED') {
                            state.userConsented = true;
                            state.modalStatus = null;
                        }
                    }

                    // 3. 기존 워커 Cleanup 및 인스턴스화
                    if (state.workers && state.workers[workerName]) {
                        try { state.workers[workerName].terminate(); } catch (e) {}
                    }

                    try {
                        const blob = new Blob([code], { type: 'application/javascript' });
                        const blobUrl = URL.createObjectURL(blob);
                        const worker = new Worker(blobUrl);

                        if (!state.messages) state.messages = {};
                        state.messages[workerName] = { latest: '', raw: null, hasNew: false, watchdogTimer: null };

                        worker.onmessage = function(e) {
                            if (state.messages[workerName] && state.messages[workerName].watchdogTimer) {
                                clearTimeout(state.messages[workerName].watchdogTimer);
                                state.messages[workerName].watchdogTimer = null;
                            }
                            const response = e.data;
                            const resultVal = (response && response.result !== undefined) ? response.result : response;

                            state.messages[workerName].latest = typeof resultVal === 'object' ? JSON.stringify(resultVal) : String(resultVal);
                            state.messages[workerName].raw = resultVal;
                            state.messages[workerName].hasNew = true;
                        };

                        worker.onerror = function(err) {
                            console.error(`[WebWorker Extension] '${workerName}' 오류:`, err.message);
                        };

                        state.workers[workerName] = worker;
                        console.log(`[WebWorker Extension] 커스텀 JS 워커 '${workerName}' 생성 완료`);
                    } catch (e) {
                        console.error(`[WebWorker Extension] 워커 생성 실패:`, e);
                    }

                    return script.callReturn();
                }
            );

            // 워커의 최근 오류 메시지 가져오기 (값 블록)
            addBlock(
                'worker_get_latest_error',
                '워커 %1 의 최근 오류 메시지',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['worker_0'] }
                    ],
                    map: { WORKER_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBWORKER__;
                    if (!state || !state.messages) return '';

                    const workerName = script.getStringValue('WORKER_NAME', script);
                    const msgObj = state.messages[workerName];

                    return msgObj ? (msgObj.lastError || '') : '';
                },
                'basic_string_field'
            );

            // EntryStatic.getAllBlocks 오버라이딩
            if (EntryStatic && typeof EntryStatic.getAllBlocks === 'function') {
                const originalGetAllBlocks = EntryStatic.getAllBlocks;
                EntryStatic.getAllBlocks = () => {
                    const blocks = originalGetAllBlocks();
                    const hasCustom = blocks.find(c => c.category === 'WebWorker');
                    if (!hasCustom) {
                        blocks.push({ category: 'WebWorker', blocks: webWorkerBlocks });
                    }
                    return blocks;
                };
            }

            console.log('[WebWorker Extension] 모듈 주입 완료');
        }
    });

    // 3. EAPI Core가 이미 완료된 경우 갱신
    if (typeof window.EAPI.render === 'function') {
        window.EAPI.render();
    }
})();
