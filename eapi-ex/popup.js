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

document.addEventListener('DOMContentLoaded', () => {
  // 1. 현재 manifest.json의 버전을 자동으로 가져와서 UI에 표시
  const currentVersion = chrome.runtime.getManifest().version;
  const currentVerEl = document.getElementById('current-version');
  if (currentVerEl) currentVerEl.textContent = currentVersion;

  // 2. 깃허브 최신 버전 체크 함수 실행
  checkAppUpdate(currentVersion);
});

async function checkAppUpdate(currentVersion) {
  try {
    // GitHub API로 최신 release 정보 조회
    const response = await fetch('https://api.github.com/repos/chema0992/eapi-ex/releases/latest');
    if (!response.ok) return;

    const data = await response.json();
    // 'v1.0.1' 형태에서 'v' 제거
    const latestVersion = data.tag_name.replace(/^v/, ''); 

    // 최신 버전이 현재 버전보다 높은 경우
    if (isNewerVersion(latestVersion, currentVersion)) {
      const updateBtn = document.getElementById('update-btn');
      const latestVerEl = document.getElementById('latest-version');
      
      if (latestVerEl) latestVerEl.textContent = latestVersion;
      if (updateBtn) updateBtn.style.display = 'inline-block';
    }
  } catch (error) {
    // 오프라인이거나 API 오류 시 조용히 무시
    console.log('버전 체크 실패:', error);
  }
}

// 간단한 버전 비교 함수 (예: "1.0.1" > "1.0.0")
function isNewerVersion(latest, current) {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);

  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lNum = l[i] || 0;
    const cNum = c[i] || 0;
    if (lNum > cNum) return true;
    if (lNum < cNum) return false;
  }
  return false;
}