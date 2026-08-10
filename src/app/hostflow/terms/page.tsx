import Link from "next/link";
import { HostFlowLogo } from "@/components/HostFlowLogo";

export const metadata = {
  title: "Terms of Service — Host Flow",
  description: "The terms that govern use of Host Flow.",
};

const EFFECTIVE_DATE = "August 10, 2026";
const CONTACT_EMAIL = "support@hostflow.app";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hf-line py-6 first:border-t-0 first:pt-0">
      <h2 className="font-display text-lg text-hf-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-hf-inkMuted">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="hf-blueprint pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_70%_50%_at_50%_0%,black,transparent)]" />

      <div className="relative mx-auto max-w-2xl px-6 py-12">
        <header className="mb-10 flex items-center justify-between">
          <Link href="/hostflow" className="flex items-center">
            <HostFlowLogo tone="onDark" size={26} />
          </Link>
          <Link href="/hostflow" className="text-xs text-hf-inkFaint hover:text-hf-ink">
            ← Back to Host Flow
          </Link>
        </header>

        <h1 className="font-display text-3xl text-hf-ink">Terms of Service</h1>
        <p className="mt-2 text-sm text-hf-inkFaint">Effective {EFFECTIVE_DATE}</p>

        <p className="mt-6 text-sm leading-relaxed text-hf-inkMuted">
          These Terms govern use of Host Flow — the floor-management dashboard, booking widget, and related
          services (the &quot;Service&quot;). By creating an account or otherwise using the Service, you agree to these
          Terms on behalf of yourself and the restaurant or business you represent.
        </p>

        <div className="mt-4">
          <Section title="1. The Service">
            <p>
              Host Flow provides a live floor plan, reservation management, a waitlist, an AI host assistant, and
              an embeddable booking widget restaurants can add to their own websites. Features may be added,
              changed, or removed over time as the Service evolves.
            </p>
          </Section>

          <Section title="2. Accounts">
            <p>
              You&apos;re responsible for keeping your account credentials secure and for all activity under your
              account, including staff accounts you create. Provide accurate information when you sign up, and
              keep it up to date.
            </p>
          </Section>

          <Section title="3. Free trial and subscription">
            <p>
              New accounts get a 7-day free trial with full access to the Professional plan. After the trial,
              continued use requires an active paid subscription (currently $30/month), billed automatically until
              cancelled. You can cancel anytime from Settings → Billing — you&apos;ll keep access through the end of
              the billing period you&apos;ve already paid for, with no additional charge afterward.
            </p>
          </Section>

          <Section title="4. Payment">
            <p>
              Payments are processed by Stripe. Host Flow does not receive or store your card details — they&apos;re
              held by Stripe under its own terms and privacy policy. You authorize recurring charges for your
              subscription until you cancel.
            </p>
          </Section>

          <Section title="5. Your data and your guests&apos; data">
            <p>
              You (the restaurant) own the data you put into Host Flow — your floor plan, settings, and the
              reservations you and your guests create. You&apos;re responsible for having the right to collect and
              use guest information (names, emails, phone numbers, notes) that comes through your bookings, and
              for how you handle it outside the Service. See our{" "}
              <Link href="/hostflow/privacy" className="text-brand-300 hover:text-brand-200">
                Privacy Policy
              </Link>{" "}
              for how Host Flow itself handles this data.
            </p>
          </Section>

          <Section title="6. Acceptable use">
            <p>
              Don&apos;t use the Service to break the law, infringe anyone&apos;s rights, attempt to disrupt or gain
              unauthorized access to the Service or other accounts, or resell the Service without our agreement.
              We may suspend or terminate accounts that violate this.
            </p>
          </Section>

          <Section title="7. Third-party services">
            <p>
              Host Flow relies on third-party providers to operate — currently Stripe (payments), Resend
              (transactional email), and Anthropic (the AI host assistant and photo-based floor plan import).
              Content you submit to AI features (like a photo of your floor plan, or a question to the assistant)
              is sent to Anthropic to generate a response.
            </p>
          </Section>

          <Section title="8. Availability">
            <p>
              We aim to keep the Service reliable but don&apos;t guarantee uninterrupted or error-free operation. As
              an early-stage product, features and interfaces may change, and we&apos;ll do our best to give notice
              of anything that materially affects how you use the Service.
            </p>
          </Section>

          <Section title="9. Termination">
            <p>
              You can stop using the Service and cancel your subscription at any time. We may suspend or terminate
              accounts that violate these Terms, are unpaid past their billing period, or where required by law.
            </p>
          </Section>

          <Section title="10. Disclaimer and limitation of liability">
            <p>
              The Service is provided &quot;as is&quot; without warranties of any kind. To the extent permitted by law,
              Host Flow isn&apos;t liable for indirect, incidental, or consequential damages arising from your use of
              the Service, including loss of reservations, revenue, or data. Nothing here limits liability that
              can&apos;t be limited under applicable law.
            </p>
          </Section>

          <Section title="11. Changes to these Terms">
            <p>
              We may update these Terms from time to time. Material changes will be reflected by updating the
              effective date above; continued use of the Service after a change means you accept the updated
              Terms.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              Questions about these Terms? Reach us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-300 hover:text-brand-200">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
