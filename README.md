# SmartFrame Web Transcoder

SmartFrame Hub의 관리 페이지를 연 컴퓨터·스마트폰에서 영상을 H.264/AAC MP4로 변환하는 정적 웹 앱입니다. 변환에는 브라우저 WebCodecs와 [Mediabunny](https://mediabunny.dev/)를 사용합니다.

## 데이터 흐름

1. SmartFrame Hub가 선택한 영상 한 편에만 유효한 10분짜리 일회용 토큰을 만듭니다.
2. SmartFrame Hub가 HTTPS GitHub Pages의 정적 변환 도구를 엽니다.
3. 사용자가 브라우저의 로컬 네트워크 접근을 한 번 허용하면, 변환 도구가 같은 LAN의 SmartFrame Hub 변환 전용 포트에서 원본을 Range 요청으로 직접 읽습니다.
4. 브라우저가 긴 변 1280px, H.264/AAC MP4로 변환합니다.
5. 결과를 4MB 조각으로 SmartFrame Hub에 직접 올립니다.
6. 프레임은 H.264 트랙과 해상도를 검사한 뒤 `스마트프레임 캐시 / 브라우저 변환`에 사본을 저장합니다.

GitHub Pages와 별도 서버는 영상, PIN, 계정 정보에 접근하지 않습니다. 실행 권한은 URL fragment에 실리므로 GitHub 서버 요청에도 포함되지 않습니다. 프레임의 변환 전용 포트는 관리 API를 제공하지 않으며, 토큰은 선택한 영상 한 편의 읽기와 변환 결과 저장에만 쓸 수 있습니다.

## 로컬 개발

```bash
npm ci
npm test
npm run dev
```

로컬 페이지는 SmartFrame Hub가 허용하는 `localhost` 또는 `127.0.0.1` Origin에서만 프레임 API에 접근할 수 있습니다. 실제 사용은 SmartFrame Hub 파일 관리자에서 `이 브라우저에서 H.264 변환`을 눌러 시작합니다.

## 호환성

- 최신 Chrome·Edge의 WebCodecs 권장
- Chrome·Edge에서 표시되는 로컬 네트워크 접근 요청을 허용해야 함
- 광고 차단·보안 앱이 웹 트래픽을 필터링하면 GitHub Pages와 프레임 LAN 주소를 예외로 허용해야 할 수 있음
- 입력 HEVC Main 10 디코딩 지원 여부는 운영체제·GPU·브라우저에 따라 다름
- Safari와 Firefox는 필요한 WebCodecs 코덱 지원이 없을 수 있음
- DRM 영상은 지원하지 않음

## 라이선스

프로젝트 코드는 MIT입니다. Mediabunny는 MPL-2.0이며 npm 의존성으로 원형 그대로 사용합니다.
