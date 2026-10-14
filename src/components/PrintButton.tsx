"use client";

/** 인쇄/PDF — `javascript:` 링크는 React 가 막으므로 버튼으로 연다 (브라우저 인쇄 대화상자에서 PDF 로 저장) */
export function PrintButton({ className, label = "인쇄/PDF" }: { className?: string; label?: string }) {
  return <button type="button" className={className} onClick={() => window.print()}>{label}</button>;
}
