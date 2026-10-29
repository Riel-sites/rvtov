import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Copy, Mail, MessageCircle, CheckCircle2 } from "lucide-react";
import { submitPaymentRequest } from "@/lib/payments.functions";
import { useLocalPrice } from "@/hooks/useLocalPrice";

const CONTACT_EMAIL = "rielsites@gmail.com";
const MOMO_NUMBER = "0209765822";
const MOMO_NAME = "David A. Hammond";
const WHATSAPP_NUMBER = "233209765822";

export const TOKEN_PACKS = [
  { name: "Starter", tokens: 20, price: 5, note: "Try a few looks" },
  { name: "Popular", tokens: 50, price: 10, note: "Best value for shoppers", featured: true },
  { name: "Studio", tokens: 120, price: 20, note: "For brands & heavy users" },
] as const;
type Pack = { name: string; tokens: number; price: number };

function message(pack: Pack, email?: string | null, amount?: string) {
  const what = pack.name === "Download" ? "to download a try-on image" : `the ${pack.name} pack (${pack.tokens} tokens)`;
  return `Hi, I'd like ${what} for ${amount ?? `$${pack.price}`}. I'm paying by MoMo to ${MOMO_NUMBER}.\nMy account email: ${email ?? ""}`;
}
const mailLink = (pack: Pack, email?: string | null, amount?: string) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Payment: ${pack.name}`)}&body=${encodeURIComponent(message(pack, email, amount))}`;
const waLink = (pack: Pack, email?: string | null, amount?: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message(pack, email, amount))}`;

export function PricingPacks({
  email,
  compact,
  onPaymentSubmitted,
}: {
  email?: string | null | undefined;
  compact?: boolean;
  onPaymentSubmitted?: () => void;
}) {
  const [active, setActive] = useState<Pack | null>(null);
  const { local } = useLocalPrice();
  return (
    <div>
      <div className={`grid gap-4 ${compact ? "sm:grid-cols-3" : "md:grid-cols-3"}`}>
        {TOKEN_PACKS.map((pack) => (
          <Card
            key={pack.name}
            className={`relative bg-background ${"featured" in pack && pack.featured ? "border-primary shadow-lg" : "border-border"}`}
          >
            {"featured" in pack && pack.featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                Most popular
              </span>
            )}
            <CardContent className={compact ? "p-4" : "p-6"}>
              <p className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">{pack.name}</p>
              <p className="mt-2 font-display text-3xl font-bold text-foreground">{local(pack.price)}</p>
              <p className="text-xs text-muted-foreground">${pack.price} USD</p>
              <p className="mt-1 text-sm text-foreground">{pack.tokens} try-ons</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {local(pack.price / pack.tokens)} per try-on · {pack.note}
              </p>
              <Button
                className="mt-4 w-full"
                variant={"featured" in pack && pack.featured ? "default" : "outline"}
                onClick={() => setActive(pack)}
              >
                Get this pack
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <ul className="mt-6 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
        {["1 token = 1 finished try-on", "Failed try-ons never cost a token", "Tokens never expire"].map((t) => (
          <li key={t} className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" /> {t}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        Pay by mobile money to <span className="font-medium text-foreground">{MOMO_NUMBER}</span> ({MOMO_NAME}), use
        your account email as the reference, and your tokens are added once payment is confirmed.
      </p>
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {active && (
            <PayFlow
              pack={active}
              email={email}
              onDone={() => onPaymentSubmitted?.()}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium text-foreground break-all">{value}</p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Copy ${label}`}
        onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`))}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function PayFlow({
  pack,
  email,
  sessionId,
  onDone,
}: {
  pack: Pack;
  email?: string | null | undefined;
  sessionId?: string;
  onDone?: () => void;
}) {
  const submit = useServerFn(submitPaymentRequest);
  const { format } = useLocalPrice();
  const amount = format(pack.price);
  const isDownload = pack.name === "Download";
  const [phone, setPhone] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await submit({
        data: { pack: pack.name as "Starter", sessionId, localAmount: amount, senderPhone: phone, transactionRef: ref },
      });
      setDone(true);
      onDone?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg.includes("[") ? "Please check your phone number and transaction ID." : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isDownload ? `Download this image — ${amount}` : `${pack.name} pack — ${amount}`}
        </DialogTitle>
        <DialogDescription>
          {isDownload
            ? "Free-trial images need a one-time payment to download in full quality, without the watermark. Buying any token pack unlocks all downloads."
            : `${pack.tokens} try-ons.`}{" "}
          Pay by mobile money, then confirm below.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">1. Send {amount} by MoMo</p>
        <CopyRow label="MoMo number" value={MOMO_NUMBER} />
        <CopyRow label="Account name" value={MOMO_NAME} />
        {email && <CopyRow label="Reference" value={email} />}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">2. Confirm your payment</p>
        {done ? (
          <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
            {isDownload
              ? "Payment submitted! Your download unlocks as soon as we verify it."
              : "Payment submitted! Your tokens will be added once we verify it."}
          </div>
        ) : email ? (
          <form onSubmit={onSubmit} className="space-y-2">
            <Input placeholder="Phone number you paid from" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={20} />
            <Input placeholder="MoMo transaction ID" value={ref} onChange={(e) => setRef(e.target.value)} required maxLength={64} />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Submitting…" : "I've paid — submit"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link to="/auth" className="text-primary underline">Sign in</Link> to submit your payment in the app, or message us below.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline">
          <a href={waLink(pack, email, amount)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={mailLink(pack, email, amount)}>
            <Mail className="mr-1 h-4 w-4" /> Email
          </a>
        </Button>
      </div>
    </>
  );
}
