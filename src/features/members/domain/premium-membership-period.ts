const dateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function defaultPremiumMembershipPeriod(today = new Date()): { startsAt: string; expiresAt: string } {
  const expiresAt = new Date(today);
  expiresAt.setDate(expiresAt.getDate() + 30);

  return {
    startsAt: dateInputValue(today),
    expiresAt: dateInputValue(expiresAt),
  };
}
