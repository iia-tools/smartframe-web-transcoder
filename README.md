# SmartFrame Web Transcoder

SmartFrame Hub의 관리 페이지를 연 컴퓨터·스마트폰에서 영상을 H.264/AAC MP4로 변환하는 정적 웹 앱입니다. 변환에는 브라우저 WebCodecs와 [Mediabunny](https://mediabunny.dev/)를 사용합니다.

## 데이터 흐름

1. SmartFrame Hub가 선택한 영상 한 편에만 유효한 10분짜리 일회용 토큰을 만듭니다.
2. SmartFrame Hub가 HTTPS GitHub Pages의 정적 변환 도구를 엽니다.
3. 관리 페이지가 선택한 원본의 범위 읽기와 결과 저장만 검증된 `postMessage` 채널로 중계합니다.
4. 브라우저가 긴 변 1280px, H.264/AAC MP4로 변환합니다.
5. 결과를 4MB 조각으로 관리 페이지에 돌려보냅니다.
6. 프레임은 H.264 트랙과 해상도를 검사한 뒤 `스마트프레임 캐시 / 브라우저 변환`에 사본을 저장합니다.

영상 바이트는 변환 페이지의 브라우저 메모리에서만 처리되고 GitHub 서버나 별도 서버로 전송되지 않습니다. PIN·관리자 세션 쿠키도 변환 페이지에 전달하지 않습니다. 실행 권한은 URL fragment에 실리므로 GitHub 서버 요청에 포함되지 않으며, 토큰은 선택한 영상 한 편의 읽기와 변환 결과 저장에만 쓸 수 있습니다.

## 로컬 개발

```bash
npm ci
npm test
npm run dev
```

로컬 페이지는 SmartFrame Hub가 허용하는 `localhost` 또는 `127.0.0.1` Origin에서만 프레임 API에 접근할 수 있습니다. 실제 사용은 SmartFrame Hub 파일 관리자에서 `이 브라우저에서 H.264 변환`을 눌러 시작합니다.

## 호환성

- 최신 Chrome·Edge의 WebCodecs 권장
- 관리 페이지를 닫으면 안전한 중계가 끊기므로 변환이 끝날 때까지 두 창을 모두 유지해야 함
- 예전 APK의 직접 LAN 방식은 Chrome·Edge에서 로컬 네트워크 접근 허용이 필요함
- 입력 HEVC Main 10 디코딩 지원 여부는 운영체제·GPU·브라우저에 따라 다름
- Safari와 Firefox는 필요한 WebCodecs 코덱 지원이 없을 수 있음
- DRM 영상은 지원하지 않음

## 라이선스

프로젝트 코드는 MIT입니다. Mediabunny는 MPL-2.0이며 npm 의존성으로 원형 그대로 사용합니다.
