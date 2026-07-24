// 국가명 별칭·매칭 — MainScreen과 recordStore가 공유(지구본 국가 대표사진 계산용)
export const koAliases = (name?: string | null): string[] =>
  name === '대한민국' || name === '한국' ? ['대한민국', '한국'] : name ? [name] : [];

export const matchesCountry = (
  r: { countryName?: string; countries?: { name: string }[] },
  name: string,
): boolean => {
  const set = koAliases(name);
  return set.includes(r.countryName ?? '') || !!r.countries?.some((c) => set.includes(c.name));
};
