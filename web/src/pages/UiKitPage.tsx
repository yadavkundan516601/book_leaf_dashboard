import { useState, type ReactNode } from "react";
import { useToast } from "../components/Toast";
import {
  Accordion,
  Avatar,
  AvatarGroup,
  BarChart,
  Card,
  CardHeader,
  ConfirmProvider,
  DonutChart,
  HelpTip,
  KpiCard,
  Modal,
  PageHeader,
  Pill,
  ProgressBar,
  Skeleton,
  SkeletonCard,
  SkeletonRows,
  SkeletonText,
  Sparkline,
  TabPanel,
  Tabs,
  useConfirm,
} from "../components/ui";

/** Dev-only gallery of shared UI components (route /ui-kit, not registered in production builds). */
export function UiKitPage() {
  return (
    <ConfirmProvider>
      <main className="ui-kit">
        <PageHeader
          title="UI kit"
          subtitle="Every shared component in realistic states: empty, zero, long labels, many items, loading."
          breadcrumbs={[
            { label: "Home", to: "/" },
            { label: "Developer tools", to: "/" },
            { label: "Design system", to: "/" },
            { label: "UI kit gallery with a deliberately long breadcrumb label" },
          ]}
          actions={
            <>
              <button type="button" className="ui-btn ui-btn--secondary">
                Secondary
              </button>
              <button type="button" className="ui-btn ui-btn--primary">
                Primary action
              </button>
            </>
          }
        />
        <CardsSection />
        <KpiSection />
        <SparklineSection />
        <DonutSection />
        <BarSection />
        <AvatarSection />
        <SkeletonSection />
        <DialogSection />
        <HelpTipSection />
        <TabsSection />
        <ToastSection />
      </main>
    </ConfirmProvider>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="ui-kit__section" aria-labelledby={id}>
      <h2 className="ui-kit__heading" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function CardsSection() {
  return (
    <Section id="kit-cards" title="Card, CardHeader and Pill">
      <div className="ui-kit__grid">
        <Card>
          <CardHeader
            title="Active tickets"
            subtitle="Updated a moment ago"
            actions={
              <button type="button" className="ui-btn ui-btn--secondary">
                View all
              </button>
            }
          />
          <p className="ui-kit__muted">Card body content goes here.</p>
        </Card>
        <Card>
          <CardHeader title="A card header with a really long title that has to wrap onto a second line on small screens" subtitle="And a subtitle that explains what the card is for, also on the long side" />
          <div className="ui-kit__row">
            <Pill>Neutral</Pill>
            <Pill tone="primary">Primary</Pill>
            <Pill tone="success">Resolved</Pill>
            <Pill tone="warning">Pending</Pill>
            <Pill tone="danger">SLA breached</Pill>
            <Pill tone="info" title="Classified by AI">
              AI
            </Pill>
          </div>
        </Card>
      </div>
    </Section>
  );
}

function KpiSection() {
  return (
    <Section id="kit-kpi" title="KpiCard">
      <div className="ui-kit__grid ui-kit__grid--kpi">
        <KpiCard
          label="Tickets created"
          value={128}
          delta={{ value: 12.4 }}
          series={[12, 18, 15, 22, 19, 21, 21]}
          icon="✉"
          footnote="vs previous 7 days"
        />
        <KpiCard
          label="Avg first response"
          value="3.4 h"
          delta={{ value: -18, goodWhen: "down" }}
          series={[6, 5.5, 5, 4.2, 4, 3.6, 3.4]}
          tone="success"
          icon="⏱"
          help="Average time between a ticket being created and the first reply from the support team."
          footnote="Lower is better"
        />
        <KpiCard
          label="SLA breached"
          value={7}
          delta={{ value: 40, goodWhen: "down" }}
          series={[1, 0, 2, 1, 1, 0, 2]}
          tone="danger"
          icon="⚠"
          help="SLA (service-level agreement): tickets that waited longer than the promised response time."
        />
        <KpiCard label="Replies sent" value={0} delta={{ value: 0 }} series={[0, 0, 0, 0, 0, 0, 0]} tone="info" icon="↩" />
        <KpiCard label="Resolution time" value={null} series={[]} tone="warning" icon="✓" footnote="No resolved tickets yet" />
        <KpiCard
          label="Royalty payouts processed this quarter across every territory"
          value={1234567.89}
          delta={{ value: -3.25 }}
          series={[5]}
        />
      </div>
    </Section>
  );
}

function SparklineSection() {
  const cases: { label: string; values: number[]; filled?: boolean }[] = [
    { label: "Trend", values: [3, 5, 4, 8, 6, 9, 12] },
    { label: "Filled", values: [9, 7, 8, 4, 5, 3, 2], filled: true },
    { label: "Constant", values: [4, 4, 4, 4] },
    { label: "Single point", values: [7] },
    { label: "Empty", values: [] },
  ];
  return (
    <Section id="kit-spark" title="Sparkline">
      <Card>
        <div className="ui-kit__row ui-kit__row--spaced">
          {cases.map((c) => (
            <figure className="ui-kit__figure" key={c.label}>
              <Sparkline values={c.values} filled={c.filled} label={`${c.label} sparkline`} />
              <figcaption>{c.label}</figcaption>
            </figure>
          ))}
        </div>
      </Card>
    </Section>
  );
}

function DonutSection() {
  return (
    <Section id="kit-donut" title="DonutChart">
      <div className="ui-kit__grid">
        <Card>
          <CardHeader title="Tickets by status" />
          <DonutChart
            label="Tickets by status"
            segments={[
              { label: "Open", value: 42 },
              { label: "In progress", value: 23 },
              { label: "Waiting on author", value: 11 },
              { label: "Resolved", value: 87 },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Many segments, long labels" />
          <DonutChart
            label="Unresolved by category"
            centerLabel="Unresolved"
            segments={[
              { label: "Royalty and payment questions about the quarterly payout", value: 18 },
              { label: "ISBN and metadata", value: 9 },
              { label: "Printing and distribution", value: 7 },
              { label: "Cover design", value: 4 },
              { label: "Account access", value: 2 },
              { label: "Marketing", value: 1 },
              { label: "Other", value: 0 },
              { label: "Tiny share", value: 0.2 },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Empty (total is 0)" />
          <DonutChart
            label="Tickets by status"
            segments={[
              { label: "Open", value: 0 },
              { label: "Resolved", value: 0 },
            ]}
            emptyMessage="No tickets in this period. New tickets will appear here."
          />
        </Card>
      </div>
    </Section>
  );
}

function BarSection() {
  const agents = [
    { label: "Priya Sharma", value: 48 },
    { label: "Rahul Verma", value: 36 },
    { label: "Ananya Krishnamurthy-Venkataraman", value: 29 },
    { label: "Mohit", value: 12 },
    { label: "Zoya", value: 3 },
  ];
  const week = [
    { label: "Mon", value: 12 },
    { label: "Tue", value: 18 },
    { label: "Wed", value: 9 },
    { label: "Thu", value: 22 },
    { label: "Fri", value: 15 },
    { label: "Sat", value: 4 },
    { label: "Sun", value: 0 },
  ];
  return (
    <Section id="kit-bars" title="BarChart">
      <div className="ui-kit__grid">
        <Card>
          <CardHeader title="Resolved by agent (horizontal)" />
          <BarChart label="Resolved tickets by agent, last 7 days" items={agents} />
        </Card>
        <Card>
          <CardHeader title="Tickets per day (vertical)" />
          <BarChart label="Tickets created per day" orientation="vertical" items={week.map((d, i) => ({ ...d, color: i === 3 ? "var(--blue, #3762ea)" : undefined }))} />
        </Card>
        <Card>
          <CardHeader title="Hours with formatter and fixed max" />
          <BarChart
            label="Average first response by category"
            max={24}
            valueFormatter={(v) => `${v.toFixed(1)} h`}
            items={[
              { label: "Royalty", value: 3.4, color: "var(--success, #04a08b)" },
              { label: "Printing", value: 11.2, color: "var(--warning, #f6b749)" },
              { label: "Account", value: 26, color: "var(--danger, #ff6c6c)" },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Empty and all-zero" />
          <BarChart label="Replies by agent" items={[]} emptyMessage="No replies yet this week." />
          <div className="ui-kit__spacer" />
          <BarChart label="Escalations" items={[{ label: "Critical", value: 0 }, { label: "High", value: 0 }]} />
        </Card>
      </div>
    </Section>
  );
}

function AvatarSection() {
  const team = ["Priya Sharma", "Rahul Verma", "Ananya Iyer", "Mohit Jain", "Zoya Khan", "Arjun Rao", "Neha Gupta"].map((name) => ({ name }));
  return (
    <Section id="kit-avatar" title="Avatar and AvatarGroup">
      <Card>
        <div className="ui-kit__row ui-kit__row--spaced">
          <Avatar name="Priya Sharma" size="sm" />
          <Avatar name="Rahul Verma" size="md" />
          <Avatar name="Ananya Iyer" size="lg" />
          <Avatar name="madonna" />
          <Avatar name="" />
          <Avatar name="Broken Image" src="/does-not-exist.png" />
          <AvatarGroup people={team} />
          <AvatarGroup people={team.slice(0, 3)} size="sm" />
        </div>
      </Card>
    </Section>
  );
}

function SkeletonSection() {
  const [loading, setLoading] = useState(true);
  return (
    <Section id="kit-skeleton" title="Skeleton">
      <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setLoading((v) => !v)}>
        {loading ? "Show loaded content" : "Show loading state"}
      </button>
      <div className="ui-kit__grid ui-kit__grid--kpi ui-kit__spaced-top">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <Card>
              <SkeletonText lines={4} />
            </Card>
          </>
        ) : (
          <>
            <KpiCard label="Open tickets" value={42} delta={{ value: 5 }} series={[3, 4, 6, 5, 7]} />
            <KpiCard label="Resolved" value={87} delta={{ value: 9 }} series={[5, 6, 8, 7, 9]} tone="success" />
            <Card>
              <p className="ui-kit__muted">Loaded paragraph content replaces the text skeleton.</p>
            </Card>
          </>
        )}
      </div>
      <Card className="ui-kit__spaced-top">
        <CardHeader title="Ticket list" />
        {loading ? <SkeletonRows rows={4} /> : <p className="ui-kit__muted">Rows would render here.</p>}
      </Card>
      <div className="ui-kit__row ui-kit__spaced-top">
        <Skeleton width={120} height={20} />
        <Skeleton width={40} height={40} radius="50%" />
        <Skeleton width="30%" height={8} radius={999} />
      </div>
    </Section>
  );
}

function DialogSection() {
  const confirm = useConfirm();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [result, setResult] = useState("Nothing confirmed yet.");

  const ask = async (tone: "default" | "danger") => {
    const ok = await confirm(
      tone === "danger"
        ? {
            title: "Close ticket BL-1042?",
            message: "The author will be notified and can no longer reply. This cannot be undone.",
            confirmLabel: "Close ticket",
            cancelLabel: "Keep open",
            tone: "danger",
          }
        : {
            title: "Send reply without editing?",
            message: "The AI draft was not changed. Send it to the author as written?",
            confirmLabel: "Send reply",
          },
    );
    setResult(ok ? `Confirmed (${tone}).` : `Cancelled (${tone}).`);
  };

  return (
    <Section id="kit-dialog" title="ConfirmDialog and Modal">
      <Card>
        <div className="ui-kit__row">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => void ask("default")}>
            Confirm (default)
          </button>
          <button type="button" className="ui-btn ui-btn--danger" onClick={() => void ask("danger")}>
            Confirm (danger)
          </button>
          <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setModalOpen(true)}>
            Open generic modal
          </button>
        </div>
        <p className="ui-kit__muted" role="status">
          {result}
        </p>
      </Card>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Assign ticket"
        description="Choose who should handle this ticket. They will be notified."
        footer={
          <>
            <button type="button" className="ui-btn ui-btn--secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              onClick={() => {
                setModalOpen(false);
                toast.success("Ticket assigned to Priya Sharma.");
              }}
            >
              Assign
            </button>
          </>
        }
      >
        <label className="ui-kit__field">
          Agent
          <select data-autofocus defaultValue="priya">
            <option value="priya">Priya Sharma</option>
            <option value="rahul">Rahul Verma</option>
          </select>
        </label>
        <p className="ui-kit__muted">
          Tickets older than the SLA <HelpTip label="What is SLA?">Service-level agreement: the promised maximum time before the first reply.</HelpTip> are
          flagged.
        </p>
      </Modal>
    </Section>
  );
}

function HelpTipSection() {
  return (
    <Section id="kit-helptip" title="HelpTip">
      <Card>
        <p>
          Confidence <HelpTip label="What is AI confidence?">How sure the AI classifier is about the category it picked. Below 60% a human should check it.</HelpTip>{" "}
          and Rules vs AI{" "}
          <HelpTip label="Rules vs AI">
            “Rules” means a keyword rule set the category; “AI” means the language model classified the ticket.
          </HelpTip>
          .
        </p>
        <div className="ui-kit__edges">
          <span>
            Left edge <HelpTip label="Left edge tip">This tooltip is clamped so it never leaves the screen on the left.</HelpTip>
          </span>
          <span>
            Right edge <HelpTip label="Right edge tip">This tooltip is clamped so it never leaves the screen on the right, even with a long explanation like this one.</HelpTip>
          </span>
        </div>
      </Card>
    </Section>
  );
}

function TabsSection() {
  const [status, setStatus] = useState<"open" | "pending" | "resolved" | "archived">("open");
  const [view, setView] = useState("overview");
  return (
    <Section id="kit-tabs" title="Tabs, Accordion and ProgressBar">
      <div className="ui-kit__grid">
        <Card>
          <CardHeader title="Segmented" as="h3" />
          <Tabs
            id="kit-status-tabs"
            label="Ticket status"
            value={status}
            onChange={setStatus}
            tabs={[
              { id: "open", label: "Open", badge: 42 },
              { id: "pending", label: "Pending", badge: 0 },
              { id: "resolved", label: "Resolved", badge: 1287 },
              { id: "archived", label: "Archived", disabled: true },
            ]}
          />
          <TabPanel tabsId="kit-status-tabs" value={status}>
            <p className="ui-kit__muted">Showing {status} tickets.</p>
          </TabPanel>
          <div className="ui-kit__spacer" />
          <CardHeader title="Underline" as="h3" />
          <Tabs
            variant="underline"
            label="Ticket sections"
            value={view}
            onChange={setView}
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "conversation", label: "Conversation" },
              { id: "notes", label: "Internal notes" },
              { id: "activity", label: "Activity log" },
              { id: "attachments", label: "Attachments" },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Progress" as="h3" />
          <div className="ui-kit__stack">
            <ProgressBar label="Royalty threshold" value={3200} max={5000} valueText="₹3,200 of ₹5,000" />
            <ProgressBar label="SLA used" value={92} tone="danger" />
            <ProgressBar label="Profile complete" value={100} tone="success" />
            <ProgressBar label="Nothing yet" value={0} tone="warning" />
            <ProgressBar label="Over max clamps to 100%" value={140} tone="info" />
          </div>
        </Card>
      </div>
      <div className="ui-kit__spaced-top">
        <Accordion
          defaultOpen={["payout"]}
          items={[
            {
              id: "payout",
              title: "When is the quarterly payout made?",
              content: "Royalties are paid within 30 days of the end of each quarter once you pass the threshold.",
            },
            {
              id: "threshold",
              title: "What is the royalty threshold, and what happens if I do not reach it in a quarter?",
              content: "Earnings below the threshold roll over to the next quarter. Nothing is lost.",
            },
            { id: "isbn", title: "How do I change my ISBN details?", content: "Open a ticket under “ISBN and metadata”." },
          ]}
        />
        <div className="ui-kit__spacer" />
        <Accordion
          allowMultiple
          items={[
            { id: "a", title: "Allow multiple: first", content: "Both sections can be open at once." },
            { id: "b", title: "Allow multiple: second", content: "Toggle me independently." },
          ]}
        />
      </div>
    </Section>
  );
}

function ToastSection() {
  const toast = useToast();
  const [priority, setPriority] = useState("High");
  return (
    <Section id="kit-toast" title="Toast">
      <Card>
        <p className="ui-kit__muted">Current priority: {priority}</p>
        <div className="ui-kit__row">
          <button type="button" className="ui-btn ui-btn--secondary" onClick={() => toast.success("Reply sent to the author.")}>
            Success
          </button>
          <button type="button" className="ui-btn ui-btn--secondary" onClick={() => toast.error("Could not save. Check your connection and try again.")}>
            Error
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            onClick={() => {
              const previous = priority;
              setPriority("Critical");
              toast.success("Priority changed to Critical.", {
                action: { label: "Undo", onClick: () => setPriority(previous) },
              });
            }}
          >
            Change priority (with Undo)
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            onClick={() => {
              for (let i = 1; i <= 6; i++) toast.success(`Bulk update ${i} of 6 finished.`, { duration: 6000 });
            }}
          >
            Six at once (max 4 shown)
          </button>
        </div>
      </Card>
    </Section>
  );
}
