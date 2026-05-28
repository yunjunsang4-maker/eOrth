import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
  Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRecords } from '../../store/recordStore';
import { COUNTRIES } from '../../constants/countries';

const { width: screenWidth } = Dimensions.get('window');
const CELL = Math.floor((screenWidth - 48 - 12) / 7);
const WEEK_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function sameDay(a: Date, b: Date) { return toKey(a) === toKey(b); }
function isBefore(a: Date, b: Date) { return toKey(a) < toKey(b); }
function parseDS(s: string): Date {
  const [y, m, d] = s.split('.').map(Number);
  const dt = new Date(y, m - 1, d); dt.setHours(0,0,0,0); return dt;
}
function formatDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function RangePickerModal({ visible, initialStart, initialEnd, onConfirm, onClose }: {
  visible: boolean; initialStart: Date; initialEnd: Date;
  onConfirm: (s: Date, e: Date) => void; onClose: () => void;
}) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [viewYear,  setViewYear]  = useState(initialStart.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialStart.getMonth());
  const [tempStart, setTempStart] = useState<Date|null>(initialStart);
  const [tempEnd,   setTempEnd]   = useState<Date|null>(initialEnd);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const translateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    if (visible) {
      setTempStart(initialStart); setTempEnd(initialEnd); setSelectingEnd(false);
      setViewYear(initialStart.getFullYear()); setViewMonth(initialStart.getMonth());
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 12 }).start();
    } else { translateY.setValue(600); }
  }, [visible]);

  const grid = useCallback(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (Date|null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= days; d++) { const dt = new Date(viewYear, viewMonth, d); dt.setHours(0,0,0,0); cells.push(dt); }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const handleDay = (date: Date) => {
    if (!selectingEnd) { setTempStart(date); setTempEnd(null); setSelectingEnd(true); }
    else {
      if (isBefore(date, tempStart!)) { setTempStart(date); setTempEnd(null); }
      else { setTempEnd(date); setSelectingEnd(false); }
    }
  };

  const isInRange = (d: Date) => tempStart && tempEnd ? !isBefore(d, tempStart) && !isBefore(tempEnd, d) : false;
  const fmtSel = (d: Date|null) => d ? formatDate(d) : '—';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' }}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[rpSt.sheet, { transform:[{ translateY }] }]}>
          <View style={rpSt.handle} />
          <View style={rpSt.selectedRow}>
            <View style={rpSt.selectedItem}>
              <Text style={rpSt.selectedLabel}>시작일</Text>
              <Text style={[rpSt.selectedDate, !selectingEnd && rpSt.selectedDateActive]}>{fmtSel(tempStart)}</Text>
            </View>
            <Text style={rpSt.arrow}>→</Text>
            <View style={rpSt.selectedItem}>
              <Text style={rpSt.selectedLabel}>종료일</Text>
              <Text style={[rpSt.selectedDate, selectingEnd && rpSt.selectedDateActive]}>{fmtSel(tempEnd)}</Text>
            </View>
          </View>
          <View style={rpSt.monthNav}>
            <TouchableOpacity onPress={() => viewMonth===0?(setViewMonth(11),setViewYear(y=>y-1)):setViewMonth(m=>m-1)} style={rpSt.navBtn}><Text style={rpSt.navArrow}>‹</Text></TouchableOpacity>
            <Text style={rpSt.monthTitle}>{viewYear}년 {MONTH_NAMES[viewMonth]}</Text>
            <TouchableOpacity onPress={() => viewMonth===11?(setViewMonth(0),setViewYear(y=>y+1)):setViewMonth(m=>m+1)} style={rpSt.navBtn}><Text style={rpSt.navArrow}>›</Text></TouchableOpacity>
          </View>
          <View style={rpSt.weekRow}>
            {WEEK_DAYS.map((d,i) => (
              <Text key={d} style={[rpSt.weekDay, { width: CELL }, i===0&&{color:'#FF6B6B'}, i===6&&{color:'#5B9BD5'}]}>{d}</Text>
            ))}
          </View>
          <View style={rpSt.grid}>
            {grid().map((date, idx) => {
              if (!date) return <View key={`e-${idx}`} style={{ width: CELL, height: CELL }} />;
              const isStart = !!tempStart && sameDay(date, tempStart);
              const isEnd   = !!tempEnd   && sameDay(date, tempEnd);
              const isEdge  = isStart || isEnd;
              const inRange = isInRange(date);
              const dow = date.getDay();
              return (
                <TouchableOpacity key={toKey(date)} onPress={() => handleDay(date)} activeOpacity={0.7}
                  style={[rpSt.dayCell, { width: CELL, height: CELL }, inRange && !isEdge && rpSt.inRange, isEdge && rpSt.edgeCell]}>
                  <Text style={[rpSt.dayText,
                    dow===0 && !isEdge && { color: '#FF6B6B' },
                    dow===6 && !isEdge && { color: '#5B9BD5' },
                    isEdge && { color: '#fff', fontWeight: '700' },
                  ]}>{date.getDate()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={rpSt.confirmBtn} onPress={() => { onConfirm(tempStart ?? today, tempEnd ?? tempStart ?? today); onClose(); }} activeOpacity={0.85}>
            <Text style={rpSt.confirmText}>확인</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const rpSt = StyleSheet.create({
  sheet: { backgroundColor:'#13102A', borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:16, paddingBottom:32, paddingTop:12, borderTopWidth:1, borderTopColor:'rgba(191,133,252,0.2)' },
  handle: { width:40, height:4, borderRadius:2, backgroundColor:'#3A3A55', alignSelf:'center', marginBottom:16 },
  selectedRow: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:12, marginBottom:12 },
  selectedItem: { alignItems:'center', gap:4 },
  selectedLabel: { fontSize:11, color:'#A1A1B0', fontWeight:'600' },
  selectedDate: { fontSize:14, color:'#A1A1B0', fontWeight:'600' },
  selectedDateActive: { color:'#BF85FC', fontSize:15 },
  arrow: { fontSize:16, color:'#A1A1B0' },
  monthNav: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
  navBtn: { padding:8 },
  navArrow: { fontSize:22, color:'#fff' },
  monthTitle: { fontSize:15, fontWeight:'700', color:'#fff' },
  weekRow: { flexDirection:'row', marginBottom:4 },
  weekDay: { textAlign:'center', fontSize:12, color:'#A1A1B0', paddingVertical:4 },
  grid: { flexDirection:'row', flexWrap:'wrap' },
  dayCell: { alignItems:'center', justifyContent:'center' },
  inRange: { backgroundColor:'rgba(107,33,168,0.25)' },
  edgeCell: { backgroundColor:'#6B21A8', borderRadius: CELL/2 },
  dayText: { fontSize:14, color:'#E0E0EF' },
  confirmBtn: { backgroundColor:'#6B21A8', borderRadius:14, height:50, justifyContent:'center', alignItems:'center', marginTop:16 },
  confirmText: { color:'#fff', fontSize:16, fontWeight:'700' },
});

const COLORS = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  purpleNeon: '#BF85FC',
  purpleDeep: '#6B21A8',
  white: '#FFFFFF',
  textDim: '#A1A1B0',
  divider: '#1A1A26',
};

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

type Cut = { photo: string | null; caption: string };

const INITIAL_CUTS: Cut[] = [
  { photo: null, caption: '' },
  { photo: null, caption: '' },
  { photo: null, caption: '' },
  { photo: null, caption: '' },
];

export default function StoryboardRecordScreen({ navigation, route }: { navigation: any; route: any }) {
  const { addRecord } = useRecords();

  const [step, setStep] = useState(1);
  const [countrySearch, setCountrySearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<{ flag: string; name: string } | null>(null);
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate,   setEndDate]   = useState(getTodayString());
  const [rangePickerVisible, setRangePickerVisible] = useState(false);
  const [cuts, setCuts] = useState<Cut[]>(INITIAL_CUTS);
  const [title, setTitle] = useState('');
  const [rating, setRating] = useState(0);
  const [selectedCutIndex, setSelectedCutIndex] = useState<number | null>(null);

  useEffect(() => {
    const params = route?.params;
    if (params?.selectedCountry) {
      const name = params.selectedCountry.name?.toLowerCase() || '';
      const found = COUNTRIES.find(c => c.term.includes(name) || c.name === params.selectedCountry.name);
      if (found) {
        setSelectedCountry({ flag: found.flag, name: found.name });
      }
    }
  }, [route?.params]);

  const cellSize = (screenWidth - 32 - 4) / 2;

  const filtered = useMemo(
    () =>
      COUNTRIES.filter(c =>
        c.term.toLowerCase().includes(countrySearch.toLowerCase())
      ).slice(0, 20),
    [countrySearch]
  );

  const pickPhoto = async (index: number) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newCuts = [...cuts];
      newCuts[index] = { ...newCuts[index], photo: result.assets[0].uri };
      setCuts(newCuts);
    }
  };

  const handleCutTap = (index: number) => {
    if (cuts[index].photo === null) {
      pickPhoto(index);
      return;
    }
    // 탭-스왑: 첫 번째 탭으로 선택, 두 번째 탭으로 스왑
    if (selectedCutIndex === null) {
      setSelectedCutIndex(index);
    } else if (selectedCutIndex === index) {
      setSelectedCutIndex(null);
    } else {
      // 스왑
      const newCuts = [...cuts];
      const temp = newCuts[selectedCutIndex];
      newCuts[selectedCutIndex] = newCuts[index];
      newCuts[index] = temp;
      setCuts(newCuts);
      setSelectedCutIndex(null);
    }
  };

  const updateCaption = (index: number, text: string) => {
    const newCuts = [...cuts];
    newCuts[index] = { ...newCuts[index], caption: text };
    setCuts(newCuts);
  };

  const handleSave = () => {
    if (!selectedCountry) return;
    const validMedias = cuts.map(c => c.photo).filter(Boolean) as string[];
    addRecord({
      viewType: 'storyboard',
      country: selectedCountry.flag,
      countryName: selectedCountry.name,
      countryFlag: selectedCountry.flag,
      countries: [selectedCountry],
      content: title || '스토리보드 기록',
      medias: validMedias,
      rating,
      date: startDate === endDate ? startDate : `${startDate} ~ ${endDate}`,
      visibility: 'friends',
      isVoyager: false,
      user: { name: '나', emoji: '✈️', handle: 'yunjunsung' },
      timestamp: Date.now(),
    } as any);
    navigation.goBack();
  };

  const canNext = () => {
    if (step === 1) return !!selectedCountry;
    return true;
  };

  // ── 헤더 ──
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
        <Text style={styles.cancelTxt}>취소</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>🎬 스토리보드</Text>
      <View style={{ width: 44 }} />
    </View>
  );

  // ── 하단 NavBar ──
  const renderNavBar = () => (
    <View style={styles.navBar}>
      {step > 1 ? (
        <TouchableOpacity style={styles.prevBtn} onPress={() => setStep(s => s - 1)} activeOpacity={0.8}>
          <Text style={styles.prevTxt}>← 이전</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.prevPlaceholder} />
      )}
      {step < 4 ? (
        <TouchableOpacity
          style={[styles.nextBtn, !canNext() && styles.nextBtnDisabled]}
          onPress={() => canNext() && setStep(s => s + 1)}
          disabled={!canNext()}
          activeOpacity={0.85}
        >
          <Text style={styles.nextBtnText}>다음 →</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
          <Text style={styles.saveBtnText}>저장하기</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── 도트 ──
  const renderDots = () => (
    <View style={styles.dotsRow}>
      {[1, 2, 3, 4].map(n => (
        <View
          key={n}
          style={[
            styles.dot,
            n === step ? styles.dotActive : n < step ? styles.dotDone : styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );

  // ── Step 1: 국가 + 날짜 ──
  const renderStep1 = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>어느 나라에서였나요?</Text>

        {selectedCountry ? (
          <TouchableOpacity
            style={styles.selectedCountryRow}
            onPress={() => { setSelectedCountry(null); setCountrySearch(''); }}
          >
            <Text style={styles.selectedCountryFlag}>{selectedCountry.flag}</Text>
            <Text style={styles.selectedCountryName}>{selectedCountry.name}</Text>
            <Text style={[styles.textDim, { marginLeft: 'auto' }]}>변경</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="국가 검색..."
              placeholderTextColor={COLORS.textDim}
              value={countrySearch}
              onChangeText={setCountrySearch}
            />
            {countrySearch.length > 0 && (
              <View style={styles.searchResults}>
                {filtered.map(c => (
                  <TouchableOpacity
                    key={c.term}
                    style={styles.searchResultItem}
                    onPress={() => {
                      setSelectedCountry({ flag: c.flag, name: c.name });
                      setCountrySearch('');
                    }}
                  >
                    <Text style={styles.searchResultFlag}>{c.flag}</Text>
                    <Text style={styles.searchResultName}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>여행 기간</Text>
        <TouchableOpacity style={styles.dateRangeRow} onPress={() => setRangePickerVisible(true)} activeOpacity={0.75}>
          <View style={[styles.dateBox, { flex: 1 }]}>
            <Text style={styles.dateLabelSmall}>시작일</Text>
            <Text style={styles.dateText}>{startDate}</Text>
          </View>
          <Text style={[styles.textDim, { paddingHorizontal: 8 }]}>~</Text>
          <View style={[styles.dateBox, { flex: 1 }]}>
            <Text style={styles.dateLabelSmall}>종료일</Text>
            <Text style={styles.dateText}>{endDate}</Text>
          </View>
          <Text style={{ fontSize: 14, paddingLeft: 4 }}>✏️</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ── Step 2: 4컷 그리드 ──
  const renderStep2 = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>4컷을 채워보세요</Text>
        {selectedCutIndex !== null && (
          <Text style={[styles.textDim, { marginBottom: 8, fontSize: 13 }]}>
            {selectedCutIndex + 1}번 컷 선택됨 — 다른 컷을 탭하면 순서가 바뀝니다
          </Text>
        )}

        <View style={styles.cutsGrid}>
          {cuts.map((cut, i) => (
            <View key={i} style={{ width: cellSize, marginBottom: 4 }}>
              <TouchableOpacity
                style={[
                  styles.cutCell,
                  { width: cellSize, height: cellSize },
                  selectedCutIndex === i && styles.cutCellSelected,
                ]}
                onPress={() => handleCutTap(i)}
                activeOpacity={0.85}
              >
                {cut.photo ? (
                  <Image source={{ uri: cut.photo }} style={{ width: cellSize, height: cellSize }} resizeMode="cover" />
                ) : (
                  <View style={styles.cutPlaceholder}>
                    <Text style={styles.cutPlusText}>+</Text>
                    <Text style={styles.cutIndexText}>{i + 1}컷</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TextInput
                style={styles.captionInput}
                placeholder={`${i + 1}컷 설명...`}
                placeholderTextColor={COLORS.textDim}
                value={cut.caption}
                onChangeText={t => updateCaption(i, t)}
                maxLength={20}
              />
            </View>
          ))}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ── Step 3: 제목 + 별점 ──
  const renderStep3 = () => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>스토리보드 제목</Text>
        <TextInput
          style={styles.titleInput}
          placeholder="제목을 입력하세요..."
          placeholderTextColor={COLORS.textDim}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>여행 별점</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map(n => (
            <TouchableOpacity key={n} onPress={() => setRating(n)} style={styles.starBtn}>
              <Text style={[styles.starIcon, n <= rating && styles.starActive]}>★</Text>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ── Step 4: 미리보기 + 저장 ──
  const renderStep4 = () => (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.previewLabel}>이렇게 저장될 거예요</Text>

      <View style={styles.previewMeta}>
        <Text style={styles.previewTitle}>{title || '스토리보드 기록'}</Text>
        {selectedCountry && (
          <Text style={styles.previewCountry}>{selectedCountry.flag} {selectedCountry.name}</Text>
        )}
        <Text style={styles.previewDate}>{startDate === endDate ? startDate : `${startDate} ~ ${endDate}`}</Text>
        {rating > 0 && (
          <Text style={styles.previewRating}>
            {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
          </Text>
        )}
      </View>

      <View style={styles.cutsGrid}>
        {cuts.map((cut, i) => (
          <View key={i} style={{ width: cellSize, marginBottom: 4 }}>
            <View style={[styles.cutCell, { width: cellSize, height: cellSize }]}>
              {cut.photo ? (
                <Image source={{ uri: cut.photo }} style={{ width: cellSize, height: cellSize }} resizeMode="cover" />
              ) : (
                <View style={styles.cutPlaceholder}>
                  <Text style={styles.cutIndexText}>{i + 1}컷</Text>
                </View>
              )}
            </View>
            {cut.caption.length > 0 && (
              <Text style={styles.previewCaption} numberOfLines={1}>{cut.caption}</Text>
            )}
          </View>
        ))}
      </View>

    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderDots()}
      <View style={{ flex: 1 }}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </View>
      {renderNavBar()}
      <RangePickerModal
        visible={rangePickerVisible}
        initialStart={parseDS(startDate)}
        initialEnd={parseDS(endDate)}
        onConfirm={(s, e) => { setStartDate(formatDate(s)); setEndDate(formatDate(e)); }}
        onClose={() => setRangePickerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  cancelTxt: {
    color: COLORS.textDim,
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  navBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 24,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
  },
  prevPlaceholder: { flex: 0 },
  prevBtn: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  prevTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textDim,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: COLORS.purpleNeon,
    width: 20,
    borderRadius: 4,
  },
  dotDone: {
    backgroundColor: COLORS.purpleDeep,
  },
  dotInactive: {
    backgroundColor: COLORS.card,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionLabel: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  textDim: {
    color: COLORS.textDim,
    fontSize: 14,
  },
  selectedCountryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    gap: 10,
  },
  selectedCountryFlag: {
    fontSize: 22,
  },
  selectedCountryName: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    color: COLORS.white,
    fontSize: 15,
    marginBottom: 4,
  },
  searchResults: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  searchResultFlag: {
    fontSize: 20,
  },
  searchResultName: {
    color: COLORS.white,
    fontSize: 15,
  },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 4,
  },
  dateBox: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
  },
  dateLabelSmall: {
    color: COLORS.textDim,
    fontSize: 11,
    marginBottom: 2,
  },
  dateText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  dateEditHint: {
    fontSize: 14,
  },
  nextBtn: {
    flex: 2,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  cutsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  cutCell: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.purpleNeon,
    overflow: 'hidden',
  },
  cutCellSelected: {
    borderColor: COLORS.purpleNeon,
    borderWidth: 2.5,
  },
  cutPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  cutPlusText: {
    color: COLORS.purpleNeon,
    fontSize: 28,
    fontWeight: '300',
  },
  cutIndexText: {
    color: COLORS.textDim,
    fontSize: 12,
  },
  captionInput: {
    color: COLORS.textDim,
    fontSize: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  titleInput: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 14,
    color: COLORS.white,
    fontSize: 15,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  starBtn: {
    padding: 4,
  },
  starIcon: {
    fontSize: 36,
    color: COLORS.card,
  },
  starActive: {
    color: COLORS.purpleNeon,
  },
  previewLabel: {
    color: COLORS.textDim,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  previewMeta: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 4,
  },
  previewTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  previewCountry: {
    color: COLORS.textDim,
    fontSize: 14,
  },
  previewDate: {
    color: COLORS.textDim,
    fontSize: 13,
  },
  previewRating: {
    color: COLORS.purpleNeon,
    fontSize: 18,
    marginTop: 4,
  },
  previewCaption: {
    color: COLORS.textDim,
    fontSize: 10,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  saveBtn: {
    flex: 2,
    backgroundColor: COLORS.purpleDeep,
    borderRadius: 14,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
