import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import { parseMathText } from "@tnp/getgo-logics/quiz-builder";
import { calculateMathFitScale, normalizeInlineFractionStyle } from "./mathFit";
import { protectMarkdownMath, type ProtectedMarkdownMath } from "./markdownMath";

export type MathTextProps = {
  value: unknown;
  markdown?: boolean;
  nowrap?: boolean;
  autoSize?: boolean;
};

type MathPresentationProps = Pick<MathTextProps, "nowrap" | "autoSize">;

function MarkdownChildren({
  children,
  protectedMath,
  nowrap,
  autoSize,
}: { children: ReactNode; protectedMath: ProtectedMarkdownMath } & MathPresentationProps) {
  if (typeof children === "string") {
    const markerPattern = /(GETGOMATHPLACEHOLDER\d+TOKEN)/g;
    return <>{children.split(markerPattern).filter(Boolean).map((part, index) => {
      const formula = protectedMath.formulas.get(part);
      const value = formula ? `#math:${JSON.stringify(formula)}#` : part;
      return <MathText autoSize={autoSize} key={index} markdown={false} nowrap={nowrap} value={value} />;
    })}</>;
  }
  if (Array.isArray(children)) {
    return <>{children.map((child, index) =>
      <MarkdownChildren autoSize={autoSize} key={index} nowrap={nowrap} protectedMath={protectedMath}>{child}</MarkdownChildren>)}</>;
  }
  return children;
}

function MarkdownContent({ value, nowrap, autoSize }: { value: string } & MathPresentationProps) {
  const protectedMath = protectMarkdownMath(value);
  return <div className="getgo-markdown">
    <ReactMarkdown components={{
      p: ({ children, ...props }) => <p {...props}><MarkdownChildren autoSize={autoSize} nowrap={nowrap} protectedMath={protectedMath}>{children}</MarkdownChildren></p>,
      li: ({ children, ...props }) => <li {...props}><MarkdownChildren autoSize={autoSize} nowrap={nowrap} protectedMath={protectedMath}>{children}</MarkdownChildren></li>,
    }}>{protectedMath.markdown}</ReactMarkdown>
  </div>;
}

function DisplayMath({ html, style, nowrap = false, autoSize = false }: {
  html: string;
  style: CSSProperties;
} & MathPresentationProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    if (!autoSize) {
      if (typeof style.fontSize === "number") container.style.fontSize = `${style.fontSize}px`;
      else if (typeof style.fontSize === "string") container.style.fontSize = style.fontSize;
      else container.style.removeProperty("font-size");
      return;
    }
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
  }, [autoSize, html, style.fontSize]);

  return <span
    ref={ref}
    className={`getgo-math-block ${nowrap ? "getgo-math-nowrap" : "getgo-math-wrap"}`}
    dangerouslySetInnerHTML={{ __html: html }}
    style={style}
  />;
}

export function MathText({
  value,
  markdown = false,
  nowrap = false,
  autoSize = false,
}: MathTextProps) {
  const source = String(value ?? "");
  // Markdown must own the complete document. Splitting it around inline math
  // creates separate block containers and forces otherwise-inline formulas
  // onto new lines. MarkdownChildren delegates each text node back here with
  // markdown disabled, where raw/canonical math is rendered inline.
  if (markdown && !source.includes("#md:"))
    return <MarkdownContent autoSize={autoSize} nowrap={nowrap} value={source} />;
  return <>{parseMathText(value).map((segment, index) => {
    if (segment.type === "text") {
      if (markdown) return <MarkdownContent autoSize={autoSize} key={`markdown-text-${index}`} nowrap={nowrap} value={segment.value} />;
      return <span className="getgo-text-preserve-lines" key={`text-${index}`}>{segment.value}</span>;
    }
    if (segment.type === "markdown") {
      return <MarkdownContent autoSize={autoSize} key={`markdown-${index}`} nowrap={nowrap} value={segment.value.markdown} />;
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
      return <DisplayMath autoSize={autoSize} html={html} key={`${segment.value.latex}-${index}`} nowrap={nowrap} style={style} />;
    }
    return <span
      className={`getgo-math-inline ${nowrap ? "getgo-math-nowrap" : "getgo-math-wrap"}`}
      dangerouslySetInnerHTML={{ __html: html }}
      key={`${segment.value.latex}-${index}`}
      style={style}
    />;
  })}</>;
}
