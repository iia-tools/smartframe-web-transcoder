import './style.css';
import { BrowserConverter, type ConversionProgress } from './converter';
import { FrameApi, type Job } from './frame-api';
import { parseLaunchSession } from './session';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('앱을 시작하지 못했습니다.');

app.innerHTML = `
  <section class="shell">
    <header><span class="mark">SF</span><div><p>SmartFrame 도구</p><h1>브라우저 영상 변환</h1></div></header>
    <div class="privacy"><strong>영상은 외부 서버로 전송되지 않습니다.</strong><span>이 기기가 같은 Wi-Fi의 스마트프레임에서 직접 읽고 다시 저장합니다.</span></div>
    <article class="card">
      <div class="file-icon" aria-hidden="true">▶</div>
      <div><p class="eyebrow" id="phase">연결 확인</p><h2 id="fileName">변환할 영상을 확인하고 있습니다…</h2><p id="detail">창을 닫지 마세요.</p></div>
      <div class="progress" role="progressbar" aria-label="변환 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="bar"></span></div>
      <div class="stats"><strong id="percent">0%</strong><span id="stats">준비 중</span></div>
      <button id="start" type="button" disabled>H.264 변환 시작</button>
      <button id="cancel" class="secondary" type="button" hidden>취소</button>
      <p class="status" id="status" role="status" aria-live="polite"></p>
    </article>
    <details><summary>변환 방식과 제한</summary><ul><li>긴 변 1280px, H.264, AAC MP4 사본을 만듭니다.</li><li>원본 영상은 그대로 유지됩니다.</li><li>변환 성능과 10비트 HEVC 지원 여부는 이 기기의 브라우저와 GPU에 따라 달라집니다.</li><li>10분짜리 일회용 권한은 선택한 영상 한 편에만 사용할 수 있습니다.</li></ul></details>
  </section>`;

const elements = {
  phase: required('phase'), fileName: required('fileName'), detail: required('detail'),
  bar: required('bar'), percent: required('percent'), stats: required('stats'),
  start: requiredButton('start'), cancel: requiredButton('cancel'), status: required('status'),
  progress: document.querySelector<HTMLElement>('[role="progressbar"]')!,
};

let converter: BrowserConverter | null = null;
let job: Job | null = null;

function required(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`${id} 요소가 없습니다.`);
  return element;
}

function requiredButton(id: string): HTMLButtonElement {
  return required(id) as HTMLButtonElement;
}

function bytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  return `${(value / 1024 / 1024).toFixed(value > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function showError(error: unknown): void {
  elements.phase.textContent = '변환할 수 없음';
  elements.status.textContent = error instanceof Error ? error.message : String(error);
  elements.status.className = 'status error';
  elements.start.disabled = true;
  elements.cancel.hidden = true;
}

function update(progress: ConversionProgress): void {
  const percent = Math.max(0, Math.min(100, Math.round(progress.progress * 100)));
  const labels = { checking: '호환성 확인', converting: 'H.264 변환 중', saving: '스마트프레임에 저장 중', complete: '변환 완료' };
  elements.phase.textContent = labels[progress.phase];
  elements.fileName.textContent = progress.job.file_name;
  elements.bar.style.width = `${percent}%`;
  elements.percent.textContent = `${percent}%`;
  elements.progress.setAttribute('aria-valuenow', String(percent));
  elements.stats.textContent = progress.phase === 'saving'
    ? `${bytes(progress.uploadedBytes)} 저장됨`
    : `${Math.round(progress.processedSeconds)}초 처리 · 원본 ${bytes(progress.job.input_bytes)}`;
  if (progress.phase === 'complete') {
    elements.detail.textContent = `${progress.job.output_name} · 스마트프레임 캐시 / 브라우저 변환`;
    elements.status.textContent = 'H.264 사본을 저장했습니다. 이 창을 닫아도 됩니다.';
    elements.status.className = 'status success';
    elements.cancel.hidden = true;
  }
}

async function bootstrap(): Promise<void> {
  try {
    const session = parseLaunchSession(location.hash);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    const api = new FrameApi(session);
    job = await api.job();
    elements.fileName.textContent = job.file_name;
    elements.detail.textContent = `원본 ${bytes(job.input_bytes)} · 결과 ${job.output_name}`;
    elements.phase.textContent = '변환 준비 완료';
    elements.status.textContent = '이 기기의 GPU가 지원하면 10비트 HEVC도 변환할 수 있습니다.';
    elements.start.disabled = false;
    converter = new BrowserConverter(api, update);
    void startConversion();
  } catch (error) {
    showError(error);
  }
}

async function startConversion(): Promise<void> {
  if (!converter || !job) return;
  elements.start.disabled = true;
  elements.cancel.hidden = false;
  elements.status.textContent = '변환 중에는 이 탭을 앞에 두고 기기가 절전되지 않게 해 주세요.';
  elements.status.className = 'status';
  try {
    await converter.run();
  } catch (error) {
    showError(error);
  }
}

elements.start.addEventListener('click', () => void startConversion());

elements.cancel.addEventListener('click', async () => {
  elements.cancel.disabled = true;
  await converter?.cancel();
  elements.phase.textContent = '변환 취소';
  elements.status.textContent = '완료되지 않은 사본을 삭제했습니다. 원본은 유지됩니다.';
  elements.cancel.hidden = true;
});

void bootstrap();
