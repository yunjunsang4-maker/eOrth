/**
 * 여행기록카드 썸네일 캐시.
 *
 * 배경: 카드 배경으로 쓰는 사진(coverUri)은 대부분 원본 크기다(피드 기록은 대표 사진을
 * 그대로 쓴다). 3000~4000px짜리를 170~390dp 카드에 그리느라 프로필에 들어올 때마다
 * 디코딩이 오래 걸렸다. 가져온 앨범만 bakeCoverCrop으로 축소본을 굽고 있었다.
 *
 * 그래서 카드 크기에 맞춘 축소본을 한 번 만들어 documentDirectory에 두고 재사용한다.
 * 저장 흐름을 건드리지 않고 화면에서 필요할 때 굽기 때문에, 이미 만들어 둔 예전 기록도
 * 처음 한 번만 굽고 그다음부터 빨라진다.
 *
 * iOS 컨테이너 경로 대응: 절대경로를 저장하지 않는다. 파일명은 원본 경로의 '앱 저장소
 * 이후 부분'만으로 해싱하고, 실제 경로는 매번 documentDirectory에서 다시 만든다.
 * 재설치로 컨테이너가 바뀌어도 같은 이름을 가리키므로 다시 구울 필요가 없다.
 */
import { useEffect, useState } from 'react';

/** 카드 배경 가로 목표치(px) — 전체폭 대표 카드(약 390dp)까지 커버하는 값 */
const THUMB_WIDTH_PX = 900;

/** 원본 경로 → 만들어 둔 썸네일 경로 */
const cache = new Map<string, string>();
/** 같은 사진을 여러 카드가 동시에 요청할 때 중복 생성 방지 */
const inflight = new Map<string, Promise<string | null>>();
/** 구울 수 없는 원본(ph:// 등) — 매 렌더 재시도를 막는다 */
const failed = new Set<string>();

/** 앱 저장소 이후 경로만 남긴다 — 컨테이너 경로가 바뀌어도 같은 키가 나온다 */
function stableKey(uri: string): string {
  const i = uri.indexOf('/Documents/');
  const tail = i >= 0 ? uri.slice(i + '/Documents/'.length) : uri;
  // djb2
  let h = 5381;
  for (let k = 0; k < tail.length; k++) h = ((h << 5) + h + tail.charCodeAt(k)) | 0;
  return (h >>> 0).toString(36);
}

export function clearCardThumbCache() {
  cache.clear();
  inflight.clear();
  failed.clear();
}

/**
 * 축소본 경로를 반환한다. 없으면 만들고, 못 만들면 null.
 * 같은 원본에 대해 앱 실행 중 한 번만 실제 작업이 일어난다.
 */
export async function ensureCardThumb(sourceUri: string): Promise<string | null> {
  const hit = cache.get(sourceUri);
  if (hit) return hit;
  if (failed.has(sourceUri)) return null;
  const running = inflight.get(sourceUri);
  if (running) return running;

  const job = (async (): Promise<string | null> => {
    try {

      const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
      const base = FileSystem.documentDirectory;
      if (!base) return null;

      const dir = `${base}cardThumbs/`;
      const out = `${dir}${stableKey(sourceUri)}.jpg`;

      // 이미 구워둔 게 있으면 그대로 쓴다(앱 재실행·재설치 후에도 유효)
      const info = await FileSystem.getInfoAsync(out);
      if (info.exists) { cache.set(sourceUri, out); return out; }

      try { await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); } catch { /* 이미 있으면 무시 */ }


      const ImageManipulator = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
      // 변형 없이 한 번 호출해 실제 크기 측정 — 원본이 목표보다 작으면 확대하지 않는다
      const meta = await ImageManipulator.manipulateAsync(sourceUri, [], {});
      const actions = meta.width > THUMB_WIDTH_PX
        ? [{ resize: { width: THUMB_WIDTH_PX } }]
        : [];
      const res = await ImageManipulator.manipulateAsync(
        sourceUri,
        actions,
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      await FileSystem.copyAsync({ from: res.uri, to: out });
      cache.set(sourceUri, out);
      return out;
    } catch {
      // ph:// 등 구울 수 없는 원본 — 호출부가 원본을 그대로 그리도록 둔다
      failed.add(sourceUri);
      return null;
    } finally {
      inflight.delete(sourceUri);
    }
  })();

  inflight.set(sourceUri, job);
  return job;
}

/**
 * 카드에서 쓸 사진 경로. 축소본이 준비되기 전에는 원본을 그대로 반환하므로
 * 사진이 안 보이는 구간이 생기지 않는다(첫 1회만 원본, 그다음부터 축소본).
 */
export function useCardThumb(sourceUri?: string): string | undefined {
  const [thumb, setThumb] = useState<string | undefined>(() =>
    sourceUri ? cache.get(sourceUri) : undefined
  );

  useEffect(() => {
    if (!sourceUri) { setThumb(undefined); return; }
    const hit = cache.get(sourceUri);
    if (hit) { setThumb(hit); return; }
    setThumb(undefined);
    let cancelled = false;
    ensureCardThumb(sourceUri).then((u) => { if (!cancelled && u) setThumb(u); });
    return () => { cancelled = true; };
  }, [sourceUri]);

  return thumb ?? sourceUri;
}
