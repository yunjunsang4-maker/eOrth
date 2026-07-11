/**
 * albumSections 검증 — npx tsx src/utils/albumSections.verify.ts
 */
import {
  sectionSlices, addPhotosToSection, removePhotoAt, movePhotoToSection, deleteSection,
  normalizeSections, sectionIndexOf, type AlbumSection,
} from './albumSections';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n  want=${JSON.stringify(want)}\n  got =${JSON.stringify(got)}`}`);
};

const M = ['a', 'b', 'c', 'd', 'e'];
const S: AlbumSection[] = [
  { id: 's1', title: '1일차', count: 2 },
  { id: 's2', title: '2일차', count: 3 },
];

// 구간 계산
eq('slices', sectionSlices(S, 5).map((s) => [s.start, s.end]), [[0, 2], [2, 5]]);
eq('owner of idx3', sectionIndexOf(S, 5, 3), 1);

// 섹션에 추가 — 1일차 끝(idx2)에 삽입
const add = addPhotosToSection(M, S, 0, ['X', 'Y']);
eq('add medias', add.medias, ['a', 'b', 'X', 'Y', 'c', 'd', 'e']);
eq('add counts', add.sections.map((s) => s.count), [4, 3]);

// 삭제 — 2일차의 첫 사진(idx2='c') 제거
const rm = removePhotoAt(M, S, 2);
eq('rm medias', rm.medias, ['a', 'b', 'd', 'e']);
eq('rm counts', rm.sections.map((s) => s.count), [2, 2]);

// 이동 — 'a'(1일차)를 2일차 끝으로
const mv = movePhotoToSection(M, S, 0, 1);
eq('mv medias', mv.medias, ['b', 'c', 'd', 'e', 'a']);
eq('mv counts', mv.sections.map((s) => s.count), [1, 4]);

// 섹션 삭제 — 2일차 삭제 → 1일차가 흡수
eq('del section', deleteSection(S, 5, 1)?.map((s) => [s.title, s.count]), [['1일차', 5]]?.length === 1 ? [['1일차', 5]] : []);
// 첫 섹션 삭제 → 다음 섹션이 흡수
eq('del first', deleteSection(S, 5, 0)?.map((s) => [s.title, s.count]), [['2일차', 5]]);
// 마지막 하나 삭제 → null(평면 복귀)
eq('del last-one', deleteSection([{ id: 's', title: 'x', count: 5 }], 5, 0), null);

// 손상 데이터 보정 — counts 합 ≠ medias 길이
eq('normalize', normalizeSections([{ id: 'a', title: 'A', count: 2 }, { id: 'b', title: 'B', count: 9 }], 5).map((s) => s.count), [2, 3]);

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
if (fail > 0) process.exit(1);
