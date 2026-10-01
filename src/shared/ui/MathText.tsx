import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import { parseMathText } from "@tnp/getgo-logics/quiz-builder";
import { calculateMathFitScale, normalizeInlineFractionStyle } from "./mathFit";
import { protectMarkdownMath } from "./markdownMath";

function MarkdownChildren({ children }: { children: ReactNode }) {
  if (typeof children === "string") return <MathText value={children} markdown={false} />;
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
    }}>{protectMarkdownMath(value)}</ReactMarkdown>
  </div>;
}

function DisplayMath({ html, style }: { html: string; style: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const baseFontSize = Number.parseFloat(getComputedStyle(container).fontSize);
    let lastAvailableWidth = -1;
    let cancelled = false;
    const fit = (force = false) => {
      const availableWidth = container.clientWidth;
      if (!force && availableWidth === lastAvailableWidth) return;
      lastAvailableWidth = availableWidth;
      container.style.fontSize = `${baseFontSize}px`;
      const formula = container.querySelector<HTMLElement>(".katex-display > .katex");
      if (!formula) return;
      const contentWidth = Math.max(formula.scrollWidth, formula.getBoundingClientRect().width);
      const scale = calculateMathFitScale(availableWidth, contentWidth);
      container.style.fontSize = `${baseFontSize * scale}px`;
    };
    fit(true);
    void document.fonts?.ready.then(() => {
      if (!cancelled) fit(true);
    });
    const observer = new ResizeObserver(() => fit());
    observer.observe(container.parentElement ?? container);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [html, style.fontSize]);

  return <span
    ref={ref}
    className="getgo-math-block"
    dangerouslySetInnerHTML={{ __html: html }}
    style={style}
  />;
}

export function MathText({ value, markdown = false }: { value: unknown; markdown?: boolean }) {
  const source = String(value ?? "");
  // Markdown must own the complete document. Splitting it around inline math
  // creates separate block containers and forces otherwise-inline formulas
  // onto new lines. MarkdownChildren delegates each text node back here with
  // markdown disabled, where raw/canonical math is rendered inline.
  if (markdown && !source.includes("#md:")) return <MarkdownContent value={source} />;
  return <>{parseMathText(value).map((segment, index) => {
    if (segment.type === "text") {
      if (markdown) return <MarkdownContent key={`markdown-text-${index}`} value={segment.value} />;
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
    const renderedLatex = normalizeInlineFractionStyle(segment.value.latex, segment.value.inline);
    const html = katex.renderToString(renderedLatex, {
      displayMode: !segment.value.inline,
      throwOnError: false,
      strict: "warn",
    });
    if (!segment.value.inline) {
      return <DisplayMath html={html} key={`${segment.value.latex}-${index}`} style={style} />;
    }
    return <span
      className="getgo-math-inline"
      dangerouslySetInnerHTML={{ __html: html }}
      key={`${segment.value.latex}-${index}`}
      style={style}
    />;
  })}</>;
}
