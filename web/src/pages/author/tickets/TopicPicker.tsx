import { useId, type Ref } from "react";
import { TOPICS, type TopicId } from "./topics";

/**
 * Topic quick-pick tiles. Native radio inputs inside a `role=radiogroup`, so arrow keys move the choice, Tab
 * leaves the group and screen readers announce "n of 6"; the tiles are their labels.
 */
export function TopicPicker({
  value,
  onChange,
  labelledBy,
  describedBy,
  ref,
}: {
  value: TopicId | null;
  onChange: (topic: TopicId) => void;
  labelledBy: string;
  describedBy?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  const name = useId();
  return (
    <div className="nq-topics" role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} ref={ref}>
      {TOPICS.map((t) => {
        const checked = value === t.id;
        return (
          <label key={t.id} className={checked ? "nq-topic nq-topic--checked" : "nq-topic"}>
            <input
              type="radio"
              name={name}
              value={t.id}
              checked={checked}
              onChange={() => onChange(t.id)}
              className="nq-topic__radio"
            />
            <span className="nq-topic__text">
              <span className="nq-topic__label">{t.label}</span>
              <span className="nq-topic__blurb">{t.blurb}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
