/**
 * 공개해도 되는 합성 데모 계정 — 고정 ID 목록 (카이 5808c65 검수 1, 테오 1791948086).
 * 예전에는 핸들 접두어(`sample_`·`demo_`·`syn_`)로 판정해, 같은 접두어의 실계정이 수집되면 공개될 수 있었다.
 * 이 목록은 collector/fixtures/*.json 의 계정과 같아야 한다(시험이 대조). 합성 계정을 더하면 여기에도 적는다.
 */
export const SYNTHETIC_ACCOUNT_IDS: readonly string[] = [
  "threads:demo_kko_x", "threads:demo_kko_y", "threads:demo_lead_a", "threads:demo_lead_b", "threads:demo_lead_c", "threads:demo_solo_z",
  "threads:sample_coin_lab_x", "threads:sample_daily_gain", "threads:sample_finance_talk", "threads:sample_moneytree_kr",
  "threads:sample_normal_user1", "threads:sample_normal_user2", "threads:sample_normal_user3", "threads:sample_recovery_pro", "threads:sample_vipstock77",
];
