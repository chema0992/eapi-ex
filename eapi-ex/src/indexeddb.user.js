// ==UserScript==
// @name         엔트리 IndexedDB 비공식 블록 확장
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  엔트리에 IndexedDB 로컬 데이터베이스 연동을 위한 확장 유저스크립트
// @match        *://playentry.org/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    window.EAPI = window.EAPI || { modules: [], categories: [] };

    // 1. EAPI 카테고리 등록 (IndexedDB - 테마 색상: 청록/민트 계열)
    if (!window.EAPI.categories.some(c => c.category === 'IndexedDB')) {
        window.EAPI.categories.push({
            category: 'IndexedDB',
            displayName: 'Storage',
            color: '#00897b',
            fontColor: '#ffffff',
            visible: true
        });
    }

    // IndexedDB 카테고리에 등록할 전체 블록 ID 목록
    const indexedDBBlocks = [
        'idb_open',
        'idb_open_multi_stores',
        'idb_is_ready',
        'idb_put',
        'idb_fetch',
        'idb_get_last_value',
        'idb_has_key',
        'idb_count',
        'idb_fetch_all',
        'idb_delete',
        'idb_clear',
        'idb_delete_db',
        'idb_load_to_entry_list',
    ];

    // 2. EAPI 모듈 등록
    window.EAPI.modules.push({
        name: 'IndexedDB Extension',
        init: function(targetWindow, Entry, EntryStatic, $) {
            console.log('[IndexedDB Extension] 모듈 주입 시작');

            // IndexedDB 기본 컬러 테마
            const defaultColor = { color: '#00897b', outerline: '#005b4f', fontColor: '#ffffff' };

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

            // IndexedDB 상태 및 데이터베이스 인스턴스 관리 객체 초기화
            if (!targetWindow.__ENTRY_INDEXEDDB__) {
                targetWindow.__ENTRY_INDEXEDDB__ = {
                    databases: {},
                    status: {},
                    errors: {},
                    requests: {},
                    lastResult: {},
                    reqSeq: 0
                };
            }

            // --- [1] DB 열기 블록 ---
            addBlock(
                'idb_open',
                'DB %1 (버전 %2) 열기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        { type: 'text', params: ['1'] },
                        null
                    ],
                    map: { DB_NAME: 0, VERSION: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    if (!state) return script.callReturn();

                    const dbName = script.getStringValue('DB_NAME', script);
                    const rawVersion = script.getStringValue('VERSION', script);
                    const version = parseInt(rawVersion, 10) || 1;

                    if (state.status[dbName] === 'READY' && state.databases[dbName]) {
                        return script.callReturn();
                    }

                    if (!state.status[dbName]) {
                        state.status[dbName] = 'PENDING';
                        state.errors[dbName] = '';

                        try {
                            const request = targetWindow.indexedDB.open(dbName, version);

                            request.onblocked = () => {
                                console.warn(`[IndexedDB Extension] DB '${dbName}' 업그레이드가 다른 연결에 의해 차단됨.`);
                            };

                            request.onupgradeneeded = (event) => {
                                const db = event.target.result;
                                if (!db.objectStoreNames.contains('store')) {
                                    db.createObjectStore('store');
                                }
                            };

                            request.onsuccess = (event) => {
                                const db = event.target.result;
                                db.onversionchange = () => {
                                    db.close();
                                    delete state.databases[dbName];
                                    state.status[dbName] = null;
                                };

                                state.databases[dbName] = db;
                                state.status[dbName] = 'READY';
                            };

                            request.onerror = (event) => {
                                state.errors[dbName] = event.target.error ? event.target.error.message : 'DB 열기 실패';
                                state.status[dbName] = 'ERROR';
                            };
                        } catch (e) {
                            state.errors[dbName] = e.message;
                            state.status[dbName] = 'ERROR';
                        }
                    }

                    if (state.status[dbName] === 'PENDING') return script;
                    return script.callReturn();
                }
            );

            // --- [NEW 1] DB 연결 상태 확인 (Boolean) ---
            addBlock(
                'idb_is_ready',
                'DB %1 이(가) 연결되었는가?',
                defaultColor,
                {
                    params: [{ type: 'Block', accept: 'string' }],
                    def: [{ type: 'text', params: ['my_db'] }],
                    map: { DB_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);
                    return Boolean(state && state.status[dbName] === 'READY' && state.databases[dbName]);
                },
                'basic_boolean_field'
            );

            // --- [2] 데이터 저장/수정 (PUT) ---
            addBlock(
                'idb_put',
                'DB %1 의 스토어 %2 에 키 %3 (으)로 값 %4 저장하기 %5',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        { type: 'text', params: ['store'] },
                        { type: 'text', params: ['user_1'] },
                        { type: 'text', params: ['홍길동'] },
                        null
                    ],
                    map: { DB_NAME: 0, STORE: 1, KEY: 2, VALUE: 3 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);
                    const storeName = script.getStringValue('STORE', script);
                    const key = script.getStringValue('KEY', script);
                    const val = script.getStringValue('VALUE', script);

                    const db = state && state.databases[dbName];
                    if (!db) return script.callReturn();

                    if (!script._reqKey) {
                        state.reqSeq += 1;
                        script._reqKey = `put_${dbName}_${storeName}_${key}_${state.reqSeq}`;
                    }
                    const reqKey = script._reqKey;

                    if (!state.requests[reqKey]) {
                        state.requests[reqKey] = 'PENDING';
                        try {
                            const tx = db.transaction([storeName], 'readwrite');
                            const store = tx.objectStore(storeName);
                            const req = store.put(val, key);

                            req.onsuccess = () => { state.requests[reqKey] = 'DONE'; };
                            req.onerror = (e) => {
                                state.errors[dbName] = e.target.error ? e.target.error.message : '저장 실패';
                                state.requests[reqKey] = 'ERROR';
                            };
                        } catch (e) {
                            state.errors[dbName] = e.message;
                            state.requests[reqKey] = 'ERROR';
                        }
                    }

                    if (state.requests[reqKey] === 'PENDING') return script;

                    delete state.requests[reqKey];
                    delete script._reqKey;
                    return script.callReturn();
                }
            );

            // --- [3] 데이터 읽어오기 요청 (GET) ---
            addBlock(
                'idb_fetch',
                'DB %1 의 스토어 %2 에서 키 %3 값 읽어오기 %4',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        { type: 'text', params: ['store'] },
                        { type: 'text', params: ['user_1'] },
                        null
                    ],
                    map: { DB_NAME: 0, STORE: 1, KEY: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);
                    const storeName = script.getStringValue('STORE', script);
                    const key = script.getStringValue('KEY', script);

                    const db = state && state.databases[dbName];
                    if (!db) return script.callReturn();

                    if (!script._reqKey) {
                        state.reqSeq += 1;
                        script._reqKey = `get_${dbName}_${storeName}_${key}_${state.reqSeq}`;
                    }
                    const reqKey = script._reqKey;

                    if (!state.requests[reqKey]) {
                        state.requests[reqKey] = 'PENDING';
                        try {
                            const tx = db.transaction([storeName], 'readonly');
                            const store = tx.objectStore(storeName);
                            const req = store.get(key);

                            req.onsuccess = (e) => {
                                const val = e.target.result;
                                state.lastResult[dbName] = (val !== undefined && val !== null)
                                    ? (typeof val === 'object' ? JSON.stringify(val) : String(val))
                                    : '';
                                state.requests[reqKey] = 'DONE';
                            };
                            req.onerror = (err) => {
                                state.errors[dbName] = err.target.error ? err.target.error.message : '읽기 실패';
                                state.requests[reqKey] = 'ERROR';
                            };
                        } catch (e) {
                            state.errors[dbName] = e.message;
                            state.requests[reqKey] = 'ERROR';
                        }
                    }

                    if (state.requests[reqKey] === 'PENDING') return script;

                    delete state.requests[reqKey];
                    delete script._reqKey;
                    return script.callReturn();
                }
            );

            // --- [4] 최근 읽어온 값 - Value ---
            addBlock(
                'idb_get_last_value',
                'DB %1 의 최근 읽어온 값',
                defaultColor,
                {
                    params: [{ type: 'Block', accept: 'string' }],
                    def: [{ type: 'text', params: ['my_db'] }],
                    map: { DB_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);
                    if (!state || !state.lastResult) return '';
                    const res = state.lastResult[dbName];
                    return res !== undefined ? String(res) : '';
                },
                'basic_string_field'
            );

            // --- [NEW 2] 키 존재 여부 확인 (Boolean) ---
            addBlock(
                'idb_has_key',
                'DB %1 의 스토어 %2 에 키 %3 이(가) 있는가?',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        { type: 'text', params: ['store'] },
                        { type: 'text', params: ['user_1'] }
                    ],
                    map: { DB_NAME: 0, STORE: 1, KEY: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);
                    const storeName = script.getStringValue('STORE', script);
                    const key = script.getStringValue('KEY', script);

                    const db = state && state.databases[dbName];
                    if (!db) return false;

                    if (!script._reqKey) {
                        state.reqSeq += 1;
                        script._reqKey = `has_${dbName}_${storeName}_${key}_${state.reqSeq}`;
                    }
                    const reqKey = script._reqKey;

                    if (!state.requests[reqKey]) {
                        state.requests[reqKey] = 'PENDING';
                        try {
                            const tx = db.transaction([storeName], 'readonly');
                            const store = tx.objectStore(storeName);
                            const req = store.getKey(key);

                            req.onsuccess = (e) => {
                                state.lastResult[reqKey] = e.target.result !== undefined;
                                state.requests[reqKey] = 'DONE';
                            };
                            req.onerror = () => {
                                state.lastResult[reqKey] = false;
                                state.requests[reqKey] = 'ERROR';
                            };
                        } catch (e) {
                            state.lastResult[reqKey] = false;
                            state.requests[reqKey] = 'ERROR';
                        }
                    }

                    if (state.requests[reqKey] === 'PENDING') return script;

                    const hasKey = Boolean(state.lastResult[reqKey]);
                    delete state.requests[reqKey];
                    delete state.lastResult[reqKey];
                    delete script._reqKey;
                    return hasKey;
                },
                'basic_boolean_field'
            );

            // --- [NEW 3] 전체 데이터 개수 구하기 (Value) ---
            addBlock(
                'idb_count',
                'DB %1 의 스토어 %2 의 데이터 개수',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        { type: 'text', params: ['store'] }
                    ],
                    map: { DB_NAME: 0, STORE: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);
                    const storeName = script.getStringValue('STORE', script);

                    const db = state && state.databases[dbName];
                    if (!db) return 0;

                    if (!script._reqKey) {
                        state.reqSeq += 1;
                        script._reqKey = `count_${dbName}_${storeName}_${state.reqSeq}`;
                    }
                    const reqKey = script._reqKey;

                    if (!state.requests[reqKey]) {
                        state.requests[reqKey] = 'PENDING';
                        try {
                            const tx = db.transaction([storeName], 'readonly');
                            const store = tx.objectStore(storeName);
                            const req = store.count();

                            req.onsuccess = (e) => {
                                state.lastResult[reqKey] = e.target.result || 0;
                                state.requests[reqKey] = 'DONE';
                            };
                            req.onerror = () => {
                                state.lastResult[reqKey] = 0;
                                state.requests[reqKey] = 'ERROR';
                            };
                        } catch (e) {
                            state.lastResult[reqKey] = 0;
                            state.requests[reqKey] = 'ERROR';
                        }
                    }

                    if (state.requests[reqKey] === 'PENDING') return script;

                    const countVal = state.lastResult[reqKey] || 0;
                    delete state.requests[reqKey];
                    delete state.lastResult[reqKey];
                    delete script._reqKey;
                    return countVal;
                },
                'basic_string_field'
            );

            // --- [NEW 4] 전체 키 목록 / 값 목록 읽어오기 (Command) ---
            addBlock(
                'idb_fetch_all',
                'DB %1 의 스토어 %2 의 모든 %3 읽어오기 %4',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        {
                            type: 'Dropdown',
                            options: [
                                ['키 목록', 'KEYS'],
                                ['값 목록', 'VALUES']
                            ],
                            value: 'KEYS'
                        },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        { type: 'text', params: ['store'] },
                        null,
                        null
                    ],
                    map: { DB_NAME: 0, STORE: 1, TYPE: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);
                    const storeName = script.getStringValue('STORE', script);
                    const fetchType = script.getField('TYPE', script);

                    const db = state && state.databases[dbName];
                    if (!db) return script.callReturn();

                    if (!script._reqKey) {
                        state.reqSeq += 1;
                        script._reqKey = `fetchall_${dbName}_${storeName}_${fetchType}_${state.reqSeq}`;
                    }
                    const reqKey = script._reqKey;

                    if (!state.requests[reqKey]) {
                        state.requests[reqKey] = 'PENDING';
                        try {
                            const tx = db.transaction([storeName], 'readonly');
                            const store = tx.objectStore(storeName);
                            const req = fetchType === 'KEYS' ? store.getAllKeys() : store.getAll();

                            req.onsuccess = (e) => {
                                const resList = e.target.result || [];
                                state.lastResult[dbName] = JSON.stringify(resList);
                                state.requests[reqKey] = 'DONE';
                            };
                            req.onerror = (err) => {
                                state.errors[dbName] = err.target.error ? err.target.error.message : '목록 읽기 실패';
                                state.requests[reqKey] = 'ERROR';
                            };
                        } catch (e) {
                            state.errors[dbName] = e.message;
                            state.requests[reqKey] = 'ERROR';
                        }
                    }

                    if (state.requests[reqKey] === 'PENDING') return script;

                    delete state.requests[reqKey];
                    delete script._reqKey;
                    return script.callReturn();
                }
            );

            // --- [5] 단일 키 삭제 (DELETE) ---
            addBlock(
                'idb_delete',
                'DB %1 의 스토어 %2 에서 키 %3 삭제하기 %4',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        { type: 'text', params: ['store'] },
                        { type: 'text', params: ['user_1'] },
                        null
                    ],
                    map: { DB_NAME: 0, STORE: 1, KEY: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);
                    const storeName = script.getStringValue('STORE', script);
                    const key = script.getStringValue('KEY', script);

                    const db = state && state.databases[dbName];
                    if (!db) return script.callReturn();

                    if (!script._reqKey) {
                        state.reqSeq += 1;
                        script._reqKey = `del_${dbName}_${storeName}_${key}_${state.reqSeq}`;
                    }
                    const reqKey = script._reqKey;

                    if (!state.requests[reqKey]) {
                        state.requests[reqKey] = 'PENDING';
                        try {
                            const tx = db.transaction([storeName], 'readwrite');
                            const store = tx.objectStore(storeName);
                            const req = store.delete(key);

                            req.onsuccess = () => { state.requests[reqKey] = 'DONE'; };
                            req.onerror = (e) => {
                                state.errors[dbName] = e.target.error ? e.target.error.message : '삭제 실패';
                                state.requests[reqKey] = 'ERROR';
                            };
                        } catch (e) {
                            state.errors[dbName] = e.message;
                            state.requests[reqKey] = 'ERROR';
                        }
                    }

                    if (state.requests[reqKey] === 'PENDING') return script;

                    delete state.requests[reqKey];
                    delete script._reqKey;
                    return script.callReturn();
                }
            );

            // --- [6] 스토어 비우기 (CLEAR) ---
            addBlock(
                'idb_clear',
                'DB %1 의 스토어 %2 데이터 전체 비우기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        { type: 'text', params: ['store'] },
                        null
                    ],
                    map: { DB_NAME: 0, STORE: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);
                    const storeName = script.getStringValue('STORE', script);

                    const db = state && state.databases[dbName];
                    if (!db) return script.callReturn();

                    if (!script._reqKey) {
                        state.reqSeq += 1;
                        script._reqKey = `clear_${dbName}_${storeName}_${state.reqSeq}`;
                    }
                    const reqKey = script._reqKey;

                    if (!state.requests[reqKey]) {
                        state.requests[reqKey] = 'PENDING';
                        try {
                            const tx = db.transaction([storeName], 'readwrite');
                            const store = tx.objectStore(storeName);
                            const req = store.clear();

                            req.onsuccess = () => { state.requests[reqKey] = 'DONE'; };
                            req.onerror = (e) => {
                                state.errors[dbName] = e.target.error ? e.target.error.message : '초기화 실패';
                                state.requests[reqKey] = 'ERROR';
                            };
                        } catch (e) {
                            state.errors[dbName] = e.message;
                            state.requests[reqKey] = 'ERROR';
                        }
                    }

                    if (state.requests[reqKey] === 'PENDING') return script;

                    delete state.requests[reqKey];
                    delete script._reqKey;
                    return script.callReturn();
                }
            );

            // --- [NEW 5] DB 전체 삭제하기 (DELETE DB) ---
            addBlock(
                'idb_delete_db',
                'DB %1 데이터베이스 삭제하기 %2',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        null
                    ],
                    map: { DB_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);

                    if (!state) return script.callReturn();

                    if (!script._reqKey) {
                        state.reqSeq += 1;
                        script._reqKey = `deldb_${dbName}_${state.reqSeq}`;
                    }
                    const reqKey = script._reqKey;

                    if (!state.requests[reqKey]) {
                        state.requests[reqKey] = 'PENDING';

                        if (state.databases[dbName]) {
                            try { state.databases[dbName].close(); } catch (e) {}
                            delete state.databases[dbName];
                        }
                        delete state.status[dbName];

                        try {
                            const req = targetWindow.indexedDB.deleteDatabase(dbName);
                            req.onsuccess = () => { state.requests[reqKey] = 'DONE'; };
                            req.onerror = (e) => {
                                state.errors[dbName] = e.target.error ? e.target.error.message : 'DB 삭제 실패';
                                state.requests[reqKey] = 'ERROR';
                            };
                        } catch (e) {
                            state.errors[dbName] = e.message;
                            state.requests[reqKey] = 'ERROR';
                        }
                    }

                    if (state.requests[reqKey] === 'PENDING') return script;

                    delete state.requests[reqKey];
                    delete script._reqKey;
                    return script.callReturn();
                }
            );

            // --- [NEW 6] 엔트리 리스트에 DB 스토어 데이터 채우기 (Command) ---
            addBlock(
                'idb_load_to_entry_list',
                'DB %1 의 스토어 %2 데이터를 엔트리 리스트 %3 에 모두 채우기 %4',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        { type: 'text', params: ['store'] },
                        { type: 'text', params: ['리스트 이름'] },
                        null
                    ],
                    map: { DB_NAME: 0, STORE: 1, LIST_NAME: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    const dbName = script.getStringValue('DB_NAME', script);
                    const storeName = script.getStringValue('STORE', script);
                    const listName = script.getStringValue('LIST_NAME', script);

                    const db = state && state.databases[dbName];
                    if (!db) return script.callReturn();

                    if (!script._reqKey) {
                        state.reqSeq += 1;
                        script._reqKey = `filllist_${dbName}_${storeName}_${listName}_${state.reqSeq}`;
                    }
                    const reqKey = script._reqKey;

                    if (!state.requests[reqKey]) {
                        state.requests[reqKey] = 'PENDING';
                        try {
                            const tx = db.transaction([storeName], 'readonly');
                            const store = tx.objectStore(storeName);
                            const req = store.getAll();

                            req.onsuccess = (e) => {
                                const values = e.target.result || [];
                                const EntryObj = targetWindow.Entry || window.Entry;

                                if (EntryObj && EntryObj.variableContainer && Array.isArray(EntryObj.variableContainer.lists_)) {
                                    const targetList = EntryObj.variableContainer.lists_.find(
                                        l => l.getName() === listName || l.getId() === listName
                                    );

                                    if (targetList) {
                                        if (typeof targetList.clear === 'function') {
                                            targetList.clear();
                                        } else {
                                            targetList.array_ = [];
                                        }

                                        values.forEach(item => {
                                            const strVal = typeof item === 'object' ? JSON.stringify(item) : String(item);
                                            if (typeof targetList.appendValue === 'function') {
                                                targetList.appendValue(strVal);
                                            } else if (targetList.array_) {
                                                targetList.array_.push({ value: strVal });
                                            }
                                        });

                                        if (typeof targetList.updateView === 'function') {
                                            targetList.updateView();
                                        }
                                    } else {
                                        console.warn(`[IndexedDB Extension] 리스트 '${listName}'을(를) 찾을 수 없습니다.`);
                                    }
                                }
                                state.requests[reqKey] = 'DONE';
                            };
                            req.onerror = (err) => {
                                state.errors[dbName] = err.target.error ? err.target.error.message : '리스트 채우기 실패';
                                state.requests[reqKey] = 'ERROR';
                            };
                        } catch (e) {
                            state.errors[dbName] = e.message;
                            state.requests[reqKey] = 'ERROR';
                        }
                    }

                    if (state.requests[reqKey] === 'PENDING') return script;

                    delete state.requests[reqKey];
                    delete script._reqKey;
                    return script.callReturn();
                }
            );

            addBlock(
                'idb_open_multi_stores',
                'DB %1 의 스토어 %2 (버전 %3) 열기 %4',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['my_db'] },
                        { type: 'text', params: ['store1, store2'] },
                        { type: 'text', params: ['1'] },
                        null
                    ],
                    map: { DB_NAME: 0, STORES: 1, VERSION: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_INDEXEDDB__;
                    if (!state) return script.callReturn();

                    const dbName = script.getStringValue('DB_NAME', script);
                    const rawStores = script.getStringValue('STORES', script);
                    const rawVersion = script.getStringValue('VERSION', script);
                    const version = parseInt(rawVersion, 10) || 1;

                    // 쉼표로 구분된 스토어 이름들을 배열로 정제
                    const storeNames = rawStores.split(',').map(s => s.trim()).filter(Boolean);

                    if (state.status[dbName] === 'READY' && state.databases[dbName]) {
                        return script.callReturn();
                    }

                    if (!state.status[dbName]) {
                        state.status[dbName] = 'PENDING';
                        state.errors[dbName] = '';

                        try {
                            const request = targetWindow.indexedDB.open(dbName, version);

                            request.onblocked = () => {
                                console.warn(`[IndexedDB Extension] DB '${dbName}' 업그레이드가 다른 연결에 의해 차단됨.`);
                            };

                            request.onupgradeneeded = (event) => {
                                const db = event.target.result;
                                // 입력받은 모든 스토어 목록을 순회하며 존재하지 않을 경우 생성
                                storeNames.forEach(storeName => {
                                    if (!db.objectStoreNames.contains(storeName)) {
                                        db.createObjectStore(storeName);
                                        console.log(`[IndexedDB Extension] '${dbName}'에 스토어('${storeName}') 생성 완료`);
                                    }
                                });
                            };

                            request.onsuccess = (event) => {
                                const db = event.target.result;
                                db.onversionchange = () => {
                                    db.close();
                                    delete state.databases[dbName];
                                    state.status[dbName] = null;
                                };

                                state.databases[dbName] = db;
                                state.status[dbName] = 'READY';
                            };

                            request.onerror = (event) => {
                                state.errors[dbName] = event.target.error ? event.target.error.message : 'DB 열기 실패';
                                state.status[dbName] = 'ERROR';
                            };
                        } catch (e) {
                            state.errors[dbName] = e.message;
                            state.status[dbName] = 'ERROR';
                        }
                    }

                    if (state.status[dbName] === 'PENDING') return script;
                    return script.callReturn();
                }
            );

            // EntryStatic.getAllBlocks 오버라이딩
            if (EntryStatic && typeof EntryStatic.getAllBlocks === 'function') {
                const originalGetAllBlocks = EntryStatic.getAllBlocks;
                EntryStatic.getAllBlocks = () => {
                    const blocks = originalGetAllBlocks();
                    const hasCustom = blocks.find(c => c.category === 'IndexedDB');
                    if (!hasCustom) {
                        blocks.push({ category: 'IndexedDB', blocks: indexedDBBlocks });
                    }
                    return blocks;
                };
            }

            console.log('[IndexedDB Extension] 모든 블록 주입 완료');
        }
    });

    if (typeof window.EAPI.render === 'function') {
        window.EAPI.render();
    }
})();
