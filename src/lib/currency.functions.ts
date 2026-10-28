import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

const COUNTRY_CURRENCY: Record<string, string> = {
  GH: "GHS", NG: "NGN", KE: "KES", ZA: "ZAR", UG: "UGX", TZ: "TZS", RW: "RWF", CI: "XOF", SN: "XOF",
  BJ: "XOF", TG: "XOF", BF: "XOF", ML: "XOF", CM: "XAF", EG: "EGP", MA: "MAD", GB: "GBP", US: "USD",
  CA: "CAD", AU: "AUD", NZ: "NZD", IN: "INR", JP: "JPY", CN: "CNY", BR: "BRL", MX: "MXN", CH: "CHF",
  SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", AE: "AED", SA: "SAR",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", PT: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
};

/** Detects the visitor's currency from their location and returns the USD exchange rate. */
export const getLocalCurrency = createServerFn({ method: "GET" }).handler(async () => {
  let country = (getRequestHeader("cf-ipcountry") ?? "").toUpperCase();
  if (!country || country === "XX") {
    const lang = getRequestHeader("accept-language") ?? "";
    country = lang.match(/^[a-z]{2}-([A-Z]{2})/)?.[1] ?? "";
  }
  const currency = COUNTRY_CURRENCY[country] ?? "USD";
  if (currency === "USD") return { currency, rate: 1 };
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.[currency];
    if (rate) return { currency, rate };
  } catch (e) {
    console.error("rate fetch failed", e);
  }
  return { currency: "USD", rate: 1 };
});
