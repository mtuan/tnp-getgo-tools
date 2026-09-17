import type { CSSProperties } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { parseMathText } from "@tnp/getgo-logics/quiz-builder";

export function MathText({ value }: { value: unknown }) {
  return <>{parseMathText(value).map((segment, index) => {
    if (segment.type === "text") return segment.value;
    const style: CSSProperties = {
      ...(segment.value.inline ? {} : { display: "block" }),
      ...(segment.value.fontSize ? { fontSize: segment.value.fontSize } : {}),
      ...(segment.value.color ? { color: segment.value.color } : {}),
    };
    return <span
      className={segment.value.inline ? "getgo-math-inline" : "getgo-math-block"}
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(segment.value.latex, {
          displayMode: !segment.value.inline,
          throwOnError: false,
          strict: "warn",
        }),
      }}
      key={`${segment.value.latex}-${index}`}
      style={style}
    />;
  })}</>;
}
