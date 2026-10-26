import { useEffect } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../components/ui";
import "../../styles/admin-dashboard.css";
import { ActiveTickets } from "./dashboard/ActiveTickets";
import { BestAgent, OpenByCategory, ResolvedByAgent } from "./dashboard/AgentCards";
import { AiAssistant, LastSevenDays, NeedsAttention } from "./dashboard/BottomRow";
import { KpiRow } from "./dashboard/KpiRow";
import { StatusDonut } from "./dashboard/StatusDonut";

const TITLE = "Dashboard · BookLeaf Support";

/** Admin home: 7-day KPIs, the most urgent tickets, team and AI health. */
export function DashboardPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="ad-page">
      <PageHeader
        title="Dashboard"
        subtitle="Here is what is happening with author support"
        actions={
          <Link to="/admin/tickets" className="btn btn--primary">
            Open ticket queue
          </Link>
        }
      />
      <div className="ad-grid">
        <KpiRow />
        <ActiveTickets />
        <StatusDonut />
        <BestAgent />
        <ResolvedByAgent />
        <OpenByCategory />
        <NeedsAttention />
        <AiAssistant />
        <LastSevenDays />
      </div>
    </div>
  );
}
