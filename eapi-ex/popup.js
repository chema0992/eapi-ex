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
  const currentVersion = chrome.runtime.getManifest().version;
  const currentVerEl = document.getElementById('current-version');
  if (currentVerEl) currentVerEl.textContent = currentVersion;

  checkAppUpdate(currentVersion);
});

async function checkAppUpdate(currentVersion) {
  const versionStatusEl = document.getElementById('version-status');
  const updateBtn = document.getElementById('update-btn');
  const latestVerEl = document.getElementById('latest-version');

  try {
    const response = await fetch('https://api.github.com/repos/chema0992/eapi-ex/releases/latest');
    if (!response.ok) throw new Error('API 응답 실패');

    const data = await response.json();
    const latestVersion = data.tag_name.replace(/^v/, ''); 

    if (isNewerVersion(latestVersion, currentVersion)) {
      // 새 버전이 있는 경우: 최신 버전 뱃지 숨기고 업데이트 버튼 표시
      if (versionStatusEl) versionStatusEl.style.display = 'none';
      if (latestVerEl) latestVerEl.textContent = latestVersion;
      if (updateBtn) updateBtn.style.display = 'block';
    } else {
      // 이미 최신 버전인 경우
      if (versionStatusEl) {
        versionStatusEl.textContent = '✅ 최신 버전입니다';
        versionStatusEl.className = 'version-status status-latest';
        versionStatusEl.style.display = 'inline-block';
      }
      if (updateBtn) updateBtn.style.display = 'none';
    }
  } catch (error) {
    // 네트워크 오류 시 안내
    if (versionStatusEl) {
      versionStatusEl.textContent = '버전 확인 불가 (오프라인)';
      versionStatusEl.className = 'version-status status-error';
    }
  }
}

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