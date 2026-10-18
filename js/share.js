// 기록 링크 — 서버 없이 가족 휴대폰과 기록을 나눈다.
//
// 한 아이의 최근 기록(store.sharePack)을 줄여(deflate) 주소의 # 뒤에 담는다. # 뒤는 웹 서버로 가지 않는다
// (GitHub Pages 기록에도 남지 않는다). 받은 휴대폰은 열 때 읽어 「합치기」를 묻는다(store.mergeData).
// 링크를 보낸 메신저에는 남으니 가족에게만 보내라고 알린다.

const MARK = '#share=';
// 카카오톡 등에 붙이기 좋은 길이 — 넘으면 기간을 줄인다
export const MAX_LINK = 8000;

const toB64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (text) => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** 자료 → 링크에 담을 글. 앞 글자로 줄였는지 표시(z: deflate · j: 그대로). */
export async function encode(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'function') return `z${toB64(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
  return `j${toB64(bytes)}`;
}

export async function decode(text) {
  const kind = text[0];
  let bytes = fromB64(text.slice(1));
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== 'j') throw new Error('기록 링크가 아닙니다.');
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** 이 앱 주소 + 자료. base 는 # 앞까지(지금 주소). */
export async function linkFor(data, base) {
  return `${base.split('#')[0]}${MARK}${await encode(data)}`;
}

/** 주소의 # 에 기록 링크가 있으면 그 글, 없으면 null. */
export const fromHash = (hash) => (hash && hash.startsWith(MARK) ? hash.slice(MARK.length) : null);
