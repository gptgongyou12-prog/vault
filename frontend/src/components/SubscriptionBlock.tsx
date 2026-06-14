"use client";

import { createPortal } from "react-dom";

interface SubscriptionBlockProps {
  message: string;
  isTrial?: boolean;
}

export function SubscriptionBlock({ message, isTrial }: SubscriptionBlockProps) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#111]/95 backdrop-blur-sm">
      <div className="max-w-sm w-full mx-4 text-center">
        {isTrial ? (
          <>
            <div className="mb-3 inline-flex items-center px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
              <span className="text-xs text-amber-400 font-mono">체험판</span>
            </div>
            <h2 className="text-2xl font-light text-white mb-3">
              체험판이 종료되었습니다
            </h2>
            <p className="text-sm text-white/50 leading-relaxed">
              {message || "체험 기간이 만료되었습니다. 관리자에게 문의해주세요."}
            </p>
          </>
        ) : (
          <>
            <div className="mb-3 inline-flex items-center px-3 py-1 rounded-full bg-red-500/15 border border-red-500/30">
              <span className="text-xs text-red-400 font-mono">액세스 제한</span>
            </div>
            <h2 className="text-2xl font-light text-white mb-3">
              접근이 제한되었습니다
            </h2>
            <p className="text-sm text-white/50 leading-relaxed">
              {message || "계정 접근이 제한되었습니다. 관리자에게 문의해주세요."}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
