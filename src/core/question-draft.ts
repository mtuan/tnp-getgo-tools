export function isCurrentQuestionDraftChange(
  originQuestionNo: string,
  currentQuestionNo: unknown,
  nextQuestionNo: unknown,
): boolean {
  return String(currentQuestionNo) === originQuestionNo
    && String(nextQuestionNo) === originQuestionNo
}
