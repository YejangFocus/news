# news
예장포커스

## 이슈 자동 묶기

기사를 push하면 GitHub Actions가 `scripts/sync_issues.py`를 실행해 `data/issues.json`을 자동 갱신합니다.

- **자동 합류**: 어느 이슈에도 속하지 않은 새 기사가 기존 이슈 기사와 내용·날짜가 비슷하면 그 이슈에 붙습니다(`auto_added`에 기록).
- **자동 신설**: 비슷한 새 기사가 2건 이상 모이면 `"auto": true` 이슈를 만듭니다. 제목·요약을 직접 다듬으려면 `"auto": true` 줄을 지우세요(편집자 소유가 됨).
- **직접 지정**: 기사 `<head>`에 `<meta name="issue" content="이슈id">`를 넣으면 해당 이슈에 확실히 묶입니다.
- **제외**: 자동 합류된 기사를 빼려면 이슈에 `"exclude": ["폴더/기사.html"]`을 추가하세요.
- 편집자가 쓴 제목·요약·`articles`는 스크립트가 지우거나 바꾸지 않습니다.
- 로컬 확인: `python3 scripts/sync_issues.py --dry-run` (`--explain`: 유사도 목록 출력)
