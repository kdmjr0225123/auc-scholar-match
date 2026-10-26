import { Link } from 'react-router-dom';
import LegalLayout from '@/components/LegalLayout';

export default function Terms() {
  return (
    <LegalLayout title="Terms of Service" effectiveDate="November 1, 2026">
      <p>
        These terms cover your use of elevaid.pro, run by Elevaid (“Elevaid,” “we,” “us”). By
        creating an account or using the site, you agree to them. Our{' '}
        <Link to="/privacy">Privacy Policy</Link> explains how we handle your data.
      </p>

      <h2>What Elevaid is</h2>
      <p>
        Elevaid matches college students with scholarships based on the profile they give us, and
        offers tools like an application tracker and a resume reviewer. It’s free for students.
      </p>

      <h2>No guarantee of awards</h2>
      <p>
        A match means your profile appears to meet a scholarship’s published requirements. It
        isn’t an application, and it doesn’t guarantee you’ll be eligible, selected or paid.
        Sponsors make every award decision. Resume feedback is generated with AI and is a
        suggestion, not professional advice.
      </p>

      <h2>Scholarship information</h2>
      <p>
        Scholarships are offered by third-party sponsors, not by Elevaid. We work to keep listings
        accurate, but amounts, deadlines and requirements can change or contain errors.{' '}
        <strong>Always confirm details on the sponsor’s own site before you apply.</strong> We
        aren’t responsible for third-party sites or their programs.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 13. Elevaid is built for current college students.</li>
        <li>Give accurate profile information; your matches depend on it.</li>
        <li>Keep your password private. You’re responsible for activity on your account.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Don’t:</p>
      <ul>
        <li>use someone else’s account or impersonate anyone;</li>
        <li>upload content you don’t have the right to share, or anything unlawful or harmful;</li>
        <li>scrape, copy or resell scholarship listings or other site content in bulk;</li>
        <li>try to break, overload or get around the security of the service.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own what you upload, including your resume. You let us store and process it only to run
        the service for you, as described in the Privacy Policy.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can stop using Elevaid at any time and ask us to delete your account by emailing{' '}
        <a href="mailto:support@elevaid.pro">support@elevaid.pro</a>. We may suspend or close
        accounts that break these terms or put other users or the service at risk.
      </p>

      <h2>Disclaimers and limitation of liability</h2>
      <p>
        Elevaid is provided “as is” and “as available,” without warranties of any kind. To the
        fullest extent the law allows, Elevaid won’t be liable for indirect, incidental or
        consequential damages, or for lost awards or opportunities, arising from your use of the
        service. Our total liability for any claim is limited to $100.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the State of Georgia, without regard to its
        conflict-of-law rules. Any dispute will be handled in the state or federal courts located
        in Georgia.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. We’ll change the date above, and for significant changes we’ll
        let you know by email or in the app. Continuing to use Elevaid after changes take effect
        means you accept them.
      </p>

      <h2>Contact</h2>
      <p>
        Elevaid · <a href="mailto:support@elevaid.pro">support@elevaid.pro</a>
      </p>
    </LegalLayout>
  );
}
