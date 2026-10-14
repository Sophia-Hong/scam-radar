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
  it("Error 가 아닌 값도 안전하게", () => {
    expect(aiErrorSummary("x")).toEqual({ name: "string" });
    expect(aiErrorSummary(null)).toEqual({ name: "object" });
  });
});
