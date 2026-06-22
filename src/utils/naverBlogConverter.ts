/**
 * 네이버 블로그 ↔ eOrth 앱 양방향 변환 유틸리티
 *
 * - toNaverHtml(): 앱 블로그 데이터 → 네이버 블로그 호환 HTML
 * - toNaverHtmlFromBlocks(): 블록 기반 → 네이버 블로그 호환 HTML
 * - parseNaverHtml(): 네이버 블로그 HTML → 앱 블로그 데이터
 */

import type { BlogBlock, TextBlock, HeadingBlock } from '../types/blogBlocks';

// ─── 순서 보존 콘텐츠 블록 ───
export interface OrderedBlock {
  type: 'text' | 'image' | 'video' | 'images';
  value: string | string[]; // 텍스트/URL (단일) 또는 URL 배열 (images)
  layout?: 'grid2' | 'grid3' | 'slide'; // images 전용: 원본 레이아웃
}

// ─── 앱 블로그 데이터 인터페이스 ───
export interface BlogData {
  title: string;
  body: string;
  photos: string[];
  videos?: string[];
  /** 원본 순서를 보존한 콘텐츠 블록 배열 */
  orderedBlocks?: OrderedBlock[];
  memo?: string;
  startDate?: string;
  endDate?: string;
  rating?: number;
  companions?: string[];
  weather?: string;
  keywords?: string[];
  countryName?: string;
  countryFlag?: string;
}

// ─── 블록 → 네이버 HTML 변환 ───
export function toNaverHtmlFromBlocks(
  title: string,
  blocks: BlogBlock[],
  meta: Omit<BlogData, 'title' | 'body' | 'photos'>,
  keywords?: string[],
): string {
  const lines: string[] = [];
  lines.push('<!--eOrth-blog-start-->');
  lines.push('<div class="se-main-container">');

  // 제목
  if (title) {
    lines.push(wrapSeText(
      `<p class="se-text-paragraph se-text-paragraph-align-center" style="font-size:28px;font-weight:bold;">${escapeHtml(title)}</p>`,
      'se-title'
    ));
  }

  lines.push('<div class="se-component se-horizontalLine"><hr/></div>');

  // 여행 정보 테이블
  const infoRows: string[] = [];
  if (meta.countryName) infoRows.push(makeInfoRow('여행지', `${meta.countryFlag || ''} ${meta.countryName}`));
  if (meta.startDate && meta.endDate) infoRows.push(makeInfoRow('기간', `${meta.startDate} ~ ${meta.endDate}`));
  else if (meta.startDate) infoRows.push(makeInfoRow('날짜', meta.startDate));
  if (meta.companions && meta.companions.length > 0) infoRows.push(makeInfoRow('동행', meta.companions.join(', ')));
  if (meta.weather) infoRows.push(makeInfoRow('날씨', meta.weather));
  if (meta.rating && meta.rating > 0) infoRows.push(makeInfoRow('평점', '★'.repeat(meta.rating) + '☆'.repeat(5 - meta.rating)));

  if (infoRows.length > 0) {
    lines.push('<div class="se-component se-table">');
    lines.push('<table class="se-table-content" style="width:100%;border-collapse:collapse;margin:16px 0;">');
    lines.push('<tbody>' + infoRows.join('') + '</tbody></table></div>');
  }

  // 블록 순회
  for (const block of blocks) {
    switch (block.type) {
      case 'text': {
        const tb = block as TextBlock;
        if (!tb.value.trim()) break;
        let style = '';
        if (tb.bold) style += 'font-weight:bold;';
        if (tb.italic) style += 'font-style:italic;';
        if (tb.underline) style += 'text-decoration:underline;';
        if (tb.strikethrough) style += 'text-decoration:line-through;';
        if (tb.color) style += `color:${tb.color};`;
        if (tb.bgColor && tb.bgColor !== 'transparent') style += `background-color:${tb.bgColor};`;
        if (tb.fontSize) style += `font-size:${tb.fontSize}px;`;
        const align = tb.align || 'left';
        const escaped = escapeHtml(tb.value).replace(/\n/g, '<br/>');
        lines.push(wrapSeText(
          `<p class="se-text-paragraph se-text-paragraph-align-${align}" style="${style}">${escaped}</p>`
        ));
        break;
      }
      case 'heading': {
        const hb = block as HeadingBlock;
        const sizes = { 1: 26, 2: 22, 3: 18 };
        const sz = sizes[hb.level] || 22;
        const align = hb.align || 'left';
        lines.push(wrapSeText(
          `<p class="se-text-paragraph se-text-paragraph-align-${align}" style="font-size:${sz}px;font-weight:bold;">${escapeHtml(hb.value)}</p>`
        ));
        break;
      }
      case 'image':
        lines.push(`<div class="se-component se-image se-l-default"><div class="se-section se-section-image">`);
        lines.push(`<img src="${escapeHtml(block.uri)}" class="se-image-resource" style="max-width:100%;"/>`);
        if (block.caption) lines.push(`<div class="se-caption"><p>${escapeHtml(block.caption)}</p></div>`);
        lines.push('</div></div>');
        break;
      case 'images':
        block.items.forEach(item => {
          lines.push(`<div class="se-component se-image se-l-default"><div class="se-section se-section-image">`);
          lines.push(`<img src="${escapeHtml(item.uri)}" class="se-image-resource" style="max-width:100%;"/>`);
          if (item.caption) lines.push(`<div class="se-caption"><p>${escapeHtml(item.caption)}</p></div>`);
          lines.push('</div></div>');
        });
        break;
      case 'separator':
        lines.push('<div class="se-component se-horizontalLine"><hr/></div>');
        break;
      case 'quote':
        lines.push(`<div class="se-component se-quotation"><blockquote class="se-quote" style="border-left:4px solid #BF85FC;padding-left:16px;font-style:italic;color:#888;">`);
        lines.push(`<p>${escapeHtml(block.value)}</p>`);
        lines.push('</blockquote></div>');
        break;
      case 'link':
        lines.push(`<div class="se-component se-oglink"><a href="${escapeHtml(block.url)}" target="_blank" style="color:#007AFF;text-decoration:underline;">${escapeHtml(block.title || block.url)}</a>`);
        if (block.description) lines.push(`<p style="color:#888;font-size:12px;">${escapeHtml(block.description)}</p>`);
        lines.push('</div>');
        break;
      case 'video':
        lines.push(`<div class="se-component se-video se-l-default"><div class="se-section se-section-video">`);
        lines.push(`<iframe src="${escapeHtml(block.uri)}" style="width:100%;height:auto;aspect-ratio:16/9;" frameborder="0" allowfullscreen></iframe>`);
        if (block.caption) lines.push(`<div class="se-caption"><p>${escapeHtml(block.caption)}</p></div>`);
        lines.push('</div></div>');
        break;
    }
  }

  // 키워드
  if (keywords && keywords.length > 0) {
    const tags = keywords.map(k => `<a class="se-link" style="color:#00a832;text-decoration:none;">#${escapeHtml(k)}</a>`).join(' ');
    lines.push(wrapSeText(`<p class="se-text-paragraph">${tags}</p>`));
  }

  lines.push('</div>');
  lines.push('<!--eOrth-blog-end-->');

  // 메타데이터
  const metaObj: Record<string, any> = {};
  if (meta.countryName) metaObj.countryName = meta.countryName;
  if (meta.countryFlag) metaObj.countryFlag = meta.countryFlag;
  if (meta.startDate) metaObj.startDate = meta.startDate;
  if (meta.endDate) metaObj.endDate = meta.endDate;
  if (meta.rating) metaObj.rating = meta.rating;
  if (meta.companions) metaObj.companions = meta.companions;
  if (meta.weather) metaObj.weather = meta.weather;
  if (keywords) metaObj.keywords = keywords;
  lines.push(`<!--eOrth-meta:${JSON.stringify(metaObj)}-->`);

  return lines.join('\n');
}

// ─── 앱 → 네이버 블로그 HTML 변환 (레거시, BlogData 기반) ───
export function toNaverHtml(data: BlogData): string {
  const lines: string[] = [];

  lines.push('<!--eOrth-blog-start-->');
  lines.push('<div class="se-main-container">');

  if (data.title) {
    lines.push(wrapSeText(
      `<p class="se-text-paragraph se-text-paragraph-align-center" style="font-size:28px;font-weight:bold;">${escapeHtml(data.title)}</p>`,
      'se-title'
    ));
  }

  lines.push('<div class="se-component se-horizontalLine"><hr/></div>');

  const infoRows: string[] = [];
  if (data.countryName) infoRows.push(makeInfoRow('여행지', `${data.countryFlag || ''} ${data.countryName}`));
  if (data.startDate && data.endDate) infoRows.push(makeInfoRow('기간', `${data.startDate} ~ ${data.endDate}`));
  else if (data.startDate) infoRows.push(makeInfoRow('날짜', data.startDate));
  if (data.companions && data.companions.length > 0) infoRows.push(makeInfoRow('동행', data.companions.join(', ')));
  if (data.weather) infoRows.push(makeInfoRow('날씨', data.weather));
  if (data.rating && data.rating > 0) infoRows.push(makeInfoRow('평점', '★'.repeat(data.rating) + '☆'.repeat(5 - data.rating)));

  if (infoRows.length > 0) {
    lines.push('<div class="se-component se-table">');
    lines.push('<table class="se-table-content" style="width:100%;border-collapse:collapse;margin:16px 0;">');
    lines.push('<tbody>' + infoRows.join('') + '</tbody></table></div>');
  }

  if (data.photos.length > 0) {
    data.photos.forEach((uri, idx) => {
      lines.push(`<div class="se-component se-image se-l-default"><div class="se-section se-section-image">`);
      lines.push(`<img src="${escapeHtml(uri)}" alt="여행 사진 ${idx + 1}" class="se-image-resource" style="max-width:100%;"/>`);
      lines.push('</div></div>');
    });
  }

  if (data.body) {
    const paragraphs = data.body.split(/\n\n+/);
    const pTags = paragraphs.map(para => {
      const escaped = escapeHtml(para).replace(/\n/g, '<br/>');
      return `<p class="se-text-paragraph">${escaped}</p>`;
    }).join('');
    lines.push(wrapSeText(pTags));
  }

  if (data.keywords && data.keywords.length > 0) {
    const tags = data.keywords.map(k => `<a class="se-link" style="color:#00a832;text-decoration:none;">#${escapeHtml(k)}</a>`).join(' ');
    lines.push(wrapSeText(`<p class="se-text-paragraph">${tags}</p>`));
  }

  lines.push('</div>');
  lines.push('<!--eOrth-blog-end-->');

  const meta: Record<string, any> = {};
  if (data.countryName) meta.countryName = data.countryName;
  if (data.countryFlag) meta.countryFlag = data.countryFlag;
  if (data.startDate) meta.startDate = data.startDate;
  if (data.endDate) meta.endDate = data.endDate;
  if (data.rating) meta.rating = data.rating;
  if (data.companions) meta.companions = data.companions;
  if (data.weather) meta.weather = data.weather;
  if (data.keywords) meta.keywords = data.keywords;
  lines.push(`<!--eOrth-meta:${JSON.stringify(meta)}-->`);

  return lines.join('\n');
}

// ─── 네이버 블로그 HTML → 앱 데이터 파싱 ───
export function parseNaverHtml(html: string): BlogData {
  const result: BlogData = {
    title: '',
    body: '',
    photos: [],
  };

  // 1) eOrth 메타데이터가 있으면 우선 사용
  const metaMatch = html.match(/<!--eOrth-meta:(.*?)-->/);
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch[1]);
      if (meta.countryName) result.countryName = meta.countryName;
      if (meta.countryFlag) result.countryFlag = meta.countryFlag;
      if (meta.startDate) result.startDate = meta.startDate;
      if (meta.endDate) result.endDate = meta.endDate;
      if (meta.rating) result.rating = meta.rating;
      if (meta.companions) result.companions = meta.companions;
      if (meta.weather) result.weather = meta.weather;
      if (meta.keywords) result.keywords = meta.keywords;
    } catch {}
  }

  // 2) 제목 추출
  // 네이버 블로그 제목: se-title 클래스 또는 <title> 또는 __title 패턴
  const titlePatterns = [
    /<div[^>]*class="[^"]*se-title[^"]*"[^>]*>[\s\S]*?<p[^>]*>(.*?)<\/p>/i,
    /<h2[^>]*class="[^"]*se_textarea[^"]*"[^>]*>(.*?)<\/h2>/i,
    /<div[^>]*class="[^"]*pcol1[^"]*"[^>]*>(.*?)<\/div>/i,
    /<title[^>]*>(.*?)<\/title>/i,
    /<p[^>]*se-text-paragraph[^>]*style="[^"]*font-size:28px[^"]*"[^>]*>(.*?)<\/p>/i,
  ];
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      result.title = stripHtml(match[1]).trim();
        if (result.title) break;
    }
  }

  // 3) 이미지 URL 추출
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    const src = imgMatch[1];
    // 아이콘/로고 등 작은 이미지 제외
    if (
      src.includes('postfiles') || // 네이버 블로그 첨부 이미지
      src.includes('blogfiles') ||
      src.includes('phinf.pstatic') ||
      src.includes('se-image-resource') ||
      src.startsWith('file://') || // 로컬 이미지
      src.startsWith('content://') ||
      (!src.includes('static') && !src.includes('icon') && !src.includes('logo'))
    ) {
      result.photos.push(decodeHtmlEntities(src));
    }
  }

  // 4) 본문 텍스트 추출
  const bodyTexts: string[] = [];

  // 네이버 SmartEditor 3.0 본문
  const se3Regex = /<div[^>]*class="[^"]*se-module-text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let se3Match;
  while ((se3Match = se3Regex.exec(html)) !== null) {
    const block = se3Match[1];
    // se-title 블록은 제목이므로 스킵
    if (html.substring(Math.max(0, se3Match.index - 200), se3Match.index).includes('se-title')) {
      continue;
    }
    const text = stripHtml(block).trim();
    if (text) bodyTexts.push(text);
  }

  // SmartEditor 2.0 본문 (fallback)
  if (bodyTexts.length === 0) {
    const se2Regex = /<div[^>]*class="[^"]*se_textarea[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let se2Match;
    while ((se2Match = se2Regex.exec(html)) !== null) {
      const text = stripHtml(se2Match[1]).trim();
      if (text) bodyTexts.push(text);
    }
  }

  // 일반 p 태그 fallback
  if (bodyTexts.length === 0) {
    const pRegex = /<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(html)) !== null) {
      const text = stripHtml(pMatch[1]).trim();
      // 제목과 동일하면 스킵
      if (text && text !== result.title) bodyTexts.push(text);
    }
  }

  result.body = bodyTexts.join('\n\n');

  // 5) 해시태그/키워드 추출
  if (!result.keywords || result.keywords.length === 0) {
    // HTML 태그를 모두 제거하여 순수 텍스트에서만 해시태그 추출
    // → CSS 색상(#fff, #000000), HTML 속성값(#time_group">) 등이 잡히는 것 방지
    const textOnly = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ');
    const tagRegex = /#([가-힣a-zA-Z][가-힣a-zA-Z0-9_]{0,19})/g;
    const tags: string[] = [];
    let tagMatch;
    while ((tagMatch = tagRegex.exec(textOnly)) !== null) {
      const tag = tagMatch[1].replace(/[,.\-!?]/g, '').trim();
      if (tag && !tags.includes(tag) && tag.length >= 2 && tag.length <= 20) {
        tags.push(tag);
      }
    }
    if (tags.length > 0) result.keywords = tags.slice(0, 10);
  }

  return result;
}

// ─── WebView에서 네이버 블로그 콘텐츠를 추출하는 JS 코드 ───
// 폴링 방식: 콘텐츠가 DOM에 없으면 조용히 리턴 (다음 폴링에서 재시도)
export const NAVER_BLOG_EXTRACT_JS = `
(function() {
  // 이미 추출 완료했으면 중복 실행 방지
  if (window.__eOrthExtracted) return;
  try {
    var doc = document;
    try {
      var iframe = document.getElementById('mainFrame') || document.querySelector('iframe[id*="main"]');
      if (iframe && iframe.contentDocument) doc = iframe.contentDocument;
    } catch(e) {}

    // ── 본문 영역 탐색 (콘텐츠 존재 여부 판별 기준) ──
    var bodySelectors = [
      '.se-main-container',
      '.se_component_wrap',
      '#postViewArea',
      '.post-view',
      '#viewTypeSelector',
      '.post_ct',
      '.blog_view_content',
      'article',
      '#ct .post_ct',
      '#content',
    ];
    var bodyEl = null;
    for (var bi = 0; bi < bodySelectors.length; bi++) {
      var candidate = doc.querySelector(bodySelectors[bi]);
      if (candidate && candidate.innerHTML && candidate.innerHTML.length > 200) {
        bodyEl = candidate;
        break;
      }
    }

    // ★ 핵심: 본문이 아직 렌더링 안 됐으면 조용히 리턴 (다음 폴링에서 재시도)
    if (!bodyEl) return;

    var content = bodyEl.innerHTML;

    // ── 제목 추출 ──
    var title = '';
    var titleSelectors = [
      '.se-title-text',
      '.se-module-text-blog-title',
      'h3.se_textarea',
      'h2.se_title',
      '.tit_h3',
      '.pcol1',
      '.blog_tit',
      '.se_title .se_textarea',
      '.post_tit',
      'h2[class*="title"]',
      'h3[class*="title"]',
      '.se-text-paragraph[style*="font-size:28"]',
    ];
    for (var ti = 0; ti < titleSelectors.length; ti++) {
      var titleEl = doc.querySelector(titleSelectors[ti]);
      if (titleEl && (titleEl.innerText || titleEl.textContent || '').trim()) {
        title = (titleEl.innerText || titleEl.textContent || '').trim();
        break;
      }
    }
    // og:title fallback
    if (!title) {
      var ogTitle = doc.querySelector('meta[property="og:title"]');
      if (ogTitle && ogTitle.getAttribute('content')) title = ogTitle.getAttribute('content').trim();
    }

    // ── vid → URL 변환 헬퍼 ──
    var vidToUrl = function(vid) {
      if (!vid) return '';
      if (vid.startsWith('http')) return vid;
      return 'https://tv.naver.com/embed/' + vid;
    };

    // ── 이미지 최적 URL 추출 헬퍼 ──
    var getBestImgSrc = function(img) {
      var best = img.getAttribute('data-lazy-src')
        || img.getAttribute('data-src')
        || img.getAttribute('data-origin-src')
        || img.getAttribute('data-full-src')
        || img.getAttribute('data-image-src')
        || img.getAttribute('data-original')
        || img.src
        || img.currentSrc
        || '';
      if (!best || best.length < 10) return '';
      if (best.indexOf('data:image') === 0) return '';
      if (best.indexOf('about:') === 0) return '';
      // 아이콘/로고 제외
      if (best.indexOf('static.naver') !== -1) return '';
      if (best.indexOf('/icon') !== -1 || best.indexOf('/logo') !== -1) return '';
      best = best.replace(/\\?type=w\\d+/i, '?type=w773');
      return best;
    };

    // ── 영상 URL 추출 헬퍼 ──
    var extractVideoUrl = function(comp) {
      var moduleEls = comp.querySelectorAll('[data-module]');
      for (var i = 0; i < moduleEls.length; i++) {
        try {
          var m = JSON.parse(moduleEls[i].getAttribute('data-module') || '{}');
          var d = m.data || m;
          var u = vidToUrl(d.vid || d.videoId || d.url || d.videoUrl || d.playUrl || '');
          if (u) return u;
        } catch(e) {}
      }
      var seModEls = comp.querySelectorAll('[__se_module_data]');
      for (var i = 0; i < seModEls.length; i++) {
        try {
          var raw = seModEls[i].getAttribute('__se_module_data') || '';
          var m = JSON.parse(raw);
          var d = m.data || m;
          var u = vidToUrl(d.vid || d.videoId || d.url || d.videoUrl || d.playUrl || '');
          if (u) return u;
        } catch(e) {}
      }
      var vidAttr = comp.getAttribute('data-vid') || comp.getAttribute('data-video-id');
      if (vidAttr) return vidToUrl(vidAttr);
      var iframeEl = comp.querySelector('iframe[src]');
      if (iframeEl) {
        var src = iframeEl.getAttribute('src') || '';
        if (src.indexOf('tv.naver') !== -1 || src.indexOf('youtube') !== -1 ||
            src.indexOf('youtu.be') !== -1 || src.indexOf('player.naver') !== -1) return src;
      }
      var videoEl = comp.querySelector('video[src], video source[src]');
      if (videoEl) return videoEl.getAttribute('src') || '';
      var playEl = comp.querySelector('[data-play-url]');
      if (playEl) return playEl.getAttribute('data-play-url') || '';
      var rmcEl = comp.querySelector('[data-video-url], .u_rmcplayer, .rmcplayer');
      if (rmcEl) return rmcEl.getAttribute('data-video-url') || vidToUrl(rmcEl.getAttribute('data-vid') || '');
      return '';
    };

    // ── DOM 순회 → orderedBlocks ──
    var orderedBlocks = [];
    var images = [];
    var videos = [];
    var root = bodyEl;

    // SmartEditor 3.0 se-component 순회
    var allComps = root.querySelectorAll('.se-component, .se_component');
    var components = [];
    for (var ci = 0; ci < allComps.length; ci++) {
      var p = allComps[ci].parentElement;
      var isNested = false;
      while (p && p !== root) {
        if (p.classList && (p.classList.contains('se-component') || p.classList.contains('se_component'))) {
          isNested = true; break;
        }
        p = p.parentElement;
      }
      if (!isNested) components.push(allComps[ci]);
    }

    if (components.length > 0) {
      components.forEach(function(comp) {
        var cls = comp.className || '';
        if (cls.indexOf('se-title') !== -1) return;

        // 이미지 (그룹사진 감지: 콜라주/슬라이드)
        if (cls.indexOf('se-image') !== -1 || cls.indexOf('se-imageStrip') !== -1 ||
            cls.indexOf('se_image') !== -1) {
          var imgEls = comp.querySelectorAll('img');
          var groupUrls = [];
          imgEls.forEach(function(img) {
            var bestSrc = getBestImgSrc(img);
            if (bestSrc) {
              groupUrls.push(bestSrc);
              images.push(bestSrc);
            }
          });
          if (groupUrls.length > 1) {
            // 그룹사진: 레이아웃 감지
            var layout = 'grid2';
            if (cls.indexOf('se-imageStrip') !== -1 || cls.indexOf('se-l-slide') !== -1 ||
                cls.indexOf('slide') !== -1) {
              layout = 'slide';
            } else if (groupUrls.length >= 3) {
              layout = 'grid3';
            }
            orderedBlocks.push({ type: 'images', value: groupUrls, layout: layout });
          } else if (groupUrls.length === 1) {
            orderedBlocks.push({ type: 'image', value: groupUrls[0] });
          }
          return;
        }

        // 영상
        if (cls.indexOf('se-video') !== -1 || cls.indexOf('se_video') !== -1 ||
            cls.indexOf('se-oembed') !== -1 || cls.indexOf('se_oembed') !== -1 ||
            comp.querySelector('video, iframe[src*="tv.naver"], iframe[src*="youtube"], iframe[src*="player.naver"], [data-vid], [data-module], [__se_module_data], .u_rmcplayer, .rmcplayer')) {
          var videoUrl = extractVideoUrl(comp);
          if (videoUrl && videoUrl.length > 5) {
            orderedBlocks.push({ type: 'video', value: videoUrl });
            if (videos.indexOf(videoUrl) === -1) videos.push(videoUrl);
          }
          return;
        }

        // 텍스트
        if (cls.indexOf('se-text') !== -1 || cls.indexOf('se_text') !== -1 ||
            cls.indexOf('se-quotation') !== -1 || cls.indexOf('se_quotation') !== -1) {
          var text = (comp.innerText || comp.textContent || '').trim();
          if (text && text !== title.trim()) {
            orderedBlocks.push({ type: 'text', value: text });
          }
          return;
        }

        if (cls.indexOf('se-horizontalLine') !== -1 || cls.indexOf('se-sticker') !== -1) return;
        var fallbackText = (comp.innerText || '').trim();
        if (fallbackText && fallbackText.length > 1 && fallbackText !== title.trim()) {
          orderedBlocks.push({ type: 'text', value: fallbackText });
        }
      });
    }

    // se-component 없는 구형 블로그 fallback
    if (orderedBlocks.length === 0) {
      // 모든 이미지 수집
      var allImgs = root.querySelectorAll('img');
      allImgs.forEach(function(img) {
        var bestSrc = getBestImgSrc(img);
        if (bestSrc && images.indexOf(bestSrc) === -1) images.push(bestSrc);
      });

      var children = root.children;
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        // 이미지
        var img = child.querySelector ? child.querySelector('img[src*="postfiles"], img[src*="phinf.pstatic"], img[src*="blogfiles"], img.se-image-resource, img[data-lazy-src], img[data-src]') : null;
        if (img) {
          var bestSrc = getBestImgSrc(img);
          if (bestSrc) {
            orderedBlocks.push({ type: 'image', value: bestSrc });
            if (images.indexOf(bestSrc) === -1) images.push(bestSrc);
            continue;
          }
        }
        // 영상
        var vid = child.querySelector ? child.querySelector('video, iframe[src*="tv.naver"], iframe[src*="youtube"], [data-vid], [data-video-url]') : null;
        if (vid) {
          var vUrl = '';
          if (vid.tagName === 'IFRAME') vUrl = vid.getAttribute('src') || '';
          else if (vid.getAttribute('data-video-url')) vUrl = vid.getAttribute('data-video-url');
          else if (vid.getAttribute('data-vid')) vUrl = vidToUrl(vid.getAttribute('data-vid'));
          else vUrl = vid.getAttribute('src') || '';
          if (vUrl) {
            orderedBlocks.push({ type: 'video', value: vUrl });
            if (videos.indexOf(vUrl) === -1) videos.push(vUrl);
            continue;
          }
        }
        // 텍스트
        var txt = (child.innerText || child.textContent || '').trim();
        if (txt && txt !== title.trim()) {
          orderedBlocks.push({ type: 'text', value: txt });
        }
      }
    }

    // ★ 콘텐츠가 실질적으로 없으면 조용히 리턴 (다음 폴링에서 재시도)
    if (!title && orderedBlocks.length === 0 && images.length === 0) return;

    // 해시태그
    var tags = [];
    var tagSels = ['.post_tag a','.tag_area a','.bnm_tag a','.blog_tag a','.se-tag a','.tag a','[class*="tag_item"] a','[class*="tag_list"] a','.tdtag a'];
    tagSels.forEach(function(sel) {
      doc.querySelectorAll(sel).forEach(function(el) {
        var t = (el.innerText || '').replace(/#/g, '').trim();
        if (t && tags.indexOf(t) === -1) tags.push(t);
      });
    });
    doc.querySelectorAll('a[href*="search.naver"], a[href*="naver.com/search"]').forEach(function(el) {
      if (el.closest && el.closest('.se-caption, .se-section-image, figcaption')) return;
      var t = (el.innerText || '').replace(/#/g, '').trim();
      if (t && tags.indexOf(t) === -1) tags.push(t);
    });

    // 중복 실행 방지 플래그
    window.__eOrthExtracted = true;

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'naverBlogData',
      title: title.trim(),
      html: content,
      images: images,
      videos: videos,
      orderedBlocks: orderedBlocks,
      tags: tags,
    }));
  } catch(e) {
    // 에러도 조용히 무시 (다음 폴링에서 재시도) — 치명적 에러만 보고
    if (e.message && e.message.indexOf('ReactNativeWebView') !== -1) {
      // WebView 브릿지 자체 에러면 보고
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'naverBlogError',
        error: e.message,
      }));
    }
  }
})();
true;
`;

// ─── 네이버 블로그 URL인지 확인 ───
export function isNaverBlogUrl(url: string): boolean {
  return /^https?:\/\/(m\.)?blog\.naver\.com\//i.test(url)
    || /^https?:\/\/in\.naver\.com\//i.test(url)
    || /^https?:\/\/naver\.me\//i.test(url);
}

// ─── 네이버 블로그 모바일 URL로 변환 (iframe 우회) ───
export function toMobileNaverUrl(url: string): string {
  // 이미 모바일이면 그대로
  if (url.includes('m.blog.naver.com')) return url;
  // PC → 모바일 변환
  return url.replace('blog.naver.com', 'm.blog.naver.com');
}

// ─── 헬퍼 함수들 ───
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'");
}

function makeInfoRow(label: string, value: string): string {
  return `<tr><td style="padding:8px 12px;background:#f7f7f7;font-weight:bold;width:80px;border:1px solid #e5e5e5;">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #e5e5e5;">${escapeHtml(value)}</td></tr>`;
}

function wrapSeText(inner: string, extraClass = ''): string {
  const cls = extraClass ? ` ${extraClass}` : '';
  return `<div class="se-component se-text se-l-default"><div class="se-section se-section-text"><div class="se-module se-module-text${cls}">${inner}</div></div></div>`;
}
