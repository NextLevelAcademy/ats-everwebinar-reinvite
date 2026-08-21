import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  Download,
  Loader2,
  Send,
  CheckCircle2,
} from "lucide-react";
import { downloadWatiCsv, type BroadcastBuild } from "@/lib/watiBroadcast";
import { sendBroadcastViaWorker } from "@/lib/watiWorker";

export function BroadcastPanel({ build }: { build: BroadcastBuild }) {
  const { toast } = useToast();
  const [broadcastName, setBroadcastName] = useState(
    `${build.definition.defaultBroadcastName}_${dateSuffix()}`
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<
    | {
        ok: boolean;
        sentCount: number;
        failedCount: number;
        total: number;
        broadcastName: string;
        failures?: { whatsappNumber: string; name: string; error?: string }[];
      }
    | { error: string }
    | null
  >(null);

  const empty = build.contacts.length === 0;

  // Banner path is shown as an informational preview only (see note below) —
  // it is NOT sent to the Worker. The confirmed Worker contract is exactly
  // { templateName, broadcastName, contacts }; there's no mediaUrl field,
  // consistent with the earlier note that WATI templates in use have a
  // static header image baked in at approval time rather than a swappable one.
  const bannerPath = build.definition.bannerPath;

  async function doSend() {
    setSending(true);
    setSendResult(null);
    try {
      const data = await sendBroadcastViaWorker({
        templateName: build.definition.templateName,
        broadcastName,
        contacts: build.contacts,
      });
      // The endpoint returns 200 with detailed success/failure breakdown
      setSendResult({
        ok: data.ok,
        sentCount: data.sentCount,
        failedCount: data.failedCount,
        total: data.total,
        broadcastName: data.broadcastName,
        failures: data.failures,
      });
      setConfirmOpen(false);
      if (data.failedCount === 0) {
        toast({
          title: "Broadcast sent",
          description: `${data.sentCount} contacts sent via WATI`,
        });
      } else if (data.sentCount === 0) {
        toast({
          title: "Broadcast failed",
          description: `0 of ${data.total} sent. See failure details below.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Partial send",
          description: `${data.sentCount} sent · ${data.failedCount} failed of ${data.total}`,
        });
      }
    } catch (err: any) {
      setSendResult({ error: err?.message ?? "Network error" });
      toast({
        title: "Send failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Definition strip */}
      <div className="flex items-start justify-between gap-4 flex-wrap p-4 rounded-md bg-accent/50 border border-border">
        <div className="space-y-1">
          <div className="text-sm">
            <span className="text-muted-foreground">Template:</span>{" "}
            <code
              className="text-xs bg-background px-1.5 py-0.5 rounded border border-border"
              data-testid="text-template-name"
            >
              {build.definition.templateName}
            </code>
          </div>
          <div className="text-xs text-muted-foreground max-w-md">
            {build.definition.description}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Recipients</div>
          <div className="text-xl font-semibold" data-testid="text-recipient-count">
            {build.contacts.length}
          </div>
        </div>
      </div>

      {/* Banner preview — shown when a banner is attached to the template */}
      {bannerPath && (
        <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <img
            src={bannerPath}
            alt={build.definition.bannerLabel || "Broadcast banner"}
            className="w-32 h-16 object-cover rounded border border-border shrink-0"
            data-testid={`img-banner-${build.type}`}
          />
          <div className="text-xs space-y-0.5">
            <div className="font-medium text-amber-900 dark:text-amber-200">
              Intended header image
            </div>
            <div className="text-amber-800 dark:text-amber-300">
              {build.definition.bannerLabel}
            </div>
            <div className="text-amber-700/80 dark:text-amber-400/80">
              Note: the WATI template currently has a STATIC header image baked in at
              approval time. To use this banner, the template must be re-approved by
              Meta with a media-variable header. Until then, the existing template
              image is sent.
            </div>
          </div>
        </div>
      )}

      {/* Broadcast name */}
      <div className="space-y-1.5">
        <Label htmlFor={`bcname-${build.type}`}>Broadcast name (visible in WATI)</Label>
        <Input
          id={`bcname-${build.type}`}
          value={broadcastName}
          onChange={(e) => setBroadcastName(e.target.value)}
          data-testid={`input-broadcast-name-${build.type}`}
        />
      </div>

      {/* Excluded warning */}
      {build.excluded.length > 0 && (
        <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-medium text-destructive">
              {build.excluded.length} contact
              {build.excluded.length === 1 ? "" : "s"} excluded
            </div>
            <div className="text-muted-foreground mt-0.5">
              {build.excluded.slice(0, 3).map((e, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {e.name || e.email} ({e.reason})
                </span>
              ))}
              {build.excluded.length > 3 &&
                ` · +${build.excluded.length - 3} more`}
            </div>
          </div>
        </div>
      )}

      {/* Recipient preview table */}
      {!empty && (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Country Code</th>
                  <th className="text-left px-3 py-2 font-medium">Phone</th>
                  <th className="text-left px-3 py-2 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {build.contacts.slice(0, 200).map((c, i) => (
                  <tr
                    key={`${c.countryCode}${c.phone}-${i}`}
                    className="border-t border-border"
                    data-testid={`row-contact-${i}`}
                  >
                    <td className="px-3 py-2">{c.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {c.countryCode}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{c.phone}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[200px]">
                      {c.email}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {build.contacts.length > 200 && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border bg-muted/40">
              Showing first 200 of {build.contacts.length} — all will be sent.
            </div>
          )}
        </div>
      )}

      {empty && (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-md">
          No contacts match this broadcast.
        </div>
      )}

      {/* Result strip */}
      {sendResult && "sentCount" in sendResult && (
        <div
          className={
            sendResult.failedCount === 0
              ? "p-3 rounded-md border border-green-600/30 bg-green-600/5 text-sm"
              : "p-3 rounded-md border border-amber-600/30 bg-amber-600/5 text-sm"
          }
          data-testid="send-result"
        >
          <div className="flex items-center gap-2">
            {sendResult.failedCount === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-600" />
            )}
            <span>
              Sent {sendResult.sentCount} of {sendResult.total} via WATI ·
              broadcast: <code className="text-xs">{sendResult.broadcastName}</code>
              {sendResult.failedCount > 0 && (
                <span className="text-amber-700 dark:text-amber-400 ml-2">
                  · {sendResult.failedCount} failed
                </span>
              )}
            </span>
          </div>
          {sendResult.failures && sendResult.failures.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Show failure details ({sendResult.failures.length})
              </summary>
              <div className="mt-2 max-h-40 overflow-y-auto text-xs space-y-1">
                {sendResult.failures.map((f, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="truncate">
                      {f.name} ({f.whatsappNumber})
                    </span>
                    <span className="text-muted-foreground truncate">
                      {f.error}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 flex-wrap">
        <Button
          variant="outline"
          onClick={() => downloadWatiCsv(build)}
          disabled={empty}
          data-testid={`button-download-csv-${build.type}`}
        >
          <Download className="h-4 w-4 mr-2" />
          Download CSV
        </Button>
        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={empty || !broadcastName.trim()}
          data-testid={`button-send-${build.type}`}
        >
          <Send className="h-4 w-4 mr-2" />
          Send via WATI
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="dialog-confirm">
          <DialogHeader>
            <DialogTitle>Send WATI broadcast?</DialogTitle>
            <DialogDescription>
              This will send the WhatsApp template to all listed recipients via
              the WATI API. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <Row label="Template" value={build.definition.templateName} mono />
            <Row label="Broadcast name" value={broadcastName} />
            <Row
              label="Recipient count"
              value={String(build.contacts.length)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={sending}
              data-testid="button-cancel-send"
            >
              Cancel
            </Button>
            <Button
              onClick={doSend}
              disabled={sending}
              data-testid="button-confirm-send"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Yes, send now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}

function dateSuffix(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
