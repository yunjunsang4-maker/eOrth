// 스페인식(es-ES) 덮어쓰기 리소스 — es.ts(중남미 중립형)와 다르게 쓰는 키만 둔다.
//
// ⚠️ 여기 없는 키는 i18next 계층(es-ES → es → en)으로 es.ts가 나간다. 그래서 이 파일은 항상 작아야 한다.
// ⚠️ 어떤 키를 둘지는 es.STYLE.md 4절 차이표가 단일 출처다 — 표에 없는 차이를 발견하면 표에 먼저 적는다.
//    localeParity.verify.ts가 "es-ES 키는 전부 es.ts에도 있어야 한다"를 검사해 고아 키를 막는다.
// ⚠️ ko.ts 처럼 import 없는 순수 객체를 유지할 것(type import는 예외).
import type es from './es';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

const esES: DeepPartial<typeof es> = {
  basicInfo: {
    // ingresar → introducir
    handleTaken: 'Ese ID ya está en uso. Introduce otro.',
    // estadía → estancia
    stayToggle: 'Actualmente en una estancia larga en el extranjero',
    stayCountryLabel: 'País de estancia',
    stayTypeLabel: 'Tipo de estancia',
    residenceSearchPlaceholder: 'Buscar país (ej.: España, japan)',
  },
  main: {
    // agregar → añadir
    favoriteAddA11y: 'Añadir {{country}} a favoritos',
    regionTagChip_one: '{{count}} registro aquí · Añadir regiones visitadas',
    regionTagChip_other: '{{count}} registros aquí · Añadir regiones visitadas',
    coachGlobeDesc: 'Los países que visitaste se iluminan. Toca un país para añadir o ver sus registros.',
    coachFabTitle: 'Añadir registro +',
    coachFabDesc: 'Añade un registro nuevo en el formato que prefieras: feed, blog, tira, álbum y más.',
    // rompecabezas → puzle
    puzzle: 'Puzle',
    puzzleImageLabel: 'Imagen del puzle',
    puzzleNeedPhoto: 'Elige una foto para llenar el puzle',
    puzzleAdjustTitle: 'Ajustar el área del puzle',
    puzzlePickChip: 'Elegir foto del puzle',
    puzzleShareTitle: '¡Puzle completo!',
  },
};

export default esES;
