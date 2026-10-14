import { describe, it, expect } from "vitest";
import { scoreText, normalize, extractEntities, explainReasons, type Entity } from "./index";
import { EN_TERMS, EN_PATTERNS, EN_COUNTER_TERMS, EN_VETO_PATTERNS, EN_CTA_PATTERNS } from "./lexicon-en";

const codes = (t: string) => scoreText(t).reasons.map((r) => r.code);
const vals = (list: Entity[], type?: string) => list.filter((e) => !type || e.type === type).map((e) => e.value);

describe("English lures — HIGH", () => {
  it("free stock tips pulled to WhatsApp", () => {
    const r = scoreText("Free stock tips every morning 📈 Guaranteed returns of 30% weekly. Only 20 spots left — WhatsApp me +1 415 555 0132");
    expect(r.label).toBe("HIGH");
    expect(r.categories.contact).toBeGreaterThan(0);
  });
  it("Telegram crypto signals group + risk-free promise", () => {
    const r = scoreText("Join my VIP crypto signals group on Telegram t.me/btc_kings_vip — risk-free, 5% daily profit. Limited spots!");
    expect(r.label).toBe("HIGH");
  });
  it("broker impersonation: firm + credential + offer", () => {
    const r = scoreText("I'm a senior analyst at Goldman Sachs. I'll share my stock picks with a few people for free. DM me for details.");
    expect(r.label).toBe("HIGH");
    expect(codes("I'm a senior analyst at Goldman Sachs. I'll share my stock picks with a few people for free. DM me for details.")).toContain("impersonate:institution+credential");
  });
  it("fake proof of profit + recruiting members + link in bio", () => {
    const r = scoreText("Withdrawal proof from my members today 💰💰 We are accepting new members into our private trading group. Link in bio!");
    expect(r.label).toBe("HIGH");
  });
  it("DM-me profit brag (social post template)", () => {
    expect(scoreText("🚀 Just made $25K this month with this new blockchain strategy! DM me to learn how! 💰").label).toBe("HIGH");
  });
  it("homoglyph / spaced platform names are still caught", () => {
    expect(scoreText("Forex signals, guaranteed profits. Message me on W h a t s A p p").categories.contact).toBeGreaterThan(0);
    expect(scoreText("Теlеgrаm signals group, 10x your money").reasons.some((x) => x.code === "obfuscation")).toBe(true);
  });
});

describe("English benign — not HIGH", () => {
  it("ordinary investing chat is LOW", () => {
    expect(scoreText("Just bought some Apple stock for my retirement portfolio. Long term investing ftw.").label).toBe("LOW");
  });
  it("scam warning is not flagged as a lure", () => {
    const r = scoreText("Beware: scammers on WhatsApp are promising guaranteed returns and free stock tips. Report and block them.");
    expect(r.label).not.toBe("HIGH");
    expect(r.reasons.some((x) => x.code === "counter")).toBe(true);
  });
  it("news report about a bank is not HIGH", () => {
    expect(scoreText("Reuters: Goldman Sachs analysts expect the Fed to cut rates; stocks rallied 2% on Friday.").label).not.toBe("HIGH");
  });
  it("business email with a phone number is not HIGH", () => {
    expect(scoreText("Thanks for the update on the energy trading model. Please call me at (713) 555-0187 on Tuesday.").label).not.toBe("HIGH");
  });
  it("hobby community chat invite (no investment) is not HIGH", () => {
    expect(scoreText("Join our hiking community chat! Free weekend walks, everyone welcome.").label).not.toBe("HIGH");
  });
  it("word boundaries: admin/freedom/signal-of-intent do not fire contact or free", () => {
    const r = scoreText("The admin team discussed freedom of speech and a signal of intent.");
    expect(r.categories.contact).toBe(0);
    expect(r.categories.free).toBe(0);
  });
  it("risk disclaimer caps an otherwise promotional post", () => {
    const r = scoreText("Join our trading channel for forex signals. DM me. Capital at risk; past performance is not indicative of future results.");
    expect(r.label).not.toBe("HIGH");
  });
});

describe("normalize — English", () => {
  it("email '@' is not counted as leet obfuscation", () => {
    expect(normalize("write to john.smith@gmail.com").techniques).not.toContain("leet");
  });
  it("'@' inside a word is still folded (Wh@tsApp)", () => {
    expect(normalize("Wh@tsApp me").compact).toContain("whatsapp");
  });
});

describe("extractEntities — English channels", () => {
  it("wa.me link → whatsapp number", () => {
    expect(vals(extractEntities("Chat now: https://wa.me/15551234567"), "whatsapp")).toContain("+15551234567");
  });
  it("WhatsApp group invite", () => {
    expect(vals(extractEntities("join chat.whatsapp.com/AbCdEf1234567890"), "whatsapp")).toContain("chat.whatsapp.com/abcdef1234567890");
  });
  it("'WhatsApp: +44 …' → whatsapp and phone", () => {
    const e = extractEntities("WhatsApp: +44 7911 123456 for signals");
    expect(vals(e, "whatsapp")).toContain("+447911123456");
    expect(vals(e, "phone")).toContain("+447911123456");
  });
  it("Signal link and username", () => {
    expect(vals(extractEntities("signal.me/#p/abcDEF123"), "signal")).toContain("signal.me/p/abcdef123");
    expect(vals(extractEntities("Signal username: crypto_max.01"), "signal")).toContain("crypto_max.01");
  });
  it("English telegram handle", () => {
    expect(vals(extractEntities("Telegram: @fx_mentor_amy"), "telegram")).toContain("fx_mentor_amy");
  });
  it("email address, and its domain is not mistaken for a handle", () => {
    const e = extractEntities("Contact invest.desk@proton.me today");
    expect(vals(e, "email")).toContain("invest.desk@proton.me");
    expect(vals(e, "handle")).not.toContain("proton.me");
  });
  it("North American number", () => {
    expect(vals(extractEntities("Call (212) 555-0143 now"), "phone")).toContain("+12125550143");
  });
  it("Korean +82 number is not duplicated as an international number", () => {
    expect(vals(extractEntities("+82 10-1234-5678"), "phone")).toEqual(["01012345678"]);
  });
  it("generic URL is a weak url entity; messenger links are not repeated as url", () => {
    const e = extractEntities("Read https://example.com/report and join t.me/room_abc");
    expect(vals(e, "url")).toContain("example.com/report");
    expect(vals(e, "url").some((v) => v.startsWith("t.me"))).toBe(false);
  });
});

describe("rules stay out of user-visible strings", () => {
  const visible = [
    ...EN_TERMS.map((t) => t.label), ...EN_PATTERNS.map((p) => p.label), ...EN_COUNTER_TERMS.map((c) => c.label),
    ...EN_VETO_PATTERNS.map((v) => v.label), ...EN_CTA_PATTERNS.map((c) => c.label),
  ];
  it("no numbers or scoring words in English-lexicon labels", () => {
    for (const l of visible) {
      expect(l).not.toMatch(/\d/);
      expect(l).not.toMatch(/점수|상한|가중|임계|threshold|weight|score|cap|points?/i);
    }
  });
  it("explanations for an English HIGH post contain no threshold numbers", () => {
    const r = scoreText("Free stock tips, guaranteed returns. WhatsApp me +1 415 555 0132. Only 5 spots.");
    const text = explainReasons(r.reasons).map((x) => [x.label, x.what, x.why, x.example, x.benign].join(" ")).join(" ");
    for (const n of ["70", "69", "45", "40", "39"]) expect(text).not.toMatch(new RegExp(`(^|\\D)${n}(\\D|$)`));
  });
});
