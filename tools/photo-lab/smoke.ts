import { groupPhotosBySpot } from '../../src/services/photoAI/photoGrouping';
import { filterByQuality } from '../../src/services/photoAI/qualityAssessment';
import type { PhotoMeta } from '../../src/services/photoAI/types';
const p = (id: string, t: number): PhotoMeta => ({ id, uri: id, thumbnailUri: null, creationTime: t, width: 1, height: 1, location: null });
const ps = [p('a', 0), p('b', 60_000), p('c', 3 * 3600_000)];
const groups = groupPhotosBySpot(ps);
if (groups.length !== 2) throw new Error(`그룹 수 기대 2, 실제 ${groups.length}`);
if (filterByQuality(ps).length !== 3) throw new Error('품질 필터 실패');
console.log('smoke ok');
