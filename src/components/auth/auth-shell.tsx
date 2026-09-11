import Link from "next/link";
import { ArrowUpRight, Check, Flower2, ListChecks, ShieldCheck, Sparkles } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-main">
        <Link href="/login" className="brand auth-brand" aria-label="ShiftTrack home"><span className="brand-mark"><ListChecks size={23} /></span>ShiftTrack<span className="brand-period">.</span></Link>
        <div className="auth-form-area">{children}</div>
        <p className="auth-footer"><ShieldCheck size={14} />A secure space for a smoother shift.</p>
      </section>
      <aside className="auth-story" aria-label="About ShiftTrack">
        <div className="auth-story-tag"><span />A LITTLE CLARITY GOES A LONG WAY</div>
        <div className="auth-story-content">
          <Flower2 className="auth-flower" size={56} strokeWidth={1.1} />
          <h2>Good shifts.<br />Start together.</h2>
          <p>Give every task a home, every teammate a clear next step, and your day a little more peace of mind.</p>
          <div className="auth-preview" aria-hidden="true">
            <div className="auth-preview-heading"><span>Your team, in sync</span><Sparkles size={19} /></div>
            <div className="auth-preview-task"><span className="auth-preview-check"><Check size={13} /></span><div><strong>Morning safety walkthrough</strong><span>Checked off. Ready for the day.</span></div><span className="auth-preview-avatar">SW</span></div>
            <div className="auth-preview-task"><span className="auth-preview-check"><Check size={13} /></span><div><strong>Prepare the shift handoff</strong><span>A clear plan for the next team.</span></div><span className="auth-preview-avatar">MJ</span></div>
            <div className="auth-preview-bottom"><span>Little wins. Better days.</span><ArrowUpRight size={16} /></div>
          </div>
        </div>
        <div className="auth-story-footer"><span>Made for the people who keep things moving.</span><Flower2 size={20} strokeWidth={1.3} /></div>
      </aside>
    </main>
  );
}
