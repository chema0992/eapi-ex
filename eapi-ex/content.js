function injectScript(filePath) {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL(filePath);
  (document.head || document.documentElement).appendChild(script);
}

// 1. 코어 스크립트 먼저 주입
injectScript('src/core.user.js');

// 2. 토글 설정이 켜진 모듈만 주입
const modules = ['webgl', 'wasm', 'webaudio', 'webworker', 'indexeddb'];

chrome.storage.local.get(modules, (result) => {
  modules.forEach(mod => {
    const isEnabled = result[mod] !== false; // 기본값: 켜짐
    if (isEnabled) {
      injectScript(`src/${mod}.user.js`);
    }
  });
});