/**
 * 생년월일 입력 공용 유틸.
 * 온보딩(BasicInfoScreen)과 계정 설정(AccountSettingsScreen)에 같은 로직이 복사돼 있어
 * 한쪽만 고치면 규칙이 어긋나므로 여기로 모았다.
 */

/** 가입 가능 최소 연령 — 이용약관 제4조 2항(만 14세 미만 가입 불가) */
export const MIN_SIGNUP_AGE = 14;

const BIRTHDAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 입력 숫자를 YYYY-MM-DD 형태로 자동 정렬 (최대 8자리) */
export const formatBirthday = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  let out = y;
  if (digits.length > 4) out += '-' + m;
  if (digits.length > 6) out += '-' + d;
  return out;
};

/** YYYY-MM-DD 유효성 검사 (실제 존재하는 날짜 + 합리적 연도 범위) */
export const isValidBirthday = (v: string) => {
  const match = v.match(BIRTHDAY_RE);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const now = new Date().getFullYear();
  if (year < 1900 || year > now) return false;
  if (month < 1 || month > 12) return false;
  const maxDay = new Date(year, month, 0).getDate();
  return day >= 1 && day <= maxDay;
};

/** 생일 기준 만 나이. 형식이 올바르지 않으면 null */
export const getAge = (v: string): number | null => {
  if (!isValidBirthday(v)) return null;
  const [year, month, day] = v.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  // 올해 생일이 아직 안 지났으면 한 살 빼기
  const thisMonth = today.getMonth() + 1;
  if (thisMonth < month || (thisMonth === month && today.getDate() < day)) age -= 1;
  return age;
};

/** 가입 가능 연령(만 14세 이상)인지. 형식이 잘못된 값은 false */
export const isOldEnough = (v: string) => {
  const age = getAge(v);
  return age !== null && age >= MIN_SIGNUP_AGE;
};
