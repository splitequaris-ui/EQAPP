/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { Groups } from "./pages/Groups";
import { GroupDetail } from "./pages/GroupDetail";
import { Settlements } from "./pages/Settlements";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { LandingPage } from "./pages/LandingPage";
import { Onboarding } from "./components/Onboarding";
import { AssistantChat } from "./components/AssistantChat";
import { LoginPage } from "./pages/LoginPage";
import { NetworkHub } from "./pages/NetworkHub";
import { Profile } from "./pages/Profile";
import { Subscriptions } from "./pages/Subscriptions";
import { AddSubscription } from "./pages/AddSubscription";
import { SubscriptionDetail } from "./pages/SubscriptionDetail";
import { MoneyManagement } from "./pages/MoneyManagement";
import { AboutUsPage } from "./pages/AboutUsPage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { SourcesPage } from "./pages/SourcesPage";
import { AboutPage } from "./pages/AboutPage";
import { BlogPage } from "./pages/BlogPage";
import { CareersPage } from "./pages/CareersPage";
import { HelpPage } from "./pages/HelpPage";
import { ContactPage } from "./pages/ContactPage";
import { StatusPage } from "./pages/StatusPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { ReportersPage } from "./pages/ReportersPage";
import { Loader2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const MainRouter: React.FC = () => {
  const { currentRoute, isLoadingAuth, user, profile } = useApp();

  if (isLoadingAuth) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const wrapPage = (component: React.ReactNode) => (
    <div key={currentRoute.path} className="animate-page-enter w-full h-full">
      {component}
    </div>
  );

  if (currentRoute.path === "/about-us") return wrapPage(<AboutUsPage />);
  if (currentRoute.path === "/features") return wrapPage(<FeaturesPage />);
  if (currentRoute.path === "/sources") return wrapPage(<SourcesPage />);
  if (currentRoute.path === "/about") return wrapPage(<AboutPage />);
  if (currentRoute.path === "/blog") return wrapPage(<BlogPage />);
  if (currentRoute.path === "/careers") return wrapPage(<CareersPage />);
  if (currentRoute.path === "/help") return wrapPage(<HelpPage />);
  if (currentRoute.path === "/contact") return wrapPage(<ContactPage />);
  if (currentRoute.path === "/status") return wrapPage(<StatusPage />);
  if (currentRoute.path === "/privacy") return wrapPage(<PrivacyPage />);
  if (currentRoute.path === "/terms") return wrapPage(<TermsPage />);
  if (currentRoute.path === "/reporters") return wrapPage(<ReportersPage />);

  // Prevent accessing protected views if not logged in
  if (!user) {
    if (currentRoute.path === "/login" || currentRoute.path === "/signup") {
      return wrapPage(<LoginPage mode={currentRoute.path === "/login" ? "signin" : "signup"} />);
    }
    return wrapPage(<LandingPage />);
  }

  // Redirect to Onboarding if profile is not completed or missing
  if (!profile || !profile.isOnboarded) {
    return wrapPage(<Onboarding />);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground md:flex-row">
      <Navbar />

      <main className="min-h-screen flex-1 px-4 py-6 pb-16 md:h-screen md:overflow-y-auto md:px-8 md:pb-8">
        <div key={currentRoute.path} className="animate-page-enter h-full w-full">
          {(currentRoute.path === "/" || currentRoute.path === "/dashboard" || currentRoute.path === "/login" || currentRoute.path === "/signup") && <Dashboard />}
          {currentRoute.path === "/groups" && <Groups />}
          {currentRoute.path === "/groups/[id]" && <GroupDetail />}
          {currentRoute.path === "/subscriptions" && <Subscriptions />}
          {currentRoute.path === "/subscriptions/new" && <AddSubscription />}
          {currentRoute.path === "/subscriptions/[id]" && <SubscriptionDetail />}
          {currentRoute.path === "/money" && <MoneyManagement />}
          {currentRoute.path === "/settlements" && <Settlements />}
          {currentRoute.path === "/network" && <NetworkHub />}
          {currentRoute.path === "/reports" && <Reports />}
          {currentRoute.path === "/profile" && <Profile />}
          {currentRoute.path === "/settings" && <Settings />}
        </div>
      </main>

      {/* Wallet assistant — available on every authenticated page */}
      <AssistantChat />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <TooltipProvider>
        <MainRouter />
        <Toaster position="top-right" />
      </TooltipProvider>
    </AppProvider>
  );
}
