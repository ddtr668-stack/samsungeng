═══════════════════════════════════════════════════════════════
  Drive 연동 수정 패치 · 2026-09-21 (v3)
═══════════════════════════════════════════════════════════════

【 이번에 잡은 버그 】

  ▼ v2 이후 새 에러: "OAuth 에러: [object Object]"

  원인: requestAccessToken() 이 실패했을 때
        `new Error('인증 실패: ' + resp.error)` 로 문자열 연결하는데
        resp.error 가 객체인 경우 "[object Object]" 로 변환됨.

  수정: OAuth 에러 코드 (popup_closed, access_denied, invalid_client 등)
        를 감지해서 사람이 읽을 수 있는 메시지로 자동 변환.
        예:
          invalid_client  → "OAuth Client ID가 잘못되었거나
                             승인된 JavaScript 원본에 현재 주소가
                             등록되지 않았습니다."
          access_denied   → "OAuth 동의 화면 → 테스트 사용자에
                             로그인한 계정을 추가하세요."
          popup_closed    → "팝업 차단 여부를 확인하세요."


【 v2 에서 잡은 버그 (기억용) 】

  Drive API 400 Bad Request
  → gapi.client 에 OAuth 토큰이 세팅되지 않아 인증 없이 요청 나감.
  → requestAccessToken() 성공 시 gapi.client.setToken() 자동 호출로 해결.


【 교체할 파일 · 3개 】

  assets/js/lib-drive-picker.jsx           ★ OAuth 에러 파싱 개선
  assets/js/components-site-folders.jsx    (원인별 힌트 매칭 확장)
  assets/js/lib-drive-folders.jsx          (v2 변경분 유지)


【 적용 방법 】

  1) 기존 설치 폴더의 같은 경로 파일 3개를 이 폴더 것으로 덮어쓰기
  2) 브라우저 강제 새로고침 (Ctrl+F5 / Cmd+Shift+R)  ← 필수!
  3) 계약 상세 페이지 재진입
  4) 이제 실패해도 화면에 명확한 에러 원인이 표시됩니다.


【 이번 화면에서 나온 "OAuth 에러: [object Object]" 원인 추정 】

  아마도 다음 중 하나:

  · Google Cloud Console → OAuth Client ID 의
    "승인된 JavaScript 원본" 에 현재 접속 주소 미등록
    → 등록 후 5분 정도 대기했다가 재시도

  · OAuth 동의 화면 → 테스트 사용자 목록에 로그인 계정 미추가
    → 추가 후 재시도

  · 팝업 차단
    → 주소창 옆 팝업 아이콘 클릭 → 허용 → 재시도

  이 패치 적용 후 재시도하면 셋 중 어느 것인지 화면에 명확히 표시됩니다.

═══════════════════════════════════════════════════════════════
