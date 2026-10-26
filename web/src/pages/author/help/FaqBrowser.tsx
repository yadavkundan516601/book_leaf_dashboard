import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { SearchIcon } from "../../../components/icons";
import { Accordion, Card, CardHeader, TabPanel, Tabs, type AccordionItem, type TabItem } from "../../../components/ui";
import { FAQS, faqMatches, searchTerms, type FaqTopic } from "./faqs";

type TopicTab = "all" | Exclude<FaqTopic, "general">;

const TOPIC_TABS: readonly { id: TopicTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "royalties", label: "Royalties" },
  { id: "isbn", label: "ISBN & metadata" },
  { id: "printing", label: "Printing" },
  { id: "distribution", label: "Distribution" },
  { id: "production", label: "Production" },
];

const TABS_ID = "hb-faq-topics";

/** Searchable, topic-filtered list of FAQ answers. */
export function FaqBrowser() {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<TopicTab>("all");

  const matches = useMemo(() => {
    const terms = searchTerms(query);
    return FAQS.filter((faq) => faqMatches(faq, terms));
  }, [query]);

  const tabs: TabItem<TopicTab>[] = TOPIC_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    badge: t.id === "all" ? matches.length : matches.filter((f) => f.topic === t.id).length,
  }));

  const visible = topic === "all" ? matches : matches.filter((f) => f.topic === topic);
  const items: AccordionItem[] = visible.map((faq) => ({
    id: faq.id,
    title: faq.question,
    content: (
      <div className="hb-faq__answer">
        <p>{faq.answer}</p>
        {faq.link && (
          <Link className="hb-link" to={faq.link.to}>
            {faq.link.label} <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    ),
  }));

  const trimmed = query.trim();
  const topicLabel = TOPIC_TABS.find((t) => t.id === topic)?.label ?? "";
  const status = trimmed
    ? `${visible.length} ${visible.length === 1 ? "answer" : "answers"} found for "${trimmed}"`
    : `${visible.length} ${visible.length === 1 ? "answer" : "answers"}`;

  return (
    <Card as="section" aria-labelledby="hb-faq-title">
      <CardHeader titleId="hb-faq-title" title="Frequently asked questions" subtitle="Search, or pick a topic, then open a question to read the answer." />
      <div className="hb-toolbar">
        <div className="hb-search">
          <label htmlFor={searchId} className="ui-sr-only">
            Search the FAQ
          </label>
          <span className="hb-search__icon" aria-hidden="true">
            <SearchIcon size={16} />
          </span>
          <input
            id={searchId}
            type="search"
            placeholder="Search, e.g. payout, ISBN, reprint"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Tabs id={TABS_ID} label="FAQ topic" tabs={tabs} value={topic} onChange={setTopic} />
      </div>
      <p className="ui-sr-only" role="status">
        {status}
      </p>
      <TabPanel tabsId={TABS_ID} value={topic}>
        {items.length > 0 ? (
          <Accordion items={items} />
        ) : (
          <div className="hb-empty">
            <h3 className="hb-empty__title">
              {trimmed ? `No answers match "${trimmed}"` : `No answers under ${topicLabel}`}
            </h3>
            <p className="hb-empty__body">
              {trimmed && topic !== "all" && matches.length > 0
                ? `There are ${matches.length} matching ${matches.length === 1 ? "answer" : "answers"} in other topics.`
                : "Try different words, or ask our team and we'll answer your question directly."}
            </p>
            <div className="hb-empty__actions">
              {trimmed && topic !== "all" && matches.length > 0 && (
                <button type="button" className="btn btn--sm" onClick={() => setTopic("all")}>
                  Search all topics
                </button>
              )}
              {trimmed && (
                <button type="button" className="btn btn--sm" onClick={() => setQuery("")}>
                  Clear search
                </button>
              )}
              <Link className="btn btn--primary btn--sm" to="/author/tickets/new">
                Ask our team
              </Link>
            </div>
          </div>
        )}
      </TabPanel>
    </Card>
  );
}
