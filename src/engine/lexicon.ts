/**
 * 리딩방 유인 어휘 사전. 모든 항목은 normalize().compact 기준(소문자·구분자 제거)으로 매칭된다.
 * category 별 가중치는 score.ts 에서 결정. 여기서는 어휘와 사람이 읽을 라벨만.
 */
export type Category = "contact" | "invest" | "profit" | "urgency" | "link" | "free";

export interface Term {
  term: string;
  cat: Category;
  label: string;
  /** 초성 매칭 허용 여부 (짧은 어휘는 오탐이 커서 끔) */
  chosung?: boolean;
  /** 개별 가중치 조정 (기본 1.0) */
  w?: number;
}

export const TERMS: Term[] = [
  // ── 연락 채널 유도 ──
  { term: "텔레그램", cat: "contact", label: "텔레그램 유도", chosung: true },
  { term: "텔레", cat: "contact", label: "텔레그램 유도", w: 0.8 },
  { term: "텔레방", cat: "contact", label: "텔레그램 방 유도" },
  { term: "텔방", cat: "contact", label: "텔레그램 방 유도", w: 0.8 },
  { term: "텔그", cat: "contact", label: "텔레그램 유도", w: 0.8 },
  { term: "텔래", cat: "contact", label: "텔레그램 유도(오타형)", w: 0.8 },
  { term: "telegram", cat: "contact", label: "텔레그램 유도" },
  { term: "t.me/", cat: "contact", label: "텔레그램 링크" },
  { term: "tme/", cat: "contact", label: "텔레그램 링크" },
  { term: "오픈채팅", cat: "contact", label: "카카오 오픈채팅 유도", chosung: true },
  { term: "오픈톡", cat: "contact", label: "카카오 오픈채팅 유도" },
  { term: "옾챗", cat: "contact", label: "오픈채팅 은어" },
  { term: "옵챗", cat: "contact", label: "오픈채팅 은어" },
  { term: "카톡", cat: "contact", label: "카카오톡 유도", w: 0.7 },
  { term: "카카오톡", cat: "contact", label: "카카오톡 유도", w: 0.7 },
  { term: "open.kakao.com", cat: "contact", label: "오픈채팅 링크" },
  { term: "openkakaocom", cat: "contact", label: "오픈채팅 링크" },
  { term: "라인친추", cat: "contact", label: "라인 유도" },
  { term: "위챗", cat: "contact", label: "위챗 유도" },
  { term: "디엠", cat: "contact", label: "DM 유도", w: 0.6 },
  { term: "dm주세요", cat: "contact", label: "DM 유도" },
  { term: "dm문의", cat: "contact", label: "DM 유도" },
  { term: "쪽지", cat: "contact", label: "쪽지 유도", w: 0.5 },
  { term: "프로필링크", cat: "contact", label: "프로필 링크 유도" },
  { term: "프사링크", cat: "contact", label: "프로필 링크 유도" },
  { term: "프로필참고", cat: "contact", label: "프로필 링크 유도" },
  { term: "프로필확인", cat: "contact", label: "프로필 링크 유도" },
  { term: "링크참고", cat: "contact", label: "링크 유도", w: 0.6 },
  { term: "아이디", cat: "contact", label: "메신저 아이디 안내", w: 0.4 },
  // 방·채널 은어 (플랫폼명을 안 쓰고 "방" 으로만 부르는 형)
  { term: "톡방", cat: "contact", label: "톡방 유도", w: 0.9 },
  { term: "단톡", cat: "contact", label: "단톡방 유도", w: 0.8 },
  { term: "챗방", cat: "contact", label: "채팅방 유도", w: 0.8 },
  { term: "오픈카톡", cat: "contact", label: "오픈채팅 유도" },
  { term: "카카오채널", cat: "contact", label: "카카오 채널 유도", w: 0.9 },
  { term: "카톡채널", cat: "contact", label: "카카오 채널 유도", w: 0.9 },
  { term: "채널추가", cat: "contact", label: "채널 추가 유도", w: 0.8 },
  { term: "친구추가", cat: "contact", label: "친구추가 유도", w: 0.7 },
  { term: "친추", cat: "contact", label: "친구추가 유도", w: 0.6 },
  { term: "프사", cat: "contact", label: "프로필 링크 유도", w: 0.6 },
  { term: "링크는프로필", cat: "contact", label: "프로필 링크 유도" },
  { term: "프로필링크", cat: "contact", label: "프로필 링크 유도" },
  { term: "프로필에", cat: "contact", label: "프로필 안내", w: 0.5 },
  { term: "카톡아이디", cat: "contact", label: "카톡 아이디 안내" },
  { term: "텔레아이디", cat: "contact", label: "텔레그램 아이디 안내" },
  { term: "라인아이디", cat: "contact", label: "라인 아이디 안내" },
  { term: "디엠주세요", cat: "contact", label: "DM 유도", w: 0.9 },
  { term: "디엠으로", cat: "contact", label: "DM 유도", w: 0.8 },
  { term: "1대1", cat: "contact", label: "1:1 개별 접촉 유도", w: 0.7 },
  // "1:1" 은 compact 에서 구분자 ':' 가 지워져 "11" 이 되므로 그 형태로 넣는다
  { term: "11상담", cat: "contact", label: "1:1 상담 유도", w: 0.7 },
  { term: "11리딩", cat: "contact", label: "1:1 리딩 유도" },

  // ── 투자·리딩 ──
  { term: "리딩방", cat: "invest", label: "리딩방", chosung: true },
  { term: "리딩", cat: "invest", label: "리딩(종목 지시)", w: 0.8 },
  { term: "주식방", cat: "invest", label: "주식방" },
  { term: "코인방", cat: "invest", label: "코인방" },
  { term: "종목추천", cat: "invest", label: "종목 추천", chosung: true },
  { term: "추천종목", cat: "invest", label: "종목 추천" },
  { term: "급등주", cat: "invest", label: "급등주" },
  { term: "상한가", cat: "invest", label: "상한가 언급", w: 0.7 },
  { term: "선취매", cat: "invest", label: "선취매" },
  { term: "vip방", cat: "invest", label: "VIP방" },
  { term: "vip", cat: "invest", label: "VIP", w: 0.5 },
  { term: "무료방", cat: "invest", label: "무료방" },
  { term: "공개방", cat: "invest", label: "공개방", w: 0.6 },
  { term: "비공개방", cat: "invest", label: "비공개방" },
  { term: "단타", cat: "invest", label: "단타", w: 0.6 },
  { term: "해외선물", cat: "invest", label: "해외선물" },
  { term: "선물옵션", cat: "invest", label: "선물옵션" },
  { term: "비트코인", cat: "invest", label: "코인", w: 0.5 },
  { term: "코인", cat: "invest", label: "코인", w: 0.4 },
  { term: "에어드랍", cat: "invest", label: "에어드랍" },
  { term: "전문가", cat: "invest", label: "전문가 자칭", w: 0.4 },
  { term: "애널리스트", cat: "invest", label: "애널리스트 자칭", w: 0.5 },
  { term: "매매기법", cat: "invest", label: "매매기법" },
  { term: "종목", cat: "invest", label: "종목", w: 0.4 },
  { term: "투자", cat: "invest", label: "투자", w: 0.3 },
  { term: "재테크", cat: "invest", label: "재테크", w: 0.4 },
  // 운영 형태 — "방" 을 유료로 굴리는 구조 자체를 드러내는 어휘
  { term: "유료방", cat: "invest", label: "유료방 전환", w: 1.2 },
  { term: "회원모집", cat: "invest", label: "회원 모집" },
  { term: "신규회원", cat: "invest", label: "신규 회원 모집", w: 0.8 },
  { term: "정회원", cat: "invest", label: "정회원 모집", w: 0.8 },
  { term: "회비", cat: "invest", label: "회비 언급", w: 0.7 },
  { term: "입장료", cat: "invest", label: "입장료" },
  { term: "무료체험권", cat: "invest", label: "무료 체험권" },
  // 시그널·자동매매·대여계좌 등 불법 영업 형태
  { term: "시그널", cat: "invest", label: "매매 시그널 제공", w: 0.8 },
  { term: "진입신호", cat: "invest", label: "진입 신호 제공" },
  { term: "매수타점", cat: "invest", label: "매수 타점 제공" },
  { term: "타점", cat: "invest", label: "타점 제공", w: 0.6 },
  { term: "매수신호", cat: "invest", label: "매수 신호 제공" },
  { term: "매도신호", cat: "invest", label: "매도 신호 제공" },
  { term: "실시간공유", cat: "invest", label: "실시간 종목 공유", w: 0.9 },
  { term: "종목공유", cat: "invest", label: "종목 공유", w: 0.9 },
  { term: "종목드립", cat: "invest", label: "종목 배포", w: 1.0 },
  { term: "종목받", cat: "invest", label: "종목 수령 언급", w: 0.7 },
  { term: "대여계좌", cat: "invest", label: "대여계좌(불법)", w: 1.4 },
  { term: "자동매매", cat: "invest", label: "자동매매 프로그램", w: 0.9 },
  { term: "스캘핑", cat: "invest", label: "스캘핑", w: 0.6 },
  { term: "fx마진", cat: "invest", label: "FX마진" },
  { term: "펌핑", cat: "invest", label: "펌핑 정보", w: 0.9 },
  { term: "세력", cat: "invest", label: "세력 언급", w: 0.5 },
  { term: "스테이킹", cat: "invest", label: "스테이킹", w: 0.6 },
  { term: "민팅", cat: "invest", label: "NFT 민팅", w: 0.6 },
  { term: "화이트리스트", cat: "invest", label: "화이트리스트", w: 0.5 },
  { term: "부업", cat: "invest", label: "부업 위장", w: 0.8 },
  { term: "재택", cat: "invest", label: "재택 수익 위장", w: 0.6 },
  { term: "기법", cat: "invest", label: "기법 전수", w: 0.5 },
  { term: "적중", cat: "invest", label: "적중 주장", w: 0.8 },
  { term: "기관수급", cat: "invest", label: "기관 수급 정보 주장" },
  { term: "기관물량", cat: "invest", label: "기관 물량 정보 주장" },

  // ── 수익 보장·인증 ──
  { term: "수익인증", cat: "profit", label: "수익 인증", chosung: true },
  { term: "수익률", cat: "profit", label: "수익률 제시", w: 0.6 },
  { term: "원금보장", cat: "profit", label: "원금 보장(불법)", w: 1.5 },
  { term: "손실보전", cat: "profit", label: "손실 보전(불법)", w: 1.5 },
  { term: "확정수익", cat: "profit", label: "확정 수익", w: 1.3 },
  { term: "보장", cat: "profit", label: "보장", w: 0.5 },
  { term: "월수익", cat: "profit", label: "월 수익 제시" },
  { term: "일수익", cat: "profit", label: "일 수익 제시" },
  { term: "수익내드", cat: "profit", label: "수익 내드립니다" },
  { term: "수익나", cat: "profit", label: "수익 언급", w: 0.4 },
  { term: "벌었", cat: "profit", label: "수익 자랑", w: 0.5 },
  { term: "따라만", cat: "profit", label: "따라만 하면", w: 0.8 },
  { term: "복구", cat: "profit", label: "손실 복구 유도", w: 0.7 },
  { term: "물린", cat: "profit", label: "물린 종목 복구 유도", w: 0.5 },
  { term: "고수익", cat: "profit", label: "고수익 제시" },
  { term: "확정지급", cat: "profit", label: "확정 지급", w: 1.3 },
  { term: "확정", cat: "profit", label: "확정 수익 암시", w: 0.6 },
  { term: "책임집니다", cat: "profit", label: "손실 책임 약속(불법)", w: 1.2 },
  { term: "책임지겠", cat: "profit", label: "손실 책임 약속(불법)", w: 1.2 },
  { term: "메꿔드", cat: "profit", label: "손실 보전 약속(불법)", w: 1.3 },
  { term: "메꿔", cat: "profit", label: "손실 보전 약속(불법)", w: 0.9 },
  { term: "회복시켜", cat: "profit", label: "원금 회복 약속", w: 1.0 },
  { term: "계좌인증", cat: "profit", label: "계좌 인증 주장" },
  { term: "수익공유", cat: "profit", label: "수익 공유", w: 0.7 },
  { term: "수익나면", cat: "profit", label: "성과보수형 제안", w: 0.8 },

  // ── 긴급·희소 ──
  { term: "선착순", cat: "urgency", label: "선착순" },
  { term: "마감임박", cat: "urgency", label: "마감 임박" },
  { term: "오늘만", cat: "urgency", label: "오늘만" },
  { term: "한정", cat: "urgency", label: "한정", w: 0.5 },
  { term: "입장", cat: "urgency", label: "방 입장 유도", w: 0.6 },
  { term: "지금바로", cat: "urgency", label: "지금 바로" },
  { term: "놓치지", cat: "urgency", label: "놓치지 마세요", w: 0.7 },
  { term: "마지막기회", cat: "urgency", label: "마지막 기회" },
  { term: "자리남", cat: "urgency", label: "자리 남음(희소성)", w: 0.8 },
  { term: "자리정리", cat: "urgency", label: "인원 정리(희소성)" },
  { term: "인원정리", cat: "urgency", label: "인원 정리(희소성)" },
  { term: "오늘까지", cat: "urgency", label: "오늘까지", w: 0.8 },
  { term: "오늘밤", cat: "urgency", label: "시간 압박", w: 0.6 },
  { term: "소수정예", cat: "urgency", label: "소수 정예" },
  { term: "명만", cat: "urgency", label: "정원 제한", w: 0.6 },

  // ── 무료 미끼 ──
  { term: "무료", cat: "free", label: "무료 미끼", w: 0.6 },
  { term: "무료체험", cat: "free", label: "무료 체험" },
  { term: "무료로", cat: "free", label: "무료 제공" },
  { term: "공짜", cat: "free", label: "공짜" },
  { term: "무료입장", cat: "free", label: "무료 입장" },
  { term: "무료공개", cat: "free", label: "무료 공개" },
  { term: "무료공유", cat: "free", label: "무료 공유" },
  { term: "무료배포", cat: "free", label: "무료 배포", w: 0.8 },

  // ── 단축 링크 ──
  { term: "bit.ly", cat: "link", label: "단축 링크" },
  { term: "bitly", cat: "link", label: "단축 링크" },
  { term: "han.gl", cat: "link", label: "단축 링크" },
  { term: "hangl", cat: "link", label: "단축 링크" },
  { term: "url.kr", cat: "link", label: "단축 링크" },
  { term: "urlkr", cat: "link", label: "단축 링크" },
  { term: "vo.la", cat: "link", label: "단축 링크" },
  { term: "me2.do", cat: "link", label: "단축 링크" },
  { term: "linktr.ee", cat: "link", label: "링크트리" },
  { term: "linktree", cat: "link", label: "링크트리" },
  { term: "litt.ly", cat: "link", label: "링크 모음" },
];

/**
 * 피해자·경고 맥락 — 유인글이 아니라 유인글을 *경고*하는 글. 감점.
 * `strong` 은 "이 글을 쓴 사람이 유인 당사자일 리 없다" 에 가까운 어휘다.
 */
export const COUNTER_TERMS: { term: string; label: string; w: number; strong?: boolean }[] = [
  { term: "사기당", label: "피해 경험 서술", w: 1.2, strong: true },
  { term: "사기였", label: "피해 경험 서술", w: 1.2, strong: true },
  { term: "사기입니다", label: "사기 단정", w: 1.2, strong: true },
  { term: "사기예요", label: "사기 단정", w: 1.2, strong: true },
  { term: "사기수법", label: "수법 해설", w: 1.2, strong: true },
  { term: "당했", label: "피해 경험 서술", w: 1.0, strong: true },
  { term: "당할뻔", label: "피해 미수 서술", w: 1.2, strong: true },
  { term: "조심하세요", label: "경고 문구", w: 1.2, strong: true },
  { term: "조심하", label: "경고 문구", w: 0.6 },
  { term: "주의하세요", label: "경고 문구", w: 1.2, strong: true },
  { term: "주의하시", label: "경고 문구", w: 1.0, strong: true },
  { term: "의심", label: "의심 권유", w: 0.6 },
  { term: "차단하세요", label: "차단 권유", w: 1.2, strong: true },
  { term: "들어가지마", label: "경고 문구", w: 1.2, strong: true },
  { term: "절대들어가", label: "경고 문구", w: 1.2, strong: true },
  { term: "누르지마", label: "경고 문구", w: 1.2, strong: true },
  { term: "피해", label: "피해 언급", w: 0.7 },
  { term: "피해자", label: "피해자 언급", w: 1.0, strong: true },
  { term: "피해액", label: "피해 규모 언급", w: 1.0, strong: true },
  { term: "신고했", label: "신고 경험", w: 1.2, strong: true },
  { term: "신고하", label: "신고 권유", w: 0.7 },
  { term: "신고버튼", label: "신고 권유", w: 1.2, strong: true },
  { term: "신고부탁", label: "신고 권유", w: 1.2, strong: true },
  { term: "날렸", label: "손실 경험 서술", w: 0.8 },
  { term: "후기", label: "후기", w: 0.35 },
  { term: "속지마", label: "경고 문구", w: 1.2, strong: true },
  { term: "속으면", label: "경고 문구", w: 1.0, strong: true },
  { term: "사기꾼", label: "사기 지칭", w: 1.0, strong: true },
  { term: "불법입니다", label: "불법 단정", w: 1.2, strong: true },
  { term: "위반", label: "법 위반 지적", w: 0.8 },
  { term: "자본시장법", label: "법령 인용", w: 1.0, strong: true },
  { term: "단속", label: "단속 언급", w: 0.8 },
  { term: "구속", label: "수사 결과 언급", w: 1.0, strong: true },
  { term: "적발", label: "적발 언급", w: 1.0, strong: true },
  { term: "잠입", label: "잠입 기록", w: 1.0, strong: true },
  { term: "출금이막", label: "출금 차단 피해", w: 1.2, strong: true },
  { term: "변호사", label: "법률 대응 언급", w: 0.8 },
  { term: "집단소송", label: "법률 대응 언급", w: 1.0, strong: true },
  { term: "예방", label: "예방 캠페인", w: 0.8 },
  { term: "구분법", label: "식별법 안내", w: 1.0, strong: true },
  { term: "체크리스트", label: "식별법 안내", w: 0.8 },
];

/**
 * 맥락 상한(veto) — 매칭되면 점수를 cap 이하로 **눌러버린다**.
 * HIGH 는 신고서에 실리므로, "합법 광고·기사·공공 캠페인·풍자" 로 보이는 신호가 하나라도
 * 있으면 자동 HIGH 를 포기하고 사람/LLM 에게 넘기는 쪽이 항상 싸다.
 */
export const VETO_PATTERNS: { re: RegExp; label: string; cap: number }[] = [
  {
    // 금융투자업/유사투자자문업 등록·신고번호 명시 (제2019-0000호 / 신고번호 2021-0000)
    re: /((등록|신고|인가)\s*번호)|제\s?\d{4}\s?[-‑]\s?\d{3,5}\s?호/,
    label: "등록·신고번호 명시 (합법 등록업체 가능성)",
    cap: 39,
  },
  {
    // 자본시장법상 의무 고지문 — 유인글은 이 문구를 쓰지 않는다
    re: /(원금\s*손실\s*(가능|위험))|(투자\s*판단.{0,12}(책임|본인))|(투자\s*(권유|자문)(가|이)?\s*아니)|(참고용입니다)|(보장하지\s*않습니다)|(권유하지\s*않습니다)/,
    label: "법정 투자 고지문 (합법 광고 형식)",
    cap: 45,
  },
  {
    // 기사·보도자료·공시 인용
    re: /(보도자료)|(기사)|(\[속보\])|(헤드라인)|(공시)|(출처\s*[:：])|(뉴스레터)|(스크랩)/,
    label: "기사·보도자료 인용 (뉴스 공유 가능성)",
    cap: 45,
  },
  {
    // 유인 성격을 *부인·해명* 하는 글 ("제 프로필 링크는 블로그입니다, 리딩방 아니에요")
    re: /(리딩방|사기|광고|홍보|영업)[^가-힣]{0,3}(이|가)?\s*아니(에요|라|고|야|었|ㅂ니다|입니다|ㅁ)?/,
    label: "유인 성격 부인·해명 맥락",
    cap: 69,
  },
  {
    // 공공기관 캠페인·신고 창구 안내
    re: /(1332)|(ecrm)|(사이버수사대)|(사이버범죄\s*신고)|(소비자\s*경보)|(금융투자협회)|(금융위원회)|(경찰청)/i,
    label: "공공기관 캠페인·신고 창구 안내",
    cap: 39,
  },
];

/** 유인 문구를 *인용*하는 글(풍자·해설·연구)은 유인글이 아니다 */
export const QUOTED_LURE = /['"“”‘’「『][^'"“”‘’「』」]{3,60}['"“”‘’」』]/;

/**
 * 행동 유도(CTA) — "무엇을 하라" 가 있어야 유인이다.
 * 연락채널 신호와 결합했을 때만 가점한다(단독으로는 일상 표현).
 */
export const CTA_PATTERNS: { re: RegExp; label: string; w: number }[] = [
  { re: /(들어오|입장하|입장은|오세요|오시면|방문하)/, label: "입장 유도", w: 1 },
  { re: /(문의\s*(는|주|해)|상담\s*(은|받|신청))/, label: "문의 유도", w: 1 },
  { re: /(신청\s*(은|하|받))|(모십니다)|(모집합니다)/, label: "신청·모집 유도", w: 1 },
  { re: /(드립니다|드려요|드릴게요|보내드립니다|공유드립니다|알려드립니다)/, label: "제공 약속", w: 0.8 },
  { re: /(주세요|남겨주시면|남기시면|보내주시면|해주시면)/, label: "회신 요구", w: 0.8 },
  { re: /(확인해\s*주?세요|참고해\s*주?세요|클릭|타고\s*들어)/, label: "링크 클릭 유도", w: 0.9 },
  { re: /(팔로우|좋아요|구독).{0,12}(하시면|하면|해주시면|누르시면|남기신)/, label: "팔로우·좋아요 조건부 제공", w: 1.2 },
];

/** 정규식 기반 구조 신호 */
export const PATTERNS: { re: RegExp; cat: Category; label: string; w?: number }[] = [
  { re: /\d{2,4}\s*%/, cat: "profit", label: "퍼센트 수익률 제시" },
  { re: /\d+\s*(배|倍)/, cat: "profit", label: "N배 수익 제시" },
  { re: /\d+\s*(만원|만|천만|억)/, cat: "profit", label: "금액 제시", w: 0.6 },
  { re: /@[a-z0-9_.]{4,}/, cat: "contact", label: "메신저 핸들(@)", w: 0.8 },
  { re: /https?:\/\/|www\./, cat: "link", label: "외부 링크", w: 0.5 },
  { re: /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/, cat: "contact", label: "휴대폰 번호" },
  { re: /[\u{1F4B0}\u{1F4B5}\u{1F4B8}\u{1F4C8}\u{1F680}\u{1F525}\u{1F4AF}]{2,}/u, cat: "urgency", label: "수익 이모지 반복", w: 0.5 },
];
