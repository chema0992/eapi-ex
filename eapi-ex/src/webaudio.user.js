// ==UserScript==
// @name         엔트리 WebAudio 비공식 블록 확장
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  엔트리에 WebAudio API 기능을 연결하기 위한 확장 유저스크립트
// @match        *://playentry.org/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    window.EAPI = window.EAPI || { modules: [], categories: [] };

    // 1. EAPI 카테고리 등록 (WebAudio - 테마 색상: 보라색 계열)
    if (!window.EAPI.categories.some(c => c.category === 'WebAudio')) {
        window.EAPI.categories.push({
            category: 'WebAudio',
            displayName: 'Audio',
            color: '#e39c4b',
            fontColor: '#ffffff',
            visible: true
        });
    }

    // WebAudio 카테고리에 등록할 블록 ID 목록
    const webAudioBlocks = [
        'webaudio_stop_all_nodes',
        'webaudio_init_context',
        'webaudio_create_oscillator',
        'webaudio_set_frequency',
        'webaudio_connect_destination',
        'webaudio_start_oscillator',
        'webaudio_stop_oscillator',
        'webaudio_create_gain',
        'webaudio_set_gain',
        'webaudio_connect_nodes',
        'webaudio_ramp_gain',
        'webaudio_create_filter',
        'webaudio_create_panner',
        'webaudio_load_audio_buffer',
        'webaudio_play_buffer',
        'webaudio_is_buffer_loaded',
        'webaudio_create_analyser',
        'webaudio_get_analyser_volume',
        'webaudio_fill_frequency_list',
        'webaudio_set_buffer_playback_rate',
        'webaudio_set_buffer_loop',
    ];

    // 2. EAPI 모듈 등록
    window.EAPI.modules.push({
        name: 'WebAudio Extension',
        init: function(targetWindow, Entry, EntryStatic, $) {
            console.log('[WebAudio Extension] 모듈 주입 시작');

            // WebAudio 기본 컬러 테마
            const defaultColor = { color: '#e39c4b', outerline: '#e39c4b', fontColor: '#ffffff' };

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

            // WebAudio 상태 및 컨텍스트 관리 객체 초기화
            if (!targetWindow.__ENTRY_WEBAUDIO__) {
                targetWindow.__ENTRY_WEBAUDIO__ = {
                    ctx: null,      // AudioContext 인스턴스
                    nodes: {},      // 생성된 노드들 (Oscillator, Gain 등)
                    buffers: {}     // 로드된 오디오 버퍼 저장용
                };
            }

            // AudioContext 생성/가져오기 헬퍼 함수
            const getAudioContext = () => {
                const state = targetWindow.__ENTRY_WEBAUDIO__;
                if (!state.ctx) {
                    const AudioContextClass = targetWindow.AudioContext || targetWindow.webkitAudioContext;
                    if (AudioContextClass) {
                        state.ctx = new AudioContextClass();
                    } else {
                        console.error('[WebAudio Extension] 브라우저가 WebAudio API를 지원하지 않습니다.');
                    }
                }
                // 브라우저 자동재생 정책으로 인해 suspended 상태인 경우 resume
                if (state.ctx && state.ctx.state === 'suspended') {
                    state.ctx.resume();
                }
                return state.ctx;
            };

            // WebAudio 컨텍스트 생성/시작 블록
            addBlock(
                'webaudio_init_context',
                'WebAudio 컨텍스트 생성하기 %1',
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
                    const ctx = getAudioContext();
                    if (ctx) {
                        if (ctx.state === 'suspended') {
                            ctx.resume().then(() => {
                                console.log('[WebAudio Extension] AudioContext 재개됨 (state: running)');
                            });
                        } else {
                            console.log('[WebAudio Extension] AudioContext 준비 완료 (state:', ctx.state + ')');
                        }
                    }
                    return script.callReturn();
                }
            );

            // 오실레이터 노드 생성 블록 (드롭다운 적용)
            addBlock(
                'webaudio_create_oscillator',
                '오실레이터 노드 %1 생성 (파형: %2) %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        {
                            type: 'Dropdown',
                            options: [
                                [' 사인파 (sine) ', 'sine'],
                                [' 사각파 (square) ', 'square'],
                                [' 톱니파 (sawtooth) ', 'sawtooth'],
                                [' 삼각파 (triangle) ', 'triangle']
                            ],
                            fontSize: 11,
                            arrowColor: '#e39c4b',
                            value: 'sine'
                        },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['osc_0'] },
                        null,
                        null
                    ],
                    map: { NODE_NAME: 0, WAVEFORM: 1 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME');
                    // 드롭다운에서 선택된 값 가져오기
                    const waveform = script.getField('WAVEFORM', script) || script.getStringValue('WAVEFORM') || 'sine';

                    const state = targetWindow.__ENTRY_WEBAUDIO__;

                    try {
                        // 이미 존재하는 동일한 이름의 노드가 있으면 재연결을 위해 기존 노드 정리
                        if (state.nodes && state.nodes[nodeName]) {
                            try { state.nodes[nodeName].stop(); } catch (e) {}
                            try { state.nodes[nodeName].disconnect(); } catch (e) {}
                        }

                        const osc = ctx.createOscillator();
                        osc.type = waveform;

                        // 관리 객체에 노드 등록
                        state.nodes[nodeName] = osc;
                        console.log(`[WebAudio Extension] 오실레이터 노드 '${nodeName}' 생성 완료 (파형: ${osc.type})`);
                    } catch (e) {
                        console.error('[WebAudio Extension] 오실레이터 생성 오류:', e);
                    }

                    return script.callReturn();
                }
            );

            // 노드 주파수(Hz) 변경 블록
            addBlock(
                'webaudio_set_frequency',
                '노드 %1 의 주파수를 %2 Hz로 변경하기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['osc_0'] },
                        { type: 'number', params: [440] },
                        null
                    ],
                    map: { NODE_NAME: 0, FREQ: 1 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME');
                    const freq = script.getNumberValue('FREQ');

                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    const targetNode = state ? state.nodes[nodeName] : null;

                    if (targetNode && targetNode.frequency) {
                        // AudioParam 시간 스케줄링을 통한 주파수 변경
                        targetNode.frequency.setValueAtTime(freq, ctx.currentTime);
                    } else {
                        console.warn(`[WebAudio Extension] '${nodeName}' 노드가 존재하지 않거나 주파수를 지원하지 않습니다.`);
                    }

                    return script.callReturn();
                }
            );

            // 1. 노드를 스피커(Destination)에 연결하기
            addBlock(
                'webaudio_connect_destination',
                '노드 %1 을(를) 스피커(Destination)에 연결하기 %2',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['osc_0'] },
                        null
                    ],
                    map: { NODE_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME');
                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    const targetNode = state ? state.nodes[nodeName] : null;

                    if (targetNode) {
                        try {
                            targetNode.connect(ctx.destination);
                            console.log(`[WebAudio Extension] '${nodeName}' -> 스피커 연결 완료`);
                        } catch (e) {
                            console.error(`[WebAudio Extension] 스피커 연결 실패:`, e);
                        }
                    }
                    return script.callReturn();
                }
            );

            // 2. 오실레이터 재생 시작하기
            addBlock(
                'webaudio_start_oscillator',
                '오실레이터 %1 재생 시작하기 %2',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['osc_0'] },
                        null
                    ],
                    map: { NODE_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME');
                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    const targetNode = state ? state.nodes[nodeName] : null;

                    if (targetNode && typeof targetNode.start === 'function') {
                        try {
                            targetNode.start();
                            console.log(`[WebAudio Extension] '${nodeName}' 재생 시작`);
                        } catch (e) {
                            console.warn(`[WebAudio Extension] '${nodeName}' 재생 시작 오류:`, e);
                        }
                    }
                    return script.callReturn();
                }
            );

            // 3. 오실레이터 재생 중지하기
            addBlock(
                'webaudio_stop_oscillator',
                '오실레이터 %1 재생 중지하기 %2',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['osc_0'] },
                        null
                    ],
                    map: { NODE_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME');
                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    const targetNode = state ? state.nodes[nodeName] : null;

                    if (targetNode && typeof targetNode.stop === 'function') {
                        try {
                            targetNode.stop();
                            console.log(`[WebAudio Extension] '${nodeName}' 재생 중지`);
                        } catch (e) {
                            console.warn(`[WebAudio Extension] '${nodeName}' 중지 오류:`, e);
                        }
                    }
                    return script.callReturn();
                }
            );

            // 1. Gain 노드 생성 블록
            addBlock(
                'webaudio_create_gain',
                'Gain 노드 %1 생성 (크기: %2) %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['gain_0'] },
                        { type: 'number', params: [1] },
                        null
                    ],
                    map: { NODE_NAME: 0, GAIN_VAL: 1 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME');
                    const gainVal = script.getNumberValue('GAIN_VAL');
                    const state = targetWindow.__ENTRY_WEBAUDIO__;

                    try {
                        // 이미 동일한 이름의 노드가 존재하면 이전 연결 정리
                        if (state.nodes && state.nodes[nodeName]) {
                            try { state.nodes[nodeName].disconnect(); } catch (e) {}
                        }

                        const gainNode = ctx.createGain();
                        gainNode.gain.setValueAtTime(gainVal, ctx.currentTime);

                        state.nodes[nodeName] = gainNode;
                        console.log(`[WebAudio Extension] Gain 노드 '${nodeName}' 생성 완료 (크기: ${gainVal})`);
                    } catch (e) {
                        console.error('[WebAudio Extension] Gain 노드 생성 오류:', e);
                    }

                    return script.callReturn();
                }
            );

            // 2. Gain 노드 볼륨 변경 블록
            addBlock(
                'webaudio_set_gain',
                'Gain 노드 %1 의 볼륨을 %2 로 변경하기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['gain_0'] },
                        { type: 'number', params: [1] },
                        null
                    ],
                    map: { NODE_NAME: 0, GAIN_VAL: 1 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME');
                    const gainVal = script.getNumberValue('GAIN_VAL');

                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    const targetNode = state ? state.nodes[nodeName] : null;

                    if (targetNode && targetNode.gain) {
                        targetNode.gain.setValueAtTime(gainVal, ctx.currentTime);
                    } else {
                        console.warn(`[WebAudio Extension] '${nodeName}' 노드가 존재하지 않거나 Gain 노드가 아닙니다.`);
                    }

                    return script.callReturn();
                }
            );

            // 3. 노드 간 연결 블록 (Node A -> Node B)
            addBlock(
                'webaudio_connect_nodes',
                '노드 %1 을(를) 노드 %2 에 연결하기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['osc_0'] },
                        { type: 'text', params: ['gain_0'] },
                        null
                    ],
                    map: { SRC_NODE: 0, DST_NODE: 1 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const srcName = script.getStringValue('SRC_NODE');
                    const dstName = script.getStringValue('DST_NODE');

                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    const srcNode = state ? state.nodes[srcName] : null;
                    const dstNode = state ? state.nodes[dstName] : null;

                    if (srcNode && dstNode) {
                        try {
                            srcNode.connect(dstNode);
                            console.log(`[WebAudio Extension] 노드 연결 완료: '${srcName}' -> '${dstName}'`);
                        } catch (e) {
                            console.error(`[WebAudio Extension] 노드 연결 실패 ('${srcName}' -> '${dstName}'):`, e);
                        }
                    } else {
                        console.warn(`[WebAudio Extension] 연결할 노드를 찾을 수 없습니다. (소스: '${srcName}', 대상: '${dstName}')`);
                    }

                    return script.callReturn();
                }
            );

            // 1. Gain 노드 볼륨 서서히 변경 (Envelope / Ramp)
            addBlock(
                'webaudio_ramp_gain',
                'Gain 노드 %1 의 볼륨을 %2 초 동안 %3 (으)로 서서히 변경하기 %4',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['gain_0'] },
                        { type: 'number', params: [1] },
                        { type: 'number', params: [0] },
                        null
                    ],
                    map: { NODE_NAME: 0, TIME: 1, TARGET_VAL: 2 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME');
                    const duration = Math.max(0, script.getNumberValue('TIME'));
                    const targetVal = script.getNumberValue('TARGET_VAL');

                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    const targetNode = state ? state.nodes[nodeName] : null;

                    if (targetNode && targetNode.gain) {
                        const now = ctx.currentTime;
                        // 이전 스케줄 예약 취소 및 현재 값 고정
                        targetNode.gain.cancelScheduledValues(now);
                        targetNode.gain.setValueAtTime(targetNode.gain.value, now);
                        // 선형 보간(Linear Ramp)을 통한 서서히 변경
                        targetNode.gain.linearRampToValueAtTime(targetVal, now + duration);
                    } else {
                        console.warn(`[WebAudio Extension] '${nodeName}' Gain 노드를 찾을 수 없습니다.`);
                    }

                    return script.callReturn();
                }
            );

            // 2. 필터(BiquadFilter) 노드 생성 (드롭다운 적용)
            addBlock(
                'webaudio_create_filter',
                '필터 노드 %1 생성 (타입: %2, 차단 주파수: %3 Hz) %4',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        {
                            type: 'Dropdown',
                            options: [
                                [' 저역 통과 (lowpass) ', 'lowpass'],
                                [' 고역 통과 (highpass) ', 'highpass'],
                                [' 대역 통과 (bandpass) ', 'bandpass'],
                                [' 노치 (notch) ', 'notch']
                            ],
                            fontSize: 11,
                            arrowColor: '#e39c4b',
                            value: 'lowpass'
                        },
                        { type: 'Block', accept: 'number' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['filter_0'] },
                        null,
                        { type: 'number', params: [1000] },
                        null
                    ],
                    map: { NODE_NAME: 0, TYPE: 1, FREQ: 2 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME');
                    const filterType = script.getField('TYPE', script) || script.getStringValue('TYPE') || 'lowpass';
                    const freq = script.getNumberValue('FREQ');

                    const state = targetWindow.__ENTRY_WEBAUDIO__;

                    try {
                        if (state.nodes && state.nodes[nodeName]) {
                            try { state.nodes[nodeName].disconnect(); } catch (e) {}
                        }

                        const filter = ctx.createBiquadFilter();
                        filter.type = filterType;
                        filter.frequency.setValueAtTime(freq, ctx.currentTime);

                        state.nodes[nodeName] = filter;
                        console.log(`[WebAudio Extension] 필터 노드 '${nodeName}' 생성 완료 (${filterType}, ${freq}Hz)`);
                    } catch (e) {
                        console.error('[WebAudio Extension] 필터 노드 생성 오류:', e);
                    }

                    return script.callReturn();
                }
            );

            // 3. 팬(StereoPanner) 노드 생성 (-1: 왼쪽, 0: 중앙, 1: 오른쪽)
            addBlock(
                'webaudio_create_panner',
                '팬(Panner) 노드 %1 생성 (좌우 위치: %2) %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['panner_0'] },
                        { type: 'number', params: [0] },
                        null
                    ],
                    map: { NODE_NAME: 0, PAN_VAL: 1 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME');
                    const panVal = Math.max(-1, Math.min(1, script.getNumberValue('PAN_VAL')));

                    const state = targetWindow.__ENTRY_WEBAUDIO__;

                    try {
                        if (state.nodes && state.nodes[nodeName]) {
                            try { state.nodes[nodeName].disconnect(); } catch (e) {}
                        }

                        if (typeof ctx.createStereoPanner === 'function') {
                            const panner = ctx.createStereoPanner();
                            panner.pan.setValueAtTime(panVal, ctx.currentTime);
                            state.nodes[nodeName] = panner;
                            console.log(`[WebAudio Extension] 팬 노드 '${nodeName}' 생성 완료 (위치: ${panVal})`);
                        } else {
                            console.warn('[WebAudio Extension] 브라우저가 StereoPannerNode를 지원하지 않습니다.');
                        }
                    } catch (e) {
                        console.error('[WebAudio Extension] 팬 노드 생성 오류:', e);
                    }

                    return script.callReturn();
                }
            );

            // 오디오 파일 URL 비동기 로드 및 버퍼 저장 블록
            addBlock(
                'webaudio_load_audio_buffer',
                'URL %1 의 오디오를 %2 (으)로 불러오기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['https://example.com/sample.mp3'] },
                        { type: 'text', params: ['buf_0'] },
                        null
                    ],
                    map: { URL: 0, BUF_NAME: 1 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const url = script.getStringValue('URL', script);
                    const bufName = script.getStringValue('BUF_NAME', script);

                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    if (!state) return script.callReturn();

                    if (!state.buffers) state.buffers = {};

                    // 버퍼 로딩 상태 초기화
                    state.buffers[bufName] = {
                        loaded: false,
                        buffer: null,
                        error: null
                    };

                    const targetBufObj = state.buffers[bufName];

                    // 비동기 오디오 다운로드 및 디코딩
                    fetch(url)
                        .then((res) => {
                        if (!res.ok) throw new Error(`HTTP 오류 (${res.status})`);
                        return res.arrayBuffer();
                    })
                        .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer))
                        .then((audioBuffer) => {
                        targetBufObj.buffer = audioBuffer;
                        targetBufObj.loaded = true;
                        console.log(`[WebAudio Extension] 오디오 버퍼 '${bufName}' 로드 완료! (길이: ${audioBuffer.duration.toFixed(2)}초)`);
                    })
                        .catch((err) => {
                        targetBufObj.error = err.message;
                        console.error(`[WebAudio Extension] 오디오 버퍼 '${bufName}' 로드 실패:`, err);
                    });

                    return script.callReturn();
                }
            );

            // 지정한 이름을 가진 오디오 버퍼 재생 블록
            addBlock(
                'webaudio_play_buffer',
                '오디오 버퍼 %1 재생하기 %2',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['buf_0'] },
                        null
                    ],
                    map: { BUF_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    if (!state || !state.buffers) return script.callReturn();

                    const bufName = script.getStringValue('BUF_NAME', script);
                    const targetBufObj = state.buffers[bufName];

                    if (targetBufObj && targetBufObj.loaded && targetBufObj.buffer) {
                        // 브라우저 자율 재생 정책 대응 (suspended 상태 해제)
                        if (ctx.state === 'suspended') {
                            ctx.resume();
                        }

                        // AudioBufferSourceNode 생성 (재생 시마다 노드를 새로 생성해야 함)
                        const source = ctx.createBufferSource();
                        source.buffer = targetBufObj.buffer;

                        // 마스터 노드가 존재하면 마스터 노드에, 없으면 ctx.destination에 연결
                        const destinationNode = state.masterGainNode || ctx.destination;
                        source.connect(destinationNode);

                        // 바로 재생 시작
                        source.start(0);
                        console.log(`[WebAudio Extension] 오디오 버퍼 '${bufName}' 재생 시작`);
                    } else {
                        console.warn(`[WebAudio Extension] 오디오 버퍼 '${bufName}'를 찾을 수 없거나 아직 로드가 완료되지 않았습니다.`);
                    }

                    return script.callReturn();
                }
            );

            // 오디오 버퍼 로딩 완료 여부 확인 (판단 블록)
            addBlock(
                'webaudio_is_buffer_loaded',
                '오디오 버퍼 %1 의 로딩이 완료되었는가?',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['buf_0'] }
                    ],
                    map: { BUF_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    if (!state || !state.buffers) return false;

                    const bufName = script.getStringValue('BUF_NAME', script);
                    const targetBufObj = state.buffers[bufName];

                    return Boolean(targetBufObj && targetBufObj.loaded);
                },
                'basic_boolean_field'
            );

            // 1. 분석기(Analyser) 노드 생성
            addBlock(
                'webaudio_create_analyser',
                '분석기 노드 %1 생성 %2',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['analyser_0'] },
                        null
                    ],
                    map: { NODE_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    if (!ctx) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME', script);
                    const state = targetWindow.__ENTRY_WEBAUDIO__;

                    try {
                        if (state.nodes && state.nodes[nodeName]) {
                            try { state.nodes[nodeName].disconnect(); } catch (e) {}
                        }

                        const analyser = ctx.createAnalyser();
                        analyser.fftSize = 256; // 128개의 주파수 구간(bin) 생성

                        state.nodes[nodeName] = analyser;
                        console.log(`[WebAudio Extension] 분석기 노드 '${nodeName}' 생성 완료 (fftSize: 256)`);
                    } catch (e) {
                        console.error('[WebAudio Extension] 분석기 노드 생성 오류:', e);
                    }

                    return script.callReturn();
                }
            );

            // 2. 분석기의 현재 음량(0~100) 가져오기 (값 블록)
            addBlock(
                'webaudio_get_analyser_volume',
                '분석기 %1 의 현재 음량(0~100)',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' }
                    ],
                    def: [
                        { type: 'text', params: ['analyser_0'] }
                    ],
                    map: { NODE_NAME: 0 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    if (!state || !state.nodes) return 0;

                    const nodeName = script.getStringValue('NODE_NAME', script);
                    const analyser = state.nodes[nodeName];

                    if (!analyser || typeof analyser.getByteTimeDomainData !== 'function') return 0;

                    const dataArray = new Uint8Array(analyser.fftSize);
                    analyser.getByteTimeDomainData(dataArray);

                    // 파형 RMS(Root Mean Square) 계산 후 0~100 범위 스케일링
                    let sumSquare = 0;
                    for (let i = 0; i < dataArray.length; i++) {
                        const norm = (dataArray[i] - 128) / 128;
                        sumSquare += norm * norm;
                    }
                    const rms = Math.sqrt(sumSquare / dataArray.length);
                    const volume = Math.min(100, Math.round(rms * 100 * 2));

                    return volume;
                },
                'basic_string_field'
            );

            // 3. 주파수 데이터를 엔트리 리스트에 채우기
            addBlock(
                'webaudio_fill_frequency_list',
                '분석기 %1 의 주파수 데이터를 엔트리 리스트 %2 에 채우기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'string' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['analyser_0'] },
                        { type: 'text', params: ['주파수목록'] },
                        null
                    ],
                    map: { NODE_NAME: 0, LIST_NAME: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    if (!state || !state.nodes) return script.callReturn();

                    const nodeName = script.getStringValue('NODE_NAME', script);
                    const listName = script.getStringValue('LIST_NAME', script);

                    const analyser = state.nodes[nodeName];
                    if (!analyser || typeof analyser.getByteFrequencyData !== 'function') return script.callReturn();

                    const Entry = targetWindow.Entry;
                    if (!Entry || !Entry.variableContainer) return script.callReturn();

                    const list = Entry.variableContainer.getListByName
                    ? Entry.variableContainer.getListByName(listName)
                    : (Entry.variableContainer.lists_ || []).find(l => l.name === listName);

                    if (list) {
                        const dataArray = new Uint8Array(analyser.frequencyBinCount);
                        analyser.getByteFrequencyData(dataArray);

                        const freqValues = Array.from(dataArray);
                        if (typeof list.setArray === 'function') {
                            list.setArray(freqValues);
                        } else if (list.array_) {
                            list.array_ = freqValues.map(v => ({ data: v }));
                            if (typeof list.updateView === 'function') list.updateView();
                        }
                    } else {
                        console.warn(`[WebAudio Extension] 엔트리 리스트 '${listName}'를 찾을 수 없습니다.`);
                    }

                    return script.callReturn();
                }
            );

            // 1. 오디오 버퍼 재생 속도(배속/피치) 변경 블록
            addBlock(
                'webaudio_set_buffer_playback_rate',
                '오디오 버퍼 %1 의 재생 속도를 %2 배로 변경하기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        { type: 'Block', accept: 'number' },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['buf_0'] },
                        { type: 'number', params: [1] },
                        null
                    ],
                    map: { BUF_NAME: 0, RATE: 1 }
                },
                'text',
                (sprite, script) => {
                    const ctx = getAudioContext();
                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    if (!state || !state.buffers) return script.callReturn();

                    const bufName = script.getStringValue('BUF_NAME', script);
                    const rate = script.getNumberValue('RATE', script);

                    const targetBufObj = state.buffers[bufName];
                    if (targetBufObj) {
                        targetBufObj.playbackRate = rate;
                        // 활성화된 재생 소스가 있으면 즉시 반영
                        if (targetBufObj.activeSources) {
                            targetBufObj.activeSources.forEach((src) => {
                                try {
                                    src.playbackRate.setValueAtTime(rate, ctx.currentTime);
                                } catch (e) {}
                            });
                        }
                    }
                    return script.callReturn();
                }
            );

            // 2. 오디오 버퍼 반복 재생(Loop) 설정 블록
            addBlock(
                'webaudio_set_buffer_loop',
                '오디오 버퍼 %1 의 반복 재생(Loop)을 %2 으로 설정하기 %3',
                defaultColor,
                {
                    params: [
                        { type: 'Block', accept: 'string' },
                        {
                            type: 'Dropdown',
                            options: [
                                [' 킴 ', 'true'],
                                [' 끔 ', 'false']
                            ],
                            fontSize: 11,
                            arrowColor: '#e39c4b',
                            value: 'true'
                        },
                        { type: 'Indicator', img: '', size: 11 }
                    ],
                    def: [
                        { type: 'text', params: ['buf_0'] },
                        null,
                        null
                    ],
                    map: { BUF_NAME: 0, LOOP: 1 }
                },
                'text',
                (sprite, script) => {
                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    if (!state || !state.buffers) return script.callReturn();

                    const bufName = script.getStringValue('BUF_NAME', script);
                    const loopVal = (script.getField('LOOP', script) || script.getStringValue('LOOP', script)) === 'true';

                    const targetBufObj = state.buffers[bufName];
                    if (targetBufObj) {
                        targetBufObj.loop = loopVal;
                        if (targetBufObj.activeSources) {
                            targetBufObj.activeSources.forEach((src) => {
                                try {
                                    src.loop = loopVal;
                                } catch (e) {}
                            });
                        }
                    }
                    return script.callReturn();
                }
            );

            // 3. 모든 오디오 노드 정지 및 메모리 리셋 블록
            addBlock(
                'webaudio_stop_all_nodes',
                '모든 오디오 노드 연결 해제 및 정지하기 %1',
                { color: '#E74C3C', outerline: '#E74C3C', fontColor: '#ffffff' },
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
                    const state = targetWindow.__ENTRY_WEBAUDIO__;
                    if (!state) return script.callReturn();

                    // 1. 생성된 모든 오디오 노드 정지 및 disconnect
                    if (state.nodes) {
                        Object.keys(state.nodes).forEach((key) => {
                            const node = state.nodes[key];
                            try { if (typeof node.stop === 'function') node.stop(); } catch (e) {}
                            try { if (typeof node.disconnect === 'function') node.disconnect(); } catch (e) {}
                        });
                        state.nodes = {};
                    }

                    // 2. 활성화된 모든 오디오 버퍼 소스 정지 및 정리
                    if (state.buffers) {
                        Object.keys(state.buffers).forEach((key) => {
                            const bufObj = state.buffers[key];
                            if (bufObj && bufObj.activeSources) {
                                bufObj.activeSources.forEach((src) => {
                                    try { src.stop(); } catch (e) {}
                                    try { src.disconnect(); } catch (e) {}
                                });
                                bufObj.activeSources = [];
                            }
                        });
                    }

                    console.log('[WebAudio Extension] 모든 오디오 노드 연결 해제 및 리셋 완료');
                    return script.callReturn();
                }
            );

            // EntryStatic.getAllBlocks 오버라이딩 (추가된 부분)
            if (EntryStatic && typeof EntryStatic.getAllBlocks === 'function') {
                const originalGetAllBlocks = EntryStatic.getAllBlocks;
                EntryStatic.getAllBlocks = () => {
                    const blocks = originalGetAllBlocks();
                    const hasCustom = blocks.find(c => c.category === 'WebAudio');
                    if (!hasCustom) {
                        blocks.push({ category: 'WebAudio', blocks: webAudioBlocks });
                    }
                    return blocks;
                };
            }

            console.log('[WebAudio Extension] 모듈 주입 완료');
        }
    });

    // 3. EAPI Core가 이미 완료된 경우 갱신 (추가된 부분)
    if (typeof window.EAPI.render === 'function') {
        window.EAPI.render();
    }
})();