import { describe, expect, it } from "vitest";
import { partition } from "./ingest-outcome";

describe("수집 응답 나누기 (카이 a40a047)", () => {
  it("거부·오류·응답 누락은 rejected, 나머지 accepted", () => {
    const r = partition(["a", "b", "c", "d", "e", "f", "g"], [
      { status: "accepted" }, { status: "rejected", error: "reserved synthetic account id" }, { error: { formErrors: [] } },
      {}, { status: "weird" as never }, { status: "accepted", error: "x" },
    ]);
    expect(r.accepted).toEqual(["a"]);
    expect(r.rejected.map((x) => x.item)).toEqual(["b", "c", "d", "e", "f", "g"]);   // {}·모르는 status·accepted+error·응답 누락 모두 거부
  });
});
