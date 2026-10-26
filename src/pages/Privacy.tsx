import { Link } from 'react-router-dom';
import LegalLayout from '@/components/LegalLayout';

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" effectiveDate="November 1, 2026">
      <p>
        Elevaid (“Elevaid,” “we,” “us”) runs elevaid.pro, which matches students at Atlanta
        University Center schools with scholarships they qualify for. This policy explains what we
        collect, why, who helps us run the service, and the choices you have. Questions go
        to <a href="mailto:support@elevaid.pro">support@elevaid.pro</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account.</strong> Your email address and password. Sign-in is handled by Supabase
          Auth, which stores your password in hashed form. We never see it.
        </li>
        <li>
          <strong>Profile.</strong> First and last name, school, major, GPA and graduation year, plus
          a copy of your email so we can send you matches. We use these to check you against each
          scholarship’s eligibility rules.
        </li>
        <li>
          <strong>Resume (optional).</strong> If you upload one, the file (PDF, DOC or DOCX, up to
          8&nbsp;MB) is kept in private storage tied to your account. You can replace or remove it
          on your Profile page at any time.
        </li>
        <li>
          <strong>Resume reviews (optional).</strong> If you use the resume reviewer, we save the text
          we read from your resume along with the scores and suggested edits, so you can come back
          to them.
        </li>
        <li>
          <strong>Application tracker.</strong> Which scholarships you’ve marked as saved, applied or
          completed.
        </li>
        <li>
          <strong>Email settings.</strong> Whether you’ve unsubscribed, and when we last sent you a
          match email.
        </li>
        <li>
          <strong>Usage and error data.</strong> Once enabled, we record page views and a few product
          events (such as signing up or signing in) with PostHog, and app crashes with Sentry. These
          are linked to a random account ID, not your name or email, and never include your GPA or
          resume. We don’t record your screen or keystrokes.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To match you with scholarships and show why you qualify.</li>
        <li>
          To email you: a match email when new scholarships fit your profile, deadline reminders
          (7 days and 2 days out) for scholarships you’re eligible for, and account emails such as
          password resets.
        </li>
        <li>To give you resume feedback when you ask for it.</li>
        <li>To keep the service working, fix bugs and decide what to build next.</li>
      </ul>

      <h2>The resume reviewer and AI</h2>
      <p>
        The reviewer only runs when you start it. Our server reads the text out of your PDF and
        sends that text (up to about 12,000 characters), together with your major, school,
        graduation year and GPA, to Groq, an AI provider, which returns feedback. The file itself
        isn’t sent. We don’t use your resume to train AI models.
      </p>

      <h2>Who we share it with</h2>
      <p>
        <strong>We never sell your data, and we don’t run ads.</strong> We share data only with
        the services that run Elevaid for us, and only for that purpose:
      </p>
      <ul>
        <li>Supabase: database, sign-in, file storage and server functions</li>
        <li>Vercel: website hosting</li>
        <li>Resend: email delivery</li>
        <li>Groq: resume reviews, only when you run one</li>
        <li>PostHog and Sentry: product analytics and error tracking, once enabled</li>
      </ul>
      <p>
        <strong>Schools.</strong> We don’t share information that identifies you with your school or
        any other school without your consent. We may share aggregate numbers, such as how many
        students at a school use Elevaid or the total dollars matched.
      </p>
      <p>
        We may also disclose information if the law requires it, or to protect the safety of our
        users or the service.
      </p>

      <h2>Emails and unsubscribing</h2>
      <p>
        Every match and reminder email has a one-click unsubscribe link. Account emails, like
        password resets, are sent only when needed and can’t be turned off.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account data until you ask us to delete it. Analytics and error reports are
        kept for a limited period under our providers’ standard retention settings.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Update your profile, or replace or remove your resume, on your Profile page.</li>
        <li>Unsubscribe from match and reminder emails from any of those emails.</li>
        <li>
          Ask for a copy of your data, or for your account and data to be deleted, by emailing{' '}
          <a href="mailto:support@elevaid.pro">support@elevaid.pro</a> from the address on your
          account. We’ll delete your account, profile, resume, reviews and tracker data within 30
          days.
        </li>
      </ul>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit. Database access rules limit each student to their own
        records, and resumes sit in private storage that is opened only through short-lived links.
        No system is perfectly secure, so please use a password you don’t use anywhere else.
      </p>

      <h2>Age</h2>
      <p>
        Elevaid is built for college students. You must be at least 13 to use it. If we learn that
        someone under 13 has created an account, we’ll delete it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy we’ll update the date above, and for significant changes we’ll let
        you know by email or in the app. See also our <Link to="/terms">Terms of Service</Link>.
      </p>

      <h2>Contact</h2>
      <p>
        Elevaid · <a href="mailto:support@elevaid.pro">support@elevaid.pro</a>
      </p>
    </LegalLayout>
  );
}
