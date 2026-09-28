const modules = ['webgl', 'wasm', 'webaudio', 'webworker', 'indexeddb'];

// 팝업 열릴 때 저장된 설정 불러오기
chrome.storage.local.get(modules, (result) => {
  modules.forEach(mod => {
    const checkbox = document.getElementById(mod);
    if (checkbox) {
      checkbox.checked = result[mod] !== false; // 기본값: 켜짐
    }
  });
});

// 체크박스 클릭 시 설정 저장하기
modules.forEach(mod => {
  const checkbox = document.getElementById(mod);
  if (checkbox) {
    checkbox.addEventListener('change', (e) => {
      chrome.storage.local.set({ [mod]: e.target.checked });
    });
  }
});