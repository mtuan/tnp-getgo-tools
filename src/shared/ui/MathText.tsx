import type { CSSProperties, ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import { parseMathText } from "@tnp/getgo-logics/quiz-builder";

function MarkdownChildren({ children }: { children: ReactNode }) {
  if (typeof children === "string") return <MathText value={children} />;
  if (Array.isArray(children)) {
    return <>{children.map((child, index) => <MarkdownChildren key={index}>{child}</MarkdownChildren>)}</>;
  }
  return children;
}

function MarkdownContent({ value }: { value: string }) {
  return <div className="getgo-markdown">
    <ReactMarkdown components={{
      p: ({ children, ...props }) => <p {...props}><MarkdownChildren>{children}</MarkdownChildren></p>,
      li: ({ children, ...props }) => <li {...props}><MarkdownChildren>{children}</MarkdownChildren></li>,
    }}>{value}</ReactMarkdown>
  </div>;
}

export function MathText({ value }: { value: unknown }) {
  return <>{parseMathText(value).map((segment, index) => {
    if (segment.type === "text") {
      return <span className="getgo-text-preserve-lines" key={`text-${index}`}>{segment.value}</span>;
    }
    if (segment.type === "markdown") {
      return <MarkdownContent key={`markdown-${index}`} value={segment.value.markdown} />;
    }
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
