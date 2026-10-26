import { Link } from "react-router";
import { useAdminDashboard, useAdminStats } from "../../../api/hooks";
import { BarChart, HelpTip, Pill, ProgressBar, SkeletonText, type Tone } from "../../../components/ui";
import { CardError, DashCard } from "./DashCard";
import { formatCost, formatInt, formatRate, weekdayLabels } from "./format";

interface AttentionItem {
  key: string;
  count: number;
  label: string;
  hint: string;
  to: string;
  tone: Tone;
}

/** Counts that need an admin now, each linking to the matching filtered queue. */
export function NeedsAttention() {
  const { data, isPending, isError, refetch } = useAdminDashboard();

  let body;
  if (isPending) {
    body = <SkeletonText lines={4} label="Loading tickets that need attention…" />;
  } else if (isError || !data) {
    body = <CardError what="tickets that need attention" onRetry={() => void refetch()} />;
  } else {
    const a = data.attention;
    const items: AttentionItem[] = [
      {
        key: "sla",
        count: a.slaBreached,
        label: "SLA breached",
        hint: "Urgent tickets past their first-response target",
        to: "/admin/tickets?status=open&status=in_progress&priority=critical&priority=high",
        tone: "danger",
      },
      {
        key: "unassigned",
        count: a.unassignedUrgent,
        label: "Urgent and unassigned",
        hint: "Critical or high priority with nobody on them",
        to: "/admin/tickets?assignee=unassigned&priority=critical&priority=high",
        tone: "warning",
      },
      {
        key: "awaiting",
        count: a.awaitingFirstReply,
        label: "Awaiting first reply",
        hint: "Unresolved tickets no admin has answered yet",
        to: "/admin/tickets?status=open",
        tone: "info",
      },
    ];
    const allClear = items.every((i) => i.count === 0);
    body = (
      <>
        {allClear && (
          <p className="ad-allclear" role="status">
            <span className="ad-allclear__mark" aria-hidden="true">
              ✓
            </span>
            Nothing needs attention right now
          </p>
        )}
        <ul className="ad-attention">
          {items.map((i) => (
            <li key={i.key}>
              <Link to={i.to} className={`ad-attention__item ad-attention__item--${i.count > 0 ? i.tone : "success"}`}>
                <span className="ad-attention__count">{formatInt(i.count)}</span>
                <span className="ad-attention__text">
                  <span className="ad-attention__label">{i.label}</span>
                  <span className="ad-attention__hint">{i.hint}</span>
                </span>
                <span className="ad-attention__go" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <DashCard
      title="Needs attention"
      subtitle={
        <>
          Open and in-progress tickets <HelpTip label="What is SLA?">SLA (service level agreement) is the time within which an admin should send the first reply. The target depends on the ticket priority.</HelpTip>
        </>
      }
      span="ad-span-4"
    >
      {body}
    </DashCard>
  );
}

interface RateProps {
  label: string;
  help: string;
  value: number | null;
  tone: Tone;
}

/** Labelled percentage bar with an explanation next to the label. */
function Rate({ label, help, value, tone }: RateProps) {
  return (
    <div className="ad-rate">
      <div className="ad-rate__head">
        <span aria-hidden="true">{label}</span>
        <HelpTip label={`About ${label.toLowerCase()}`}>{help}</HelpTip>
        <span className="ad-rate__value" aria-hidden="true">
          {formatRate(value)}
        </span>
      </div>
      <ProgressBar
        label={label}
        value={value === null ? 0 : value * 100}
        valueText={value === null ? "No data yet" : formatRate(value)}
        tone={tone}
        hideLabel
      />
    </div>
  );
}

/** Health, usage and quality of the AI classifier and reply drafts over the last 24 hours. */
export function AiAssistant() {
  const { data, isPending, isError, refetch } = useAdminStats();

  let body;
  let status = null;
  if (isPending) {
    body = <SkeletonText lines={6} label="Loading AI assistant figures…" />;
  } else if (isError || !data) {
    body = <CardError what="the AI assistant figures" onRetry={() => void refetch()} />;
  } else {
    const ai = data.ai;
    status = (
      <span className="ad-ai__status">
        <Pill tone={ai.available ? "success" : "warning"}>{ai.available ? "Available" : "Degraded"}</Pill>
        <HelpTip label="What do Available and Degraded mean?">
          Available: the AI classifies new tickets and drafts replies. Degraded: the AI cannot be reached, so keyword
          rules classify tickets and reply templates are used instead. Nothing stops working.
        </HelpTip>
      </span>
    );
    body = (
      <>
        <dl className="ad-ai__facts">
          <div className="ad-ai__fact ad-ai__fact--wide">
            <dt>Model</dt>
            <dd className="ad-ai__model">{ai.model ?? "Rules and templates only"}</dd>
          </div>
          <div className="ad-ai__fact">
            <dt>Calls · 24h</dt>
            <dd>{formatInt(ai.calls24h)}</dd>
          </div>
          <div className="ad-ai__fact">
            <dt>Failures · 24h</dt>
            <dd className={ai.failures24h > 0 ? "ad-text-danger" : undefined}>{formatInt(ai.failures24h)}</dd>
          </div>
          <div className="ad-ai__fact">
            <dt>Tokens · 24h</dt>
            <dd>{formatInt(ai.inputTokens24h + ai.outputTokens24h)}</dd>
          </div>
          <div className="ad-ai__fact">
            <dt>Est. cost · 24h</dt>
            <dd>{formatCost(ai.estimatedCostUsd24h)}</dd>
          </div>
        </dl>
        <div className="ad-ai__rates">
          <Rate
            label="Category agreement"
            help="How often admins kept the AI's category instead of changing it."
            value={ai.categoryAgreement}
            tone="success"
          />
          <Rate
            label="Priority agreement"
            help="How often admins kept the AI's priority instead of changing it."
            value={ai.priorityAgreement}
            tone="success"
          />
          <Rate
            label="Draft usage"
            help="Share of admin replies that started from an AI-suggested draft."
            value={ai.draftUsageRate}
            tone="info"
          />
        </div>
      </>
    );
  }

  return (
    <DashCard title="AI assistant" subtitle="Classification and reply drafts" span="ad-span-4" actions={status}>
      {body}
    </DashCard>
  );
}

/** Tickets created on each of the last 7 UTC days, today last. */
export function LastSevenDays() {
  const { data, isPending, isError, refetch } = useAdminDashboard();

  let body;
  if (isPending) {
    body = <SkeletonText lines={5} label="Loading tickets created per day…" />;
  } else if (isError || !data) {
    body = <CardError what="tickets created per day" onRetry={() => void refetch()} />;
  } else {
    const daily = data.created.daily;
    const labels = weekdayLabels(data.generatedAt, daily.length);
    body = (
      <BarChart
        orientation="vertical"
        height={180}
        label="Tickets created per day, last 7 days"
        valueFormatter={formatInt}
        items={daily.map((value, i) => ({
          label: labels[i] ?? "",
          value,
          color: i === daily.length - 1 ? "var(--primary)" : "var(--blue)",
        }))}
      />
    );
  }

  return (
    <DashCard
      title="Last 7 days"
      subtitle={data ? `${formatInt(data.created.total)} new tickets by UTC day; today is highlighted` : "New tickets by UTC day"}
      span="ad-span-4"
    >
      {body}
    </DashCard>
  );
}
