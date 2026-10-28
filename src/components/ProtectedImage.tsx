import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getDownloadAccess } from "@/lib/payments.functions";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PayFlow } from "@/components/PricingPacks";

async function saveFile(src: string, filename: string) {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    window.open(src, "_blank");
  }
}

const btn =
  "absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-background/85 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur hover:bg-background";

/**
 * Admins: plain image + download. Paid shoppers / unlocked images: download.
 * Trial shoppers: guarded image + watermark; download opens a per-image payment.
 */
export function ProtectedImage({
  src,
  alt,
  className,
  filename = "try-on.png",
  sessionId,
}: {
  src: string;
  alt: string;
  className?: string;
  filename?: string;
  sessionId?: string | null;
}) {
  const { isAdmin, user } = useAuth();
  const accessFn = useServerFn(getDownloadAccess);
  const access = useQuery({
    queryKey: ["download-access"],
    queryFn: () => accessFn(),
    enabled: !!user && !isAdmin,
    refetchInterval: 30_000,
  });
  const [payOpen, setPayOpen] = useState(false);

  if (isAdmin) {
    return (
      <div className="relative h-full w-full">
        <img src={src} alt={alt} className={className} />
        <button type="button" onClick={() => saveFile(src, filename)} className={btn} aria-label="Download">
          <Download className="h-3.5 w-3.5" /> Download
        </button>
      </div>
    );
  }

  const canDownload = !!sessionId && (access.data?.paid || access.data?.unlocked.includes(sessionId));
  const pending = !!sessionId && access.data?.pending.includes(sessionId);
  const block = (e: React.SyntheticEvent) => e.preventDefault();

  return (
    <div
      className="relative h-full w-full select-none [-webkit-touch-callout:none]"
      onContextMenu={block}
      onDragStart={block}
    >
      <img src={src} alt={alt} draggable={false} className={`pointer-events-none select-none ${className ?? ""}`} />
      {!canDownload && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="-rotate-30 whitespace-nowrap text-2xl font-bold uppercase tracking-widest text-foreground/25">
            Virtual Try-On • Preview
          </span>
        </div>
      )}
      <div className="absolute inset-0" onContextMenu={block} />
      {sessionId && user && (
        <button
          type="button"
          aria-label="Download"
          className={btn}
          onClick={() => (canDownload ? saveFile(src, filename) : setPayOpen(true))}
        >
          {pending ? <Clock className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
          {pending ? "Pending" : null}
        </button>
      )}
      {sessionId && (
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <PayFlow
              pack={{ name: "Download", tokens: 0, price: 0.5 }}
              email={user?.email}
              sessionId={sessionId}
              onDone={() => void access.refetch()}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
