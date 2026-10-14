import { describe, expect, it, vi } from "vitest";
import { aiErrorSummary, logAiError } from "./llm";

/** AI 실패 로그는 오류 이름·HTTP 상태·원인 이름만 — 메시지·본문·글 내용 없음(테오 1791962254) */
describe("AI 오류 로그", () => {
  it("이름·상태·원인 이름만 남기고 메시지는 버린다", () => {
    const e = Object.assign(new Error("401 Unauthorized: prompt was 원금보장 010-1234-5678"), { name: "GatewayAuthenticationError", statusCode: 401, cause: { name: "APICallError", message: "secret body" } });
    expect(aiErrorSummary(e)).toEqual({ name: "GatewayAuthenticationError", status: 401, cause: "APICallError" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAiError("review", e);
    const line = spy.mock.calls.flat().join(" ");
    expect(line).toContain("GatewayAuthenticationError");
    expect(line).toContain("401");
    expect(line).not.toMatch(/원금보장|010-1234|Unauthorized: prompt|secret body/);
    spy.mockRestore();
  });
  it("이름·원인 이름에 섞인 내용은 버리고, 상태는 유효한 HTTP 코드만 (카이 e6a669c)", () => {
    const e = { name: "원금보장 010-1234-5678 prompt", statusCode: "401 body", status: 99999, cause: { name: "t.me/vip 010-9999-8888" } };
    expect(aiErrorSummary(e)).toEqual({ name: "UnknownError", cause: "UnknownError" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAiError("review", e);
    expect(spy.mock.calls.flat().join(" ")).not.toMatch(/원금보장|010|prompt|t\.me|body|99999/);
    spy.mockRestore();
    expect(aiErrorSummary({ name: "GatewayRateLimitError", statusCode: 429.5, status: 402 })).toEqual({ name: "GatewayRateLimitError", status: 402 });
    expect(aiErrorSummary({ name: "A".repeat(65) })).toEqual({ name: "UnknownError" });
  });
  it("알려진 클래스 이름만 — 짧은 영숫자 이름(번호·토큰)도 버린다, 속성 읽기 예외에도 안전 (카이 036424f)", () => {
    expect(aiErrorSummary({ name: "A110123456789", cause: { name: "PrivateTokenABC123" } })).toEqual({ name: "UnknownError", cause: "UnknownError" });
    expect(aiErrorSummary({ name: "AI_APICallError", statusCode: 401 })).toEqual({ name: "AI_APICallError", status: 401 });
    const evil = new Proxy({}, { get() { throw new Error("boom 010-1234-5678"); } });
    expect(aiErrorSummary(evil)).toEqual({ name: "UnknownError" });
    const throwingName = Object.defineProperty({}, "name", { get() { throw new Error("x"); } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => logAiError("review", throwingName)).not.toThrow();
    expect(() => logAiError("review", evil)).not.toThrow();
    expect(spy.mock.calls.flat().join(" ")).not.toMatch(/010|boom|PrivateToken|110123456789/);
    spy.mockRestore();
  });
  it("Error 가 아닌 값도 안전하게", () => {
    expect(aiErrorSummary("x")).toEqual({ name: "UnknownError" });
    expect(aiErrorSummary(null)).toEqual({ name: "UnknownError" });
  });
});
