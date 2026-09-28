// ==UserScript==
// @name         엔트리 WASM 비공식 블록 확장
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  엔트리에 WebAssembly 기능을 연결하기 위한 확장 유저스크립트
// @match        *://playentry.org/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    window.EAPI = window.EAPI || { modules: [], categories: [] };

    // 1. EAPI 카테고리 등록
    if (!window.EAPI.categories.some(c => c.category === 'WASM')) {
        window.EAPI.categories.push({
            category: 'WASM',
            displayName: 'WASM',
            color: '#009de6',
            fontColor: '#ffffff',
            visible: true
        });
    }


    const wasmBlocks = [
        'wasm_load_module',
        'wasm_is_module_loaded',
        'wasm_call_function_value',
        'wasm_call_function_action',
        'wasm_read_memory',
        'wasm_write_memory',
        'wasm_unload_module',
        'wasm_read_string',
        'wasm_write_string',
        'wasm_get_last_error',
        'wasm_get_memory_size',
        'wasm_compile_wat',
        'wasm_write_list_to_memory',
        'wasm_read_memory_to_list',
        'wasm_grow_memory',
        'wasm_has_function',
    ];

    // 2. EAPI 모듈 등록
    window.EAPI.modules.push({
        name: 'WASM Extension',
        init: function(targetWindow, Entry, EntryStatic, $) {
            console.log('[WASM Extension] 모듈 주입 시작');

            // WASM 기본 컬러 테마
            const defaultColor = { color: '#009de6', outerline: '#BF360C', fontColor: '#ffffff' };

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


            if (!targetWindow.__ENTRY_WASM__) {
                targetWindow.__ENTRY_WASM__ = {
                    modules: {} // 모듈별 인스턴스, exports, 로딩 상태 저장
                };
            }


            addBlock(
                'wasm_load_module',
                'URL %1 에서 WASM 모듈을 %2 (으)로 로드하기 %3',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['https://example.com/sample.wasm'] },
                        { type: 'text', params: ['wasm_0'] },
                        null
                    ],
                    map: { URL: 0, MOD_NAME: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state) return script.callReturn();

                    // 수정: script를 두 번째 인자로 전달
                    const url = script.getStringValue('URL', script);
                    const modName = script.getStringValue('MOD_NAME', script);

                    if (!state.modules) state.modules = {};

                    state.modules[modName] = {
                        loaded: false,
                        instance: null,
                        exports: {},
                        error: null
                    };

                    const targetMod = state.modules[modName];

                    // 기본 표준 ImportObject 정의
                    const defaultImportObject = {
                        env: {
                            memory: new WebAssembly.Memory({ initial: 256 }),
                            print: (val) => console.log('[WASM Print]:', val),
                            abort: () => console.error('[WASM] aborted')
                        }
                    };

                    // 비동기 바이너리 로드 및 인스턴스화
                    fetch(url)
                        .then((res) => {
                            if (!res.ok) throw new Error(`HTTP 오류 (${res.status})`);
                            return res.arrayBuffer();
                        })
                        .then((bytes) => WebAssembly.instantiate(bytes, defaultImportObject))
                        .then((results) => {
                            targetMod.instance = results.instance;
                            targetMod.exports = results.instance.exports;
                            targetMod.loaded = true;
                            console.log(`[WASM Extension] 모듈 '${modName}' 로드 완료!`, results.instance.exports);
                        })
                        .catch((err) => {
                            targetMod.error = err.message;
                            console.error(`[WASM Extension] 모듈 '${modName}' 로드 실패:`, err);
                        });

                    return script.callReturn();
                }
            );

            addBlock(
                'wasm_is_module_loaded',
                'WASM 모듈 %1 이 준비 되었는가?',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] }
                    ],
                    map: { MOD_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return false;

                    const modName = script.getStringValue('MOD_NAME');
                    const targetMod = state.modules[modName];

                    return Boolean(targetMod && targetMod.loaded);
                },
                'basic_boolean_field'
            );

            addBlock(
                'wasm_call_function_value',
                'WASM 모듈 %1 의 %2 함수 실행 (인자: %3)',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'text', params: ['add'] },
                        { type: 'text', params: ['10, 20'] }
                    ],
                    map: { MOD_NAME: 0, FUNC_NAME: 1, ARGS: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return 0;

                    const modName = script.getStringValue('MOD_NAME');
                    const funcName = script.getStringValue('FUNC_NAME');
                    const rawArgs = script.getStringValue('ARGS');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || typeof targetMod.exports[funcName] !== 'function') {
                        return 0;
                    }

                    // 인자를 쉼표로 파싱하여 수치형/문자형으로 전달
                    const args = rawArgs.trim() === '' ? [] : rawArgs.split(',').map(v => {
                        const num = Number(v.trim());
                        return isNaN(num) ? v.trim() : num;
                    });

                    try {
                        return targetMod.exports[funcName](...args);
                    } catch (e) {
                        console.error(`[WASM] ${funcName} 함수 실행 오류:`, e);
                        return 0;
                    }
                },
                'basic_string_field'
            );

            addBlock(
                'wasm_call_function_action',
                'WASM 모듈 %1 의 %2 함수 실행하기 (인자: %3) %4',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'text', params: ['update'] },
                        { type: 'text', params: [''] },
                        null
                    ],
                    map: { MOD_NAME: 0, FUNC_NAME: 1, ARGS: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return script.callReturn();

                    const modName = script.getStringValue('MOD_NAME');
                    const funcName = script.getStringValue('FUNC_NAME');
                    const rawArgs = script.getStringValue('ARGS');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || typeof targetMod.exports[funcName] !== 'function') {
                        return script.callReturn();
                    }

                    const args = rawArgs.trim() === '' ? [] : rawArgs.split(',').map(v => {
                        const num = Number(v.trim());
                        return isNaN(num) ? v.trim() : num;
                    });

                    try {
                        targetMod.exports[funcName](...args);
                    } catch (e) {
                        console.error(`[WASM] ${funcName} 함수 실행 오류:`, e);
                    }

                    return script.callReturn();
                }
            );
            // 1-1. 메모리 읽기 (Float32, Int32, Uint8 지원)
            addBlock(
                'wasm_read_memory',
                'WASM 모듈 %1 메모리 주소 %2 에서 %3 읽기',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'number', params: [0] },
                        { type: 'text', params: ['Float32'] }
                    ],
                    map: { MOD_NAME: 0, OFFSET: 1, TYPE: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return 0;

                    const modName = script.getStringValue('MOD_NAME');
                    const offset = script.getNumberValue('OFFSET');
                    const type = script.getStringValue('TYPE');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || !targetMod.exports.memory) return 0;

                    const buffer = targetMod.exports.memory.buffer;
                    try {
                        if (type === 'Float32') return new Float32Array(buffer, offset, 1)[0];
                        if (type === 'Int32') return new Int32Array(buffer, offset, 1)[0];
                        if (type === 'Uint8') return new Uint8Array(buffer, offset, 1)[0];
                        return 0;
                    } catch (e) {
                        return 0;
                    }
                },
                'basic_string_field'
            );

            // 1-2. 메모리 쓰기
            addBlock(
                'wasm_write_memory',
                'WASM 모듈 %1 메모리 주소 %2 에 %3 타입으로 값 %4 쓰기 %5',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'number', params: [0] },
                        { type: 'text', params: ['Float32'] },
                        { type: 'number', params: [100] },
                        null
                    ],
                    map: { MOD_NAME: 0, OFFSET: 1, TYPE: 2, VALUE: 3 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return script.callReturn();

                    const modName = script.getStringValue('MOD_NAME');
                    const offset = script.getNumberValue('OFFSET');
                    const type = script.getStringValue('TYPE');
                    const val = script.getNumberValue('VALUE');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || !targetMod.exports.memory) return script.callReturn();

                    const buffer = targetMod.exports.memory.buffer;
                    try {
                        if (type === 'Float32') new Float32Array(buffer, offset, 1)[0] = val;
                        else if (type === 'Int32') new Int32Array(buffer, offset, 1)[0] = val;
                        else if (type === 'Uint8') new Uint8Array(buffer, offset, 1)[0] = val;
                    } catch (e) {
                        console.error('[WASM] 메모리 쓰기 오류:', e);
                    }

                    return script.callReturn();
                }
            );

            addBlock(
                'wasm_unload_module',
                'WASM 모듈 %1 메모리 해제하기 %2',
                { color: '#E74C3C', outerline: '#E74C3C', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        null
                    ],
                    map: { MOD_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return script.callReturn();

                    const modName = script.getStringValue('MOD_NAME');
                    if (state.modules[modName]) {
                        delete state.modules[modName];
                        console.log(`[WASM] 모듈 '${modName}' 해제 완료`);
                    }

                    return script.callReturn();
                }
            );

            // 1. 메모리 주소의 문자열 읽기 (UTF-8 / Null 종단 처리)
            addBlock(
                'wasm_read_string',
                'WASM 모듈 %1 메모리 주소 %2 의 문자열 읽기',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'number', params: [0] }
                    ],
                    map: { MOD_NAME: 0, OFFSET: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return '';

                    const modName = script.getStringValue('MOD_NAME');
                    const offset = script.getNumberValue('OFFSET');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || !targetMod.exports.memory) return '';

                    const buffer = new Uint8Array(targetMod.exports.memory.buffer);
                    let length = 0;

                    // Null 문자가 나올 때까지 바이트 길이 탐색
                    while (offset + length < buffer.length && buffer[offset + length] !== 0) {
                        length++;
                    }

                    const bytes = buffer.subarray(offset, offset + length);
                    return new TextDecoder('utf-8').decode(bytes);
                },
                'basic_string_field'
            );

            // 2. 메모리 주소에 문자열 쓰기 (UTF-8 인코딩 및 Null 종단 바이트 추가)
            addBlock(
                'wasm_write_string',
                'WASM 모듈 %1 메모리 주소 %2 에 문자열 %3 쓰기 %4',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'number', params: [0] },
                        { type: 'text', params: ['Hello Entry!'] },
                        null
                    ],
                    map: { MOD_NAME: 0, OFFSET: 1, STR: 2 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return script.callReturn();

                    const modName = script.getStringValue('MOD_NAME');
                    const offset = script.getNumberValue('OFFSET');
                    const str = script.getStringValue('STR');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || !targetMod.exports.memory) return script.callReturn();

                    const encoded = new TextEncoder().encode(str);
                    const buffer = new Uint8Array(targetMod.exports.memory.buffer);

                    // 문자열 데이터 기록 후 C-Style Null 종단 처리
                    buffer.set(encoded, offset);
                    if (offset + encoded.length < buffer.length) {
                        buffer[offset + encoded.length] = 0;
                    }

                    return script.callReturn();
                }
            );

            // 3. 최근 오류 메시지 확인
            addBlock(
                'wasm_get_last_error',
                'WASM 모듈 %1 의 최근 오류 메시지',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] }
                    ],
                    map: { MOD_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return '';

                    const modName = script.getStringValue('MOD_NAME');
                    const targetMod = state.modules[modName];

                    if (!targetMod) return '모듈이 존재하지 않습니다.';
                    return targetMod.error || '오류 없음';
                },
                'basic_string_field'
            );

            // 4. 전체 메모리 크기 확인 (KB 단위)
            addBlock(
                'wasm_get_memory_size',
                'WASM 모듈 %1 의 전체 메모리 크기(KB)',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] }
                    ],
                    map: { MOD_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return 0;

                    const modName = script.getStringValue('MOD_NAME');
                    const targetMod = state.modules[modName];

                    if (!targetMod || !targetMod.loaded || !targetMod.exports.memory) return 0;

                    const bytes = targetMod.exports.memory.buffer.byteLength;
                    return Math.round((bytes / 1024) * 100) / 100;
                },
                'basic_string_field'
            );

            // WAT 코드를 즉시 WASM 모듈로 컴파일
            addBlock(
                'wasm_compile_wat',
                'WAT 코드 %1 를 WASM 모듈 %2 (으)로 즉시 컴파일하기 %3',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['(module (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))'] },
                        { type: 'text', params: ['wasm_0'] },
                        null
                    ],
                    map: { WAT: 0, MOD_NAME: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state) return script.callReturn();

                    const watCode = script.getStringValue('WAT');
                    const modName = script.getStringValue('MOD_NAME');

                    if (!state.modules) state.modules = {};

                    state.modules[modName] = {
                        loaded: false,
                        instance: null,
                        exports: {},
                        error: null
                    };

                    const targetMod = state.modules[modName];

                    const defaultImportObject = {
                        env: {
                            memory: new WebAssembly.Memory({ initial: 256 }),
                            print: (val) => console.log('[WASM Print]:', val),
                            abort: () => console.error('[WASM] aborted')
                        }
                    };

                    // wabt.js 존재 여부 확인
                    if (!targetWindow.wabt) {
                        targetMod.error = 'wabt.js 라이브러리가 로드되지 않았습니다.';
                        console.error('[WASM] WAT 컴파일러(wabt.js)를 찾을 수 없습니다.');
                        return script.callReturn();
                    }

                    try {
                        const parsed = targetWindow.wabt.parseWat('inline.wat', watCode);
                        const binary = parsed.toBinary({});

                        WebAssembly.instantiate(binary.buffer, defaultImportObject)
                            .then((results) => {
                            targetMod.instance = results.instance;
                            targetMod.exports = results.instance.exports;
                            targetMod.loaded = true;
                            console.log(`[WASM Extension] WAT 컴파일 및 '${modName}' 로드 성공!`, results.instance.exports);
                        })
                            .catch((err) => {
                            targetMod.error = err.message;
                            console.error(`[WASM Extension] WASM 인스턴스화 실패:`, err);
                        });
                    } catch (err) {
                        targetMod.error = err.message;
                        console.error(`[WASM Extension] WAT 파싱 실패:`, err);
                    }

                    return script.callReturn();
                }
            );

            // 엔트리 리스트 데이터를 WASM 메모리로 일괄 복사 (타입 지정 지원)
            addBlock(
                'wasm_write_list_to_memory',
                '엔트리 리스트 %1 의 데이터를 WASM 모듈 %2 메모리 주소 %3 에 %4 타입으로 쓰기 %5',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['리스트이름'] },
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'number', params: [0] },
                        { type: 'text', params: ['Int32'] },
                        null
                    ],
                    map: { LIST_NAME: 0, MOD_NAME: 1, OFFSET: 2, TYPE: 3 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return script.callReturn();

                    const listName = script.getStringValue('LIST_NAME');
                    const modName = script.getStringValue('MOD_NAME');
                    const offset = script.getNumberValue('OFFSET');
                    const type = script.getStringValue('TYPE');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || !targetMod.exports.memory) return script.callReturn();

                    const Entry = targetWindow.Entry;
                    if (!Entry || !Entry.variableContainer) return script.callReturn();

                    const vc = Entry.variableContainer;
                    let targetList = null;

                    if (typeof vc.getListByName === 'function') {
                        targetList = vc.getListByName(listName);
                    }
                    if (!targetList && typeof vc.getList === 'function') {
                        targetList = vc.getList(listName);
                    }

                    if (!targetList) {
                        console.warn(`[WASM] 엔트리 리스트 '${listName}'를 찾을 수 없습니다.`);
                        return script.callReturn();
                    }

                    const rawArray = typeof targetList.getArray === 'function' ? targetList.getArray() : (targetList.array || []);
                    const buffer = targetMod.exports.memory.buffer;

                    try {
                        let view;
                        if (type === 'Int32') {
                            view = new Int32Array(buffer, offset, rawArray.length);
                        } else if (type === 'Uint8') {
                            view = new Uint8Array(buffer, offset, rawArray.length);
                        } else {
                            view = new Float32Array(buffer, offset, rawArray.length);
                        }

                        for (let i = 0; i < rawArray.length; i++) {
                            const item = rawArray[i];
                            const num = Number(typeof item === 'object' && item !== null && 'data' in item ? item.data : item);
                            view[i] = isNaN(num) ? 0 : num;
                        }
                    } catch (e) {
                        console.error('[WASM] 리스트 메모리 쓰기 오류:', e);
                    }

                    return script.callReturn();
                }
            );

            // WASM 메모리 주소의 데이터 N개를 엔트리 리스트에 일괄 채우기
            addBlock(
                'wasm_read_memory_to_list',
                'WASM 모듈 %1 메모리 주소 %2 의 데이터 %3 개를 엔트리 리스트 %4 에 %5 타입으로 채우기 %6',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'number', params: [0] },
                        { type: 'number', params: [3] },
                        { type: 'text', params: ['리스트이름'] },
                        { type: 'text', params: ['Int32'] },
                        null
                    ],
                    map: { MOD_NAME: 0, OFFSET: 1, COUNT: 2, LIST_NAME: 3, TYPE: 4 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return script.callReturn();

                    const modName = script.getStringValue('MOD_NAME');
                    const offset = script.getNumberValue('OFFSET');
                    const count = script.getNumberValue('COUNT');
                    const listName = script.getStringValue('LIST_NAME');
                    const type = script.getStringValue('TYPE');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || !targetMod.exports.memory) return script.callReturn();

                    const Entry = targetWindow.Entry;
                    if (!Entry || !Entry.variableContainer) return script.callReturn();

                    const vc = Entry.variableContainer;
                    let targetList = null;

                    if (typeof vc.getListByName === 'function') {
                        targetList = vc.getListByName(listName);
                    }
                    if (!targetList && typeof vc.getList === 'function') {
                        targetList = vc.getList(listName);
                    }

                    if (!targetList) {
                        console.warn(`[WASM] 엔트리 리스트 '${listName}'를 찾을 수 없습니다.`);
                        return script.callReturn();
                    }

                    const buffer = targetMod.exports.memory.buffer;

                    try {
                        let view;
                        if (type === 'Int32') {
                            view = new Int32Array(buffer, offset, count);
                        } else if (type === 'Uint8') {
                            view = new Uint8Array(buffer, offset, count);
                        } else {
                            view = new Float32Array(buffer, offset, count);
                        }

                        // 기존 엔트리 리스트 비우기 후 동기화
                        if (typeof targetList.clear === 'function') {
                            targetList.clear();
                        } else {
                            targetList.array_ = [];
                        }

                        for (let i = 0; i < view.length; i++) {
                            targetList.appendValue(view[i]);
                        }

                        if (typeof targetList.updateView === 'function') {
                            targetList.updateView();
                        }
                    } catch (e) {
                        console.error('[WASM] 메모리 리스트 읽기 오류:', e);
                    }

                    return script.callReturn();
                }
            );

            // 1. WASM 메모리 동적 확장 (64KB 페이지 단위)
            addBlock(
                'wasm_grow_memory',
                'WASM 모듈 %1 의 메모리를 %2 페이지(64KB)만큼 확장하기 %3',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'number', params: [1] },
                        null
                    ],
                    map: { MOD_NAME: 0, PAGES: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return script.callReturn();

                    const modName = script.getStringValue('MOD_NAME');
                    const pages = script.getNumberValue('PAGES');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || !targetMod.exports.memory) {
                        return script.callReturn();
                    }

                    try {
                        const prevPages = targetMod.exports.memory.grow(pages);
                        if (prevPages === -1) {
                            console.warn(`[WASM] '${modName}' 메모리 확장 실패`);
                        } else {
                            console.log(`[WASM] '${modName}' 메모리 확장 성공: ${prevPages} -> ${prevPages + pages} 페이지`);
                        }
                    } catch (e) {
                        console.error('[WASM] 메모리 확장 오류:', e);
                    }

                    return script.callReturn();
                }
            );

            // 2. WASM 모듈 내 특정 함수 존재 여부 확인 (참/거짓 판단 블록)
            addBlock(
                'wasm_has_function',
                'WASM 모듈 %1 에 %2 함수가 존재하는가?',
                { color: '#009de6', outerline: '#009de6', fontColor: '#ffffff' },
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['wasm_0'] },
                        { type: 'text', params: ['add'] }
                    ],
                    map: { MOD_NAME: 0, FUNC_NAME: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WASM__;
                    if (!state || !state.modules) return false;

                    const modName = script.getStringValue('MOD_NAME');
                    const funcName = script.getStringValue('FUNC_NAME');

                    const targetMod = state.modules[modName];
                    if (!targetMod || !targetMod.loaded || !targetMod.exports) return false;

                    return typeof targetMod.exports[funcName] === 'function';
                },
                'basic_boolean_field'
            );

            // EntryStatic.getAllBlocks 오버라이딩
            if (EntryStatic && typeof EntryStatic.getAllBlocks === 'function') {
                const originalGetAllBlocks = EntryStatic.getAllBlocks;
                EntryStatic.getAllBlocks = () => {
                    const blocks = originalGetAllBlocks();
                    const hasCustom = blocks.find(c => c.category === 'WASM');
                    if (!hasCustom) {
                        blocks.push({ category: 'WASM', blocks: wasmBlocks });
                    }
                    return blocks;
                };
            }

            console.log('[WASM Extension] 모듈 주입 완료');
        }
    });

    // 3. EAPI Core가 이미 완료된 경우 갱신
    if (typeof window.EAPI.render === 'function') {
        window.EAPI.render();
    }
})();
