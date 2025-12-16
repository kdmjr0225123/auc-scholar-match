import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { GraduationCap, Search, Award, ArrowRight, Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Landing() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-accent" />
            <span className="font-display text-2xl font-bold text-primary">Elevaid</span>
          </div>
          <nav className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-muted-foreground" />
              <Switch checked={isDark} onCheckedChange={setIsDark} />
              <Moon className="h-4 w-4 text-muted-foreground" />
            </div>
            <Link to="/auth">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button>Get Started</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Award className="h-4 w-4" />
              For AUC Students
            </div>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-primary mb-6 leading-tight">
              Find Scholarships That <span className="text-accent">Match You</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Elevaid matches students from Morehouse, Spelman, Clark Atlanta, and Morris Brown 
              with scholarships tailored to their unique profiles.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/auth?mode=signup">
                <Button size="lg" className="w-full sm:w-auto gap-2">
                  Find Your Scholarships
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-center text-primary mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<GraduationCap className="h-8 w-8" />}
              title="Create Your Profile"
              description="Enter your school, GPA, major, and graduation year to build your student profile."
              step={1}
            />
            <FeatureCard
              icon={<Search className="h-8 w-8" />}
              title="Get Matched"
              description="Our rule-based system finds scholarships that match your qualifications."
              step={2}
            />
            <FeatureCard
              icon={<Award className="h-8 w-8" />}
              title="Apply with Confidence"
              description="See why you qualify for each scholarship and apply directly to opportunities."
              step={3}
            />
          </div>
        </div>
      </section>

      {/* Schools Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-primary mb-4">
            Serving the Atlanta University Center
          </h2>
          <p className="text-muted-foreground mb-12 max-w-2xl mx-auto">
            Elevaid is built specifically for students at AUC institutions.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <SchoolBadge name="Morehouse College" />
            <SchoolBadge name="Spelman College" />
            <SchoolBadge name="Clark Atlanta University" />
            <SchoolBadge name="Morris Brown College" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border bg-card">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-2">
            <GraduationCap className="h-5 w-5 text-accent" />
            <span className="font-display text-lg font-semibold text-primary">Elevaid</span>
          </div>
          <p className="text-sm">© {new Date().getFullYear()} Elevaid. Built for AUC students.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description, 
  step 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
  step: number;
}) {
  return (
    <div className="relative p-6 rounded-lg border border-border bg-background hover:shadow-lg transition-shadow">
      <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-sm">
        {step}
      </div>
      <div className="text-accent mb-4">{icon}</div>
      <h3 className="font-display text-xl font-semibold text-primary mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function SchoolBadge({ name }: { name: string }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-background hover:border-accent transition-colors">
      <p className="font-medium text-primary">{name}</p>
    </div>
  );
}
