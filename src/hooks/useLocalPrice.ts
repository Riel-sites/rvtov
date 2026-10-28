import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLocalCurrency } from "@/lib/currency.functions";

/** Formats USD prices in the visitor's local currency (USD shown alongside). */
export function useLocalPrice() {
  const fn = useServerFn(getLocalCurrency);
  const q = useQuery({ queryKey: ["local-currency"], queryFn: () => fn(), staleTime: 6 * 60 * 60 * 1000 });
  const currency = q.data?.currency ?? "USD";
  const rate = q.data?.rate ?? 1;
  const format = (usd: number) => {
    const usdText = `$${usd % 1 ? usd.toFixed(2) : usd}`;
    if (currency === "USD") return usdText;
    const local = new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(usd * rate);
    return `${local} (${usdText})`;
  };
  const local = (usd: number) =>
    currency === "USD" ? `$${usd.toFixed(2)}` : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(usd * rate);
  return { format, local, currency };
}
